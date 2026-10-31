import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { crmError, type CrmCtx } from './http'

// Idempotency-Key nos POST que criam algo (docs/crm/04-api-crm.md): a mesma chave com o mesmo corpo devolve a resposta
// guardada, sem repetir o efeito; com outro corpo, 422. A chave é reservada ANTES de rodar (status 0), então duas
// requisições simultâneas com a mesma chave não criam duas vezes: a segunda recebe 409 até a primeira terminar.
// Só respostas 2xx ficam guardadas; erro libera a chave para nova tentativa. Vencem em 24 h.

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000

const hashBody = (route: string, body: unknown) => crypto.createHash('sha256').update(`${route}\n${JSON.stringify(body ?? null)}`).digest('hex')
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'

/** Chave do cabeçalho, validada (8 a 128 caracteres seguros). Ausente = null; inválida = 'invalid'. */
export function idempotencyKey(request: Request): string | null | 'invalid' {
  const k = request.headers.get('idempotency-key')
  if (k === null) return null
  return /^[A-Za-z0-9_.:-]{8,128}$/.test(k) ? k : 'invalid'
}

/**
 * Roda `run` uma vez por chave (sem chave, só roda). `run` devolve { status, body }. Uso:
 *   return withIdempotency(request, ctx, 'deals.create', data, () => createDeal(ctx, data))
 */
export async function withIdempotency(
  request: Request,
  ctx: CrmCtx,
  route: string,
  body: unknown,
  run: () => Promise<{ status: number; body: unknown }>,
): Promise<NextResponse> {
  const send = (status: number, payload: unknown, replay = false) =>
    NextResponse.json(payload, { status, headers: { 'x-request-id': ctx.requestId, ...(replay ? { 'idempotent-replay': 'true' } : {}) } })
  const key = idempotencyKey(request)
  if (key === 'invalid') return crmError(400, 'crm_invalid', 'Cabeçalho Idempotency-Key inválido (8 a 128 letras, números, _ . : -).', ctx.requestId)
  if (key === null) {
    const r = await run()
    return send(r.status, r.body)
  }

  const { orgId, memberId } = ctx.auth
  const where = { organizationId_memberId_key: { organizationId: orgId, memberId, key } }
  const requestHash = hashBody(route, body)
  const old = await db.crmIdempotencyKey.findUnique({ where })
  if (old && Date.now() - old.createdAt.getTime() >= IDEMPOTENCY_TTL_MS) await db.crmIdempotencyKey.delete({ where }).catch(() => {})

  let reserved: { id: string }
  try {
    reserved = await db.crmIdempotencyKey.create({
      data: { organizationId: orgId, memberId, key, route, requestHash, status: 0, responseJson: 'null' },
      select: { id: true },
    })
  } catch (e) {
    if (!isUnique(e)) throw e
    const found = await db.crmIdempotencyKey.findUnique({ where })
    if (!found) return crmError(409, 'crm_invalid_transition', 'Requisição repetida em andamento. Tente novamente em instantes.', ctx.requestId)
    if (found.requestHash !== requestHash) {
      return crmError(422, 'crm_idempotency_mismatch', 'Esta chave de idempotência já foi usada com outro conteúdo.', ctx.requestId)
    }
    if (found.status === 0) return crmError(409, 'crm_invalid_transition', 'Requisição repetida em andamento. Tente novamente em instantes.', ctx.requestId)
    return send(found.status, JSON.parse(found.responseJson), true)
  }

  let r: { status: number; body: unknown }
  try {
    r = await run()
  } catch (e) {
    await db.crmIdempotencyKey.delete({ where: { id: reserved.id } }).catch(() => {})
    throw e
  }
  if (r.status >= 200 && r.status < 300) {
    await db.crmIdempotencyKey.update({ where: { id: reserved.id }, data: { status: r.status, responseJson: JSON.stringify(r.body) } })
  } else {
    await db.crmIdempotencyKey.delete({ where: { id: reserved.id } }).catch(() => {})
  }
  return send(r.status, r.body)
}
