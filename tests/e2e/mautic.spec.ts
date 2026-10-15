import { test, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { TEST_DB_URL } from './test-db-url'

// Contatos no Mautic: scripts/mautic-sync.ts (o mesmo sync do deploy e do job de 6 h) roda de verdade contra o banco de
// teste e um Mautic FALSO local. Prova a consulta ao banco (schema real), os campos ar_*, as tags e quem fica de fora
// (demonstração = org_seed_1, simulação).

type Posted = { auth: string | undefined; body: Record<string, unknown> }

function fakeMautic(): Promise<{ server: Server; url: string; posted: Posted[] }> {
  const posted: Posted[] = []
  const server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json')
      if (req.method === 'GET' && req.url?.startsWith('/api/contacts?')) return res.end(JSON.stringify({ total: 0, contacts: {} }))
      if (req.method === 'POST' && req.url === '/api/contacts/new') {
        posted.push({ auth: req.headers.authorization, body: JSON.parse(raw) })
        return res.end(JSON.stringify({ contact: { id: posted.length } }))
      }
      res.statusCode = 404
      res.end('{}')
    })
  })
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, posted })))
}

function run(env: NodeJS.ProcessEnv): Promise<{ code: number | null; out: string }> {
  return new Promise((ok) => {
    const p = spawn('bun', ['scripts/mautic-sync.ts'], { env, shell: process.platform === 'win32' })
    let out = ''
    p.stdout.on('data', (c) => (out += c))
    p.stderr.on('data', (c) => (out += c))
    p.on('close', (code) => ok({ code, out }))
  })
}

test('mautic-sync: todo membro de empresa real vira contato com sistema_origem, tags e campos ar_*; demonstração fica de fora', async () => {
  test.setTimeout(120_000)
  const { server, url, posted } = await fakeMautic()
  try {
    const r = await run({ ...process.env, DATABASE_URL: TEST_DB_URL, MAUTIC_URL: url, MAUTIC_USUARIO: 'teste-api', MAUTIC_SENHA: 'senha-teste' })
    expect(r.code, r.out).toBe(0)
    expect(r.out).toMatch(/mautic-sync: \d+ contatos sincronizados, 0 falhas/)
    expect(posted.length).toBeGreaterThan(0)
    expect(posted[0].auth).toBe('Basic ' + Buffer.from('teste-api:senha-teste').toString('base64'))

    const emails = posted.map((p) => String(p.body.email))
    expect(emails.some((e) => e.endsWith('.a@test.local') || e === 'platform@test.local')).toBe(false) // org_seed_1 = demonstração
    expect(emails.some((e) => e.endsWith('@sim.invalid'))).toBe(false)

    const admin = posted.find((p) => p.body.email === 'admin.b@test.local')?.body
    expect(admin).toMatchObject({
      sistema_origem: ['atenderadar'], tags: ['atenderadar', 'atenderadar-membro'], company: 'Clínica B', overwriteWithBlank: false,
      ar_papel: 'admin', ar_membro: 'ativo', ar_plano: 'gestao', ar_assinatura: 'ativa', ar_empresa_id: 'org_b', ar_email_confirmado: 0,
    })
    expect(String(admin?.ar_cadastro)).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/)
  } finally {
    server.close()
  }
})

test('mautic-sync sem MAUTIC_URL/USUARIO/SENHA não faz nada e sai com 0', async () => {
  const env = { ...process.env, DATABASE_URL: TEST_DB_URL } as NodeJS.ProcessEnv
  delete env.MAUTIC_URL
  delete env.MAUTIC_USUARIO
  delete env.MAUTIC_SENHA
  const r = await run(env)
  expect(r.code, r.out).toBe(0)
  expect(r.out).toContain('nada a fazer')
})
