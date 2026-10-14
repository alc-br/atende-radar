// Acesso direto ao banco DESCARTÁVEL de teste (nunca produção) para ler os e-mails "enviados".
import { PrismaClient } from '@prisma/client'

export const testDb = new PrismaClient({ datasources: { db: { url: 'file:./test.db' } } })

/** Último e-mail de conta enviado para o endereço; devolve o token do link (…?token=XYZ). Ignora alertas por e-mail. */
export async function lastTokenFor(email: string): Promise<string> {
  const mail = await testDb.emailOutbox.findFirst({ where: { toEmail: email, kind: null }, orderBy: { createdAt: 'desc' } })
  if (!mail) throw new Error(`nenhum e-mail para ${email}`)
  const m = mail.body.match(/token=([A-Za-z0-9_-]+)/)
  if (!m) throw new Error(`e-mail sem token: ${mail.body}`)
  return m[1]
}

export async function mailsTo(email: string) {
  return testDb.emailOutbox.findMany({ where: { toEmail: email }, orderBy: { createdAt: 'asc' } })
}
