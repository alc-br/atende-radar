import { test, expect } from '@playwright/test'
import { anonymous, loginAs, signupOrg } from './helpers'
import { testDb } from './db'

// P8 · "Falar com o suporte": chamado com captura opcional (PNG/JPG/WEBP até 2 MB), limite por hora, visível só para
// o operador da plataforma (PLATFORM_ADMIN_EMAILS; nos testes, platform@test.local) e para quem abriu.
// E a página pública /status do site.

// PNG 1x1 válido
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

async function newOwner() {
  const { email, password } = await signupOrg()
  return loginAs(email, password)
}

const ticket = (extra: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {}) => ({
  multipart: { subject: 'Não consigo gerar o QR', message: 'O botão Gerar QR fica carregando e nada aparece.', screen: 'connections', appVersion: '1.2.3', ...extra },
})

test('abre chamado com e sem captura; valida tipo e tamanho da imagem; o operador vê, abre a imagem e resolve', async () => {
  const c = await newOwner()

  const semImagem = await c.post('/api/support', ticket())
  expect(semImagem.status()).toBe(201)
  const t1 = (await semImagem.json()).ticket
  expect(t1.hasScreenshot).toBe(false)
  expect(t1.screen).toBe('connections')
  expect(t1.appVersion).toBe('1.2.3')

  const comImagem = await c.post('/api/support', ticket({ screenshot: { name: 'tela.png', mimeType: 'image/png', buffer: PNG } }))
  expect(comImagem.status()).toBe(201)
  const t2 = (await comImagem.json()).ticket
  expect(t2.hasScreenshot).toBe(true)
  const row = await testDb.supportTicket.findUniqueOrThrow({ where: { id: t2.id } })
  expect(row.screenshotType).toBe('image/png')
  expect(row.screenshotSize).toBe(PNG.length)
  expect(row.status).toBe('open')

  // o tipo é conferido pelo conteúdo, não pelo nome nem pelo mimeType declarado
  const falso = await c.post('/api/support', ticket({ screenshot: { name: 'tela.png', mimeType: 'image/png', buffer: Buffer.from('isto não é uma imagem') } }))
  expect(falso.status()).toBe(400)
  expect((await falso.json()).error).toContain('PNG, JPG ou WEBP')

  const grande = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)])
  const excesso = await c.post('/api/support', ticket({ screenshot: { name: 'grande.png', mimeType: 'image/png', buffer: grande } }))
  expect(excesso.status()).toBe(400)
  expect((await excesso.json()).error).toContain('2 MB')

  // o próprio autor vê os chamados dele
  const meus = (await (await c.get('/api/support')).json()).tickets as Array<{ id: string }>
  expect(meus.map((t) => t.id)).toEqual(expect.arrayContaining([t1.id, t2.id]))

  const op = await loginAs('platform@test.local')
  const lista = await op.get('/api/admin/support?status=open')
  expect(lista.status()).toBe(200)
  const listaBody = await lista.json()
  expect(listaBody.tickets.map((t: { id: string }) => t.id)).toEqual(expect.arrayContaining([t1.id, t2.id]))
  expect(JSON.stringify(listaBody)).not.toContain('"screenshot":')

  const detalhe = await op.get(`/api/admin/support/${t2.id}`)
  expect(detalhe.status()).toBe(200)
  expect((await detalhe.json()).ticket.hasScreenshot).toBe(true)

  const imagem = await op.get(`/api/admin/support/${t2.id}/screenshot`)
  expect(imagem.status()).toBe(200)
  expect(imagem.headers()['content-type']).toBe('image/png')
  expect(imagem.headers()['cache-control']).toContain('no-store')
  expect(Buffer.compare(await imagem.body(), PNG)).toBe(0)
  expect((await op.get(`/api/admin/support/${t1.id}/screenshot`)).status()).toBe(404)

  const resolve = await op.patch(`/api/admin/support/${t2.id}`, { data: { status: 'resolved' } })
  expect(resolve.status()).toBe(200)
  const resolvido = await testDb.supportTicket.findUniqueOrThrow({ where: { id: t2.id } })
  expect(resolvido.status).toBe('resolved')
  expect(resolvido.resolvedAt).not.toBeNull()
  expect((await op.patch(`/api/admin/support/${t2.id}`, { data: { status: 'qualquer' } })).status()).toBe(400)
  expect((await op.get('/api/admin/support/nao-existe')).status()).toBe(404)

  await op.dispose()
  await c.dispose()
})

