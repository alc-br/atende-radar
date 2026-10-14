import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { audit, type AuditAction } from '../audit'
import type { AuthContext } from '../api-auth'
import { operatorGuard } from '../support-admin'
import { simulationEnabled } from '../sandbox'

// Porta das rotas /api/admin/simulation/*:
//  · SIMULATION_ENABLED diferente de "on" → 404 (a rota "não existe"), para qualquer um;
//  · Authorization: Bearer <segredo> → só vale se igual a SIMULATION_SECRET (16+ caracteres; comparação em tempo
//    constante). Com o cabeçalho presente, a sessão NÃO é usada como alternativa (segredo errado = 401);
//  · sem Bearer → sessão do operador da plataforma (PLATFORM_ADMIN_EMAILS); qualquer outro papel → 403.

export type SimulationActor = { ok: true; by: string; auth: AuthContext | null } | { ok: false; res: NextResponse }

const MIN_SECRET = 16
const digest = (s: string) => createHash('sha256').update(s).digest()

export function bearerMatches(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < MIN_SECRET) return false
  const m = /^Bearer\s+(\S+)\s*$/.exec(header || '')
  if (!m) return false
  return timingSafeEqual(digest(m[1]), digest(secret))
}

export async function simulationAccess(req: Request): Promise<SimulationActor> {
  if (!simulationEnabled()) return { ok: false, res: NextResponse.json({ error: 'Não encontrado' }, { status: 404 }) }
  const header = req.headers.get('authorization')
  if (header && /^Bearer\s/i.test(header)) {
    if (!bearerMatches(header, process.env.SIMULATION_SECRET)) return { ok: false, res: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) }
    return { ok: true, by: 'token', auth: null }
  }
  const g = await operatorGuard()
  if (!g.ok) return g
  return { ok: true, by: g.auth.email, auth: g.auth }
}

/**
 * Auditoria de cada ação: com sessão, no registro de auditoria da empresa do operador; com o segredo, no log do
 * servidor (não há empresa para registrar). Toda ação também deixa uma linha em SimulationRun (startedBy).
 */
export async function auditSimulation(actor: Extract<SimulationActor, { ok: true }>, action: AuditAction, details: Record<string, unknown>, targetId?: string | null) {
  if (actor.auth) await audit(actor.auth, { action, targetType: 'simulation', targetId: targetId ?? null, details })
  else console.log(`[simulation] ${action} por token ${JSON.stringify(details).slice(0, 500)}`)
}
