import { test, expect, type APIRequestContext } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { anonymous, createUser, loginAs, signupOrg, STRONG, uid } from './helpers'
import { gatewayClient } from './gw'
import { testDb } from './db'
import { UPLOADS_TEST_DIR } from './media-env'

// P7 · foto do perfil e logotipo da empresa: tipo conferido pelo conteúdo (não pela extensão), redimensionado e
// regravado em WEBP, guardado fora do deploy (UPLOADS_DIR) e servido só para a própria empresa, com cabeçalhos seguros.

const png = (w = 600, h = 400) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 15, g: 107, b: 67 } } }).png().toBuffer()
const file = (buffer: Buffer, name = 'foto.png', mimeType = 'image/png') => ({ multipart: { file: { name, mimeType, buffer } } })

async function company() {
  const { email, password } = await signupOrg()
  const api = await loginAs(email, password)
  const me = await (await api.get('/api/me')).json()
  return { api, email, password, orgName: me.organizationName as string, orgId: me.organizationId as string, memberId: me.member.id as string }
}

const dispose = async (...ctx: APIRequestContext[]) => { for (const c of ctx) await c.dispose() }

test.describe('P7 · foto do perfil', () => {
  test('PNG válido: vira WEBP 256x256, aparece em /api/me e é servido com tipo certo e nosniff', async () => {
    const a = await company()
    const r = await a.api.post('/api/profile/avatar', file(await png()))
    expect(r.status()).toBe(200)
    const { avatarUrl } = await r.json()
    expect(avatarUrl).toMatch(new RegExp(`^/api/media/avatar/${a.memberId}\\?v=\\d+$`))
    expect((await (await a.api.get('/api/me')).json()).member.avatarUrl).toBe(avatarUrl)
    expect((await (await a.api.get('/api/profile')).json()).profile.avatarUrl).toBe(avatarUrl)

    const img = await a.api.get(avatarUrl)
    expect(img.status()).toBe(200)
    expect(img.headers()['content-type']).toBe('image/webp')
    expect(img.headers()['x-content-type-options']).toBe('nosniff')
    expect(img.headers()['cache-control']).toContain('private')
    const meta = await sharp(await img.body()).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 256, 256])

    // no disco: fora do projeto (UPLOADS_DIR), pasta da empresa
    const onDisk = join(UPLOADS_TEST_DIR, a.orgId, `avatar-${a.memberId}`)
    expect(readFileSync(onDisk).subarray(8, 12).toString('ascii')).toBe('WEBP')

    // remover: some do disco e do perfil
    expect((await a.api.delete('/api/profile/avatar')).status()).toBe(200)
    expect(existsSync(onDisk)).toBe(false)
    expect((await a.api.get(avatarUrl)).status()).toBe(404)
    const actions = ((await (await a.api.get('/api/audit?limit=50')).json()).entries as Array<{ action: string }>).map((e) => e.action)
    expect(actions).toEqual(expect.arrayContaining(['account.avatar_changed', 'account.avatar_removed']))
    await dispose(a.api)
  })

  test('arquivo que não é imagem, mesmo chamado .png e declarado image/png, é recusado; imagem falsa também', async () => {
    const a = await company()
    const texto = await a.api.post('/api/profile/avatar', file(Buffer.from('<script>alert(1)</script> não sou imagem'), 'foto.png', 'image/png'))
    expect(texto.status()).toBe(400)
    expect((await texto.json()).error).toMatch(/PNG, JPG ou WEBP/)
    // só o cabeçalho de PNG, o resto é lixo: o sharp não decodifica
    const falso = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('<html><script>alert(1)</script></html>'.repeat(20))])
    expect((await a.api.post('/api/profile/avatar', file(falso))).status()).toBe(400)
    // SVG (pode carregar script) não é aceito
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    expect((await a.api.post('/api/profile/avatar', file(svg, 'a.svg', 'image/svg+xml'))).status()).toBe(400)
    // sem arquivo / sem formulário
    expect((await a.api.post('/api/profile/avatar', { data: {} })).status()).toBe(400)
    const m = await testDb.organizationMember.findUniqueOrThrow({ where: { id: a.memberId } })
    expect(m.avatarType).toBeNull()
    expect(existsSync(join(UPLOADS_TEST_DIR, a.orgId, `avatar-${a.memberId}`))).toBe(false)
    await dispose(a.api)
  })

  test('acima de 2 MB é recusado antes de processar', async () => {
    const a = await company()
    const big = Buffer.concat([await png(), Buffer.alloc(2 * 1024 * 1024 + 200 * 1024, 1)])
    const r = await a.api.post('/api/profile/avatar', file(big))
    expect([400, 413]).toContain(r.status())
    expect((await r.json()).error).toMatch(/2 MB/)
    await dispose(a.api)
  })

  test('colega da mesma empresa vê a foto; outra empresa e quem não está logado não veem', async () => {
    const a = await company()
    const colega = `colega.${uid()}@test.local`
    await createUser(a.api, { email: colega, role: 'viewer' })
    const { avatarUrl } = await (await a.api.post('/api/profile/avatar', file(await png()))).json()
    const viewer = await loginAs(colega, STRONG)
    expect((await viewer.get(avatarUrl)).status()).toBe(200)

    const b = await company()
    expect((await b.api.get(avatarUrl)).status()).toBe(404)
    expect((await b.api.get(`/api/media/avatar/${a.memberId}`)).status()).toBe(404)
    const anon = await anonymous()
    expect((await anon.get(avatarUrl)).status()).toBe(401)
    // id com caminho não escapa da pasta
    expect([400, 404]).toContain((await a.api.get('/api/media/avatar/..%2F..%2Fpackage.json')).status())
    await dispose(a.api, b.api, viewer, anon)
  })

  test('membro removido: a foto dele sai do disco', async () => {
    const a = await company()
    const colega = `sai.${uid()}@test.local`
    const member = await createUser(a.api, { email: colega, role: 'member' })
    const c = await loginAs(colega, STRONG)
    expect((await c.post('/api/profile/avatar', file(await png()))).status()).toBe(200)
    const onDisk = join(UPLOADS_TEST_DIR, a.orgId, `avatar-${member.id}`)
    expect(existsSync(onDisk)).toBe(true)
    expect((await a.api.delete(`/api/members/${member.id}`)).status()).toBe(200)
    expect(existsSync(onDisk)).toBe(false)
    await dispose(a.api, c)
  })
})

