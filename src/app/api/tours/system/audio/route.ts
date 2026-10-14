import { promises as fs } from 'node:fs'
import { NextResponse } from 'next/server'
import { guard, isPlatformOperator } from '@/lib/api-auth'
import { chaptersFor, stepSpokenText } from '@/lib/system-tour/engine'
import { getTourAudio, tourAudioIdentity, TtsUnavailableError } from '@/lib/system-tour/tts'

// Áudio da narração de um passo do "Tour pelo sistema" (src/lib/system-tour/tts.ts).
// O texto sai SEMPRE do conteúdo do tour no servidor (nunca do pedido) e só dos capítulos/passos que o papel vê.
// Gerado uma vez e servido do cache em disco; o navegador guarda por 1 ano (a chave muda quando o texto muda).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CACHE_CONTROL = 'private, max-age=31536000, immutable'

const notFound = () => NextResponse.json({ error: 'Passo não encontrado' }, { status: 404 })
const unavailable = () =>
  NextResponse.json({ error: 'Áudio da narração indisponível no momento' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } })

function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false
  if (header.trim() === '*') return true
  return header.split(',').some((t) => t.trim().replace(/^W\//, '') === etag)
}

/** Um intervalo "bytes=a-b" (o Safari pede o áudio em pedaços). null = sem Range ou inválido (serve tudo). */
function parseRange(header: string | null, size: number): { start: number; end: number } | 'unsatisfiable' | null {
  const m = header && /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m || (!m[1] && !m[2])) return null
  let start: number
  let end: number
  if (!m[1]) {
    const suffix = Number(m[2])
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
  }
  if (start > end || start >= size) return 'unsatisfiable'
  return { start, end }
}

export async function GET(request: Request) {
  const g = await guard('tours.use')
  if (!g.ok) return g.res

  const url = new URL(request.url)
  const chapterId = url.searchParams.get('chapter') ?? ''
  const stepRaw = url.searchParams.get('step') ?? ''
  if (!/^\d{1,3}$/.test(stepRaw)) return notFound()
  // Mesma filtragem por papel do conteúdo: capítulo ou passo que a pessoa não vê não existe para ela
  const chapter = chaptersFor({ role: g.auth.role, isPlatformOperator: isPlatformOperator(g.auth.email) }).find((c) => c.id === chapterId)
  const step = chapter?.steps[Number(stepRaw)]
  if (!step) return notFound()
  const text = stepSpokenText(step)

  const identity = tourAudioIdentity(text)
  if (!identity) return unavailable()
  // O navegador já tem este áudio (a chave depende só da voz, da versão, do formato e do texto)
  if (etagMatches(request.headers.get('if-none-match'), `"${identity.key}"`)) {
    return new NextResponse(null, { status: 304, headers: { ETag: `"${identity.key}"`, 'Cache-Control': CACHE_CONTROL } })
  }

  let audio
  try {
    audio = await getTourAudio(text)
  } catch (e) {
    if (!(e instanceof TtsUnavailableError)) console.error('[tour-audio] falha ao gerar a narração:', e instanceof Error ? e.message : e)
    return unavailable()
  }

  const data = await fs.readFile(audio.file)
  const headers: Record<string, string> = {
    'Content-Type': audio.contentType,
    'Cache-Control': CACHE_CONTROL,
    ETag: `"${audio.key}"`,
    'Accept-Ranges': 'bytes',
  }
  const range = parseRange(request.headers.get('range'), data.length)
  if (range === 'unsatisfiable') {
    return new NextResponse(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${data.length}` } })
  }
  if (range) {
    const part = data.subarray(range.start, range.end + 1)
    return new NextResponse(new Uint8Array(part), {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${range.start}-${range.end}/${data.length}`, 'Content-Length': String(part.length) },
    })
  }
  return new NextResponse(new Uint8Array(data), { status: 200, headers: { ...headers, 'Content-Length': String(data.length) } })
}
