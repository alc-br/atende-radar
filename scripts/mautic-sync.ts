// Roda a cada deploy (e pode rodar à mão no servidor). Garante que todo membro de empresa real (não demonstração,
// não simulação) esteja no Mautic como contato, com sistema_origem "atenderadar", as tags de origem e os campos ar_*
// (papel, plano, assinatura...). O mesmo sync roda a cada 6 h dentro do app (src/lib/background.ts).
// Idempotente: o Mautic atualiza o contato que já tem o e-mail, e sistema_origem de outros sistemas é mantido.
// Sem MAUTIC_URL/USUARIO/SENHA não faz nada. Nunca imprime credenciais nem e-mails.
//   bun scripts/mautic-sync.ts
import { db } from '../src/lib/db'
import { mauticEnabled, syncAllMembersToMautic } from '../src/lib/mautic'

async function main() {
  if (!mauticEnabled()) {
    console.log('mautic-sync: MAUTIC_URL/USUARIO/SENHA ausentes — nada a fazer')
    return
  }
  const r = await syncAllMembersToMautic()
  for (const e of r.errors) console.log(`mautic-sync: falha: ${e}`)
  console.log(`mautic-sync: ${r.ok} contatos sincronizados, ${r.failed} falhas (de ${r.total} membros)`)
  if (r.failed && !r.ok) process.exitCode = 1
}

main()
  .catch((e) => {
    // erro do Prisma vem em várias linhas (a causa fica na última)
    console.error(`mautic-sync: ${e instanceof Error ? e.message.trim().split('\n').pop() : 'erro'}`)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
