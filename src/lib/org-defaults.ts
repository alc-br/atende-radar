import type { Prisma } from '@prisma/client'
import { alertRules, reportDefinitions } from './seed-data'

/**
 * Configuração padrão de uma organização recém-criada: as 8 regras de alerta e os 8 relatórios
 * do produto, com o e-mail do dono como destinatário. Sem isto o cliente novo teria alertas e relatórios vazios.
 */
export async function createOrganizationDefaults(tx: Prisma.TransactionClient, orgId: string, ownerEmail: string) {
  const recipients = JSON.stringify([ownerEmail])

  await tx.alertRule.createMany({
    data: alertRules.map((r) => {
      const { id, organizationId, ...rest } = r
      // O motor atual é por regras de palavras (confiança máx. ~0,75): limites acima disso silenciariam os alertas.
      return { ...rest, organizationId: orgId, recipients, minConfidence: Math.min(rest.minConfidence, 0.5) }
    }),
  })

  await tx.reportDefinition.createMany({
    data: reportDefinitions.map((d) => {
      const { id, organizationId, lastRunAt, ...rest } = d
      return { ...rest, organizationId: orgId, recipients, lastRunAt: null }
    }),
  })
}
