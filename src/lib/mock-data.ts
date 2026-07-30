// Mock data for AtendeRadar demo

export const organization = {
  id: 'org_1',
  name: 'OdontoVida Clinicas',
  displayName: 'OdontoVida',
  segment: 'clinica_odontologica',
  timezone: 'America/Sao_Paulo',
  currency: 'BRL',
  status: 'active',
  phone: '(11) 99999-0001',
  adminEmail: 'contato@odontovida.com.br',
}

export const connections = [
  { id: 'conn_1', name: 'Recepção Principal', phoneNumber: '11987654321', phoneLast4: '4321', status: 'connected' as const, provider: 'Baileys', lastEventAt: '2025-01-15T14:32:00', lastSyncAt: '2025-01-15T14:30:00', pairedAt: '2025-01-01T10:00:00', messageCount: 1247, quality: 'good' as const },
  { id: 'conn_2', name: 'WhatsApp Marketing', phoneNumber: '11976543210', phoneLast4: '3210', status: 'connected' as const, provider: 'Baileys', lastEventAt: '2025-01-15T14:28:00', lastSyncAt: '2025-01-15T14:25:00', pairedAt: '2025-01-03T09:00:00', messageCount: 856, quality: 'good' as const },
  { id: 'conn_3', name: 'Unidade Centro', phoneNumber: '11965432109', phoneLast4: '2109', status: 'disconnected' as const, provider: 'Baileys', lastEventAt: '2025-01-14T18:00:00', lastSyncAt: '2025-01-14T17:55:00', pairedAt: '2024-12-20T11:00:00', messageCount: 432, quality: 'bad' as const },
  { id: 'conn_4', name: 'Suporte Técnico', phoneNumber: '11954321098', phoneLast4: '1098', status: 'syncing' as const, provider: 'Baileys', lastEventAt: '2025-01-15T14:20:00', lastSyncAt: '2025-01-15T13:00:00', pairedAt: '2025-01-10T08:00:00', messageCount: 312, quality: 'medium' as const },
  { id: 'conn_5', name: 'Agendamentos', phoneNumber: '11943210987', phoneLast4: '0987', status: 'qr_required' as const, provider: 'Baileys', lastEventAt: '2025-01-14T12:00:00', lastSyncAt: '2025-01-14T11:50:00', pairedAt: null, messageCount: 0, quality: null },
  { id: 'conn_6', name: 'Unidade Jardins', phoneNumber: '11932109876', phoneLast4: '8765', status: 'degraded' as const, provider: 'Baileys', lastEventAt: '2025-01-15T13:45:00', lastSyncAt: '2025-01-15T13:40:00', pairedAt: '2024-12-15T10:00:00', messageCount: 678, quality: 'medium' as const },
]

export const connectionDiagnostics: Record<string, {
  socketStatus: string; lastHeartbeat: string; pendingQueues: number; eventRate: string;
  recentErrors: string[]; protocolVersion: string; storageUsed: string; recommendedActions: string[];
}> = {
  conn_1: { socketStatus: 'OPEN', lastHeartbeat: '2025-01-15T14:32:00', pendingQueues: 0, eventRate: '12.4/min', recentErrors: [], protocolVersion: 'WAWeb v2.2426.66', storageUsed: '47.2 MB', recommendedActions: [] },
  conn_2: { socketStatus: 'OPEN', lastHeartbeat: '2025-01-15T14:28:00', pendingQueues: 0, eventRate: '8.7/min', recentErrors: [], protocolVersion: 'WAWeb v2.2426.66', storageUsed: '38.5 MB', recommendedActions: [] },
  conn_3: { socketStatus: 'CLOSED', lastHeartbeat: '2025-01-14T17:55:00', pendingQueues: 3, eventRate: '0/min', recentErrors: ['Connection refused — sessão expirada', 'Falha ao reconectar automaticamente (3 tentativas)'], protocolVersion: 'WAWeb v2.2426.66', storageUsed: '22.1 MB', recommendedActions: ['Gerar novo QR Code para reconectar', 'Verificar se o número foi banido pelo WhatsApp'] },
  conn_4: { socketStatus: 'CONNECTING', lastHeartbeat: '2025-01-15T14:20:00', pendingQueues: 12, eventRate: '5.2/min', recentErrors: ['Sincronização de mensagens em andamento — 67% concluído'], protocolVersion: 'WAWeb v2.2426.66', storageUsed: '18.9 MB', recommendedActions: ['Aguardar conclusão da sincronização'] },
  conn_5: { socketStatus: 'NONE', lastHeartbeat: '—', pendingQueues: 0, eventRate: '0/min', recentErrors: ['QR Code não escaneado — aguardando pareamento'], protocolVersion: '—', storageUsed: '0.3 MB', recommendedActions: ['Escanear o QR Code com o WhatsApp do número desejado'] },
  conn_6: { socketStatus: 'OPEN (unstable)', lastHeartbeat: '2025-01-15T13:45:00', pendingQueues: 7, eventRate: '3.1/min', recentErrors: ['Latência elevada detectada (2.8s avg)', '3 mensagens com falha de entrega temporária'], protocolVersion: 'WAWeb v2.2426.66', storageUsed: '31.7 MB', recommendedActions: ['Monitorar conexão nas próximas 2h', 'Verificar rede local e firewall'] },
}

