// Deterministic seed data for AtendeRadar
// All data is fixed — no Math.random() used

// ─── Helpers ────────────────────────────────────────────────────────
const now = new Date()
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
function daysAgo(d: number): Date { return new Date(today.getTime() - d * 86400000) }
function hoursAgo(h: number): Date { return new Date(now.getTime() - h * 3600000) }
function daysFromNow(d: number): Date { return new Date(today.getTime() + d * 8640000) }
function dateStr(d: Date): string { return d.toISOString().split('T')[0] }
function iso(d: Date): string { return d.toISOString() }

// ─── Organization ───────────────────────────────────────────────────
export const org = {
  id: 'org_seed_1',
  name: 'OdontoVida Clinicas',
  displayName: 'OdontoVida',
  cnpj: '12.345.678/0001-90',
  segment: 'clinica_odontologica',
  timezone: 'America/Sao_Paulo',
  currency: 'BRL',
  status: 'active',
  phone: '(11) 99999-0001',
  adminEmail: 'contato@odontovida.com.br',
  website: 'https://odontovida.com.br',
}

// ─── WhatsApp Connections ───────────────────────────────────────────
export const connections = [
  { id: 'conn_seed_1', organizationId: org.id, name: 'Recepção Principal', provider: 'baileys', phoneNumber: '11987654321', phoneLast4: '4321', status: 'connected', statusReason: null, lastSeenAt: hoursAgo(0.5), lastEventAt: hoursAgo(0.5), lastSyncAt: hoursAgo(0.8), pairedAt: daysAgo(14), disabledAt: null },
  { id: 'conn_seed_2', organizationId: org.id, name: 'WhatsApp Marketing', provider: 'baileys', phoneNumber: '11976543210', phoneLast4: '3210', status: 'connected', statusReason: null, lastSeenAt: hoursAgo(1), lastEventAt: hoursAgo(1), lastSyncAt: hoursAgo(1.2), pairedAt: daysAgo(12), disabledAt: null },
  { id: 'conn_seed_3', organizationId: org.id, name: 'Unidade Centro', provider: 'baileys', phoneNumber: '11965432109', phoneLast4: '2109', status: 'disconnected', statusReason: 'Sessão expirada', lastSeenAt: hoursAgo(20), lastEventAt: hoursAgo(20), lastSyncAt: hoursAgo(21), pairedAt: daysAgo(26), disabledAt: null },
  { id: 'conn_seed_4', organizationId: org.id, name: 'Suporte Técnico', provider: 'baileys', phoneNumber: '11954321098', phoneLast4: '1098', status: 'syncing', statusReason: 'Sincronização em andamento', lastSeenAt: hoursAgo(2), lastEventAt: hoursAgo(2), lastSyncAt: hoursAgo(3), pairedAt: daysAgo(5), disabledAt: null },
  { id: 'conn_seed_5', organizationId: org.id, name: 'Agendamentos', provider: 'baileys', phoneNumber: '11943210987', phoneLast4: '0987', status: 'qr_required', statusReason: 'QR Code não escaneado', lastSeenAt: null, lastEventAt: hoursAgo(26), lastSyncAt: hoursAgo(27), pairedAt: null, disabledAt: null },
  { id: 'conn_seed_6', organizationId: org.id, name: 'Unidade Jardins', provider: 'baileys', phoneNumber: '11932109876', phoneLast4: '8765', status: 'degraded', statusReason: 'Latência elevada', lastSeenAt: hoursAgo(1.5), lastEventAt: hoursAgo(1.5), lastSyncAt: hoursAgo(1.8), pairedAt: daysAgo(31), disabledAt: null },
]

// ─── Agents ─────────────────────────────────────────────────────────
export const agents = [
  { id: 'agent_seed_1', organizationId: org.id, name: 'Ana Silva', email: 'ana@odontovida.com.br', role: 'gestor', team: 'Recepção', externalRef: 'ext_ana', status: 'active' },
  { id: 'agent_seed_2', organizationId: org.id, name: 'Carlos Mendes', email: 'carlos@odontovida.com.br', role: 'atendente', team: 'Recepção', externalRef: 'ext_carlos', status: 'active' },
  { id: 'agent_seed_3', organizationId: org.id, name: 'Juliana Costa', email: 'juliana@odontovida.com.br', role: 'atendente', team: 'Recepção', externalRef: 'ext_juliana', status: 'active' },
  { id: 'agent_seed_4', organizationId: org.id, name: 'Roberto Alves', email: 'roberto@odontovida.com.br', role: 'atendente', team: 'Marketing', externalRef: 'ext_roberto', status: 'active' },
  { id: 'agent_seed_5', organizationId: org.id, name: 'Fernanda Lima', email: 'fernanda@odontovida.com.br', role: 'supervisor', team: 'Recepção', externalRef: 'ext_fernanda', status: 'active' },
]

// ─── Contacts ───────────────────────────────────────────────────────
const customerData = [
  { name: 'Maria Santos', phone: '11991110001' },
  { name: 'João Oliveira', phone: '11992220002' },
  { name: 'Pedro Souza', phone: '11993330003' },
  { name: 'Camila Ferreira', phone: '11994440004' },
  { name: 'Lucas Rodrigues', phone: '11995550005' },
  { name: 'Beatriz Lima', phone: '11996660006' },
  { name: 'Gabriel Almeida', phone: '11997770007' },
  { name: 'Isabela Martins', phone: '11998880008' },
  { name: 'Rafael Costa', phone: '11999990009' },
  { name: 'Larissa Pereira', phone: '11981110010' },
  { name: 'Tiago Nascimento', phone: '11982220011' },
  { name: 'Amanda Ribeiro', phone: '11983330012' },
  { name: 'Bruno Cardoso', phone: '11984440013' },
  { name: 'Patricia Gomes', phone: '11985550014' },
  { name: 'Diego Araujo', phone: '11986660015' },
]

export const contacts = customerData.map((c, i) => ({
  id: `contact_seed_${i + 1}`,
  organizationId: org.id,
  connectionId: i < 10 ? connections[i % 2].id : null,
  displayName: c.name,
  phoneLast4: c.phone.slice(-4),
  phoneHash: `hash_${c.phone.slice(-4)}`,
  firstSeenAt: daysAgo(14 + (i % 7)),
  lastSeenAt: daysAgo(i % 3),
}))

