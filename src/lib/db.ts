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
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['query'],
    datasources: urlWithLockTimeout() ? { db: { url: urlWithLockTimeout() as string } } : undefined,
  })

// WAL: leituras não bloqueiam a escrita (o painel abre enquanto mensagens chegam). Fica gravado no arquivo do banco.
if (!globalForPrisma.prisma && (process.env.DATABASE_URL || '').startsWith('file:')) {
  void db.$queryRawUnsafe('PRAGMA journal_mode=WAL').catch(() => {})
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db