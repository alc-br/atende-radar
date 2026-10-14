// B10 · Migrações versionadas do banco (prisma/migrations), com baseline do banco que já existia.
//   bun scripts/db-migrate.ts           aplica as migrações que faltam (deploy, testes, dev)
//   bun scripts/db-migrate.ts --check   só confere se o schema.prisma tem migração para tudo (CI); não toca em banco
//
// Banco criado antes das migrações (pelo antigo `prisma db push`) não tem o histórico _prisma_migrations.
// Nele, a 0_init só é marcada como aplicada se o banco for IGUAL ao que a 0_init cria (prisma migrate diff);
// se houver qualquer diferença, para e mostra o SQL que falta — ninguém marca como aplicado um banco diferente.
// Variável: DATABASE_URL (padrão file:./dev.db, relativo a prisma/ como o Prisma faz).
import { Database } from 'bun:sqlite'
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

const BASELINE = '0_init'
const MIGRATIONS = resolve(process.cwd(), 'prisma', 'migrations')

/** Roda o CLI do Prisma (o mesmo do projeto) e devolve o código de saída e a saída. */
function prisma(args: string[], opts: { env?: Record<string, string>; quiet?: boolean } = {}) {
  const r = spawnSync(process.execPath, ['x', 'prisma', ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...opts.env },
  })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  if (!opts.quiet) process.stdout.write(out)
  return { code: r.status ?? 1, out, stdout: r.stdout ?? '' }
}

function shadowUrl(dir: string) {
  return `file:${join(dir, 'shadow.db').replace(/\\/g, '/')}`
}

