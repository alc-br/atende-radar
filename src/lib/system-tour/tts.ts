// Áudio da narração do "Tour pelo sistema": gerado UMA vez no servidor com o Piper (TTS neural, grátis e open source,
// roda na própria máquina: nada sai para serviços de fora) e reaproveitado de um cache em disco.
//
//  - chave = sha256(voz + versão + formato + texto): mudar o texto, a voz ou o formato gera um arquivo novo; o resto
//    continua valendo. Como o texto vem só do conteúdo do tour (nunca do cliente), o cache tem tamanho limitado.
//  - TOUR_AUDIO_DIR: pasta do cache (padrão <cwd>/.tour-audio; no servidor, /opt/atende-radar/shared/tour-audio).
//  - PIPER_BIN (+ PIPER_ARGS opcionais, JSON ou separados por espaço) e PIPER_VOICE (o modelo .onnx). Sem os dois,
//    o áudio fica indisponível (a rota responde 503 e o navegador usa a própria voz).
//  - Com ffmpeg (TOUR_AUDIO_FFMPEG; padrão "ffmpeg" no PATH; "off" desliga) o WAV do Piper vira MP3 mono leve.
// Imports relativos e só módulos do Node: os testes de unidade carregam este arquivo direto.
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'

/** Suba quando mudar algo que altera o som sem mudar o texto (ex.: parâmetros do Piper ou do ffmpeg). */
export const TOUR_AUDIO_VERSION = '1'

export type TourAudioFormat = 'mp3' | 'wav'
export const CONTENT_TYPES: Record<TourAudioFormat, string> = { mp3: 'audio/mpeg', wav: 'audio/wav' }

const DEFAULT_TIMEOUT_MS = 60_000
const MAX_PARALLEL = 2 // gerações do Piper ao mesmo tempo (CPU do servidor)

export class TtsUnavailableError extends Error {}

type Env = Record<string, string | undefined>

export interface TtsConfig {
  bin: string
  args: string[]
  voice: string
  /** Nome da voz que entra na chave (o arquivo, sem a pasta: mudar de pasta não invalida o cache). */
  voiceName: string
  dir: string
  timeoutMs: number
}

function parseArgs(raw: string | undefined): string[] {
  const s = raw?.trim()
  if (!s) return []
  if (s.startsWith('[')) {
    try {
      const a = JSON.parse(s) as unknown
      if (Array.isArray(a)) return a.map(String)
    } catch {
      // cai para a separação por espaço
    }
  }
  return s.split(/\s+/)
}

/** Pasta do cache de áudio. */
export function tourAudioDir(env: Env = process.env): string {
  return path.resolve(env.TOUR_AUDIO_DIR?.trim() || path.join(process.cwd(), '.tour-audio'))
}

/** Configuração do Piper, ou null quando não há Piper configurado (ou o modelo da voz não existe). */
export function ttsConfig(env: Env = process.env): TtsConfig | null {
  const bin = env.PIPER_BIN?.trim()
  const voice = env.PIPER_VOICE?.trim()
  if (!bin || !voice) return null
  if (!existsSync(voice)) return null
  if ((bin.includes('/') || bin.includes('\\')) && !existsSync(bin)) return null
  const timeout = Number(env.TOUR_AUDIO_TIMEOUT_MS)
  return {
    bin,
    args: parseArgs(env.PIPER_ARGS),
    voice,
    voiceName: path.basename(voice),
    dir: tourAudioDir(env),
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  }
}

export const ttsAvailable = (env: Env = process.env) => ttsConfig(env) !== null

/** Texto como o Piper recebe: uma linha só (o Piper sintetiza linha a linha), sem espaços sobrando. */
export const normalizeTtsText = (text: string) => text.replace(/\s+/g, ' ').trim()

/** Chave do áudio no cache (e ETag da rota): sha256(voz + versão + formato + texto), em hexadecimal. */
export function tourAudioKey(voiceName: string, text: string, format: TourAudioFormat): string {
  return createHash('sha256').update(`${voiceName}\n${TOUR_AUDIO_VERSION}\n${format}\n${normalizeTtsText(text)}`).digest('hex')
}

// ── ffmpeg: descobre uma vez se existe (sem ele, serve WAV) ──
let ffmpegProbe: Promise<string | null> | null = null

function run(bin: string, args: string[], opts: { input?: string; timeoutMs: number }): Promise<void> {
  return new Promise((resolve, reject) => {
    let stderr = ''
    let done = false
    const child = spawn(bin, args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true })
    const timer = setTimeout(() => {
      if (done) return
      done = true
      child.kill('SIGKILL')
      reject(new Error(`${path.basename(bin)}: tempo esgotado (${opts.timeoutMs} ms)`))
    }, opts.timeoutMs)
    child.stderr?.on('data', (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-600)
    })
    child.on('error', (e) => {
      if (done) return
      done = true
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`${path.basename(bin)} saiu com código ${code}: ${stderr.trim()}`))
    })
    child.stdin?.on('error', () => {}) // processo que morre cedo fecha o stdin: o erro real vem no "close"
    child.stdin?.end(opts.input ?? '')
  })
}

