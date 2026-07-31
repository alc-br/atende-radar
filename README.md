# AtendeRadar

> **Auditoria Inteligente de Receita e Qualidade no WhatsApp**

SaaS que monitora, analisa e pontua conversas de WhatsApp em tempo real, detectando falhas de atendimento, oportunidades de receita perdidas e promessas não cumpridas.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma)
![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-New%20York-18181B)
![License](https://img.shields.io/badge/License-Private-red)

---

## Funcionalidades

### Dashboard (Visao Geral)
- 8 KPIs em tempo real com variacao percentual
- Tabela de prioridades (top 10 conversas em risco)
- Funil auditado (conversas > oportunidades > propostas > vendas)
- Grafico de falhas por tipo com severidade
- Desempenho da equipe comparativo
- Evolucao dos ultimos 14 dias (nota, tempo de resposta, abandonos, valor em risco)

### Alertas Inteligentes
- 5 abas: Ativos, Em acompanhamento, Resolvidos, Ignorados, Regras
- 8 filtros (busca, criticidade, tipo, atendente, equipe, valor, confianca)
- 7 acoes por alerta (abrir conversa, atribuir, resolver, ignorar, falso positivo, etc.)
- Regras configuraveis com severidade, cooldown e canais de notificacao

### Conversas
- Lista com 13 colunas ordenaveis e 9 filtros
- Selecao em lote com acoes em massa (atribuir, tag, exportar)
- Detalhe com timeline de mensagens + painel de auditoria (8 secoes)
- 10 acoes de correcao (alterar intencao, urgencia, confirmar venda, etc.)
- Score composto por 5 dimensoes com progress bars

### Recuperacao de Receita
- Fila priorizada de oportunidades perdidas
- 7 acoes (contatar, atribuir, escalar, resolver, etc.)
- Metricas de recoverability

### Equipe
- Ranking com 11 colunas (nota, tempo, oportunidades, falhas, promessas, etc.)
- Perfil do agente com radar chart (5 dimensoes)
- Historico de metricas diarias

### Relatorios
- 8 tipos (qualidade, receita, equipe, alertas, conversas, tendencias, compliance, personalizado)
- 4 formatos de exportacao (PDF, Excel, CSV, PNG)
- Agendamento e envio automatico

### Conexoes WhatsApp
- Cards com 11 estados de conexao
- Acoes por conexao (conectar, desconectar, sincronizar, etc.)
- Historico de eventos de sessao

### Administracao
- **Visao Geral da Plataforma**: KPIs globais, tabela de organizacoes recentes
- **Organizacoes**: CRUD completo com filtros e dialog de detalhes
- **Usuarios Globais**: Gestao com filtros por papel e status
- **Sistema**: Health checks (BD, auth, armazenamento), log de atividade, configuracoes

### Autenticacao
- NextAuth.js com JWT e Credentials provider
- 7 papeis RBAC (admin, gestor, supervisor, analista, membro, atendente, viewer)
- Login com demonstracao automatica

### Membros, Equipes e Planos
- Gestao de membros da organizacao
- Equipes com configuracao de SLA
- Planos com comparacao de recursos e limites

### Notificacoes
- Centro de notificacoes com marcacao de lido

---

## Stack Tecnica

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 16 (App Router) |
| Linguagem | TypeScript 5 |
| Estilizacao | Tailwind CSS 4 + shadcn/ui (New York) |
| Componentes | 43+ componentes shadcn/ui, Lucide React |
| Estado Cliente | Zustand |
| Estado Servidor | TanStack Query + React Query |
| Banco de Dados | SQLite via Prisma ORM |
| Autenticacao | NextAuth.js v4 (Credentials + JWT) |
| Graficos | Recharts |
| Tema | next-themes (light/dark) |
| Icons | Lucide React v0.525.0 |
| Animacoes | Framer Motion |
| Validacao | Zod + React Hook Form |

---

## Estrutura do Projeto

```
atende-radar/
+-- prisma/
|   +-- schema.prisma      # 22 modelos de dados
|   +-- seed.ts            # Dados de demonstracao (721 linhas)
+-- src/
|   +-- app/
|   |   +-- api/            # 31 API routes (REST)
|   |   |   +-- admin/
|   |   |   +-- alert-rules/
|   |   |   +-- alerts/
|   |   |   +-- auth/
|   |   |   +-- connections/
|   |   |   +-- conversations/
|   |   |   +-- dashboard/
|   |   |   +-- members/
|   |   |   +-- notifications/
|   |   |   +-- plans/
|   |   |   +-- recovery/
|   |   |   +-- reports/
|   |   |   +-- settings/
|   |   |   +-- subscription/
|   |   |   +-- team/
|   |   +-- layout.tsx       # Providers (Theme, Tooltip, Toaster, Auth)
|   |   +-- page.tsx         # SPA router com Zustand
|   +-- components/
|   |   +-- admin/           # Painel administrativo
|   |   +-- alerts/          # View de alertas
|   |   +-- auth/            # AuthProvider (SessionProvider)
|   |   +-- connections/     # View de conexoes WhatsApp
|   |   +-- conversations/   # Lista + detalhe de conversas
|   |   +-- dashboard/       # Dashboard com KPIs e graficos
|   |   +-- landing/         # Landing page publica
|   |   +-- login/           # Pagina de login
|   |   +-- members/         # Gestao de membros
|   |   +-- notifications/   # Centro de notificacoes
|   |   +-- onboarding/      # Onboarding wizard (7 etapas)
|   |   +-- plans/           # Planos e cobranca
|   |   +-- recovery/        # Fila de recuperacao
|   |   +-- reports/         # Relatorios
|   |   +-- settings/        # Configuracoes (7 abas)
|   |   +-- team/            # Equipe + perfil do agente
|   |   +-- ui/              # 43+ componentes shadcn/ui
|   +-- lib/
|       +-- auth.ts          # Configuracao NextAuth
|       +-- db.ts            # Cliente Prisma singleton
|       +-- mock-data.ts     # Dados mock (legado)
|       +-- seed-data.ts     # Funcoes de seed
|       +-- store.ts         # Zustand store (estado global)
|       +-- utils.ts         # Funcoes utilitarias
+-- public/
+-- .env                   # DATABASE_URL, NEXTAUTH_SECRET
```

---

## Modelos de Dados (Prisma)

22 modelos cobrindo:

| Modelo | Descricao |
|--------|----------|
| `Organization` | Empresa cliente |
| `Plan` / `Subscription` | Planos e assinaturas |
| `WhatsAppConnection` | Conexao Baileys |
| `AgentIdentity` | Identidade do agente no WhatsApp |
| `Agent` / `AgentMetric` | Atendentes e metricas |
| `Contact` | Contatos (hash/criptografia LGPD) |
| `Conversation` / `Message` | Conversas e mensagens |
| `ConversationClassification` | Classificacoes de IA |
| `ConversationScore` | Notas compostas (5 dimensoes) |
| `AuditFinding` | Falhas detectadas |
| `RevenueOpportunity` | Oportunidades de receita |
| `OpenQuestion` / `Promise` | Perguntas e promessas rastreadas |
| `Alert` / `AlertRule` | Alertas e regras configuraveis |
| `RecoveryItem` | Itens de recuperacao |
| `DailyMetric` / `AgentMetric` | Metricas agregadas |
| `ConnectionSessionEvent` / `RawChannelEvent` | Eventos de conexao |
| `OrganizationMember` / `Team` | Membros e equipes |
| `ReportDefinition` / `ReportRun` | Definicoes e execucoes de relatorios |
| `ClassificationFeedback` | Feedback de correcoes |
| `Notification` | Notificacoes in-app |

---

## API Routes

31 endpoints REST organizados por dominio:

| Dominio | Endpoints |
|---------|----------|
| `/api/dashboard` | GET (KPIs, funil, falhas, evolucao, prioridades, equipe) |
| `/api/alerts` | GET (lista/filtros), PUT `[id]`, POST `[id]/acknowledge`, POST `[id]/resolve`, POST `[id]/dismiss`, POST `[id]/false-positive` |
| `/api/alert-rules` | GET, POST, PUT `[id]`, DELETE `[id]` |
| `/api/conversations` | GET (lista/filtros/paginacao), GET `[id]`, POST `[id]/outcome`, POST `[id]/feedback` |
| `/api/recovery` | GET, POST, PUT `[id]` |
| `/api/team` | GET, GET `[id]` |
| `/api/reports` | GET, POST `generate` |
| `/api/connections` | GET, GET/PUT `[id]`, GET `[id]/health` |
| `/api/settings` | GET, PUT |
| `/api/members` | GET, POST, PUT/DELETE `[id]` |
| `/api/teams` | GET, POST, PUT, DELETE |
| `/api/plans` | GET |
| `/api/subscription` | GET |
| `/api/notifications` | GET, POST `read-all` |
| `/api/auth` | NextAuth `[...nextauth]` |

---

## Como Executar

### Prerequisitos

- [Bun](https://bun.sh/) (recomendado) ou Node.js 18+

### Instalacao

```bash
git clone https://github.com/alc-br/atende-radar.git
cd atende-radar
bun install
```

### Configuracao

```bash
cp .env.example .env
# Editar .env com:
# DATABASE_URL="file:./dev.db"
# NEXTAUTH_SECRET="sua-chave-secreta"
```

### Banco de Dados

```bash
# Gerar cliente Prisma
bun run db:generate

# Criar tabelas no SQLite
bun run db:push

# Popular com dados de demonstracao
bun run db:seed
```

### Desenvolvimento

```bash
bun run dev
# Acesse http://localhost:3000
```

### Credenciais de Demo

| Campo | Valor |
|-------|-------|
| Email | Qualquer email |
| Senha | `demo123` |

Ou clique em **"Entrar como demonstracao"** na tela de login.

### Scripts

| Comando | Descricao |
|---------|----------|
| `bun run dev` | Servidor de desenvolvimento (porta 3000) |
| `bun run lint` | Lint com ESLint |
| `bun run db:push` | Sincroniza schema Prisma com o banco |
| `bun run db:generate` | Gera cliente Prisma |
| `bun run db:seed` | Popula banco com dados demo |
| `bun run db:migrate` | Migracoes com Prisma Migrate |
| `bun run db:reset` | Reseta o banco de dados |

---

## Telas (18 views)

| # | Tela | Descricao |
|---|------|----------|
| 1 | Landing Page | Pagina publica com hero, features, pricing |
| 2 | Login | Autenticacao com NextAuth |
| 3 | Dashboard | KPIs, funil, graficos, equipe, evolucao |
| 4 | Alertas | Alertas com filtros, acoes, regras |
| 5 | Conversas | Lista com 13 colunas, filtros, batch actions |
| 6 | Detalhe da Conversa | Timeline + painel auditoria (8 secoes) |
| 7 | Recuperacao | Fila priorizada de oportunidades |
| 8 | Equipe | Ranking comparativo de agentes |
| 9 | Perfil do Agente | Radar chart, metricas, historico |
| 10 | Relatorios | 8 tipos, agendamento, exportacao |
| 11 | Conexoes | Status de conexoes WhatsApp |
| 12 | Configuracoes | 7 abas (geral, alertas, notificacoes, equipes, dados, cobranca, api) |
| 13 | Onboarding | Wizard de 7 etapas |
| 14 | Membros | Gestao de membros da organizacao |
| 15 | Equipes | Gestao de equipes com SLA |
| 16 | Planos | Comparacao de planos e cobranca |
| 17 | Notificacoes | Centro de notificacoes |
| 18 | Admin | Painel administrativo (4 abas) |

---

## Arquitetura

```
                  +-------------------+
                  |   Landing Page    |
                  |   Login (Auth)    |
                  +--------+----------+
                           |
                  +--------v----------+
                  |   App Router (/)  |
                  |   SPA via Zustand |
                  +--------+----------+
                           |
          +----------------+----------------+
          |                |                |
   +------v-----+  +------v-----+  +------v-----+
   | Dashboard  |  |  Alerts    |  | Conversas  |
   | Recovery   |  |  Team      |  | Reports    |
   | Connections|  |  Settings  |  | Admin      |
   +------+------+  +------+------+  +------+------+
          |                |                |
          +----------------+----------------+
                           |
                  +--------v----------+
                  |   API Routes      |
                  |   (31 endpoints)  |
                  +--------+----------+
                           |
                  +--------v----------+
                  |   Prisma ORM     |
                  |   SQLite          |
                  +-------------------+
```

---

## Licenca

Projeto privado. Todos os direitos reservados.

---

<p align="center">
  <strong>AtendeRadar</strong> — Auditoria Inteligente de Receita e Qualidade no WhatsApp<br/>
  <sub>Construido com Next.js, TypeScript, Tailwind CSS, shadcn/ui e Prisma</sub>
</p>
