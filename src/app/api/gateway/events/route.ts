import { NextResponse } from 'next/server'
import { gatewayGuard } from '@/lib/gateway-auth'
import { ingestEvent } from '@/lib/ingest'
import { readJson } from '@/lib/json-body'

// Entrada de eventos do serviço do WhatsApp. Autenticada por GATEWAY_SECRET (não por sessão de usuário).
export async function POST(request: Request) {
  const denied = gatewayGuard(request)
  if (denied) return denied
  const j = await readJson(request, { optional: true })
  if (!j.ok) return j.res
  const body = j.body
  const result = await ingestEvent(body)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
