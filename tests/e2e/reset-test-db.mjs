// Apaga apenas o arquivo do banco DESCARTÁVEL de teste (prisma/test.db). Nunca toca dev.db.
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

for (const suffix of ['', '-journal', '-wal', '-shm']) {
  rmSync(fileURLToPath(new URL(`../../prisma/test.db${suffix}`, import.meta.url)), { force: true })
}