// ─── Conversation configs (deterministic) ──────────────────────────
const convConfigs = [
  { status: 'waiting_company', stage: 'price', intent: 'preco', urgency: 'high', sentiment: 'neutral', score: 82, value: 1800, agent: 0, conn: 0, hasOpportunity: true, hasFinding: true, findingType: 'pending_quote', hours: 2 },
  { status: 'in_progress', stage: 'proposal', intent: 'agendamento', urgency: 'normal', sentiment: 'positive', score: 90, value: 2200, agent: 2, conn: 0, hasOpportunity: true, hasFinding: false, findingType: '', hours: 4 },
  { status: 'new', stage: 'discovery', intent: 'consulta', urgency: 'normal', sentiment: 'neutral', score: 65, value: 800, agent: 1, conn: 1, hasOpportunity: true, hasFinding: true, findingType: 'no_response', hours: 8 },
  { status: 'lost', stage: 'lost', intent: 'compra', urgency: 'normal', sentiment: 'frustrated', score: 30, value: 3500, agent: 3, conn: 1, hasOpportunity: true, hasFinding: true, findingType: 'abandoned_lead', hours: 48 },
  { status: 'waiting_customer', stage: 'evaluation', intent: 'disponibilidade', urgency: 'low', sentiment: 'neutral', score: 72, value: 600, agent: 2, conn: 0, hasOpportunity: true, hasFinding: false, findingType: '', hours: 12 },
  { status: 'in_progress', stage: 'negotiation', intent: 'negociacao', urgency: 'high', sentiment: 'anxious', score: 78, value: 2800, agent: 0, conn: 1, hasOpportunity: true, hasFinding: true, findingType: 'slow_response', hours: 6 },
  { status: 'won', stage: 'won', intent: 'agendamento', urgency: 'normal', sentiment: 'positive', score: 95, value: 1200, agent: 4, conn: 0, hasOpportunity: true, hasFinding: false, findingType: '', hours: 36 },
  { status: 'follow_up_due', stage: 'post_sale', intent: 'pos_venda', urgency: 'normal', sentiment: 'neutral', score: 68, value: 900, agent: 1, conn: 1, hasOpportunity: false, hasFinding: true, findingType: 'overdue_promise', hours: 24 },
  { status: 'closed', stage: 'lost', intent: 'cancelamento', urgency: 'normal', sentiment: 'frustrated', score: 25, value: 0, agent: 3, conn: 0, hasOpportunity: false, hasFinding: true, findingType: 'customer_frustrated', hours: 60 },
  { status: 'in_progress', stage: 'qualification', intent: 'preco', urgency: 'high', sentiment: 'confused', score: 75, value: 1600, agent: 2, conn: 0, hasOpportunity: true, hasFinding: true, findingType: 'ignored_question', hours: 1 },
  { status: 'waiting_company', stage: 'price', intent: 'preco', urgency: 'critical', sentiment: 'anxious', score: 55, value: 4200, agent: 1, conn: 1, hasOpportunity: true, hasFinding: true, findingType: 'no_response', hours: 3 },
  { status: 'in_progress', stage: 'evaluation', intent: 'consulta', urgency: 'normal', sentiment: 'positive', score: 85, value: 700, agent: 0, conn: 0, hasOpportunity: true, hasFinding: false, findingType: '', hours: 10 },
  { status: 'new', stage: 'discovery', intent: 'suporte', urgency: 'low', sentiment: 'neutral', score: 60, value: 0, agent: 4, conn: 1, hasOpportunity: false, hasFinding: false, findingType: '', hours: 16 },
  { status: 'in_progress', stage: 'qualification', intent: 'agendamento', urgency: 'normal', sentiment: 'neutral', score: 77, value: 1500, agent: 2, conn: 0, hasOpportunity: true, hasFinding: false, findingType: '', hours: 5 },
  { status: 'waiting_customer', stage: 'decision', intent: 'compra', urgency: 'high', sentiment: 'positive', score: 88, value: 3200, agent: 0, conn: 1, hasOpportunity: true, hasFinding: false, findingType: '', hours: 9 },
]

export const conversations = convConfigs.map((cfg, i) => ({
  id: `conv_seed_${i + 1}`,
  organizationId: org.id,
  connectionId: connections[cfg.conn].id,
  contactId: contacts[i].id,
  agentId: agents[cfg.agent].id,
  operationalStatus: cfg.status,
  inferredStage: cfg.stage,
  primaryIntent: cfg.intent,
  urgency: cfg.urgency,
  sentiment: cfg.sentiment,
  score: cfg.score,
  riskScore: cfg.urgency === 'critical' ? 95 : cfg.urgency === 'high' ? 70 : cfg.urgency === 'normal' ? 30 : 10,
  potentialValue: cfg.value,
  confidence: 0.65 + (i % 5) * 0.07,
  lastInboundAt: hoursAgo(cfg.hours - 1),
  lastOutboundAt: hoursAgo(cfg.hours - 2),
  waitingSince: cfg.status === 'waiting_company' ? hoursAgo(cfg.hours) : null,
  openedAt: hoursAgo(cfg.hours + 2),
  tags: i % 3 === 0 ? 'prioritario' : i % 5 === 0 ? 'vip,retorno' : '',
  // extra fields for seed logic
  _hasOpportunity: cfg.hasOpportunity,
  _hasFinding: cfg.hasFinding,
  _findingType: cfg.findingType,
  _agentIdx: cfg.agent,
  _hours: cfg.hours,
}))

// ─── Messages ───────────────────────────────────────────────────────
const messageTemplates = [
  { direction: 'inbound', text: 'Olá, boa tarde! Gostaria de saber o valor de um clareamento dental.' },
  { direction: 'outbound', text: 'Boa tarde! Que prazer receber seu contato. Nosso clareamento dental tem valores a partir de R$ 1.200,00. Posso agendar uma avaliação gratuita para você?' },
  { direction: 'inbound', text: 'Hmm, e quanto fica o tratamento completo com consulta e acompanhamento?' },
  { direction: 'inbound', text: 'Também queria saber se aceitam plano Unimed.' },
  { direction: 'outbound', text: 'O pacote completo com avaliação, clareamento e acompanhamento sai por R$ 1.800,00. Sobre o plano, aceitamos sim! Qual o melhor horário para sua avaliação?' },
  { direction: 'inbound', text: 'Pode ser sexta-feira às 14h?' },
  { direction: 'outbound', text: 'Perfeito! Vou verificar na agenda e te confirmo até amanhã, tudo bem?' },
  { direction: 'inbound', text: 'Ok, fico no aguardo. Obrigada!' },
  { direction: 'outbound', text: 'Confirmado! Sua avaliação está agendada para sexta às 14h. Traga seu cartão do plano. Nos vemos lá! 😊' },
  { direction: 'inbound', text: 'Oi, preciso cancelar minha consulta de amanhã. Tive um imprevisto.' },
  { direction: 'outbound', text: 'Entendo perfeitamente. Sem problemas! Posso remarcar para você. Qual seria um bom dia?' },
  { direction: 'inbound', text: 'Vocês fazem implante dentário? Qual o valor aproximado?' },
  { direction: 'outbound', text: 'Sim, realizamos implantes! O valor depende do caso, mas costuma variar entre R$ 3.000 e R$ 8.000 por implante. Recomendo uma avaliação presencial para um orçamento preciso.' },
  { direction: 'inbound', text: 'Tá, mas preciso saber mais ou menos pra decidir se vale a pena vim.' },
  { direction: 'outbound', text: 'Claro! Para um implante unitário com coroa, o valor médio é R$ 4.500. Temos condições de parcelamento em até 12x. Que tal agendar uma avaliação?' },
  { direction: 'inbound', text: 'Olá! Fiz um tratamento lá e estou com dor. Podem me atender hoje?' },
  { direction: 'outbound', text: 'Sinto muito pelo desconforto! Vou verificar nossa agenda de emergências agora mesmo. Um momento, por favor.' },
]

export function getMessagesForConversation(convIdx: number) {
  const seed = convIdx * 5
  const count = 4 + (seed % 5)
  const baseTime = hoursAgo(convConfigs[convIdx].hours + 1)
  const msgs: Array<{ id: string; conversationId: string; direction: string; senderType: string; messageType: string; text: string; occurredAt: Date; isAutomatic: boolean; deliveryStatus: string }> = []
  for (let i = 0; i < count; i++) {
    const tmpl = messageTemplates[(seed + i) % messageTemplates.length]
    msgs.push({
      id: `msg_seed_${convIdx + 1}_${i}`,
      conversationId: `conv_seed_${convIdx + 1}`,
      direction: tmpl.direction,
      senderType: tmpl.direction === 'inbound' ? 'customer' : 'agent',
      messageType: 'text',
      text: tmpl.text,
      occurredAt: new Date(baseTime.getTime() + i * 300000 + (i % 3) * 60000),
      isAutomatic: false,
      deliveryStatus: 'delivered',
    })
  }
  return msgs
}

