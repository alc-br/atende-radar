import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { contentSecurityPolicy, newNonce } from './lib/csp'
import { APP_URL, SITE_HOME, SITE_URL, appHost, isSiteOnlyPage, isSitePath, siteHost, splitHosts } from './lib/hosts'

// Toda rota de API exige sessão válida. Ficam públicos: /api/auth/* (login/cadastro/recuperação) e /api/public/* (catálogo da página de vendas) e /api/gateway/* (serviço do WhatsApp, autenticado por segredo próprio na rota) e /api/billing/webhook (aviso do Pagar.me, autenticação básica própria).
function apiNeedsSession(pathname: string) {
  if (pathname !== '/api' && !pathname.startsWith('/api/')) return false
  return !/^\/api\/(auth|public|gateway)(\/|$)/.test(pathname) && pathname !== '/api/billing/webhook'
}

// Ambiente de simulação (S1): o agente de IA chama /api/admin/simulation/* com Bearer SIMULATION_SECRET, sem sessão.
// Só a presença do cabeçalho passa daqui; a rota confere o segredo (e responde 404 com a simulação desligada).
const simulationToken = (req: NextRequest) =>
  req.nextUrl.pathname.startsWith('/api/admin/simulation/') && /^Bearer\s+\S/.test(req.headers.get('authorization') || '')

// Domínios (só em produção, ver src/lib/hosts.ts): site = página de vendas; app = entrar, cadastro e painel.
function routeByHost(req: NextRequest): NextResponse | null {
  if (!splitHosts) return null
  const host = (req.headers.get('host') || '').toLowerCase()
  const { pathname, search } = req.nextUrl
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) return null // health check e chamadas internas do servidor
  if (host === `www.${siteHost}`) return NextResponse.redirect(SITE_URL + pathname + search, 308)
  // A página de vendas renderizada no servidor mora em /inicio, mas o endereço público é a raiz do site
  if (pathname === SITE_HOME) return NextResponse.redirect(SITE_URL + '/' + search, 308)
  if (host === siteHost) {
    // "/" segue para a página de vendas renderizada no servidor pelo rewrite de next.config.ts
    return isSitePath(pathname) ? null : NextResponse.redirect(APP_URL + pathname + search, 308)
  }
  if (host === appHost) return isSiteOnlyPage(pathname) ? NextResponse.redirect(SITE_URL + pathname + search, 308) : null
  if (!pathname.startsWith('/api/')) {
    // domínio antigo: as páginas vão para o app; as APIs continuam respondendo (aviso do Pagar.me, gateway)
    return NextResponse.redirect(APP_URL + pathname + search, 308)
  }
  return null
}

const dev = process.env.NODE_ENV !== 'production'
const isApi = (pathname: string) => pathname === '/api' || pathname.startsWith('/api/')

// "/login" existe para links antigos, para o NextAuth e para o "Sair": vai direto para a tela de entrar do app
// (redirecionamento sem corpo; a página src/app/login fica como reserva). Repassa ?modo=cadastro|entrar|senha.
function loginRedirect(req: NextRequest): NextResponse | null {
  if (req.nextUrl.pathname !== '/login') return null
  const params = new URLSearchParams(req.nextUrl.search)
  params.delete('demo') // a demonstração pública não existe mais
  if (!params.has('modo')) params.set('modo', 'entrar')
  return new NextResponse(null, { status: 307, headers: { Location: `${splitHosts ? APP_URL : req.nextUrl.origin}/?${params}` } })
}

export async function proxy(req: NextRequest) {
  const moved = routeByHost(req) || loginRedirect(req)
  if (moved) {
    moved.headers.set('Content-Security-Policy', contentSecurityPolicy({ dev }))
    return moved
  }

  if (apiNeedsSession(req.nextUrl.pathname) && !simulationToken(req)) {
    const token = await getToken({ req })
    if (!token?.sub) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }
  }

  // Páginas: nonce novo a cada requisição. O Next lê a CSP do pedido e põe o nonce nos próprios scripts; o layout
  // repassa x-nonce ao next-themes. As APIs recebem a CSP sem nonce de next.config.ts.
  let res: NextResponse
  if (isApi(req.nextUrl.pathname)) res = NextResponse.next()
  else {
    const nonce = newNonce()
    const csp = contentSecurityPolicy({ nonce, dev })
    const headers = new Headers(req.headers)
    headers.set('x-nonce', nonce)
    headers.set('Content-Security-Policy', csp)
    res = NextResponse.next({ request: { headers } })
    res.headers.set('Content-Security-Policy', csp)
  }
  // O app não deve aparecer no Google; quem aparece é o site
  if (splitHosts && (req.headers.get('host') || '').toLowerCase() === appHost) res.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
