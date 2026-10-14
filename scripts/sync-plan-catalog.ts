// Roda a cada deploy. Leva para o banco as mudanças de nome/descrição feitas no CÓDIGO (src/lib/seed-data.ts), mas só
// em planos que ninguém editou em Admin › Planos: um campo só é trocado se ainda guarda um valor antigo do código
// (PREVIOUS_CATALOG em src/lib/plan-catalog.ts). O que o operador editou no Admin nunca é sobrescrito.
// Preços, destaques, limites, ativo/inativo e assinaturas NÃO são tocados. Idempotente.
//   bun scripts/sync-plan-catalog.ts
import { PrismaClient } from '@prisma/client'
import { plans } from '../src/lib/seed-data'
import { catalogSyncPatch } from '../src/lib/plan-catalog'

const db = new PrismaClient()

async function main() {
  for (const p of plans) {
    const current = await db.plan.findFirst({ where: { code: p.code } })
    if (!current) {
      console.log(`sync-plan-catalog: plano ${p.code} não existe neste banco — ignorado`)
      continue
    }
    const patch = catalogSyncPatch(p.code, current, p)
    if (!patch) {
      if (current.name !== p.name || current.description !== p.description) console.log(`sync-plan-catalog: ${p.code} editado no Admin — mantido`)
      continue
    }
    await db.plan.update({ where: { id: current.id }, data: patch })
    console.log(`sync-plan-catalog: ${p.code} → ${JSON.stringify(patch)}`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