test('o operador responde: e-mail ao autor (EmailOutbox), resposta registrada no chamado, aberto → respondido → fechado', async () => {
  const { email, password } = await signupOrg()
  const c = await loginAs(email, password)
  const t = (await (await c.post('/api/support', ticket())).json()).ticket as { id: string }
  const op = await loginAs('platform@test.local')

  expect((await op.post(`/api/admin/support/${t.id}/reply`, { data: { message: '  ' } })).status()).toBe(400)
  expect((await op.post('/api/admin/support/nao-existe/reply', { data: { message: 'Olá' } })).status()).toBe(404)

  const r1 = await op.post(`/api/admin/support/${t.id}/reply`, { data: { message: 'Recarregue a página e gere o QR de novo.' } })
  expect(r1.status()).toBe(201)
  const b1 = await r1.json()
  expect(b1.ticket.status).toBe('answered')
  expect(['queued', 'sent', 'failed']).toContain(b1.emailStatus) // nos testes não há provedor: fica na fila
  expect(b1.replies).toHaveLength(1)
  expect(b1.replies[0].text).toBe('Recarregue a página e gere o QR de novo.')
  expect(b1.replies[0].to).toBe(email)

  // o e-mail vai para quem abriu, pelo EmailOutbox, com o assunto do chamado e a mensagem original citada
  const mails = await testDb.emailOutbox.findMany({ where: { kind: 'support_reply', toEmail: email } })
  expect(mails).toHaveLength(1)
  expect(mails[0].subject).toContain('Não consigo gerar o QR')
  expect(mails[0].body).toContain('Recarregue a página e gere o QR de novo.')
  expect(mails[0].body).toContain('O botão Gerar QR fica carregando')
  expect(JSON.parse(mails[0].headers ?? '{}')['X-AtendeRadar-Ticket']).toBe(t.id)

  // o autor vê "respondido" na lista dele; a lista do operador filtra por respondidos
  const meus = (await (await c.get('/api/support')).json()).tickets as Array<{ id: string; status: string }>
  expect(meus.find((x) => x.id === t.id)?.status).toBe('answered')
  const respondidos = (await (await op.get('/api/admin/support?status=answered')).json()).tickets as Array<{ id: string }>
  expect(respondidos.map((x) => x.id)).toContain(t.id)

  // segunda resposta fechando o chamado; o detalhe mostra as duas
  const r2 = await op.post(`/api/admin/support/${t.id}/reply`, { data: { message: 'Resolvido do nosso lado.', close: true } })
  expect(r2.status()).toBe(201)
  expect((await r2.json()).ticket.status).toBe('resolved')
  const detalhe = await (await op.get(`/api/admin/support/${t.id}`)).json()
  expect(detalhe.replies.map((r: { text: string }) => r.text)).toEqual(['Recarregue a página e gere o QR de novo.', 'Resolvido do nosso lado.'])
  expect((await testDb.supportTicket.findUniqueOrThrow({ where: { id: t.id } })).resolvedBy).toBe('platform@test.local')

  await op.dispose()
  await c.dispose()
})

test('assunto e mensagem obrigatórios; corpo precisa ser multipart', async () => {
  const c = await newOwner()
  expect((await c.post('/api/support', ticket({ subject: '' }))).status()).toBe(400)
  expect((await c.post('/api/support', ticket({ message: 'curta' }))).status()).toBe(400)
  expect((await c.post('/api/support', { data: { subject: 'Assunto', message: 'Mensagem longa o bastante' } })).status()).toBe(400)
  await c.dispose()
})

test('limite de chamados por hora: o sexto seguido recebe 429', async () => {
  const c = await newOwner()
  for (let i = 1; i <= 5; i++) expect((await c.post('/api/support', ticket({ subject: `Chamado ${i}` }))).status()).toBe(201)
  const sexto = await c.post('/api/support', ticket({ subject: 'Chamado 6' }))
  expect(sexto.status()).toBe(429)
  await c.dispose()
})

test('isolamento: admin de outra empresa não vê o chamado nem acessa as rotas do operador', async () => {
  const a = await newOwner()
  const criado = await a.post('/api/support', ticket({ screenshot: { name: 'tela.png', mimeType: 'image/png', buffer: PNG } }))
  expect(criado.status()).toBe(201)
  const id = (await criado.json()).ticket.id as string

  const b = await newOwner()
  const deB = (await (await b.get('/api/support')).json()).tickets as Array<{ id: string }>
  expect(deB.map((t) => t.id)).not.toContain(id)

  // admin da própria empresa também não é operador da plataforma
  for (const ctx of [a, b]) {
    expect((await ctx.get('/api/admin/support')).status()).toBe(403)
    expect((await ctx.get(`/api/admin/support/${id}`)).status()).toBe(403)
    expect((await ctx.get(`/api/admin/support/${id}/screenshot`)).status()).toBe(403)
    expect((await ctx.patch(`/api/admin/support/${id}`, { data: { status: 'resolved' } })).status()).toBe(403)
    expect((await ctx.post(`/api/admin/support/${id}/reply`, { data: { message: 'Resposta indevida' } })).status()).toBe(403)
  }
  expect((await testDb.supportTicket.findUniqueOrThrow({ where: { id } })).status).toBe('open')

  // sem sessão, nem a imagem
  const anon = await anonymous()
  expect((await anon.get(`/api/admin/support/${id}/screenshot`)).status()).toBe(401)
  await anon.dispose()
  await a.dispose()
  await b.dispose()
})

test('status público: a página e o JSON respondem 200 sem login', async () => {
  const anon = await anonymous()
  const page = await anon.get('/status')
  expect(page.status()).toBe(200)
  expect(await page.text()).toContain('operando normalmente')

  const json = await anon.get('/api/public/status')
  expect(json.status()).toBe(200)
  const body = await json.json()
  expect(body.status).toBe('ok')
  expect(Object.keys(body.components).sort()).toEqual(['analise', 'painel'])
  await anon.dispose()
})
