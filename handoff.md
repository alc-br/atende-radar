# Handoff — AtendeRadar

Estado atual do trabalho, para quem continuar (pessoa ou agente). Atualizado ao longo do trabalho; a entrada mais recente fica no topo do **Diário**.
Sem segredos aqui: o repositório é público.

## Onde está no ar

- Site (vendas, blog, privacidade, termos): https://atenderadar.com.br
- App (entrar, cadastro, painel): https://app.atenderadar.com.br
- Deploy: push na `main` → GitHub Actions (`.github/workflows/deploy.yml`): jobs `test` + `browsers` → `deploy` (runner no servidor) → simulado de restauração do banco. Fumaça a cada 6 h (`smoke.yml`), ZAP passivo semanal (`zap.yml`).
- Segredos do servidor: `/opt/atende-radar/shared/app.env` (gravados pelo deploy a partir dos secrets do GitHub).
- Quadro do Trello: "AtendeRadar · Go-Live & Backlog" — card **GATE DE GO-LIVE** tem o veredito "pode vender".

## Bateria de testes "pode vender" (pedido do usuário, 8 itens)

| # | Item | Situação |
|---|---|---|
| 1 | Fumaça nos 2 domínios | ✅ no ar |
| 2 | Jornada completa do cliente (site → cancelamento) | ✅ no ar (`tests/e2e/jornada.ui.spec.ts`) |
| 3 | Qualidade dos alertas (conjunto rotulado + barra de precisão) | ✅ pronto, falta push (ver Diário) |
| 4 | Firefox / Safari / iPhone | ✅ no ar (`CROSS_BROWSER=1`, job `browsers`) |
| 5 | E-mails (relatórios agendados) | ✅ no ar |
| 6 | Resiliência (simulado de restauração) | ✅ no ar |
| 7 | Segurança (ZAP, força bruta no login, sessão) + CSP | ✅ CSP pronta, falta push |
| 8 | WhatsApp real | ⏳ depende de 2 chips do usuário |

## Pendências que só o usuário resolve

- 2 chips para o teste de WhatsApp real (item 8).
- Webhook no painel Stone/Pagar.me: URL `https://app.atenderadar.com.br/api/billing/webhook`, Basic Auth com `PAGARME_WEBHOOK_USER`/`PAGARME_WEBHOOK_PASS`, **todos os eventos** (pode; o sistema ignora o que não é dele).
- Decidir quando virar `PAGARME_MODE=live` (chaves de produção já validadas).
- Caixa de e-mail de contato + `NEXT_PUBLIC_CONTACT_EMAIL`; chave do Resend + `MAIL_PROVIDER`.
- Revisão jurídica de privacidade/termos + razão social e CNPJ.
- Provedor de IA (sobe a cobertura dos alertas; ver item 3).

## Como rodar os testes (Windows)

- Tudo: `bun run test:e2e` (~900 testes, ~45 min; não pôr `timeout` curto).
- Navegadores extras: `bun run test:e2e:browsers`.
- Só unidade: `bunx playwright test --project=unit`.
- Não rodar duas execuções do Playwright ao mesmo tempo (o servidor de teste usa a porta 3100 e o `prisma/test.db`). Se o servidor de teste "não sobe em 180 s" logo após outra execução, rode de novo.
- Antes de push: `bunx tsc --noEmit` e `bunx eslint`.

## Cuidados

- `.env` é **rastreado** pelo git e o repo é público: nunca `git add .env` nem `git add -A`. Também não commitar `.env.repo.example`, `.env.servidor`, `prisma/dev.db*`, `.claude/`.
- `git fetch` antes de push: outra sessão também commita na `main`.
- Servidor de desenvolvimento: a 1ª chamada a uma rota ainda não compilada pode perder o corpo do POST (o navegador aborta durante o Fast Refresh). Só acontece em dev; nos testes, compile a rota antes (ex.: jornada).
- WebKit do Playwright no Windows não aplica `connect-src` da CSP; Bun não abre os navegadores do Playwright no Windows (usar `node --experimental-strip-types` com `.mts`).

## Diário

### 13/10/2026

- **Noite:** revisão independente antes do push: CSP sem bloqueios (a política de produção só é exercida depois do deploy: conferir cabeçalho e console no ar). O classificador tinha falsos "frustrado" em perguntas educadas ("vocês podem me atender sábado?", "dor de dente desde ontem"): agora as regras exigem contexto de queixa; cego frustrado 75 % → 86 % de precisão, nada piorou. Ações das telas (alertas, recuperação, conversas, conexões, configurações) agora mostram erro quando falham (`src/lib/mutation.ts`).
- **Chaves Stone (nova integração):** usuário criou chaves novas no painel Stone. A API continua `api.pagar.me/core/v5` — nada muda no código nem na CSP. As 4 chaves foram conferidas na API (secretas 200, públicas geram token) e os 6 secrets `PAGARME_*` do GitHub foram atualizados a partir do `.env` local. Entram no servidor no próximo deploy. Doc: `docs/operacao/cobranca-pagarme.md`.
- **Jornada falhando ao rodar só as telas:** causa = rota `/api/alerts/[id]/resolve` compilada sob demanda no dev perde o corpo do POST. Teste agora compila a rota antes. Não é bug de produção.
- **Achado de produto (tarefa sugerida à parte):** ações da tela de alertas engolem erros (`.catch(() => {})`); se falham, o usuário não vê nada.
- **CSP:** `next.config.ts` (connect-src só self + api.pagar.me + viacep), teste `tests/e2e/csp.ui.spec.ts`, ZAP passa a barrar falta de CSP (`.zap/rules.tsv` regra 10038).
- **Qualidade dos alertas (item 3):** conjuntos rotulados em `tests/unit/qualidade/`; teste `tests/unit/qualidade-alertas.unit.spec.ts`. Treino/validação: barra precisão ≥ 90 % e cobertura ≥ 80 %. Conjunto **cego** (60 conversas, nunca usar para ajustar regras), só com regras de palavras: alta intenção 100 % / 56 %, preço 88 % / 100 %, frustrado 75 % / 40 %, promessa 100 % / 87 % (precisão / cobertura). Barra do cego = "não piorar". Cobertura melhor pede provedor de IA.
- **Em andamento:** suíte Firefox/Safari/iPhone; depois commit + push + acompanhar deploy + Trello.
