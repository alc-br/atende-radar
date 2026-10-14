import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sniffImageType } from '@/lib/support'
import { operatorGuard } from '@/lib/support-admin'

type Params = { params: Promise<{ id: string }> }

/**
 * Captura de tela do chamado. Só o operador, sempre com sessão (a imagem pode mostrar dados do cliente): nunca vai
 * para /public, não fica em cache compartilhado e o navegador não "adivinha" outro tipo de arquivo.
 */
export async function GET(_request: Request, { params }: Params) {
  const g = await operatorGuard()
  if (!g.ok) return g.res
  const { id } = await params
  const ticket = await db.supportTicket.findUnique({ where: { id }, select: { screenshot: true, screenshotType: true } })
  if (!ticket?.screenshot || !ticket.screenshotType) return NextResponse.json({ error: 'Captura não encontrada' }, { status: 404 })
  const bytes = new Uint8Array(ticket.screenshot)
  // o tipo servido é o da assinatura dos bytes (conferido de novo), não um texto vindo do envio
  const type = sniffImageType(bytes)
  if (!type) return NextResponse.json({ error: 'Captura não encontrada' }, { status: 404 })
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `inline; filename="chamado-${id}.${type.split('/')[1]}"`,
    },
  })
}
