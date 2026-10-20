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
- ~~Decidir quando virar `PAGARME_MODE=live`~~ feito em 16/10/2026 (ver Diário) (chaves de produção já validadas; Pagar.me só vai para produção depois do T19). Na 1ª venda real, conferir em Dash Stone › Vendas online › Webhooks › Eventos se o aviso chegou com autenticação OK.
- Revisão jurídica de privacidade/termos.
- Provedor de IA (sobe a cobertura dos alertas; ver item 3).
- Guardar fora do servidor uma cópia da `WA_SESSIONS_KEY` (criada pelo deploy em `app.env`; sem ela as sessões cifradas do WhatsApp e os backups delas não abrem). Ver `docs/operacao/sessoes-whatsapp.md`.
- ~~Definir `SUPPORT_EMAIL` no servidor~~ definida (conferido em 19/10/2026) — para receber por e-mail os chamados do "Falar com o suporte" (sem ela, os chamados ficam só no Admin › Suporte).
- Depois que a migração cifrada estiver confirmada, apagar à mão o backup `.tar.gz` das sessões feito antes da cifra (guarda credenciais em texto puro).
- Guardar fora do servidor uma cópia da `PHONE_ENC_KEY` (criada pelo deploy em `app.env`; sem ela os telefones completos dos clientes, no banco e nos backups, não abrem). Ver `docs/operacao/telefone-cifrado.md`.
- ~~Ambiente de simulação~~ **desligado** em 19/10/2026 a pedido do usuário (`SIMULATION_ENABLED=off` no `app.env`, backup `app.env.bak-*-antes-simulacao-off`; as rotas respondem 404). O deploy não religa (marca `.simulation-on-2026-10-15` existe). Para usar a bateria de novo: `on` no `app.env` + restart. Ver `docs/operacao/simulacao.md`.
- ~~Drop-in do systemd do I8~~ aplicado em 19/10/2026: a memória já estava em `memoria.conf` (15/10: 1200M/1536M, servidor de 12 GB dividido com o Mautic); novo `limites.conf` com `MemorySwapMax=0`, `TasksMax=512` e `StartLimitBurst=5` em 600 s. Conferido com `systemctl show` e app respondendo 200.
- V7: confirmar o texto dos termos sobre arrependimento em 7 dias e mudança de preço (Admin › Planos muda só contratos novos).
- **NFS-e (card F1), pronta e desligada:**
  - **Contador:** confirmar o código de tributação nacional (padrão `010501`), o ISS em Piraquara sem retenção e o percentual total do Simples (`NFSE_P_TOT_TRIB_SN`, padrão 6,00).
  - **Prova completa:** escolher como provar a emissão de ponta a ponta. Ou a Prefeitura de Piraquara adere à produção restrita (hoje dá E0037), ou o contador autoriza uma 1ª nota real de valor baixo, cancelada logo depois.
  - **Ligar:** só depois de 03/11/2026 (NT 009 em produção). Passos em `docs/operacao/nfse.md`.

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

### 20/10/2026

