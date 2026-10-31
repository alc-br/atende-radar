# Inventário do AtendeRadar (F0-01)

Retrato do código no commit `eac8042` (base do CRM). Tudo foi lido no código, não no README. Cada afirmação traz
`arquivo:linha` do commit `eac8042`. O que é dedução está marcado como **(inferência)**. Nenhum teste, build ou
servidor foi rodado nesta etapa.

Os números de linha valem para `eac8042`. No worktree já há mudanças de outros agentes (`prisma/schema.prisma` com
372 linhas a mais no fim, `src/lib/crm/`). Elas não entram aqui.

## Resumo

- App de página única: `src/app/page.tsx` troca de tela pela `View` do Zustand (`src/lib/store.ts:4`) e pelo `#hash`.
- 119 rotas de API (`route.ts`). 82 usam `guard()`. As outras têm proteção própria (operador, gateway, Basic, pública).
- 52 modelos Prisma em SQLite (WAL). 11 migrações. O deploy aplica as migrações com o app no ar, por um runner próprio.
- Jobs rodam dentro do processo do servidor, por `setInterval` (`src/lib/background.ts`). Não há fila externa.
- O gateway de WhatsApp (Baileys) roda no mesmo processo e só lê. Não existe chamada de envio no código.
- O motor de análise grava oportunidade, recuperação, alerta e notificação sem transação.
- Não existe mecanismo de feature flag. Os recursos de plano são só texto de vitrine; só as cotas são cobradas.
- Testes: 138 arquivos de spec, 798 casos. CI com 5 shards, job de navegadores e deploy em runner próprio.

## 1. Mapa de módulos

### 1.1 `src/lib` (140 arquivos)

| Módulo | O que faz |
|---|---|
| `agent-identities.ts` | Liga identidades do WhatsApp a atendentes. Detecta e sugere; só liga com confirmação manual. |
| `alert-channels.ts`, `alert-email.ts`, `alert-labels.ts`, `alert-rules.ts` | Canais do alerta (in_app, email), fila de e-mail de alerta (`AlertEmailItem`), nomes legíveis das regras, criação e validação de regras. |
| `analysis/` (18 arquivos) | Motor: `engine.ts` (698 linhas), `classify`, `ai-classify` (Claude, desligado por padrão), `opportunity`, `outcome`, `promises`, `questions`, `score`, `metrics`, `day-metrics`, `funnel`, `agents`, `alert-groups`, `business-hours`, `novelty`, `novelty-signal`, `revenue-params`, `rule-filters`, `text`. |
| `api-auth.ts` | `guard()` e funções de escopo (seção 3). |
| `app-version.ts`, `attribution.ts`, `audit.ts` | Versão; atribuição de anúncio e consentimento; `AuditLog` só com metadados. |
| `auth.ts`, `auth-tokens.ts`, `session-cookie.ts` | NextAuth por credenciais com bloqueio após falhas; tokens de uso único; nomes dos cookies. |
| `background.ts` | Agenda dos jobs (seção 4). |
| `billing/` (9 arquivos) | Pagar.me v5, trial, inadimplência, trava (`lock.ts`), portão de análise, e-mails de cobrança. |
| `conversions.ts` | GA4 Measurement Protocol e Meta CAPI por fila (`ConversionEvent`). |
| `csp.ts`, `datalayer.ts`, `gtm.ts`, `hosts.ts` | CSP com nonce; dataLayer do GTM; site e app em domínios separados. |
| `db.ts` | Cliente Prisma, WAL, `socket_timeout=20`, `optimizeDb`. |
| `email-change.ts`, `email-verification.ts`, `invites.ts`, `invite-toast.ts` | Troca e verificação de e-mail; convites. |
| `excluded-numbers.ts`, `privacy.ts`, `privacy-settings.ts`, `mask-sensitive.ts` | Números excluídos da análise; apagar conversas; máscara de CPF e cartão. |
| `faq.ts`, `legal.ts`, `segments.ts` | Conteúdo do site. |
| `gateway-auth.ts`, `ingest.ts` | Segredo do gateway; contrato de eventos do gateway com zod e idempotência. |
| `health.ts` | Checagens da página `/status`. |
| `internal.ts`, `json-body.ts`, `mutation.ts`, `pagination.ts`, `search.ts`, `utils.ts`, `money-input.ts` | Tráfego interno; limite de corpo; ajuda de mutação na UI; paginação (teto 100); escape de LIKE. |
| `mailer.ts`, `mail-html.ts` | Envio pela Brevo e fila `EmailOutbox` (`mailer.ts`); HTML dos e-mails. |
| `marketing-report.ts`, `mautic.ts`, `mautic-catalog.ts` | Relatório de marketing; contatos no Mautic. |
| `nfse/` (7 arquivos) | NFS-e do Sistema Nacional (XML, assinatura, mTLS, modo falso). |
| `org-defaults.ts`, `org-defaults-data.ts` | 8 regras e 8 relatórios criados em toda organização nova. |
| `org-deletion.ts`, `org-export.ts`, `org-fields.ts` | Exclusão LGPD após 7 dias; exportação em JSON; campos da empresa. |
| `passwords.ts`, `permissions.ts` | scrypt; papéis e permissões. |
| `phone-crypto.ts`, `phone-hash.ts` | Telefone cifrado (AES-GCM); hash HMAC e 4 últimos dígitos. |
| `plan-catalog.ts`, `public-plans.ts`, `quotas.ts` | Catálogo de planos; cotas. |
| `product-analytics.ts`, `product-events.ts` | Eventos de produto e marcos. |
| `rate-limit.ts` | Limite de taxa em memória. |
| `reports/` (7 arquivos), `report-unsubscribe.ts` | Relatórios agendados em PDF e XLSX. |
| `sandbox.ts`, `simulation/` (8 arquivos + `scenarios/`) | Org de demonstração e simulação de conversas. |
| `store.ts` | Estado global (Zustand): `View`, conversa e atendente selecionados. |
| `support.ts`, `support-admin.ts` | Chamados; `operatorGuard`. |
| `system-tour/` (7 arquivos), `tours.ts` | Manual interativo com narração (Azure Speech); tours curtos por papel. |
| `team-refs.ts`, `uploads.ts` | Referências de equipe; arquivos enviados. |
| `webhooks.ts`, `webhook-url.ts` | Webhook de saída (fila `WebhookDelivery`); bloqueio de SSRF e assinatura. |
| `whatsapp/` (5 arquivos) | Gateway Baileys: `manager`, `auth-store` (credenciais cifradas), `map`, `park`, `signal-log-filter`. |

