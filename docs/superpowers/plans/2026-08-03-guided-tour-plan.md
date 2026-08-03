# Onboarding Guiado + Tutorial por Tela — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um tour interativo (spotlight) que se auto-inicia na primeira visita de cada tela e pode ser reaberto manualmente pelo botão "Ajuda" — cobrindo um passeio de boas-vindas (`welcome`) mais um tour por tela para as 12 telas do menu principal.

**Architecture:** Um único componente de spotlight (`TourOverlay`) lê passos de um registro de conteúdo estático (`tours.ts`) e aponta pra elementos reais marcados com `data-tour="<id>"`. Estado do tour ativo mora no `useAppStore` já existente. Persistência de "tours vistos" é por usuário, via uma coluna nova em `OrganizationMember` e uma rota `/api/tours`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind, shadcn/ui, Zustand (`useAppStore`), Prisma/SQLite, NextAuth (`getServerSession`). Nenhuma dependência nova.

## Global Constraints

- Sem bibliotecas novas (`react-joyride`, `driver.js` etc.) — motor do spotlight é código próprio, reaproveitando `Card`/Tailwind já existentes.
- Persistência real por usuário via `OrganizationMember.seenToursJson` (mesmo padrão JSON-blob de `Organization.settingsJson`, já usado em `src/app/api/settings/route.ts`).
- `bun run build` deve compilar limpo depois de cada tarefa que toca código (o erro de `cp -r` no fim do script `build` no Windows é esperado e não indica falha real — só "Compiled successfully" e a listagem de rotas importam).
- Todo texto de UI em português, no mesmo tom do resto do app.
- Se o elemento-alvo de um passo não existir no DOM no momento (`data-tour` ausente), o motor pula esse passo automaticamente — nunca trava ou mostra um spotlight quebrado.
- `notifications` fica fora do escopo desta entrega (tela simples demais pra justificar um tour).

---

### Task 1: Schema — coluna `seenToursJson` em `OrganizationMember`

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `OrganizationMember.seenToursJson: String?` (nullable, sem default) — consumida pela Task 2.

- [ ] **Step 1: Adicionar o campo ao model**

Em `prisma/schema.prisma`, dentro de `model OrganizationMember { ... }`, adicionar a linha `seenToursJson   String?` logo após `mfaEnabled    Boolean   @default(false)`:

```prisma
model OrganizationMember {
  id            String    @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  userId        String
  name          String
  email         String
  role          String    @default("member")
  team          String?
  status        String    @default("active")
  lastAccessAt  DateTime?
  mfaEnabled    Boolean   @default(false)
  seenToursJson String?
  invitedAt     DateTime  @default(now())
  invitedBy     String?
}
```

- [ ] **Step 2: Sincronizar o schema com o banco local**

Run: `cd "D:/ALC/clientes/alc/atende-radar" && bun run db:push`
Expected: `Your database is now in sync with your Prisma schema.` (sem prompt de reset — se aparecer prompt de reset, é sinal de que outra coisa mudou o schema; investigar antes de aceitar).

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "Add OrganizationMember.seenToursJson for per-user tour tracking"
```

---

### Task 2: API `/api/tours` (GET/PATCH)

**Files:**
- Create: `src/app/api/tours/route.ts`

**Interfaces:**
- Consumes: `OrganizationMember.seenToursJson` (Task 1), `authOptions` de `src/lib/auth.ts`.
- Produces: `GET /api/tours` → `{ seen: string[] }`. `PATCH /api/tours` body `{ tourId: string }` → `{ success: true, seen: string[] }`. Consumida pela Task 3 (store) e pelo shell (Task 6).

- [ ] **Step 1: Escrever a rota**

```ts
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const member = await db.organizationMember.findUnique({ where: { id: session.user.id } })
  if (!member) {
    return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 })
  }

  return NextResponse.json({ seen: safeJsonParse<string[]>(member.seenToursJson, []) })
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const body = await request.json()
  const { tourId } = body as { tourId?: string }
  if (!tourId) {
    return NextResponse.json({ error: 'tourId é obrigatório' }, { status: 400 })
  }

  const member = await db.organizationMember.findUnique({ where: { id: session.user.id } })
  if (!member) {
    return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 })
  }

  const current = safeJsonParse<string[]>(member.seenToursJson, [])
  const seen = current.includes(tourId) ? current : [...current, tourId]

  await db.organizationMember.update({
    where: { id: member.id },
    data: { seenToursJson: JSON.stringify(seen) },
  })

  return NextResponse.json({ success: true, seen })
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd "D:/ALC/clientes/alc/atende-radar" && bun run build 2>&1 | grep -E "error|Compiled successfully|Type error"`
Expected: `✓ Compiled successfully` e a rota `ƒ /api/tours` listada.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tours/route.ts
git commit -m "Add /api/tours endpoint for per-user tour seen-state"
```

---

### Task 3: Estado de tour no `useAppStore`

**Files:**
- Modify: `src/lib/store.ts`

**Interfaces:**
- Produces: `activeTour: string | null`, `activeStep: number`, `seenTours: string[]`, `toursLoaded: boolean`, `startTour(tourId: string)`, `nextStep()`, `prevStep()`, `endTour()`, `setSeenTours(seen: string[])`, `markTourSeen(tourId: string)`. Consumidas por `TourOverlay` (Task 4) e pelo shell/header (Tasks 6-7).

