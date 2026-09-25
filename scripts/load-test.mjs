// Teste de carga simples (sem dependências): cria uma empresa por cadastro, injeta mensagens pelo gateway e mede
// vazão da ingestão, tempo do motor de análise e tempo das telas principais com muitos dados.
//   node scripts/load-test.mjs http://127.0.0.1:3300 <GATEWAY_SECRET> [conversas=200] [mensagens_por_conversa=10]
const [base, secret, convsArg, msgsArg] = process.argv.slice(2)
if (!base || !secret) {
  console.error('uso: node scripts/load-test.mjs <baseUrl> <gatewaySecret> [conversas] [mensagensPorConversa]')
  process.exit(2)
}
const CONVS = Number(convsArg || 200)
const MSGS = Number(msgsArg || 10)
const CONCURRENCY = 10

const rnd = () => Math.random().toString(36).slice(2, 8)
const email = `carga.${rnd()}@carga.test`
const password = 'Senha-Forte-2026x'

async function timed(label, fn) {
  const t = performance.now()
  const r = await fn()
  const ms = Math.round(performance.now() - t)
  console.log(`${label.padEnd(46)} ${String(ms).padStart(7)} ms`)
  return { r, ms }
}

async function login() {
  const jar = {}
  const res = await fetch(`${base}/api/auth/csrf`)
  const csrf = (await res.json()).csrfToken
  const setCookie = (r) => (r.headers.getSetCookie?.() ?? []).forEach((c) => { const [kv] = c.split(';'); const [k, ...v] = kv.split('='); jar[k] = v.join('=') })
  setCookie(res)
  const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')
  const r2 = await fetch(`${base}/api/auth/callback/credentials`, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie() },
    body: new URLSearchParams({ csrfToken: csrf, email, password, json: 'true' }),
  })
  setCookie(r2)
  return () => cookie()
}

const gw = { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }
const post = (path, body, headers) => fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })

console.log(`Carga: ${CONVS} conversas × ${MSGS} mensagens = ${CONVS * MSGS} mensagens, concorrência ${CONCURRENCY}\n`)

const signup = await post('/api/auth/signup', { name: 'Carga', email, password, organizationName: `Carga ${rnd()}` }, { 'Content-Type': 'application/json' })
if (signup.status !== 201) throw new Error(`cadastro falhou ${signup.status}`)
const cookie = await login()
const auth = () => ({ Cookie: cookie(), 'Content-Type': 'application/json' })

const conn = await (await post('/api/connections', { name: 'Carga', phoneNumber: '+5511900009999' }, auth())).json()
const connectionId = conn.connection.id
await post('/api/gateway/events', { eventId: `st-${rnd()}`, connectionId, type: 'connection.status', payload: { status: 'connected' } }, gw)

// ---- ingestão ----
const jobs = []
const now = Date.now()
for (let c = 0; c < CONVS; c++) {
  const chatId = `55119${String(10000000 + c).padStart(8, '0')}@s.whatsapp.net`
  for (let m = 0; m < MSGS; m++) {
    const fromMe = m % 2 === 1
    jobs.push({
      eventId: `ev-${rnd()}${c}-${m}`, connectionId, type: fromMe ? 'message.sent' : 'message.received',
      occurredAt: new Date(now - (MSGS - m) * 60000 - c * 1000).toISOString(),
      payload: { externalId: `wa-${rnd()}${c}-${m}`, chatId, isGroup: false, fromMe, text: fromMe ? 'Olá! Já te retorno em 1 hora.' : m === 0 ? 'Oi, quanto custa o clareamento?' : 'Ok, obrigado', messageType: 'text', pushName: fromMe ? undefined : `Cliente ${c}` },
    })
  }
}
// mensagens de uma mesma conversa em ordem (a ingestão é por evento, mas conversas diferentes em paralelo)
const byChat = new Map()
for (const j of jobs) byChat.set(j.payload.chatId, [...(byChat.get(j.payload.chatId) ?? []), j])
const queues = [...byChat.values()]
let failures = 0
const { ms: ingestMs } = await timed(`Ingestão de ${jobs.length} mensagens`, async () => {
  let i = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (i < queues.length) {
      const q = queues[i++]
      for (const j of q) {
        const r = await post('/api/gateway/events', j, gw)
        if (r.status !== 200) {
          failures++
          if (failures <= 3) console.log(`  falha ${r.status}: ${(await r.text()).slice(0, 200)}`)
        }
      }
    }
  }))
})
console.log(`  → ${Math.round(jobs.length / (ingestMs / 1000))} mensagens/s, falhas: ${failures}\n`)

// ---- motor ----
await timed('Motor de análise (1ª rodada, tudo novo)', () => post('/api/gateway/tick', {}, gw))
await timed('Motor de análise (2ª rodada, sem novidade)', () => post('/api/gateway/tick', {}, gw))

// ---- telas com muitos dados ----
for (const path of ['/api/dashboard?period=7d', '/api/conversations?limit=15', '/api/conversations?limit=100', '/api/alerts?limit=50', '/api/recovery?limit=50', '/api/team', '/api/reports', '/api/notifications']) {
  await timed(`GET ${path}`, async () => {
    const r = await fetch(`${base}${path}`, { headers: auth() })
    if (r.status !== 200) throw new Error(`${path} → ${r.status}`)
    await r.text()
  })
}

// ---- leitura concorrente (50 usuários abrindo o painel ao mesmo tempo) ----
const { ms: concMs } = await timed('50 painéis simultâneos (/api/dashboard)', async () => {
  const rs = await Promise.all(Array.from({ length: 50 }, () => fetch(`${base}/api/dashboard?period=7d`, { headers: auth() })))
  const bad = rs.filter((r) => r.status !== 200).length
  if (bad) console.log(`  → ${bad} respostas com erro`)
})
console.log(`\nResumo: ingestão ${Math.round(jobs.length / (ingestMs / 1000))} msg/s · 50 painéis em ${concMs} ms`)
