import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// Descoberta automática das rotas de src/app/api (usada por api-auth.spec.ts e rbac.spec.ts):
// toda rota nova entra nos testes sem ninguém lembrar de listá-la.
const API_DIR = join(process.cwd(), 'src', 'app', 'api')
export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

/**
 * Rotas PÚBLICAS de propósito (sem sessão podem responder 200/400/429...). Não são chamadas no teste de sessão:
 * só se confere que continuam existindo (lista viva). Rota nova pública = acrescentar aqui, com o motivo.
 */
export const PUBLIC_ROUTES: Record<string, string> = {
  '/api/auth/[...nextauth]': 'login do NextAuth (csrf, providers, callback, session) — testado em auth.spec.ts',
  '/api/auth/signup': 'cadastro público (limite por IP)',
  '/api/auth/forgot': 'pedido de nova senha (limite por IP, não revela se o e-mail existe)',
  '/api/auth/reset': 'troca de senha com token do e-mail (limite por IP)',
  '/api/auth/accept-invite': 'aceite de convite com token do e-mail (limite por IP)',
  '/api/auth/verify-email': 'confirmação de e-mail com token',
  '/api/public/plans': 'catálogo de planos da página de vendas',
  '/api/public/pageview': 'contador diário de visitas à página de vendas (sem cookie nem IP gravado, limite por IP) — product-events.spec.ts',
  '/api/public/status': 'situação do serviço para monitores externos (só ok/atraso/fora, sem detalhe técnico)',
  // link "parar de receber" dos alertas por e-mail: quem abre o e-mail não está logado; o token HMAC identifica o membro
  '/api/public/unsubscribe': 'desliga os alertas por e-mail com o token assinado do link (só POST; token ruim = 400) — alert-email.spec.ts',
}

/**
 * Fora do proxy de sessão, mas com autenticação própria: sem a credencial devem recusar como as demais
 * (por isso CONTINUAM no teste genérico de sessão). Listadas para documentar a exceção do src/proxy.ts.
 */
export const OWN_AUTH_ROUTES: Record<string, string> = {
  '/api/billing/webhook': 'aviso do Pagar.me: autenticação básica (PAGARME_WEBHOOK_USER/PASS)',
  '/api/gateway/events': 'serviço do WhatsApp: Bearer GATEWAY_SECRET',
  '/api/gateway/tick': 'serviço do WhatsApp / agendador: Bearer GATEWAY_SECRET',
  '/api/gateway/connections': 'serviço do WhatsApp: Bearer GATEWAY_SECRET',
}

export type DiscoveredRoute = {
  /** caminho com os segmentos dinâmicos como estão na pasta, ex.: /api/alerts/[id]/resolve */
  pattern: string
  /** caminho chamável, com cada segmento dinâmico trocado por "x" */
  path: string
  /** métodos que a rota exporta de fato */
  exported: string[]
  /** exportados + GET e POST (método não exportado deve dar 401 ou 405, nunca 200/500) */
  methods: string[]
}

export function discoverRoutes(): DiscoveredRoute[] {
  if (!existsSync(API_DIR)) throw new Error(`pasta de rotas não encontrada: ${API_DIR} (rode a partir da raiz do projeto)`)
  const out: DiscoveredRoute[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (name === 'route.ts') {
        const segs = relative(API_DIR, dir).split(sep).filter(Boolean)
        const pattern = '/' + ['api', ...segs].join('/')
        // segmento dinâmico ([id], [...slug], [[...slug]]) vira um id fictício
        const path = '/' + ['api', ...segs.map((s) => (s.startsWith('[') ? 'x' : s))].join('/')
        const src = readFileSync(full, 'utf8')
        const exported = METHODS.filter(
          (m) => new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b`).test(src) || new RegExp(`export\\s*\\{[^}]*\\bas\\s+${m}\\b`).test(src)
        )
        out.push({ pattern, path, exported: [...exported], methods: [...new Set(['GET', 'POST', ...exported])] })
      }
    }
  }
  walk(API_DIR)
  return out.sort((a, b) => a.pattern.localeCompare(b.pattern))
}

/** O caminho chamado (ex.: /api/reports/daily) corresponde ao padrão da pasta (ex.: /api/reports/[type])? */
export function pathMatchesPattern(path: string, pattern: string): boolean {
  const p = path.split('/')
  const q = pattern.split('/')
  if (q.some((s) => s.startsWith('[...') || s.startsWith('[[...'))) {
    const fixed = q.findIndex((s) => s.startsWith('[...') || s.startsWith('[[...'))
    return p.length >= fixed && q.slice(0, fixed).every((s, i) => s.startsWith('[') || s === p[i])
  }
  return p.length === q.length && q.every((s, i) => s.startsWith('[') || s === p[i])
}

/** Padrão mais específico (menos segmentos dinâmicos) que atende o caminho, ou null. */
export function patternForPath(path: string, routes: DiscoveredRoute[]): DiscoveredRoute | null {
  const hits = routes.filter((r) => pathMatchesPattern(path, r.pattern))
  hits.sort((a, b) => (a.pattern.match(/\[/g)?.length ?? 0) - (b.pattern.match(/\[/g)?.length ?? 0))
  return hits[0] ?? null
}
