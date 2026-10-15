import { toast } from 'sonner'

// Ações do usuário (POST/PATCH/PUT/DELETE) disparadas pelas telas.
// Antes, o padrão era `fetch(...).then(recarrega).catch(() => {})`: erro de rede
// sumia e resposta 4xx/5xx contava como sucesso. Aqui a falha vira toast e a
// lista é recarregada de qualquer jeito, para a tela mostrar o estado real.
// Só para uso em componentes do navegador.

export const MUTATION_ERROR_MESSAGE = 'Não foi possível concluir a ação. Tente novamente.'

export class MutationError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'MutationError'
    this.status = status
  }
}

export type MutationInit = Omit<RequestInit, 'body'> & {
  /** Corpo enviado como JSON (já define o Content-Type). */
  json?: unknown
  body?: RequestInit['body']
}

/** fetch que lança erro em falha de rede ou resposta não-ok (usa o campo `error` do JSON, se houver). */
export async function fetchMutation(url: string, init: MutationInit = {}): Promise<Response> {
  const { json, headers, ...rest } = init
  const res = await fetch(url, {
    method: 'POST',
    ...rest,
    ...(json !== undefined
      ? { body: JSON.stringify(json), headers: { 'Content-Type': 'application/json', ...headers } }
      : { headers }),
  })
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const data = (await res.json()) as { error?: unknown }
      if (typeof data?.error === 'string' && data.error) message = data.error
    } catch {
      // corpo vazio ou não-JSON: fica o status
    }
    throw new MutationError(message, res.status)
  }
  return res
}

export type RunMutationOptions = {
  /** Chamado sempre ao final (sucesso ou falha), normalmente para recarregar a lista. */
  onSettled?: () => unknown
  /** Texto do toast de erro. */
  errorMessage?: string
}

/** Roda uma ou mais mutações; em falha mostra toast de erro. Retorna true se tudo deu certo. */
export async function runMutation(action: () => Promise<unknown>, options: RunMutationOptions = {}): Promise<boolean> {
  const { onSettled, errorMessage = MUTATION_ERROR_MESSAGE } = options
  let ok = true
  try {
    await action()
  } catch (e) {
    ok = false
    console.warn('[mutation] falhou:', e)
    toast.error(errorMessage)
  }
  try {
    await onSettled?.()
  } catch {
    // o recarregamento tem seu próprio tratamento
  }
  return ok
}

/** Atalho para uma única requisição: `mutate(url, { method, json }, { onSettled: fetchData })`. */
export function mutate(url: string, init: MutationInit = {}, options: RunMutationOptions = {}): Promise<boolean> {
  return runMutation(() => fetchMutation(url, init), options)
}
