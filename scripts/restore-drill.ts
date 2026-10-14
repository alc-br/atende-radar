// Ensaio de restauração: pega o backup mais recente, restaura numa cópia temporária e abre com o MESMO Prisma do app.
// Prova que o backup volta a ser um banco utilizável (não só um arquivo íntegro). Não toca no banco em uso.
//   bun scripts/restore-drill.ts
// Variáveis: BACKUP_DIR (padrão ../backups), DATABASE_URL (banco em uso, só para comparar contagens; lido em modo leitura).
import { Database } from 'bun:sqlite'
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

const backupDir = resolve(process.cwd(), process.env.BACKUP_DIR || '../backups')
const backups = existsSync(backupDir)
  ? readdirSync(backupDir).filter((f) => /^atenderadar-.*\.db$/.test(f)).map((f) => join(backupDir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  : []
if (!backups.length) {
  console.error(`restore-drill: nenhum backup em ${backupDir}`)
  process.exit(1)
}

const work = mkdtempSync(join(tmpdir(), 'ar-restore-'))
const restored = join(work, 'restaurado.db')
copyFileSync(backups[0], restored)
const prisma = new PrismaClient({ datasources: { db: { url: `file:${restored}` } } })
let failed = false
try {
  const counts = {
    empresas: await prisma.organization.count(),
    membros: await prisma.organizationMember.count(),
    conversas: await prisma.conversation.count(),
    mensagens: await prisma.message.count(),
    alertas: await prisma.alert.count(),
    assinaturas: await prisma.subscription.count(),
  }
  // consulta com relações, como as telas fazem. Só colunas antigas: o backup é feito ANTES das migrações deste deploy,
  // então ainda não tem as colunas novas que o cliente Prisma (já gerado com o schema novo) conhece.
  const org = await prisma.organization.findFirst({
    select: { id: true, members: { take: 1, select: { id: true } }, conversations: { take: 1, select: { id: true } } },
  })
  if (counts.empresas === 0 || !org) throw new Error('backup restaurado sem nenhuma empresa')

  // o backup foi feito agora há pouco: não pode ter MAIS empresas que o banco em uso
  const url = process.env.DATABASE_URL || ''
  if (url.startsWith('file:')) {
    const raw = url.slice('file:'.length).split('?')[0]
    const live = isAbsolute(raw) ? raw : resolve(process.cwd(), 'prisma', raw)
    if (existsSync(live)) {
      const db = new Database(live, { readonly: true })
      const n = (db.query('SELECT count(*) AS n FROM Organization').get() as { n: number }).n
      db.close()
      if (counts.empresas > n) throw new Error(`backup tem ${counts.empresas} empresas e o banco em uso ${n}`)
    }
  }
  console.log(`restore-drill: ${backups[0].split(/[\\/]/).pop()} restaurado e lido pelo app: ${JSON.stringify(counts)}`)
} catch (e) {
  failed = true
  console.error('restore-drill: FALHOU:', e instanceof Error ? e.message : e)
} finally {
  await prisma.$disconnect()
  rmSync(work, { recursive: true, force: true })
}
process.exit(failed ? 1 : 0)
