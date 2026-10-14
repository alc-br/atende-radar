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
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
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

/** Em produção o app continua escrevendo no SQLite durante o deploy: "database is locked" é passageiro, tenta de novo. */
function prismaWrite(args: string[], opts: { env?: Record<string, string> } = {}) {
  for (let attempt = 1; ; attempt++) {
    const r = prisma(args, opts)
    if (r.code === 0 || !/database is locked/i.test(r.out) || attempt >= 10) return r
    console.log(`db-migrate: banco ocupado pelo app, tentando de novo (${attempt}/9)`)
    Bun.sleepSync(3000)
  }
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
    const resolved = prismaWrite(['migrate', 'resolve', '--applied', BASELINE], { env: { DATABASE_URL: absUrl } })
    if (resolved.code !== 0) process.exit(resolved.code)
    console.log(`db-migrate: ${BASELINE} marcada como aplicada (baseline do banco existente)`)
  }
}

const deploy = prismaWrite(['migrate', 'deploy'], { env: { DATABASE_URL: absUrl } })
process.exit(deploy.code)
