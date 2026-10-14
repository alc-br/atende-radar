import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard, badRequest, notFound } from '@/lib/api-auth'
import { audit } from '@/lib/audit'
import { allow } from '@/lib/rate-limit'
import { isValidRecipient, parseList, sendReportRun } from '@/lib/reports/schedule'

// Reenvia por e-mail uma execução concluída (resumo + PDF executivo em anexo) aos destinatários dela; se ela não
// tinha destinatários (gerada na hora), usa os destinatários configurados do relatório. Não conta na cota de
// exportações (é entrega, como o envio agendado). Limite por empresa para não virar disparo em massa.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('reports.generate')
  if (!g.ok) return g.res
  const { id } = await params
  const run = await db.reportRun.findFirst({ where: { id, organizationId: g.auth.orgId } })
  if (!run) return notFound('Report')
  if (run.status !== 'completed' || !run.contentJson) return NextResponse.json({ error: 'Só dá para reenviar um relatório concluído. Use "Tentar novamente".' }, { status: 409 })

  let recipients = parseList<string>(run.recipientEmails, [])
  if (!recipients.length) {
    const def = await db.reportDefinition.findFirst({ where: { organizationId: g.auth.orgId, reportType: run.reportType }, select: { recipients: true } })
    recipients = parseList<string>(def?.recipients, [])
  }
  recipients = recipients.filter((r) => typeof r === 'string' && isValidRecipient(r))
  if (!recipients.length) return badRequest('Este relatório não tem destinatários. Cadastre-os em Configurar.')

  if (!allow(`report-send:${g.auth.orgId}`, Number(process.env.REPORT_RESEND_PER_HOUR) || 20, 3_600_000)) {
    return NextResponse.json({ error: 'Muitos reenvios em pouco tempo. Tente de novo em uma hora.' }, { status: 429 })
  }

  try {
    const result = await sendReportRun(run.id, recipients)
    await audit(g.auth, { action: 'report.sent', targetType: 'report_run', targetId: run.id, details: { reportType: run.reportType, recipients: recipients.length, emailStatus: result.emailStatus } })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('Report send error:', error)
    return NextResponse.json({ error: 'Não foi possível reenviar o relatório.' }, { status: 500 })
  }
}
