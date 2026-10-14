import { NextResponse } from 'next/server'

/**
 * Limite do corpo das rotas de API que recebem JSON. Os maiores corpos JSON legítimos (eventos do gateway, com texto
 * até 20 mil caracteres; avisos do Pagar.me) têm poucos KB. O único envio de arquivo (captura de tela do suporte,
 * POST /api/support) é multipart e tem limite próprio em src/lib/support.ts.
 */
export const MAX_JSON_BYTES = 5 * 1024 * 1024

export type JsonBody<T> = { ok: true; body: T } | { ok: false; res: NextResponse }

const invalid = () => NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
const tooLarge = () => NextResponse.json({ error: 'Corpo da requisição grande demais (máximo 5 MB)' }, { status: 413 })

/** Lê o corpo contando os bytes de verdade (o Content-Length pode faltar ou mentir). null = passou do limite. */
async function readLimited(request: Request): Promise<string | null> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let size = 0
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_JSON_BYTES) {
      await reader.cancel().catch(() => {})
      return null
    }
    text += decoder.decode(value, { stream: true })
  }
  return text + decoder.decode()
}

/**
 * Lê o corpo JSON da requisição. Corpo malformado ou que não é um objeto → 400 { error: 'JSON inválido' };
 * acima de 5 MB → 413. Uso: `const j = await readJson(request); if (!j.ok) return j.res`.
 * `optional: true`: corpo vazio (ou `null`) vira `body: null` em vez de 400 — para rotas em que o corpo é opcional.
 * O tipo padrão é `any`, igual ao de `request.json()`, para não mudar a checagem das rotas que já existiam.
 */
export async function readJson<T = any>(request: Request): Promise<JsonBody<T>>
export async function readJson<T = any>(request: Request, opts: { optional: true }): Promise<JsonBody<T | null>>
export async function readJson<T = any>(request: Request, opts?: { optional?: boolean }): Promise<JsonBody<T | null>> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) return { ok: false, res: tooLarge() }

  let text: string | null
  try {
    text = await readLimited(request)
  } catch {
    return { ok: false, res: invalid() }
  }
  if (text === null) return { ok: false, res: tooLarge() }

  if (!text.trim()) return opts?.optional ? { ok: true, body: null } : { ok: false, res: invalid() }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, res: invalid() }
  }
  if (parsed === null && opts?.optional) return { ok: true, body: null }
  // Todas as rotas esperam um objeto; `null`, número ou texto soltos quebrariam a desestruturação (viraria 500).
  if (typeof parsed !== 'object' || parsed === null) return { ok: false, res: invalid() }
  return { ok: true, body: parsed as T }
}
