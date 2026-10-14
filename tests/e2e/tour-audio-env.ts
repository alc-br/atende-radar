import { join } from 'node:path'

// Áudio da narração do tour nos testes: um "Piper falso" (fixtures/fake-piper.mjs, rodado pelo node) e um cache
// descartável em .tmp/. Usado pelo playwright.config.ts (ambiente do servidor) e pelos testes que conferem o cache.
const ROOT = join(__dirname, '..', '..')
export const TOUR_AUDIO_TEST_DIR = join(ROOT, '.tmp', 'tour-audio-e2e')
export const FAKE_PIPER_LOG = join(ROOT, '.tmp', 'fake-piper-calls.log')
export const FAKE_PIPER_VOICE = join(ROOT, 'tests', 'e2e', 'fixtures', 'fake-voice.txt')

export const TOUR_AUDIO_TEST_ENV: Record<string, string> = {
  PIPER_BIN: 'node',
  PIPER_ARGS: JSON.stringify([join(ROOT, 'tests', 'e2e', 'fixtures', 'fake-piper.mjs')]),
  PIPER_VOICE: FAKE_PIPER_VOICE,
  TOUR_AUDIO_DIR: TOUR_AUDIO_TEST_DIR,
  TOUR_AUDIO_FFMPEG: 'off', // WAV sempre: o resultado não depende de a máquina ter ffmpeg
  FAKE_PIPER_LOG,
}
