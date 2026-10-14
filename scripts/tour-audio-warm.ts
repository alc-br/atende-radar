// S2 · Pré-gera o áudio da narração do "Tour pelo sistema" (Azure Speech) para o cache em disco.
//   bun scripts/tour-audio-warm.ts
//
// Todos os capítulos e passos, de todos os papéis (textos repetidos contam uma vez). Gera só o que NÃO está no cache,
// um de cada vez, com uma pausa curta entre os pedidos; 429 (limite do plano F0) espera e tenta de novo.
// Variáveis: AZURE_SPEECH_KEY, AZURE_SPEECH_REGION, AZURE_SPEECH_VOICE (opcional), TOUR_AUDIO_DIR (as mesmas do app).
// Sem a chave da Azure: só avisa e sai com 0 (o tour funciona com a voz do navegador). Nunca imprime a chave.
// No deploy roda depois do health check e não derruba o deploy se falhar.
import { stepSpokenText } from '../src/lib/system-tour/engine'
import { SYSTEM_TOUR_CHAPTERS } from '../src/lib/system-tour/content'
import { getTourAudio, normalizeTtsText, tourAudioCached, ttsConfig, TtsUnavailableError } from '../src/lib/system-tour/tts'

const PAUSE_MS = 400
const RETRY_WAIT_MS = [5_000, 15_000, 30_000]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

async function main() {
  const cfg = ttsConfig()
  if (!cfg) {
    console.warn('[tour-audio-warm] AZURE_SPEECH_KEY/AZURE_SPEECH_REGION não configuradas: nada a gerar (o tour usa a voz do navegador).')
    return 0
  }
  console.log(`[tour-audio-warm] provedor ${cfg.provider}, voz ${cfg.voice}, cache ${cfg.dir}`)

  // Textos únicos de todos os capítulos (o filtro por papel só esconde capítulos/passos; o texto é o mesmo para todos)
  const texts = new Map<string, string>()
  for (const chapter of SYSTEM_TOUR_CHAPTERS) {
    for (const step of chapter.steps) {
      const text = stepSpokenText(step)
      const norm = normalizeTtsText(text)
      if (norm && !texts.has(norm)) texts.set(norm, text)
    }
  }

  let generated = 0
  let existed = 0
  let failed = 0
  let chars = 0
  for (const text of texts.values()) {
    if (await tourAudioCached(text)) {
      existed++
      continue
    }
    for (let attempt = 0; ; attempt++) {
      try {
        const audio = await getTourAudio(text)
        if (audio.generated) {
          generated++
          chars += normalizeTtsText(text).length
        } else {
          existed++
        }
        break
      } catch (e) {
        const wait = RETRY_WAIT_MS[attempt]
        if (e instanceof TtsUnavailableError && e.status === 429 && wait !== undefined) {
          console.warn(`[tour-audio-warm] limite da Azure (429): esperando ${wait / 1000}s`)
          await sleep(wait)
          continue
        }
        failed++
        console.warn(`[tour-audio-warm] falhou: ${errorText(e)}`)
        break
      }
    }
    await sleep(PAUSE_MS)
  }

  console.log(
    `[tour-audio-warm] textos ${texts.size}: gerados ${generated} (${chars} caracteres), já existiam ${existed}, falharam ${failed}`,
  )
  return 0
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`[tour-audio-warm] erro: ${errorText(e)}`)
    process.exit(1)
  },
)
