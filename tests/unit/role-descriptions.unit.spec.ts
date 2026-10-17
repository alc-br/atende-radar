import { test, expect } from '@playwright/test'
import { ROLES, ROLE_DESCRIPTIONS, can } from '../../src/lib/permissions'

// "Adicionar membro" explica o que cada função acessa: o texto não pode prometer o que a tabela de permissões nega.
test('toda função tem descrição', () => {
  for (const role of ROLES) expect(ROLE_DESCRIPTIONS[role].length).toBeGreaterThan(20)
})

test('descrições batem com a tabela de permissões', () => {
  expect(can('admin', 'billing.manage') && can('admin', 'members.manage') && can('admin', 'connections.manage')).toBe(true)
  for (const role of ROLES.filter((r) => r !== 'admin')) {
    expect(can(role, 'billing.manage') || can(role, 'members.manage') || can(role, 'connections.manage')).toBe(false)
  }
  expect(can('gestor', 'alert_rules.manage') && can('gestor', 'audit.view') && can('gestor', 'conversations.view')).toBe(true)
  expect(can('supervisor', 'settings.manage')).toBe(false)
  expect(can('supervisor', 'recovery.manage') && can('supervisor', 'reports.view') && can('supervisor', 'agents.view')).toBe(true)
  expect(can('analista', 'conversations.view')).toBe(false)
  expect(can('analista', 'reports.generate') && can('analista', 'agents.view')).toBe(true)
  expect(can('member', 'alerts.manage') || can('member', 'reports.view') || can('member', 'conversations.view')).toBe(false)
  expect(can('atendente', 'conversations.view') && can('atendente', 'alerts.manage') && can('atendente', 'recovery.manage')).toBe(true)
  expect(can('atendente', 'reports.view') || can('atendente', 'settings.manage')).toBe(false)
  expect(can('viewer', 'reports.view')).toBe(true)
  expect(can('viewer', 'alerts.manage') || can('viewer', 'reports.generate')).toBe(false)
})