- [ ] **Step 1: Adicionar os campos e ações ao `AppState`**

Em `src/lib/store.ts`, adicionar ao `interface AppState`:

```ts
  pendingSearch: string | null
  activeTour: string | null
  activeStep: number
  seenTours: string[]
  toursLoaded: boolean
  setPendingSearch: (query: string | null) => void
  startTour: (tourId: string) => void
  nextTourStep: () => void
  prevTourStep: () => void
  endTour: () => void
  setSeenTours: (seen: string[]) => void
  markTourSeen: (tourId: string) => void
```

(o campo `pendingSearch`/`setPendingSearch` já existe — não duplicar, só os seis novos abaixo dele).

- [ ] **Step 2: Implementar no corpo do `create<AppState>`**

```ts
  activeTour: null,
  activeStep: 0,
  seenTours: [],
  toursLoaded: false,
  startTour: (tourId) => set({ activeTour: tourId, activeStep: 0 }),
  nextTourStep: () => set((s) => ({ activeStep: s.activeStep + 1 })),
  prevTourStep: () => set((s) => ({ activeStep: Math.max(0, s.activeStep - 1) })),
  endTour: () => set({ activeTour: null, activeStep: 0 }),
  setSeenTours: (seen) => set({ seenTours: seen, toursLoaded: true }),
  markTourSeen: (tourId) => set((s) => ({ seenTours: s.seenTours.includes(tourId) ? s.seenTours : [...s.seenTours, tourId] })),
```

- [ ] **Step 3: Verificar que compila**

