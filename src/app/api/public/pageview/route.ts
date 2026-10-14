import { NextResponse } from 'next/server'
import { readJson } from '@/lib/json-body'
import { allow, clientIp } from '@/lib/rate-limit'
import { countPageView, PAGEVIEW_PAGES, type PageViewPage } from '@/lib/product-events'

// I7 · Visita à página de vendas: soma 1 no contador do dia. Sem cookie, sem IP guardado, sem identificador:
// o IP só serve, em memória, para o limite de chamadas. Chamada do próprio domínio (CSP connect-src 'self').
// Acima do limite responde 204 sem contar: quem recarrega em loop não infla o número, e o navegador não mostra erro.
const noContent = () => new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request) {
  const limit = Number(process.env.PAGEVIEW_RATE_LIMIT_PER_MIN) || 60
  if (!allow(`pageview:${clientIp(request)}`, limit, 60_000)) return noContent()
  const j = await readJson<{ page?: unknown }>(request)
  if (!j.ok) return j.res
  const page = j.body.page
  if (typeof page !== 'string' || !(PAGEVIEW_PAGES as readonly string[]).includes(page)) {
    return NextResponse.json({ error: 'Página inválida' }, { status: 400 })
  }
  await countPageView(page as PageViewPage)
  return noContent()
}
