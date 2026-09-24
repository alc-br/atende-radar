import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard, notFound } from '@/lib/api-auth'

// QR Code para parear o WhatsApp. Só quem administra as conexões da organização pode ver.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('connections.manage')
  if (!g.ok) return g.res
  const { id } = await params
  const connection = await db.whatsAppConnection.findFirst({
    where: { id, organizationId: g.auth.orgId },
    select: { status: true, qrCode: true, qrUpdatedAt: true },
  })
  if (!connection) return notFound('Connection')
  return NextResponse.json({
    status: connection.status,
    qr: connection.qrCode,
    updatedAt: connection.qrUpdatedAt?.toISOString() ?? null,
  })
}
