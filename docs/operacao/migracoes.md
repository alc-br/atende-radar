# Migrações do banco (B10)

O schema do banco muda só por **migrações versionadas** em `prisma/migrations/`. Cada uma é um `migration.sql`
revisado no git; o deploy aplica as que faltam, em ordem, e registra cada uma na tabela `_prisma_migrations`.

## Mudar o schema

1. Edite `prisma/schema.prisma`.
2. Gere a migração (no seu `dev.db`):
   ```bash
   bun run db:migrate --name descricao-curta
   ```
3. **Leia o `migration.sql` gerado.** Prefira mudanças aditivas (campo opcional ou com default, modelo novo, índice).
   Renomear ou apagar coluna apaga dados: faça em duas etapas (adiciona o novo, copia, e só num deploy posterior remove o antigo).
4. Commite o `schema.prisma` **e** a pasta `prisma/migrations/<data>_descricao-curta`.

O CI (`bun run db:check`) falha se o `schema.prisma` tiver mudança sem migração. Os testes criam o banco pelas
migrações (`playwright.config.ts`), então migração quebrada derruba os testes antes de chegar ao servidor.

Nunca edite nem apague uma migração que já foi ao ar: crie outra.

## O que o deploy faz

`bun run db:migrate:deploy` (`scripts/db-migrate.ts`), depois do backup do banco.

**O serviço para alguns segundos quando há migração.** O Prisma não grava no SQLite enquanto outro processo mantém o
banco aberto ("database is locked"), e o app mantém. O deploy roda `bun scripts/db-migrate.ts --pending` (só lê): se há
migração (ou o baseline) a aplicar, para o `atende-radar.service`, aplica e religa (com o build anterior; o build novo
entra no restart do fim). Sem migração pendente, o serviço não para. Por isso migrações precisam ser aditivas: o
código da versão anterior roda por alguns minutos com o schema novo.

Casos:

- Banco já com histórico: `prisma migrate deploy` (aplica só as que faltam; sem nada novo, não faz nada).
- Banco vazio ou inexistente: aplica todas, a partir da `0_init`.
- **Banco antigo, criado pelo `db push`** (sem `_prisma_migrations`): compara o banco com a `0_init`
  (`prisma migrate diff`). Se for **igual**, marca a `0_init` como aplicada (baseline) e segue. Se for **diferente**,
  para com o SQL da diferença e **não altera nada**: o site continua na versão anterior.
  No log do deploy: `db-migrate: 0_init marcada como aplicada (baseline do banco existente)`.

## Se uma migração falhar no servidor

O deploy para antes do build (o serviço continua com a versão anterior). O backup daquele deploy está em
`/opt/atende-radar/backups` (ver `rollback.md`, passo 3).

1. Leia o erro no log do passo "Prisma generate e migrações do banco".
2. Se a migração ficou marcada como falha, depois de corrigir o banco à mão:
   `bunx prisma migrate resolve --rolled-back <nome>` (vai tentar de novo) ou `--applied <nome>` (já foi aplicada à mão).
3. Corrija no git com uma migração nova e faça push.

Desfazer um deploy com migração: `rollback.md`, passo 1.
