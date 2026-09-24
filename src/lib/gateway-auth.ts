import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

/**
 * O serviço do WhatsApp (gateway) fala com o sistema por um segredo compartilhado (GATEWAY_SECRET), não por sessão de usuário.
 * Sem GATEWAY_SECRET configurado a entrada fica DESLIGADA (503) — nunca aberta.
 * Devolve uma resposta de erro se não autorizado, ou null se ok.
 */
export function gatewayGuard(request: Request): NextResponse | null {
  const secret = process.env.GATEWAY_SECRET
  if (!secret) return NextResponse.json({ error: 'Entrada do WhatsApp desligada (GATEWAY_SECRET não configurado)' }, { status: 503 })
  const header = request.headers.get('authorization') || ''
  const given = header.startsWith('Bearer ') ? header.slice(7) : ''
  const a = Buffer.from(given)
  const b = Buffer.from(secret)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  return null
}