### 1.2 `src/components`

| Pasta | Arquivos | Destaque |
|---|---|---|
| `ui` | 49 | shadcn/Radix (accordion … tooltip), mais `help-tip` e `sidebar`. |
| `layout` | 8 | `app-header`, `app-sidebar`, `connection-banner`, `deletion-banner`, `email-verify-banner`, `error-screen`, `locked-shell`, `trial-banner`. |
| `admin` | 8 | Painel do operador da plataforma. |
| `settings` | 6 | Configurações. |
| `site` | 6 | Site público. |
| `system-tour` | 6 | Manual interativo. |
| `conversations` | 5 | Lista e detalhe. |
| `login` | 4 | Entrar e cadastro. |
| `dashboard` | 3 | `dashboard-view` (801 linhas), `setup-checklist`, `training-banner`. |
| `plans`, `team` | 3 cada | Planos e checkout; equipe e perfil do atendente. |
| `connections` | 2 | Conexões de WhatsApp. |
| `alerts`, `recovery`, `reports`, `members`, `teams`, `notifications`, `onboarding`, `profile`, `help`, `landing`, `auth`, `consent`, `tour` | 1 cada | `alerts-view` tem 1403 linhas; `recovery-view` tem 927. |

Hooks: `src/hooks/use-mobile`, `src/hooks/use-toast`.

### 1.3 `src/app/api` (119 `route.ts`)

| Grupo | Rotas | Proteção |
|---|---|---|
| `admin` | 25 | `guard` + operador da plataforma; `operatorGuard` em marketing, nfse, novelties, support; `simulationAccess` nas 8 de `admin/simulation`. |
| `auth` | 7 | Pública ou por token. |
| `billing` | 7 | `guard`; `billing/webhook` usa Basic (`PAGARME_WEBHOOK_USER`/`PASS`). |
| `conversations`, `profile`, `reports` | 7 cada | `guard`. |
| `alerts` | 6 | `guard` + `alertScope`. |
| `public` | 5 | Pública. |
| `connections`, `settings` | 4 cada | `guard`. |
| `gateway`, `members`, `notifications`, `organization`, `tours` | 3 cada | `gateway/*` usa `gatewayGuard`; o resto `guard`. |
| `agent-identities`, `alert-rules`, `media`, `recovery`, `subscription`, `team`, `teams` | 2 cada | `guard`. |
| `audit`, `dashboard`, `events`, `findings`, `me`, `open-questions`, `plans`, `promises`, `setup-status`, `support` | 1 cada | `guard`. |
| raiz `api/route.ts` | 1 | Só a sessão do `proxy`; responde "Hello, world!" (sobra de template). |

Não existe `src/app/api/crm/` em `eac8042`.

## 2. Banco (Prisma)

### 2.1 Números

- `prisma/schema.prisma`: 1071 linhas, 52 modelos, nenhum `enum`, provider `sqlite`.
- Status são `String` livres. Listas e objetos ficam em `String` com JSON (tags, `settingsJson`, `features`, `connectionIds`).
- Dinheiro em `Float`: `potentialValue`, `baseTicket`, `expectedValue`, `confirmedSaleValue`, `confirmedRecovered`,
  `recoveredValue`, `potentialValueAtRisk`, `Plan.monthlyPrice`/`annualPrice`. Só `BillingInvoice` e `NfseDocument`
  usam centavos (`amountCents Int`).

### 2.2 `organizationId` por modelo

| Situação | Modelos |
|---|---|
| FK, sem `onDelete` | WhatsAppConnection, Agent, Conversation, Alert, RecoveryItem, ReportRun, AlertRule, DailyMetric, AgentMetric, ReportDefinition, ClassificationFeedback, Notification, OrganizationMember, Team, Subscription (`@unique`) |
| FK com `Cascade` | BillingInvoice, BillingCustomer (`organizationId` é o `@id`), AuditLog, SupportTicket |
| `String` sem FK | Contact, AiClassification, NovelSignal, AlertEmailItem, NfseDocument, WebhookEndpoint (`@unique`), WebhookDelivery, AiUsage, ProductMilestone (`@@id` com `name`); opcional: EmailOutbox, PaymentEvent, ConversionEvent, ProductEvent, SimulationRun |
| Sem `organizationId` (escopo pelo pai) | Organization, Message, ConversationClassification, NovelCluster, AuditFinding, RevenueOpportunity, ConnectionSessionEvent, RawChannelEvent, AgentIdentity, ConversationIdentity, OpenQuestion, Promise, ConversationScore, AuthToken, Plan, NfseSequence, PageViewDaily, PlatformSetting, ConsentChoiceDaily |

