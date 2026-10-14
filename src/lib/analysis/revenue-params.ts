import { db } from '../db'
import { revenueSettings } from './opportunity'

// Configurações › Financeiro, como o cálculo de valor em risco usa cada campo (P2):
//  · avgTicket / convRate: ticket médio inicial e taxa de conversão (revenueSettings).
//  · minSample ("Amostra mínima", padrão 5): com pelo menos N vendas confirmadas (oportunidades marcadas como ganhas com
//    valor), o ticket passa a ser a MÉDIA dessas vendas; antes disso vale o ticket informado. 0 = sempre o informado.
//  · opportunityCeiling ("Teto por oportunidade"): nenhuma oportunidade é estimada acima dele. Vazio ou 0 = sem teto.
//  · showEstimates ("Exibir estimativas de valor nas conversas", padrão ligado): desligado, as telas de Conversas não
//    mostram valor estimado (o motor continua calculando para relatórios e painel).

export type TicketSource = 'org_setting' | 'confirmed_sales'

export interface RevenueParams {
  avgTicket: number
  conversionRate: number
  ceiling: number | null
  ticketSource: TicketSource
  minSample: number
  salesSample: number // vendas confirmadas encontradas
  showEstimates: boolean
}

const DEFAULT_MIN_SAMPLE = 5

export function financialSettings(settings: Record<string, unknown> | null | undefined) {
  const ms = Number(settings?.minSample)
  const minSample = settings?.minSample === undefined || settings?.minSample === '' || !Number.isFinite(ms) || ms < 0 ? DEFAULT_MIN_SAMPLE : Math.floor(ms)
  const c = Number(settings?.opportunityCeiling)
  const ceiling = Number.isFinite(c) && c > 0 ? c : null
  return { minSample, ceiling, showEstimates: settings?.showEstimates !== false }
}

/** Parâmetros do cálculo de valor em risco da empresa (mesma leitura no motor e na tela "Como calculamos"). */
export async function revenueParams(orgId: string, settings: Record<string, unknown> | null | undefined): Promise<RevenueParams> {
  const base = revenueSettings(settings as { avgTicket?: unknown; convRate?: unknown })
  const fin = financialSettings(settings)
  let avgTicket = base.avgTicket
  let ticketSource: TicketSource = 'org_setting'
  let salesSample = 0
  if (fin.minSample > 0) {
    const sales = await db.revenueOpportunity.aggregate({
      where: { status: 'won', confirmedSaleValue: { gt: 0 }, conversation: { organizationId: orgId } },
      _count: { _all: true },
      _avg: { confirmedSaleValue: true },
    })
    salesSample = sales._count._all
    if (salesSample >= fin.minSample && sales._avg.confirmedSaleValue) {
      avgTicket = Math.round(sales._avg.confirmedSaleValue)
      ticketSource = 'confirmed_sales'
    }
  }
  return { avgTicket, conversionRate: base.conversionRate, ceiling: fin.ceiling, ticketSource, minSample: fin.minSample, salesSample, showEstimates: fin.showEstimates }
}
