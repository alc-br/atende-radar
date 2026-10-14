import { norm } from './text'

const NAME = '[A-Za-zÀ-ÿ]+(?: [A-Za-zÀ-ÿ]+){0,2}'
const AT_START = new RegExp(`^\\s*[*_~]*(${NAME})[*_~]*\\s*[:\\-–]\\s*\\S`)
const AT_END = new RegExp(`(?:—|–|-|att[.,]?|atenciosamente[.,]?|abs[.,]?|abracos?[.,]?|abraços?[.,]?)\\s*[*_~]*(${NAME})[*_~]*\\s*$`, 'i')

// "Rótulo: valor" que não é assinatura de gente ("Pix: chave", "Obs: ...", "Endereço - Rua X").
const NOT_A_NAME = new Set([
  'obs', 'pix', 'endereco', 'horario', 'horarios', 'valor', 'valores', 'total', 'subtotal', 'atencao', 'importante', 'ps', 'ok',
  'link', 'site', 'email', 'telefone', 'whatsapp', 'segue', 'data', 'hora', 'local', 'chave', 'cpf', 'cnpj', 'banco', 'agencia',
  'conta', 'senha', 'codigo', 'pedido', 'protocolo', 'preco', 'precos', 'prazo', 'entrega', 'frete', 'resposta', 'pergunta', 'nota',
  'dica', 'lembrete', 'aviso', 'oi', 'ola', 'bom', 'boa', 'obrigado', 'obrigada', 'sim', 'nao', 'opcao', 'forma', 'pagamento',
  'parcela', 'parcelas', 'desconto', 'cupom', 'produto', 'servico', 'consulta', 'retorno', 'tamanho', 'cor', 'modelo', 'quantidade',
])

/** Nome da assinatura da mensagem da empresa ("*Carlos*: ..." ou "... — Carlos"), como foi escrito; null se não houver. */
export function extractSignature(text: string | null | undefined): string | null {
  if (!text) return null
  const candidate = text.match(AT_START)?.[1] ?? text.trim().match(AT_END)?.[1]
  if (!candidate) return null
  const c = norm(candidate)
  if (!c || NOT_A_NAME.has(c.split(' ')[0])) return null
  return candidate.trim()
}

/** Atendente cujo nome bate com o texto: nome completo, ou só o primeiro nome quando ninguém mais o tem. */
export function matchAgentName(candidate: string, agents: Array<{ id: string; name: string }>): { id: string; how: 'full' | 'first' } | null {
  const c = norm(candidate)
  if (!c) return null
  const full = agents.filter((a) => norm(a.name) === c)
  if (full.length === 1) return { id: full[0].id, how: 'full' }
  const first = agents.filter((a) => norm(a.name).split(' ')[0] === c.split(' ')[0] && !c.includes(' '))
  return first.length === 1 ? { id: first[0].id, how: 'first' } : null
}

/**
 * O WhatsApp só diz que a empresa falou, não QUEM falou. Muitas equipes assinam ("*Carlos*: ..." ou "— Carlos").
 * Devolve o id do atendente cadastrado cujo nome bate com a assinatura, ou null se não houver assinatura
 * ou se o primeiro nome for ambíguo (duas "Ana").
 */
export function attributeAgent(text: string | null | undefined, agents: Array<{ id: string; name: string }>): string | null {
  const sig = extractSignature(text)
  return sig ? matchAgentName(sig, agents)?.id ?? null : null
}

// ---------- P5 · identidades do WhatsApp (§18.2) ----------
// Uma identidade é algo que se repete nas mensagens da empresa numa conexão e pode apontar para uma pessoa:
//  · signature: a assinatura no texto (o mais específico);
//  · device: o tipo de aparelho que enviou (iPhone, Android, WhatsApp Web, computador), deduzido do id da mensagem;
//  · number: o número inteiro (serve quando cada atendente tem o próprio WhatsApp).
// O sistema só SUGERE; quem confirma é admin/gestor. Só o vínculo confirmado conta nos indicadores por atendente.

export type IdentityKind = 'signature' | 'device' | 'number'
export type DeviceType = 'ios' | 'android' | 'web' | 'desktop'

export const DEVICE_LABEL: Record<DeviceType, string> = { ios: 'iPhone', android: 'Android', web: 'WhatsApp Web', desktop: 'WhatsApp no computador' }
export const KIND_RANK: Record<string, number> = { signature: 0, device: 1, number: 2 }

/** Tipo de aparelho pelo formato do id da mensagem (mesma regra do Baileys, getDevice). null = desconhecido. */
export function deviceFromMessageId(id: string | null | undefined): DeviceType | null {
  if (!id) return null
  if (/^3A.{18}$/.test(id)) return 'ios'
  if (/^3E.{20}$/.test(id)) return 'web'
  if (/^(.{21}|.{32})$/.test(id)) return 'android'
  if (/^(3F|.{18}$)/.test(id)) return 'desktop'
  return null
}

export interface IdentityKey {
  kind: IdentityKind
  ref: string
  displayName: string
}

/** Identidades presentes numa mensagem da empresa (só mensagens reais do WhatsApp, que têm externalId). */
export function identityKeysOf(m: { direction: string; text: string | null; externalId: string | null }): IdentityKey[] {
  if (m.direction !== 'outbound' || !m.externalId) return []
  const keys: IdentityKey[] = []
  const sig = extractSignature(m.text)
  if (sig) keys.push({ kind: 'signature', ref: `sig:${norm(sig)}`, displayName: sig })
  const dev = deviceFromMessageId(m.externalId)
  if (dev) keys.push({ kind: 'device', ref: `dev:${dev}`, displayName: DEVICE_LABEL[dev] })
  keys.push({ kind: 'number', ref: 'num', displayName: 'Número inteiro' })
  return keys
}