export const agents = [
  { id: 'agent_1', name: 'Ana Silva', email: 'ana@odontovida.com.br', role: 'gestor', team: 'Recepção', avatar: null, status: 'active', score: 82, conversations: 45, avgResponseTime: 4.2, opportunities: 28, opportunitiesLost: 3, promisesKept: 9, promisesTotal: 10, trend: 'up' as const },
  { id: 'agent_2', name: 'Carlos Mendes', email: 'carlos@odontovida.com.br', role: 'atendente', team: 'Recepção', avatar: null, status: 'active', score: 74, conversations: 38, avgResponseTime: 6.8, opportunities: 22, opportunitiesLost: 5, promisesKept: 6, promisesTotal: 9, trend: 'down' as const },
  { id: 'agent_3', name: 'Juliana Costa', email: 'juliana@odontovida.com.br', role: 'atendente', team: 'Recepção', avatar: null, status: 'active', score: 88, conversations: 52, avgResponseTime: 3.1, opportunities: 35, opportunitiesLost: 2, promisesKept: 12, promisesTotal: 13, trend: 'up' as const },
  { id: 'agent_4', name: 'Roberto Alves', email: 'roberto@odontovida.com.br', role: 'atendente', team: 'Marketing', avatar: null, status: 'active', score: 65, conversations: 31, avgResponseTime: 8.5, opportunities: 18, opportunitiesLost: 7, promisesKept: 4, promisesTotal: 7, trend: 'stable' as const },
  { id: 'agent_5', name: 'Fernanda Lima', email: 'fernanda@odontovida.com.br', role: 'supervisor', team: 'Recepção', avatar: null, status: 'active', score: 79, conversations: 41, avgResponseTime: 5.0, opportunities: 26, opportunitiesLost: 4, promisesKept: 8, promisesTotal: 10, trend: 'up' as const },
]

const customerNames = ['Maria Santos', 'João Oliveira', 'Pedro Souza', 'Camila Ferreira', 'Lucas Rodrigues', 'Beatriz Lima', 'Gabriel Almeida', 'Isabela Martins', 'Rafael Costa', 'Larissa Pereira', 'Tiago Nascimento', 'Amanda Ribeiro', 'Bruno Cardoso', 'Patricia Gomes', 'Diego Araujo']