Modelos-chave: Organization `:10`, Agent `:87`, Contact `:105`, Conversation `:124`, AuditFinding `:271`,
RevenueOpportunity `:291` (status padrão `"active"`), Alert `:316`, RecoveryItem `:348` (`conversationId` sem
relação), Plan `:721`, PlatformSetting `:1058`.

### 2.3 Índices principais

| Modelo | Índices |
|---|---|
| Conversation | (org, updatedAt), (org, riskScore), (org, openedAt), (org, operationalStatus), contactId, agentId, (connectionId, contactId) |
| Alert | (org, createdAt), (org, status), conversationId, (org, groupKey) |
| RecoveryItem | (org, priorityScore), conversationId |
| Contact | (org, phoneHash) |
| Message | `@@unique(connectionId, externalId)`, (conversationId, occurredAt), occurredAt |
| RevenueOpportunity | conversationId |

Sem índice próprio: WhatsAppConnection, Agent, AlertRule, ReportDefinition, Team, OrganizationMember,
ClassificationFeedback, ReportRun.

### 2.4 Migrações e deploy

- `prisma/migrations/`: 11 pastas + `migration_lock.toml` (sqlite). De `0_init` (918 linhas) a
  `20261023174024_marketing`. Nenhuma usa `PRAGMA foreign_keys` (nenhuma recriou tabela até agora).
- `scripts/db-migrate.ts` (196 linhas):
  - `--check` roda `prisma migrate diff --from-migrations … --to-schema-datamodel --exit-code` (`:34-57`). É o `db:check` do CI.
  - Aceita só URL `file:` (`:60`). Aplica a `0_init` como base só se o banco for igual a ela (`:68-112`).
  - Aplica cada `migration.sql` com `db.run` dentro de `BEGIN IMMEDIATE` e grava `_prisma_migrations` (`:118-159`).
  - `busy_timeout` 60000 (`:163`). Avisa se o checksum mudou (`:143`). Migração que quebrou no meio para tudo (`:129-136`).
- Deploy (`.github/workflows/deploy.yml:136-146`): `db:generate` + `db:migrate:deploy`, depois do backup e do
  restore-drill, **com o app no ar**. O código anterior roda alguns minutos com o schema novo
  (`docs/operacao/migracoes.md`). Toda migração do CRM precisa ser aditiva.

## 3. Autenticação e escopo

### 3.1 Caminho de uma requisição

1. `src/proxy.ts` (o "middleware" do Next 16). `apiNeedsSession` (`:7-10`) exige token de sessão (`getToken`,
   `:58-63`) em `/api/*`, menos `auth`, `public`, `gateway` e `billing/webhook`. Simulação com Bearer passa em `:14`.
2. A rota chama `guard(permissao)` (`src/lib/api-auth.ts:28`).

### 3.2 `guard()` (`src/lib/api-auth.ts`)

- `:28` assinatura: `guard(permission?: Permission, opts: { allowLocked?: boolean } = {})`.
- `:37` membro ativo, com senha e `sessionVersion` igual ao do token.
- `:41` sem a permissão → 403.
- `:49-54` `orgLock` → 402 com `code: 'subscription_locked'`, menos para o operador da plataforma e com `allowLocked`.
- `:63` `isPlatformOperator` (lista em `PLATFORM_ADMIN_EMAILS`).

Outras guardas: `operatorGuard` (`src/lib/support-admin.ts:8`, `guard` + operador, senão 403);
`gatewayGuard` (`src/lib/gateway-auth.ts:9`, Bearer com `timingSafeEqual`, 503 sem segredo);
`simulationAccess` (`src/lib/simulation/access.ts`).

### 3.3 Escopo de dados (`src/lib/api-auth.ts`)

| Função | Linha | Regra |
|---|---|---|
| `isOwnScopeOnly` | `:71` | Papel `atendente`. |
| `supervisorTeam` | `:79` | Equipe do supervisor. |
| `conversationScope` | `:85` | `organizationId` + contato não excluído; atendente → `agent.email` dele; supervisor com equipe → equipe dele **ou** sem atendente. |
| `alertScope` | `:93` | Mesmo raciocínio pela conversa do alerta. |
| `recoveryScope` | `:100` | Idem para recuperação. |
| `agentScope` | `:108` | Atendentes visíveis. |
| `publicMember` | `:114` | Campos seguros do membro. |

### 3.4 Papéis e permissões (`src/lib/permissions.ts`, 106 linhas)

- `:2` papéis: admin, gestor, supervisor, analista, member, atendente, viewer.
- `:9-15` grupos: ALL, OPERACAO, GESTAO, CONFIG, ADMIN, ANALISE, LEITURA_REL.
- `:17-46` 28 permissões (dashboard.view, alerts.view/manage, alert_rules.*, conversations.view/manage,
  recovery.manage, reports.*, agents.*, teams.*, members.*, connections.*, settings.manage, privacy.manage,
  audit.view, billing.manage, organization.export/delete, plans.view, notifications.view, tours.use).
- `:51` `ROLE_NAMES`; `:64` `ROLE_DESCRIPTIONS` (conferido por `tests/unit/role-descriptions.unit.spec.ts`).
- `:74` `can()`; `:79-99` `VIEW_PERMISSION`; `:101-106` `canOpenView`. Em `:103`, view fora do mapa abre para todos.

### 3.5 Trava de assinatura (`src/lib/billing/lock.ts`, 39 linhas)

- `:25` `orgLock(orgId, now)`: org de demonstração → livre; sem assinatura → livre; senão `lockOf(sub, now)`.
- Motivos: `trial_expired`, `canceled`, `payment_overdue`. Mensagem em `:35`.
- Efeito (comentário `:5-15`): a UI mostra só Planos (`LockedShell`, `page.tsx:256`), a API responde 402, nada é
  analisado e os números se desconectam em até 2 dias.