test.describe('P7 · logotipo da empresa', () => {
  test('admin envia; todos os membros veem (barra superior via /api/me); outra empresa recebe 404', async () => {
    const a = await company()
    const r = await a.api.post('/api/organization/logo', file(await png(1200, 300), 'logo.jpg', 'image/jpeg'))
    expect(r.status()).toBe(200)
    const { logoUrl } = await r.json()
    expect(logoUrl).toMatch(new RegExp(`^/api/media/logo/${a.orgId}\\?v=\\d+$`))
    expect((await (await a.api.get('/api/me')).json()).organizationLogoUrl).toBe(logoUrl)
    expect((await (await a.api.get('/api/settings')).json()).organization.logoUrl).toBe(logoUrl)

    const img = await a.api.get(logoUrl)
    expect(img.headers()['content-type']).toBe('image/webp')
    expect(img.headers()['x-content-type-options']).toBe('nosniff')
    const meta = await sharp(await img.body()).metadata()
    expect([meta.width, meta.height]).toEqual([512, 128]) // reduzido sem cortar

    const colega = `logo.${uid()}@test.local`
    await createUser(a.api, { email: colega, role: 'atendente' })
    const att = await loginAs(colega, STRONG)
    expect((await (await att.get('/api/me')).json()).organizationLogoUrl).toBe(logoUrl)
    expect((await att.get(logoUrl)).status()).toBe(200)
    // atendente não troca o logotipo
    expect((await att.post('/api/organization/logo', file(await png()))).status()).toBe(403)
    expect((await att.delete('/api/organization/logo')).status()).toBe(403)

    const b = await company()
    expect((await b.api.get(logoUrl)).status()).toBe(404)
    expect((await b.api.get(`/api/media/logo/${a.orgId}`)).status()).toBe(404)
    expect((await (await b.api.get('/api/me')).json()).organizationLogoUrl).toBeNull()

    expect((await a.api.delete('/api/organization/logo')).status()).toBe(200)
    expect((await a.api.get(logoUrl)).status()).toBe(404)
    expect(existsSync(join(UPLOADS_TEST_DIR, a.orgId, 'logo'))).toBe(false)
    await dispose(a.api, b.api, att)
  })

  test('Configurações não aceita mais um endereço livre de logotipo (logoUrl é ignorado)', async () => {
    const a = await company()
    expect((await a.api.patch('/api/settings', { data: { logoUrl: 'https://exemplo.invalid/x.svg' } })).status()).toBe(200)
    expect((await (await a.api.get('/api/settings')).json()).organization.logoUrl).toBeNull()
    expect((await testDb.organization.findUniqueOrThrow({ where: { id: a.orgId } })).logoUrl).toBeNull()
    await dispose(a.api)
  })

  test('exclusão definitiva da empresa apaga a pasta de imagens dela', async () => {
    const a = await company()
    expect((await a.api.post('/api/organization/logo', file(await png()))).status()).toBe(200)
    expect((await a.api.post('/api/profile/avatar', file(await png()))).status()).toBe(200)
    expect(existsSync(join(UPLOADS_TEST_DIR, a.orgId))).toBe(true)
    const del = await a.api.post('/api/organization/deletion', { data: { password: a.password, confirmName: a.orgName } })
    expect(del.ok(), await del.text()).toBe(true)
    const gw = await gatewayClient()
    const tick = await gw.post('/api/gateway/tick', { data: { organizationId: a.orgId, deletionsAt: new Date(Date.now() + 8 * 86400_000).toISOString() } })
    expect((await tick.json()).deleted).toBe(1)
    expect(existsSync(join(UPLOADS_TEST_DIR, a.orgId))).toBe(false)
    await dispose(a.api, gw)
  })
})