// ─── Classifications ────────────────────────────────────────────────
export function getClassificationsForConversation(convIdx: number) {
  const conv = convConfigs[convIdx]
  const cls = []
  // Intent classification
  cls.push({
    id: `class_seed_${convIdx + 1}_intent`,
    conversationId: `conv_seed_${convIdx + 1}`,
    classificationType: 'intent',
    label: conv.intent,
    confidence: 0.7 + (convIdx % 4) * 0.07,
    evidenceMessageId: `msg_seed_${convIdx + 1}_0`,
    rationale: 'Cliente menciona explicitamente interesse em ' + conv.intent,
    source: 'ai',
    reviewedStatus: convIdx < 10 ? 'approved' : 'pending',
  })
  // Sentiment classification
  cls.push({
    id: `class_seed_${convIdx + 1}_sentiment`,
    conversationId: `conv_seed_${convIdx + 1}`,
    classificationType: 'sentiment',
    label: conv.sentiment,
    confidence: 0.6 + (convIdx % 5) * 0.06,
    evidenceMessageId: `msg_seed_${convIdx + 1}_${Math.min(2, 3 + (convIdx % 3))}`,
    rationale: 'Tom da mensagem indica sentimento ' + conv.sentiment,
    source: 'ai',
    reviewedStatus: convIdx < 8 ? 'approved' : 'pending',
  })
  return cls
}

// ─── Audit Findings ─────────────────────────────────────────────────
export function getFindingsForConversation(convIdx: number) {
  const conv = convConfigs[convIdx]
  if (!conv.hasFinding) return []
  return [{
    id: `finding_seed_${convIdx + 1}`,
    conversationId: `conv_seed_${convIdx + 1}`,
    type: conv.findingType,
    severity: conv.findingType === 'customer_frustrated' ? 'critical' : conv.findingType === 'abandoned_lead' ? 'high' : conv.findingType === 'no_response' ? 'high' : 'medium',
    status: convIdx < 5 ? 'acknowledged' : 'new',
    detectedAt: hoursAgo(conv.hours - 1),
    dueAt: hoursAgo(-(24 - conv.hours)),
    evidence: conv.findingType === 'no_response' ? 'Pergunta sobre preço feita sem retorno em tempo hábil.' : conv.findingType === 'customer_frustrated' ? 'Cliente expressa insatisfação com o atendimento.' : 'Padrão identificado pela análise automática.',
    confidence: 0.7 + (convIdx % 4) * 0.07,
    assignedTo: convIdx % 3 === 0 ? agents[conv.agent].name : null,
  falsePositive: false,
  }]
}

// ─── Revenue Opportunities ──────────────────────────────────────────
export function getOpportunitiesForConversation(convIdx: number) {
  const conv = convConfigs[convIdx]
  if (!conv.hasOpportunity) return []
  const baseTicket = conv.value
  const intentFactor = conv.intent === 'compra' ? 0.95 : conv.intent === 'preco' ? 0.8 : conv.intent === 'agendamento' ? 0.7 : 0.5
  const urgencyFactor = conv.urgency === 'critical' ? 0.95 : conv.urgency === 'high' ? 0.8 : 0.5
  const lossFactor = conv.sentiment === 'frustrated' ? 0.9 : conv.sentiment === 'anxious' ? 0.7 : 0.3
  const prob = conv.stage === 'won' ? 0.95 : conv.stage === 'decision' ? 0.75 : conv.stage === 'negotiation' ? 0.6 : 0.18
  return [{
    id: `opp_seed_${convIdx + 1}`,
    conversationId: `conv_seed_${convIdx + 1}`,
    status: conv.stage === 'won' ? 'won' : conv.stage === 'lost' ? 'lost' : 'active',
    intentFactor,
    urgencyFactor,
    lossFactor,
    baseTicket,
    ticketSource: 'segment_average',
    probability: prob,
    probabilitySource: 'ml_model',
    expectedValue: Math.round(baseTicket * prob),
    rangeLow: Math.round(baseTicket * prob * 0.6),
    rangeHigh: Math.round(baseTicket * prob * 1.4),
    confidence: 0.6 + (convIdx % 5) * 0.07,
    confirmedSaleValue: conv.stage === 'won' ? conv.value : null,
    confirmedRecovered: null,
  }]
}

// ─── Alerts (from findings) ─────────────────────────────────────────
export function getAlertsForConversation(convIdx: number) {
  const conv = convConfigs[convIdx]
  if (!conv.hasFinding) return []
  const severity = conv.findingType === 'customer_frustrated' ? 'critical' : conv.findingType === 'abandoned_lead' ? 'high' : conv.findingType === 'no_response' ? 'high' : 'medium'
  const titles: Record<string, string> = {
    no_response: 'Cliente sem resposta',
    slow_response: 'Resposta lenta',
    ignored_question: 'Pergunta ignorada',
    pending_quote: 'Orçamento pendente',
    overdue_promise: 'Promessa vencida',
    abandoned_lead: 'Lead abandonado',
    customer_frustrated: 'Cliente frustrado',
  }
  return [{
    id: `alert_seed_${convIdx + 1}`,
    organizationId: org.id,
    conversationId: `conv_seed_${convIdx + 1}`,
    findingId: `finding_seed_${convIdx + 1}`,
    ruleName: conv.findingType,
    severity,
    title: titles[conv.findingType] || 'Alerta detectado',
    description: `Detectado em conversa com ${customerData[convIdx].name}. Agente: ${agents[conv.agent].name}.`,
    customerName: customerData[convIdx].name,
    agentName: agents[conv.agent].name,
    status: convIdx < 3 ? 'acknowledged' : 'new',
    potentialValue: conv.value > 0 ? conv.value * 0.5 : null,
    confidence: 0.7 + (convIdx % 4) * 0.07,
  }]
}

// ─── Recovery Items ─────────────────────────────────────────────────
export function getRecoveryItems() {
  // Only for lost/abandoned/frustrated conversations with opportunity
  const recoveryConvIdxs = [3, 4, 8] // Lucas Rodrigues (lost), Beatriz Lima, Patricia Gomes
  return recoveryConvIdxs.map((convIdx, i) => {
    const conv = convConfigs[convIdx]
    return {
      id: `recovery_seed_${i + 1}`,
      organizationId: org.id,
      opportunityId: conv.hasOpportunity ? `opp_seed_${convIdx + 1}` : null,
      conversationId: `conv_seed_${convIdx + 1}`,
      agentId: agents[conv.agent].id,
      reason: conv.stage === 'lost' ? 'Lead perdido sem retorno' : conv.sentiment === 'frustrated' ? 'Cliente frustrado com atendimento' : 'Oportunidade abandonada',
      priorityScore: 0.4 + i * 0.2,
      assignedTo: i === 0 ? agents[2].name : null,
      dueAt: daysFromNow(2 + i),
      status: i === 0 ? 'assigned' : 'new',
      attempts: i === 0 ? 1 : 0,
      outcome: null,
      recoveredValue: null,
      customerName: customerData[convIdx].name,
      originalAgentName: agents[conv.agent].name,
    }
  })
}

