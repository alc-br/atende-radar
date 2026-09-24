import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { gatewayGuard } from '@/lib/gateway-auth'

// O gateway pergunta quais conexões devem estar rodando (pausadas/desconectadas por decisão do cliente ficam de fora).
export async function GET(request: Request) {
  const denied = gatewayGuard(request)
  if (denied) return denied
  const connections = await db.whatsAppConnection.findMany({
    where: { disabledAt: null, status: { in: ['pending', 'qr_required', 'connected', 'syncing', 'degraded', 'disconnected'] } },
    select: { id: true, status: true, name: true },
  })
  // 'disconnected' sem disabledAt = caiu sozinha: o gateway tenta reconectar.
  return NextResponse.json({ connections })
}
