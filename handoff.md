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
- **Backup diário + cópia no Google Drive** (escolhido em 15/10): o usuário precisa dizer qual conta do Google e qual pasta usar e autorizar o acesso. Depois disso, implementar o agendamento diário no servidor (pelo workflow de deploy) e a cópia para o Drive (ex.: rclone). Ainda não começado.
- **Atualizar o CNPJ na Receita:** a Dash Stone mostra o aviso "Atualize seu CNPJ na Receita Federal… evitar que sua Conta Stone seja encerrada".
- Decidir quando virar `PAGARME_MODE=live` (chaves de produção já validadas; Pagar.me só vai para produção depois do T19). Na 1ª venda real, conferir em Dash Stone › Vendas online › Webhooks › Eventos se o aviso chegou com autenticação OK.
- Revisão jurídica de privacidade/termos.
- Provedor de IA (sobe a cobertura dos alertas; ver item 3).
- Guardar fora do servidor uma cópia da `WA_SESSIONS_KEY` (criada pelo deploy em `app.env`; sem ela as sessões cifradas do WhatsApp e os backups delas não abrem). Ver `docs/operacao/sessoes-whatsapp.md`.
- Definir `SUPPORT_EMAIL` no servidor para receber por e-mail os chamados do "Falar com o suporte" (sem ela, os chamados ficam só no Admin › Suporte).
- Depois que a migração cifrada estiver confirmada, apagar à mão o backup `.tar.gz` das sessões feito antes da cifra (guarda credenciais em texto puro).
- Guardar fora do servidor uma cópia da `PHONE_ENC_KEY` (criada pelo deploy em `app.env`; sem ela os telefones completos dos clientes, no banco e nos backups, não abrem). Ver `docs/operacao/telefone-cifrado.md`.
- Decidir se liga o ambiente de simulação (`SIMULATION_ENABLED`, `SIMULATION_SECRET`). Ver `docs/operacao/simulacao.md`.
- Conferir a RAM real do servidor antes de aplicar o drop-in do systemd proposto no I8 (supõe 4 GB).
- V7: confirmar o texto dos termos sobre arrependimento em 7 dias e mudança de preço (Admin › Planos muda só contratos novos).

## Como rodar os testes (Windows)

- Tudo: `bun run test:e2e` (~1400 testes, ~1 h; não pôr `timeout` curto).
- Navegadores extras: `bun run test:e2e:browsers`.
- Só unidade: `bunx playwright test --project=unit`.
- Uma execução do Playwright por checkout: o banco de teste é o `prisma/test.db` daquele checkout. Para rodar ao mesmo tempo em outro worktree, use outra porta (`E2E_PORT=3111`). Com `node_modules` como junção, defina também `TURBOPACK_ROOT` com a raiz do repositório principal. Se o servidor de teste "não sobe em 180 s" logo após outra execução, rode de novo.
- Antes de push: `bunx tsc --noEmit` e `bunx eslint . --ignore-pattern ".tmp/**" --ignore-pattern ".bun-cache/**"` (`eslint .` sem isso varre o cache do Playwright).
- Disco apertado: `bun install` com `BUN_INSTALL_CACHE_DIR`, `TEMP` e `TMP` apontando para uma pasta do D:. `bun run build` falha no Windows no `cp -r` (o `next build` funciona).
- Mudança de schema: `bun run db:migrate --name <descricao>` e commitar `prisma/migrations` (B10). O deploy aplica só as migrações que faltam (`db:migrate:deploy`); o CI barra schema sem migração (`db:check`). Ver `docs/operacao/migracoes.md`.

## Cuidados

