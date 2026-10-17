import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard } from '@/lib/api-auth'
import { allow } from '@/lib/rate-limit'
import { sendMail } from '@/lib/mailer'
import { maskSensitive } from '@/lib/mask-sensitive'
import { APP_VERSION } from '@/lib/app-version'
import {
  MAX_SUPPORT_BODY_BYTES,
  SUPPORT_RATE_LIMIT,
  SUPPORT_RATE_WINDOW_MS,
  parseScreenshot,
  parseSupportFields,
  publicTicket,
  readBodyLimited,
} from '@/lib/support'

const tooLarge = () =>
  NextResponse.json({ error: `O envio passou do limite de ${Math.round(MAX_SUPPORT_BODY_BYTES / 1024 / 1024)} MB. Envie uma captura menor.` }, { status: 413 })

/** Chamados que o próprio membro abriu (os mais recentes primeiro). */
export async function GET() {
  const g = await guard(undefined, { allowLocked: true })
  if (!g.ok) return g.res
  const tickets = await db.supportTicket.findMany({
    where: { organizationId: g.auth.orgId, memberId: g.auth.memberId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, subject: true, message: true, status: true, screen: true, appVersion: true, screenshotType: true, screenshotSize: true, createdAt: true, resolvedAt: true },
  })
  return NextResponse.json({ tickets: tickets.map(publicTicket) })
}

/**
 * Abre um chamado. Corpo multipart (assunto, mensagem, captura opcional, tela e versão do painel); não passa pelo
 * readJson porque a captura é um arquivo. O corpo inteiro é limitado antes de ser lido.
 */
export async function POST(request: Request) {
  const g = await guard(undefined, { allowLocked: true })
  if (!g.ok) return g.res
  const { auth } = g

  if (!allow(`support:${auth.memberId}`, SUPPORT_RATE_LIMIT, SUPPORT_RATE_WINDOW_MS)) {
    return NextResponse.json({ error: 'Você já abriu vários chamados na última hora. Aguarde um pouco; a equipe já recebeu os anteriores.' }, { status: 429 })
  }

  const contentType = request.headers.get('content-type') || ''
  if (!/^multipart\/form-data/i.test(contentType)) return NextResponse.json({ error: 'Envie o formulário do suporte.' }, { status: 400 })

  let raw: Uint8Array<ArrayBuffer> | null
  try {
    raw = await readBodyLimited(request)
  } catch {
    return NextResponse.json({ error: 'Formulário inválido.' }, { status: 400 })
  }
  if (raw === null) return tooLarge()

  let form: FormData
  try {
    form = await new Response(raw, { headers: { 'content-type': contentType } }).formData()
  } catch {
    return NextResponse.json({ error: 'Formulário inválido.' }, { status: 400 })
  }

  const fields = parseSupportFields(form)
  if (!fields.ok) return NextResponse.json({ error: fields.error }, { status: 400 })
  const shot = await parseScreenshot(form.get('screenshot'))
  if (!shot.ok) return NextResponse.json({ error: shot.error }, { status: 400 })

  const { subject, message, screen, appVersion } = fields.data
  const org = await db.organization.findUnique({ where: { id: auth.orgId }, select: { name: true, displayName: true } })
  const ticket = await db.supportTicket.create({
    data: {
      organizationId: auth.orgId,
      memberId: auth.memberId,
      authorName: auth.name,
      authorEmail: auth.email,
      // cliente às vezes cola CPF ou cartão para "ajudar": não fica guardado em claro
      subject: maskSensitive(subject),
      message: maskSensitive(message),
      screen,
      appVersion: appVersion || APP_VERSION,
      userAgent: (request.headers.get('user-agent') || '').slice(0, 300) || null,
      screenshot: shot.file?.bytes ?? null,
      screenshotType: shot.file?.type ?? null,
      screenshotSize: shot.file?.size ?? null,
    },
  })

  const to = process.env.SUPPORT_EMAIL?.trim()
  if (to) {
    const orgName = org?.displayName || org?.name || auth.orgId
    await sendMail({
      to,
      subject: `[Suporte] ${orgName}: ${ticket.subject}`.slice(0, 200),
      text: [
        `Novo chamado de suporte (${ticket.id})`,
        '',
        `Empresa: ${orgName}`,
        `De: ${auth.name} <${auth.email}> (${auth.role})`,
        `Tela: ${ticket.screen || '-'}`,
        `Versão: ${ticket.appVersion || '-'}`,
        `Captura de tela: ${ticket.screenshotType ? 'sim (veja no painel Admin › Suporte)' : 'não'}`,
        '',
        `Assunto: ${ticket.subject}`,
        '',
        ticket.message,
      ].join('\n'),
    }).catch((e) => console.error('[support] falha ao enviar o e-mail do chamado', ticket.id, e instanceof Error ? e.message : e))
  } else {
    console.warn(`[support] SUPPORT_EMAIL não definido: chamado ${ticket.id} salvo sem aviso por e-mail (veja em Admin › Suporte)`)
  }

  return NextResponse.json({ ticket: publicTicket(ticket) }, { status: 201 })
}
