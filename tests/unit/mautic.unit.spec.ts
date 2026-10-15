import { test, expect } from '@playwright/test'
import { contactPayload, memberFields, mergeSystems, splitName, subscriptionState, type MemberSnapshot } from '../../src/lib/mautic'
import { AR_MEMBER_STATUS, AR_PLANS, AR_ROLES, AR_SUBSCRIPTION, MAUTIC_FIELDS, MAUTIC_SEGMENTS } from '../../src/lib/mautic-catalog'
import { ROLES } from '../../src/lib/permissions'
import { parseSender } from '../../src/lib/mailer'

// Contatos no Mautic: o campo sistema_origem é compartilhado com outros sistemas da ALC e nunca pode perder o deles.
test('sistema_origem acrescenta "atenderadar" sem tirar os outros sistemas', () => {
  expect(mergeSystems(undefined)).toEqual(['atenderadar'])
  expect(mergeSystems('')).toEqual(['atenderadar'])
  expect(mergeSystems('alcademy|iabr')).toEqual(['alcademy', 'iabr', 'atenderadar'])
  expect(mergeSystems(['ALC', 'atenderadar'])).toEqual(['ALC', 'atenderadar'])
})

test('nome vira firstname/lastname; contato leva tags e campos e não apaga campos com vazio', () => {
  expect(splitName('Maria da Silva')).toEqual({ firstname: 'Maria', lastname: 'da Silva' })
  expect(splitName('Ana')).toEqual({ firstname: 'Ana' })
  expect(splitName('  ')).toEqual({})
  const p = contactPayload({ email: ' Fulano@Empresa.com ', name: 'Fulano Tal', company: 'Empresa X', tags: ['atenderadar-membro'], fields: { ar_papel: 'admin' } }, 'alcademy')
  expect(p).toEqual({
    email: 'fulano@empresa.com', firstname: 'Fulano', lastname: 'Tal', company: 'Empresa X', ar_papel: 'admin',
    sistema_origem: ['alcademy', 'atenderadar'], tags: ['atenderadar', 'atenderadar-membro'], overwriteWithBlank: false,
  })
})

const now = new Date('2026-10-15T15:00:00Z')
const sub = (status: string, extra: Partial<NonNullable<MemberSnapshot['subscription']>> = {}) => ({ status, trialEnd: null, cancelAtPeriodEnd: false, plan: { code: 'gestao' }, ...extra })

test('situação da assinatura em uma palavra (alimenta os segmentos)', () => {
  expect(subscriptionState(null, now)).toBe('sem_assinatura')
  expect(subscriptionState(sub('trialing', { trialEnd: new Date('2026-10-20T00:00:00Z') }), now)).toBe('teste')
  expect(subscriptionState(sub('trialing', { trialEnd: new Date('2026-10-10T00:00:00Z') }), now)).toBe('teste_vencido')
  expect(subscriptionState(sub('active'), now)).toBe('ativa')
  expect(subscriptionState(sub('active', { cancelAtPeriodEnd: true }), now)).toBe('cancelamento_agendado')
  expect(subscriptionState(sub('past_due'), now)).toBe('inadimplente')
  expect(subscriptionState(sub('canceled'), now)).toBe('cancelada')
})

test('campos ar_* do membro: datas no horário de Brasília, booleano 0/1', () => {
  const f = memberFields({
    role: 'admin', status: 'active', organizationId: 'org_x',
    createdAt: new Date('2026-10-01T12:30:00Z'), lastAccessAt: null, emailVerifiedAt: new Date(),
    subscription: sub('trialing', { trialEnd: new Date('2026-10-20T02:00:00Z') }),
  }, now)
  expect(f).toEqual({
    ar_papel: 'admin', ar_membro: 'ativo', ar_plano: 'gestao', ar_assinatura: 'teste', ar_teste_fim: '2026-10-19',
    ar_cadastro: '2026-10-01 09:30:00', ar_ultimo_acesso: null, ar_email_confirmado: 1, ar_empresa_id: 'org_x',
  })
})

test('catálogo do Mautic cobre todo valor que o sistema grava, e todo segmento é só do AtendeRadar', () => {
  const values = (pairs: [string, string][]) => pairs.map(([v]) => v)
  expect(values(AR_ROLES).sort()).toEqual([...ROLES].sort())
  expect(values(AR_MEMBER_STATUS)).toEqual(['ativo', 'convidado', 'suspenso'])
  expect(values(AR_PLANS)).toEqual(['essencial', 'gestao', 'performance'])
  for (const s of ['teste', 'teste_vencido', 'ativa', 'cancelamento_agendado', 'inadimplente', 'cancelada', 'sem_assinatura']) expect(values(AR_SUBSCRIPTION)).toContain(s)
  const aliases = MAUTIC_FIELDS.map((x) => x.alias)
  expect(Object.keys(memberFields({ role: 'admin', status: 'active', organizationId: 'o', createdAt: now, lastAccessAt: null, emailVerifiedAt: null, subscription: null }, now)).sort()).toEqual([...aliases].sort())
  for (const s of MAUTIC_SEGMENTS) {
    expect(s.name.startsWith('[AtendeRadar] ')).toBe(true)
    expect(s.alias.startsWith('atenderadar-')).toBe(true)
    expect(s.filters[0]).toMatchObject({ field: 'sistema_origem', operator: 'in', properties: { filter: ['atenderadar'] } })
  }
  expect(new Set(MAUTIC_SEGMENTS.map((s) => s.alias)).size).toBe(MAUTIC_SEGMENTS.length)
})

test('remetente do Brevo: "Nome <email>" ou só o e-mail', () => {
  expect(parseSender('AtendeRadar <nao-responda@atenderadar.com.br>')).toEqual({ name: 'AtendeRadar', email: 'nao-responda@atenderadar.com.br' })
  expect(parseSender('"Atende Radar" <a@b.com>')).toEqual({ name: 'Atende Radar', email: 'a@b.com' })
  expect(parseSender('a@b.com')).toEqual({ email: 'a@b.com' })
})
