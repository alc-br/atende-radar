// Ambiente de simulação (S1): cenários declarativos. Um cenário monta uma empresa simulada (plano, conexões,
// atendentes, configurações), injeta mensagens pelo MESMO caminho do WhatsApp real (ingestEvent) em horários virtuais
// e confere o resultado (alertas, conversa, recuperação, pausa da análise, cota do plano).
//
// Relógio: os minutos (`at`) contam a partir do início virtual do cenário (t0). O runner põe t0 no passado
// (t0 = agora − maior `at` − 1 min), então toda mensagem e todo tick acontecem "antes de agora" e o motor
// (analyzeOrganization(orgId, t0 + at)) enxerga exatamente o tempo decorrido que o cenário descreve.

export type PlanCode = 'essencial' | 'gestao' | 'performance'

export type ReportKind = 'daily' | 'weekly' | 'agent' | 'lost_opportunities' | 'promises' | 'recovery' | 'data_quality' | 'connections'

/** Rótulo de um cliente do cenário (vira um número de WhatsApp fictício, único por execução). */
export type ChatLabel = string

export type Step =
  /** Mensagem do cliente (from: 'customer') ou da empresa (from: 'company'). `agent` põe a assinatura "*Nome*: ". */
  | {
      kind: 'message'
      at: number
      chat: ChatLabel
      from: 'customer' | 'company'
      text: string
      /** Nome do cliente no WhatsApp (pushName). */
      name?: string
      agent?: string
      /** Índice da conexão (0 = primeira). */
      connection?: number
      /** Reenvia o MESMO evento de uma mensagem anterior (teste de idempotência): repete o eventId e o externalId dela. */
      repeatOf?: string
      /** Com `repeatOf`: mesma mensagem (externalId) num evento NOVO (o gateway reenviando o histórico). */
      newEvent?: boolean
      /** Id local da mensagem (para `repeatOf`). */
      ref?: string
    }
  /** Mudança de estado da conexão, como o gateway real informaria. */
  | { kind: 'connection'; at: number; connection?: number; status: 'connected' | 'disconnected' | 'degraded'; reason?: string }
  /** Roda o motor com o relógio virtual em t0 + at e confere as expectativas desse momento. */
  | { kind: 'tick'; at: number; expect?: Expectation[] }
  /** Tenta cadastrar mais uma conexão (passa por enforceQuota, como a tela). */
  | { kind: 'addConnection'; at: number; expectStatus: 201 | 402 }
  /** Tenta cadastrar mais um atendente (passa por enforceQuota). */
  | { kind: 'addAgent'; at: number; expectStatus: 201 | 402 }
  /** Cria uma regra de alerta pelo MESMO caminho da tela (cota do plano, tipo, nome único, prazo). */
  | {
      kind: 'rule'
      at: number
      name: string
      type: string
      severity?: string
      limitMinutes?: number
      cooldownMinutes?: number
      channels?: string[]
      /** Índices das conexões da regra (vazio = todas). */
      connections?: number[]
      /** Padrão 201 (criada). */
      expectStatus?: 201 | 400 | 402 | 409
    }
  /** Liga/desliga uma regra (pelo nome), como o botão "Ativa" da aba Regras. */
  | { kind: 'ruleActive'; at: number; name: string; active: boolean }
  /** Uma pessoa trata o alerta aberto da regra na conversa: dispensa, marca falso positivo ou resolve. */
  | { kind: 'alertAction'; at: number; alert: string; chat?: ChatLabel; action: 'dismiss' | 'false_positive' | 'resolve' }
  /** "Parar de monitorar" o contato da conversa (LGPD): some das análises e as próximas mensagens são ignoradas. */
  | { kind: 'exclude'; at: number; chat: ChatLabel }
  /** Conversas que a empresa já abriu neste mês antes do cenário (contam na cota do plano; sem mensagens). */
  | { kind: 'usage'; at: number; conversations: number }
  /** Troca o plano da assinatura (ex.: contratou um maior) ou encerra a assinatura. */
  | { kind: 'plan'; at: number; plan?: PlanCode; status?: 'active' | 'canceled' }

