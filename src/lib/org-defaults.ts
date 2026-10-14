import type { Prisma } from '@prisma/client'
import { DEFAULT_ALERT_RULES, DEFAULT_REPORT_DEFINITIONS } from './org-defaults-data'

/** Nomes das regras que toda empresa recebe ao nascer (não contam na cota do plano). */
export const DEFAULT_RULE_NAMES: string[] = DEFAULT_ALERT_RULES.map((r) => r.name)

/**
 * Configuração padrão de uma organização recém-criada: as 8 regras de alerta e os 8 relatórios
 * do produto (src/lib/org-defaults-data.ts), com o e-mail do dono como destinatário.
 * Sem isto o cliente novo teria alertas e relatórios vazios.
 */
export async function createOrganizationDefaults(tx: Prisma.TransactionClient, orgId: string, ownerEmail: string) {
  const recipients = JSON.stringify([ownerEmail])

  await tx.alertRule.createMany({
    // O motor atual é por regras de palavras (confiança máx. ~0,75): limites acima disso silenciariam os alertas.
    data: DEFAULT_ALERT_RULES.map((r) => ({ ...r, organizationId: orgId, recipients, minConfidence: Math.min(r.minConfidence, 0.5) })),
  })

  await tx.reportDefinition.createMany({
    data: DEFAULT_REPORT_DEFINITIONS.map((d) => ({ ...d, organizationId: orgId, recipients, lastRunAt: null })),
  })
}