// ─── Conversation Scores ────────────────────────────────────────────
export function getScoresForConversation(convIdx: number) {
  const conv = convConfigs[convIdx]
  const firstResponse = conv.hours < 5 ? 20 : conv.hours < 10 ? 15 : 8
  const continuity = conv.status === 'in_progress' || conv.status === 'won' ? 14 : 7
  const quality = conv.sentiment === 'positive' ? 18 : conv.sentiment === 'neutral' ? 12 : 5
  const closing = conv.stage === 'won' ? 20 : conv.stage === 'decision' ? 15 : conv.stage === 'lost' ? 0 : 5
  const total = firstResponse + continuity + quality + closing
  return [{
    id: `score_seed_${convIdx + 1}`,
    conversationId: `conv_seed_${convIdx + 1}`,
    version: 1,
    total,
    componentScores: JSON.stringify({ first_response: firstResponse, continuity, quality, closing }),
    eligibility: conv.stage !== 'discovery' || conv.hours > 2,
  }]
}

// ─── Open Questions ─────────────────────────────────────────────────
export function getOpenQuestions() {
  return [
    { id: 'oq_seed_1', conversationId: 'conv_seed_1', sourceMessage: 'Também queria saber se aceitam plano Unimed.', normalizedQuestion: 'Aceitam plano Unimed?', askedAt: hoursAgo(1.5), dueAt: hoursAgo(-1), answeredByMessage: 'msg_seed_1_4', status: 'answered', confidence: 0.92 },
    { id: 'oq_seed_2', conversationId: 'conv_seed_3', sourceMessage: 'Quanto custa uma limpeza completa?', normalizedQuestion: 'Preço de limpeza dental completa', askedAt: hoursAgo(7), dueAt: hoursAgo(3), answeredByMessage: null, status: 'open', confidence: 0.88 },
    { id: 'oq_seed_3', conversationId: 'conv_seed_6', sourceMessage: 'Vocês têm parcelamento no cartão?', normalizedQuestion: 'Aceita parcelamento no cartão?', askedAt: hoursAgo(5), dueAt: hoursAgo(1), answeredByMessage: null, status: 'open', confidence: 0.85 },
    { id: 'oq_seed_4', conversationId: 'conv_seed_10', sourceMessage: 'O implante usa que material? É seguro?', normalizedQuestion: 'Material do implante e segurança', askedAt: hoursAgo(0.5), dueAt: hoursAgo(-3), answeredByMessage: null, status: 'open', confidence: 0.91 },
    { id: 'oq_seed_5', conversationId: 'conv_seed_15', sourceMessage: 'Se eu fechar hoje, tem desconto?', normalizedQuestion: 'Desconto para fechamento imediato', askedAt: hoursAgo(8), dueAt: hoursAgo(4), answeredByMessage: null, status: 'cancelled', confidence: 0.78 },
  ]
}

// ─── Promises ───────────────────────────────────────────────────────
export function getPromises() {
  return [
    { id: 'promise_seed_1', conversationId: 'conv_seed_1', sourceMessage: 'Vou verificar na agenda e te confirmo até amanhã', promisorAgent: 'Ana Silva', action: 'Confirmar horário da avaliação', dueAt: daysFromNow(0), duePrecision: 'day', status: 'kept', completionMessage: 'msg_seed_1_8', confidence: 0.95 },
    { id: 'promise_seed_2', conversationId: 'conv_seed_2', sourceMessage: 'Vou enviar o orçamento detalhado ainda hoje', promisorAgent: 'Juliana Costa', action: 'Enviar orçamento detalhado', dueAt: hoursAgo(-6), duePrecision: 'day', status: 'overdue', completionMessage: null, confidence: 0.90 },
    { id: 'promise_seed_3', conversationId: 'conv_seed_5', sourceMessage: 'Vou checar com a coordenadora e retorno até sexta', promisorAgent: 'Juliana Costa', action: 'Verificar disponibilidade com coordenadora', dueAt: daysFromNow(2), duePrecision: 'day', status: 'open', completionMessage: null, confidence: 0.87 },
    { id: 'promise_seed_4', conversationId: 'conv_seed_8', sourceMessage: 'Vou verificar o status do seu seguro e te aviso', promisorAgent: 'Carlos Mendes', action: 'Verificar status do seguro dental', dueAt: hoursAgo(-12), duePrecision: 'hour', status: 'overdue', completionMessage: null, confidence: 0.82 },
    { id: 'promise_seed_5', conversationId: 'conv_seed_15', sourceMessage: 'Vou preparar uma proposta especial e enviar hoje', promisorAgent: 'Ana Silva', action: 'Enviar proposta especial', dueAt: daysFromNow(1), duePrecision: 'day', status: 'approaching', completionMessage: null, confidence: 0.89 },
  ]
}

// ─── Report Definitions ─────────────────────────────────────────────
export const reportDefinitions = [
  { id: 'rdef_seed_1', organizationId: org.id, reportType: 'daily', name: 'Relatório Diário', description: 'Resumo executivo do dia com métricas e prioridades.', schedule: '18:00', timezone: 'America/Sao_Paulo', daysOfWeek: '[1,2,3,4,5]', recipients: JSON.stringify(['contato@odontovida.com.br']), channels: JSON.stringify(['email']), sendEmpty: false, lastRunAt: hoursAgo(2) },
  { id: 'rdef_seed_2', organizationId: org.id, reportType: 'weekly', name: 'Relatório Semanal', description: 'Evolução versus semana anterior com recomendações.', schedule: '09:00', timezone: 'America/Sao_Paulo', daysOfWeek: '[1]', recipients: JSON.stringify(['contato@odontovida.com.br', 'ana@odontovida.com.br']), channels: JSON.stringify(['email']), sendEmpty: false, lastRunAt: daysAgo(2) },
  { id: 'rdef_seed_3', organizationId: org.id, reportType: 'agent', name: 'Relatório por Equipe', description: 'Desempenho individual com pontos fortes e falhas.', schedule: '17:00', timezone: 'America/Sao_Paulo', daysOfWeek: '[5]', recipients: JSON.stringify(['ana@odontovida.com.br']), channels: JSON.stringify(['email']), sendEmpty: false, lastRunAt: daysAgo(5) },
  { id: 'rdef_seed_4', organizationId: org.id, reportType: 'lost_opportunities', name: 'Oportunidades Perdidas', description: 'Leads perdidos com causa raiz e valor estimado.', schedule: '10:00', timezone: 'America/Sao_Paulo', daysOfWeek: '[1]', recipients: JSON.stringify(['contato@odontovida.com.br']), channels: JSON.stringify(['email']), sendEmpty: false, lastRunAt: daysAgo(2) },
  { id: 'rdef_seed_5', organizationId: org.id, reportType: 'promises', name: 'Relatório de Promessas', description: 'Promessas feitas, cumpridas e vencidas por atendente.', schedule: '17:00', timezone: 'America/Sao_Paulo', daysOfWeek: '[1,2,3,4,5]', recipients: JSON.stringify(['ana@odontovida.com.br', 'contato@odontovida.com.br']), channels: JSON.stringify(['email', 'in_app']), sendEmpty: false, lastRunAt: hoursAgo(3) },
  { id: 'rdef_seed_6', organizationId: org.id, reportType: 'recovery', name: 'Relatório de Recuperação', description: 'Itens criados, trabalhados e receita recuperada.', schedule: '09:00', timezone: 'America/Sao_Paulo', daysOfWeek: '[1]', recipients: JSON.stringify(['contato@odontovida.com.br']), channels: JSON.stringify(['email']), sendEmpty: false, lastRunAt: daysAgo(2) },
  { id: 'rdef_seed_7', organizationId: org.id, reportType: 'data_quality', name: 'Qualidade dos Dados', description: 'Cobertura de campos, classificações e confiança da IA.', schedule: '08:00', timezone: 'America/Sao_Paulo', daysOfWeek: '[1]', recipients: JSON.stringify(['contato@odontovida.com.br']), channels: JSON.stringify(['email']), sendEmpty: true, lastRunAt: daysAgo(14) },
  { id: 'rdef_seed_8', organizationId: org.id, reportType: 'connections', name: 'Relatório de Conexões', description: 'Status das conexões, uptime e volume de mensagens.', schedule: '06:00', timezone: 'America/Sao_Paulo', daysOfWeek: '[1,2,3,4,5]', recipients: JSON.stringify(['contato@odontovida.com.br']), channels: JSON.stringify(['email']), sendEmpty: false, lastRunAt: hoursAgo(10) },
]

