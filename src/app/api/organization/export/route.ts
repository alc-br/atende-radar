import { NextResponse } from 'next/server'
import { guard } from '@/lib/api-auth'
import { audit } from '@/lib/audit'
import { allow } from '@/lib/rate-limit'
import { organizationExport } from '@/lib/org-export'

// Exporta TODOS os dados da empresa em JSON (LGPD, portabilidade). Só o administrador. Liberado também com a empresa
// bloqueada (teste vencido, plano encerrado, pagamento em atraso): é direito do cliente levar os dados dele.
export async function GET() {
  const g = await guard('organization.export', { allowLocked: true })
  if (!g.ok) return g.res
  if (!allow(`org-export:${g.auth.orgId}`, Number(process.env.ORG_EXPORT_PER_HOUR) || 6, 3_600_000)) {
    return NextResponse.json({ error: 'Muitas exportações em sequência. Tente novamente daqui a uma hora.', code: 'too_many_attempts' }, { status: 429 })
  }
  await audit(g.auth, { action: 'organization.exported', targetType: 'organization', targetId: g.auth.orgId })
  const parts = organizationExport(g.auth.orgId)
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await parts.next()
        if (done) controller.close()
        else controller.enqueue(enc.encode(value))
      } catch (e) {
        console.error('[export] falha ao exportar a empresa', g.auth.orgId, e instanceof Error ? e.message : e)
        controller.error(e)
      }
    },
    async cancel() {
      await parts.return(undefined)
    },
  })
  const stamp = new Date().toISOString().slice(0, 10)
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="atenderadar-dados-da-empresa-${stamp}.json"`,
      'Cache-Control': 'no-store',
    },
  })
}
