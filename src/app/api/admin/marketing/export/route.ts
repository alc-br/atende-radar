import { NextResponse } from 'next/server'
import { operatorGuard } from '@/lib/support-admin'
import { dayKey } from '@/lib/product-events'
import { funnelCsv, funnelReport, googleAdsCsv, googleAdsRows, periodFrom } from '@/lib/marketing-report'

// Admin › Medição: CSV para baixar. ?type=gads (conversões offline do Google Ads, formato da importação por arquivo)
// ou ?type=funnel (funil por dia × campanha). Só o operador; sem e-mail, telefone ou nome nos arquivos.
export async function GET(request: Request) {
  const g = await operatorGuard()
  if (!g.ok) return g.res
  const params = new URL(request.url).searchParams
  const period = periodFrom(params)
  if (!period) return NextResponse.json({ error: 'Período inválido (AAAA-MM-DD, até 1 ano)' }, { status: 400 })
  const type = params.get('type')
  if (type !== 'gads' && type !== 'funnel') return NextResponse.json({ error: "type deve ser 'gads' ou 'funnel'" }, { status: 400 })
  const csv = type === 'gads' ? googleAdsCsv(await googleAdsRows(period.from, period.to)) : funnelCsv((await funnelReport(period.from, period.to)).rows)
  const name = `${type === 'gads' ? 'google-ads-conversoes' : 'funil'}_${dayKey(period.from)}_${dayKey(period.to)}.csv`
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } })
}
