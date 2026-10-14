import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard, badRequest } from '@/lib/api-auth'
import { SCHEDULE_RE, isValidRecipient } from '@/lib/reports/schedule'
import { readJson } from '@/lib/json-body'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const { type } = await params
    const g = await guard('reports.configure')
    if (!g.ok) return g.res
    const org = { id: g.auth.orgId }

    const existing = await db.reportDefinition.findFirst({
      where: { organizationId: org.id, reportType: type },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Report definition not found' }, { status: 404 })
    }

    const j = await readJson(request, { optional: true })
    if (!j.ok) return j.res
    const body = j.body
    const { schedule, recipients } = (body ?? {}) as { schedule?: string | null; recipients?: unknown[] }

    const data: Record<string, unknown> = {}
    if (schedule !== undefined) {
      // horário HH:MM (fuso da empresa) ou vazio para não enviar automaticamente
      if (schedule !== null && (typeof schedule !== 'string' || (schedule.trim() !== '' && !SCHEDULE_RE.test(schedule.trim())))) {
        return badRequest('Agendamento deve ser um horário no formato HH:MM (ex.: 18:00) ou vazio')
      }
      data.schedule = schedule?.trim() || null
    }
    if (recipients !== undefined) {
      if (!Array.isArray(recipients) || recipients.length > 20) return badRequest('Informe até 20 destinatários')
      const list = [...new Set(recipients.map((r) => String(r).trim().toLowerCase()).filter(Boolean))]
      const invalid = list.find((r) => !isValidRecipient(r))
      if (invalid) return badRequest(`E-mail inválido: ${invalid.slice(0, 80)}`)
      data.recipients = JSON.stringify(list)
    }

    const updated = await db.reportDefinition.update({
      where: { id: existing.id },
      data,
    })

    return NextResponse.json({ success: true, definition: updated })
  } catch (error) {
    console.error('Report definition PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update report definition' }, { status: 500 })
  }
}
