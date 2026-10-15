import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { hashPassword, passwordProblem } from '@/lib/passwords'
import { issueToken } from '@/lib/auth-tokens'
import { appUrl, sendMail } from '@/lib/mailer'
import { allow, clientIp } from '@/lib/rate-limit'
import { createOrganizationDefaults } from '@/lib/org-defaults'
import { TERMS_REQUIRED_MESSAGE, termsAcceptance } from '@/lib/legal'
import { readJson } from '@/lib/json-body'
import { milestone } from '@/lib/product-events'
import { queueMemberSync } from '@/lib/mautic'

const Body = z.object({
  name: z.string().trim().min(2, 'Informe o seu nome.').max(120),
  email: z.string().trim().toLowerCase().email('E-mail inválido.').max(200),
  password: z.string().min(1, 'Informe a senha.'),
  organizationName: z.string().trim().min(2, 'Informe o nome da empresa.').max(160),
  acceptTerms: z.unknown().optional(),
})

const TRIAL_DAYS = 14

// Cadastro público: cria a organização do cliente (vazia), o dono (admin) e a assinatura de teste.
export async function POST(request: Request) {
  if (!allow(`signup:${clientIp(request)}`, Number(process.env.SIGNUP_RATE_LIMIT_PER_HOUR || 20), 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Tente novamente mais tarde.' }, { status: 429 })
  }
  const j = await readJson(request, { optional: true })
  if (!j.ok) return j.res
  const parsed = Body.safeParse(j.body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos.' }, { status: 400 })
  }
  const { name, email, password, organizationName, acceptTerms } = parsed.data
  // Aceite dos Termos e da Política é obrigatório (B9/V4): a versão aceita fica gravada no dono da conta.
  if (acceptTerms !== true) return NextResponse.json({ error: TERMS_REQUIRED_MESSAGE }, { status: 400 })

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
    await createOrganizationDefaults(tx, org.id, email)
    return tx.organizationMember.create({
      data: {
        organizationId: org.id,
        userId: email,
        name,
        email,
        role: 'admin',
        status: 'active',
        passwordHash: hashPassword(password),
        ...termsAcceptance(),
      },
    })
  })

  await milestone(member.organizationId, 'signup') // funil (I7): nunca lança erro
  queueMemberSync(member.id) // contato no Mautic (nunca lança)

  const token = await issueToken(member.id, 'verify')
  await sendMail({
    to: email,
    subject: 'Confirme o seu e-mail — AtendeRadar',
    text: `Olá, ${name}!\n\nSua conta do AtendeRadar foi criada. Confirme o seu e-mail:\n${appUrl()}/verify-email?token=${token}\n\nO link vale por 3 dias.`,
  })

  return NextResponse.json({ success: true }, { status: 201 })
}
