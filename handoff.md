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
| 3 | Qualidade dos alertas (conjunto rotulado + barra de precisão) | ✅ no ar |
| 4 | Firefox / Safari / iPhone | ✅ no ar (`CROSS_BROWSER=1`, job `browsers`) |
| 5 | E-mails (relatórios agendados) | ✅ no ar |
| 6 | Resiliência (simulado de restauração) | ✅ no ar |
| 7 | Segurança (ZAP, força bruta no login, sessão) + CSP | ✅ no ar (CSP conferida no ar em 14/10) |
| 8 | WhatsApp real | ⏳ depende de 2 chips do usuário |

## Pendências que só o usuário resolve

- 2 chips para o teste de WhatsApp real (item 8).
- Webhook no painel Stone/Pagar.me: URL `https://app.atenderadar.com.br/api/billing/webhook`, Basic Auth com `PAGARME_WEBHOOK_USER`/`PAGARME_WEBHOOK_PASS`, **todos os eventos** (pode; o sistema ignora o que não é dele).
- Decidir quando virar `PAGARME_MODE=live` (chaves de produção já validadas).
- Caixa de e-mail de contato + `NEXT_PUBLIC_CONTACT_EMAIL`; chave do Resend + `MAIL_PROVIDER`.
- Revisão jurídica de privacidade/termos + razão social e CNPJ.
- Provedor de IA (sobe a cobertura dos alertas; ver item 3).
- Guardar fora do servidor uma cópia da `WA_SESSIONS_KEY` (criada pelo deploy em `app.env`; sem ela as sessões cifradas do WhatsApp e os backups delas não abrem). Ver `docs/operacao/sessoes-whatsapp.md`.
- Definir `SUPPORT_EMAIL` no servidor para receber por e-mail os chamados do "Falar com o suporte" (sem ela, os chamados ficam só no Admin › Suporte).
- Depois que a migração cifrada estiver confirmada, apagar à mão o backup `.tar.gz` das sessões feito antes da cifra (guarda credenciais em texto puro).
- Retenção de dados (card V2): definir prazos.

## Como rodar os testes (Windows)

- Tudo: `bun run test:e2e` (~1400 testes, ~1 h; não pôr `timeout` curto).
- Navegadores extras: `bun run test:e2e:browsers`.
- Só unidade: `bunx playwright test --project=unit`.
- Não rodar duas execuções do Playwright ao mesmo tempo (o servidor de teste usa a porta 3100 e o `prisma/test.db`). Se o servidor de teste "não sobe em 180 s" logo após outra execução, rode de novo.
- Antes de push: `bunx tsc --noEmit` e `bunx eslint . --ignore-pattern ".tmp/**" --ignore-pattern ".bun-cache/**"` (`eslint .` sem isso varre o cache do Playwright).
- Disco apertado: `bun install` com `BUN_INSTALL_CACHE_DIR`, `TEMP` e `TMP` apontando para uma pasta do D:. `bun run build` falha no Windows no `cp -r` (o `next build` funciona).
- Mudança de schema: `bun run db:migrate --name <descricao>` e commitar `prisma/migrations` (B10). O deploy aplica só as migrações que faltam (`db:migrate:deploy`); o CI barra schema sem migração (`db:check`). Ver `docs/operacao/migracoes.md`.

## Cuidados

- `.env` é **rastreado** pelo git e o repo é público: nunca `git add .env` nem `git add -A`. Também não commitar `.env.repo.example`, `.env.servidor`, `prisma/dev.db*`, `.claude/`.
- `git fetch` antes de push: outra sessão também commita na `main`.
- Servidor de desenvolvimento: a 1ª chamada a uma rota ainda não compilada pode perder o corpo do POST (o navegador aborta durante o Fast Refresh). Só acontece em dev; nos testes, compile a rota antes (ex.: jornada).
- WebKit do Playwright não aplica `connect-src` da CSP em nenhuma plataforma (o teste pula a prova de bloqueio nele); Bun não abre os navegadores do Playwright no Windows (usar `node --experimental-strip-types` com `.mts`).

## Diário

### 14/10/2026

