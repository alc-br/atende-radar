import { NextResponse } from 'next/server'
import { gatewayGuard } from '@/lib/gateway-auth'
import { ingestEvent } from '@/lib/ingest'

// Entrada de eventos do serviço do WhatsApp. Autenticada por GATEWAY_SECRET (não por sessão de usuário).
export async function POST(request: Request) {
  const denied = gatewayGuard(request)
  if (denied) return denied
  const body = await request.json().catch(() => null)
  const result = await ingestEvent(body)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
