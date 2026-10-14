// Chamados de suporte ("Falar com o suporte" da central de ajuda). Regras puras aqui; as rotas ficam em
// src/app/api/support e src/app/api/admin/support.

/** Captura de tela: até 2 MB. */
export const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024
/** Corpo inteiro do formulário (captura + textos + cabeçalhos do multipart). Acima disto nem é lido. */
export const MAX_SUPPORT_BODY_BYTES = MAX_SCREENSHOT_BYTES + 512 * 1024
/** Chamados por membro por hora. */
export const SUPPORT_RATE_LIMIT = 5
export const SUPPORT_RATE_WINDOW_MS = 60 * 60_000

export const SUBJECT_MIN = 3
export const SUBJECT_MAX = 150
export const MESSAGE_MIN = 10
export const MESSAGE_MAX = 5000

export type ScreenshotType = 'image/png' | 'image/jpeg' | 'image/webp'

/**
 * Tipo REAL da imagem pelos primeiros bytes (assinatura do arquivo), não pelo nome nem pelo tipo que o navegador
 * declarou: um .txt renomeado para .png é recusado. null = não é png, jpg nem webp.
 */
export function sniffImageType(bytes: Uint8Array): ScreenshotType | null {
  const b = bytes
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to))
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  return null
}

export type SupportInput = { subject: string; message: string; screen: string | null; appVersion: string | null }

const clean = (v: FormDataEntryValue | null, max: number) => (typeof v === 'string' ? v.replace(/\s+$/g, '').trim().slice(0, max) : '')

/** Valida os campos de texto do formulário. Devolve a mensagem de erro (em linguagem simples) ou os dados limpos. */
export function parseSupportFields(form: FormData): { ok: true; data: SupportInput } | { ok: false; error: string } {
  const subject = clean(form.get('subject'), SUBJECT_MAX + 1)
  const message = clean(form.get('message'), MESSAGE_MAX + 1)
  if (subject.length < SUBJECT_MIN) return { ok: false, error: `Escreva o assunto (pelo menos ${SUBJECT_MIN} letras).` }
  if (subject.length > SUBJECT_MAX) return { ok: false, error: `O assunto pode ter até ${SUBJECT_MAX} caracteres.` }
  if (message.length < MESSAGE_MIN) return { ok: false, error: `Conte um pouco mais na mensagem (pelo menos ${MESSAGE_MIN} letras).` }
  if (message.length > MESSAGE_MAX) return { ok: false, error: `A mensagem pode ter até ${MESSAGE_MAX} caracteres.` }
  const screen = clean(form.get('screen'), 60) || null
  const appVersion = clean(form.get('appVersion'), 40) || null
  return { ok: true, data: { subject, message, screen, appVersion } }
}

/** Confere a captura de tela anexada (opcional). Campo vazio ou arquivo de 0 bytes = sem captura. */
export async function parseScreenshot(
  entry: FormDataEntryValue | null,
): Promise<{ ok: true; file: { bytes: Uint8Array<ArrayBuffer>; type: ScreenshotType; size: number } | null } | { ok: false; error: string }> {
  if (entry === null || typeof entry === 'string') return { ok: true, file: null }
  if (entry.size === 0) return { ok: true, file: null }
  if (entry.size > MAX_SCREENSHOT_BYTES) return { ok: false, error: 'A imagem passa de 2 MB. Envie uma captura menor.' }
  const bytes = new Uint8Array(await entry.arrayBuffer())
  if (bytes.byteLength > MAX_SCREENSHOT_BYTES) return { ok: false, error: 'A imagem passa de 2 MB. Envie uma captura menor.' }
  const type = sniffImageType(bytes)
  if (!type) return { ok: false, error: 'Envie a captura em PNG, JPG ou WEBP.' }
  return { ok: true, file: { bytes, type, size: bytes.byteLength } }
}

/** Lê o corpo contando os bytes (o Content-Length pode faltar). null = passou do limite. */
export async function readBodyLimited(request: Request, max = MAX_SUPPORT_BODY_BYTES): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > max) return null
  if (!request.body) return new Uint8Array(0)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.byteLength
  }
  return out
}

/** Chamado sem a imagem (a imagem só sai pela rota autenticada do operador). */
export function publicTicket(t: {
  id: string; subject: string; message: string; status: string; screen: string | null; appVersion: string | null
  screenshotType: string | null; screenshotSize: number | null; createdAt: Date; resolvedAt: Date | null
}) {
  return {
    id: t.id,
    subject: t.subject,
    message: t.message,
    status: t.status,
    screen: t.screen,
    appVersion: t.appVersion,
    hasScreenshot: !!t.screenshotType,
    screenshotSize: t.screenshotSize,
    createdAt: t.createdAt.toISOString(),
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
  }
}

/** Campos lidos do banco para listar (nunca os bytes da imagem). */
export const TICKET_LIST_SELECT = {
  id: true,
  organizationId: true,
  memberId: true,
  authorName: true,
  authorEmail: true,
  subject: true,
  message: true,
  appVersion: true,
  screen: true,
  userAgent: true,
  screenshotType: true,
  screenshotSize: true,
  status: true,
  resolvedAt: true,
  resolvedBy: true,
  createdAt: true,
  updatedAt: true,
  organization: { select: { id: true, name: true, displayName: true } },
} as const
