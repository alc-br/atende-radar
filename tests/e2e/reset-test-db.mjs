// Apaga apenas o arquivo do banco DESCARTÁVEL de teste (prisma/test.db) e o cache de áudio dos testes (.tmp/). Nunca toca dev.db.
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

for (const suffix of ['', '-journal', '-wal', '-shm']) {
  rmSync(fileURLToPath(new URL(`../../prisma/test.db${suffix}`, import.meta.url)), { force: true })
}

// Narração do tour: cache e contador do TTS falso começam vazios a cada execução (tests/e2e/tour-audio-env.ts)
for (const p of ['../../.tmp/tour-audio-e2e', '../../.tmp/tour-audio-fake-calls.log']) {
  rmSync(fileURLToPath(new URL(p, import.meta.url)), { force: true, recursive: true })
}