- `.env` é **rastreado** pelo git e o repo é público: nunca `git add .env` nem `git add -A`. Também não commitar `.env.repo.example`, `.env.servidor`, `prisma/dev.db*`, `.claude/`.
- `git fetch` antes de push: outra sessão também commita na `main`.
- Servidor de desenvolvimento: a 1ª chamada a uma rota ainda não compilada pode perder o corpo do POST (o navegador aborta durante o Fast Refresh). Só acontece em dev; nos testes, compile a rota antes (ex.: jornada).
- Runner do deploy: o único `sudo` liberado é `systemctl restart atende-radar.service`. Tudo o que roda antes do restart roda com o app no ar.
- Worktrees com `node_modules` como junção: o Turbopack do `next dev` recusa o link ("Symlink ... points out of the filesystem root") a menos que `TURBOPACK_ROOT` aponte uma pasta acima dos dois (`next.config.ts`).
- WebKit do Playwright não aplica `connect-src` da CSP em nenhuma plataforma (o teste pula a prova de bloqueio nele); Bun não abre os navegadores do Playwright no Windows (usar `node --experimental-strip-types` com `.mts`).

## Diário

### 16/10/2026

- **Stone conferida ao vivo (pedido do usuário: "fazer funcionar a integração da Stone"):** a integração já é a da Stone e não precisa trocar de API. As chaves da Dash Stone funcionam na API v5 em produção e teste (200), e o token de cartão é gerado de qualquer origem: a dúvida dos "domínios do checkout transparente" está resolvida. No sandbox funcionaram pedido avulso, estorno e Pix com QR Code. A conta **real** entregou o webhook `customer.created` aos 3 sistemas (AtendeRadar, Completa, ALCADEMY), todos com resposta 200 (`GET /core/v5/hooks`).
  - **Por que a aba Eventos fica vazia nas vendas de teste:** a conta de **teste** tem zero entregas de webhook, porque o cadastro existe só na conta real. Em teste o sistema se sincroniza pela varredura de 15 min.
  - A API "Stone Online" (online.stone.com.br, que o usuário indicou) é de autorizador: pede PCI DSS e não tem assinatura, cliente nem webhook. A doc da própria Stone manda usar a Pagar.me nesse caso.
  - Novo **`docs/manual-stone.md`**: manual para os outros sistemas (chaves, token, assinatura, pedido avulso, Pix, estorno, webhook com conta compartilhada, testes, produção, armadilhas).
  - Falta só a decisão do usuário: `PAGARME_MODE=live` e a 1ª venda real de valor baixo com estorno.
- **NFS-e Padrão Nacional (backlog, card F1 no Trello):** emitir nota no pagamento e cancelar no reembolso, nos 3 sistemas. Está em levantamento, nada foi construído. O certificado e-CNPJ A1 (.p12) está com o usuário, fora do repo. Perguntas ao contador e decisões em aberto estão no card.

### 15/10/2026

- **Stone x Pagar.me:** o Pagar.me virou Stone. A conta opera pela **Dash Stone** (conta.stone.com.br, Al Chipak Treinamentos, CNPJ 22.629.446/0001-12). O dash.pagar.me ficou só para consulta e mostra a conta antiga "ilivin digital" como INATIVO. Isso é esperado.
  - A integração já está na Stone: as cobranças dos testes ("Clínica Teste Ltda") aparecem em Vendas online › Vendas de teste.
  - A API continua a v5 (`api.pagar.me/core/v5`), documentada em docs.pagar.me, que é a doc que a Stone indica para assinatura. As mudanças de 28/08/2026 (docs.pagar.me/docs/mudanças-de-apis: payables, settlements, saldo, antecipações) não atingem o que usamos. A única com efeito possível é a da cobrança reprocessada, que ganha novo id; o estorno usa o id da cobrança atual da fatura.
  - "Stone Online" (online.stone.com.br) é outro produto: API de autorizador para quem tem antifraude, guarda de cartão e recorrência próprios. Não serve para nós.
  - O webhook está ativo em Vendas online › Webhooks: `https://app.atenderadar.com.br/api/billing/webhook`, com autenticação e todos os eventos. A aba Eventos estava vazia mesmo com vendas de teste. Não descobrimos se a Stone simplesmente não envia avisos de vendas de teste; confirmar na 1ª venda real.
  - Em aberto: a lista de "domínios do checkout transparente" no painel antigo não tem atenderadar.com.br. Não se sabe se ainda vale na Stone; conferir na 1ª cobrança real e só alterar com o ok do usuário.
  - O classificador bloqueia abrir a tela de chaves no navegador; não insistir.
