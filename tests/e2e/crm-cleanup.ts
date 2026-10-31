import { test } from '@playwright/test'
import { testDb } from './db'

/**
 * No fim do arquivo, desliga o CRM das empresas que o arquivo ligou. O tick global (`/api/gateway/tick` sem empresa)
 * captura toda empresa com o CRM ligado, e as empresas de teste que ficam ligadas deixam mais lentos os arquivos que
 * esperam por esse tick depois (NFS-e, SLA). Só com um worker, como no `playwright.config.ts`: aí nenhum outro arquivo
 * roda ao mesmo tempo e tudo o que foi ligado desde o início do arquivo é dele.
 */
export function crmOffAfterFile() {
  let since = new Date()
  test.beforeAll(() => {
    since = new Date()
  })
  test.afterAll(async () => {
    if (test.info().config.workers !== 1) return
    await testDb.crmFeatureState.updateMany({ where: { flag: 'crm.enabled', enabled: true, updatedAt: { gte: since } }, data: { enabled: false } })
  })
}
