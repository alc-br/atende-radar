import { db } from '@/lib/db'
import { REAL_ORGS, isIsolatedOrg } from '@/lib/sandbox'
import { billingEmail, leftText, trialEmail, whenText } from './emails'

// T11 · avisos de fim do teste grátis (no sino e por e-mail aos administradores): faltando 3 dias, 1 dia, o ÚLTIMO
// aviso faltando 6 horas e, depois, "o teste terminou" (este só até 7 dias depois do fim). Cada aviso sai UMA vez por
// fim de teste (se o operador estender o teste, os avisos valem de novo para a data nova) e só o mais urgente que
// couber: quem entra faltando 5 horas recebe só o último aviso. Quem já contratou (assinatura no provedor ou situação
// diferente de "trialing") não recebe nada.
// Teste curto (TRIAL_MINUTES, menos de 1 dia): os marcos viram frações da duração (60%, 40% e 20% restantes), para dar
// para ver a sequência inteira num teste de 10 minutos.
// O agendador interno chama a cada minuto; os testes chamam POST /api/gateway/tick com { trialNoticesAt }.

const DAY = 86_400_000
const HOUR = 3_600_000
const ENDED_WINDOW = 7 * DAY

export type TrialStage = '3d' | '1d' | '6h' | 'ended'

/** Marcos (tempo restante) de cada aviso antes do fim, conforme a duração do teste. */
function thresholds(lengthMs: number | null) {
  if (lengthMs !== null && lengthMs > 0 && lengthMs < DAY) return { '3d': 0.6 * lengthMs, '1d': 0.4 * lengthMs, '6h': 0.2 * lengthMs }
  return { '3d': 3 * DAY, '1d': DAY, '6h': 6 * HOUR }
}

/** Qual aviso cabe agora (o mais urgente), ou null. trialStart serve só para o teste curto. */
export function trialStage(trialEnd: Date, now: Date, trialStart?: Date | null): TrialStage | null {
  const left = trialEnd.getTime() - now.getTime()
  if (left <= 0) return -left <= ENDED_WINDOW ? 'ended' : null
  const t = thresholds(trialStart ? trialEnd.getTime() - trialStart.getTime() : null)
  if (left <= t['6h']) return '6h'
  if (left <= t['1d']) return '1d'
  if (left <= t['3d']) return '3d'
  return null
}

function noticeText(stage: TrialStage, trialEnd: Date, now: Date, short: boolean) {
  const until = whenText(trialEnd)
  const left = trialEnd.getTime() - now.getTime()
  if (stage === 'ended') {
    return {
      title: 'Seu teste grátis terminou',
      message: `O teste acabou em ${until}. O painel fica bloqueado até a contratação de um plano; seus dados continuam guardados.`,
    }
  }
  if (stage === '6h') {
    return {
      title: `Último aviso: seu teste grátis termina em ${leftText(left)}`,
      message: `O teste acaba em ${until}. Contrate um plano em Planos para não perder o acesso aos alertas.`,
    }
  }
  if (stage === '1d') {
    return {
      title: short ? `Seu teste grátis termina em ${leftText(left)}` : 'Seu teste grátis termina em menos de 1 dia',
      message: `O teste acaba em ${until}. Contrate um plano em Planos para continuar sem interrupção.`,
    }
  }
  return {
    title: short ? `Seu teste grátis termina em ${leftText(left)}` : `Seu teste grátis termina em ${Math.ceil(left / DAY)} dias`,
    message: `O teste acaba em ${until}. Escolha um plano em Planos para continuar usando o AtendeRadar.`,
  }
}

/** Cria os avisos devidos (sino + e-mail). Idempotente: confere se o aviso daquele estágio e daquele fim já existe. */
export async function trialEndingNotices(now = new Date(), orgId?: string): Promise<number> {
  if (orgId && (await isIsolatedOrg(orgId))) return 0 // demonstração e simulação não recebem aviso de fim de teste
  const subs = await db.subscription.findMany({
    where: {
      status: 'trialing',
      providerSubscriptionId: null,
      trialEnd: { gt: new Date(now.getTime() - ENDED_WINDOW), lte: new Date(now.getTime() + 3 * DAY) },
      organization: { status: 'active', ...REAL_ORGS(), ...(orgId ? { id: orgId } : {}) },
    },
    select: { organizationId: true, trialEnd: true, createdAt: true },
    take: 1000,
  })
  let created = 0
  for (const s of subs) {
    if (!s.trialEnd) continue
    const stage = trialStage(s.trialEnd, now, s.createdAt)
    if (!stage) continue
    // a chave fica no campo data (JSON) da notificação, sempre com a mesma ordem de campos (comparação exata)
    const key = JSON.stringify({ kind: 'trial_ending', stage, trialEnd: s.trialEnd.toISOString() })
    const exists = await db.notification.findFirst({ where: { organizationId: s.organizationId, type: 'billing', data: key }, select: { id: true } })
    if (exists) continue
    const short = s.trialEnd.getTime() - s.createdAt.getTime() < DAY
    const text = noticeText(stage, s.trialEnd, now, short)
    await db.notification.create({ data: { organizationId: s.organizationId, type: 'billing', ...text, data: key } })
    await billingEmail(s.organizationId, `trial_${stage}`, s.trialEnd.toISOString(), trialEmail(`trial_${stage}`, s.trialEnd, now))
    created++
  }
  return created
}
