import { request, type APIRequestContext } from '@playwright/test'

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
