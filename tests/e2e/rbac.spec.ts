import { test, expect, type APIRequestContext } from '@playwright/test'
import { loginAs } from './helpers'

// B4 · Papéis e permissões. A matriz abaixo é a especificação (spec §9): é escrita à mão, de propósito,
// e NÃO importada do código de produção — senão o teste apenas repetiria a implementação.
const ALL = ['admin', 'gestor', 'supervisor', 'analista', 'member', 'atendente', 'viewer'] as const
type Role = (typeof ALL)[number]

const OPERACAO: Role[] = ['admin', 'gestor', 'supervisor', 'atendente'] // atua em alertas / recuperação
const GESTAO: Role[] = ['admin', 'gestor', 'supervisor'] // enxerga estrutura da operação
const CONFIG: Role[] = ['admin', 'gestor'] // altera configuração operacional
const ADMIN: Role[] = ['admin']
const ANALISE: Role[] = ['admin', 'gestor', 'supervisor', 'analista'] // gera relatórios, vê desempenho
const LEITURA_REL: Role[] = ['admin', 'gestor', 'supervisor', 'analista', 'viewer']

type Row = [method: string, path: string, allowed: readonly Role[]]

const MATRIX: Row[] = [
  ['GET', '/api/dashboard', ALL],
  ['GET', '/api/notifications', ALL],
  ['PATCH', '/api/notifications/read-all', ALL],
  ['PATCH', '/api/notifications/x', ALL],
  ['GET', '/api/tours', ALL],
  ['GET', '/api/me', ALL],

  ['GET', '/api/alerts', ALL],
  ['PUT', '/api/alerts/x', OPERACAO],
  ['POST', '/api/alerts/x/acknowledge', OPERACAO],
  ['POST', '/api/alerts/x/resolve', OPERACAO],
  ['POST', '/api/alerts/x/dismiss', OPERACAO],
  ['POST', '/api/alerts/x/false-positive', OPERACAO],
  ['GET', '/api/alert-rules', GESTAO],
  ['POST', '/api/alert-rules', CONFIG],
  ['PUT', '/api/alert-rules/x', CONFIG],

  ['GET', '/api/conversations', OPERACAO],
  ['GET', '/api/conversations/x', OPERACAO],
  ['PATCH', '/api/conversations/x', GESTAO],
  ['POST', '/api/conversations/x/outcome', GESTAO],
  ['POST', '/api/conversations/x/feedback', GESTAO],
  ['PATCH', '/api/findings/x', GESTAO],
  ['PATCH', '/api/open-questions/x', GESTAO],
  ['PATCH', '/api/promises/x', GESTAO],

  ['GET', '/api/recovery', OPERACAO],
  ['POST', '/api/recovery', OPERACAO],
  ['PATCH', '/api/recovery/x', OPERACAO],

  ['GET', '/api/reports', LEITURA_REL],
  ['POST', '/api/reports/generate', ANALISE],
  ['PATCH', '/api/reports/daily', CONFIG],
  ['GET', '/api/reports/export', LEITURA_REL],
  ['GET', '/api/reports/runs/x/download', LEITURA_REL],

  ['GET', '/api/team', ANALISE],
  ['GET', '/api/team/x', ANALISE],
  ['POST', '/api/team', CONFIG],
  ['GET', '/api/teams', GESTAO],
  ['POST', '/api/teams', CONFIG],
  ['PATCH', '/api/teams/x', CONFIG],
  ['DELETE', '/api/teams/x', CONFIG],

  ['GET', '/api/members', GESTAO],
  ['POST', '/api/members', ADMIN],
  ['PATCH', '/api/members/x', ADMIN],
  ['DELETE', '/api/members/x', ADMIN],

  ['GET', '/api/connections', GESTAO],
  ['GET', '/api/connections/x/health', GESTAO],
  ['POST', '/api/connections', ADMIN],
  ['PATCH', '/api/connections/x', ADMIN],
  ['DELETE', '/api/connections/x', ADMIN],

  ['POST', '/api/conversations/x/privacy', CONFIG],
  ['GET', '/api/settings', CONFIG],
  ['PATCH', '/api/settings', CONFIG],
  ['GET', '/api/audit', CONFIG],
  ['GET', '/api/subscription', ADMIN],
  ['PATCH', '/api/subscription', ADMIN],
  ['GET', '/api/plans', ADMIN],
  ['POST', '/api/subscription/request', ADMIN],
  ['PATCH', '/api/admin/organizations/x/subscription', []], // só o operador da plataforma
  ['GET', '/api/setup-status', ALL],

  // Painel da plataforma: nenhum papel de cliente entra (só o operador da plataforma — ver session.spec.ts)
  ['GET', '/api/admin', []],
]

const clients = new Map<Role, APIRequestContext>()

test.beforeAll(async () => {
  for (const role of ALL) clients.set(role, await loginAs(`${role}.a@test.local`))
})
test.afterAll(async () => {
  for (const c of clients.values()) await c.dispose()
})

for (const [method, path, allowed] of MATRIX) {
  for (const role of ALL) {
    const permitido = allowed.includes(role)
    test(`${role} ${permitido ? 'PODE' : 'NÃO pode'} ${method} ${path}`, async () => {
      const res = await clients.get(role)!.fetch(path, { method, data: method === 'GET' ? undefined : {} })
      if (permitido) {
        expect(res.status(), 'autenticado e autorizado: não pode ser 401/403').not.toBe(403)
        expect(res.status()).not.toBe(401)
      } else {
        expect(res.status()).toBe(403)
      }
    })
  }
}