- **NFS-e Padrão Nacional (pedido do usuário: "emite quando contrata, se tem reembolso cancela"; o contador não respondeu, "pode construir no ambiente de testes").** Tudo em `docs/operacao/nfse.md`.
  - **Código:**
    - `src/lib/nfse/`: XML da DPS e do cancelamento (leiaute 1.01 com `finNFSe` da NT 009), assinatura RSA-SHA1/C14N, cliente mTLS, configuração `NFSE_*` e um Sistema Nacional falso para testes que confere a assinatura.
    - Fila em `service.ts`: número reservado antes do envio, consulta da DPS antes de reenviar e 6 tentativas.
    - Migração `20261020120000_nfse` com `BillingCustomer`, `NfseDocument` e `NfseSequence`.
    - Tela Admin → Notas fiscais e rotas `/api/admin/nfse*` (só operador).
  - **Provado contra a produção restrita real:**
    - mTLS com o certificado A1;
    - DPS e cancelamento aceitos no esquema e na assinatura;
    - a emissão para em E0037: Piraquara sem convênio na restrita. Outros municípios dão E0084 ou E0207, por dados de teste.
  - **Não provado:** nota autorizada de ponta a ponta. Ver Pendências.
  - **Provas automáticas:**
    - unidade: `nfse.unit.spec.ts`;
    - API: `nfse.spec.ts`;
    - tela, desktop e celular: `nfse.ui.spec.ts`;
    - sandbox do Pagar.me: `billing-pagarme.spec.ts`, em que a contratação emite a nota e o arrependimento a cancela.
  - **Certificado:** `.p12` só fora do repositório (`D:\ALC\certificado-digital\2026\`, e no servidor em `/opt/atende-radar/shared/nfse/` quando ligar). A senha fica só em arquivo local e no `app.env`. Válido até 16/10/2027.
  - **NT 009:**
    - em 30/10 sai a 2ª entrega na restrita, que pode exigir campos novos do Simples. Rodar a sonda de novo.
    - em 03/11 a NT 009 entra em produção. Antes disso, a produção deve recusar o `finNFSe`.
  - **Corrigido no caminho:**
    - **Troca de cartão que paga a fatura em aberto:** no CI, o sandbox do Pagar.me devolveu a fatura ainda recusada logo depois da cobrança aprovada. A tela dizia "pago" e a empresa ficava inadimplente até a próxima sincronização. Agora o sistema relê o Pagar.me por até 8 s.
    - **`qr.ui.spec.ts`:** disputa no teste (o pedido de QR novo da tela chegava depois do "conectado" simulado). O teste agora espera esse pedido.
    - **`bun audit`:** ignora GHSA-86w9-cpqp-85rv (`node-forge`, sem versão corrigida). A falha está na verificação de assinatura do forge, que não usamos.
  - **Deploy:** CI verde e deploy feito em 20/10/2026 (run 39436021806, commit a4dc8fd). A NFS-e foi para produção **desligada** (`NFSE_AMBIENTE` não definido = `off`).

### 19/10/2026

- **Alertas do ZAP corrigidos (pedido do usuário, 19/10/2026).** Commits `f35a114`, `9086e2e`, `528ec89`. Varredura de 19/10 tinha 11 avisos no site e 8 no app; a de 20/10 (run 39349428455) deu **0 FAIL e 0 WARN** nos dois domínios.
  - **CSP com nonce:** `src/lib/csp.ts` monta a política; o proxy (`src/proxy.ts`) gera um nonce por requisição e o Next o aplica aos próprios scripts; `script-src` sem `unsafe-inline`, com `strict-dynamic`. Toda página passou a ser dinâmica (o layout lê `x-nonce`). As APIs recebem a CSP sem nonce pelo `next.config.ts`. O `style-src` mantém `unsafe-inline` (React/Radix/sonner criam estilo em tempo de execução): regra 10055 ignorada com o motivo.
  - **Isolamento entre origens:** COOP `same-origin`, COEP `require-corp`, CORP `same-origin`; `/brand/*` com CORP `cross-origin` (logo dos e-mails).
  - **`/login`:** redireciona direto no proxy (antes mandava a página inteira, ~11 KB; agora 45 bytes).
  - **nginx do servidor:** `server_tokens off` em `/etc/nginx/nginx.conf` (backup `nginx.conf.bak-20261019201425`); vale também para o Mautic. Regra 10036 passa a barrar.
  - **`.zap/rules.tsv`:** falsos positivos e informativos ignorados, cada um com o motivo.
  - **Provas:** `csp.ui.spec.ts` (nonce no cabeçalho e no HTML, nonce único por acesso, cabeçalhos de isolamento, `/login` sem corpo, script injetado no HTML barrado) em Chromium, Firefox, Safari e iPhone; suíte completa local 2184 ok; CI verde e deploy. Em produção: cabeçalhos conferidos com curl, nonces diferentes a cada acesso, `crossOriginIsolated` verdadeiro no navegador, site e login sem erro no console.
  - **Testes frágeis corrigidos no caminho:** WebKit recarrega a página depois de bloquear o script injetado (o teste limpa a interceptação); máscara do CNPJ no celular disputava com o carregamento dos dados (o teste repete a digitação).
- **NFS-e (card F1):** (em 19/10) continua sem código. O certificado A1 agora está em `D:\ALC\certificado-digital\2026\` (`.p12` + `.cer`). Bloqueios: respostas do contador (código de tributação, alíquota, prazo de cancelamento) e a senha do `.p12` gravada pelo usuário fora do chat.

- **Inadimplência com 7 dias de tolerância + exportação e desconexão da empresa bloqueada (pedido do usuário, 19/10/2026).** Commit `ae358ea`. Detalhes em `docs/operacao/cobranca-pagarme.md` (seções "Inadimplência" e "Empresa bloqueada") e no manual de suporte.
  - **Renovação recusada:** `past_due` + `pastDueSince` (migração `20261019120000_past_due_grace`). 7 dias com tudo liberado (inclusive cadastrar); lembretes no 3º e 6º dia e aviso do bloqueio no 7º (sino + e-mail, uma vez cada); depois, `unpaid` → bloqueio com motivo `payment_overdue`. Trocar o cartão cobra na hora a fatura em aberto (`PATCH /charges/{id}/card`). Operadora que desiste mantém a tolerância e a tela chama para contratar de novo.
  - **Qualquer bloqueio (teste vencido, plano encerrado, atraso):** o admin exporta todos os dados em JSON (`GET /api/organization/export`, botão no aviso do bloqueio e em Configurações › Privacidade); 2 dias depois do bloqueio os números de WhatsApp são desconectados (`statusReason plan_locked`) e o que chegar é ignorado. Texto antigo "as mensagens seguem chegando" removido.
  - **Admin:** filtro "Inadimplentes"; receita mensal conta o anual como ano ÷ 12; marcar "Pagamento pendente" grava `pastDueSince`.
  - **Provas:** unidade (`billing.unit.spec.ts`), API (`delinquency.spec.ts`: prazos, avisos únicos, 402, exportação sem segredos, desconexão, ingestão ignorada), tela desktop e celular (`lock-teams-masks.ui.spec.ts`: faixa com prazo, bloqueio e download do JSON) e **sandbox real do Pagar.me** (`billing-pagarme.spec.ts`: renovação recusada → cartão recusado segue inadimplente → cartão aprovado cobra na hora e volta a ativa). CI 39265773003 verde (o teste do sandbox rodou, 15 s) e deploy ok.
  - **Em produção (só leitura):** coluna e migração presentes, app no ar. A única empresa com teste vencido há mais de 2 dias não tem números conectados: nenhuma desconexão aconteceu (0 `connection.auto_disconnected`).
  - **E-mails reais pelo Brevo (provado em 19/10/2026, do servidor):** os 6 e-mails (`payment_failed`, `past_due_reminder`, `past_due_locked`, `provider_canceled`, `numbers_disconnected`, `trial_ended`), com o mesmo texto e HTML do app e assunto "[TESTE]", foram enviados para os 2 endereços de teste: Brevo respondeu 201 e registrou `delivered` para todos; os 6 chegaram na caixa de entrada do Gmail (nenhum no spam; 2 caíram na aba Promoções: teste grátis terminou e números desconectados). Remetente `nao-responda@atenderadar.com.br`, link de Planos correto. Nada gravado no banco de produção (script temporário, apagado depois).
  - **Aba Promoções (commit `8bde005`):** os 2 que caíam em Promoções foram reescritos como aviso da conta (assunto "Aviso da conta: período de teste encerrado em dd/mm" e "Aviso da conta: N números de WhatsApp desconectados"; sem "grátis" e sem chamada de venda). Reenviados do servidor depois do deploy, sem "[TESTE]": os 2 chegaram em **Atualizações** no Gmail. CI 39292032166 verde (o teste do QR falhou uma vez e passou na reexecução, sem relação) e deploy ok.
  - **Não provado:** uma renovação real recusada em produção (só no sandbox).

### 17/10/2026

- **Filtros da regra de alerta valendo no motor (17/10/2026).** Alertas › Regras › Nova regra/Editar › **Mais opções** (tudo opcional; vazio = vale sempre). Funções puras em `src/lib/analysis/rule-filters.ts`, aplicadas em `engine.ts`; validação em `src/lib/alert-rules.ts`.
  - **Números e Equipes:** a equipe da conversa é a do atendente confirmado ou escolhido à mão (`Agent.team` = nome da equipe); sem atendente, a(s) equipe(s) dona(s) do número. Id de equipe/número de outra empresa → 400.
  - **Dias e horários:** `{days:[0-6], start, end}` no fuso da empresa; janela que passa da meia-noite pertence ao dia em que começa. A regra só ABRE alerta dentro da janela; o alerta aberto continua sendo acompanhado fora dela.
  - **Encerrar sozinho:** fecha com `resolvedBy 'timeout'` e o aviso "Encerrado sozinho" no cartão; não reabre enquanto for o mesmo problema; se o problema acabar e voltar, reabre o mesmo alerta (+1). No alerta agrupado só encerra se TODAS as regras do grupo pedem (vale o maior prazo). Vale também para conexão desconectada e aviso de limite.
  - **Exceções:** etiquetas da conversa (sem diferença de maiúsculas/acentos): a conversa sai da regra e o alerta dela fecha.
  - **Decisão minha:** os prazos de "encerrar sozinho" que vinham gravados nas regras padrão (preço sem retorno 120, promessa 1440, conexão 60) nunca tiveram efeito e ninguém os escolheu; a migração `20261017230000_rule_auto_close_opt_in` limpa esses valores (opt-in). Etiqueta em branco nas exceções é descartada, não recusada.
  - **Provas:** 10 cenários novos no simulador (`scenarios/filtros.ts`, 60/60 local), mutação de cada filtro derruba seu cenário; `tests/unit/rule-filters.unit.spec.ts`; `tests/e2e/alert-rule-filters.spec.ts` (API), `alert-rule-filters-engine.spec.ts` (mensagem real → motor: exceção, equipe, encerrar sozinho com 1 min de relógio real), `alert-rule-filters.ui.spec.ts` (desktop e celular). Suíte local completa: 2155 ok, 0 falhas.
  - **Achados pelo CI deste trabalho (18/10/2026), corrigidos:** (1) alerta reaberto ficava com o aviso antigo "Encerrado sozinho" (`dismissedReason` agora volta a vazio ao reabrir); (2) **Visão Geral › 1ª resposta média** estava errada: dia sem nenhuma 1ª resposta grava 0 e puxava a média do período para baixo (ex.: 6 min ontem + hoje sem resposta mostrava 3 min); `src/app/api/dashboard/route.ts` agora faz a média só dos dias com valor (`avgSet`), teste em `analysis.spec.ts`; (3) **celular, Alertas › Regras:** a tabela de regras alargava a página (412 → 457 px) e o diálogo "Nova regra" saía da tela (a caixa de equipe ficava fora do alcance). Causa: item do `grid` com `min-width:auto`; `grid-cols-1` em `alerts-view.tsx`. O teste de tela agora confere que a página não rola para os lados e que o diálogo cabe na tela (falha sem a correção). Varredura das demais telas no celular (empresa vazia): nenhuma outra vaza.
  - **Cobrança, achado pelo CI (18/10/2026):** logo depois do estorno (arrependimento) o Pagar.me ainda lista a fatura como paga; um aviso (webhook) nesse meio-tempo relia a fatura e a voltava para "paga" (o cliente veria a fatura estornada como cobrada). Estorno agora é final: `keepRefunded()` em `src/lib/billing/core.ts`, usado em `applyProviderState`. Provas: unitário em `billing.unit.spec.ts` (mutação derruba) e e2e determinístico em `billing-pagarme.spec.ts` ("aviso (webhook) depois do estorno…", só roda com as chaves do sandbox, ou seja, no CI).
  - **Em produção (18/10/2026):** CI 39094199172 verde (o e2e do estorno rodou e passou no sandbox) e deploy ok; backup `prod.db.bak-202610180050-antes-filtros`; migração `20261017230000_rule_auto_close_opt_in` aplicada; simulador no servidor **60/60**; 0 empresa simulada restante. Comentário no card S1 do Trello.
  - **WhatsApp: QR sem fim (18/10/2026), corrigido.** Quando ninguém escaneia o QR, a conexão deveria "estacionar" depois de 5 QRs. A marca de tempo era tirada ANTES da gravação de "QR expirou", que muda o `updatedAt`; o `reconcile` (a cada 15 s) achava que o cliente pediu de novo e reabria: o número "teste" em produção pediu QR ao WhatsApp a cada 2,5 min por mais de 3 h (risco de bloqueio do servidor). Agora `src/lib/whatsapp/park.ts` (usa o `updatedAt` gravado), teste `tests/unit/whatsapp-park.unit.spec.ts` (mutação derruba).
  - **Telas com empresa cheia (18/10/2026), corrigido.** Novo `tests/e2e/layout-empresa-cheia.ui.spec.ts` (celular, tablet e desktop; 2 números, equipes, 40 conversas com nomes e links longos, ~70 alertas, relatório): passa por todas as telas e abas e pelo detalhe da conversa. Achou: link longo sem espaço vazava nos cartões de alerta (celular), no chat e em Perguntas em aberto (desktop +209 px, celular +300 px). `painel.css`: quebra de texto longo e grades que encolhem. Suíte de telas + unitários local: 670 ok, 0 falhas. O CI (fontes do Linux, mais largas) ainda achou +10 px no detalhe da conversa no celular: a evidência do cartão de falha com link longo, dentro de `div.grid` sem colunas (cresce até o texto). Regra geral em `painel.css`: toda `.grid` sem `grid-cols` dentro do conteúdo usa `minmax(0, 1fr)`. Para achar texto que não quebra sem depender do CI: `LAYOUT_WIDE_FONT=1` roda a varredura com fonte larga (Verdana + espaçamento); passa nos 3 tamanhos.
  - **Provado em produção (18/10, após deploy):** o QR do número "teste" expirou às 14:37:12 (horário do servidor) e a sessão ficou parada; nenhum "iniciando" nos minutos seguintes (antes voltava 10 s depois, por 3+ horas). Trello S1 comentado.
  - **Ainda NÃO provado:** WhatsApp com aparelho real. Em produção nunca chegou mensagem real (as 60 são da empresa de demonstração); o QR é gerado (o servidor fala com o WhatsApp), mas ninguém escaneou. Precisa do usuário: escanear com um celular de teste e mandar mensagens de outro número; aí conferir mensagem gravada, análise, alerta, e-mail, indicadores e reconexão após reinício.
- **Bateria exaustiva do simulador (17/10/2026): 50 cenários, todos verdes** no CI e em produção (rodado no servidor pelo CLI em 17/10, com backup `prod.db.bak-202610172015-antes-simulacao`; a limpeza não deixou empresa simulada). Novos em `src/lib/simulation/scenarios/`: `regras.ts`, `limites.ts`, `expediente.ts`, `jornada.ts` (lista em `docs/operacao/simulacao.md`). Cobrem regras próprias, ciclo do alerta (dispensar, falso positivo, resolver, repetir, agrupar), cota de regras e de conversas nos 3 planos (até passar do limite), assinatura cancelada/reativada, teste vencido e contratação, horário comercial (domingo, sexta à noite, tolerâncias, feriado, sábado), venda recuperada, perda declarada, LGPD, carga de 200 conversas e os 8 relatórios.
  - **Defeitos encontrados e corrigidos:**
    - 5 tipos de regra oferecidos em "Nova regra" nunca disparavam: Resposta lenta, Pergunta ignorada, Lead abandonado, Promessa vencida (tipo antigo) e Aviso de limite de conversas (`quota_warning`, agora "Conversas do mês perto do limite"). Implementados no motor (`engine.ts`).
    - "Nova regra" não tinha campo de prazo: a regra de tempo criada pela tela ficava sem número e disparava na hora. Agora há o campo (minutos ou % do limite) com o padrão do tipo, e a coluna "Prazo" na tabela.
    - A API aceitava tipo desconhecido e nome repetido (os alertas se ligam à regra pelo nome). Agora 400/409; o tipo não muda depois de criada. Validação única em `src/lib/alert-rules.ts` (tela e simulador usam a mesma).
    - Só a 1ª regra de "Conexão desconectada" valia; agora todas.
    - **Cliente da sexta à noite sumia:** a conversa esperando a empresa era encerrada por inatividade no domingo (48 h corridas) e o alerta de segunda nunca abria. Com "fora do expediente: ignora", a inatividade de quem espera a empresa conta só expediente.
  - ~~Ainda não feito: regra por equipe e os campos "dias e horários", "encerrar sozinho" e "exceções"~~ feito (ver entrada acima).
- **Teste/plano vencido bloqueia tudo (17/10/2026).** Quando o teste grátis ou o plano acaba, o painel fica só com Planos, Meu perfil e Ajuda (`locked-shell.tsx`). A API recusa o resto com 402 `subscription_locked` (`src/lib/billing/lock.ts`). Contratando, o painel volta ao recarregar.
  - Decisões minhas: as mensagens do WhatsApp continuam chegando (nada se perde); `past_due` (cobrança falhou) não bloqueia; a faixa do teste recarrega a página na hora em que o teste acaba.
- **E-mails de cobrança e do teste (`src/lib/billing/emails.ts`).** Vão para os admins ativos, um por evento (dedupe no EmailOutbox):
  - teste grátis: faltando 3 dias, 1 dia, "Último aviso" faltando 6 h, e "terminou" (até 7 dias depois do fim). Testes curtos (`TRIAL_MINUTES`) usam frações do tempo. Quem já assinou não recebe;
  - assinatura: ativada, renovação paga (recibo das faturas pagas nos últimos 7 dias, sem repetir a da ativação), pagamento falhou, renovação cancelada, reativada, arrependimento/reembolso (ou falha do reembolso), cartão trocado, plano terminou;
  - `endExpiredPlans` (no `billingSweep`, a cada 15 min) passa para cancelado o plano cuja renovação foi cancelada e o período acabou.
- **Treinamento:** "Começar o treinamento" abre antes uma introdução ("Antes de começar"), com a voz Azure `pt-BR-ThalitaNeural`, destacando "Treinamento do sistema" no menu. Depois segue para a 1ª aula. A introdução não salva progresso.
- **Equipes › Criar equipe:** no seletor de supervisor há "Adicionar membro supervisor", que convida a pessoa e volta ao formulário com ela escolhida. O próprio administrador também aparece como opção.
- **Menu lateral:** logo fixo em cima, rodapé (promo, Treinamento e Ajuda) fixo embaixo, itens rolam no meio (`.lateral__rolagem` / `.lateral__rodape`).
- **Máscaras:** CNPJ/CPF, telefone e valores em R$ (o CEP do checkout já tinha) (`src/lib/org-fields.ts`, `money-input.ts`). O servidor valida CNPJ, telefone e site e guarda formatado.
- **Site (Configurações):** o `https://` fica fixo na frente do campo; se a pessoa colar com http(s)://, ele sai ao deixar o campo. Grava como `https://...`.
- **Guias rápidos de tela removidos** (pedido do dono) em Conversas, Conexões, Configurações, Membros, Equipes e Planos. "Tour desta tela" só aparece no menu do topo onde ainda há guia. O Treinamento do sistema não mudou.
- **Relatórios agendados:** não saem para empresa bloqueada. A trava confere a situação real de agora, não o horário simulado do tick.
- **Testes:** novos `lock-teams-masks.ui.spec.ts` e `training-intro.ui.spec.ts`. Também foram atualizados `plan-limits` (T11), `billing-pagarme` (os e-mails só são conferidos no CI, com o sandbox) e `admin-assinatura`.

### 16/10/2026

- **Ajustes do teste grátis feito pelo dono (16/10/2026).**
  - **Guia rápido:**
    - o destaque ganhou um anel branco e verde que desliza entre os itens, visível também no menu escuro;
    - "Passo X de N" fica numa linha só e há uma barra de progresso;
    - o guia da tela não abre logo depois do de boas-vindas;
    - Planos e Contratar não abrem guia automático.
  - **Treinamento do sistema:** o antigo "Tour pelo sistema" foi renomeado e os capítulos agora se chamam "aulas". Há um cartão na Visão Geral (`training-banner.tsx`) com as aulas concluídas; ele diz que serve também para treinar a equipe e some quando todas as aulas terminam.
  - **Planos:**
    - no teste grátis, "Assinar o plano X" aparece no cartão do plano atual; quem paga vê "Subir de plano";
    - o servidor recusa rebaixar o plano (`downgrade_not_allowed`);
    - Mensal | Anual virou um seletor próprio, com o selo dentro do botão;
    - cancelar ficou discreto, embaixo das faturas: dentro de 7 dias a pessoa escolhe entre usar até o fim do ciclo ou ter o reembolso; depois disso, não renova;
    - a tela "Pagamento aprovado" ficou compacta, com os botões "Ver assinatura e faturas" e "Ir para o painel".
  - **Membros:** cada função tem descrição (`ROLE_DESCRIPTIONS` em `permissions.ts`), e o e-mail de convite traz o nome da função em vez do slug.
  - **Senha:** o mínimo é 8 caracteres em todas as telas.
  - **Relatórios:** o histórico mostra o nome do relatório, não o slug.
  - **Testes:** novos `trial-onboarding-polish.ui.spec.ts` e `role-descriptions.unit.spec.ts`. Os fluxos de cobrança com sandbox (`billing-checkout.ui`, `billing-pagarme`) só rodam no CI.
- **CI mais rápido (16/10/2026).** Os ~2.100 testes rodavam num runner só (~25 min, mais a fila do push anterior: ~45 min por deploy). Agora o job `test` é uma matriz de 5 runners divididos por projeto do Playwright (unit+api+tablet; ui-desktop 1/2 e 2/2; ui-mobile 1/2 e 2/2). Primeira execução: ~10,5 min do push ao ar. Dividir só por `--shard` (contagem de testes) deixava um runner com quase todas as telas (21 min). Type-check, lint, db:check e audit rodam só na parte 1.
- **Regras de alerta:** nomes legíveis de tipo/canal (`src/lib/alert-labels.ts`), (?) com explicação (`src/components/ui/help-tip.tsx`) em Tipo, Severidade, Cooldown e Canais, opção E-mail sem quebrar, contadores das abas Resolvidos/Ignorados discretos (o vermelho vinha de `painel-ajustes.css` pintando todos). Teste: `tests/e2e/alert-rule-help.ui.spec.ts`.
- **Demonstração pública removida (16/10/2026, pedido do usuário: "temos o trial").** Sem botão "Entrar como demonstração", sem `?demo=1`, sem senha pública `demo123` (não cria nem entra em conta). Sessões antigas da demo recebem 401 e o app sai da conta sozinho. A empresa `org_seed_1` continua existindo só como empresa de exemplo dos testes. "Começar teste grátis" (`?modo=cadastro`) com alguém logado no navegador sai da conta e abre o cadastro.
- **Cadastro:** senha mínima de 8 caracteres (antes 10), campos um embaixo do outro.
- **Teste curto para validar o fim do teste grátis:** variável `TRIAL_MINUTES` no app.env do servidor; contas criadas enquanto ela existir ganham N minutos de teste. Apagar a variável (e reiniciar) volta para 14 dias. Contas já criadas não mudam.
- **Preço de teste:** Essencial mensal está em **R$ 1,00** no banco de produção para o dono assinar e testar (backup em `/opt/atende-radar/backups/prod-antes-preco-teste-*.db`). **Voltar para 299 depois do teste:** `update Plan set monthlyPrice=299.0 where code='essencial'` (como usuário atende-radar).
- **PRODUÇÃO: cobrança real ligada (16/10/2026, 17:57, pedido do usuário).** No servidor, `PAGARME_MODE=live`; backup do app.env em `app.env.bak-*-antes-live`. Prova com dinheiro real, avulso, conta Stone da empresa:
  - Pix de R$ 1,00 pago às 18:05 → `charge.paid` / `order.paid` entregues ao AtendeRadar com 200.
  - Cartão Visa de R$ 1,00 por link de pagamento: 3 tentativas **recusadas pelo antifraude da Stone** (`antifraud_response.status = reproved`, sem chegar ao banco); a 4ª foi aprovada às 18:08 (código 0000) e os avisos chegaram com 200. Recusas também avisam (`charge.payment_failed`).
  - **Atenção:** o antifraude da conta real recusou o próprio dono 3 vezes. Antes de vender, olhar o nível do antifraude na Dash Stone; se cliente real for recusado, é aí.
  - A página de pagamento hospedada pela Stone ("checkout") está desligada na conta; para cobrança avulsa por link, usar `POST /core/v5/paymentlinks`.
  - Ainda falta: uma **assinatura real** pela tela Planos, para ver o AtendeRadar processar `invoice.paid` com dinheiro real; dá para estornar pelo botão de arrependimento. Estorno real é sempre feito pelo usuário (o agente não movimenta dinheiro).
- **Stone conferida ao vivo (pedido do usuário: "fazer funcionar a integração da Stone"):** a integração já é a da Stone e não precisa trocar de API. As chaves da Dash Stone funcionam na API v5 em produção e teste (200), e o token de cartão é gerado de qualquer origem: a dúvida dos "domínios do checkout transparente" está resolvida. No sandbox funcionaram pedido avulso, estorno e Pix com QR Code. A conta **real** entregou o webhook `customer.created` aos 3 sistemas (AtendeRadar, Completa, ALCADEMY), todos com resposta 200 (`GET /core/v5/hooks`).
  - **Por que a aba Eventos fica vazia nas vendas de teste:** a Stone não envia webhook de venda de teste. A Dash Stone tem um único cadastro, sem seletor de ambiente (confirmado pelo usuário com prints), e a conta de teste tem zero entregas. Em teste o sistema se sincroniza pela varredura de 15 min. A rota é provada no CI (`billing-pagarme.spec.ts`, assinaturas reais do sandbox). Falta ver a Stone avisar um **pagamento** real (até agora só `customer.created`).
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