## 4. Jobs e processos em segundo plano

`src/instrumentation.ts` chama `startBackgroundJobs()` quando `NEXT_RUNTIME` é `nodejs`. Com
`ANALYSIS_SCHEDULER=off` (testes) nada é agendado (`background.ts:31`) e os testes usam `/api/gateway/tick`.

| Intervalo | Job | Linha (`background.ts`) |
|---|---|---|
| na partida | `startWhatsApp()` | `:42` |
| 60 s | `analyzeAll` (com trava `__arRunning`) | `:46` |
| 15 min | `billingSweep` | `:54` |
| 60 s | `processNfse`, `runScheduledReports`, `runWebhookOutbox`, `runConversionOutbox` | `:57-66` |
| 60 s | `trialEndingNotices`, `pastDueNotices`, `disconnectLockedOrgs`, `flushAlertEmails`, `retryFailedEmails` | `:70-77` |
| 15 min | `purgeDueDeletions`, `purgeProductEvents`, `purgeExpiredSimulations`, `clusterNovelSignals` | `:81-88` |
| 30 s, depois 6 h | `optimizeDb` | `:91-93` |
| 6 h | sincronização com o Mautic | `:95` |
| sob demanda | `requestAnalysis(orgId)` com espera de 3 s | `:100` |

`src/app/api/gateway/tick/route.ts` roda os mesmos jobs na hora. É o gancho determinístico dos testes.

### 4.1 Motor de análise (`src/lib/analysis/engine.ts`)

- `:79` `analyzeAll` (orgs ativas, fora de exclusão). `:95` `analyzeOrganization`.
- `:101` `analysisGate` (pausado ou acima da cota). `:144-159` seleção incremental por `needsAnalysisAt`.
- `:187` laço por conversa: classificação (`:216-224`), promessas (`:236/251`), perguntas (`:265/272`),
  oportunidade (`:297-396`), recuperação (`:371`, `:602`), atualização da conversa (`:412`), score (`:429-432`),
  alertas (`:483-686`). Fim: identidades e `recomputeMetrics` (`:689-694`).
- Não há `$transaction` no motor.

### 4.2 Filas que já existem (parecidas com outbox)

| Fila | Onde | Uso |
|---|---|---|
| `WebhookDelivery` | `src/lib/webhooks.ts:179` (`enqueueAlertEvent`), `:210`, `:258` | Webhook público: `alert.created`, `alert.updated`, `alert.resolved` (`:16`). Nunca lança erro. |
| `EmailOutbox` | `src/lib/mailer.ts` | E-mails transacionais com nova tentativa. |
| `AlertEmailItem` | `src/lib/alert-email.ts` | E-mail de alerta agrupado. |
| `ConversionEvent` | `src/lib/conversions.ts` | GA4 e Meta CAPI. |
| `NfseDocument` | `src/lib/nfse/service.ts` | Emissão de nota. |

A especificação (§8.1) pede um outbox interno próprio, gravado na mesma transação. Não reaproveitar `WebhookDelivery`.

### 4.3 Gateway de WhatsApp (só leitura)

- Roda no processo do servidor com `WHATSAPP_GATEWAY=on`. `mini-services/` tem só `.gitkeep`; nada aponta para ela.
- `src/lib/whatsapp/manager.ts:11-12`: o comentário diz que só observa e nunca envia. `:106`
  `markOnlineOnConnect: false`, `syncFullHistory: false`. Usa só `sock.ev.on` e `sock.end`.
- Busca por `sendMessage|readMessages|sendPresenceUpdate|sendReceipt` em `src` → 0 ocorrências.
- Credenciais cifradas com AES-256-GCM (`WA_SESSIONS_KEY`), pasta em `WA_SESSIONS_DIR`.
- Exporta `discardSession` (`:196`), `reconcile` (`:204`), `startWhatsApp` (`:229`).
- Eventos de entrada: `src/lib/ingest.ts:16` (`message.received`, `message.sent`, `connection.status`,
  `connection.qr`). Contato, conversa e mensagem numa transação (`:186`).

## 5. Integrações e variáveis de ambiente

Serviços: Pagar.me v5, Brevo, Mautic, GA4 MP, Meta CAPI, GTM, Anthropic Claude, Azure Speech, NFS-e do Sistema
Nacional (mTLS), Google Drive via rclone (backup), WhatsApp Web via Baileys.

Só nomes. Nenhum valor foi copiado.

