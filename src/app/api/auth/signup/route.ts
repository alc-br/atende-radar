import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { hashPassword, passwordProblem } from '@/lib/passwords'
import { sendVerificationEmail } from '@/lib/email-verification'
import { appUrl } from '@/lib/mailer'
import { allow, clientIp } from '@/lib/rate-limit'
import { createOrganizationDefaults } from '@/lib/org-defaults'
import { TERMS_REQUIRED_MESSAGE, termsAcceptance } from '@/lib/legal'
import { readJson } from '@/lib/json-body'
import { milestone } from '@/lib/product-events'
import { queueMemberSync } from '@/lib/mautic'
import { attributionFrom } from '@/lib/attribution'
import { isInternalOrg } from '@/lib/internal'
import { hashedContact, pageUrl, queueConversion, signUpEventId } from '@/lib/conversions'

const Body = z.object({
  name: z.string().trim().min(2, 'Informe o seu nome.').max(120),
  email: z.string().trim().toLowerCase().email('E-mail inválido.').max(200),
  password: z.string().min(1, 'Informe a senha.'),
  organizationName: z.string().trim().min(2, 'Informe o nome da empresa.').max(160),
  acceptTerms: z.unknown().optional(),
})

const TRIAL_DAYS = 14
// TRIAL_MINUTES (só no servidor, para testar o fim do teste sem esperar 14 dias): contas criadas enquanto estiver
// definida ganham um teste de N minutos. Apagar a variável volta para 14 dias; contas já criadas não mudam.
const trialMs = () => {
  const min = Number(process.env.TRIAL_MINUTES)
  return Number.isFinite(min) && min > 0 ? min * 60000 : TRIAL_DAYS * 86400000
}

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
  // origem da venda (campanha da visita, cookies do GA4/Meta e a escolha de cookies); nunca dado pessoal
  const attribution = attributionFrom(request.headers)

  const member = await db.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: { name: organizationName, displayName: organizationName, adminEmail: email, status: 'active', attribution: attribution ? JSON.stringify(attribution) : null },
    })
    if (plan) {
      const trialEnd = new Date(Date.now() + trialMs())
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
  // conversão "conta criada" para a Meta pelo servidor, com o mesmo event_id do dataLayer (nunca lança)
  const { em, externalId } = hashedContact(email, '', member.organizationId)
  await queueConversion('sign_up', signUpEventId(member.organizationId), member.organizationId, {
    eventTime: Math.floor(Date.now() / 1000), sourceUrl: pageUrl(request.headers.get('referer'), `${appUrl()}/login`), attribution, em, externalId,
  })

  await sendVerificationEmail({ id: member.id, name, email })

  // empresa interna (Admin › Medição): o navegador não manda o sign_up ao dataLayer; a fila também não envia
  const internal = await isInternalOrg(member.organizationId).catch(() => false)
  return NextResponse.json({ success: true, organizationId: member.organizationId, internal }, { status: 201 })
}