export type Expectation =
  /** Alerta da regra (nome exato) na conversa do `chat` (ou sem conversa, para regra de conexão). */
  | { alert: string; chat?: ChatLabel; status?: 'new' | 'resolved'; count?: number; severity?: string }
  /** Nenhum alerta (em aberto, por padrão) da regra na conversa. */
  | { noAlert: string; chat?: ChatLabel; anyStatus?: boolean }
  | {
      conversation: ChatLabel
      status?: string
      intent?: string
      sentiment?: string
      potentialValue?: number
      closed?: boolean
      tag?: string
      suggestedAgent?: string
    }
  | { recovery: ChatLabel; reason?: string }
  | { noRecovery: ChatLabel }
  /** Resultado do último tick: análise pausada pelo motivo dado (ou não pausada, com null). */
  | { gate: 'trial_expired' | 'canceled' | null }
  /** Quantas mensagens a conversa tem. */
  | { messages: ChatLabel; count: number }
  /** Texto gravado nas mensagens da conversa contém / não contém o trecho. */
  | { storedText: ChatLabel; contains?: string; notContains?: string }
  | { promise: ChatLabel; status: 'open' | 'kept' }
  /** Alguma notificação no sino cujo título contém o trecho. */
  | { notification: string }
  /** Total de alertas em aberto na empresa simulada. */
  | { openAlerts: number }
  /** Ocorrências (contador de repetição) do alerta da regra na conversa. */
  | { occurrences: string; chat?: ChatLabel; count: number }
  /** Perguntas do cliente registradas na conversa (perguntas ignoradas, B6). */
  | { question: ChatLabel; status: 'open' | 'answered'; count?: number }
  /** Números do último tick (motor). */
  | { lastTick: { overQuota?: number; alertsRepeated?: number; alertsEscalated?: number; outcomesDetected?: number; alertsOpened?: number } }
  /** Item de recuperação da conversa na situação dada (ex.: recovered depois da venda). */
  | { recoveryStatus: ChatLabel; status: string }
  /**
   * Relatório do tipo, gerado como o agendado/baixado (buildReport) com o período do cenário: confere indicadores
   * (linha "Indicador" → valor), quantas linhas uma seção tem e trechos que precisam aparecer.
   */
  | { report: ReportKind; kpi?: Record<string, string | number>; rows?: Record<string, number>; contains?: string[]; highlights?: Record<string, number> }

export interface Scenario {
  id: string
  title: string
  description: string
  plan: PlanCode
  /** 'active' (padrão), 'trial_expired' (teste grátis terminou 1 dia antes de t0) ou 'canceled' (período pago acabou). */
  subscription?: 'active' | 'trial_expired' | 'canceled'
  /**
   * Fixa o início virtual (t0) num dia da semana e hora de São Paulo (o mais recente antes de "agora − duração"),
   * para cenários de expediente darem o mesmo resultado a qualquer hora em que rodarem. weekday: 0 = domingo.
   */
  startAt?: { weekday: number; time: string }
  /** Marca o dia de t0 como feriado nas Configurações › Horários. */
  holidayOnStart?: boolean
  /** Quantas conexões a empresa já tem ao começar (padrão 1). */
  connections?: number
  /** Atendentes cadastrados ao começar (nomes). */
  agents?: string[]
  /** Configurações da empresa (mesmas chaves da tela de Configurações). Padrão: fora do expediente = 'atraso'. */
  settings?: Record<string, unknown>
  steps: Step[]
  /** Conferidas no fim (depois do último passo). */
  expect?: Expectation[]
}

export interface AssertionResult {
  /** Momento virtual (minuto) em que foi conferida; null = fim do cenário. */
  at: number | null
  label: string
  ok: boolean
  /** O que foi encontrado (curto; nunca texto de mensagem real: aqui só existem dados fictícios). */
  detail?: string
}

export interface ScenarioResult {
  scenarioId: string
  title: string
  status: 'passed' | 'failed' | 'error'
  runId: string
  organizationId: string | null
  kept: boolean
  virtualStart: string | null
  durationMs: number
  assertions: AssertionResult[]
  error?: string
}
