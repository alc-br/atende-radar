import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { APP_URL, SITE_HOME, SITE_URL, appHost, isSiteOnlyPage, isSitePath, siteHost, splitHosts } from './lib/hosts'

// Toda rota de API exige sessão válida. Ficam públicos: /api/auth/* (login/cadastro/recuperação) e /api/public/* (catálogo da página de vendas) e /api/gateway/* (serviço do WhatsApp, autenticado por segredo próprio na rota) e /api/billing/webhook (aviso do Pagar.me, autenticação básica própria).
function apiNeedsSession(pathname: string) {
  if (pathname !== '/api' && !pathname.startsWith('/api/')) return false
  return !/^\/api\/(auth|public|gateway)(\/|$)/.test(pathname) && pathname !== '/api/billing/webhook'
}

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

export async function proxy(req: NextRequest) {
  const moved = routeByHost(req)
  if (moved) return moved

  if (apiNeedsSession(req.nextUrl.pathname)) {
    const token = await getToken({ req })
    if (!token?.sub) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }
    // Sessão de demonstração (senha pública): só leitura. O guia de telas (tour) continua funcionando.
    const method = req.method.toUpperCase()
    const readOnlyMethod = method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
    if ((token as { demo?: boolean }).demo && !readOnlyMethod && !req.nextUrl.pathname.startsWith('/api/tours')) {
      return NextResponse.json({ error: 'A conta de demonstração é somente leitura. Crie a sua conta grátis para testar de verdade.' }, { status: 403 })
    }
  }

  const res = NextResponse.next()
  // O app não deve aparecer no Google; quem aparece é o site
  if (splitHosts && (req.headers.get('host') || '').toLowerCase() === appHost) res.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
