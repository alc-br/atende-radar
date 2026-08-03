# Onboarding guiado + tutorial por tela — Design

## Contexto

O app já tem um wizard de configuração inicial (`onboarding-view.tsx`, 7 passos: empresa, horário, meta, WhatsApp, equipe, relatório, revisão) que configura dados da organização. Isso continua existindo e não muda.

O que falta, e que o usuário pediu, é diferente: um **tour guiado interativo** que aponta para elementos reais da interface (spotlight) — um passeio de boas-vindas pela casca do app (sidebar/cabeçalho) e um tutorial equivalente para cada uma das 12 telas principais do menu.

Decisão confirmada com o usuário: **um mecanismo só, reaproveitado** para as duas necessidades — não dois sistemas separados.

## Arquitetura

### 1. Registro de conteúdo — `src/lib/tours.ts`

```ts
export interface TourStep {
  target: string        // casa com data-tour="<target>" em algum elemento da tela
  title: string
  body: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

export const TOURS: Record<string, TourStep[]> = {
  welcome: [...],       // sidebar + cabeçalho (busca, notificações, ajuda)
  dashboard: [...],
  alerts: [...],
  conversations: [...],
  recovery: [...],
  team: [...],
  reports: [...],
  connections: [...],
  settings: [...],
  members: [...],
  teams: [...],
  plans: [...],
  admin: [...],
}
```

13 tours no total (12 telas do menu + `welcome`). Cada tour tem entre 4 e 6 passos, com texto real referenciando elementos que de fato existem na tela (não genérico). `notifications` (acessível pelo sino, não pelo menu principal) fica de fora do escopo inicial — é uma tela simples o suficiente pra não precisar de tour.

### 2. Motor do spotlight — `src/components/tour/tour-overlay.tsx`

Componente único, montado uma vez no shell autenticado do app (ao lado de `AppSidebar`/`AppHeader`). Não usa nenhuma biblioteca nova — só React + os componentes shadcn/ui já existentes no projeto.

Comportamento por passo:
1. Localiza o elemento via `document.querySelector('[data-tour="<target>"]')`.
2. Se não encontrar (ex.: página ainda carregando dados, elemento condicional não renderizado), pula automaticamente para o próximo passo em vez de mostrar um spotlight quebrado.
3. Rola o elemento pro centro da viewport (`scrollIntoView({ block: 'center', behavior: 'smooth' })`).
4. Recalcula a posição em resize/scroll (via `ResizeObserver` + listener de scroll) pra não descolar do alvo.
5. Renderiza:
   - overlay escurecido de tela cheia com um "recorte" ao redor do alvo (técnica de `box-shadow: 0 0 0 9999px rgba(0,0,0,.55)` num div posicionado exatamente sobre o rect do alvo — sem SVG/clip-path).
   - card flutuante (mesmo estilo visual de `Card`/`Popover` do projeto) ancorado ao lado do alvo, com título, corpo, indicador "Passo X de Y" e botões Voltar / Pular tour / Próximo (o último passo troca "Próximo" por "Concluir").

Estado do tour ativo (`activeTour`, `activeStepIndex`, `startTour`, `nextStep`, `prevStep`, `endTour`) entra no `useAppStore` existente, seguindo o padrão já usado ali.

### 3. Persistência — real, por usuário

- Nova coluna `seenToursJson String?` em `OrganizationMember` (mesmo padrão do `Organization.settingsJson` já implementado nesta sessão).
- Nova rota `src/app/api/tours/route.ts`:
  - `GET` — retorna `{ seen: string[] }` para o usuário da sessão atual (via `getServerSession(authOptions)`, resolvendo `session.user.id` → `OrganizationMember.id`).
  - `PATCH` — body `{ tourId: string }`, adiciona ao array (sem duplicar) e persiste.
- Essa é a primeira rota da API que amarra dado a um usuário específico da sessão — hoje tudo opera no esquema de organização única (`db.organization.findFirst()`), sem diferenciar quem está logado. Vale registrar isso como uma mudança de padrão, não só mais um endpoint igual aos outros.
- No mount do shell autenticado, um fetch único popula `seenTours: string[]` no store.

### 4. Gatilho automático

- Efeito no shell: quando `currentView` muda E `seenTours` já carregou E `!seenTours.includes(currentView)` → `startTour(currentView)` depois de ~600ms (dá tempo da tela terminar o primeiro carregamento de dados).
- `welcome` dispara uma vez só, checado no mount inicial do shell (antes de qualquer tour de tela), condicionado a `!seenTours.includes('welcome')`.
- Ao terminar um tour (concluído OU pulado), `PATCH /api/tours` marca como visto — pular também marca como visto (não repete sozinho de novo; só volta via replay manual).

### 5. Replay manual — botão "Ajuda"

O botão "Ajuda" no dropdown de conta (`app-header.tsx`), hoje um toast "não disponível", vira o gatilho real:
- Um item abre o tour da tela atual (`startTour(currentView)`, ignorando se já foi visto — replay forçado).
- Um segundo item ("Tour de boas-vindas") reabre o `welcome`.

### 6. Atributos `data-tour`

Adiciono `data-tour="<slug>"` nos elementos reais apontados por cada passo — nos itens de navegação da sidebar (`data-tour={\`nav-${item.view}\`}`, no loop que já existe), na busca/ajuda do cabeçalho, e em 3-6 elementos por tela (botões, abas, colunas-chave) nos componentes já existentes.

## Fora de escopo (YAGNI)

- Sem UI de administração pra editar conteúdo dos tours (fica hardcoded em `tours.ts`, como `ROLE_LABELS` e outras constantes já existentes no projeto).
- Sem analytics/tracking de engajamento com o tour.
- Sem i18n (só português, como o resto do app).
- Sem layout mobile dedicado além do clamping básico de viewport já previsto no card flutuante.
- Tour de `notifications` fica fora da primeira entrega (tela simples, sem elementos complexos o suficiente pra justificar).

## Verificação

- `bun run build` limpo.
- E2E ao vivo: login com usuário novo (sem `seenToursJson`) → `welcome` dispara sozinho → percorrer passos → tour da tela seguinte dispara sozinho na primeira visita → pular/concluir marca como visto (`GET /api/tours` reflete) → revisitar a tela não dispara de novo → "Ajuda" reabre manualmente → limpar o usuário de teste criado.