export const conversations = customerNames.map((name, i) => {
  const hasOpportunity = Math.random() > 0.3
  const urgency = ['low', 'normal', 'normal', 'normal', 'high', 'critical'][Math.floor(Math.random() * 6)]
  const sentiment = ['positive', 'neutral', 'neutral', 'neutral', 'confused', 'anxious', 'frustrated'][Math.floor(Math.random() * 7)]
  const stage = ['discovery', 'qualification', 'evaluation', 'price', 'proposal', 'negotiation', 'decision', 'won', 'lost', 'post_sale'][Math.floor(Math.random() * 10)]
  const intent = ['consulta', 'preco', 'disponibilidade', 'agendamento', 'compra', 'negociacao', 'suporte', 'pos_venda', 'reclamacao', 'cancelamento'][Math.floor(Math.random() * 10)]
  const status = ['new', 'waiting_company', 'waiting_customer', 'in_progress', 'follow_up_due', 'won', 'lost', 'closed'][Math.floor(Math.random() * 8)]
  const score = Math.round(40 + Math.random() * 55)
  const potentialValue = hasOpportunity ? Math.round(200 + Math.random() * 3500) : 0
  const agentIdx = Math.floor(Math.random() * agents.length)
  const connIdx = Math.floor(Math.random() * 2)
  const hoursAgo = Math.floor(Math.random() * 72)
  const messagesCount = 3 + Math.floor(Math.random() * 25)

  return {
    id: `conv_${i + 1}`,
    customerName: name,
    customerPhone: `*****${(1000 + i).toString().slice(-4)}`,
    connectionName: connections[connIdx].name,
    agentId: agents[agentIdx].id,
    agentName: agents[agentIdx].name,
    agentTeam: agents[agentIdx].team,
    operationalStatus: status,
    inferredStage: stage,
    primaryIntent: intent,
    urgency,
    sentiment,
    score,
    potentialValue,
    confidence: +(0.5 + Math.random() * 0.45).toFixed(2),
    messagesCount,
    lastActivity: new Date(Date.now() - hoursAgo * 3600000).toISOString(),
    waitingMinutes: status === 'waiting_company' ? Math.floor(Math.random() * 120) + 5 : 0,
    alertCount: Math.floor(Math.random() * 4),
    tags: i % 3 === 0 ? ['prioritario'] : i % 5 === 0 ? ['vip', 'retorno'] : [],
    hasOpportunity,
  }
})

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
]

export function getConversationMessages(convId: string) {
  const idx = parseInt(convId.replace('conv_', '')) - 1
  const seed = idx * 7
  const count = 4 + (seed % 6)
  const baseTime = new Date(Date.now() - (seed % 48) * 3600000)
  const msgs = []
  for (let i = 0; i < count; i++) {
    const tmpl = messageTemplates[(seed + i) % messageTemplates.length]
    msgs.push({
      id: `msg_${convId}_${i}`,
      conversationId: convId,
      direction: tmpl.direction,
      senderType: tmpl.direction === 'inbound' ? 'customer' : 'agent',
      messageType: 'text',
      text: tmpl.text,
      occurredAt: new Date(baseTime.getTime() + i * 300000 + Math.floor(Math.random() * 120000)).toISOString(),
      isAutomatic: false,
      deliveryStatus: 'delivered',
    })
  }
  return msgs
}

export const alerts = conversations
  .filter((c) => c.alertCount > 0)
  .flatMap((c) => {
    const types = [
      { type: 'no_response', title: 'Cliente sem resposta', severity: 'high' },
      { type: 'slow_response', title: 'Resposta lenta', severity: 'medium' },
      { type: 'ignored_question', title: 'Pergunta ignorada', severity: 'medium' },
      { type: 'pending_quote', title: 'Orçamento pendente', severity: 'high' },
      { type: 'overdue_promise', title: 'Promessa vencida', severity: 'critical' },
      { type: 'abandoned_lead', title: 'Lead abandonado', severity: 'high' },
      { type: 'customer_frustrated', title: 'Cliente frustrado', severity: 'critical' },
      { type: 'quota_warning', title: 'Quota próxima do limite', severity: 'low' },
    ]
    return Array.from({ length: c.alertCount }, (_, i) => {
      const t = types[(parseInt(c.id.replace('conv_', '')) + i) % types.length]
      const hoursAgo = Math.floor(Math.random() * 24)
      return {
        id: `alert_${c.id}_${i}`,
        conversationId: c.id,
        ruleName: t.type,
        severity: t.severity,
        title: t.title,
        description: `Detectado em conversa com ${c.customerName}. Agente: ${c.agentName}.`,
        customerName: c.customerName,
        agentName: c.agentName,
        status: (['new', 'acknowledged', 'in_progress', 'resolved', 'dismissed'] as const)[Math.min(i, 4)],
        potentialValue: c.potentialValue > 0 ? c.potentialValue * 0.5 : undefined,
        confidence: +(0.6 + Math.random() * 0.35).toFixed(2),
        createdAt: new Date(Date.now() - hoursAgo * 3600000).toISOString(),
        evidence: c.urgency === 'high' || c.urgency === 'critical' ? 'Pergunta sobre preço feita há 45 min sem retorno.' : 'Resposta excedeu SLA de 10 minutos.',
      }
    })
  })