export interface Suggestion {
  agentId: string | null
  confidence: number
  reason: string
}

/**
 * Palpite de quem é a identidade, com nível de confiança (0–1):
 *  · assinatura = nome completo de um atendente → 0,9; = primeiro nome sem outro atendente com o mesmo → 0,7;
 *    vista em menos de 3 conversas → −0,1 (pode ser coincidência);
 *  · número inteiro: nome da conexão contém o nome completo de um atendente → 0,6; só o primeiro nome → 0,5;
 *  · número ou aparelho: só existe um atendente ativo cadastrado → 0,4;
 *  · nada disso → sem sugestão (o gestor escolhe).
 */
export function suggestAgent(
  identity: { kind: string; displayName: string; conversationCount: number },
  ctx: { connectionName: string; agents: Array<{ id: string; name: string }> }
): Suggestion {
  const { agents } = ctx
  const single = agents.length === 1 ? agents[0] : null
  if (identity.kind === 'signature') {
    const m = matchAgentName(identity.displayName, agents)
    if (!m) return { agentId: null, confidence: 0, reason: 'A assinatura não bate com nenhum atendente cadastrado (ou bate com mais de um).' }
    let confidence = m.how === 'full' ? 0.9 : 0.7
    let reason = m.how === 'full' ? 'Assinatura igual ao nome completo do atendente.' : 'Assinatura igual ao primeiro nome do atendente (nenhum outro tem esse nome).'
    if (identity.conversationCount < 3) {
      confidence -= 0.1
      reason += ' Vista em menos de 3 conversas.'
    }
    return { agentId: m.id, confidence: +confidence.toFixed(2), reason }
  }
  if (identity.kind === 'number') {
    const conn = ` ${norm(ctx.connectionName).replace(/[^a-z0-9 ]/g, ' ')} `
    const full = agents.filter((a) => norm(a.name).includes(' ') && conn.includes(` ${norm(a.name)} `))
    if (full.length === 1) return { agentId: full[0].id, confidence: 0.6, reason: 'O nome da conexão contém o nome completo do atendente.' }
    const first = agents.filter((a) => conn.includes(` ${norm(a.name).split(' ')[0]} `))
    // (dois atendentes com o mesmo primeiro nome caem os dois aqui: ambíguo, sem sugestão por nome)
    if (first.length === 1) return { agentId: first[0].id, confidence: 0.5, reason: 'O nome da conexão contém o primeiro nome do atendente.' }
  }
  if (single) return { agentId: single.id, confidence: 0.4, reason: 'É o único atendente ativo cadastrado.' }
  return {
    agentId: null,
    confidence: 0,
    reason: identity.kind === 'device' ? 'O tipo de aparelho sozinho não identifica a pessoa: escolha o atendente.' : 'Nada liga este número a um atendente: escolha o atendente.',
  }
}

export interface SightingForAttribution {
  kind: string
  firstSeenAt: Date
  associationStatus: string
  agentId: string | null
  suggestedAgentId: string | null
}

/**
 * Atendente da conversa a partir das identidades vistas nela. Vale a evidência mais específica
 * (assinatura > aparelho > número) e, empatando, a que apareceu primeiro. Identidade marcada "não é atendente" é ignorada.
 * `confirmed` só vem de vínculo confirmado; `suggested` só é preenchido quando não há confirmado.
 */
export function resolveAttribution(rows: SightingForAttribution[], activeAgentIds?: Set<string>) {
  const ok = (id: string | null): id is string => !!id && (!activeAgentIds || activeAgentIds.has(id))
  const sorted = rows
    .filter((r) => r.associationStatus !== 'ignored')
    .sort((a, b) => (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9) || a.firstSeenAt.getTime() - b.firstSeenAt.getTime())
  const confirmed = sorted.find((r) => r.associationStatus === 'confirmed' && ok(r.agentId))?.agentId ?? null
  const suggested = confirmed ? null : sorted.find((r) => r.associationStatus !== 'confirmed' && ok(r.suggestedAgentId))?.suggestedAgentId ?? null
  // atendentes que a assinatura apontaria (para reconhecer conversas atribuídas pela regra antiga, antes do P5)
  const signatureAgents = rows.filter((r) => r.kind === 'signature').map((r) => r.agentId ?? r.suggestedAgentId).filter((x): x is string => !!x)
  return { confirmed, suggested, signatureAgents }
}

/**
 * Decide o atendente gravado na conversa.
 *  · escolha manual (tela ou correção) nunca é desfeita;
 *  · legado: atendente gravado antes do P5 que NÃO veio da assinatura (ex.: atribuição em massa) vira manual;
 *  · senão: vínculo confirmado → atendente; sem confirmado → só a sugestão (não conta nos indicadores).
 */
export function decideAgent(
  conv: { agentId: string | null; agentAttribution: string | null },
  attr: { confirmed: string | null; suggested: string | null; signatureAgents: string[] },
  hasManualFeedback: boolean
): { agentId: string | null; agentAttribution: string | null; suggestedAgentId: string | null } {
  if (conv.agentAttribution === 'manual' || (hasManualFeedback && conv.agentId)) return { agentId: conv.agentId, agentAttribution: 'manual', suggestedAgentId: null }
  if (conv.agentAttribution == null && conv.agentId && !attr.signatureAgents.includes(conv.agentId)) {
    return { agentId: conv.agentId, agentAttribution: 'manual', suggestedAgentId: null }
  }
  if (attr.confirmed) return { agentId: attr.confirmed, agentAttribution: 'identity', suggestedAgentId: null }
  return { agentId: null, agentAttribution: null, suggestedAgentId: attr.suggested }
}