- **Tour, cadastro espera a pessoa:** na leitura automática, o passo de cadastro mostra onde preencher e espera a pessoa salvar (`AUTO_TASK_MESSAGE` em `auto-actions.ts`). Se a pessoa pular com Próximo, o capítulo fica por concluir.
- **Planos sem "dias de histórico":** a página de vendas, Planos, checkout e o catálogo do Admin não mostram mais o histórico por plano. A retenção real é igual para todos: texto 365 dias, conversas e auditoria 730, eventos 400.
- **Mautic:** o descadastro em um clique foi conferido com o e-mail de teste #41, já despublicado. O remetente padrão da instância é ALC; e-mails do AtendeRadar precisam usar `AtendeRadar <contato@atenderadar.com.br>` (`docs/operacao/email.md`).
- Publicado na `main` (9f10c5f); deploy OK.
- **Novo no backlog (pedido do dono), V8 "impacto na entrada":** quando o dono da empresa (assinante, papel administrador) entra no sistema, a primeira coisa que vê precisa mostrar o valor da plataforma com números reais da empresa dele:
  - quanto dinheiro pode ter perdido (oportunidades em risco ou perdidas, em R$);
  - atendimentos ruins (sem resposta, demora, frustração, promessas sem retorno);
  - comparação com o período anterior e o que já foi recuperado.
  - Usa o que o motor já calcula ("Como calculamos", valor em risco, alertas). Nunca números inventados: sem dados suficientes, mostra o que falta para medir (ex.: conectar o WhatsApp).
  - Ainda não desenhado nem implementado.

### 14/10/2026

- **Tour, destaque em 3 níveis (pedido do dono):** o item a clicar fica aceso com o anel, a região de que se fala (menu lateral, barra do topo) fica em meia-luz e o resto mais escuro sem esconder. Desenho em SVG com máscaras (`Spotlight` em `system-tour-panel.tsx`), região pelo `area` do passo ou deduzida do alvo (`stepArea`).
  - Com Ouvir ou Ler automaticamente, trechos da narração (`NARRATION_CUES` em `narration.ts`) trocam o foco: "menu lateral" acende o menu inteiro com contorno; ao falar do item, o anel volta. O progresso vem do `currentTime` do áudio da Azure ou do `onboundary`/estimativa da voz do navegador (`use-speech.ts`).
  - A narração do passo do menu ganhou a frase "o destacado agora, Visão Geral" (áudio novo gerado pelo deploy).