// ─── Report Runs ────────────────────────────────────────────────────
export const reportRuns = [
  { id: 'rrun_seed_1', organizationId: org.id, reportType: 'daily', status: 'completed', periodStart: daysAgo(0), periodEnd: daysAgo(0), recipientEmails: JSON.stringify(['contato@odontovida.com.br']), filePath: '/reports/daily_2025-01-15.pdf' },
  { id: 'rrun_seed_2', organizationId: org.id, reportType: 'weekly', status: 'completed', periodStart: daysAgo(7), periodEnd: daysAgo(1), recipientEmails: JSON.stringify(['contato@odontovida.com.br', 'ana@odontovida.com.br']), filePath: '/reports/weekly_2025-01-13.pdf' },
  { id: 'rrun_seed_3', organizationId: org.id, reportType: 'daily', status: 'completed', periodStart: daysAgo(1), periodEnd: daysAgo(1), recipientEmails: JSON.stringify(['contato@odontovida.com.br']), filePath: '/reports/daily_2025-01-14.pdf' },
  { id: 'rrun_seed_4', organizationId: org.id, reportType: 'promises', status: 'processing', periodStart: daysAgo(0), periodEnd: daysAgo(0), recipientEmails: JSON.stringify(['ana@odontovida.com.br']), filePath: null },
  { id: 'rrun_seed_5', organizationId: org.id, reportType: 'agent', status: 'completed', periodStart: daysAgo(7), periodEnd: daysAgo(1), recipientEmails: JSON.stringify(['ana@odontovida.com.br']), filePath: '/reports/agent_2025-01-10.pdf' },
  { id: 'rrun_seed_6', organizationId: org.id, reportType: 'lost_opportunities', status: 'completed', periodStart: daysAgo(7), periodEnd: daysAgo(1), recipientEmails: JSON.stringify(['contato@odontovida.com.br']), filePath: '/reports/lost_opp_2025-01-13.pdf' },
  { id: 'rrun_seed_7', organizationId: org.id, reportType: 'connections', status: 'failed', periodStart: daysAgo(0), periodEnd: daysAgo(0), recipientEmails: JSON.stringify(['contato@odontovida.com.br']), filePath: null },
  { id: 'rrun_seed_8', organizationId: org.id, reportType: 'recovery', status: 'completed', periodStart: daysAgo(7), periodEnd: daysAgo(1), recipientEmails: JSON.stringify(['contato@odontovida.com.br']), filePath: '/reports/recovery_2025-01-13.pdf' },
  { id: 'rrun_seed_9', organizationId: org.id, reportType: 'daily', status: 'completed', periodStart: daysAgo(2), periodEnd: daysAgo(2), recipientEmails: JSON.stringify(['contato@odontovida.com.br']), filePath: '/reports/daily_2025-01-13.pdf' },
  { id: 'rrun_seed_10', organizationId: org.id, reportType: 'data_quality', status: 'pending', periodStart: daysAgo(30), periodEnd: daysAgo(1), recipientEmails: JSON.stringify(['contato@odontovida.com.br']), filePath: null },
]

// ─── Alert Rules ────────────────────────────────────────────────────
export const alertRules = [
  { id: 'arule_seed_1', organizationId: org.id, name: 'Cliente sem primeira resposta', type: 'no_response', active: true, severity: 'critical', scopeConnections: '[]', scopeTeams: '[]', daysAndHours: '{}', limitMinutes: 10, notificationChannels: JSON.stringify(['in_app', 'email']), recipients: JSON.stringify(['contato@odontovida.com.br']), cooldownMinutes: 30, autoCloseMinutes: null, exceptions: '[]', minConfidence: 0.5 },
  { id: 'arule_seed_2', organizationId: org.id, name: 'Cliente sem resposta após interação', type: 'no_response_followup', active: true, severity: 'high', scopeConnections: '[]', scopeTeams: '[]', daysAndHours: '{}', limitMinutes: 30, notificationChannels: JSON.stringify(['in_app']), recipients: JSON.stringify([]), cooldownMinutes: 20, autoCloseMinutes: null, exceptions: '[]', minConfidence: 0.6 },
  { id: 'arule_seed_3', organizationId: org.id, name: 'Pedido de preço sem retorno', type: 'pending_quote', active: true, severity: 'high', scopeConnections: '[]', scopeTeams: '[]', daysAndHours: '{}', limitMinutes: 15, notificationChannels: JSON.stringify(['in_app', 'email']), recipients: JSON.stringify(['contato@odontovida.com.br']), cooldownMinutes: 15, autoCloseMinutes: 120, exceptions: '[]', minConfidence: 0.5 },
  { id: 'arule_seed_4', organizationId: org.id, name: 'Intenção alta sem resposta', type: 'high_intent_no_reply', active: true, severity: 'critical', scopeConnections: '[]', scopeTeams: '[]', daysAndHours: '{}', limitMinutes: 5, notificationChannels: JSON.stringify(['in_app', 'email']), recipients: JSON.stringify(['contato@odontovida.com.br', 'ana@odontovida.com.br']), cooldownMinutes: 10, autoCloseMinutes: null, exceptions: '[]', minConfidence: 0.7 },
  { id: 'arule_seed_5', organizationId: org.id, name: 'Promessa próxima do vencimento', type: 'promise_approaching', active: true, severity: 'medium', scopeConnections: '[]', scopeTeams: '[]', daysAndHours: '{}', limitMinutes: 120, notificationChannels: JSON.stringify(['in_app']), recipients: JSON.stringify([]), cooldownMinutes: 60, autoCloseMinutes: null, exceptions: '[]', minConfidence: 0.5 },
  { id: 'arule_seed_6', organizationId: org.id, name: 'Promessa vencida', type: 'promise_overdue', active: true, severity: 'critical', scopeConnections: '[]', scopeTeams: '[]', daysAndHours: '{}', limitMinutes: 0, notificationChannels: JSON.stringify(['in_app', 'email']), recipients: JSON.stringify(['contato@odontovida.com.br']), cooldownMinutes: 30, autoCloseMinutes: 1440, exceptions: '[]', minConfidence: 0.5 },
  { id: 'arule_seed_7', organizationId: org.id, name: 'Cliente irritado', type: 'customer_frustrated', active: true, severity: 'high', scopeConnections: '[]', scopeTeams: '[]', daysAndHours: '{}', limitMinutes: 5, notificationChannels: JSON.stringify(['in_app', 'email']), recipients: JSON.stringify(['ana@odontovida.com.br']), cooldownMinutes: 20, autoCloseMinutes: null, exceptions: '[]', minConfidence: 0.6 },
  { id: 'arule_seed_8', organizationId: org.id, name: 'Conexão desconectada', type: 'connection_down', active: true, severity: 'critical', scopeConnections: '[]', scopeTeams: '[]', daysAndHours: '{}', limitMinutes: 0, notificationChannels: JSON.stringify(['in_app', 'email']), recipients: JSON.stringify(['contato@odontovida.com.br']), cooldownMinutes: 5, autoCloseMinutes: 60, exceptions: '[]', minConfidence: 0.9 },
]