if (process.argv.includes('--check')) {
  // O schema.prisma bate com a soma das migrações? Se não, alguém mudou o schema sem gerar a migração.
  const tmp = mkdtempSync(join(tmpdir(), 'ar-migr-'))
  try {
    const r = prisma(
      ['migrate', 'diff', '--from-migrations', MIGRATIONS, '--to-schema-datamodel', 'prisma/schema.prisma',
        '--shadow-database-url', shadowUrl(tmp), '--script', '--exit-code'],
      { quiet: true },
    )
    if (r.code === 0) {
      console.log('db-migrate --check: as migrações cobrem todo o schema.prisma')
      process.exit(0)
    }
    console.error(r.out)
    console.error(
      r.code === 2
        ? 'db-migrate --check: o schema.prisma mudou sem migração. Gere com `bun run db:migrate --name <descricao>` e commite prisma/migrations.'
        : 'db-migrate --check: não foi possível comparar (erro acima).',
    )
    process.exit(1)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

const url = process.env.DATABASE_URL || 'file:./dev.db'
if (!url.startsWith('file:')) {
  console.error(`db-migrate: só SQLite é suportado (DATABASE_URL=${url})`)
  process.exit(2)
}
const raw = url.slice('file:'.length).split('?')[0]
const dbPath = isAbsolute(raw) ? raw : resolve(process.cwd(), 'prisma', raw)
const absUrl = `file:${dbPath.replace(/\\/g, '/')}`

if (existsSync(dbPath)) {
  const db = new Database(dbPath, { readonly: true })
  const tables = db
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as Array<{ name: string }>
  // Histórico = a tabela existe E tem linhas. Vazia acontece se um baseline anterior falhou no meio
  // (o Prisma cria a tabela antes de gravar a 0_init); aí o banco ainda precisa do baseline, não da 0_init inteira.
  const hasHistory =
    tables.some((t) => t.name === '_prisma_migrations') &&
    (db.query('SELECT count(*) AS n FROM _prisma_migrations').get() as { n: number }).n > 0
  db.close()

  const appTables = tables.filter((t) => t.name !== '_prisma_migrations')
  if (!hasHistory && appTables.length > 0) {
    console.log(`db-migrate: banco sem histórico de migrações (${appTables.length} tabelas) — conferindo se é igual à ${BASELINE}`)
    // Compara com a 0_init SOZINHA (se já existirem migrações depois dela, elas são aplicadas em seguida pelo deploy).
    const tmp = mkdtempSync(join(tmpdir(), 'ar-migr-'))
    try {
      const only = join(tmp, 'migrations')
      cpSync(join(MIGRATIONS, BASELINE), join(only, BASELINE), { recursive: true })
      cpSync(join(MIGRATIONS, 'migration_lock.toml'), join(only, 'migration_lock.toml'))
      const diff = prisma(
        ['migrate', 'diff', '--from-url', absUrl, '--to-migrations', only, '--shadow-database-url', shadowUrl(tmp),
          '--script', '--exit-code'],
        { quiet: true },
      )
      if (diff.code !== 0) {
        console.error(diff.out)
        console.error(
          diff.code === 2
            ? `db-migrate: o banco é DIFERENTE da ${BASELINE} (SQL acima leva o banco até ela). Nada foi alterado. ` +
                'Confira o backup, ajuste o banco à mão (ou rode o deploy anterior) e tente de novo.'
            : 'db-migrate: não foi possível comparar o banco com a migração inicial (erro acima). Nada foi alterado.',
        )
        process.exit(1)
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
    const db = openForWrite()
    write(db, () => record(db, BASELINE, 0, ''))
    db.close()
    console.log(`db-migrate: ${BASELINE} marcada como aplicada (baseline do banco existente)`)
  }
}

// Aplica as migrações que faltam, em ordem, cada uma numa transação, e registra em _prisma_migrations no mesmo
// formato do Prisma (`prisma migrate status/deploy` enxergam o histórico igual). Não usa o schema engine do Prisma
// para gravar: ele não grava no SQLite enquanto outro processo mantém o banco aberto ("database is locked"), e em
// produção o app mantém (o runner não pode parar o serviço). Aqui a escrita espera o lock (busy_timeout) e convive.
const names = readdirSync(MIGRATIONS, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(MIGRATIONS, d.name, 'migration.sql')))
  .map((d) => d.name)
  .sort()
const db = openForWrite()
const rows = db.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations').all() as Array<{
  migration_name: string
  checksum: string
  finished_at: number | null
  rolled_back_at: number | null
}>
const broken = rows.filter((r) => r.finished_at == null && r.rolled_back_at == null)
if (broken.length) {
  console.error(
    `db-migrate: migração que falhou no meio: ${broken.map((r) => r.migration_name).join(', ')}. ` +
      'Confira o banco e marque com `bunx prisma migrate resolve --rolled-back <nome>` ou `--applied <nome>` (ver docs/operacao/migracoes.md).',
  )
  process.exit(1)
}
const done = new Map(rows.filter((r) => r.finished_at != null && r.rolled_back_at == null).map((r) => [r.migration_name, r.checksum]))
let applied = 0
for (const name of names) {
  const sql = readFileSync(join(MIGRATIONS, name, 'migration.sql'))
  const checksum = createHash('sha256').update(sql).digest('hex')
  if (done.has(name)) {
    if (done.get(name) !== checksum) console.warn(`db-migrate: AVISO: ${name} mudou depois de aplicada (não edite migração que já foi ao ar)`)
    continue
  }
  try {
    write(db, () => {
      db.run(sql.toString('utf8'))
      record(db, name, 1, null)
    })
  } catch (e) {
    console.error(`db-migrate: ${name} FALHOU e foi desfeita (nada dela ficou no banco): ${e instanceof Error ? e.message : e}`)
    process.exit(1)
  }
  console.log(`db-migrate: aplicada ${name}`)
  applied++
}
db.close()
console.log(applied ? `db-migrate: ${applied} migração(ões) aplicada(s)` : 'db-migrate: nenhuma migração pendente')

function openForWrite() {
  const db = new Database(dbPath, { create: true })
  db.run('PRAGMA busy_timeout = 60000') // espera o app soltar o lock em vez de falhar
  db.run(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
)`)
  return db
}

/** BEGIN IMMEDIATE pega o lock de escrita já no início (com busy_timeout); erro desfaz tudo. */
function write(db: Database, fn: () => void) {
  db.run('BEGIN IMMEDIATE')
  try {
    fn()
    db.run('COMMIT')
  } catch (e) {
    db.run('ROLLBACK')
    throw e
  }
}

/** Uma linha de _prisma_migrations como o Prisma grava (datas em ms, checksum = sha256 do migration.sql). */
function record(db: Database, name: string, steps: number, logs: string | null) {
  const sql = readFileSync(join(MIGRATIONS, name, 'migration.sql'))
  const now = Date.now()
  db.query(
    'INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)',
  ).run(randomUUID(), createHash('sha256').update(sql).digest('hex'), now, name, logs, now, steps)
}