- **Ondas juntadas na `main` (branch `integracao`):** V7, docs, P7, S1 e B6. Conflitos resolvidos: o catálogo de planos ficou em `src/lib/plan-catalog.ts` (`PLAN_CATALOG`, dados) com a regra do V7 no sync (não sobrescreve o que o operador editou no Admin); admin, exclusão de empresa e rbac somam os dois lados.
- **V7 Cobrança e catálogo:** reativar a renovação depois de cancelar, enquanto o período pago dura (assinatura de continuação na Pagar.me com início no dia seguinte ao fim do período); Admin › Planos edita nome, descrição, destaques, selo "Mais escolhido", preço para contratos novos e se está à venda (limites e código não); FAQ do site com risco de banimento, cancelamento e sem fidelidade, mais o FAQPage em JSON-LD.
- **Docs e polimento (branch `wave-docs`):** guia de UI curto (D5), manual de suporte e runbook de incidente (I5), medição de LCP (V6: 3,1 s na 1ª medição), proposta de drop-in do systemd (I8, supõe 4 GB de RAM; não aplicada), teste de isolamento pelas telas (T3), varredura de design em 1440/1920 (D1); canais por regra de alerta; operador responde chamado por e-mail (pelo `EmailOutbox`, sem tabela própria); erros de convite e de conexão aparecem na tela; mensagem própria após 5 tentativas de login.
- **B6 Motor de análise:** alertas da mesma conversa e causa viram um só (reabre com "Repetiu N vezes", sem novo e-mail); evento novo de webhook `alert.updated` (opt-in); ganho/perda detectados de forma conservadora pelas mensagens; correção humana nunca é desfeita. Migração `20261014231053_alert_grouping`.
- **P7 / B5 / B9:**
  - **P7 Meu perfil:**
    - Troca de e-mail: pede a senha atual e manda um link de uso único (24 h) para o NOVO e-mail. O e-mail só muda depois da confirmação, e o antigo é avisado no pedido e na troca.
    - Foto do perfil aparece no menu do usuário. Logotipo da empresa (Configurações › Empresa) aparece na barra superior.
    - As imagens ficam em `UPLOADS_DIR` (`/opt/atende-radar/shared/uploads`), servidas por `/api/media/...` só para a própria empresa. Entram no backup.
  - **B5/B9:** telefone completo do cliente cifrado em `Contact.phoneEncrypted` com a `PHONE_ENC_KEY`. Aparece no detalhe da conversa ("Mostrar", auditado) e na exportação LGPD. Doc: `docs/operacao/telefone-cifrado.md`.
  - Migração `20261014230745_profile_media_email_change`; o deploy cria `UPLOADS_DIR` e `PHONE_ENC_KEY`.
- **S1 Ambiente de simulação (desligado por padrão):** fases 1 a 3 do plano `docs/planos/ambiente-de-simulacao.md`.
  - Empresas `isSimulation` ficam isoladas: fora do motor agendado, de e-mails, webhooks, cobrança, relatórios, analytics e Admin.
  - O provider `simulator` passa pela mesma ingestão do WhatsApp real. O relógio é virtual.
  - São 16 cenários com verificações, rodados pelo CLI `bun scripts/simular.ts`, pela API `/api/admin/simulation/*` e pela aba Simulação do Admin.
  - Migração `20261014230746_simulation`. Manual: `docs/operacao/simulacao.md`.
  - O deploy cria `SIMULATION_ENABLED=off`. Ligar é decisão do dono.
  - Pendentes: "entrar como gestor/atendente" e os cenários da fase 4.
  - De quebra, a exclusão de empresa passou a apagar também o webhook (endereço e segredo) e a fila de entregas, que antes ficavam no banco.

- **Noite (deploy 6513534, no ar):**
  - **S2 Narração do tour:** voz da Azure Speech, plano F0, com a voz pt-BR-FranciscaNeural (`src/lib/system-tour/tts.ts`, rota `/api/tour-audio/...`).
    - Cada texto é gerado uma vez e fica em cache por sha256 em `TOUR_AUDIO_DIR` (`/opt/atende-radar/shared/tour-audio`, fora do `current/`).
    - O deploy roda `scripts/tour-audio-warm.ts` depois do restart e gera só o que falta. No 1º deploy foram 79 textos e 21.579 caracteres.
    - Quando um texto muda, só aquele é gerado de novo. Para refazer todos (outra voz, outro SSML), suba a versão em `tts.ts`.
    - Sem a Azure, o navegador lê com a própria voz.
    - Os secrets `AZURE_SPEECH_KEY` e `AZURE_SPEECH_REGION` vêm do GitHub. Doc: `docs/operacao/tour-audio.md`.
  - **Tour, "Ler automaticamente":** botão no meio do rodapé que lê e avança sozinho.
    - A velocidade vai de 0,8× a 2× e vale para todos os passos.
    - No modo automático, um cursor simula o clique ou a seleção de cada passo (`src/components/system-tour/auto-actions.ts`).
    - Passos que criariam ou mudariam dados (`autoAction: 'demo'`) só mostram onde fica. Nunca executam.
  - **Painel na largura toda:** `.ar .conteudo` não para mais em 1440px. Conferido em 1440, 1920 e 2560, sem rolagem horizontal.
  - **CI:**
    - O job `test` leva ~21 min e o limite passou de 25 para 35 min, porque novas tentativas de poucos testes já cancelavam o job inteiro.
    - O TTS falso dos testes cria a pasta do log, que não existe num checkout limpo.
