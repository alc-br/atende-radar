import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard, badRequest, notFound } from '@/lib/api-auth'
import { audit } from '@/lib/audit'
import { enforceExportQuota } from '@/lib/quotas'
import { reportFileName, toCsv, toHtml, toJson } from '@/lib/reports/render'
import { toXlsx } from '@/lib/reports/xlsx'
import { toPdf } from '@/lib/reports/pdf'
import type { ReportContent } from '@/lib/reports/build'

const FORMATS = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  json: 'application/json; charset=utf-8',
  html: 'text/html; charset=utf-8',
} as const
type Format = keyof typeof FORMATS

// Baixa uma execução de relatório: CSV (Excel), XLSX (planilha), PDF executivo, JSON (integração) ou HTML imprimível.
// Só da própria empresa. Arquivos (CSV/XLSX/PDF/JSON) contam na cota de exportações do plano; abrir o HTML é leitura
// do relatório e não conta.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('reports.view')
  if (!g.ok) return g.res
  const { id } = await params
  const format = (new URL(request.url).searchParams.get('format') || 'csv') as Format
  if (!Object.hasOwn(FORMATS, format)) return badRequest('format deve ser csv, xlsx, pdf, json ou html')

  const run = await db.reportRun.findFirst({ where: { id, organizationId: g.auth.orgId }, select: { contentJson: true, reportType: true, createdAt: true } })
  if (!run?.contentJson) return notFound('Report')
  const content = JSON.parse(run.contentJson) as ReportContent
  const name = reportFileName(run.reportType, run.createdAt)

  if (format === 'html') {
    return new NextResponse(toHtml(content), {
      headers: { 'Content-Type': FORMATS.html, 'Content-Disposition': `inline; filename="${name}.html"`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" },
    })
  }
  const overQuota = await enforceExportQuota(g.auth.orgId)
  if (overQuota) return overQuota

  let body: string | Uint8Array
  try {
    body = format === 'csv' ? toCsv(content) : format === 'json' ? toJson(content) : format === 'xlsx' ? new Uint8Array(await toXlsx(content)) : await toPdf(content)
  } catch (e) {
    console.error('Report export error:', e)
    return NextResponse.json({ error: 'Não foi possível montar o arquivo. Tente novamente.' }, { status: 500 })
  }
  // só conta na cota o que de fato foi entregue
  await audit(g.auth, { action: 'report.exported', targetType: 'report_run', targetId: id, details: { format, reportType: run.reportType } })
  return new NextResponse(body as BodyInit, {
    headers: {
      'Content-Type': FORMATS[format],
      'Content-Disposition': `attachment; filename="${name}.${format}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    },
  })
}
