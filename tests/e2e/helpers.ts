import { request, type APIRequestContext } from '@playwright/test'
import { lastTokenFor } from './db'

export const BASE_URL = 'http://127.0.0.1:3100'

/** Rotas de API que exigem sessão. Método + caminho de um recurso real ou plausível. */
export const PROTECTED_ROUTES: Array<[method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string]> = [
  ['GET', '/api/dashboard'],
  ['GET', '/api/conversations'],
  ['GET', '/api/conversations/x'],
  ['PATCH', '/api/conversations/x/outcome'],
  ['POST', '/api/conversations/x/feedback'],
  ['GET', '/api/alerts'],
  ['GET', '/api/alerts/x'],
  ['POST', '/api/alerts/x/acknowledge'],
  ['POST', '/api/alerts/x/resolve'],
  ['POST', '/api/alerts/x/dismiss'],
  ['POST', '/api/alerts/x/false-positive'],
  ['GET', '/api/alert-rules'],
  ['POST', '/api/alert-rules'],
  ['PATCH', '/api/alert-rules/x'],
  ['DELETE', '/api/alert-rules/x'],
  ['GET', '/api/connections'],
  ['POST', '/api/connections'],
  ['PATCH', '/api/connections/x'],
  ['DELETE', '/api/connections/x'],
  ['GET', '/api/connections/x/health'],
  ['PATCH', '/api/findings/x'],
  ['GET', '/api/members'],
  ['POST', '/api/members'],
  ['PATCH', '/api/members/x'],
  ['DELETE', '/api/members/x'],
  ['GET', '/api/notifications'],
  ['PATCH', '/api/notifications/x'],
  ['POST', '/api/notifications/read-all'],
  ['PATCH', '/api/open-questions/x'],
  ['GET', '/api/plans'],
  ['PATCH', '/api/promises/x'],
  ['GET', '/api/recovery'],
  ['PATCH', '/api/recovery/x'],
  ['GET', '/api/reports'],
  ['POST', '/api/reports/generate'],
  ['GET', '/api/reports/daily'],
  ['GET', '/api/settings'],
  ['PATCH', '/api/settings'],
  ['GET', '/api/subscription'],
  ['PATCH', '/api/subscription'],
  ['GET', '/api/team'],
  ['GET', '/api/team/x'],
  ['GET', '/api/teams'],
  ['POST', '/api/teams'],
  ['PATCH', '/api/teams/x'],
  ['DELETE', '/api/teams/x'],
  ['GET', '/api/tours'],
  ['PATCH', '/api/tours'],
  ['GET', '/api/admin'],
  ['GET', '/api/me'],
]

/** Faz login pelo fluxo real do NextAuth (csrf + callback) e devolve um contexto com o cookie de sessão. */
export async function loginAs(email: string, password = 'demo123'): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL: BASE_URL })
  const csrf = await (await ctx.get('/api/auth/csrf')).json()
  await ctx.post('/api/auth/callback/credentials', {
    form: { csrfToken: csrf.csrfToken, email, password, json: 'true' },
  })
  return ctx
}

export async function anonymous(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: BASE_URL })
}

export const STRONG = 'Senha-Forte-2026x'
export const uid = () => Math.random().toString(36).slice(2, 8)

/** Convida um membro pelo fluxo real (POST /api/members) e ele aceita o convite definindo a própria senha. */
export async function createUser(
  admin: APIRequestContext,
  data: { name?: string; email: string; role: string },
  password = STRONG
) {
  const res = await admin.post('/api/members', { data: { name: data.name ?? data.email.split('@')[0], ...data } })
  if (res.status() !== 201) throw new Error(`convite falhou: ${res.status()} ${await res.text()}`)
  const { member } = await res.json()
  const anon = await request.newContext({ baseURL: BASE_URL })
  const accept = await anon.post('/api/auth/accept-invite', { data: { token: await lastTokenFor(data.email), password } })
  if (accept.status() !== 200) throw new Error(`aceite falhou: ${accept.status()} ${await accept.text()}`)
  await anon.dispose()
  return member as { id: string; email: string; role: string }
}

/** Cria uma organização nova pelo cadastro público e devolve o contexto já logado como admin dela. */
export async function signupOrg(overrides: Partial<{ name: string; email: string; password: string; organizationName: string }> = {}) {
  const email = overrides.email ?? `dono.${uid()}@cliente.test`
  const password = overrides.password ?? STRONG
  const anon = await request.newContext({ baseURL: BASE_URL })
  const res = await anon.post('/api/auth/signup', {
    data: { name: overrides.name ?? 'Dona Teste', email, password, organizationName: overrides.organizationName ?? `Empresa ${uid()}` },
  })
  await anon.dispose()
  return { res, email, password }
}
