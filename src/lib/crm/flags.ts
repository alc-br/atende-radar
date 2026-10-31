import { db } from '@/lib/db'

// Flags do CRM por empresa (docs/crm/04-api-crm.md). Resolvidas sempre no servidor; sem linha = desligada (D7).
// crm.enabled só o operador da plataforma liga (Admin). As outras o admin/gestor da empresa liga em Configurações › CRM,
// e só valem com crm.enabled ligada.
export const CRM_FLAGS = ['crm.enabled', 'crm.autoCreateDeals', 'crm.suggestStage', 'crm.notifications', 'crm.exports'] as const
export type CrmFlag = (typeof CRM_FLAGS)[number]
export const CRM_SUB_FLAGS = CRM_FLAGS.filter((f) => f !== 'crm.enabled') as Exclude<CrmFlag, 'crm.enabled'>[]
export type CrmSubFlag = (typeof CRM_SUB_FLAGS)[number]

export const isCrmFlag = (v: unknown): v is CrmFlag => typeof v === 'string' && (CRM_FLAGS as readonly string[]).includes(v)

/** Desliga o CRM em todas as empresas sem mexer no banco (CRM_DISABLED=1 no app.env do servidor). */
export const crmKilled = () => process.env.CRM_DISABLED === '1'

export async function crmEnabled(orgId: string): Promise<boolean> {
  if (crmKilled()) return false
  const row = await db.crmFeatureState.findUnique({
    where: { organizationId_flag: { organizationId: orgId, flag: 'crm.enabled' } },
    select: { enabled: true },
  })
  return !!row?.enabled
}

export async function crmFlags(orgId: string): Promise<Record<CrmFlag, boolean>> {
  const out = Object.fromEntries(CRM_FLAGS.map((f) => [f, false])) as Record<CrmFlag, boolean>
  if (crmKilled()) return out
  const rows = await db.crmFeatureState.findMany({ where: { organizationId: orgId }, select: { flag: true, enabled: true } })
  for (const r of rows) if (isCrmFlag(r.flag)) out[r.flag] = r.enabled
  if (!out['crm.enabled']) for (const f of CRM_SUB_FLAGS) out[f] = false
  return out
}

/** Forma usada em /api/me e nas telas: { enabled, flags: { autoCreateDeals, ... } }. */
export async function crmMe(orgId: string) {
  const f = await crmFlags(orgId)
  return {
    enabled: f['crm.enabled'],
    flags: {
      autoCreateDeals: f['crm.autoCreateDeals'],
      suggestStage: f['crm.suggestStage'],
      notifications: f['crm.notifications'],
      exports: f['crm.exports'],
    },
  }
}

export async function setCrmFlag(orgId: string, flag: CrmFlag, enabled: boolean, updatedBy: string, source: 'manual' | 'platform' | 'plan' = 'manual') {
  return db.crmFeatureState.upsert({
    where: { organizationId_flag: { organizationId: orgId, flag } },
    create: { organizationId: orgId, flag, enabled, source, updatedBy },
    update: { enabled, source, updatedBy },
  })
}