Run: `cd "D:/ALC/clientes/alc/atende-radar" && bun run build 2>&1 | grep -E "error|Compiled successfully|Type error"`
Expected: `✓ Compiled successfully`, sem erros de tipo em outros componentes que importam `useAppStore`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/store.ts
git commit -m "Add tour state (activeTour/seenTours) to app store"
```

---

### Task 4: Registro de conteúdo `tours.ts` — estrutura + tour `welcome`

**Files:**
- Create: `src/lib/tours.ts`

**Interfaces:**
- Produces: `export interface TourStep { target: string; title: string; body: string; placement?: 'top'|'bottom'|'left'|'right' }`, `export const TOURS: Record<string, TourStep[]>`. Consumido por `TourOverlay` (Task 5) e por todas as tarefas de conteúdo por página (Tasks 8-19, que só adicionam entradas neste mesmo objeto).

- [ ] **Step 1: Criar o arquivo com o tour `welcome`**

```ts
export interface TourStep {
  target: string
  title: string
  body: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

export const TOURS: Record<string, TourStep[]> = {
  welcome: [
    {
      target: 'nav-dashboard',
      title: 'Bem-vindo ao AtendeRadar',
      body: 'Este é o menu principal. Cada item leva a uma tela do sistema — vamos destacar as mais importantes.',
      placement: 'right',
    },
    {
      target: 'nav-alerts',
      title: 'Alertas',
      body: 'Aqui aparecem os problemas detectados automaticamente: clientes sem resposta, promessas vencidas, oportunidades em risco.',
      placement: 'right',
    },
    {
      target: 'nav-connections',
      title: 'Conexões',
      body: 'Gerencie as conexões de WhatsApp da sua organização — pausar, reconectar, renomear ou remover.',
      placement: 'right',
    },
    {
      target: 'header-search',
      title: 'Busca rápida',
      body: 'Digite aqui e aperte Enter para buscar por cliente, telefone ou atendente direto na tela de Conversas.',
      placement: 'bottom',
    },
    {
      target: 'header-help',
      title: 'Precisa rever algo?',
      body: 'Clique aqui a qualquer momento para reabrir o tour da tela em que você está, ou este tour de boas-vindas de novo.',
      placement: 'bottom',
    },
  ],
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd "D:/ALC/clientes/alc/atende-radar" && bun run build 2>&1 | grep -E "error|Compiled successfully|Type error"`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tours.ts
git commit -m "Add tours.ts content registry with welcome tour"
```

---

### Task 5: Componente `TourOverlay` (motor do spotlight)

**Files:**
- Create: `src/components/tour/tour-overlay.tsx`

**Interfaces:**
- Consumes: `useAppStore` (`activeTour`, `activeStep`, `nextTourStep`, `prevTourStep`, `endTour`, `markTourSeen`), `TOURS` de `@/lib/tours`.
- Produces: `export function TourOverlay()` — componente sem props, monta-se uma vez. Consumido pela Task 6.

- [ ] **Step 1: Escrever o componente**

```tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { TOURS } from '@/lib/tours'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

export function TourOverlay() {
  const activeTour = useAppStore((s) => s.activeTour)
  const activeStep = useAppStore((s) => s.activeStep)
  const nextTourStep = useAppStore((s) => s.nextTourStep)
  const prevTourStep = useAppStore((s) => s.prevTourStep)
  const endTour = useAppStore((s) => s.endTour)
  const markTourSeen = useAppStore((s) => s.markTourSeen)

  const [rect, setRect] = useState<DOMRect | null>(null)
  const steps = activeTour ? TOURS[activeTour] || [] : []
  const step = steps[activeStep]

  const measure = useCallback(() => {
    if (!step) return
    const el = document.querySelector(`[data-tour="${step.target}"]`)
    if (!el) {
      // Alvo não encontrado nesta renderização — pula pro próximo passo
      if (activeTour) {
        if (activeStep < steps.length - 1) {
          nextTourStep()
        } else {
          markTourSeen(activeTour)
          endTour()
        }
      }
      return
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setRect(el.getBoundingClientRect())
  }, [step, activeTour, activeStep, steps.length, nextTourStep, endTour, markTourSeen])

  useEffect(() => {
    setRect(null)
    const id = window.setTimeout(measure, 350) // dá tempo do scrollIntoView terminar
    return () => window.clearTimeout(id)
  }, [measure])

  useEffect(() => {
    if (!activeTour) return
    const onResizeOrScroll = () => measure()
    window.addEventListener('resize', onResizeOrScroll)
    window.addEventListener('scroll', onResizeOrScroll, true)
    return () => {
      window.removeEventListener('resize', onResizeOrScroll)
      window.removeEventListener('scroll', onResizeOrScroll, true)
    }
  }, [activeTour, measure])

  if (!activeTour || !step || !rect) return null

  const isLast = activeStep === steps.length - 1
  const placement = step.placement || 'bottom'

  const cardStyle: React.CSSProperties = { position: 'fixed', zIndex: 100 }
  const gap = 12
  if (placement === 'bottom') {
    cardStyle.top = rect.bottom + gap
    cardStyle.left = Math.min(Math.max(rect.left, 16), window.innerWidth - 336)
  } else if (placement === 'top') {
    cardStyle.bottom = window.innerHeight - rect.top + gap
    cardStyle.left = Math.min(Math.max(rect.left, 16), window.innerWidth - 336)
  } else if (placement === 'right') {
    cardStyle.left = rect.right + gap
    cardStyle.top = Math.min(Math.max(rect.top, 16), window.innerHeight - 220)
  } else {
    cardStyle.right = window.innerWidth - rect.left + gap
    cardStyle.top = Math.min(Math.max(rect.top, 16), window.innerHeight - 220)
  }

  const handleFinish = () => {
    markTourSeen(activeTour)
    fetch('/api/tours', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tourId: activeTour }),
    }).catch(() => {})
    endTour()
  }

  return (
    <>
      {/* Overlay escurecido com recorte ao redor do alvo */}
      <div
        style={{
          position: 'fixed',
          top: rect.top - 6,
          left: rect.left - 6,
          width: rect.width + 12,
          height: rect.height + 12,
          borderRadius: 8,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
          zIndex: 90,
          pointerEvents: 'none',
          transition: 'all 0.2s ease',
        }}
      />
      {/* Card com o conteúdo do passo */}
      <div
        style={{ ...cardStyle, width: 320 }}
        className="rounded-lg border bg-popover text-popover-foreground shadow-xl p-4"
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm">{step.title}</h3>
          <button onClick={handleFinish} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mt-1.5">{step.body}</p>
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-muted-foreground">
            Passo {activeStep + 1} de {steps.length}
          </span>
          <div className="flex items-center gap-2">
            {activeStep > 0 && (
              <Button variant="outline" size="sm" onClick={prevTourStep}>Voltar</Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleFinish}>Pular tour</Button>
            <Button size="sm" onClick={isLast ? handleFinish : nextTourStep}>
              {isLast ? 'Concluir' : 'Próximo'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd "D:/ALC/clientes/alc/atende-radar" && bun run build 2>&1 | grep -E "error|Compiled successfully|Type error"`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add src/components/tour/tour-overlay.tsx
git commit -m "Add TourOverlay spotlight engine component"
```

---

### Task 6: Montar `TourOverlay` no shell + gatilho automático + carregar `seenTours`

**Files:**
- Modify: o componente de shell autenticado que já renderiza `AppSidebar` + `AppHeader` juntos (localizar com `grep -rl "AppSidebar" src/app` — normalmente `src/app/(authenticated)/layout.tsx` ou equivalente; usar o arquivo real encontrado).

**Interfaces:**
- Consumes: `TourOverlay` (Task 5), `useAppStore` (`currentView`, `seenTours`, `toursLoaded`, `setSeenTours`, `startTour`), `TOURS` de `@/lib/tours`.

- [ ] **Step 1: Localizar o arquivo de shell**

Run: `cd "D:/ALC/clientes/alc/atende-radar" && grep -rl "AppSidebar" src/app src/components/layout`

Abrir o arquivo retornado que faz o `import` e a renderização de `<AppSidebar />` junto com o conteúdo da página (é o shell autenticado — não é `app-sidebar.tsx` nem `app-header.tsx` em si).

- [ ] **Step 2: Adicionar o `TourOverlay` e o efeito de carregamento/gatilho**

No topo do arquivo de shell, adicionar:

```tsx
import { useEffect } from 'react'
import { TourOverlay } from '@/components/tour/tour-overlay'
import { TOURS } from '@/lib/tours'
```

Dentro do componente de shell, antes do `return`, adicionar:

```tsx
  const currentView = useAppStore((s) => s.currentView)
  const seenTours = useAppStore((s) => s.seenTours)
  const toursLoaded = useAppStore((s) => s.toursLoaded)
  const setSeenTours = useAppStore((s) => s.setSeenTours)
  const startTour = useAppStore((s) => s.startTour)
  const activeTour = useAppStore((s) => s.activeTour)

  useEffect(() => {
    fetch('/api/tours')
      .then((r) => (r.ok ? r.json() : { seen: [] }))
      .then((d) => setSeenTours(d.seen || []))
      .catch(() => setSeenTours([]))
  }, [setSeenTours])

  useEffect(() => {
    if (!toursLoaded || activeTour) return
    if (!seenTours.includes('welcome')) {
      const id = window.setTimeout(() => startTour('welcome'), 600)
      return () => window.clearTimeout(id)
    }
    if (TOURS[currentView] && !seenTours.includes(currentView)) {
      const id = window.setTimeout(() => startTour(currentView), 600)
      return () => window.clearTimeout(id)
    }
  }, [toursLoaded, seenTours, currentView, activeTour, startTour])
```

E adicionar `<TourOverlay />` uma vez dentro do JSX retornado pelo shell (junto com `<AppSidebar />`/`<AppHeader />`, fora do conteúdo scrollável da página — um `<TourOverlay />` sozinho como último filho basta, ele mesmo é `position: fixed`).

(Se `useAppStore` ainda não estiver importado neste arquivo, adicionar `import { useAppStore } from '@/lib/store'`.)

- [ ] **Step 3: Verificar que compila**

Run: `cd "D:/ALC/clientes/alc/atende-radar" && bun run build 2>&1 | grep -E "error|Compiled successfully|Type error"`
Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add <arquivo de shell encontrado no Step 1>
git commit -m "Mount TourOverlay and wire auto-trigger logic into authenticated shell"
```

---

### Task 7: `data-tour` na sidebar/header + botão "Ajuda" com replay real

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx`
- Modify: `src/components/layout/app-header.tsx`

**Interfaces:**
- Consumes: `useAppStore` (`startTour`, `currentView`) já disponível nesses arquivos.

- [ ] **Step 1: `data-tour` nos itens de navegação da sidebar**

Em `src/components/layout/app-sidebar.tsx`, na função `renderNavItem`, adicionar `data-tour={\`nav-${item.view}\`}` no elemento `<button>` (dentro de `btn`, junto com `key={item.view}` e `onClick={...}`):

```tsx
    const btn = (
      <button
        key={item.view}
        data-tour={`nav-${item.view}`}
        onClick={() => setView(item.view)}
        ...
```

- [ ] **Step 2: `data-tour` na busca e no gatilho de conta no header**

Em `src/components/layout/app-header.tsx`:
- No `<Input>` da busca (o que tem `placeholder='Buscar conversas, contatos, alertas...'`), adicionar `data-tour="header-search"`.
- No `<Button>` que é `DropdownMenuTrigger` do menu de conta (o que envolve o `Avatar`/nome do usuário), adicionar `data-tour="header-help"`.

- [ ] **Step 3: Botão "Ajuda" vira replay real**

Em `src/components/layout/app-header.tsx`, importar `useAppStore`'s `startTour` (já importamos `useAppStore` — só adicionar `startTour` à desestruturação existente) e substituir o item "Ajuda":

```tsx
            <DropdownMenuItem onClick={() => startTour(currentViewForTour)}><HelpCircle className='mr-2 h-4 w-4' />Tour desta tela</DropdownMenuItem>
            <DropdownMenuItem onClick={() => startTour('welcome')}><User className='mr-2 h-4 w-4' />Tour de boas-vindas</DropdownMenuItem>
```

onde `currentViewForTour` vem de `useAppStore((s) => s.currentView)` (adicionar essa leitura no topo do componente, junto com os outros hooks do store já existentes). Remover o `toast.info('Central de ajuda...')` anterior — ele não é mais necessário (o import de `toast` continua em uso pelo item "Criar organização").

- [ ] **Step 4: Verificar que compila**

Run: `cd "D:/ALC/clientes/alc/atende-radar" && bun run build 2>&1 | grep -E "error|Compiled successfully|Type error"`
Expected: `✓ Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/app-sidebar.tsx src/components/layout/app-header.tsx
git commit -m "Wire data-tour targets in sidebar/header and make Ajuda replay tours for real"
```

---

### Task 8: Tour `dashboard`

**Files:**
- Modify: `src/lib/tours.ts` (adicionar chave `dashboard` ao objeto `TOURS`)
- Modify: `src/components/dashboard/dashboard-view.tsx`

**Interfaces:**
- Produces: entrada `TOURS.dashboard` consumida pelo motor já existente (Task 5) — nenhuma interface nova.

- [ ] **Step 1: Adicionar `data-tour` nos elementos reais**

Em `dashboard-view.tsx`:
- No `<Select value={period} ...>` (seletor de período "Hoje/Ontem/7 dias/30 dias"), adicionar `data-tour="dashboard-period"` no `<SelectTrigger>`.
- No `<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 ...">` que envolve os `kpiCards.map(...)`, adicionar `data-tour="dashboard-kpis"`.
- No `<Card>` de "Prioridades Agora", adicionar `data-tour="dashboard-priorities"`.
- No `<Card>` de "Desempenho da Equipe", adicionar `data-tour="dashboard-team-perf"`.

- [ ] **Step 2: Adicionar o tour em `tours.ts`**

```ts
  dashboard: [
    {
      target: 'dashboard-period',
      title: 'Escolha o período',
      body: 'Troque entre Hoje, Ontem, 7 ou 30 dias — todos os números da tela se recalculam pra esse período.',
      placement: 'bottom',
    },
    {
      target: 'dashboard-kpis',
      title: 'Indicadores principais',
      body: 'Cada cartão mostra um indicador de atendimento com a variação em relação ao período anterior. Passe o mouse pra ver a explicação de cada um.',
      placement: 'bottom',
    },
    {
      target: 'dashboard-priorities',
      title: 'Prioridades agora',
      body: 'As 10 conversas com maior risco de perda no momento, ordenadas pelo valor potencial em jogo. Clique em "Ver" pra abrir a conversa.',
      placement: 'top',
    },
    {
      target: 'dashboard-team-perf',
      title: 'Desempenho da equipe',
      body: 'Compare nota, tempo de resposta, oportunidades e promessas cumpridas entre os atendentes.',
      placement: 'top',
    },
  ],
```

- [ ] **Step 3: Verificar que compila**

Run: `cd "D:/ALC/clientes/alc/atende-radar" && bun run build 2>&1 | grep -E "error|Compiled successfully|Type error"`
Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/tours.ts src/components/dashboard/dashboard-view.tsx
git commit -m "Add dashboard tour"
```

---

### Task 9: Tour `alerts`

**Files:**
- Modify: `src/lib/tours.ts`
- Modify: `src/components/alerts/alerts-view.tsx`

- [ ] **Step 1: `data-tour` nos elementos reais**

Em `alerts-view.tsx`:
- No `<TabsList>` (Ativos/Em acompanhamento/Resolvidos/Ignorados/Regras), adicionar `data-tour="alerts-tabs"`.
- No `<Card className="p-3">` raiz de `FilterBar`, adicionar `data-tour="alerts-filterbar"`.
- No botão "Nova regra" (`<Button size="sm" className="gap-1.5">` dentro do `DialogTrigger` da `RulesTab`), adicionar `data-tour="alerts-new-rule"`.

- [ ] **Step 2: Adicionar o tour em `tours.ts`**

```ts
  alerts: [
    {
      target: 'alerts-tabs',
      title: 'Organize por status',
      body: 'Ativos, Em acompanhamento, Resolvidos e Ignorados — cada aba filtra os alertas pelo estágio de tratamento. A aba "Regras" configura quando cada alerta é gerado.',
      placement: 'bottom',
    },
    {
      target: 'alerts-filterbar',
      title: 'Filtre o que importa',
      body: 'Busque por texto, filtre por criticidade, tipo, atendente, equipe ou confiança mínima da detecção automática.',
      placement: 'bottom',
    },
    {
      target: 'alerts-new-rule',
      title: 'Crie novas regras',
      body: 'Defina um novo gatilho de alerta escolhendo o tipo, a severidade e o tempo de espera (cooldown) entre disparos repetidos.',
      placement: 'left',
    },
  ],
```

- [ ] **Step 3: Verificar que compila**

Run: `cd "D:/ALC/clientes/alc/atende-radar" && bun run build 2>&1 | grep -E "error|Compiled successfully|Type error"`
Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/tours.ts src/components/alerts/alerts-view.tsx
git commit -m "Add alerts tour"
```

---

### Task 10: Tour `conversations`

**Files:**
- Modify: `src/lib/tours.ts`
- Modify: `src/components/conversations/conversations-view.tsx`

- [ ] **Step 1: `data-tour` nos elementos reais**

Em `conversations-view.tsx`:
- No `<div className="relative max-w-sm">` que envolve o `<Input placeholder="Buscar por cliente, telefone ou atendente...">`, adicionar `data-tour="conversations-search"`.
- No `<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 ...">` que envolve os `<Select>` de filtros (Período/Responsável/Intenção/Urgência/etc.), adicionar `data-tour="conversations-filters"`.

- [ ] **Step 2: Adicionar o tour em `tours.ts`**

```ts
  conversations: [
    {
      target: 'conversations-search',
      title: 'Busque uma conversa',
      body: 'Essa é a mesma busca do cabeçalho — filtra por nome do cliente, telefone ou atendente responsável.',
      placement: 'bottom',
    },
    {
      target: 'conversations-filters',
      title: 'Filtre por qualquer critério',
      body: 'Combine período, responsável, intenção, urgência, sentimento, etapa e mais pra chegar exatamente nas conversas que você precisa revisar.',
      placement: 'bottom',
    },
  ],
```

- [ ] **Step 3: Verificar que compila**

Run: `cd "D:/ALC/clientes/alc/atende-radar" && bun run build 2>&1 | grep -E "error|Compiled successfully|Type error"`
Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/tours.ts src/components/conversations/conversations-view.tsx
git commit -m "Add conversations tour"
```

---

### Task 11: Tour `recovery`

**Files:**
- Modify: `src/lib/tours.ts`
- Modify: `src/components/recovery/recovery-view.tsx`

- [ ] **Step 1: `data-tour` nos elementos reais**

Em `recovery-view.tsx`:
- No `<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">` que envolve os 4 cartões de métricas (Itens criados/Itens trabalhados/Taxa de contato/Receita recuperada), adicionar `data-tour="recovery-metrics"`.
- No `<Card>` que envolve a `<Table>` principal da lista de itens de recuperação, adicionar `data-tour="recovery-table"`.

- [ ] **Step 2: Adicionar o tour em `tours.ts`**

```ts
  recovery: [
    {
      target: 'recovery-metrics',
      title: 'Acompanhe a recuperação',
      body: 'Quantos itens foram criados, quantos já foram trabalhados, a taxa de contato e o valor total recuperado até agora.',
      placement: 'bottom',
    },
    {
      target: 'recovery-table',
      title: 'Trabalhe cada oportunidade',
      body: 'Passe o mouse sobre uma linha pra ver as ações: atribuir responsável, mudar o prazo, copiar o contexto, registrar tentativa ou resultado, e informar o valor recuperado.',
      placement: 'top',
    },
  ],
```

- [ ] **Step 3: Verificar que compila**

Run: `cd "D:/ALC/clientes/alc/atende-radar" && bun run build 2>&1 | grep -E "error|Compiled successfully|Type error"`
Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/tours.ts src/components/recovery/recovery-view.tsx
git commit -m "Add recovery tour"
```

---

### Task 12: Tour `team`

**Files:**
- Modify: `src/lib/tours.ts`
- Modify: `src/components/team/team-view.tsx`

- [ ] **Step 1: `data-tour` nos elementos reais**

Em `team-view.tsx`:
- No `<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">` que envolve os 3 cartões de resumo (Total de agentes/Nota média/Tempo médio de resposta), adicionar `data-tour="team-summary"`.
- No `<Card>` que envolve a `<Table>` principal, adicionar `data-tour="team-table"`.

- [ ] **Step 2: Adicionar o tour em `tours.ts`**

```ts
  team: [
    {
      target: 'team-summary',
      title: 'Visão geral da equipe',
      body: 'Total de agentes ativos, nota média composta e tempo médio de resposta da equipe inteira.',
      placement: 'bottom',
    },
    {
      target: 'team-table',
      title: 'Compare os atendentes',
      body: 'Clique em qualquer linha pra abrir o perfil detalhado daquele atendente. Clique nos cabeçalhos das colunas pra ordenar por nota, conversas, oportunidades e mais.',
      placement: 'top',
    },
  ],
```

- [ ] **Step 3: Verificar que compila**

Run: `cd "D:/ALC/clientes/alc/atende-radar" && bun run build 2>&1 | grep -E "error|Compiled successfully|Type error"`
Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/tours.ts src/components/team/team-view.tsx
git commit -m "Add team tour"
```

---

### Task 13: Tour `reports`

**Files:**
- Modify: `src/lib/tours.ts`
- Modify: `src/components/reports/reports-view.tsx`

- [ ] **Step 1: `data-tour` nos elementos reais**

Em `reports-view.tsx`:
- No `<TabsList>` (Tipos de Relatório/Histórico), adicionar `data-tour="reports-tabs"`.
- No `<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">` que envolve os cartões de `reportTypesData.map(...)`, adicionar `data-tour="reports-types"`.

- [ ] **Step 2: Adicionar o tour em `tours.ts`**

```ts
  reports: [
    {
      target: 'reports-tabs',
      title: 'Tipos ou histórico',
      body: '"Tipos de Relatório" mostra os relatórios disponíveis pra gerar agora ou configurar o agendamento. "Histórico" mostra tudo que já foi gerado e o status de cada execução.',
      placement: 'bottom',
    },
    {
      target: 'reports-types',
      title: 'Gere ou agende relatórios',
      body: '"Gerar agora" cria uma execução imediata dos últimos 7 dias. "Configurar" ajusta o agendamento e os destinatários por e-mail de cada relatório.',
      placement: 'bottom',
    },
  ],
```

- [ ] **Step 3: Verificar que compila**

Run: `cd "D:/ALC/clientes/alc/atende-radar" && bun run build 2>&1 | grep -E "error|Compiled successfully|Type error"`
Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/tours.ts src/components/reports/reports-view.tsx
git commit -m "Add reports tour"
```

---

### Task 14: Tour `connections`

**Files:**
- Modify: `src/lib/tours.ts`
- Modify: `src/components/connections/connections-view.tsx`

**Interfaces:**
- Consumes: nenhuma interface nova — este arquivo já foi modificado nesta sessão (fix de botões mortos); localizar o botão real "Nova Conexão" e o container da grade/lista de conexões antes de inserir `data-tour` (ler o arquivo primeiro, os nomes de variável podem ter mudado desde a última leitura completa).

- [ ] **Step 1: Ler o arquivo atual e localizar os elementos**

Run: `grep -n "Nova Conexão\|connectionsData.map\|Diagnóstico" src/components/connections/connections-view.tsx`

Confirmar os três alvos: o botão/`DialogTrigger` de "Nova Conexão", o container que faz `.map` sobre as conexões (grade de `Card`s), e a seção expandível de "Diagnóstico" dentro de cada card.

- [ ] **Step 2: Adicionar `data-tour`**

- No botão que abre o diálogo "Nova Conexão", adicionar `data-tour="connections-new"`.
- No container que envolve a grade de cards de conexão, adicionar `data-tour="connections-list"`.

- [ ] **Step 3: Adicionar o tour em `tours.ts`**

```ts
  connections: [
    {
      target: 'connections-new',
      title: 'Adicione uma conexão',
      body: 'Cadastre um novo número de WhatsApp com nome e telefone pra começar a monitorar as conversas dele.',
      placement: 'left',
    },
    {
      target: 'connections-list',
      title: 'Gerencie cada conexão',
      body: 'Reconectar, testar, renomear, desconectar ou excluir — as ações aparecem em cada cartão. Expanda "Diagnóstico" pra ver a saúde da conexão em detalhe.',
      placement: 'top',
    },
  ],
```

- [ ] **Step 4: Verificar que compila**

Run: `cd "D:/ALC/clientes/alc/atende-radar" && bun run build 2>&1 | grep -E "error|Compiled successfully|Type error"`
Expected: `✓ Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tours.ts src/components/connections/connections-view.tsx
git commit -m "Add connections tour"
```

---

### Task 15: Tour `settings`

**Files:**
- Modify: `src/lib/tours.ts`
- Modify: `src/components/settings/settings-view.tsx`

- [ ] **Step 1: `data-tour` nos elementos reais**

Em `settings-view.tsx`, no `<TabsList className="flex flex-wrap h-auto gap-1">` (Empresa/Horários/Atendimento/Financeiro/IA/Notificações/Privacidade/Regras), adicionar `data-tour="settings-tabs"`.

- [ ] **Step 2: Adicionar o tour em `tours.ts`**

```ts
  settings: [
    {
      target: 'settings-tabs',
      title: 'Tudo configurável em um lugar',
      body: 'Dados da empresa, horário comercial, SLAs de atendimento, parâmetros financeiros, comportamento da IA, notificações, privacidade e regras de alerta — cada aba salva de forma independente com o botão Salvar no final dela.',
      placement: 'bottom',
    },
  ],
```

- [ ] **Step 3: Verificar que compila**

Run: `cd "D:/ALC/clientes/alc/atende-radar" && bun run build 2>&1 | grep -E "error|Compiled successfully|Type error"`
Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/tours.ts src/components/settings/settings-view.tsx
git commit -m "Add settings tour"
```

---

### Task 16: Tour `members`

**Files:**
- Modify: `src/lib/tours.ts`
- Modify: `src/components/members/members-view.tsx`

- [ ] **Step 1: `data-tour` nos elementos reais**

Em `members-view.tsx`:
- No `<DialogTrigger asChild>` que envolve o botão "Adicionar membro", adicionar `data-tour="members-add"`.
- No `<Card>` que envolve a `<Table>` de membros, adicionar `data-tour="members-table"`.

- [ ] **Step 2: Adicionar o tour em `tours.ts`**

```ts
  members: [
    {
      target: 'members-add',
      title: 'Adicione um membro',
      body: 'Cadastre nome, e-mail, função e equipe de um novo colaborador da organização.',
      placement: 'left',
    },
    {
      target: 'members-table',
      title: 'Gerencie funções e acesso',
      body: 'Use o menu de ações de cada linha (ícone de três pontos) pra trocar a função do membro ou removê-lo da organização.',
      placement: 'top',
    },
  ],
```

- [ ] **Step 3: Verificar que compila**

Run: `cd "D:/ALC/clientes/alc/atende-radar" && bun run build 2>&1 | grep -E "error|Compiled successfully|Type error"`
Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/tours.ts src/components/members/members-view.tsx
git commit -m "Add members tour"
```

---

### Task 17: Tour `teams`

**Files:**
- Modify: `src/lib/tours.ts`
- Modify: `src/components/teams/teams-view.tsx`

- [ ] **Step 1: `data-tour` nos elementos reais**

Em `teams-view.tsx`:
- No `<DialogTrigger asChild>` que envolve o botão "Criar equipe", adicionar `data-tour="teams-create"`.
- No `<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">` que envolve os cartões de equipe, adicionar `data-tour="teams-list"`.

- [ ] **Step 2: Adicionar o tour em `tours.ts`**

```ts
  teams: [
    {
      target: 'teams-create',
      title: 'Crie uma nova equipe',
      body: 'Defina o nome da equipe e escolha um supervisor entre os agentes cadastrados.',
      placement: 'left',
    },
    {
      target: 'teams-list',
      title: 'Ative ou desative equipes',
      body: 'Cada cartão mostra o supervisor, o número de membros e permite ativar ou desativar a equipe.',
      placement: 'top',
    },
  ],
```

- [ ] **Step 3: Verificar que compila**

Run: `cd "D:/ALC/clientes/alc/atende-radar" && bun run build 2>&1 | grep -E "error|Compiled successfully|Type error"`
Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/tours.ts src/components/teams/teams-view.tsx
git commit -m "Add teams tour"
```

---

### Task 18: Tour `plans`

**Files:**
- Modify: `src/lib/tours.ts`
- Modify: `src/components/plans/plans-view.tsx`

- [ ] **Step 1: `data-tour` nos elementos reais**

Em `plans-view.tsx`:
- No `<Card>` de "Uso este mês", adicionar `data-tour="plans-usage"`.
- No `<div className="grid grid-cols-1 md:grid-cols-3 gap-4">` que envolve os 3 cartões de planos (`plans.map(...)`), adicionar `data-tour="plans-compare"`.

- [ ] **Step 2: Adicionar o tour em `tours.ts`**

```ts
  plans: [
    {
      target: 'plans-usage',
      title: 'Acompanhe o uso do seu plano',
      body: 'Conversas, mensagens, agentes e conexões consumidos este mês em relação ao limite do seu plano atual.',
      placement: 'bottom',
    },
    {
      target: 'plans-compare',
      title: 'Compare os planos',
      body: 'Veja os limites e recursos de cada plano lado a lado, e a tabela completa de comparação logo abaixo.',
      placement: 'top',
    },
  ],
```

- [ ] **Step 3: Verificar que compila**

Run: `cd "D:/ALC/clientes/alc/atende-radar" && bun run build 2>&1 | grep -E "error|Compiled successfully|Type error"`
Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/tours.ts src/components/plans/plans-view.tsx
git commit -m "Add plans tour"
```

---

### Task 19: Tour `admin`

**Files:**
- Modify: `src/lib/tours.ts`
- Modify: `src/components/admin/admin-view.tsx`

- [ ] **Step 1: `data-tour` nos elementos reais**

Em `admin-view.tsx`:
- No `<TabsList className="flex flex-wrap">` (Visão Geral/Organizações/Usuários Globais/Sistema), adicionar `data-tour="admin-tabs"`.
- No `<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">` que envolve os `kpiCards.map(...)`, adicionar `data-tour="admin-kpis"`.

- [ ] **Step 2: Adicionar o tour em `tours.ts`**

```ts
  admin: [
    {
      target: 'admin-tabs',
      title: 'Painel administrativo',
      body: 'Visão Geral resume os números da plataforma. Organizações e Usuários Globais listam e filtram os cadastros. Sistema mostra a saúde do banco, autenticação e armazenamento.',
      placement: 'bottom',
    },
    {
      target: 'admin-kpis',
      title: 'Indicadores da plataforma',
      body: 'Organizações ativas, conexões WhatsApp, usuários cadastrados, conversas de hoje, receita mensal e alertas ativos — clique em "Atualizar" no topo pra recarregar.',
      placement: 'bottom',
    },
  ],
```

- [ ] **Step 3: Verificar que compila**

Run: `cd "D:/ALC/clientes/alc/atende-radar" && bun run build 2>&1 | grep -E "error|Compiled successfully|Type error"`
Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/tours.ts src/components/admin/admin-view.tsx
git commit -m "Add admin tour"
```

---

### Task 20: Deploy e verificação E2E ao vivo

**Files:** nenhum arquivo novo — apenas operações de deploy/verificação.

- [ ] **Step 1: Push e aguardar o deploy**

```bash
cd "D:/ALC/clientes/alc/atende-radar" && git push origin main
```

Depois, fazer polling em `https://api.github.com/repos/alc-br/atende-radar/actions/runs?per_page=1` (com o token de `TOKEN_GITHUB` no `.env`, mesmo padrão usado nas tarefas anteriores desta sessão) até `"status": "completed"` e `"conclusion": "success"`.

- [ ] **Step 2: Login com usuário novo e verificar `welcome` dispara**

Via `mcp__Claude_Browser__javascript_tool` (o Browser pane não renderiza screenshot nesta sessão — usar `fetch`/DOM direto como no resto da sessão): logar em `https://atende-radar.dev.alc.srv.br` com um e-mail nunca usado (ex.: `e2e.tour.<timestamp>@test.com`) + senha `demo123` via `/api/auth/callback/credentials`, confirmar sessão via `/api/auth/session`, confirmar `GET /api/tours` retorna `{ seen: [] }` (usuário novo, sem tours vistos).

- [ ] **Step 3: Verificar o tour `welcome` na página**

Navegar pra `/` autenticado, esperar ~1s, confirmar via `document.querySelectorAll('[data-tour]')` que os elementos-alvo existem no DOM, e confirmar que o overlay do tour aparece (checar por um elemento com o texto "Bem-vindo ao AtendeRadar" via `document.body.innerText`).

- [ ] **Step 4: Completar o tour e verificar persistência**

Clicar "Próximo" repetidamente (via `document.querySelector` + `.click()`) até "Concluir"; depois `GET /api/tours` deve retornar `{ seen: ["welcome"] }`. Recarregar a página — o `welcome` não deve disparar de novo, mas o tour `dashboard` (primeira tela real) deve disparar.

- [ ] **Step 5: Testar replay manual**

Abrir o dropdown de conta no header, clicar "Tour de boas-vindas", confirmar que o overlay reaparece mesmo já estando marcado como visto.

- [ ] **Step 6: Limpar o usuário de teste**

Via `DELETE` direto no banco não é possível pela API pública — usar `db.organizationMember.delete` através de uma chamada SSH pontual ao servidor (mesmo padrão de acesso usado nesta sessão), ou deixar o registro de teste se for inofensivo (é um membro de organização só de teste, sem dados sensíveis) — preferir remover se houver um caminho simples, documentar no commit/relato final se não remover.

- [ ] **Step 7: Reportar ao usuário**

Resumo do que foi entregue, com link pras telas testadas.
