import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard, notFound } from '@/lib/api-auth'
import { audit } from '@/lib/audit'
import { retryReportRun } from '@/lib/reports/schedule'

// "Tentar novamente" do histórico: gera de novo a execução que falhou (mesmo tipo e período) e, se era agendada ou o
// e-mail tinha falhado, envia de novo aos destinatários dela. Execução concluída e entregue não tem o que repetir (409).
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('reports.generate')
  if (!g.ok) return g.res
  const { id } = await params
  const run = await db.reportRun.findFirst({ where: { id, organizationId: g.auth.orgId }, select: { id: true, status: true, emailStatus: true, reportType: true } })
  if (!run) return notFound('Report')
  if (run.status === 'completed' && run.emailStatus !== 'failed') {
    return NextResponse.json({ error: 'Este relatório não falhou. Para mandar de novo, use "Reenviar".' }, { status: 409 })
  }
  try {
    const result = await retryReportRun(run.id)
    await audit(g.auth, { action: 'report.retried', targetType: 'report_run', targetId: run.id, details: { reportType: run.reportType, ...result } })
    if (result.status !== 'completed') return NextResponse.json({ error: 'A nova tentativa também falhou.', ...result }, { status: 502 })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('Report retry error:', error)
    return NextResponse.json({ error: 'Não foi possível tentar de novo.' }, { status: 500 })
  }
}