- **CSP no ar:** o WebKit do Playwright também não aplica `connect-src` no Linux do CI; prova de bloqueio só em Chromium e Firefox. Deploy verde, cabeçalho e console limpos nos 2 domínios.
- **Backlog do Trello resolvido em ondas paralelas (worktrees, juntadas na branch `integracao`):** páginas de erro amigáveis; README/CHANGELOG/runbook de rollback; máscara de CPF/cartão/CVV no conteúdo; visão geral restrita à equipe do supervisor; "Como calculamos" o valor em risco; perguntas ignoradas (`OpenQuestion`); tela de perfil, reenvio/cancelamento de convite e aceite dos termos; API endurecida (JSON inválido → 400, corpo > 5 MB → 413, teste que descobre as rotas e exige login, auditoria de dependências no CI); cotas de plano (exportações, rebaixamento, aviso de fim do teste); webhook assinado de alertas; encerramento da conta com 7 dias de carência; next 16.3.8 e dependências corrigidas; sessões do WhatsApp cifradas (AES-256-GCM, `WA_SESSIONS_KEY`, migra as existentes); desempenho (T15: índices, `ANALYZE`, consultas mais leves); eventos de produto e custo de IA (I7, Admin › Produto); vínculo atendente ↔ identidade do WhatsApp com confirmação manual (P5); central de ajuda, chamados de suporte e página de status (P8); relatórios com exportação real CSV/XLSX/PDF/JSON e PDF no e-mail agendado (P3).
- **Efeitos para o dono:** após o P5 o nome do atendente aparece como "sugerido" até alguém confirmar a identidade em Equipe; o CSV agora traz valores em dinheiro como número (para planilha); as metas do T15 mais pesadas (M1/M3) ainda ficam acima do alvo com 20 mil conversas.
- **Tour pelo sistema (pedido do dono):** manual interativo por papel, botão no rodapé do menu acima de "Precisa de ajuda?". 15 capítulos (`src/lib/system-tour/content.ts`, motor em `src/components/system-tour/`), passos de explicação / clique / cadastro real (as telas emitem `tourSignal(...)` depois de salvar), progresso por membro (`OrganizationMember.systemTourJson`, `/api/tours/system`), leitura em voz alta pela Web Speech API do navegador (grátis, pt-BR). Ao escrever o manual apareceram divergências tela × código (pesos da nota 30/25/20/15/10 na tela × 30/20/20/20/10 em `score.ts`; "Nome empresarial" não é salvo; "Excluir conexão" sem confirmação; botões de criar visíveis para quem não pode — só o servidor recusa): o manual segue o comportamento real.
- **Onda 4:** Configurações com efeito (números excluídos na ingestão, teto/amostra mínima/"exibir estimativas" no valor, máscara liga/desliga, exportação pelo titular, relatórios diário/semanal viram a ReportDefinition); cota de conversas por mês e teste grátis vencido pausam a análise (`src/lib/billing/analysis-gate.ts`); alertas por e-mail (`src/lib/alert-email.ts`: destinatários pelo escopo, intervalo de 15 min com resumo, silêncio, crítico passa, novas tentativas, descadastro `/descadastrar`; doc `docs/operacao/alertas-por-email.md`); lacunas de teste (matriz de papéis com descoberta de rotas, isolamento na busca e nas exportações, XSS, fluxos de tela, erro 500 e textos longos, onboarding que retoma; botões de escrita escondidos para quem só lê; `%`/`_` literais na busca; Recuperação paginada; checagem de certificado TLS e disco nos workflows).
- **Dev/teste:** o next 16.3 bloqueia `/_next/hmr` vindo de outra origem e a página não hidrata; os testes usam 127.0.0.1, por isso `allowedDevOrigins` em `next.config.ts`. Sintoma: telas do painel em branco nos testes de UI.
- **Atenção do dono:** com `MAIL_PROVIDER=resend` ligado, as regras padrão (todas têm canal e-mail) passam a mandar e-mail. Empresas com 5+ vendas confirmadas passam a usar a média delas como ticket (amostra mínima padrão 5). Teste grátis vencido sem assinatura e assinatura encerrada pausam a análise.
- **Divergências do tour corrigidas no código:** os pesos da nota na tela vêm de `score.ts` (`SCORE_WEIGHTS_PERCENT`); "Nome empresarial" é salvo (`/api/settings`, 2–120 caracteres); "Excluir conexão" pede confirmação; a saúde da conexão mostra a fila real de eventos e "Integração" no lugar de "Protocolo"; contador do menu com contraste AA (#c92029).
- **Disco (máquina de dev):** o D: lota durante a suíte; quem cresce é o disco virtual do WSL do dono (`D:\WSL\Ubuntu\ext4.vhdx`, não mexer). Para rodar a suíte: `.next` como junção para uma pasta no C: (precisa de uma junção `node_modules` ao lado, senão os chunks não acham `next/server`) e `TEMP`/`TMP` no C:.
- **Suíte completa (1748):** passou, depois destas correções: Configurações travam os formulários até os dados chegarem (antes, o que se digitava cedo era sobrescrito e o Salvar gravava o valor antigo); o guia rápido só fecha a gaveta do celular que ele abriu; no tour pelo sistema, o passo que aponta para o menu reabre a gaveta se a pessoa tocar fora; corpo do painel do tour focável (axe). Testes: período sem contar o anunciador de rotas do Next, nome longo só no elemento visível.
- **Novos no backlog (pedidos do dono):** S1 ambiente de simulação só do operador, que o agente também consegue rodar (plano em `docs/planos/ambiente-de-simulacao.md`); S2 áudio do tour gravado no 1º play (TTS no servidor, Azure Speech F0) e narração que explica, não só lê.
- **B10 (migrações versionadas):** `prisma/migrations/0_init` + `scripts/db-migrate.ts`; no 1º deploy o banco de produção vira baseline só se for igual à `0_init` (senão para sem alterar nada). Subiu num deploy separado, depois do anterior.
- **Falta:** V2 (preços/limites, depende do dono), item 8 (chips); provedor de IA (P6 resumo, P9 áudio, B6 cobertura); infra do dono (I2 staging/demo, I3 Sentry/Uptime, I4 rotação, I6 proteção da main, T16 backup externo).

### 13/10/2026

- **Noite:** revisão independente antes do push: CSP sem bloqueios (a política de produção só é exercida depois do deploy: conferir cabeçalho e console no ar). O classificador tinha falsos "frustrado" em perguntas educadas ("vocês podem me atender sábado?", "dor de dente desde ontem"): agora as regras exigem contexto de queixa; cego frustrado 75 % → 86 % de precisão, nada piorou. Ações das telas (alertas, recuperação, conversas, conexões, configurações) agora mostram erro quando falham (`src/lib/mutation.ts`).
- **Chaves Stone (nova integração):** usuário criou chaves novas no painel Stone. A API continua `api.pagar.me/core/v5` — nada muda no código nem na CSP. As 4 chaves foram conferidas na API (secretas 200, públicas geram token) e os 6 secrets `PAGARME_*` do GitHub foram atualizados a partir do `.env` local. Entram no servidor no próximo deploy. Doc: `docs/operacao/cobranca-pagarme.md`.
- **Jornada falhando ao rodar só as telas:** causa = rota `/api/alerts/[id]/resolve` compilada sob demanda no dev perde o corpo do POST. Teste agora compila a rota antes. Não é bug de produção.
- **Achado de produto (tarefa sugerida à parte):** ações da tela de alertas engolem erros (`.catch(() => {})`); se falham, o usuário não vê nada.
- **CSP:** `next.config.ts` (connect-src só self + api.pagar.me + viacep), teste `tests/e2e/csp.ui.spec.ts`, ZAP passa a barrar falta de CSP (`.zap/rules.tsv` regra 10038).
- **Qualidade dos alertas (item 3):** conjuntos rotulados em `tests/unit/qualidade/`; teste `tests/unit/qualidade-alertas.unit.spec.ts`. Treino/validação: barra precisão ≥ 90 % e cobertura ≥ 80 %. Conjunto **cego** (60 conversas, nunca usar para ajustar regras), só com regras de palavras: alta intenção 100 % / 56 %, preço 88 % / 100 %, frustrado 75 % / 40 %, promessa 100 % / 87 % (precisão / cobertura). Barra do cego = "não piorar". Cobertura melhor pede provedor de IA.
- **Em andamento:** suíte Firefox/Safari/iPhone; depois commit + push + acompanhar deploy + Trello.
