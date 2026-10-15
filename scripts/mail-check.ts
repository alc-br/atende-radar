// Confere o Brevo A PARTIR DO SERVIDOR (a conta só aceita chamadas de IPs autorizados; da máquina local dá 401).
// Mostra: se a chave entra, se o domínio do remetente (MAIL_FROM) está autenticado e o saldo do plano.
// Com MAIL_TEST_TO definido, envia também um e-mail de teste para esse endereço. Nunca imprime a chave.
//   bun scripts/mail-check.ts            → só confere
//   MAIL_TEST_TO=x@y bun scripts/mail-check.ts
// Sai com código 2 quando o domínio do remetente não está autenticado (o deploy então não liga o envio).
import { parseSender } from '../src/lib/mailer'

const key = process.env.BREVO_API_KEY
const from = process.env.MAIL_FROM
const H = { 'api-key': key || '', accept: 'application/json', 'Content-Type': 'application/json' }

async function get(path: string) {
  const r = await fetch(`https://api.brevo.com/v3${path}`, { headers: H })
  return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> }
}

async function main() {
  if (!key || !from) {
    console.log('mail-check: BREVO_API_KEY/MAIL_FROM ausentes')
    process.exitCode = 1
    return
  }
  const sender = parseSender(from)
  const domain = sender.email.split('@')[1]?.toLowerCase()
  const acc = await get('/account')
  if (acc.status !== 200) {
    console.log(`mail-check: conta Brevo respondeu ${acc.status} (${String(acc.body.message ?? acc.body.code ?? '').replace(/\d+\.\d+\.\d+\.\d+/g, 'IP')})`)
    process.exitCode = 1
    return
  }
  const plans = (acc.body.plan as { type?: string; credits?: number; creditsType?: string }[]) || []
  console.log(`mail-check: conta ok; plano ${plans.map((p) => `${p.type}${p.credits !== undefined ? ` (${p.credits} ${p.creditsType ?? ''})` : ''}`).join(', ')}`)
  const doms = await get('/senders/domains')
  const list = (doms.body.domains as { domain_name: string; authenticated: boolean; verified: boolean }[]) || []
  const d = list.find((x) => x.domain_name.toLowerCase() === domain)
  console.log(`mail-check: domínios: ${list.map((x) => `${x.domain_name}${x.authenticated ? ' (autenticado)' : ' (NÃO autenticado)'}`).join(', ') || 'nenhum'}`)
  const senders = await get('/senders')
  const s = ((senders.body.senders as { email: string; active: boolean }[]) || []).find((x) => x.email.toLowerCase() === sender.email.toLowerCase())
  console.log(`mail-check: remetente ${sender.email}: ${s ? (s.active ? 'cadastrado e ativo' : 'cadastrado, INATIVO') : 'não cadastrado como remetente'}`)
  if (!d?.authenticated) {
    console.log(`mail-check: o domínio ${domain} precisa estar autenticado no Brevo (DKIM/DMARC) antes de ligar o envio`)
    process.exitCode = 2
    return
  }
  const to = process.env.MAIL_TEST_TO?.trim()
  if (to) {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ sender, to: [{ email: to }], subject: 'Teste de envio — AtendeRadar', textContent: 'E-mail de teste do AtendeRadar enviado pelo servidor (Brevo). Pode ignorar.' }),
    })
    console.log(`mail-check: envio de teste: HTTP ${r.status}`)
    if (!r.ok) process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(`mail-check: ${e instanceof Error ? e.message : 'erro'}`)
  process.exitCode = 1
})