export const recoveryItems = conversations
  .filter((c) => c.hasOpportunity && (c.operationalStatus === 'lost' || c.operationalStatus === 'closed' || c.urgency === 'high' || c.sentiment === 'frustrated' || c.sentiment === 'desistindo'))
  .map((c, i) => ({
    id: `rec_${i + 1}`,
    conversationId: c.id,
    customerName: c.customerName,
    reason: c.operationalStatus === 'lost' ? 'Lead perdido' : c.sentiment === 'frustrated' ? 'Cliente frustrado' : 'Oportunidade abandonada',
    originalAgentName: c.agentName,
    assignedTo: i % 3 === 0 ? agents[2].name : null,
    priorityScore: +(0.3 + Math.random() * 0.7).toFixed(2),
    dueAt: new Date(Date.now() + (24 + i * 8) * 3600000).toISOString(),
    status: (['new', 'assigned', 'attempted', 'contacted', 'recovered', 'lost'] as const)[i % 6],
    attempts: i % 4,
    outcome: i >= 4 ? 'Contato feito, agendamento realizado' : undefined,
    recoveredValue: i === 4 ? 1800 : undefined,
    potentialValue: c.potentialValue,
    lastInteraction: c.lastActivity,
  }))

export const dashboardSummary = {
  conversationsStarted: 127,
  conversationsStartedChange: 12.5,
  customersWaiting: 8,
  customersWaitingChange: -15.0,
  medianFirstResponse: 5.2,
  medianFirstResponseChange: -8.3,
  opportunitiesDetected: 43,
  opportunitiesDetectedChange: 22.0,
  opportunitiesAtRisk: 12,
  opportunitiesAtRiskChange: 5.0,
  overduePromises: 3,
  overduePromisesChange: -25.0,
  potentialValueAtRisk: 8450.0,
  potentialValueAtRiskChange: 18.0,
  overallScore: 76,
  overallScoreChange: 3.0,
}

export const auditFunnel = [
  { stage: 'Conversas', count: 127, color: 'var(--chart-1)' },
  { stage: 'Oportunidades', count: 43, color: 'var(--chart-2)' },
  { stage: 'Pedidos de preço', count: 28, color: 'var(--chart-3)' },
  { stage: 'Propostas', count: 18, color: 'var(--chart-4)' },
  { stage: 'Vendas confirmadas', count: 12, color: 'var(--chart-1)' },
  { stage: 'Perdas confirmadas', count: 6, color: 'var(--destructive)' },
  { stage: 'Sem desfecho', count: 7, color: 'var(--muted-foreground)' },
]

export const failuresByType = [
  { type: 'Sem resposta', count: 14, severity: 'high' },
  { type: 'Resposta lenta', count: 22, severity: 'medium' },
  { type: 'Pergunta ignorada', count: 8, severity: 'medium' },
  { type: 'Orçamento pendente', count: 6, severity: 'high' },
  { type: 'Promessa vencida', count: 3, severity: 'critical' },
  { type: 'Lead abandonado', count: 5, severity: 'high' },
  { type: 'Cliente frustrado', count: 2, severity: 'critical' },
]

export const evolutionData = Array.from({ length: 14 }, (_, i) => {
  const date = new Date()
  date.setDate(date.getDate() - (13 - i))
  return {
    date: date.toISOString().split('T')[0],
    score: +(65 + Math.random() * 25).toFixed(1),
    responseTime: +(3 + Math.random() * 8).toFixed(1),
    abandonment: Math.floor(Math.random() * 8),
    valueAtRisk: Math.round(2000 + Math.random() * 10000),
  }
})

