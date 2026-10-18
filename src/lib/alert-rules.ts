import { db } from './db'
import { enforceQuota } from './quotas'
import { parseRuleChannels, RULE_CHANNELS_ERROR } from './alert-channels'
import { ALERT_TYPE_LABELS, ruleDefaultLimit, ruleLimitKind } from './alert-labels'
import { ruleWindowError } from './analysis/rule-filters'

// Criação e validação de regras de alerta, compartilhadas pela API (POST/PUT /api/alert-rules) e pelo simulador
// (o cenário cria a regra pelo MESMO caminho da tela: cota do plano, tipo conhecido, nome único, prazo válido).

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info']

export interface RuleInput {
  name?: unknown
  type?: unknown
  active?: unknown
  severity?: unknown
  channels?: unknown
  cooldownMinutes?: unknown
  limitMinutes?: unknown
  scopeConnections?: unknown
  scopeTeams?: unknown
  daysAndHours?: unknown
  recipients?: unknown
  autoCloseMinutes?: unknown
  exceptions?: unknown
  minConfidence?: unknown
}

export type RuleResult = { ok: true; status: number; rule: Awaited<ReturnType<typeof db.alertRule.create>> } | { ok: false; status: number; error: string; code: string; extra?: Record<string, unknown> }

const bad = (error: string, code: string): RuleResult => ({ ok: false, status: 400, error, code })
const strList = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string')
const intOrNull = (v: unknown) => v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 0)

/** Confere o número da regra conforme o tipo: minutos (0 a 30 dias) ou % do limite (1 a 100). */
function limitError(type: string, limit: unknown): string | null {
  if (limit === undefined || limit === null) return null
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 0) return 'O prazo da regra precisa ser um número inteiro (0 ou mais).'
  const kind = ruleLimitKind(type)
  if (kind === 'percent' && (limit < 1 || limit > 100)) return 'O aviso de limite vai de 1% a 100%.'
  if (kind === 'minutes' && limit > 43_200) return 'O prazo máximo é de 30 dias (43.200 minutos).'
  return null
}

/** Valida os campos comuns de criação/edição. type = tipo final da regra (no PUT, o que já existe). */
function validate(body: RuleInput, type: string): RuleResult | null {
  if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 80)) return bad('Dê um nome à regra (até 80 caracteres).', 'invalid_name')
  if (body.severity !== undefined && (typeof body.severity !== 'string' || !SEVERITIES.includes(body.severity))) return bad('Severidade inválida.', 'invalid_severity')
  if (body.cooldownMinutes !== undefined && !intOrNull(body.cooldownMinutes)) return bad('O cooldown precisa ser um número inteiro de minutos (0 ou mais).', 'invalid_cooldown')
  if (body.autoCloseMinutes !== undefined && !intOrNull(body.autoCloseMinutes)) return bad('O encerramento automático precisa ser um número inteiro de minutos.', 'invalid_auto_close')
  if (typeof body.autoCloseMinutes === 'number' && body.autoCloseMinutes > 43_200) return bad('O encerramento automático vai até 30 dias (43.200 minutos).', 'invalid_auto_close')
  for (const k of ['scopeConnections', 'scopeTeams', 'recipients', 'exceptions'] as const) {
    if (body[k] !== undefined && !strList(body[k])) return bad(`O campo ${k} precisa ser uma lista de textos.`, 'invalid_list')
  }
  if (Array.isArray(body.exceptions)) {
    // linhas em branco são descartadas ao gravar (cleanList)
    const ex = cleanList(body.exceptions)
    if (ex.length > 20 || ex.some((t) => t.length > 40)) return bad('Exceções: até 20 etiquetas, cada uma com 1 a 40 caracteres.', 'invalid_exceptions')
  }
  const we = ruleWindowError(body.daysAndHours)
  if (we) return bad(we, 'invalid_days_hours')
  if (body.minConfidence !== undefined && (typeof body.minConfidence !== 'number' || body.minConfidence < 0 || body.minConfidence > 1)) return bad('A confiança mínima vai de 0 a 1.', 'invalid_confidence')
  const le = limitError(type, body.limitMinutes)
  if (le) return bad(le, 'invalid_limit')
  return null
}

/** Números e equipes da regra precisam ser da própria empresa (id de outra empresa ou apagado não entra). */
async function scopeError(orgId: string, body: RuleInput): Promise<RuleResult | null> {
  const conns = Array.isArray(body.scopeConnections) ? [...new Set(body.scopeConnections as string[])] : []
  if (conns.length && (await db.whatsAppConnection.count({ where: { organizationId: orgId, id: { in: conns } } })) !== conns.length) {
    return bad('Algum número escolhido não existe nesta empresa.', 'invalid_scope_connections')
  }
  const teams = Array.isArray(body.scopeTeams) ? [...new Set(body.scopeTeams as string[])] : []
  if (teams.length && (await db.team.count({ where: { organizationId: orgId, id: { in: teams } } })) !== teams.length) {
    return bad('Alguma equipe escolhida não existe nesta empresa.', 'invalid_scope_teams')
  }
  return null
}

const cleanList = (v: unknown) => [...new Set((v as string[]).map((s) => s.trim()).filter(Boolean))]