- **B10 no ar (deploy 9054a3d):** o banco de produção virou baseline da `0_init` automaticamente.
  - O schema engine do Prisma não grava no SQLite com o app aberto ("database is locked").
  - O runner só tem `sudo systemctl restart`. `stop` pede senha, então não dá para parar o app para migrar.
  - Por isso `scripts/db-migrate.ts` aplica cada `migration.sql` sozinho, em `BEGIN IMMEDIATE` com espera do lock, e grava `_prisma_migrations` no formato do Prisma (`prisma migrate status` lê igual).
  - Migração com erro é desfeita inteira e o deploy para.
  - Migrações precisam ser aditivas: o build antigo roda com o schema novo até o restart.
  - O ensaio de restauração só lê colunas que existem antes da migração do deploy, porque o backup é feito antes.
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
- **Falta:** V2 (preços/limites, depende do dono), item 8 (chips); provedor de IA (P6 resumo, P9 áudio, B6 cobertura); infra do dono (I2 staging/demo, I3 Sentry/Uptime, I4 rotação, I6 proteção da main, T16 backup externo).

### 13/10/2026

- **Noite:** revisão independente antes do push: CSP sem bloqueios (a política de produção só é exercida depois do deploy: conferir cabeçalho e console no ar). O classificador tinha falsos "frustrado" em perguntas educadas ("vocês podem me atender sábado?", "dor de dente desde ontem"): agora as regras exigem contexto de queixa; cego frustrado 75 % → 86 % de precisão, nada piorou. Ações das telas (alertas, recuperação, conversas, conexões, configurações) agora mostram erro quando falham (`src/lib/mutation.ts`).
- **Chaves Stone (nova integração):** usuário criou chaves novas no painel Stone. A API continua `api.pagar.me/core/v5` — nada muda no código nem na CSP. As 4 chaves foram conferidas na API (secretas 200, públicas geram token) e os 6 secrets `PAGARME_*` do GitHub foram atualizados a partir do `.env` local. Entram no servidor no próximo deploy. Doc: `docs/operacao/cobranca-pagarme.md`.
- **Jornada falhando ao rodar só as telas:** causa = rota `/api/alerts/[id]/resolve` compilada sob demanda no dev perde o corpo do POST. Teste agora compila a rota antes. Não é bug de produção.
- **Achado de produto (tarefa sugerida à parte):** ações da tela de alertas engolem erros (`.catch(() => {})`); se falham, o usuário não vê nada.
- **CSP:** `next.config.ts` (connect-src só self + api.pagar.me + viacep), teste `tests/e2e/csp.ui.spec.ts`, ZAP passa a barrar falta de CSP (`.zap/rules.tsv` regra 10038).
- **Qualidade dos alertas (item 3):** conjuntos rotulados em `tests/unit/qualidade/`; teste `tests/unit/qualidade-alertas.unit.spec.ts`. Treino/validação: barra precisão ≥ 90 % e cobertura ≥ 80 %. Conjunto **cego** (60 conversas, nunca usar para ajustar regras), só com regras de palavras: alta intenção 100 % / 56 %, preço 88 % / 100 %, frustrado 75 % / 40 %, promessa 100 % / 87 % (precisão / cobertura). Barra do cego = "não piorar". Cobertura melhor pede provedor de IA.
- **Em andamento:** suíte Firefox/Safari/iPhone; depois commit + push + acompanhar deploy + Trello.
