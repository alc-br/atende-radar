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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, organizationId, ...rest } = r
      return { ...rest, organizationId: orgId, recipients }
    }),
  })

  await tx.reportDefinition.createMany({
    data: reportDefinitions.map((d) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, organizationId, lastRunAt, ...rest } = d
      return { ...rest, organizationId: orgId, recipients, lastRunAt: null }
    }),
  })
}
