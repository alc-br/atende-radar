// Áudio da narração do "Tour pelo sistema": gerado UMA vez no servidor pela Azure Speech (plano gratuito F0) e
// reaproveitado de um cache em disco compartilhado por todos os usuários (TOUR_AUDIO_DIR, persiste entre deploys).
//
//  - chave = sha256(provedor + voz + formato + versão + texto): mudar o texto ou a voz gera um arquivo novo; o resto
//    continua valendo. A Azure só é chamada quando o arquivo NÃO existe: a cota mensal do F0 (~500 mil caracteres)
//    é gasta uma vez por texto, não por play.
//  - AZURE_SPEECH_KEY e AZURE_SPEECH_REGION (obrigatórias), AZURE_SPEECH_VOICE (padrão pt-BR-FranciscaNeural).
//    Sem chave/região, ou se a Azure recusar (401/403/429/5xx), lança TtsUnavailableError: a rota responde 503 e o
//    navegador lê com a própria voz.
//  - TOUR_AUDIO_FAKE=1 (só fora de produção): modo dos testes, sem rede. Grava um MP3 mínimo de silêncio e acrescenta
//    uma linha em TOUR_AUDIO_FAKE_LOG a cada geração.
// A chave da Azure nunca vai para log nem mensagem de erro.
// Imports relativos e só módulos do Node: os testes de unidade e scripts/tour-audio-warm.ts carregam este arquivo direto.
import { createHash, randomBytes } from 'node:crypto'
import { appendFileSync, mkdirSync, promises as fs } from 'node:fs'
import path from 'node:path'

/** Suba quando mudar algo que altera o som sem mudar o texto (ex.: SSML, prosódia). */
export const TOUR_AUDIO_VERSION = '1'

export type TourAudioFormat = 'mp3'
export const CONTENT_TYPES: Record<TourAudioFormat, string> = { mp3: 'audio/mpeg' }
/** Formato pedido à Azure: MP3 mono 24 kHz a 48 kbit/s (~6 KB por segundo de fala). */
export const AZURE_OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'
export const DEFAULT_VOICE = 'pt-BR-FranciscaNeural'

const TIMEOUT_MS = 20_000
const MAX_PARALLEL = 2 // o F0 limita pedidos por minuto
const USER_AGENT = 'AtendeRadar-TourAudio/1.0'
/** Modo falso: ~0,6 s de silêncio (curto para a leitura automática avançar rápido nos testes). */
const FAKE_FRAMES = 24

export class TtsUnavailableError extends Error {
  /** Status HTTP da Azure, quando houve resposta (429 = limite de pedidos: vale tentar de novo mais tarde). */
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
  }
}

type Env = Record<string, string | undefined>

export type TtsProvider = 'azure' | 'fake'

export interface TtsConfig {
  provider: TtsProvider
  voice: string
  dir: string
  /** Só Azure. */
  key?: string
  region?: string
  /** Só fake: arquivo onde cada geração acrescenta uma linha. */
  fakeLog?: string
}

/** Pasta do cache de áudio. */
export function tourAudioDir(env: Env = process.env): string {
  return path.resolve(env.TOUR_AUDIO_DIR?.trim() || path.join(process.cwd(), '.tour-audio'))
}

/** Configuração do TTS, ou null quando não há Azure configurada (nem o modo falso dos testes). */
export function ttsConfig(env: Env = process.env): TtsConfig | null {
  const voice = env.AZURE_SPEECH_VOICE?.trim() || DEFAULT_VOICE
  const dir = tourAudioDir(env)
  if (env.TOUR_AUDIO_FAKE === '1' && env.NODE_ENV !== 'production') {
    return { provider: 'fake', voice, dir, fakeLog: env.TOUR_AUDIO_FAKE_LOG?.trim() || undefined }
  }
  const key = env.AZURE_SPEECH_KEY?.trim()
  const region = env.AZURE_SPEECH_REGION?.trim()
  if (!key || !region || !/^[a-z0-9-]+$/i.test(region)) return null
  return { provider: 'azure', voice, dir, key, region }
}

export const ttsAvailable = (env: Env = process.env) => ttsConfig(env) !== null

