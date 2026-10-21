// Aviso aos clientes da mudança da Política de Privacidade de 21/10/2026 (classificação pelo Claude, backup no Drive).
// A política promete avisar mudanças relevantes (seção 9). Rodar NO SERVIDOR (o Brevo só aceita o IP de lá).
//   bun scripts/aviso-politica.ts                    → só mostra quantos receberiam e o texto (não envia)
//   PREVIEW_HTML=/tmp/aviso.html bun scripts/aviso-politica.ts   → grava também a versão HTML para conferir
//   ENVIAR=1 bun scripts/aviso-politica.ts           → envia (quem já recebeu este assunto não recebe de novo)
// Destinatários: membros ativos com senha (conta de verdade) das empresas que não são simulação nem estão em exclusão.
import { writeFileSync } from 'node:fs'
import { db } from '../src/lib/db'
import { mailHtml } from '../src/lib/mail-html'
import { appUrl, sendMailRow } from '../src/lib/mailer'

export const SUBJECT = 'Atualizamos a Política de Privacidade do AtendeRadar'

export function avisoText(nome: string | null, siteUrl: string): string {
  return `Olá${nome ? `, ${nome.split(' ')[0]}` : ''}!

Atualizamos a Política de Privacidade do AtendeRadar em 21/10/2026. Você não precisa fazer nada; este aviso é para você saber o que mudou.

O que mudou:
• Classificação por inteligência artificial: para identificar o assunto, o tom e a urgência de cada conversa, o texto das últimas mensagens passa a ser enviado ao Claude, da Anthropic, que atua como suboperadora.
• O que vai para a Anthropic: só as últimas mensagens de cada conversa (até 40), marcadas como cliente ou empresa, com CPF e números de cartão mascarados e sem o nome e o telefone cadastrados do contato. Ela devolve só a classificação, que é o que guardamos.
• Cópia de segurança fora do servidor: uma cópia diária, cifrada antes do envio, fica guardada no Google Drive. O Google não consegue ler o conteúdo.
• A política agora explica a transferência internacional desses dados (a Anthropic e o Google ficam nos Estados Unidos).

O que continua igual: prazos, alertas e a nota de cada conversa são calculados nos nossos servidores; não vendemos dados; o AtendeRadar não envia mensagens pelo seu número.

Se a sua empresa avisa os próprios clientes sobre como trata os dados das conversas, vale incluir esta informação.

Leia a política completa: ${siteUrl}/privacidade

Dúvidas? É só responder este e-mail.

— AtendeRadar`
}

async function main() {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://atenderadar.com.br').replace(/\/$/, '')
  const members = await db.organizationMember.findMany({
    where: {
      status: 'active', passwordHash: { not: null },
      organization: { isSimulation: false, deletionRequestedAt: null },
      NOT: [{ email: { endsWith: '@sim.invalid' } }, { email: { endsWith: '.local' } }],
    },
    select: { email: true, name: true },
  })
  const byEmail = new Map<string, { email: string; name: string | null }>()
  for (const m of members) if (!byEmail.has(m.email.toLowerCase())) byEmail.set(m.email.toLowerCase(), m)
  const already = new Set((await db.emailOutbox.findMany({ where: { subject: SUBJECT, status: 'sent' }, select: { toEmail: true } })).map((r) => r.toEmail.toLowerCase()))
  const todo = [...byEmail.values()].filter((m) => !already.has(m.email.toLowerCase()))

  console.log(`aviso-politica: ${byEmail.size} destinatário(s); ${already.size} já recebeu(ram); ${todo.length} a enviar (app ${appUrl()})`)
  if (process.env.PREVIEW_HTML) writeFileSync(process.env.PREVIEW_HTML, mailHtml(SUBJECT, avisoText('Maria Silva', siteUrl)))
  if (process.env.ENVIAR !== '1') {
    console.log(`\nAssunto: ${SUBJECT}\n\n${avisoText('Maria Silva', siteUrl)}\n\n(nada enviado; ENVIAR=1 envia)`)
    return
  }
  const count = { sent: 0, queued: 0, failed: 0 }
  for (const m of todo) count[(await sendMailRow({ to: m.email, subject: SUBJECT, text: avisoText(m.name, siteUrl) })).status]++
  console.log(`aviso-politica: enviados ${count.sent}, na fila ${count.queued}, falharam ${count.failed}`)
}

if (import.meta.main) main().finally(() => db.$disconnect())
