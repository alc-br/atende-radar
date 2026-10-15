import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// SQLite com vários escritores: espera o banco liberar (até 20 s) em vez de falhar na hora com "database is locked".
function urlWithLockTimeout(): string | undefined {
  const url = process.env.DATABASE_URL
  if (!url || !url.startsWith('file:') || url.includes('socket_timeout')) return url
  return url + (url.includes('?') ? '&' : '?') + 'socket_timeout=20'
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // query logs só em desenvolvimento (em produção enchem o disco e vazam dados nos logs)
    // DB_QUIET=1: scripts de linha de comando (ex.: bun scripts/simular.ts) sem log do Prisma (erros chegam como exceção)
    log: process.env.DB_QUIET === '1' ? [] : process.env.NODE_ENV === 'production' ? ['error'] : ['query'],
    datasources: urlWithLockTimeout() ? { db: { url: urlWithLockTimeout() as string } } : undefined,
  })

// WAL: leituras não bloqueiam a escrita (o painel abre enquanto mensagens chegam). Fica gravado no arquivo do banco.
if (!globalForPrisma.prisma && (process.env.DATABASE_URL || '').startsWith('file:')) {
  void db.$queryRawUnsafe('PRAGMA journal_mode=WAL').catch(() => {})
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

/**
 * T15 · Estatísticas do planejador do SQLite (sqlite_stat1). Sem elas, numa empresa grande ele escolhe índices ruins
 * para as contagens do painel. `analysis_limit` amostra cada índice (rápido mesmo com o banco grande) e o 0x10002
 * analisa as tabelas que mudaram de tamanho. Mesma conexão para os dois PRAGMAs, por isso a transação.
 */
export async function optimizeDb() {
  if (!(process.env.DATABASE_URL || '').startsWith('file:')) return
  await db.$transaction(async (tx) => {
    await tx.$queryRawUnsafe('PRAGMA analysis_limit=400')
    await tx.$queryRawUnsafe('PRAGMA optimize=0x10002')
  })
}