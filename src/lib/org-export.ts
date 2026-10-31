import { db } from './db'
import { decryptPhone, formatPhone } from './phone-crypto'
import { maskSensitive } from './mask-sensitive'

// Exportação de TODOS os dados da empresa (LGPD, portabilidade), em JSON. Direito do cliente: funciona também com a
// empresa bloqueada (teste vencido, plano encerrado ou pagamento em atraso) — GET /api/organization/export.
//
// Sai tudo o que a empresa cadastrou ou o AtendeRadar produziu para ela: empresa, membros, equipes, números, atendentes,
// contatos (telefone completo decifrado), conversas com mensagens e análises, alertas, regras, recuperação, relatórios,
// métricas, notificações, assinatura e faturas, webhook, auditoria, chamados de suporte e o CRM comercial (empresas,
// pessoas com telefone completo, funis, negócios com histórico, tarefas, sugestões e configurações).
// NÃO sai: credenciais e segredos (hash de senha, tokens, segredo do webhook, QR de pareamento, hash do telefone),
// controles internos de segurança e os dados de uso do produto (analytics da plataforma). Do CRM também não saem a fila
// e os controles da sincronização (outbox, inbox, checkpoints, idempotência) nem as chaves de duplicidade.
// O texto das mensagens passa pelo mesmo mascaramento da exportação por cliente (cartão, CPF etc.).
//
// As conversas saem em lotes (CONVERSATION_BATCH) e o arquivo é escrito aos poucos: uma empresa grande não carrega
// tudo na memória de uma vez.

const CONVERSATION_BATCH = 200

/** Campos que nunca saem (credenciais, segredos e controles internos). */
const DROP = new Set([
  'passwordHash', 'tokenHash', 'secret', 'phoneHash', 'phoneEncrypted', 'qrCode', 'screenshot',
  'sessionVersion', 'failedLogins', 'lockedUntil', 'seenToursJson', 'systemTourJson',
  'stripeCustomerId', 'stripeSubscriptionId', 'isSimulation', 'simulationExpiresAt',
  'phoneKey', 'emailKey', 'dedupeKey', 'originKey', 'linkKey',
])
/** Campos guardados como texto JSON: saem já como objeto/lista. */
const JSON_FIELDS = new Set(['settingsJson', 'details', 'recipients', 'daysOfWeek', 'channels', 'events', 'tags', 'conditions', 'actions', 'data', 'metadata', 'evidence', 'payload',
  'tagsJson', 'mergeDataJson', 'dataJson', 'payloadJson', 'evidenceJson'])

type Row = Record<string, unknown>

