import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import type { z } from 'zod'
import { Prisma } from '@prisma/client'
import { guard, type AuthContext } from '@/lib/api-auth'
import type { Permission } from '@/lib/permissions'
import { allow } from '@/lib/rate-limit'
import { readJson } from '@/lib/json-body'
import { DomainError } from './deals'
import { crmEnabled } from './flags'

// Porta e respostas das rotas /api/crm/* (docs/crm/04-api-crm.md). Erro sempre { error, code, requestId }, em
// português, sem stack, SQL, ID externo ou dado pessoal. O requestId também vai no cabeçalho x-request-id.

export type CrmErrorCode =
  | 'crm_invalid' | 'crm_disabled' | 'crm_not_found' | 'crm_forbidden' | 'crm_version_conflict' | 'crm_duplicate'
  | 'crm_invalid_transition' | 'crm_idempotency_mismatch' | 'crm_rate_limited' | 'crm_unavailable'

export interface CrmCtx {
  auth: AuthContext
  requestId: string
}

export type CrmGuard = { ok: true; ctx: CrmCtx } | { ok: false; res: NextResponse }

export const newRequestId = () => crypto.randomUUID()

export function crmError(status: number, code: CrmErrorCode, error: string, requestId: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return NextResponse.json({ error, code, requestId, ...extra }, { status, headers: { 'x-request-id': requestId, ...headers } })
}

export function crmJson(body: unknown, requestId: string, status = 200) {
  return NextResponse.json(body, { status, headers: { 'x-request-id': requestId } })
}

export const crmNotFound = (ctx: CrmCtx, what = 'Registro') => crmError(404, 'crm_not_found', `${what} não encontrado.`, ctx.requestId)
export const crmForbidden = (ctx: CrmCtx, msg = 'Você não pode alterar este registro.') => crmError(403, 'crm_forbidden', msg, ctx.requestId)
export const crmConflict = (ctx: CrmCtx, current: { version: number }) =>
  crmError(409, 'crm_version_conflict', 'Este registro foi alterado por outra pessoa. Recarregue e tente de novo.', ctx.requestId, { currentVersion: current.version })

const MUTATION_LIMIT = 120 // por membro por minuto
const HEAVY_LIMIT = 10 // importação, exportação e mescla

/**
 * Entrada das rotas /api/crm/*: guard() (sessão, membro ativo, papel do banco, bloqueio de assinatura), depois a flag
 * crm.enabled da empresa (desligada = 404, igual a rota inexistente) e o limite de taxa das mutações.
 */
export async function crmGuard(permission: Permission, opts: { mutation?: boolean; heavy?: boolean } = {}): Promise<CrmGuard> {
  const requestId = newRequestId()
  const g = await guard(permission)
  if (!g.ok) {
    g.res.headers.set('x-request-id', requestId)
    return g
  }
  if (!(await crmEnabled(g.auth.orgId))) {
    return { ok: false, res: crmError(404, 'crm_disabled', 'O CRM não está ativo para esta empresa.', requestId) }
  }
  if (opts.mutation || opts.heavy) {
    const heavy = !!opts.heavy
    if (!allow(`crm:${heavy ? 'heavy' : 'mut'}:${g.auth.memberId}`, heavy ? HEAVY_LIMIT : MUTATION_LIMIT, 60_000)) {
      return { ok: false, res: crmError(429, 'crm_rate_limited', 'Muitas ações seguidas. Aguarde um minuto e tente de novo.', requestId, {}, { 'Retry-After': '60' }) }
    }
  }
  return { ok: true, ctx: { auth: g.auth, requestId } }
}

/** Mensagem da primeira falha do zod, em português. Campo desconhecido (strict) vira "Campo não permitido: x". */
export function zodMessage(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Dados inválidos.'
  if (issue.code === 'unrecognized_keys') return `Campo não permitido: ${issue.keys.join(', ')}.`
  // mensagens escritas nos schemas já dizem o campo; as padrão do zod (em inglês) viram "Campo inválido: caminho"
  if (!/^(Invalid|Too |Unrecognized|Expected|Required)/.test(issue.message)) return issue.message
  return `Campo inválido: ${issue.path.join('.') || 'corpo'}.`
}

/**
 * Lê e valida o corpo JSON. Uso: `const b = await parseBody(request, Schema, ctx); if (!b.ok) return b.res`.
 * Toda mutação do CRM passa por aqui, mesmo sem campos (`{}`): exigir application/json barra o POST de formulário de
 * outro site (CSRF), que não consegue mandar esse tipo sem preflight de CORS.
 */
export async function parseBody<S extends z.ZodType>(request: Request, schema: S, ctx: CrmCtx): Promise<{ ok: true; data: z.output<S> } | { ok: false; res: NextResponse }> {
  if (!/^application\/json\b/i.test(request.headers.get('content-type') ?? '')) {
    return { ok: false, res: crmError(415, 'crm_invalid', 'Envie os dados em JSON.', ctx.requestId) }
  }
  const j = await readJson(request)
  if (!j.ok) {
    j.res.headers.set('x-request-id', ctx.requestId)
    return j
  }
  const parsed = schema.safeParse(j.body)
  if (!parsed.success) return { ok: false, res: crmError(400, 'crm_invalid', zodMessage(parsed.error), ctx.requestId) }
  return { ok: true, data: parsed.data }
}

/**
 * Erro lançado no domínio → resposta da API. DomainError leva status, código e mensagem prontos; chave única ocupada
 * (corrida entre duas criações) vira 409 crm_duplicate; o resto vira 500 genérico. O log leva só o tipo e o código do
 * erro com o requestId: mensagem do Prisma pode citar valores da consulta (telefone, e-mail).
 */
export function crmCatch(e: unknown, ctx: CrmCtx): NextResponse {
  if (e instanceof DomainError) return crmError(e.status, e.code, e.message, ctx.requestId, e.extra)
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    return crmError(409, 'crm_duplicate', 'Este registro já existe. Recarregue e confira.', ctx.requestId)
  }
  const code = e instanceof Prisma.PrismaClientKnownRequestError ? e.code : ''
  console.error(`[crm] ${ctx.requestId} ${e instanceof Error ? e.name : 'erro'} ${code}`.trim())
  return crmError(500, 'crm_unavailable', 'Não foi possível concluir agora. Tente novamente em instantes.', ctx.requestId)
}

/** Valida a query string com um schema zod (filtros e ordenação de listas fechadas). */
export function parseQuery<S extends z.ZodType>(url: URL, schema: S, ctx: CrmCtx): { ok: true; data: z.output<S> } | { ok: false; res: NextResponse } {
  const raw: Record<string, string> = {}
  for (const [k, v] of url.searchParams) raw[k] = v
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return { ok: false, res: crmError(400, 'crm_invalid', zodMessage(parsed.error), ctx.requestId) }
  return { ok: true, data: parsed.data }
}
