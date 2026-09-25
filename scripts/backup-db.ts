// Backup consistente do banco SQLite (VACUUM INTO: seguro mesmo com o app em uso e com WAL).
//   bun scripts/backup-db.ts
// Variáveis: DATABASE_URL (padrão file:./dev.db, relativo a prisma/ como o Prisma faz),
//            BACKUP_DIR   (padrão ../backups, fora da pasta de deploy para o rsync --delete não apagar),
//            BACKUP_KEEP  (quantos manter; padrão 30),
//            BACKUP_REQUIRE_DB=true (banco ausente vira erro).
import { Database } from 'bun:sqlite'
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

const url = process.env.DATABASE_URL || 'file:./dev.db'
if (!url.startsWith('file:')) {
  console.error(`backup-db: só SQLite é suportado (DATABASE_URL=${url})`)
  process.exit(2)
}
const raw = url.slice('file:'.length).split('?')[0]
const dbPath = isAbsolute(raw) ? raw : resolve(process.cwd(), 'prisma', raw)
const backupDir = resolve(process.cwd(), process.env.BACKUP_DIR || '../backups')
const keep = Number(process.env.BACKUP_KEEP || 30)

if (!existsSync(dbPath)) {
  // Primeiro deploy: ainda não há banco para proteger. Em produção BACKUP_REQUIRE_DB=true transforma isso em erro,
  // para um caminho errado não virar uma falsa sensação de segurança.
  if (process.env.BACKUP_REQUIRE_DB === 'true') {
    console.error(`backup-db: ${dbPath} não existe, mas era esperado. Confira o DATABASE_URL.`)
    process.exit(1)
  }
  console.log(`backup-db: ${dbPath} não existe — nada a copiar.`)
  process.exit(0)
}

mkdirSync(backupDir, { recursive: true })
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')
let target = join(backupDir, `atenderadar-${stamp}.db`)
for (let i = 1; existsSync(target); i++) target = join(backupDir, `atenderadar-${stamp}-${i}.db`)

const src = new Database(dbPath, { readonly: true })
src.run(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
src.close()

// Confere a cópia antes de confiar nela.
const copy = new Database(target, { readonly: true })
const integrity = copy.query('PRAGMA integrity_check').get() as { integrity_check: string }
const tables = (copy.query("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get() as { n: number }).n
copy.close()
if (integrity.integrity_check !== 'ok' || tables === 0) {
  rmSync(target, { force: true })
  console.error(`backup-db: cópia inválida (integrity=${integrity.integrity_check}, tabelas=${tables})`)
  process.exit(1)
}
console.log(`backup-db: ${target} (${statSync(target).size} bytes, ${tables} tabelas)`)

// Retenção: mantém os N mais recentes.
const files = readdirSync(backupDir)
  .filter((f) => /^atenderadar-.*\.db$/.test(f))
  .map((f) => ({ f, t: statSync(join(backupDir, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t)
for (const old of files.slice(keep)) {
  rmSync(join(backupDir, old.f), { force: true })
  console.log(`backup-db: removido ${old.f} (retenção ${keep})`)
}

// Sessões do WhatsApp (credenciais dos números conectados): sem elas cada cliente teria de escanear o QR de novo.
// Mesma retenção, pasta privada (0700).
const waDir = resolve(process.cwd(), process.env.WA_SESSIONS_DIR || '../wa-sessions')
if (existsSync(waDir) && readdirSync(waDir).length > 0) {
  const waTarget = join(backupDir, `wa-sessions-${stamp}`)
  mkdirSync(waTarget, { recursive: true, mode: 0o700 })
  cpSync(waDir, waTarget, { recursive: true })
  console.log(`backup-db: sessões do WhatsApp copiadas para ${waTarget}`)
  const dirs = readdirSync(backupDir)
    .filter((f) => /^wa-sessions-/.test(f))
    .map((f) => ({ f, t: statSync(join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  for (const old of dirs.slice(keep)) rmSync(join(backupDir, old.f), { recursive: true, force: true })
}
