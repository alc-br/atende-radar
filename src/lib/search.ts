import { db } from '@/lib/db'

// Busca por texto em listas. No SQLite o `contains` do Prisma vira LIKE '%termo%' SEM escapar `%` e `_`:
// buscar "%" ou "_" trazia todas as linhas (dentro da empresa, mas não era o que a pessoa pediu).
// Quando o termo tem um desses caracteres, a busca é feita por instr(), que compara o texto literalmente.

/** O termo tem caractere que o LIKE trataria como curinga? */
export const hasLikeWildcard = (term: string) => /[%_]/.test(term)

/** Contatos da empresa cujo nome ou final do telefone contém o termo literalmente (sem curingas). */
export async function contactIdsMatching(organizationId: string, term: string): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Contact"
    WHERE organizationId = ${organizationId}
      AND (instr(lower(coalesce(displayName, '')), lower(${term})) > 0 OR instr(coalesce(phoneLast4, ''), ${term}) > 0)
    LIMIT 1000`
  return rows.map((r) => r.id)
}
