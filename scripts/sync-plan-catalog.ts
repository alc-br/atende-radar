// Mantém nome e descrição dos planos iguais ao catálogo do site (seed-data), pelo código do plano.
// Idempotente: só atualiza o que estiver diferente. Preços, limites e assinaturas NÃO são tocados.
//   bun scripts/sync-plan-catalog.ts
import { PrismaClient } from '@prisma/client'
import { plans } from '../src/lib/seed-data'

const db = new PrismaClient()

async function main() {
  for (const p of plans) {
    const current = await db.plan.findFirst({ where: { code: p.code } })
    if (!current) {
      console.log(`sync-plan-catalog: plano ${p.code} não existe neste banco — ignorado`)
      continue
    }
    if (current.name === p.name && current.description === p.description) continue
    await db.plan.update({ where: { id: current.id }, data: { name: p.name, description: p.description } })
    console.log(`sync-plan-catalog: ${p.code} → "${p.name}"`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
