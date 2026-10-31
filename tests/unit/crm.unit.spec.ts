import { test, expect } from '@playwright/test'
import { formatCents, parseBrlToCents, reaisToCents, MAX_AMOUNT_CENTS } from '../../src/lib/crm/money'
import { cleanText, normEmail, normName, personPhoneKey, phoneDigits } from '../../src/lib/crm/text'
import { csvCell } from '../../src/lib/crm/exports'
import { backoffMs } from '../../src/lib/crm/worker'
import { EVENT_SCHEMAS, eventIdempotencyKey } from '../../src/lib/crm/events'
import { STAGE_TARGET_POSITION } from '../../src/lib/crm/consumer'
import { dealClose, dealCreate, exportBody, importBody, personCreate, personUpdate, settingsUpdate, suggestionAccept } from '../../src/lib/crm/schemas'
import { can, canOpenView, ROLES } from '../../src/lib/permissions'
import { activityWhere, companyWhere, personWhere, type OwnerScope } from '../../src/lib/crm/scope'

// CRM · regras puras (docs/crm/03-modelo-dados.md, 04-api-crm.md, 05-sincronizacao.md). Sem banco e sem rede.

test.describe('CRM · dinheiro em centavos', () => {
  test('estimativa em reais (Float) vira centavos inteiros, arredondando meio para cima, sem erro de ponto flutuante', () => {
    expect(reaisToCents(0.1 + 0.2)).toBe(30)
    expect(reaisToCents(1234.565)).toBe(123457)
    expect(reaisToCents(300)).toBe(30000)
    expect(reaisToCents(0)).toBe(0)
  })

  test('valor ausente, inválido ou negativo vira null (nunca R$ 0,00 inventado); acima do teto é cortado', () => {
    expect(reaisToCents(null)).toBeNull()
    expect(reaisToCents(undefined)).toBeNull()
    expect(reaisToCents(Number.NaN)).toBeNull()
    expect(reaisToCents(-5)).toBeNull()
    expect(reaisToCents(1e15)).toBe(MAX_AMOUNT_CENTS)
  })

  test('texto em formato brasileiro ou internacional', () => {
    expect(parseBrlToCents('R$ 1.234,56')).toBe(123456)
    expect(parseBrlToCents('1234.56')).toBe(123456)
    expect(parseBrlToCents('99')).toBe(9900)
    expect(parseBrlToCents('1,5')).toBe(150)
    expect(parseBrlToCents('')).toBeNull()
    expect(parseBrlToCents('abc')).toBeNull()
    // milhar só em grupos de 3: "1.234" (BR) e "1,234" (internacional) = R$ 1.234; o resto é recusado
    expect(parseBrlToCents('1.234')).toBe(123400)
    expect(parseBrlToCents('1,234')).toBe(123400)
    expect(parseBrlToCents('1,234.5')).toBe(123450)
    expect(parseBrlToCents('1,2,3')).toBeNull()
    expect(parseBrlToCents('1.2.3,45')).toBeNull()
    expect(parseBrlToCents('1,234,5')).toBeNull()
    expect(parseBrlToCents('1.23.4')).toBeNull()
  })

  test('na tela, sem valor = "Valor não informado"', () => {
    expect(formatCents(null)).toBe('Valor não informado')
    expect(formatCents(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56')
  })
})

test.describe('CRM · normalização e deduplicação', () => {
  test('nome para busca: sem acento, minúsculas e espaços simples', () => {
    expect(normName('  José   da  SILVA ')).toBe('jose da silva')
    expect(normEmail('  Ana@Exemplo.COM ')).toBe('ana@exemplo.com')
    expect(normEmail('   ')).toBeNull()
  })

  test('telefone: só dígitos, ganha o 55 quando brasileiro sem DDI, e fora de 10 a 15 dígitos é inválido', () => {
    expect(phoneDigits('(11) 98888-7777')).toBe('5511988887777')
    expect(phoneDigits('+55 11 98888-7777')).toBe('5511988887777')
    expect(phoneDigits('1133334444')).toBe('551133334444')
    expect(phoneDigits('12345')).toBeNull()
    expect(phoneDigits('1234567890123456')).toBeNull()
    expect(phoneDigits(null)).toBeNull()
  })

  test('a chave de duplicidade leva a empresa: o mesmo número em duas empresas não colide', () => {
    const digits = '5511988887777'
    expect(personPhoneKey('org_a', digits)).not.toBe(personPhoneKey('org_b', digits))
    expect(personPhoneKey('org_a', digits)).toBe(personPhoneKey('org_a', digits))
    expect(personPhoneKey('org_a', digits)).not.toContain(digits)
  })

  test('texto livre: tira caracteres de controle e corta no limite (HTML fica para o React escapar)', () => {
    expect(cleanText('a\u0000b\u0007c\u001f', 10)).toBe('abc')
    expect(cleanText('  linha 1\nlinha 2  ', 100)).toBe('linha 1\nlinha 2')
    expect(cleanText('x'.repeat(50), 10)).toHaveLength(10)
    expect(cleanText('<script>alert(1)</script>', 100)).toBe('<script>alert(1)</script>')
  })
})

test.describe('CRM · exportação CSV', () => {
  test('célula que começa com = + - @ (ou tab/CR) ganha apóstrofo: não vira fórmula na planilha', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`)
    expect(csvCell('+5511')).toBe("'+5511")
    expect(csvCell('-1')).toBe("'-1")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvCell('\tcmd')).toBe("'\tcmd")
  })

  test('separador, aspas e quebra de linha ficam entre aspas; vazio fica vazio', () => {
    expect(csvCell('a;b')).toBe('"a;b"')
    expect(csvCell('diz "oi"')).toBe('"diz ""oi"""')
    expect(csvCell('l1\nl2')).toBe('"l1\nl2"')
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
    expect(csvCell(42)).toBe('42')
  })
})

test.describe('CRM · fila de sincronização', () => {
  test('backoff exponencial de 30 s até 1 h, com ±20% de jitter', () => {
    const mid = () => 0.5
    expect(backoffMs(1, mid)).toBe(30_000)
    expect(backoffMs(2, mid)).toBe(60_000)
    expect(backoffMs(3, mid)).toBe(120_000)
    expect(backoffMs(20, mid)).toBe(3_600_000)
    expect(backoffMs(1, () => 0)).toBe(24_000)
    expect(backoffMs(1, () => 1)).toBe(36_000)
  })

  test('chave de idempotência do evento: tipo, agregado e versão (reler o mesmo trecho não duplica)', () => {
    const e = { organizationId: 'o1', eventType: 'alert.created' as const, aggregateType: 'alert', aggregateId: 'a1', aggregateVersion: 2 }
    expect(eventIdempotencyKey(e)).toBe('o1:alert.created:alert:a1:2')
    expect(eventIdempotencyKey({ ...e, aggregateVersion: 3 })).not.toBe(eventIdempotencyKey(e))
  })

  test('payload do evento é mínimo: campo extra (nome, telefone, texto da mensagem) é recusado', () => {
    const ok = { opportunityId: 'op1', conversationId: 'c1', agentId: null, intent: 'price', status: 'active', estimatedValueCents: 1000, confidence: 0.8 }
    expect(EVENT_SCHEMAS['opportunity.detected'].safeParse(ok).success).toBe(true)
    expect(EVENT_SCHEMAS['opportunity.detected'].safeParse({ ...ok, customerName: 'Maria' }).success).toBe(false)
    expect(EVENT_SCHEMAS['opportunity.detected'].safeParse({ ...ok, confidence: 1.5 }).success).toBe(false)
    expect(EVENT_SCHEMAS['alert.created'].safeParse({ alertId: 'a', conversationId: null, agentId: null, type: 't', severity: 'high', text: 'oi' }).success).toBe(false)
  })

  test('etapa analítica só move para etapas mapeadas do funil padrão ("evaluation" e "post_sale" não movem)', () => {
    expect(STAGE_TARGET_POSITION.price).toBe(2)
    expect(STAGE_TARGET_POSITION.evaluation).toBeUndefined()
    expect(STAGE_TARGET_POSITION.post_sale).toBeUndefined()
  })
})

test.describe('CRM · contratos de entrada (strict)', () => {
  test('campo desconhecido é recusado (bloqueia mass assignment de organizationId, status, createdBy)', () => {
    expect(personCreate.safeParse({ name: 'Ana' }).success).toBe(true)
    expect(personCreate.safeParse({ name: 'Ana', organizationId: 'outra' }).success).toBe(false)
    expect(dealCreate.safeParse({ title: 'Venda', status: 'won' }).success).toBe(false)
    expect(dealCreate.safeParse({ title: 'Venda', amountSource: 'verified_external' }).success).toBe(false)
    expect(settingsUpdate.safeParse({ enabled: true }).success).toBe(false)
  })

  test('edição exige versão (concorrência otimista)', () => {
    expect(personUpdate.safeParse({ name: 'Ana' }).success).toBe(false)
    expect(personUpdate.safeParse({ name: 'Ana', version: 1 }).success).toBe(true)
    expect(personUpdate.safeParse({ name: 'Ana', version: 0 }).success).toBe(false)
  })

  test('valor em centavos inteiros, não negativo e com teto', () => {
    expect(dealCreate.safeParse({ title: 'x', amountCents: 10.5 }).success).toBe(false)
    expect(dealCreate.safeParse({ title: 'x', amountCents: -1 }).success).toBe(false)
    expect(dealCreate.safeParse({ title: 'x', amountCents: MAX_AMOUNT_CENTS + 1 }).success).toBe(false)
    expect(dealCreate.safeParse({ title: 'x', amountCents: 0 }).success).toBe(true)
    expect(dealCreate.safeParse({ title: '   ' }).success).toBe(false)
  })

  test('perda exige motivo da lista; ganho não exige (a regra do valor fica no domínio)', () => {
    expect(dealClose.safeParse({ outcome: 'lost', version: 1 }).success).toBe(false)
    expect(dealClose.safeParse({ outcome: 'lost', version: 1, lostReasonCode: 'price' }).success).toBe(true)
    expect(dealClose.safeParse({ outcome: 'lost', version: 1, lostReasonCode: 'inventado' }).success).toBe(false)
    expect(dealClose.safeParse({ outcome: 'won', version: 1 }).success).toBe(true)
    expect(dealClose.safeParse({ outcome: 'archived', version: 1 }).success).toBe(false)
  })

  test('datas ISO com fuso; e-mail e telefone validados', () => {
    expect(dealCreate.safeParse({ title: 'x', expectedCloseAt: '2026-11-30T12:00:00.000Z' }).success).toBe(true)
    expect(dealCreate.safeParse({ title: 'x', expectedCloseAt: '30/11/2026' }).success).toBe(false)
    expect(personCreate.safeParse({ name: 'Ana', email: 'nao-e-email' }).success).toBe(false)
    expect(personCreate.safeParse({ name: 'Ana', phone: '11 9999-9999<script>' }).success).toBe(false)
  })

  test('importação: 1 a 5.000 linhas e dryRun obrigatório; exportação só pessoas ou negócios', () => {
    expect(importBody.safeParse({ rows: [{ name: 'a' }] }).success).toBe(false)
    expect(importBody.safeParse({ dryRun: true, rows: [] }).success).toBe(false)
    expect(importBody.safeParse({ dryRun: true, rows: Array.from({ length: 5001 }, () => ({ name: 'a' })) }).success).toBe(false)
    expect(exportBody.safeParse({ entity: 'people' }).success).toBe(true)
    expect(exportBody.safeParse({ entity: 'activities' }).success).toBe(false)
    expect(suggestionAccept.safeParse({}).success).toBe(true)
    expect(suggestionAccept.safeParse({ status: 'accepted' }).success).toBe(false)
  })
})

test.describe('CRM · permissões por papel', () => {
  const who = (perm: Parameters<typeof can>[1]) => ROLES.filter((r) => can(r, perm))

  test('números agregados: todos menos o membro sem papel definido', () => {
    expect(who('crm.analytics.view')).toEqual(['admin', 'gestor', 'supervisor', 'analista', 'atendente', 'viewer'])
  })

  test('listas e edição: só quem opera (analista e visualizador não veem pessoas nem negócios)', () => {
    for (const p of ['crm.contacts.view', 'crm.deals.view', 'crm.deals.manage', 'crm.activities.manage'] as const) {
      expect(who(p)).toEqual(expect.arrayContaining(['admin', 'gestor', 'supervisor', 'atendente']))
      expect(who(p)).not.toContain('analista')
      expect(who(p)).not.toContain('viewer')
      expect(who(p)).not.toContain('member')
    }
  })

  test('configuração, funil e mescla: admin e gestor; reprocessar, importar e exportar: só admin', () => {
    for (const p of ['crm.settings.manage', 'crm.pipelines.manage', 'crm.contacts.merge'] as const) {
      expect(who(p)).toContain('admin')
      expect(who(p)).toContain('gestor')
      expect(who(p)).not.toContain('atendente')
    }
    for (const p of ['crm.sync.retry', 'crm.import', 'crm.export'] as const) expect(who(p)).toEqual(['admin'])
  })

  test('as telas do CRM estão mapeadas (tela sem mapa abriria para qualquer papel)', () => {
    const views = ['crm-overview', 'crm-deals', 'crm-deal', 'crm-contacts', 'crm-contact', 'crm-companies', 'crm-company', 'crm-activities', 'crm-settings']
    for (const v of views) expect(canOpenView('member', v), v).toBe(false)
    expect(canOpenView('analista', 'crm-overview')).toBe(true)
    expect(canOpenView('analista', 'crm-deals')).toBe(false)
    expect(canOpenView('atendente', 'crm-deals')).toBe(true)
    expect(canOpenView('atendente', 'crm-settings')).toBe(false)
  })
})

test.describe('CRM · escopo por papel nas consultas', () => {
  // O Prisma transforma "tem negócio dele" num EXISTS ligado a cada linha. Sem a empresa dentro dele, o SQLite não usa os
  // índices (organizationId, …) e a lista do vendedor levava 13 s com 10 mil pessoas (docs/crm/08-testes-e2e.md › Carga).
  const ORG = 'org_a'
  const escopos: OwnerScope[] = [
    { kind: 'own', memberId: 'm1', email: 'v@cliente.test' },
    { kind: 'team', team: 'Norte', memberIds: ['m1', 'm2'] },
  ]
  const relacoes = (or: unknown[]) => or.filter((c): c is Record<string, Record<string, unknown>> => !!c && typeof c === 'object' && !('ownerMemberId' in c))

  test('todo filtro por relação leva o organizationId (pessoas, empresas e tarefas)', () => {
    for (const scope of escopos) {
      const pessoa = relacoes(personWhere(ORG, scope).OR as unknown[])
      expect(pessoa.map((c) => (c.deals.some as { organizationId: string }).organizationId)).toEqual([ORG])
      const empresa = relacoes(companyWhere(ORG, scope).OR as unknown[])
      expect(empresa.map((c) => Object.keys(c)[0])).toEqual(['deals', 'people'])
      for (const c of empresa) expect((Object.values(c)[0].some as { organizationId: string }).organizationId).toBe(ORG)
      const tarefa = relacoes(activityWhere(ORG, scope).OR as unknown[])
      expect(tarefa.map((c) => (c.deal as { organizationId: string }).organizationId)).toEqual([ORG])
    }
  })

  test('a empresa toda não ganha filtro de responsável', () => {
    expect(personWhere(ORG, { kind: 'all' })).toEqual({ organizationId: ORG })
    expect(companyWhere(ORG, { kind: 'all' })).toEqual({ organizationId: ORG })
    expect(activityWhere(ORG, { kind: 'all' })).toEqual({ organizationId: ORG })
  })
})
