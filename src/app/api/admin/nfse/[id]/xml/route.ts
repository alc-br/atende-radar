import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { operatorGuard } from '@/lib/support-admin'

type Params = { params: Promise<{ id: string }> }

/** Baixa o XML da nota: ?tipo=nfse (a nota autorizada), dps (a declaração assinada enviada) ou evento (cancelamento). */
export async function GET(request: Request, { params }: Params) {
  const g = await operatorGuard()
  if (!g.ok) return g.res
  const { id } = await params
  const tipo = new URL(request.url).searchParams.get('tipo') || 'nfse'
  if (!['nfse', 'dps', 'evento'].includes(tipo)) return NextResponse.json({ error: 'tipo deve ser nfse, dps ou evento' }, { status: 400 })
  const doc = await db.nfseDocument.findUnique({ where: { id }, select: { chave: true, dpsId: true, nfseXml: true, dpsXml: true, eventoXml: true } })
  const xml = doc ? (tipo === 'nfse' ? doc.nfseXml : tipo === 'dps' ? doc.dpsXml : doc.eventoXml) : null
  if (!doc || !xml) return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })
  const base = tipo === 'dps' ? `${doc.dpsId ?? id}-dps` : tipo === 'evento' ? `${doc.chave ?? id}-cancelamento` : doc.chave ?? id
  return new NextResponse(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': `attachment; filename="${base}.xml"`, 'Cache-Control': 'no-store' },
  })
}
