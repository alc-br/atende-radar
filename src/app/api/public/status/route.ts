import { NextResponse } from 'next/server'
import { healthReport } from '@/lib/health'

export const dynamic = 'force-dynamic'

// Situação do serviço para monitores externos (uptime). Mesma verificação da página /status, sem detalhe técnico.
// 503 só quando o painel está fora (banco sem resposta); análise atrasada continua 200 com status "degraded".
export async function GET() {
  const { status, components } = await healthReport()
  return NextResponse.json({ status, components }, { status: status === 'down' ? 503 : 200, headers: { 'Cache-Control': 'no-store' } })
}
