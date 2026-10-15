import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { join, resolve } from 'node:path'
import { NextResponse } from 'next/server'
import { readBodyLimited, sniffImageType, type ScreenshotType } from './support'

// Imagens enviadas pelos clientes (P7): foto do perfil e logotipo da empresa.
// Ficam FORA do diretório de deploy, em UPLOADS_DIR (produção: /opt/atende-radar/shared/uploads; dev: .uploads/,
// ignorada pelo git), uma pasta por organização: <UPLOADS_DIR>/<organização>/logo e avatar-<membro>.
// Só saem pelas rotas autenticadas /api/media/... (escopo da organização). Entram no backup (scripts/backup-db.ts).

export type ImageType = ScreenshotType
export type ImageKind = 'avatar' | 'logo'

/** Arquivo enviado: até 2 MB (a imagem guardada é menor: redimensionada e convertida para WEBP). */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const MAX_BODY_BYTES = MAX_IMAGE_BYTES + 64 * 1024
/** Envios por membro por hora (foto + logotipo). */
export const UPLOAD_RATE_LIMIT = 20
export const UPLOAD_RATE_WINDOW_MS = 60 * 60_000

const SIDE: Record<ImageKind, number> = { avatar: 256, logo: 512 }

export function uploadsDir(): string {
  return resolve(process.env.UPLOADS_DIR || join(process.cwd(), '.uploads'))
}

// ids vêm do banco (cuid / seed), mas o caminho nunca é montado com algo fora deste formato
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/
const fileName = (kind: ImageKind, memberId?: string) => (kind === 'logo' ? 'logo' : `avatar-${memberId}`)

function filePath(orgId: string, kind: ImageKind, memberId?: string): string {
  if (!SAFE_ID.test(orgId) || (kind === 'avatar' && !SAFE_ID.test(memberId || ''))) throw new Error('id inválido')
  return join(uploadsDir(), orgId, fileName(kind, memberId))
}

type Processed = { ok: true; bytes: Uint8Array; type: ImageType } | { ok: false; error: string }

/**
 * Confere e prepara a imagem. O tipo vem dos primeiros bytes (nunca do nome nem do tipo declarado pelo navegador).
 * Com o sharp: decodifica de verdade (arquivo que só imita o cabeçalho é recusado), gira pela orientação da foto,
 * reduz e regrava em WEBP — o que também descarta metadados (localização da foto) e qualquer conteúdo escondido.
 * Sem o sharp (não deveria acontecer): guarda o original, já validado pelo cabeçalho.
 */
export async function processImage(input: Uint8Array, kind: ImageKind): Promise<Processed> {
  if (input.byteLength === 0) return { ok: false, error: 'Escolha uma imagem.' }
  if (input.byteLength > MAX_IMAGE_BYTES) return { ok: false, error: 'A imagem passa de 2 MB. Envie uma menor.' }
  const sniffed = sniffImageType(input)
  if (!sniffed) return { ok: false, error: 'Envie uma imagem PNG, JPG ou WEBP.' }

  let sharp: typeof import('sharp').default | null = null
  try {
    sharp = (await import('sharp')).default
  } catch (e) {
    console.warn('[uploads] sharp indisponível; imagem guardada sem redimensionar', e instanceof Error ? e.message : e)
  }
  if (!sharp) return { ok: true, bytes: input, type: sniffed }
  try {
    const side = SIDE[kind]
    const out = await sharp(Buffer.from(input), { limitInputPixels: 40_000_000, failOn: 'error' })
      .rotate()
      .resize(side, side, { fit: kind === 'avatar' ? 'cover' : 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer()
    return { ok: true, bytes: new Uint8Array(out), type: 'image/webp' }
  } catch {
    return { ok: false, error: 'Não foi possível ler a imagem. Envie um arquivo PNG, JPG ou WEBP válido.' }
  }
}

/** Lê o arquivo do formulário (campo "file"), com o corpo limitado antes de ser lido. Erro já vem como resposta. */
export async function readImageForm(request: Request): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; res: NextResponse }> {
  const bad = (error: string, status = 400) => ({ ok: false as const, res: NextResponse.json({ error }, { status }) })
  const contentType = request.headers.get('content-type') || ''
  if (!/^multipart\/form-data/i.test(contentType)) return bad('Envie a imagem pelo formulário.')
  let raw: Uint8Array<ArrayBuffer> | null
  try {
    raw = await readBodyLimited(request, MAX_BODY_BYTES)
  } catch {
    return bad('Formulário inválido.')
  }
  if (raw === null) return bad('A imagem passa de 2 MB. Envie uma menor.', 413)
  let form: FormData
  try {
    form = await new Response(raw, { headers: { 'content-type': contentType } }).formData()
  } catch {
    return bad('Formulário inválido.')
  }
  const file = form.get('file')
  if (!file || typeof file === 'string') return bad('Escolha uma imagem.')
  return { ok: true, bytes: new Uint8Array(await file.arrayBuffer()) }
}

/** Grava (troca atômica: quem estiver lendo nunca vê um arquivo pela metade). */
export async function saveImage(orgId: string, kind: ImageKind, bytes: Uint8Array, memberId?: string): Promise<void> {
  const file = filePath(orgId, kind, memberId)
  await mkdir(join(uploadsDir(), orgId), { recursive: true, mode: 0o750 })
  const tmp = `${file}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`
  await writeFile(tmp, bytes, { mode: 0o640 })
  await rename(tmp, file)
}

export async function readImage(orgId: string, kind: ImageKind, memberId?: string): Promise<Buffer | null> {
  try {
    return await readFile(filePath(orgId, kind, memberId))
  } catch {
    return null
  }
}

export async function deleteImage(orgId: string, kind: ImageKind, memberId?: string): Promise<void> {
  try {
    await rm(filePath(orgId, kind, memberId), { force: true })
  } catch (e) {
    console.error('[uploads] falha ao apagar imagem', kind, e instanceof Error ? e.message : e)
  }
}

/** Exclusão da empresa: some a pasta inteira dela. */
export async function deleteOrganizationUploads(orgId: string): Promise<void> {
  if (!SAFE_ID.test(orgId)) return
  await rm(join(uploadsDir(), orgId), { recursive: true, force: true }).catch((e) =>
    console.error('[uploads] falha ao apagar a pasta da organização', e instanceof Error ? e.message : e),
  )
}

/** Endereço servido (o ?v= muda a cada envio, então o navegador pode guardar em cache). */
export const avatarUrl = (m: { id: string; avatarType: string | null; avatarUpdatedAt: Date | null }) =>
  m.avatarType && m.avatarUpdatedAt ? `/api/media/avatar/${m.id}?v=${m.avatarUpdatedAt.getTime()}` : null
export const logoUrl = (o: { id: string; logoType: string | null; logoUpdatedAt: Date | null }) =>
  o.logoType && o.logoUpdatedAt ? `/api/media/logo/${o.id}?v=${o.logoUpdatedAt.getTime()}` : null

const EXT: Record<string, string> = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' }

/** Resposta da imagem com cabeçalhos seguros: tipo certo, sem "adivinhar" o conteúdo, só para quem está logado. */
export function imageResponse(bytes: Buffer, type: string, name: string): Response {
  const safeType = EXT[type] ? type : 'application/octet-stream'
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': safeType,
      'Content-Length': String(bytes.byteLength),
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `inline; filename="${name}.${EXT[type] || 'bin'}"`,
      'Cache-Control': 'private, max-age=86400',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  })
}