async function nameTaken(orgId: string, name: string, exceptId?: string) {
  const same = await db.alertRule.findFirst({ where: { organizationId: orgId, name, ...(exceptId ? { NOT: { id: exceptId } } : {}) }, select: { id: true } })
  return !!same
}

export async function createAlertRule(orgId: string, body: RuleInput): Promise<RuleResult> {
  const blocked = await enforceQuota(orgId, 'alertRules')
  if (blocked) {
    const j = (await blocked.json()) as { error: string; code: string } & Record<string, unknown>
    return { ok: false, status: blocked.status, error: j.error, code: j.code, extra: j }
  }
  if (typeof body.name !== 'string' || !body.name.trim() || typeof body.type !== 'string' || !body.type) return bad('Nome e tipo da regra são obrigatórios.', 'name_and_type_required')
  const type = body.type
  if (!(type in ALERT_TYPE_LABELS)) return bad('Tipo de regra desconhecido.', 'invalid_type')
  const invalid = validate(body, type) ?? (await scopeError(orgId, body))
  if (invalid) return invalid
  const name = body.name.trim()
  // os alertas guardam o nome da regra: dois nomes iguais misturariam os alertas das duas
  if (await nameTaken(orgId, name)) return { ok: false, status: 409, error: 'Já existe uma regra com esse nome. Escolha outro.', code: 'name_taken' }
  const channels = body.channels === undefined ? ['in_app'] : parseRuleChannels(body.channels)
  if (!channels) return bad(RULE_CHANNELS_ERROR, 'invalid_channels')

  const rule = await db.alertRule.create({
    data: {
      organizationId: orgId,
      name,
      type,
      active: typeof body.active === 'boolean' ? body.active : true,
      severity: (body.severity as string | undefined) ?? 'medium',
      notificationChannels: JSON.stringify(channels),
      cooldownMinutes: (body.cooldownMinutes as number | null | undefined) ?? 30,
      // sem número, o padrão do tipo (antes ficava vazio = 0 min e a regra de tempo disparava na hora)
      limitMinutes: (body.limitMinutes as number | null | undefined) ?? ruleDefaultLimit(type),
      scopeConnections: JSON.stringify(cleanList(body.scopeConnections ?? [])),
      scopeTeams: JSON.stringify(cleanList(body.scopeTeams ?? [])),
      daysAndHours: JSON.stringify(body.daysAndHours ?? {}),
      recipients: JSON.stringify(body.recipients ?? []),
      // 0 = não encerra sozinho
      autoCloseMinutes: (body.autoCloseMinutes as number | null | undefined) || null,
      exceptions: JSON.stringify(cleanList(body.exceptions ?? [])),
      minConfidence: (body.minConfidence as number | undefined) ?? 0.5,
    },
  })
  return { ok: true, status: 201, rule }
}

/** Campos a gravar no PUT (já validados). O tipo não muda depois de criada (os alertas e o agrupamento dependem dele). */
export async function ruleUpdateData(orgId: string, existing: { id: string; type: string }, body: RuleInput): Promise<{ ok: true; data: Record<string, unknown> } | Extract<RuleResult, { ok: false }>> {
  if (body.type !== undefined && body.type !== existing.type) return { ok: false, status: 400, error: 'O tipo da regra não muda depois de criada. Crie outra regra.', code: 'type_locked' }
  const invalid = validate(body, existing.type) ?? (await scopeError(orgId, body))
  if (invalid && !invalid.ok) return invalid
  if (typeof body.name === 'string' && (await nameTaken(orgId, body.name.trim(), existing.id))) return { ok: false, status: 409, error: 'Já existe uma regra com esse nome. Escolha outro.', code: 'name_taken' }
  const data: Record<string, unknown> = {}
  if (typeof body.name === 'string') data.name = body.name.trim()
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') return { ok: false, status: 400, error: 'active precisa ser verdadeiro ou falso.', code: 'invalid_active' }
    data.active = body.active
  }
  if (body.severity !== undefined) data.severity = body.severity
  if (body.channels !== undefined) {
    const parsed = parseRuleChannels(body.channels)
    if (!parsed) return { ok: false, status: 400, error: RULE_CHANNELS_ERROR, code: 'invalid_channels' }
    data.notificationChannels = JSON.stringify(parsed)
  }
  if (body.cooldownMinutes !== undefined) data.cooldownMinutes = body.cooldownMinutes ?? 30
  if (body.limitMinutes !== undefined) data.limitMinutes = body.limitMinutes ?? ruleDefaultLimit(existing.type)
  for (const k of ['scopeConnections', 'scopeTeams', 'exceptions'] as const) if (body[k] !== undefined) data[k] = JSON.stringify(cleanList(body[k]))
  if (body.recipients !== undefined) data.recipients = JSON.stringify(body.recipients)
  if (body.daysAndHours !== undefined) data.daysAndHours = JSON.stringify(body.daysAndHours ?? {})
  if (body.autoCloseMinutes !== undefined) data.autoCloseMinutes = body.autoCloseMinutes || null
  if (body.minConfidence !== undefined) data.minConfidence = body.minConfidence
  return { ok: true, data }
}