| Área | Variáveis |
|---|---|
| App e sessão | `NODE_ENV`, `NEXT_RUNTIME`, `DATABASE_URL`, `DB_QUIET`, `AUTH_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_VERSION`, `NEXT_PUBLIC_CONTACT_EMAIL`, `PLATFORM_ADMIN_EMAILS`, `REQUIRE_EMAIL_VERIFICATION`, `TRIAL_MINUTES`, `DEMO_ORG_ID`, `ANALYSIS_SCHEDULER`, `TURBOPACK_ROOT`, `GITHUB_SHA` |
| IA | `AI_CLASSIFIER`, `AI_MODEL`, `ANTHROPIC_API_KEY`, `AI_DAILY_LIMIT_PER_ORG`, `AI_MAX_CALLS_PER_TICK`, `AI_PRICE_BRL_PER_MTOK_IN`, `AI_PRICE_BRL_PER_MTOK_OUT` |
| WhatsApp e gateway | `WHATSAPP_GATEWAY`, `WA_SESSIONS_DIR`, `WA_SESSIONS_KEY`, `GATEWAY_SECRET` |
| Telefone e arquivos | `PHONE_ENC_KEY`, `PHONE_HASH_SECRET`, `UPLOADS_DIR` |
| Cobrança | `PAGARME_MODE`, `PAGARME_PUBLIC_KEY`, `PAGARME_PUBLIC_KEY_TEST`, `PAGARME_SECRET_KEY`, `PAGARME_SECRET_KEY_TEST`, `PAGARME_WEBHOOK_USER`, `PAGARME_WEBHOOK_PASS` |
| NFS-e | `NFSE_AMBIENTE`, `NFSE_CERT_FILE`, `NFSE_CERT_PASSWORD`, `NFSE_CNBS`, `NFSE_CNPJ`, `NFSE_CTRIB_MUN`, `NFSE_CTRIB_NAC`, `NFSE_DESDE`, `NFSE_FAKE`, `NFSE_IM`, `NFSE_MUNICIPIO`, `NFSE_P_TOT_TRIB_SN`, `NFSE_SERIE` |
| E-mail e Mautic | `MAIL_PROVIDER`, `MAIL_FROM`, `MAIL_TEST_TO`, `BREVO_API_KEY`, `PREVIEW_HTML`, `SALES_EMAIL`, `SUPPORT_EMAIL`, `MAUTIC_URL`, `MAUTIC_USUARIO`, `MAUTIC_SENHA` |
| Medição | `GTM_ID`, `GA4_MEASUREMENT_ID`, `GA4_API_SECRET`, `GA4_DEBUG`, `GA4_SERVER_SIGNUP`, `META_PIXEL_ID`, `META_PIXEL_ID_2`, `META_CAPI_TOKEN`, `META_CAPI_TOKEN_2`, `META_GRAPH_VERSION`, `META_TEST_EVENT_CODE`, `META_DOMAIN_VERIFICATION`, `PRODUCT_EVENTS_RETENTION_DAYS` |
| Limites de taxa | `LOGIN_FAILS_PER_IP`, `SIGNUP_RATE_LIMIT_PER_HOUR`, `INVITE_RATE_LIMIT_PER_HOUR`, `CHECKOUT_ATTEMPTS_PER_HOUR`, `CONSENT_RATE_LIMIT_PER_MIN`, `PAGEVIEW_RATE_LIMIT_PER_MIN`, `ORG_EXPORT_PER_HOUR`, `REPORT_RESEND_PER_HOUR` |
| Simulação e webhook | `SIMULATION_ENABLED`, `SIMULATION_SECRET`, `WEBHOOK_ALLOW_LOCAL` |
| Áudio do tour | `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `AZURE_SPEECH_VOICE`, `TOUR_AUDIO_DIR`, `TOUR_AUDIO_FAKE`, `TOUR_AUDIO_FAKE_LOG` |
| Backup e scripts | `BACKUP_DIR`, `BACKUP_KEEP`, `BACKUP_REQUIRE_DB`, `DRIVE_KEEP_DAYS`, `AVISO`, `ENVIAR` |
| Só no passo de env do `deploy.yml` | `RESEND_API_KEY`, `PIPER_BIN`, `PIPER_VOICE` (o código não lê) |

Para o CRM, nenhuma variável nova é necessária no começo. O estado de liga e desliga deve ficar no banco
(`CrmFeatureState`), não em env **(inferência a partir da §7.2 da especificação)**.

## 6. Design system, navegação, tours, ajuda e planos

### 6.1 CSS

- `src/app/globals.css` (147 linhas) importa Tailwind, `tw-animate-css`, `painel.css`, `conta.css`, `site.css`,
  `blog.css`, `painel-ajustes.css` e `system-tour.css`. Também em `src/app/global-error.tsx:6`.
- Tamanhos: `painel.css` 2633, `conta.css` 985, `site.css` 352, `blog.css` 306, `painel-ajustes.css` 297,
  `system-tour.css` 261 (4981 linhas em `src/styles`).
- `painel.css` e `conta.css` são gerados do pacote de design ("Não edite à mão"). Correções vão em
  `painel-ajustes.css`.
- Tokens: 76 em `painel.css` (`:root`, escopo `.ar`), 101 em `globals.css` (tema shadcn em `@theme inline`), 34 em
  `site.css` (escopo `.lp`). Tema escuro pela classe `.dark` (`globals.css:10` e `:90`, `painel.css:56`).
- Guia de tela: `docs/design/guia-de-ui.md`.

### 6.2 Navegação

- `src/lib/store.ts:4` tipo `View` com 22 telas. `setView` `:126`, `selectConversation` `:136`, `selectAgent` `:137`.
- `src/app/page.tsx` (287 linhas): importa todas as telas de forma estática (`:11-32`); `NO_AUTO_TOUR` `:57`;
  `HASH_VIEWS` `:60`; efeito do hash `:140-148`; tours `:163-176`; evento `screen_view` `:180-191`;
  `renderView` `:193-243` (confere `canOpenView` em `:195`, `switch` desde `:197`); `LockedShell` `:256`;
  casca `:259-281` (`AppSidebar`, `AppHeader`, avisos, `<main className="conteudo">`).
- `src/components/layout/app-sidebar.tsx` (207 linhas): `mainNavItems` `:17-25` (dashboard, alerts, conversations,
  recovery, team, reports, connections); `adminNavItems` `:27-33` (settings, members, teams, plans, admin);
  filtro por permissão `:38-39`; contadores de alertas e recuperação `:43-56`; `isActive` `:58-62`; cada item tem
  `data-tour="nav-<view>"`.

### 6.3 Tours e ajuda

- `src/lib/tours.ts` (251 linhas): `TOURS` `:8` (welcome, dashboard, alerts, recovery, team, reports, admin);
  `ROLE_LABEL` `:156`; `ROLE_STEPS` `:173` (um por papel); `GENERIC` `:223`; `welcomeStepsFor` `:237`.
- `src/lib/system-tour/content.ts` (1097 linhas): `CHAPTERS` `:16`, 15 capítulos (de primeiros-passos `:19` a admin
  `:1018`). Passos `info`, `click` e `task`, com `requires` (permissão). Narração em `narration.ts`, chave
  "capítulo/passo".
- `src/content/ajuda.ts` (296 linhas): `CategoriaAjuda` `:6` (comecar, entender, alertas, conta);
  `CATEGORIAS_AJUDA` `:8`; `ARTIGOS_AJUDA` `:28`; `buscarAjuda` `:281`. Artigos do site em `src/content/artigos.ts`.

### 6.4 Planos e cotas

- `src/lib/plan-catalog.ts`: `PLAN_CATALOG` `:6-10` (essencial, gestao "Growth", performance).
  `PLAN_FEATURES` `:16-25` é só texto de vitrine; o comentário `:13-15` diz que nada disso é cobrado.
- `src/lib/quotas.ts`: `QuotaKind` `:7` (connections, agents, alertRules); `enforceQuota` `:45`;
  `enforceExportQuota` `:84`; `planOverage` `:124`.
- `Plan` (`schema.prisma:721`) tem limites (conexões, atendentes, conversas e mensagens por mês, minutos de áudio,
  retenção, exportações, regras) e `features` em JSON.
- Não existe feature flag: busca por `featureFlag`/`flags` em `src` não achou nada.

## 7. Testes e CI

### 7.1 Por pasta

| Pasta | Arquivos de spec | Casos | Apoio |
|---|---|---|---|
| `tests/e2e` | 108 (53 api, 54 ui, 1 unit) | 542 | 12 arquivos auxiliares |
| `tests/unit` | 30 | 256 | 7 auxiliares (`qualidade/`) |
| **Total** | **138** | **798** | |

Contagem por `^\s*test(\.(skip|only|fixme))?\(`. Há 192 `test.describe(` e 45 `test.skip(` condicionais
(14 por falta das chaves do Pagar.me).

### 7.2 Por projeto do Playwright (`playwright.config.ts`)

`testDir ./tests`, 1 worker, sem paralelo, porta `E2E_PORT` ou 3100.

| Projeto | O que pega | Arquivos | Casos |
|---|---|---|---|
| `unit` | `*.unit.spec.ts` | 31 | 261 |
| `api` | tudo que não é ui nem unit | 53 | 348 |
| `ui-desktop` | ui, Desktop Chrome 1280x800 | 54 | 189 |
| `ui-mobile` | ui, Pixel 7 | 54 | 189 |
| `ui-tablet` | design, landing, layout-empresa-cheia (iPad Mini) | 3 | 27 |
| `ui-firefox`, `ui-safari`, `ui-iphone` | só com `CROSS_BROWSER=1` | 8 | 41 |

`webServer`: `reset-test-db.mjs`, `db-migrate.ts`, `prisma/seed.ts`, `seed-test-orgs.ts` e `next dev` (até 180 s).
O banco de teste nasce pelas migrações, então migração quebrada derruba os testes.

### 7.3 Descoberta automática de rotas

`tests/e2e/api-routes.ts` acha todo `route.ts` (`discoverRoutes()`). `api-auth.spec.ts` e `rbac.spec.ts` testam todas.
`PUBLIC_ROUTES` (auth, public) e `OWN_AUTH_ROUTES` (`billing/webhook`, `gateway/*`) são listas à mão. Uma rota nova
em `/api/crm` já entra no teste de sessão. Rota pública nova precisa entrar na lista.

### 7.4 Workflows (`.github/workflows`)

| Arquivo | Gatilho | O que faz |
|---|---|---|
| `deploy.yml` (285) | push em main, pull_request, workflow_dispatch | `test` em 5 shards (1: unit+api+ui-tablet; 2-3: ui-desktop; 4-5: ui-mobile), com `bun install --frozen-lockfile`, `prisma generate`, `db:check`, typecheck, lint, e2e e `bun audit --audit-level=high`. `browsers`: Firefox e WebKit. `deploy` (`:112-114`): `needs: [test, browsers]`, fora de PR, runner self-hosted; rsync, backup, restore-drill, migração, sync do catálogo, build, env, restart, health, Mautic, áudio do tour. |
| `backup.yml` (81) | a cada 6 h | Backup, envio ao Drive, disco, TLS, issue se falhar. |
| `smoke.yml` (62) | agendado | `scripts/smoke.sh` nas URLs de produção, TLS, issue se falhar. |
| `zap.yml` (34) | agendado | Varredura de segurança ZAP. |

Estado em `docs/crm/EXECUCAO-AUTONOMA.md`: o CI de `eac8042` falhou por infraestrutura (job de navegadores e
timeout no shard 1); o último verde foi `62ea82f`. Não foi reexecutado nesta etapa.

## 8. Pontos de extensão para o CRM

### 8.1 Onde encaixar

| O que | Onde (`eac8042`) | Como |
|---|---|---|
| Domínio | `src/lib/crm/` (novo) | Ordem da especificação: domínio, BFF, worker do outbox, telas atrás de flag desligada. |
| Rotas BFF | `src/app/api/crm/` (novo) | `guard('crm.*')` (`api-auth.ts:28`) e os escopos `:85-111` também nas escritas. Entram sozinhas em `api-auth.spec.ts` e `rbac.spec.ts`. |
| Permissões | `permissions.ts:17-46` | Novas chaves `crm.*` nos grupos certos. |
| Tela ↔ permissão | `permissions.ts:79-99` | Toda view do CRM no `VIEW_PERMISSION` (ver R2). |
| Descrição dos papéis | `permissions.ts:64` | Atualizar junto com `tests/unit/role-descriptions.unit.spec.ts`. |
| Tipo de tela | `store.ts:4` | Novos valores de `View` (ex.: `crm-pipeline`, `crm-deal`). |
| Roteamento | `page.tsx:60` (`HASH_VIEWS`), `:193-243` (`renderView`), `:11-32` (imports) | Adicionar o `case`; preferir import dinâmico (ver R10). |
| Menu | `app-sidebar.tsx:17-25` ou `:27-33`, `:58-62`, `:43-56` | Item com `data-tour="nav-<view>"`, escondido quando a flag está desligada. |
| Tours e ajuda | `tours.ts:8` e `:173`; `system-tour/content.ts:16` + `narration.ts`; `content/ajuda.ts:6` e `:28` | Capítulo novo com `requires`; categoria de ajuda nova se preciso. |
| Banco | `schema.prisma` depois de `:1071`; pasta nova em `prisma/migrations/` | Só aditivo. `db:check` no CI pega schema sem migração. |
| Worker | `background.ts:41-97` | Novo `setInterval` para o outbox; incluir no `/api/gateway/tick` para os testes. |
| Saúde | `health.ts:40-48` | Checar a idade do evento pendente mais antigo (ver R1). |
| LGPD | `org-deletion.ts:152-198`, `org-export.ts:60-86`, `privacy.ts:19` | Toda tabela `Crm*` na exclusão e na exportação. |
| Trava e planos | `guard(..., { allowLocked })`, `plan-catalog.ts:16`, `quotas.ts:45` | O CRM respeita a trava 402; liberação por plano resolvida no servidor. |

### 8.2 Onde nascem hoje os eventos do outbox

Nomes propostos na especificação (CRM-06). Nenhum deles existe hoje como evento interno.

| Evento proposto | Onde nasce hoje | Observação |
|---|---|---|
| `conversation.intent_detected`, `conversation.qualification_changed` | `engine.ts:216-224` (classificação), `:412` (intenção, etapa, urgência, score na conversa) | A correção humana tem prioridade (`:209-215`). |
| `opportunity.detected` | `engine.ts:386` (cria `active`) | |
| `opportunity.estimate_changed` | `engine.ts:396` | Valor em `Float`. |
| `outcome.detected` | `engine.ts:315` (cria won/lost), `:324` (active → won/lost), `:326` (fecha a conversa), `:351` (fecha por inatividade), `:358`, `:367-368` (abandono) | |
| `outcome.human_confirmed` | `conversations/[id]/outcome/route.ts:72-87` | Grava `confirmedSaleValue`, oportunidade e recuperação. |
| oportunidade apagada ou reaberta | `engine.ts:297-299` (apaga na correção humana de intenção); `ingest.ts:235` (lost → active quando o cliente volta) | Sem evento proposto na especificação. Precisa de um (ver R5). |
| `recovery.created` | `engine.ts:371` (abandono, prazo 24 h), `:602` (regras de recuperação, prazo 2 h); `recovery/route.ts:124` (manual) | |
| `recovery.assigned` | `recovery/[id]/route.ts:35` (`assignedTo`) | |
| `recovery.completed` | `engine.ts:330`; `recovery/[id]/route.ts:34-44` | |
| `alert.created` | `engine.ts:583` (+ `:593` webhook), `:634` (connection_down), `:676` (quota_warning) | Já vai ao webhook público. Manter as duas coisas separadas. |
| `alert.updated` | `engine.ts:572` (reaberto, `:581`), `:523` (escalada, `:535`) | |
| `alert.resolved` | `engine.ts:483`, `:504`, `:518`, `:626`, `:644`, `:663`, `:686` | |
| `contact.updated` | `ingest.ts:202` (`lastSeenAt`, nome) | Dentro da transação do ingest. |
| `contact.privacy_changed` | `privacy.ts:47` (`excluded: true`) | |

Para gravar o evento na mesma transação, cada ponto acima precisa virar `db.$transaction` (motor) ou receber o `tx`
que já existe (`ingest.ts:186`). Hoje o motor grava passo a passo **(inferência sobre o esforço)**.

## 9. Riscos e dívida técnica

| ID | Descrição | Evidência | Impacto no CRM |
|---|---|---|---|
| R1 | A checagem do agendador em `/status` sempre diz "ok". `__arStartedAt` e `__arLastCycleAt` são declarados e nunca preenchidos. | `background.ts:27-28`; `health.ts:43-46` | Um worker do outbox parado não aparece. Preencher os marcadores e checar a idade da fila. |
| R2 | `canOpenView` libera toda view que não está no mapa. | `permissions.ts:103` | View do CRM esquecida no `VIEW_PERMISSION` abre para qualquer papel. |
| R3 | Escritas usam só `organizationId`; leituras usam o escopo de supervisor e atendente. | `conversations/[id]/route.ts:32` (PATCH) × `:76` (GET); `outcome/route.ts:33`; `feedback/route.ts:38`; `findings/[id]`, `promises/[id]`, `open-questions/[id]` em `:19` | Supervisor muda conversa de outra equipe. Nas rotas do CRM, usar o escopo também na escrita. |
| R4 | O motor grava sem transação. O webhook é enfileirado depois do alerta e engole erro. | `engine.ts:583` e `:593`; `webhooks.ts:179` | Queda entre as duas gravações perde o evento. O outbox do CRM precisa da mesma transação (§8.1). |
| R5 | O estado da oportunidade não é monótono: apaga, reabre e muda sozinho. | `engine.ts:299`, `:324`; `ingest.ts:235` | Eventos precisam de `aggregateVersion`. A automação não pode desfazer decisão humana no CRM. |
| R6 | Dinheiro em `Float`. Só fatura e NFS-e usam centavos. | `schema.prisma:144`, `:299-308`, `:330`, `:364` | Valores de negócio do CRM em centavos (`Int`), convertendo na borda. |
| R7 | Muitos `organizationId` sem FK. Exclusão e exportação usam listas à mão. | `org-deletion.ts:152-198`; `org-export.ts:60-86` | Tabela do CRM fora da lista fica de fora da exclusão LGPD e da exportação. |
| R8 | Migração roda com o app no ar, pelo runner próprio. `PRAGMA foreign_keys` não vale dentro de `BEGIN IMMEDIATE`. Existe `db:push --accept-data-loss`. | `db-migrate.ts:118-159`; `package.json` (`db:push`) | Migrações do CRM só aditivas. Nada de recriar tabela. Nunca usar `db:push` em banco real. |
| R9 | `workflow_dispatch` em qualquer branch passa pelo job `deploy`. | `deploy.yml:3-7`, `:112-114` | Não disparar o workflow à mão em `crm/integracao`: publicaria a branch. |
| R10 | Todas as telas são importadas de forma estática. | `page.tsx:11-32` | Cada tela do CRM aumenta o pacote de todos. Usar import dinâmico. |
| R11 | Limite de taxa só em memória. | `rate-limit.ts:1-2` | Vale com uma instância só. Limites do CRM seguem a mesma regra. |
| R12 | Não há feature flag. Recursos de plano não são cobrados. | `plan-catalog.ts:13-15`; busca sem resultado | `CrmFeatureState` e a liberação por plano precisam ser criados e resolvidos no servidor. |
| R13 | Toda chamada de `guard()` consulta a trava de assinatura no banco. | `api-auth.ts:49-54` | Latência extra no BFF do CRM; evitar várias chamadas de API por tela. |
| R14 | Sobras de template. | nome `nextjs_tailwind_shadcn_ts` no `package.json`; `tests/*-runtime-*.sh` apontam para `.zscripts` que não existe; `api/route.ts` "Hello, world!"; `mini-services/` vazia | Ruído. Não usar como referência. |
| R15 | O hash de telefone cai para `NEXTAUTH_SECRET` ou uma constante de desenvolvimento. | `phone-hash.ts:5` | Se o CRM usar o hash para casar contatos, depende do segredo certo em produção. |
| R16 | O doc de migrações fala em `prisma migrate deploy`, mas o script aplica o SQL ele mesmo. | `docs/operacao/migracoes.md`; `db-migrate.ts:118-159` | Documentação da migração do CRM deve seguir o script. |
| R17 | SQLite tem um escritor só. O motor roda por org, em sequência, a cada 60 s, no mesmo processo. | `db.ts:7-12`; `background.ts:46` | O worker do outbox disputa o lock. Lotes pequenos e transações curtas. |
| R18 | CI de `eac8042` vermelho por infraestrutura. | `docs/crm/EXECUCAO-AUTONOMA.md` | A base do CRM não tem CI verde provado. Não reexecutado aqui. |
| R19 | O PATCH de recuperação aceita campos livres sem validação: `status` qualquer, `assignedTo` sem conferir a org, `recoveredValue` qualquer número. Não grava auditoria. | `recovery/[id]/route.ts:34-39` | O CRM não deve confiar nesses valores. Rotas novas com zod, conferência de dono e `AuditLog`. |

## 10. Provado × inferência

**Provado (comando e saída):** contagem de rotas, modelos, migrações, testes e CSS; linhas citadas em `arquivo:linha`;
ausência de envio no WhatsApp; ausência de feature flag; marcadores do agendador nunca preenchidos; ausência de
`$transaction` no motor.

**Inferência:** esforço para pôr os pontos do motor em transação (8.2); onde guardar o estado de liga e desliga (5);
impacto de latência da trava (R13); disputa de lock pelo worker (R17).

**Não verificado:** comportamento em execução (nenhum teste nem servidor rodou); CI de `eac8042` (só o registro em
`EXECUCAO-AUTONOMA.md`).

## 11. Como foi levantado

- `git log -1` → `eac8042`. `df -h /d /c` antes de começar.
- `find src/lib -type f | wc -l` → 140; cabeçalho de cada arquivo com `head`.
- `find src/app/api -name route.ts | wc -l` → 119; contagem por grupo com `cut` e `uniq -c`.
- `grep -rl "guard(" src/app/api --include=route.ts | wc -l` → 82; o resto conferido rota a rota.
- `git show eac8042:prisma/schema.prisma | wc -l` → 1071; `grep -c '^model '` → 52; `grep -n` de `organizationId`, `@@index` e `Float`.
- `ls prisma/migrations` → 11 pastas + `migration_lock.toml`; `grep -l "PRAGMA foreign_keys"` → nenhuma.
- `git grep -n "__arStartedAt\|__arLastCycleAt" eac8042` → só declarações e leituras.
- `grep -rnE "sendMessage|readMessages|sendPresenceUpdate|sendReceipt" src` → 0.
- `grep -n "\$transaction" src/lib/analysis/engine.ts` → 0.
- `grep -rn "featureFlag\|flags" src` → nada sobre flag.
- `grep -rhoE "process\.env\.[A-Z0-9_]+" src scripts prisma next.config.ts | sort -u` → nomes da seção 5.
- `grep -cE '^\s*test(\.(skip|only|fixme))?\(' tests/**/*.spec.ts` → contagens da seção 7.
- `wc -l` nos CSS, em `page.tsx`, `app-sidebar.tsx`, `tours.ts`, `content.ts`, `ajuda.ts` e nos workflows.
