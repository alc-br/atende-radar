import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { hashPassword, passwordProblem } from '@/lib/passwords'
import { issueToken } from '@/lib/auth-tokens'
import { appUrl, sendMail } from '@/lib/mailer'
import { allow, clientIp } from '@/lib/rate-limit'

const Body = z.object({
  name: z.string().trim().min(2, 'Informe o seu nome.').max(120),
  email: z.string().trim().toLowerCase().email('E-mail inválido.').max(200),
  password: z.string().min(1, 'Informe a senha.'),
  organizationName: z.string().trim().min(2, 'Informe o nome da empresa.').max(160),
})

const TRIAL_DAYS = 14

// Cadastro público: cria a organização do cliente (vazia), o dono (admin) e a assinatura de teste.
export async function POST(request: Request) {
  if (!allow(`signup:${clientIp(request)}`, Number(process.env.SIGNUP_RATE_LIMIT_PER_HOUR || 20), 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Tente novamente mais tarde.' }, { status: 429 })
  }
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' }, { status: 400 })
  }
  const { name, email, password, organizationName } = parsed.data

  const problem = passwordProblem(password, email)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  if (await db.organizationMember.findFirst({ where: { email }, select: { id: true } })) {
    return NextResponse.json({ error: 'Já existe uma conta com este e-mail. Entre ou recupere a senha.' }, { status: 409 })
  }

  const plan = await db.plan.findFirst({ where: { active: true }, orderBy: { monthlyPrice: 'asc' } })

  const member = await db.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: { name: organizationName, displayName: organizationName, adminEmail: email, status: 'active' },
    })
    if (plan) {
      const trialEnd = new Date(Date.now() + TRIAL_DAYS * 86400000)
      await tx.subscription.create({
        data: { organizationId: org.id, planId: plan.id, status: 'trialing', trialEnd, currentPeriodEnd: trialEnd },
      })
    }
    return tx.organizationMember.create({
      data: {
        organizationId: org.id,
        userId: email,
        name,
        email,
        role: 'admin',
        status: 'active',
        passwordHash: hashPassword(password),
      },
    })
  })

  const token = await issueToken(member.id, 'verify')
  await sendMail({
    to: email,
    subject: 'Confirme o seu e-mail — AtendeRadar',
    text: `Olá, ${name}!\n\nSua conta do AtendeRadar foi criada. Confirme o seu e-mail:\n${appUrl()}/verify-email?token=${token}\n\nO link vale por 3 dias.`,
  })

  return NextResponse.json({ success: true }, { status: 201 })
}