export const alertRules = [
  { id: 'rule_1', name: 'Cliente sem primeira resposta', type: 'no_response', active: true, severity: 'critical', channels: ['in_app', 'email'], cooldownMinutes: 30, limitMinutes: 10 },
  { id: 'rule_2', name: 'Cliente sem resposta após interação', type: 'no_response_followup', active: true, severity: 'high', channels: ['in_app'], cooldownMinutes: 20, limitMinutes: 30 },
  { id: 'rule_3', name: 'Pedido de preço sem retorno', type: 'pending_quote', active: true, severity: 'high', channels: ['in_app', 'email'], cooldownMinutes: 15, limitMinutes: 15 },
  { id: 'rule_4', name: 'Intenção alta sem resposta', type: 'high_intent_no_reply', active: true, severity: 'critical', channels: ['in_app', 'email'], cooldownMinutes: 10, limitMinutes: 5 },
  { id: 'rule_5', name: 'Promessa próxima do vencimento', type: 'promise_approaching', active: true, severity: 'medium', channels: ['in_app'], cooldownMinutes: 60, limitMinutes: 120 },
  { id: 'rule_6', name: 'Promessa vencida', type: 'promise_overdue', active: true, severity: 'critical', channels: ['in_app', 'email'], cooldownMinutes: 30, limitMinutes: 0 },
  { id: 'rule_7', name: 'Cliente irritado', type: 'customer_frustrated', active: true, severity: 'high', channels: ['in_app', 'email'], cooldownMinutes: 20, limitMinutes: 5 },
  { id: 'rule_8', name: 'Conexão desconectada', type: 'connection_down', active: true, severity: 'critical', channels: ['in_app', 'email'], cooldownMinutes: 5, limitMinutes: 0 },
]

export const reportTypes = [
  { id: 'daily', name: 'Relatório Diário', description: 'Resumo executivo do dia com métricas e prioridades.', schedule: '18:00', recipients: ['contato@odontovida.com.br'], lastRun: '2025-01-15T18:00:00' },
  { id: 'weekly', name: 'Relatório Semanal', description: 'Evolução versus semana anterior com recomendações.', schedule: 'Segundas 09:00', recipients: ['contato@odontovida.com.br', 'ana@odontovida.com.br'], lastRun: '2025-01-13T09:00:00' },
  { id: 'agent', name: 'Relatório por Equipe', description: 'Desempenho individual com pontos fortes e falhas.', schedule: 'Sextas 17:00', recipients: ['ana@odontovida.com.br'], lastRun: '2025-01-10T17:00:00' },
  { id: 'lost_opportunities', name: 'Oportunidades Perdidas', description: 'Leads perdidos com causa raiz e valor estimado.', schedule: 'Segundas 10:00', recipients: ['contato@odontovida.com.br'], lastRun: '2025-01-13T10:00:00' },
  { id: 'promises', name: 'Relatório de Promessas', description: 'Promessas feitas, cumpridas e vencidas por atendente.', schedule: 'Diário 17:00', recipients: ['ana@odontovida.com.br', 'contato@odontovida.com.br'], lastRun: '2025-01-15T17:00:00' },
  { id: 'recovery', name: 'Relatório de Recuperação', description: 'Itens criados, trabalhados e receita recuperada.', schedule: 'Semanal', recipients: ['contato@odontovida.com.br'], lastRun: '2025-01-13T09:00:00' },
  { id: 'data_quality', name: 'Qualidade dos Dados', description: 'Cobertura de campos, classificações e confiança da IA.', schedule: 'Mensal', recipients: ['contato@odontovida.com.br'], lastRun: '2025-01-01T08:00:00' },
  { id: 'connections', name: 'Relatório de Conexões', description: 'Status das conexões, uptime e volume de mensagens.', schedule: 'Diário 06:00', recipients: ['contato@odontovida.com.br'], lastRun: '2025-01-15T06:00:00' },
]