/** Texto como vai para a síntese: uma linha só, sem espaços sobrando. */
export const normalizeTtsText = (text: string) => text.replace(/\s+/g, ' ').trim()

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }
export const escapeXml = (s: string) => s.replace(/[&<>"']/g, (c) => XML_ESCAPES[c])

/** SSML enviado à Azure: pt-BR, a voz escolhida e o texto escapado. */
export function buildSsml(text: string, voice: string): string {
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="pt-BR">` +
    `<voice name="${escapeXml(voice)}">${escapeXml(normalizeTtsText(text))}</voice></speak>`
  )
}

/** Chave do áudio no cache (e ETag da rota): sha256(provedor + voz + formato + versão + texto), em hexadecimal. */
export function tourAudioKey(provider: TtsProvider, voice: string, text: string, format: TourAudioFormat = 'mp3'): string {
  return createHash('sha256').update(`${provider}\n${voice}\n${format}\n${TOUR_AUDIO_VERSION}\n${normalizeTtsText(text)}`).digest('hex')
}

/** MP3 válido de silêncio (padrão ~2,6 s; ~26 ms por quadro) (MPEG-1 Layer III, 128 kbit/s, 44,1 kHz, mono; quadros zerados = silêncio). */
export function silentMp3(frames = 100): Buffer {
  const frame = Buffer.alloc(417)
  frame.set([0xff, 0xfb, 0x90, 0xc0])
  return Buffer.concat(Array.from({ length: frames }, () => frame))
}

/** Bytes de um MP3: começa com ID3 ou com um quadro MPEG (11 bits de sincronismo). */
export const looksLikeMp3 = (b: Uint8Array) =>
  b.length > 4 && ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0))

async function synthAzure(cfg: TtsConfig, text: string): Promise<Buffer> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`https://${cfg.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': cfg.key!,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': AZURE_OUTPUT_FORMAT,
        'User-Agent': USER_AGENT,
      },
      body: buildSsml(text, cfg.voice),
      signal: ctrl.signal,
    })
  } catch (e) {
    // rede fora ou tempo esgotado: indisponível agora (o navegador lê)
    throw new TtsUnavailableError(`Azure Speech inacessível: ${e instanceof Error ? e.name : 'erro'}`)
  } finally {
    clearTimeout(timer)
  }
  if (res.status === 401 || res.status === 403 || res.status === 429 || res.status >= 500) {
    throw new TtsUnavailableError(`Azure Speech respondeu ${res.status}`, res.status)
  }
  if (!res.ok) throw new Error(`Azure Speech respondeu ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (!looksLikeMp3(buf)) throw new Error('Azure Speech não devolveu MP3')
  return buf
}

async function synth(cfg: TtsConfig, text: string): Promise<Buffer> {
  if (cfg.provider === 'fake') {
    if (cfg.fakeLog) {
      // num checkout limpo (CI) a pasta do log ainda não existe
      mkdirSync(path.dirname(cfg.fakeLog), { recursive: true })
      appendFileSync(cfg.fakeLog, `${normalizeTtsText(text).length}\n`)
    }
    return silentMp3(FAKE_FRAMES)
  }
  return synthAzure(cfg, text)
}

// ── fila: no máximo MAX_PARALLEL gerações ao mesmo tempo ──
let running = 0
const waiting: Array<() => void> = []
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r))
  running++
  try {
    return await fn()
  } finally {
    running--
    waiting.shift()?.()
  }
}

/** Mesma chave pedida duas vezes ao mesmo tempo: as duas esperam a MESMA geração. */
const inflight = new Map<string, Promise<TourAudio>>()

export interface TourAudio {
  key: string
  file: string
  format: TourAudioFormat
  contentType: string
  /** true = acabou de ser gerado agora (chamou o provedor); false = veio do cache. */
  generated: boolean
}

const fileFor = (dir: string, key: string) => path.join(dir, `${key}.mp3`)

async function nonEmpty(file: string): Promise<boolean> {
  try {
    return (await fs.stat(file)).size > 0
  } catch {
    return false
  }
}

async function generate(cfg: TtsConfig, text: string, key: string): Promise<TourAudio> {
  const data = await synth(cfg, text)
  await fs.mkdir(cfg.dir, { recursive: true })
  const file = fileFor(cfg.dir, key)
  const tmp = path.join(cfg.dir, `${key}.${randomBytes(4).toString('hex')}.tmp`)
  try {
    await fs.writeFile(tmp, data)
    await fs.rename(tmp, file) // atômico: quem lê nunca vê arquivo pela metade
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => {})
  }
  return { key, file, format: 'mp3', contentType: CONTENT_TYPES.mp3, generated: true }
}

/** Chave que o texto terá agora (sem gerar nada). null = sem TTS configurado. */
export function tourAudioIdentity(text: string, env: Env = process.env): { key: string; format: TourAudioFormat } | null {
  const cfg = ttsConfig(env)
  if (!cfg) return null
  return { key: tourAudioKey(cfg.provider, cfg.voice, text), format: 'mp3' }
}

/** O áudio deste texto já está no cache? */
export async function tourAudioCached(text: string, env: Env = process.env): Promise<boolean> {
  const cfg = ttsConfig(env)
  return !!cfg && nonEmpty(fileFor(cfg.dir, tourAudioKey(cfg.provider, cfg.voice, text)))
}

/**
 * Áudio do texto: do cache quando já existe; senão gera (uma vez só, mesmo com pedidos simultâneos).
 * Lança TtsUnavailableError sem TTS configurado ou com a Azure recusando; outros erros = a geração falhou.
 */
export async function getTourAudio(text: string, env: Env = process.env): Promise<TourAudio> {
  const cfg = ttsConfig(env)
  if (!cfg) throw new TtsUnavailableError('Azure Speech não configurada (AZURE_SPEECH_KEY e AZURE_SPEECH_REGION)')
  const key = tourAudioKey(cfg.provider, cfg.voice, text)
  const file = fileFor(cfg.dir, key)
  const cached = (): TourAudio => ({ key, file, format: 'mp3', contentType: CONTENT_TYPES.mp3, generated: false })
  if (await nonEmpty(file)) return cached()

  const pending = inflight.get(key)
  if (pending) return pending
  const job = withSlot(async () => {
    if (await nonEmpty(file)) return cached() // outro processo gerou enquanto esperava
    return generate(cfg, text, key)
  }).finally(() => inflight.delete(key))
  inflight.set(key, job)
  return job
}
