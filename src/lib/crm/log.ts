import { Prisma } from '@prisma/client'

/** Tipo e código do erro para o log. Sem e.message: a do Prisma pode citar valores da consulta (telefone, e-mail). */
export function errTag(e: unknown): string {
  const code = e instanceof Prisma.PrismaClientKnownRequestError ? ` ${e.code}` : ''
  return `${e instanceof Error ? e.name : 'erro'}${code}`
}