function clean(row: Row): Row {
  const out: Row = {}
  for (const [k, v] of Object.entries(row)) {
    if (DROP.has(k) || v instanceof Uint8Array) continue
    if (typeof v === 'string' && JSON_FIELDS.has(k) && /^[[{]/.test(v)) {
      try {
        out[k] = JSON.parse(v)
        continue
      } catch {
        /* texto comum */
      }
    }
    out[k] = v
  }
  return out
}

const list = (rows: Row[]) => rows.map(clean)

/** Partes do arquivo JSON, em ordem (para escrever em fluxo). */
export async function* organizationExport(orgId: string, now = new Date()): AsyncGenerator<string> {
  const where = { organizationId: orgId }
  const org = await db.organization.findUnique({ where: { id: orgId } })
  if (!org) return
  const section = (name: string, value: unknown) => `,\n${JSON.stringify(name)}: ${JSON.stringify(value, null, 1)}`

  yield `{\n"formato": ${JSON.stringify('AtendeRadar · exportação de todos os dados da empresa (LGPD, portabilidade)')}`
  yield `,\n"geradoEm": ${JSON.stringify(now.toISOString())}`
  yield section('empresa', clean(org as unknown as Row))
  yield section('membros', list(await db.organizationMember.findMany({ where, orderBy: { invitedAt: 'asc' } }) as unknown as Row[]))
  yield section('equipes', list(await db.team.findMany({ where }) as unknown as Row[]))
  yield section('conexoes', list(await db.whatsAppConnection.findMany({ where, orderBy: { createdAt: 'asc' } }) as unknown as Row[]))
  yield section('atendentes', list(await db.agent.findMany({ where }) as unknown as Row[]))
  yield section('identidadesDosAtendentes', list(await db.agentIdentity.findMany({ where: { connection: { organizationId: orgId } } }) as unknown as Row[]))
  const contacts = await db.contact.findMany({ where })
  yield section('contatos', contacts.map((c) => {
    const digits = decryptPhone(orgId, c.phoneEncrypted)
    return { ...clean(c as unknown as Row), phone: digits ? formatPhone(digits) : null }
  }))
  yield section('regrasDeAlerta', list(await db.alertRule.findMany({ where }) as unknown as Row[]))
  yield section('alertas', list(await db.alert.findMany({ where, orderBy: { createdAt: 'asc' } }) as unknown as Row[]))
  yield section('recuperacao', list(await db.recoveryItem.findMany({ where }) as unknown as Row[]))
  yield section('relatoriosConfigurados', list(await db.reportDefinition.findMany({ where }) as unknown as Row[]))
  yield section('relatoriosGerados', list(await db.reportRun.findMany({ where, orderBy: { createdAt: 'asc' } }) as unknown as Row[]))
  yield section('metricasDiarias', list(await db.dailyMetric.findMany({ where }) as unknown as Row[]))
  yield section('metricasPorAtendente', list(await db.agentMetric.findMany({ where }) as unknown as Row[]))
  yield section('correcoesDeClassificacao', list(await db.classificationFeedback.findMany({ where }) as unknown as Row[]))
  yield section('notificacoes', list(await db.notification.findMany({ where, orderBy: { createdAt: 'asc' } }) as unknown as Row[]))
  const sub = await db.subscription.findUnique({ where, include: { plan: { select: { code: true, name: true } } } })
  yield section('assinatura', sub ? clean(sub as unknown as Row) : null)
  yield section('faturas', list(await db.billingInvoice.findMany({ where, orderBy: { createdAt: 'asc' } }) as unknown as Row[]))
  const hook = await db.webhookEndpoint.findUnique({ where })
  yield section('webhook', hook ? clean(hook as unknown as Row) : null)
  yield section('entregasDoWebhook', list(await db.webhookDelivery.findMany({ where, orderBy: { createdAt: 'asc' } }) as unknown as Row[]))
  yield section('auditoria', list(await db.auditLog.findMany({ where, orderBy: { createdAt: 'asc' } }) as unknown as Row[]))
  yield section('chamadosDeSuporte', list(await db.supportTicket.findMany({ where, orderBy: { createdAt: 'asc' } }) as unknown as Row[]))
  // CRM comercial: a empresa pode ter usado e desligado depois; os dados continuam dela e saem do mesmo jeito
  yield section('crmConfiguracoes', list(await db.crmFeatureState.findMany({ where }) as unknown as Row[]))
  yield section('crmEmpresas', list(await db.crmCompany.findMany({ where, orderBy: { createdAt: 'asc' } }) as unknown as Row[]))
  const people = await db.crmPerson.findMany({ where, orderBy: { createdAt: 'asc' } })
  yield section('crmPessoas', people.map((p) => {
    const digits = p.phoneEncrypted ? decryptPhone(orgId, p.phoneEncrypted) : null
    return { ...clean(p as unknown as Row), phone: digits ? formatPhone(digits) : null }
  }))
  yield section('crmFunis', list(await db.crmPipeline.findMany({ where, orderBy: { createdAt: 'asc' }, include: { stages: { orderBy: { position: 'asc' } } } }) as unknown as Row[]))
  const deals = await db.crmDeal.findMany({ where, orderBy: { createdAt: 'asc' }, include: { events: { orderBy: { createdAt: 'asc' } } } })
  yield section('crmNegocios', deals.map(({ events, ...d }) => ({ ...clean(d as unknown as Row), events: list(events as unknown as Row[]) })))
  yield section('crmTarefasERegistros', list(await db.crmActivity.findMany({ where, orderBy: { createdAt: 'asc' } }) as unknown as Row[]))
  yield section('crmSugestoes', list(await db.crmSuggestion.findMany({ where, orderBy: { createdAt: 'asc' } }) as unknown as Row[]))
  // vínculos: negócio ↔ conversa, oportunidade, alerta e recuperação; contato do AtendeRadar ↔ pessoa do CRM (sem linkKey)
  yield section('crmVinculosNegocio', list(await db.crmBusinessLink.findMany({ where, orderBy: { createdAt: 'asc' } }) as unknown as Row[]))
  yield section('crmVinculosIdentidade', list(await db.crmIdentityLink.findMany({ where, orderBy: { createdAt: 'asc' } }) as unknown as Row[]))

  // conversas por último (a parte grande), em lotes
  yield `,\n"conversas": [`
  let cursor: string | undefined
  let first = true
  for (;;) {
    const batch = await db.conversation.findMany({
      where,
      orderBy: { id: 'asc' },
      take: CONVERSATION_BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        messages: { orderBy: { occurredAt: 'asc' } },
        classifications: true,
        findings: true,
        opportunities: true,
        openQuestions: true,
        promises: true,
        scores: true,
        identitySightings: true,
      },
    })
    for (const c of batch) {
      const { messages, classifications, findings, opportunities, openQuestions, promises, scores, identitySightings, ...rest } = c
      const item = {
        ...clean(rest as unknown as Row),
        messages: messages.map((m) => ({ ...clean(m as unknown as Row), text: maskSensitive(m.text) })),
        classifications: list(classifications as unknown as Row[]),
        findings: list(findings as unknown as Row[]),
        opportunities: list(opportunities as unknown as Row[]),
        openQuestions: list(openQuestions as unknown as Row[]),
        promises: promises.map((p) => ({ ...clean(p as unknown as Row), action: maskSensitive(p.action) })),
        scores: list(scores as unknown as Row[]),
        identitySightings: list(identitySightings as unknown as Row[]),
      }
      yield `${first ? '\n' : ',\n'}${JSON.stringify(item)}`
      first = false
    }
    if (batch.length < CONVERSATION_BATCH) break
    cursor = batch[batch.length - 1].id
  }
  yield `\n]\n}\n`
}
