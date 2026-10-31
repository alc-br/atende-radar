import { audit } from '@/lib/audit'
import { crmCatch, crmGuard, crmJson, crmNotFound, parseBody } from '@/lib/crm/http'
import { kickCrmOutbox, retryDeadEvent } from '@/lib/crm/worker'
import '@/lib/crm/consumer' // o "chute" da fila roda neste pacote: o consumidor precisa estar registrado
import { z } from 'zod'

const empty = z.object({}).strict()

// Reprocessa um evento parado na DLQ (só admin; o gestor só vê o estado). Volta para a fila com as tentativas zeradas.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await crmGuard('crm.sync.retry', { mutation: true })
  if (!g.ok) return g.res
  const { ctx } = g
  const b = await parseBody(request, empty, ctx)
  if (!b.ok) return b.res
  const { id } = await params
  try {
    if (!(await retryDeadEvent(ctx.auth.orgId, id))) return crmNotFound(ctx, 'Evento')
    await audit(ctx.auth, { action: 'crm.dlq_retried', targetType: 'crm_outbox_event', targetId: id })
    kickCrmOutbox()
    return crmJson({ id, status: 'pending' }, ctx.requestId)
  } catch (e) {
    return crmCatch(e, ctx)
  }
}