function ffmpegBin(): Promise<string | null> {
  if (!ffmpegProbe) {
    const configured = process.env.TOUR_AUDIO_FFMPEG?.trim()
    const bin = configured || 'ffmpeg'
    ffmpegProbe = /^(off|0|false|no)$/i.test(bin)
      ? Promise.resolve(null)
      : run(bin, ['-hide_banner', '-version'], { timeoutMs: 5000 }).then(
          () => bin,
          () => null,
        )
  }
  return ffmpegProbe
}

/** Formato servido agora: MP3 com ffmpeg disponível, senão WAV. */
export async function tourAudioFormat(): Promise<TourAudioFormat> {
  return (await ffmpegBin()) ? 'mp3' : 'wav'
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
}

const fileFor = (dir: string, key: string, format: TourAudioFormat) => path.join(dir, `${key}.${format}`)

async function nonEmpty(file: string): Promise<boolean> {
  try {
    return (await fs.stat(file)).size > 44 // maior que um cabeçalho WAV vazio
  } catch {
    return false
  }
}

async function generate(cfg: TtsConfig, text: string, key: string, format: TourAudioFormat): Promise<TourAudio> {
  await fs.mkdir(cfg.dir, { recursive: true })
  const tag = `${key}.${randomBytes(4).toString('hex')}.tmp`
  const tmpWav = path.join(cfg.dir, `${tag}.wav`)
  const tmpMp3 = path.join(cfg.dir, `${tag}.mp3`)
  try {
    await run(cfg.bin, [...cfg.args, '--model', cfg.voice, '--output_file', tmpWav], { input: `${normalizeTtsText(text)}\n`, timeoutMs: cfg.timeoutMs })
    if (!(await nonEmpty(tmpWav))) throw new Error('o Piper não gerou áudio')

    if (format === 'mp3') {
      const ffmpeg = await ffmpegBin()
      try {
        if (!ffmpeg) throw new Error('ffmpeg indisponível')
        // mono, 22,05 kHz, 48 kbit/s: voz clara e ~6 KB por segundo de fala
        await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', tmpWav, '-ac', '1', '-ar', '22050', '-codec:a', 'libmp3lame', '-b:a', '48k', tmpMp3], {
          timeoutMs: cfg.timeoutMs,
        })
        if (!(await nonEmpty(tmpMp3))) throw new Error('o ffmpeg não gerou áudio')
        const file = fileFor(cfg.dir, key, 'mp3')
        await fs.rename(tmpMp3, file) // atômico: quem lê nunca vê arquivo pela metade
        return { key, file, format: 'mp3', contentType: CONTENT_TYPES.mp3 }
      } catch (e) {
        // ffmpeg quebrado (ex.: sem libmp3lame): daqui em diante serve WAV, sem tentar converter de novo
        console.warn('[tour-audio] conversão para MP3 falhou; servindo WAV:', e instanceof Error ? e.message : e)
        ffmpegProbe = Promise.resolve(null)
        const wavKey = tourAudioKey(cfg.voiceName, text, 'wav')
        const file = fileFor(cfg.dir, wavKey, 'wav')
        await fs.rename(tmpWav, file)
        return { key: wavKey, file, format: 'wav', contentType: CONTENT_TYPES.wav }
      }
    }

    const file = fileFor(cfg.dir, key, 'wav')
    await fs.rename(tmpWav, file)
    return { key, file, format: 'wav', contentType: CONTENT_TYPES.wav }
  } finally {
    await fs.rm(tmpWav, { force: true }).catch(() => {})
    await fs.rm(tmpMp3, { force: true }).catch(() => {})
  }
}

/** Chave e formato que o texto terá agora (sem gerar nada). null = sem Piper configurado. */
export async function tourAudioIdentity(text: string): Promise<{ key: string; format: TourAudioFormat } | null> {
  const cfg = ttsConfig()
  if (!cfg) return null
  const format = await tourAudioFormat()
  return { key: tourAudioKey(cfg.voiceName, text, format), format }
}

/**
 * Áudio do texto: do cache quando já existe; senão gera (uma vez só, mesmo com pedidos simultâneos).
 * Lança TtsUnavailableError sem Piper configurado; outros erros = a geração falhou.
 */
export async function getTourAudio(text: string): Promise<TourAudio> {
  const cfg = ttsConfig()
  if (!cfg) throw new TtsUnavailableError('Piper não configurado (PIPER_BIN e PIPER_VOICE)')
  const format = await tourAudioFormat()
  const key = tourAudioKey(cfg.voiceName, text, format)
  const file = fileFor(cfg.dir, key, format)
  if (await nonEmpty(file)) return { key, file, format, contentType: CONTENT_TYPES[format] }

  const pending = inflight.get(key)
  if (pending) return pending
  const job = withSlot(async () => {
    if (await nonEmpty(file)) return { key, file, format, contentType: CONTENT_TYPES[format] } // outro processo gerou enquanto esperava
    return generate(cfg, text, key, format)
  }).finally(() => inflight.delete(key))
  inflight.set(key, job)
  return job
}
