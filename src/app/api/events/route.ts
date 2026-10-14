import { NextResponse } from 'next/server'
import { guard } from '@/lib/api-auth'
import { readJson } from '@/lib/json-body'
import { allow } from '@/lib/rate-limit'
import { track } from '@/lib/product-events'

// I7 · Uso por tela: o painel avisa quando o usuário troca de tela (com atraso, só a tela onde ele parou).
// Só o nome da tela (lista fechada); organização e membro vêm da sessão, nunca do corpo. Nenhum dado pessoal.
const SCREENS = new Set([
  'dashboard', 'alerts', 'conversations', 'conversation-detail', 'recovery', 'team', 'agent-profile', 'reports',
  'connections', 'settings', 'onboarding', 'members', 'teams', 'plans', 'checkout', 'notifications', 'admin', 'profile',
])

export async function POST(request: Request) {
  const g = await guard()
  if (!g.ok) return g.res
  const j = await readJson<{ name?: unknown; view?: unknown }>(request)
  if (!j.ok) return j.res
  const { name, view } = j.body
  if (name !== 'screen_view' || typeof view !== 'string' || !SCREENS.has(view)) {
    return NextResponse.json({ error: 'Evento inválido' }, { status: 400 })
  }
  // trocar de tela muito rápido não enche o banco
  if (!allow(`events:${g.auth.memberId}`, 120, 60_000)) return new NextResponse(null, { status: 204 })
  await track('screen_view', { organizationId: g.auth.orgId, memberId: g.auth.memberId }, { view })
  return new NextResponse(null, { status: 204 })
}
