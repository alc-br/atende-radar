// Domínios separados em produção: o site (página de vendas) fica no domínio principal e o app (entrar, cadastro,
// painel) no subdomínio "app". Os endereços entram no build (NEXT_PUBLIC_*). Sem eles — desenvolvimento, testes —
// tudo roda num domínio só, como antes.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
export const splitHosts = !!(SITE_URL && APP_URL)
export const siteHost = splitHosts ? new URL(SITE_URL).host : ''
export const appHost = splitHosts ? new URL(APP_URL).host : ''

/** No navegador: esta página está aberta no domínio do app? */
export function onAppHost() {
  return splitHosts && typeof window !== 'undefined' && window.location.host === appHost
}

/** Endereço de uma página do app (absoluto quando os domínios são separados). */
export function appLink(path: string) {
  return splitHosts ? APP_URL + path : path
}

/** Rota da página de vendas renderizada no servidor; no domínio do site ela é servida em "/" (src/proxy.ts). */
export const SITE_HOME = '/inicio'

/** Páginas que só existem no site (conteúdos, páginas legais e status do serviço); no app elas levam ao site. */
export function isSiteOnlyPage(pathname: string) {
  return (
    pathname === '/conteudos' ||
    pathname.startsWith('/conteudos/') ||
    pathname === '/privacidade' ||
    pathname === '/termos' ||
    pathname === '/status'
  )
}

/** O que o domínio do site serve; todo o resto é do app. */
export function isSitePath(pathname: string) {
  return (
    pathname === '/' ||
    isSiteOnlyPage(pathname) ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/brand/') ||
    pathname.startsWith('/api/public/') ||
    /\.[a-z0-9]+$/i.test(pathname) // arquivos estáticos (favicon, robots.txt, imagens)
  )
}
