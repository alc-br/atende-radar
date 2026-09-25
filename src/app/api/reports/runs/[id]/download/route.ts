import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard, badRequest, notFound } from '@/lib/api-auth'
import { toCsv, toHtml } from '@/lib/reports/render'
import type { ReportContent } from '@/lib/reports/build'

// Baixa uma execução de relatório (CSV para Excel ou HTML imprimível/PDF). Só da própria empresa.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('reports.view')
  if (!g.ok) return g.res
  const { id } = await params
  const format = new URL(request.url).searchParams.get('format') || 'csv'
  if (format !== 'csv' && format !== 'html') return badRequest('format deve ser csv ou html')

  const run = await db.reportRun.findFirst({ where: { id, organizationId: g.auth.orgId }, select: { contentJson: true, reportType: true, createdAt: true } })
  if (!run?.contentJson) return notFound('Report')
  const content = JSON.parse(run.contentJson) as ReportContent
  const stamp = run.createdAt.toISOString().slice(0, 10)
  const name = `atenderadar-${run.reportType}-${stamp}`

  if (format === 'html') {
    return new NextResponse(toHtml(content), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': `inline; filename="${name}.html"`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" },
    })
  }
  return new NextResponse(toCsv(content), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.csv"`, 'X-Content-Type-Options': 'nosniff' },
  })
}
