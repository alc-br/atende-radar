# AtendeRadar

Auditoria de vendas e atendimento no WhatsApp. A empresa conecta o próprio número (lendo um QR Code) e o
AtendeRadar analisa as conversas: aponta clientes sem retorno, propostas esquecidas, promessas não cumpridas e
vendas em risco, com alertas, fila de recuperação, desempenho da equipe e relatórios. O sistema **não envia
mensagens** pelo número da empresa.

- Site (vendas, blog, privacidade, termos): https://atenderadar.com.br
- App (entrar, cadastro, painel): https://app.atenderadar.com.br
- Teste grátis de 14 dias; assinatura recorrente pelo Pagar.me.

## Stack

| Camada | Tecnologia |
|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript 5 |
| Estilo | Tailwind CSS 4 + CSS do pacote de design (`src/styles/`: `.ar` = painel e contas, `.lp` = site) |
| Banco | SQLite via Prisma 6 (`prisma/schema.prisma`, 33 modelos) |
| Login | NextAuth v4 (credenciais + JWT), papéis por organização |
| WhatsApp | Baileys (`src/lib/whatsapp/`), sessões fora da pasta de deploy |
| Cobrança | Pagar.me API v5, checkout transparente (`src/lib/billing/`) |
| E-mail | Brevo (transacional; sem ele os e-mails ficam na fila `EmailOutbox`) + contatos no Mautic — ver docs/operacao/email.md |
| Runtime e testes | Bun, Playwright |

Domínios: em produção o site e o app ficam em domínios separados (`NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL`,
ver `src/lib/hosts.ts` e `src/proxy.ts`). Sem essas variáveis tudo roda num domínio só (desenvolvimento e testes).

## Rodar localmente

Pré-requisito: [Bun](https://bun.sh/).

```bash
bun install
# variáveis: veja .env.example (lista completa, com comentários).
# Atenção: o .env é rastreado pelo git e o repositório é público. Nunca commite segredo nele.
bunx prisma generate
bun run db:migrate:deploy   # cria/atualiza as tabelas no SQLite pelas migrações (prisma/migrations)
bun prisma/seed.ts          # dados de demonstração
bun run dev                 # http://localhost:3000
```

Conta de demonstração (somente leitura, dados fictícios): botão de demonstração na tela de entrar.

## Scripts (`package.json`)

| Comando | O que faz |
|---|---|
| `bun run dev` | Servidor de desenvolvimento na porta 3000 (log em `dev.log`) |
| `bun run build` | Build de produção (`standalone`) |
| `bun run start` | Sobe o build de produção |
| `bun run lint` / `bun run typecheck` | ESLint / `tsc --noEmit` |
| `bun run db:generate` | Gera o cliente Prisma |
| `bun run db:migrate --name <descricao>` | Gera a migração de uma mudança no `schema.prisma` (commite `prisma/migrations`) |
| `bun run db:migrate:deploy` | Aplica as migrações que faltam, com baseline do banco antigo (o deploy e os testes usam este) |
| `bun run db:check` | Confere se o `schema.prisma` tem migração para tudo (CI) |
| `bun run db:reset` | Zera o banco e reaplica as migrações |
| `bun run db:push` | Aplica o schema direto, **com** `--accept-data-loss`: só para bancos descartáveis (carga) |
| `bun run db:seed` | Seed via `npx tsx prisma/seed.ts` |
| `bun run db:backup` | Backup consistente do banco (`scripts/backup-db.ts`) |
| `bun run test:e2e` | Suíte completa do Playwright |
| `bun run test:e2e:browsers` | Fluxos principais no Firefox, Safari e iPhone |

Outros scripts em `scripts/`: `restore-drill.ts` (ensaio de restauração do backup), `sync-plan-catalog.ts`
(catálogo de planos), `smoke.sh` (fumaça contra o site no ar), `load-test.mjs` (carga).

## Testes

Playwright em `tests/`: `*.spec.ts` = API, `*.ui.spec.ts` = telas (desktop, celular e tablet), `*.unit.spec.ts` = unidade.
O servidor de teste sobe sozinho na porta 3100 com um banco descartável (`prisma/test.db`).

- Tudo: `bun run test:e2e` (~1400 testes, ~1 h).
- Navegadores extras: `bun run test:e2e:browsers`.
- Só unidade: `bunx playwright test --project=unit`.
- Não rode duas execuções do Playwright ao mesmo tempo (porta 3100 e `prisma/test.db` são compartilhados).
- Antes de push: `bunx tsc --noEmit` e `bunx eslint`.

## Deploy

Push na `main` → GitHub Actions (`.github/workflows/deploy.yml`):

1. `test` e `browsers` rodam em runners do GitHub (type-check, lint, Playwright). Se falhar, nada vai ao ar.
2. `deploy` roda no runner próprio do servidor: copia o código para `/opt/atende-radar/current`, faz backup do banco
   e o ensaio de restauração, aplica as migrações (`db:migrate:deploy`, ver `docs/operacao/migracoes.md`), sincroniza o catálogo de planos, faz o build e
   reinicia o serviço `atende-radar` (systemd), com health check.

Outros workflows: `smoke.yml` (fumaça nos dois domínios a cada 6 h), `backup.yml` (backup diário às 03:00 de
Brasília), `zap.yml` (varredura de segurança semanal). Falhas de fumaça e backup abrem issue com o rótulo `operacao`.

Desfazer um deploy ruim: `docs/operacao/rollback.md`.

## Documentação

- `handoff.md`: estado atual, pendências e cuidados (comece por aqui).
- `CHANGELOG.md`: o que mudou, por data.
- `docs/operacao/`: incidentes (`incidente.md`), backup e restauração, rollback, migrações, capacidade, desempenho, cobrança (Pagar.me).
- `docs/suporte/manual.md`: manual de suporte (perguntas frequentes dos clientes e onde olhar).
- `docs/design/guia-de-ui.md`: guia curto de UI (tokens, componentes, textos, estados, acessibilidade).
- `docs/testes/`: roteiro de teste de usabilidade.
- `docs/superpowers/`: especificação e plano do tour guiado.

## Licença

Projeto privado. Todos os direitos reservados.
