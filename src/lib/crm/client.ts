import { useCallback, useEffect, useState } from 'react'
import { MUTATION_ERROR_MESSAGE } from '@/lib/mutation'
import type { activityDto, companyDto, dealDto, dealEventDto, personDto, pipelineDto } from './dto'

// Lado do navegador do CRM (docs/crm/04-api-crm.md). As telas usam só isto para falar com /api/crm/*: erro vira
// CrmApiError com o código estável da API, e as gravações levam Idempotency-Key (clique duplo não cria duas vezes).
// Não importa nada do servidor (db, Prisma): só tipos.

type Jsonify<T> = T extends Date ? string : T extends (infer U)[] ? Jsonify<U>[] : T extends object ? { [K in keyof T]: Jsonify<T[K]> } : T

export type CrmPerson = Jsonify<ReturnType<typeof personDto>>
export type CrmCompany = Jsonify<ReturnType<typeof companyDto>>
export type CrmDeal = Jsonify<ReturnType<typeof dealDto>>
export type CrmDealEvent = Jsonify<ReturnType<typeof dealEventDto>>
export type CrmActivity = Jsonify<ReturnType<typeof activityDto>>
export type CrmPipeline = Jsonify<ReturnType<typeof pipelineDto>>
export type CrmStage = CrmPipeline['stages'][number]

export type CrmErrorCode =
  | 'crm_disabled'
  | 'crm_forbidden'
  | 'crm_not_found'
  | 'crm_invalid'
  | 'crm_duplicate'
  | 'crm_version_conflict'
  | 'crm_invalid_transition'
  | 'crm_idempotency_mismatch'
  | 'crm_rate_limited'
  | 'crm_unavailable'

export class CrmApiError extends Error {
  readonly status: number
  readonly code: CrmErrorCode | null
  /** Corpo do erro (currentVersion, existingId, expired…). */
  readonly extra: Record<string, unknown>

  constructor(message: string, status: number, code: CrmErrorCode | null, extra: Record<string, unknown>) {
    super(message)
    this.name = 'CrmApiError'
    this.status = status
    this.code = code
    this.extra = extra
  }
}

async function toError(res: Response): Promise<CrmApiError> {
  let body: Record<string, unknown> = {}
  try {
    body = (await res.json()) as Record<string, unknown>
  } catch {
    // corpo vazio ou não-JSON
  }
  const message = typeof body.error === 'string' && body.error ? body.error : `HTTP ${res.status}`
  return new CrmApiError(message, res.status, (typeof body.code === 'string' ? body.code : null) as CrmErrorCode | null, body)
}

export async function crmGet<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, cache: 'no-store' })
  if (!res.ok) throw await toError(res)
  return (await res.json()) as T
}

/** Gravação (POST/PATCH/DELETE) em JSON. Criação manda Idempotency-Key: repetir o mesmo clique não duplica. */
export async function crmSend<T>(url: string, init: { method?: 'POST' | 'PATCH' | 'DELETE'; json?: unknown; idempotent?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (init.idempotent) headers['Idempotency-Key'] = newIdempotencyKey()
  const res = await fetch(url, { method: init.method ?? 'POST', headers, body: JSON.stringify(init.json ?? {}) })
  if (!res.ok) throw await toError(res)
  return (await res.json()) as T
}

/** Exportação: a resposta é o CSV (texto), não JSON. */
export async function crmDownload(url: string, json: unknown): Promise<{ blob: Blob; filename: string; truncated: boolean }> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(json) })
  if (!res.ok) throw await toError(res)
  const disposition = res.headers.get('content-disposition') ?? ''
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'atenderadar-crm.csv'
  return { blob: await res.blob(), filename, truncated: res.headers.get('x-crm-truncated') === 'true' }
}

export function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

/** Frase para o toast. As mensagens de validação do servidor já são em português e dizem o que corrigir. */
export function crmErrorMessage(e: unknown, fallback = MUTATION_ERROR_MESSAGE): string {
  if (!(e instanceof CrmApiError)) return fallback
  switch (e.code) {
    case 'crm_version_conflict':
      return 'Alguém alterou este registro enquanto você editava. A versão atual foi carregada: confira e tente novamente.'
    case 'crm_rate_limited':
      return 'Muitas ações seguidas. Aguarde um minuto e tente novamente.'
    case 'crm_disabled':
      return 'O CRM comercial está desligado nesta empresa.'
    case 'crm_not_found':
      return 'Registro não encontrado. Ele pode ter sido arquivado ou você não tem acesso a ele.'
    case 'crm_idempotency_mismatch':
      return fallback
    case 'crm_invalid':
    case 'crm_duplicate':
    case 'crm_invalid_transition':
    case 'crm_forbidden':
      return e.message
    default:
      return fallback
  }
}

export type CrmQuery<T> = {
  /** Dado do endereço atual (null enquanto o primeiro carregamento dele não volta). */
  data: T | null
  /** Erro da última leitura. Com `data` presente, foi o recarregamento que falhou: o dado anterior continua valendo. */
  error: CrmApiError | null
  /** true até a primeira resposta do endereço atual; recarregar (refetch) mantém o dado na tela. */
  loading: boolean
  refetch: () => void
}

/** Leitura com carregando / erro / recarregar. url null = não busca (ex.: falta o id). */
export function useCrmQuery<T>(url: string | null): CrmQuery<T> {
  const [state, setState] = useState<{ url: string | null; data: T | null; error: CrmApiError | null }>({ url: null, data: null, error: null })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!url) return
    const ctrl = new AbortController()
    crmGet<T>(url, ctrl.signal)
      .then((data) => setState({ url, data, error: null }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return
        const error = e instanceof CrmApiError ? e : new CrmApiError(MUTATION_ERROR_MESSAGE, 0, null, {})
        setState((s) => ({ url, data: s.url === url ? s.data : null, error }))
      })
    return () => ctrl.abort()
  }, [url, tick])

  const refetch = useCallback(() => setTick((t) => t + 1), [])
  const current = !!url && state.url === url
  return { data: current ? state.data : null, error: current ? state.error : null, loading: !!url && !current, refetch }
}
