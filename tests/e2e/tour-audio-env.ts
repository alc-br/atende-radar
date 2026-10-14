import { join } from 'node:path'

// Áudio da narração do tour nos testes: o modo falso do TTS (TOUR_AUDIO_FAKE=1, sem rede; ignorado em produção) grava
// um MP3 de silêncio e conta as gerações em TOUR_AUDIO_FAKE_LOG; o cache é descartável em .tmp/.
// Usado pelo playwright.config.ts (ambiente do servidor) e pelos testes que conferem o cache.
const ROOT = join(__dirname, '..', '..')
export const TOUR_AUDIO_TEST_DIR = join(ROOT, '.tmp', 'tour-audio-e2e')
export const TOUR_AUDIO_FAKE_LOG = join(ROOT, '.tmp', 'tour-audio-fake-calls.log')

export const TOUR_AUDIO_TEST_ENV: Record<string, string> = {
  TOUR_AUDIO_FAKE: '1',
  TOUR_AUDIO_FAKE_LOG,
  TOUR_AUDIO_DIR: TOUR_AUDIO_TEST_DIR,
}
