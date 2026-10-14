import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { issueToken } from '@/lib/auth-tokens'
import { appUrl, sendMail } from '@/lib/mailer'
import { allow, clientIp } from '@/lib/rate-limit'
import { readJson } from '@/lib/json-body'

// Sempre responde 200 (não revela se o e-mail tem conta). Só o limite de pedidos responde diferente.
export async function POST(request: Request) {
  const j = await readJson<{ email?: string }>(request, { optional: true })
  if (!j.ok) return j.res
  const body = j.body
  const email = (body?.email || '').trim().toLowerCase()
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Informe o e-mail.' }, { status: 400 })
  }
  if (!allow(`forgot:ip:${clientIp(request)}`, 30, 60 * 60 * 1000) || !allow(`forgot:${email}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitos pedidos. Tente novamente mais tarde.' }, { status: 429 })
  }

  const member = await db.organizationMember.findFirst({ where: { email, status: { in: ['active', 'invited'] } } })
  if (member) {
    const token = await issueToken(member.id, 'reset')
    await sendMail({
      to: email,
      subject: 'Redefinir a sua senha — AtendeRadar',
      text: `Recebemos um pedido para redefinir a sua senha.\n\nCrie uma nova senha aqui (o link vale por 1 hora e só pode ser usado uma vez):\n${appUrl()}/reset-password?token=${token}\n\nSe não foi você, ignore este e-mail: a sua senha continua a mesma.`,
    })
  }
  return NextResponse.json({ success: true })
}
