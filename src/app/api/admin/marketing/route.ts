import { NextResponse } from 'next/server'
import { readJson } from '@/lib/json-body'
import { operatorGuard } from '@/lib/support-admin'
import { audit } from '@/lib/audit'
import { getInternalRules, internalOrgIds, setInternalRules } from '@/lib/internal'
import { funnelReport, getGadsNames, googleAdsRows, periodFrom, setGadsNames } from '@/lib/marketing-report'

// Admin › Medição (docs/operacao/medicao.md). Só o operador da plataforma.
// GET ?from&to: quem é interno, nomes das conversões do Google Ads, funil por dia × campanha e escolhas no aviso de cookies.
export async function GET(request: Request) {
  const g = await operatorGuard()
  if (!g.ok) return g.res
  const period = periodFrom(new URL(request.url).searchParams)
  if (!period) return NextResponse.json({ error: 'Período inválido (AAAA-MM-DD, até 1 ano)' }, { status: 400 })
  try {
    const internal = await getInternalRules()
    const [names, funnel, gads, ids] = await Promise.all([getGadsNames(), funnelReport(period.from, period.to), googleAdsRows(period.from, period.to), internalOrgIds(internal)])
    return NextResponse.json({ internal, internalOrgCount: ids.size, gadsNames: names, gadsRowCount: gads.length, ...funnel, from: period.from.toISOString(), to: period.to.toISOString() })
  } catch (error) {
    console.error('Admin marketing error:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Não foi possível carregar a medição' }, { status: 500 })
  }
}

/** { internal?: { emails, domains }, gadsNames?: { activation, purchase } } */
export async function PUT(request: Request) {
  const g = await operatorGuard()
  if (!g.ok) return g.res
  const j = await readJson<{ internal?: { emails?: unknown; domains?: unknown }; gadsNames?: { activation?: unknown; purchase?: unknown } }>(request)
  if (!j.ok) return j.res
  const out: Record<string, unknown> = {}
  if (j.body.internal && typeof j.body.internal === 'object') {
    const internal = await setInternalRules(j.body.internal)
    out.internal = internal
    // no log fica só a contagem: a lista tem e-mails
    await audit(g.auth, { action: 'marketing.internal_updated', targetType: 'platform_setting', targetId: 'marketing.internal', details: { emails: internal.emails.length, domains: internal.domains.length } })
  }
  if (j.body.gadsNames && typeof j.body.gadsNames === 'object') {
    out.gadsNames = await setGadsNames(j.body.gadsNames)
    await audit(g.auth, { action: 'marketing.gads_names_updated', targetType: 'platform_setting', targetId: 'marketing.gads_names', details: out.gadsNames as Record<string, string> })
  }
  if (!Object.keys(out).length) return NextResponse.json({ error: 'Nada para salvar' }, { status: 400 })
  return NextResponse.json(out)
}
