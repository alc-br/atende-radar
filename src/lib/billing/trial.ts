import { db } from '@/lib/db'

// T11 · avisos de fim do teste grátis dentro do sistema: um quando faltam 3 dias ou menos e outro quando falta 1 dia ou
// menos. Cada aviso sai UMA vez por fim de teste (se o operador estender o teste, os avisos valem de novo para a data nova).
// O agendador interno chama a cada 15 min; os testes chamam POST /api/gateway/tick com { trialNoticesAt }.

const DAY = 86_400_000

export type TrialStage = '3d' | '1d'

/** Qual aviso cabe agora (o mais urgente), ou null. Fora do teste ou já vencido = null. */
export function trialStage(trialEnd: Date, now: Date): TrialStage | null {
  const left = trialEnd.getTime() - now.getTime()
  if (left <= 0) return null
  if (left <= DAY) return '1d'
  if (left <= 3 * DAY) return '3d'
  return null
}

function noticeText(stage: TrialStage, trialEnd: Date, now: Date) {
  const until = trialEnd.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  if (stage === '1d') {
    return {
      title: 'Seu teste grátis termina em menos de 1 dia',
      message: `O teste acaba em ${until}. Contrate um plano em Planos para continuar cadastrando sem interrupção.`,
    }
  }
  const days = Math.ceil((trialEnd.getTime() - now.getTime()) / DAY)
  return {
    title: `Seu teste grátis termina em ${days} dias`,
    message: `O teste acaba em ${until}. Escolha um plano em Planos para continuar usando o AtendeRadar.`,
  }
}

/** Cria os avisos devidos. Idempotente: confere se o aviso daquele estágio e daquele fim de teste já existe. */
export async function trialEndingNotices(now = new Date(), orgId?: string): Promise<number> {
  const demoOrg = process.env.DEMO_ORG_ID || 'org_seed_1'
  if (orgId === demoOrg) return 0
  const subs = await db.subscription.findMany({
    where: {
      status: 'trialing',
      trialEnd: { gt: now, lte: new Date(now.getTime() + 3 * DAY) },
      organization: { status: 'active', id: orgId ?? { not: demoOrg } },
    },
    select: { organizationId: true, trialEnd: true },
    take: 1000,
  })
  let created = 0
  for (const s of subs) {
    if (!s.trialEnd) continue
    const stage = trialStage(s.trialEnd, now)
    if (!stage) continue
    // a chave fica no campo data (JSON) da notificação, sempre com a mesma ordem de campos (comparação exata)
    const key = JSON.stringify({ kind: 'trial_ending', stage, trialEnd: s.trialEnd.toISOString() })
    const exists = await db.notification.findFirst({ where: { organizationId: s.organizationId, type: 'billing', data: key }, select: { id: true } })
    if (exists) continue
    const text = noticeText(stage, s.trialEnd, now)
    await db.notification.create({ data: { organizationId: s.organizationId, type: 'billing', ...text, data: key } })
    created++
  }
  return created
}
