import { db } from './db'
import { enforceQuota } from './quotas'
import { parseRuleChannels, RULE_CHANNELS_ERROR } from './alert-channels'
import { ALERT_TYPE_LABELS, ruleDefaultLimit, ruleLimitKind } from './alert-labels'

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
  for (const k of ['scopeConnections', 'scopeTeams', 'recipients', 'exceptions'] as const) {
    if (body[k] !== undefined && !strList(body[k])) return bad(`O campo ${k} precisa ser uma lista de textos.`, 'invalid_list')
  }
  if (body.minConfidence !== undefined && (typeof body.minConfidence !== 'number' || body.minConfidence < 0 || body.minConfidence > 1)) return bad('A confiança mínima vai de 0 a 1.', 'invalid_confidence')
  const le = limitError(type, body.limitMinutes)
  if (le) return bad(le, 'invalid_limit')
  return null
}

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
  const invalid = validate(body, type)
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
      scopeConnections: JSON.stringify(body.scopeConnections ?? []),
      scopeTeams: JSON.stringify(body.scopeTeams ?? []),
      daysAndHours: JSON.stringify(body.daysAndHours ?? {}),
      recipients: JSON.stringify(body.recipients ?? []),
      autoCloseMinutes: (body.autoCloseMinutes as number | null | undefined) ?? null,
      exceptions: JSON.stringify(body.exceptions ?? []),
      minConfidence: (body.minConfidence as number | undefined) ?? 0.5,
    },
  })
  return { ok: true, status: 201, rule }
}

/** Campos a gravar no PUT (já validados). O tipo não muda depois de criada (os alertas e o agrupamento dependem dele). */
export async function ruleUpdateData(orgId: string, existing: { id: string; type: string }, body: RuleInput): Promise<{ ok: true; data: Record<string, unknown> } | Extract<RuleResult, { ok: false }>> {
  if (body.type !== undefined && body.type !== existing.type) return { ok: false, status: 400, error: 'O tipo da regra não muda depois de criada. Crie outra regra.', code: 'type_locked' }
  const invalid = validate(body, existing.type)
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
  for (const k of ['scopeConnections', 'scopeTeams', 'recipients', 'exceptions'] as const) if (body[k] !== undefined) data[k] = JSON.stringify(body[k])
  if (body.daysAndHours !== undefined) data.daysAndHours = JSON.stringify(body.daysAndHours)
  if (body.autoCloseMinutes !== undefined) data.autoCloseMinutes = body.autoCloseMinutes
  if (body.minConfidence !== undefined) data.minConfidence = body.minConfidence
  return { ok: true, data }
}
