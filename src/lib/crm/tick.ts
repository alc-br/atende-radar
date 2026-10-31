import { db } from '@/lib/db'
import { captureOrg } from './capture'
import { crmKilled } from './flags'
import { processCrmOutbox } from './worker'
import './consumer' // a fila roda neste pacote (rota do tick): o consumidor precisa estar registrado

// Passo do CRM no POST /api/gateway/tick (testes e agendador externo): captura e fila agora, sem esperar o agendador.
// Mesmas funções do agendador; a idempotência do evento e a reserva da fila deixam rodar junto com ele.
export async function crmTick(organizationId?: string) {
  if (crmKilled()) return null
  const orgs = await db.crmFeatureState.findMany({
    where: { flag: 'crm.enabled', enabled: true, ...(organizationId ? { organizationId } : {}) },
    select: { organizationId: true },
  })
  const out = { organizations: orgs.length, emitted: 0, processed: 0, retry: 0, dead: 0 }
  if (!orgs.length) return out
  for (const o of orgs) out.emitted += (await captureOrg(o.organizationId)).emitted
  // evento gera evento (negócio criado → sugestão): algumas rodadas até a fila ficar sem nada vencido
  for (let i = 0; i < 20; i++) {
    const s = await processCrmOutbox(organizationId ? { organizationId } : {})
    out.processed += s.processed
    out.retry += s.retry
    out.dead += s.dead
    if (!s.processed && !s.retry && !s.dead) break
  }
  return out
}