export const reportHistory = [
  { id: 'rh_1', reportTypeId: 'daily', type: 'Relatório Diário', period: '15/01/2025', recipients: ['contato@odontovida.com.br'], status: 'completed' as const, createdAt: '2025-01-15T18:00:00', fileSize: '245 KB' },
  { id: 'rh_2', reportTypeId: 'weekly', type: 'Relatório Semanal', period: '06-12/01/2025', recipients: ['contato@odontovida.com.br', 'ana@odontovida.com.br'], status: 'completed' as const, createdAt: '2025-01-13T09:00:00', fileSize: '512 KB' },
  { id: 'rh_3', reportTypeId: 'daily', type: 'Relatório Diário', period: '14/01/2025', recipients: ['contato@odontovida.com.br'], status: 'completed' as const, createdAt: '2025-01-14T18:00:00', fileSize: '238 KB' },
  { id: 'rh_4', reportTypeId: 'promises', type: 'Relatório de Promessas', period: '15/01/2025', recipients: ['ana@odontovida.com.br'], status: 'processing' as const, createdAt: '2025-01-15T17:00:00', fileSize: null },
  { id: 'rh_5', reportTypeId: 'agent', type: 'Relatório por Equipe', period: '06-12/01/2025', recipients: ['ana@odontovida.com.br'], status: 'completed' as const, createdAt: '2025-01-10T17:00:00', fileSize: '487 KB' },
  { id: 'rh_6', reportTypeId: 'lost_opportunities', type: 'Oportunidades Perdidas', period: '06-12/01/2025', recipients: ['contato@odontovida.com.br'], status: 'completed' as const, createdAt: '2025-01-13T10:00:00', fileSize: '198 KB' },
  { id: 'rh_7', reportTypeId: 'connections', type: 'Relatório de Conexões', period: '15/01/2025', recipients: ['contato@odontovida.com.br'], status: 'failed' as const, createdAt: '2025-01-15T06:00:00', fileSize: null },
  { id: 'rh_8', reportTypeId: 'recovery', type: 'Relatório de Recuperação', period: '06-12/01/2025', recipients: ['contato@odontovida.com.br'], status: 'completed' as const, createdAt: '2025-01-13T09:00:00', fileSize: '312 KB' },
  { id: 'rh_9', reportTypeId: 'daily', type: 'Relatório Diário', period: '13/01/2025', recipients: ['contato@odontovida.com.br'], status: 'completed' as const, createdAt: '2025-01-13T18:00:00', fileSize: '221 KB' },
  { id: 'rh_10', reportTypeId: 'data_quality', type: 'Qualidade dos Dados', period: 'Dez/2024', recipients: ['contato@odontovida.com.br'], status: 'pending' as const, createdAt: null, fileSize: null },
]

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export function formatPhone(last4: string): string {
  return `(**) *****-${last4}`
}

export function timeAgo(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diffMs = now - date
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `${diffMin}min atrás`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h atrás`
  const diffD = Math.floor(diffH / 24)
  return `${diffD}d atrás`
}

export function getSeverityColor(severity: string) {
  switch (severity) {
    case 'critical': return 'text-red-600 bg-red-50 border-red-200'
    case 'high': return 'text-orange-600 bg-orange-50 border-orange-200'
    case 'medium': return 'text-amber-600 bg-amber-50 border-amber-200'
    case 'low': return 'text-emerald-600 bg-emerald-50 border-emerald-200'
    case 'info': return 'text-sky-600 bg-sky-50 border-sky-200'
    default: return 'text-muted-foreground bg-muted'
  }
}

export function getStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    discovery: 'Descoberta', qualification: 'Qualificação', evaluation: 'Avaliação',
    price: 'Preço', proposal: 'Proposta', negotiation: 'Negociação',
    decision: 'Decisão', won: 'Ganho', lost: 'Perdido', post_sale: 'Pós-venda',
  }
  return labels[stage] || stage
}

export function getIntentLabel(intent: string): string {
  const labels: Record<string, string> = {
    consulta: 'Consulta', preco: 'Preço', disponibilidade: 'Disponibilidade',
    agendamento: 'Agendamento', compra: 'Compra', negociacao: 'Negociação',
    cancelamento: 'Cancelamento', reclamacao: 'Reclamação', suporte: 'Suporte', pos_venda: 'Pós-venda',
  }
  return labels[intent] || intent
}

export function getUrgencyLabel(urgency: string): string {
  const labels: Record<string, string> = {
    low: 'Baixa', normal: 'Normal', high: 'Alta', critical: 'Crítica',
  }
  return labels[urgency] || urgency
}

export function getSentimentLabel(sentiment: string): string {
  const labels: Record<string, string> = {
    positive: 'Positivo', neutral: 'Neutro', confused: 'Confuso',
    anxious: 'Ansioso', frustrated: 'Frustrado', irritated: 'Irritado', desistindo: 'Desistindo',
  }
  return labels[sentiment] || sentiment
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    new: 'Nova', waiting_company: 'Aguardando empresa', waiting_customer: 'Aguardando cliente',
    in_progress: 'Em andamento', follow_up_due: 'Acompanhamento pendente',
    won: 'Ganha', lost: 'Perdida', closed: 'Encerrada', spam: 'Spam', excluded: 'Excluída',
  }
  return labels[status] || status
}