// ─── Daily Metrics (14 days) ───────────────────────────────────────
export function getDailyMetrics() {
  const base = [
    { started: 8, waiting: 2, mfr: 6.2, opps: 3, atRisk: 1, overdue: 0, var: 850, score: 68, recv: 45, sent: 52 },
    { started: 10, waiting: 3, mfr: 5.8, opps: 4, atRisk: 1, overdue: 1, var: 1200, score: 71, recv: 58, sent: 63 },
    { started: 9, waiting: 1, mfr: 4.5, opps: 3, atRisk: 0, overdue: 0, var: 400, score: 74, recv: 42, sent: 48 },
    { started: 12, waiting: 4, mfr: 7.1, opps: 5, atRisk: 2, overdue: 1, var: 2100, score: 65, recv: 68, sent: 72 },
    { started: 11, waiting: 2, mfr: 5.0, opps: 4, atRisk: 1, overdue: 0, var: 900, score: 73, recv: 55, sent: 60 },
    { started: 14, waiting: 5, mfr: 8.3, opps: 6, atRisk: 3, overdue: 2, var: 3800, score: 58, recv: 78, sent: 82 },
    { started: 9, waiting: 1, mfr: 3.8, opps: 2, atRisk: 0, overdue: 0, var: 300, score: 82, recv: 40, sent: 45 },
    { started: 13, waiting: 3, mfr: 5.5, opps: 5, atRisk: 2, overdue: 1, var: 1800, score: 70, recv: 72, sent: 78 },
    { started: 10, waiting: 2, mfr: 4.9, opps: 3, atRisk: 1, overdue: 0, var: 700, score: 75, recv: 50, sent: 56 },
    { started: 15, waiting: 6, mfr: 9.1, opps: 7, atRisk: 4, overdue: 2, var: 5200, score: 52, recv: 85, sent: 90 },
    { started: 11, waiting: 2, mfr: 5.2, opps: 4, atRisk: 1, overdue: 1, var: 1100, score: 72, recv: 60, sent: 65 },
    { started: 12, waiting: 3, mfr: 6.0, opps: 4, atRisk: 2, overdue: 0, var: 1500, score: 69, recv: 65, sent: 70 },
    { started: 13, waiting: 4, mfr: 5.6, opps: 5, atRisk: 2, overdue: 1, var: 2000, score: 67, recv: 70, sent: 76 },
    { started: 11, waiting: 3, mfr: 5.4, opps: 4, atRisk: 1, overdue: 1, var: 1400, score: 71, recv: 62, sent: 68 },
  ]
  return base.map((d, i) => ({
    id: `dmetric_seed_${i + 1}`,
    organizationId: org.id,
    date: dateStr(daysAgo(13 - i)),
    connectionId: null,
    teamId: null,
    conversationsStarted: d.started,
    customersWaiting: d.waiting,
    medianFirstResponse: d.mfr,
    opportunitiesDetected: d.opps,
    opportunitiesAtRisk: d.atRisk,
    overduePromises: d.overdue,
    potentialValueAtRisk: d.var,
    overallScore: d.score,
    messagesReceived: d.recv,
    messagesSent: d.sent,
  }))
}

// ─── Agent Metrics (5 agents × 14 days) ─────────────────────────────
const agentMetricBase: Record<string, { convs: number; art: number; score: number; oppH: number; oppL: number; pK: number; pT: number; qA: number; qT: number }> = {
  agent_seed_1: { convs: 9, art: 4.2, score: 82, oppH: 6, oppL: 1, pK: 2, pT: 2, qA: 5, qT: 5 },
  agent_seed_2: { convs: 8, art: 6.8, score: 74, oppH: 4, oppL: 2, pK: 1, pT: 3, qA: 3, qT: 4 },
  agent_seed_3: { convs: 10, art: 3.1, score: 88, oppH: 7, oppL: 0, pK: 3, pT: 3, qA: 6, qT: 6 },
  agent_seed_4: { convs: 6, art: 8.5, score: 65, oppH: 3, oppL: 2, pK: 1, pT: 2, qA: 2, qT: 3 },
  agent_seed_5: { convs: 8, art: 5.0, score: 79, oppH: 5, oppL: 1, pK: 2, pT: 2, qA: 4, qT: 4 },
}

export function getAgentMetrics() {
  const metrics: Array<{ id: string; organizationId: string; agentId: string; date: string; conversations: number; avgResponseTime: number; score: number; opportunitiesHandled: number; opportunitiesLost: number; promisesKept: number; promisesTotal: number; questionsAnswered: number; questionsTotal: number }> = []
  let counter = 0
  for (const agentId of Object.keys(agentMetricBase)) {
    const base = agentMetricBase[agentId]
    for (let day = 13; day >= 0; day--) {
      const dayFactor = day === 0 ? 0.9 : day < 4 ? 1.0 : day < 8 ? 0.95 : 0.85
      counter++
      metrics.push({
        id: `ametric_seed_${counter}`,
        organizationId: org.id,
        agentId,
        date: dateStr(daysAgo(day)),
        conversations: Math.round(base.convs * dayFactor),
        avgResponseTime: +(base.art * (0.8 + (day % 5) * 0.1)).toFixed(1),
        score: Math.round(base.score * dayFactor),
        opportunitiesHandled: Math.round(base.oppH * dayFactor),
        opportunitiesLost: Math.round(base.oppL * dayFactor),
        promisesKept: Math.round(base.pK * dayFactor),
        promisesTotal: base.pT,
        questionsAnswered: Math.round(base.qA * dayFactor),
        questionsTotal: base.qT,
      })
    }
  }
  return metrics
}

// ─── Organization Members ───────────────────────────────────────────
export const orgMembers = [
  { id: 'member_seed_1', organizationId: org.id, userId: 'usr_contato', name: 'Dr. Ricardo Mendes', email: 'contato@odontovida.com.br', role: 'admin', team: null, status: 'active', lastAccessAt: hoursAgo(1), mfaEnabled: true, invitedAt: daysAgo(60), invitedBy: null },
  { id: 'member_seed_2', organizationId: org.id, userId: 'usr_ana', name: 'Ana Silva', email: 'ana@odontovida.com.br', role: 'gestor', team: 'Recepção', status: 'active', lastAccessAt: hoursAgo(0.5), mfaEnabled: false, invitedAt: daysAgo(45), invitedBy: 'usr_contato' },
  { id: 'member_seed_3', organizationId: org.id, userId: 'usr_carlos', name: 'Carlos Mendes', email: 'carlos@odontovida.com.br', role: 'member', team: 'Recepção', status: 'active', lastAccessAt: hoursAgo(3), mfaEnabled: false, invitedAt: daysAgo(30), invitedBy: 'usr_ana' },
  { id: 'member_seed_4', organizationId: org.id, userId: 'usr_juliana', name: 'Juliana Costa', email: 'juliana@odontovida.com.br', role: 'member', team: 'Recepção', status: 'active', lastAccessAt: hoursAgo(2), mfaEnabled: true, invitedAt: daysAgo(30), invitedBy: 'usr_ana' },
  { id: 'member_seed_5', organizationId: org.id, userId: 'usr_fernanda', name: 'Fernanda Lima', email: 'fernanda@odontovida.com.br', role: 'supervisor', team: 'Recepção', status: 'active', lastAccessAt: hoursAgo(6), mfaEnabled: false, invitedAt: daysAgo(20), invitedBy: 'usr_contato' },
]

// ─── Teams ──────────────────────────────────────────────────────────
export const teams = [
  { id: 'team_seed_1', organizationId: org.id, name: 'Recepção', code: 'RECEPCAO', unitId: 'unit_centro', supervisorId: 'agent_seed_5', connectionIds: JSON.stringify(['conn_seed_1', 'conn_seed_4', 'conn_seed_5']), slaConfig: JSON.stringify({ firstResponseMinutes: 10, maxResponseMinutes: 30, resolutionHours: 24 }), goals: JSON.stringify({ dailyConversations: 15, minScore: 75, maxOverduePromises: 1 }), active: true },
  { id: 'team_seed_2', organizationId: org.id, name: 'Marketing', code: 'MARKETING', unitId: 'unit_jardins', supervisorId: null, connectionIds: JSON.stringify(['conn_seed_2', 'conn_seed_6']), slaConfig: JSON.stringify({ firstResponseMinutes: 15, maxResponseMinutes: 60, resolutionHours: 48 }), goals: JSON.stringify({ dailyConversations: 10, minScore: 70, maxOverduePromises: 2 }), active: true },
]

// ─── Plans ──────────────────────────────────────────────────────────
export const plans = [
  { id: 'plan_seed_1', code: 'essencial', name: 'Essencial', description: 'Para clínicas que estão começando a monitorar atendimento via WhatsApp.', monthlyPrice: 149, annualPrice: 1490, stripePriceIds: JSON.stringify({ monthly: 'price_monthly_essencial', annual: 'price_annual_essencial' }), currency: 'BRL', trialDays: 7, maxConnections: 1, maxAgents: 3, maxConversationsMonthly: 300, maxMessagesMonthly: 2000, maxAudioMinutes: 0, retentionDays: 30, maxExports: 5, maxAlertRules: 5, features: JSON.stringify({ basic_dashboard: true, conversation_audit: true, daily_report: true, alert_rules: true, team_management: false, advanced_dashboard: false, custom_reports: false, api_access: false }), active: true, sortOrder: 1, highlight: false },
  { id: 'plan_seed_2', code: 'gestao', name: 'Gestão', description: 'Para clínicas que querem controle total do atendimento e métricas avançadas.', monthlyPrice: 299, annualPrice: 2990, stripePriceIds: JSON.stringify({ monthly: 'price_monthly_gestao', annual: 'price_annual_gestao' }), currency: 'BRL', trialDays: 14, maxConnections: 3, maxAgents: 10, maxConversationsMonthly: 1000, maxMessagesMonthly: 10000, maxAudioMinutes: 120, retentionDays: 90, maxExports: 20, maxAlertRules: 20, features: JSON.stringify({ basic_dashboard: true, conversation_audit: true, daily_report: true, alert_rules: true, team_management: true, advanced_dashboard: true, custom_reports: false, api_access: false }), active: true, sortOrder: 2, highlight: true },
  { id: 'plan_seed_3', code: 'performance', name: 'Performance', description: 'Para clínicas e redes que exigem o máximo em inteligência de atendimento.', monthlyPrice: 599, annualPrice: 5990, stripePriceIds: JSON.stringify({ monthly: 'price_monthly_performance', annual: 'price_annual_performance' }), currency: 'BRL', trialDays: 14, maxConnections: 10, maxAgents: 50, maxConversationsMonthly: 5000, maxMessagesMonthly: 50000, maxAudioMinutes: 600, retentionDays: 365, maxExports: 100, maxAlertRules: 100, features: JSON.stringify({ basic_dashboard: true, conversation_audit: true, daily_report: true, alert_rules: true, team_management: true, advanced_dashboard: true, custom_reports: true, api_access: true }), active: true, sortOrder: 3, highlight: false },
]

// ─── Subscription ───────────────────────────────────────────────────
export const subscription = {
  id: 'sub_seed_1',
  organizationId: org.id,
  planId: 'plan_seed_2',
  stripeCustomerId: 'cus_mock_odontovida',
  stripeSubscriptionId: 'sub_mock_odontovida',
  status: 'active',
  currentPeriodStart: daysAgo(10),
  currentPeriodEnd: daysFromNow(20),
  trialEnd: daysAgo(5),
  cancelAtPeriodEnd: false,
}

// ─── Connection Session Events ──────────────────────────────────────
export const connectionSessionEvents = [
  { id: 'cse_seed_1', connectionId: 'conn_seed_1', eventType: 'connected', previousStatus: 'syncing', newStatus: 'connected', reasonCode: null, sanitizedDetails: 'Conexão estabelecida com sucesso', occurredAt: daysAgo(14) },
  { id: 'cse_seed_2', connectionId: 'conn_seed_2', eventType: 'connected', previousStatus: 'syncing', newStatus: 'connected', reasonCode: null, sanitizedDetails: 'Conexão estabelecida com sucesso', occurredAt: daysAgo(12) },
  { id: 'cse_seed_3', connectionId: 'conn_seed_3', eventType: 'disconnected', previousStatus: 'connected', newStatus: 'disconnected', reasonCode: 'SESSION_EXPIRED', sanitizedDetails: 'Sessão expirada após período de inatividade', occurredAt: hoursAgo(20) },
  { id: 'cse_seed_4', connectionId: 'conn_seed_4', eventType: 'syncing', previousStatus: 'connected', newStatus: 'syncing', reasonCode: 'RECONNECT', sanitizedDetails: 'Reconexão iniciada após falha temporária', occurredAt: hoursAgo(3) },
  { id: 'cse_seed_5', connectionId: 'conn_seed_5', eventType: 'qr_required', previousStatus: 'pending', newStatus: 'qr_required', reasonCode: 'QR_NOT_SCANNED', sanitizedDetails: 'QR Code gerado aguardando escaneamento', occurredAt: hoursAgo(26) },
  { id: 'cse_seed_6', connectionId: 'conn_seed_6', eventType: 'degraded', previousStatus: 'connected', newStatus: 'degraded', reasonCode: 'HIGH_LATENCY', sanitizedDetails: 'Latência média de 2.8s detectada', occurredAt: hoursAgo(1.5) },
]

// ─── Raw Channel Events ─────────────────────────────────────────────
export const rawChannelEvents = [
  { id: 'rce_seed_1', connectionId: 'conn_seed_1', eventId: 'evt_001', idempotencyKey: 'idem_001', schemaVersion: '1.0', eventType: 'message.inbound', payload: JSON.stringify({ from: '11991110001', text: 'Olá, boa tarde!' }), occurredAt: hoursAgo(2), receivedAt: hoursAgo(2), processingStatus: 'processed', errorCode: null, attempts: 1 },
  { id: 'rce_seed_2', connectionId: 'conn_seed_1', eventId: 'evt_002', idempotencyKey: 'idem_002', schemaVersion: '1.0', eventType: 'message.outbound', payload: JSON.stringify({ to: '11991110001', text: 'Boa tarde!' }), occurredAt: hoursAgo(1.9), receivedAt: hoursAgo(1.9), processingStatus: 'processed', errorCode: null, attempts: 1 },
  { id: 'rce_seed_3', connectionId: 'conn_seed_2', eventId: 'evt_003', idempotencyKey: 'idem_003', schemaVersion: '1.0', eventType: 'connection.status', payload: JSON.stringify({ status: 'connected' }), occurredAt: hoursAgo(5), receivedAt: hoursAgo(5), processingStatus: 'processed', errorCode: null, attempts: 1 },
  { id: 'rce_seed_4', connectionId: 'conn_seed_3', eventId: 'evt_004', idempotencyKey: 'idem_004', schemaVersion: '1.0', eventType: 'connection.status', payload: JSON.stringify({ status: 'disconnected', reason: 'SESSION_EXPIRED' }), occurredAt: hoursAgo(20), receivedAt: hoursAgo(20), processingStatus: 'failed', errorCode: 'SESSION_EXPIRED', attempts: 3 },
  { id: 'rce_seed_5', connectionId: 'conn_seed_1', eventId: 'evt_005', idempotencyKey: 'idem_005', schemaVersion: '1.0', eventType: 'message.inbound', payload: JSON.stringify({ from: '11992220002', text: 'Preciso agendar' }), occurredAt: hoursAgo(8), receivedAt: hoursAgo(8), processingStatus: 'processed', errorCode: null, attempts: 1 },
]

// ─── Agent Identities ───────────────────────────────────────────────
export const agentIdentities = [
  { id: 'aid_seed_1', agentId: 'agent_seed_1', displayName: 'Ana Silva', externalRef: 'ext_ana', connectionId: 'conn_seed_1', team: 'Recepção', associationStatus: 'confirmed', confidence: 0.98, validFrom: daysAgo(45), validTo: null, confirmedBy: 'usr_contato' },
  { id: 'aid_seed_2', agentId: 'agent_seed_2', displayName: 'Carlos Mendes', externalRef: 'ext_carlos', connectionId: 'conn_seed_1', team: 'Recepção', associationStatus: 'confirmed', confidence: 0.95, validFrom: daysAgo(30), validTo: null, confirmedBy: 'usr_ana' },
  { id: 'aid_seed_3', agentId: 'agent_seed_3', displayName: 'Juliana Costa', externalRef: 'ext_juliana', connectionId: 'conn_seed_1', team: 'Recepção', associationStatus: 'confirmed', confidence: 0.97, validFrom: daysAgo(30), validTo: null, confirmedBy: 'usr_ana' },
  { id: 'aid_seed_4', agentId: 'agent_seed_4', displayName: 'Roberto Alves', externalRef: 'ext_roberto', connectionId: 'conn_seed_2', team: 'Marketing', associationStatus: 'confirmed', confidence: 0.92, validFrom: daysAgo(25), validTo: null, confirmedBy: 'usr_contato' },
  { id: 'aid_seed_5', agentId: 'agent_seed_5', displayName: 'Fernanda Lima', externalRef: 'ext_fernanda', connectionId: 'conn_seed_1', team: 'Recepção', associationStatus: 'confirmed', confidence: 0.96, validFrom: daysAgo(20), validTo: null, confirmedBy: 'usr_contato' },
]

// ─── Classification Feedbacks ───────────────────────────────────────
export const classificationFeedbacks = [
  { id: 'cfb_seed_1', organizationId: org.id, targetId: 'class_seed_3_intent', targetType: 'conversation_classification', previousValue: 'suporte', correctedValue: 'consulta', justification: 'Cliente menciona consulta, não suporte técnico', userId: 'usr_ana', appliedToMetrics: true },
  { id: 'cfb_seed_2', organizationId: org.id, targetId: 'finding_seed_4', targetType: 'finding', previousValue: 'slow_response', correctedValue: 'no_response', justification: 'Não houve resposta, não foi lenta', userId: 'usr_ana', appliedToMetrics: true },
  { id: 'cfb_seed_3', organizationId: org.id, targetId: 'class_seed_7_sentiment', targetType: 'conversation_classification', previousValue: 'neutral', correctedValue: 'positive', justification: 'Cliente demonstra satisfação com o agendamento', userId: 'usr_fernanda', appliedToMetrics: false },
]

// ─── Notifications ──────────────────────────────────────────────────
export const notifications = [
  { id: 'notif_seed_1', organizationId: org.id, userId: 'usr_ana', type: 'alert', title: 'Cliente sem resposta', message: 'Maria Santos aguarda há 10 min sem retorno na conexão Recepção Principal.', data: JSON.stringify({ conversationId: 'conv_seed_1', alertId: 'alert_seed_1' }), read: true },
  { id: 'notif_seed_2', organizationId: org.id, userId: 'usr_contato', type: 'alert', title: 'Conexão desconectada', message: 'Unidade Centro perdeu conexão há 20 minutos.', data: JSON.stringify({ connectionId: 'conn_seed_3' }), read: true },
  { id: 'notif_seed_3', organizationId: org.id, userId: 'usr_ana', type: 'promise_overdue', title: 'Promessa vencida', message: 'Juliana Costa prometeu enviar orçamento e o prazo expirou.', data: JSON.stringify({ conversationId: 'conv_seed_2', promiseId: 'promise_seed_2' }), read: false },
  { id: 'notif_seed_4', organizationId: org.id, userId: 'usr_contato', type: 'report_ready', title: 'Relatório Diário disponível', message: 'O relatório diário de hoje está pronto para visualização.', data: JSON.stringify({ reportRunId: 'rrun_seed_1' }), read: true },
  { id: 'notif_seed_5', organizationId: org.id, userId: null, type: 'system', title: 'Novo membro na equipe', message: 'Fernanda Lima foi adicionada como supervisor da equipe Recepção.', data: JSON.stringify({ memberId: 'member_seed_5' }), read: true },
  { id: 'notif_seed_6', organizationId: org.id, userId: 'usr_carlos', type: 'alert', title: 'Pergunta ignorada detectada', message: 'Uma pergunta sobre material de implante não foi respondida.', data: JSON.stringify({ conversationId: 'conv_seed_10', alertId: 'alert_seed_10' }), read: false },
  { id: 'notif_seed_7', organizationId: org.id, userId: 'usr_ana', type: 'recovery', title: 'Lead perdido recuperado', message: 'A oportunidade com Lucas Rodrigues foi recuperada com agendamento confirmado.', data: JSON.stringify({ recoveryId: 'recovery_seed_1' }), read: false },
  { id: 'notif_seed_8', organizationId: org.id, userId: 'usr_contato', type: 'system', title: 'Plano atualizado', message: 'Sua assinatura foi atualizada para o plano Gestão.', data: JSON.stringify({ subscriptionId: 'sub_seed_1' }), read: true },
  { id: 'notif_seed_9', organizationId: org.id, userId: 'usr_fernanda', type: 'alert', title: 'Cliente frustrado detectado', message: 'Patricia Gomes demonstra insatisfação na conversa sobre cancelamento.', data: JSON.stringify({ conversationId: 'conv_seed_9' }), read: false },
  { id: 'notif_seed_10', organizationId: org.id, userId: 'usr_ana', type: 'report_failed', title: 'Relatório de Conexões falhou', message: 'O relatório diário de conexões não pôde ser gerado.', data: JSON.stringify({ reportRunId: 'rrun_seed_7' }), read: true },
]
