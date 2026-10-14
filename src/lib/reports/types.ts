// Tipos do conteúdo de um relatório (a "foto" guardada em ReportRun.contentJson). Sem banco: os geradores de arquivo
// (CSV, HTML, XLSX, PDF) e os testes de unidade importam só daqui.

export const REPORT_TYPES = ['daily', 'weekly', 'agent', 'lost_opportunities', 'promises', 'recovery', 'data_quality', 'connections'] as const
export type ReportType = (typeof REPORT_TYPES)[number]

export const REPORT_TITLES: Record<ReportType, string> = {
  daily: 'Relatório Diário',
  weekly: 'Relatório Semanal',
  agent: 'Relatório por Equipe',
  lost_opportunities: 'Oportunidades Perdidas',
  promises: 'Relatório de Promessas',
  recovery: 'Relatório de Recuperação',
  data_quality: 'Qualidade dos Dados',
  connections: 'Relatório de Conexões',
}

/**
 * Como exibir/gravar o valor de cada coluna. Os valores ficam crus na foto (número como número, data em ISO); cada
 * formato de arquivo decide a apresentação (CSV/HTML/PDF em texto pt-BR, XLSX com número e data nativos).
 * Fotos antigas não têm formatos: tudo é tratado como "auto" (número fica número, texto fica texto).
 */
export type CellFormat = 'text' | 'int' | 'decimal' | 'money' | 'date' | 'day' // date = ISO com hora; day = 'AAAA-MM-DD'
export type CellValue = string | number | null

export interface ReportSection {
  /** Identifica seções que o PDF executivo usa ('kpis', 'top_recover'). */
  key?: string
  heading: string
  columns: string[]
  rows: CellValue[][]
  formats?: CellFormat[]
  /** Formato da ÚLTIMA coluna linha a linha (tabelas "Indicador | Valor", onde cada linha tem um tipo). */
  rowFormats?: Array<CellFormat | null>
}

export interface ReportHighlights {
  conversations: number
  waiting: number
  alerts: number
  opportunities: number
  valueAtRisk: number
}

export interface ReportContent {
  type: ReportType
  title: string
  orgName: string
  periodStart: string
  periodEnd: string
  generatedAt: string
  /** Fuso da empresa (datas exibidas nele). Fotos antigas não têm: America/Sao_Paulo. */
  timezone?: string
  /** Indicadores principais do relatório diário/semanal (cartões do PDF executivo). */
  highlights?: ReportHighlights
  summary: string[]
  sections: ReportSection[]
}

export const DEFAULT_TZ = 'America/Sao_Paulo'

/** Fuso válido para Intl (um valor inválido cai no padrão em vez de quebrar a geração). */
export function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TZ
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return DEFAULT_TZ
  }
}

/** Formato da célula (linha r, coluna c) de uma seção. */
export function cellFormat(sec: ReportSection, r: number, c: number): CellFormat | undefined {
  if (sec.rowFormats && c === sec.columns.length - 1 && sec.rowFormats[r]) return sec.rowFormats[r] ?? undefined
  return sec.formats?.[c]
}

/** Data/hora em pt-BR no fuso do relatório. Texto que não é data (fotos antigas já formatadas) volta como está. */
export function dateBR(value: string, tz?: string): string {
  const d = new Date(value)
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(d.getTime())) return value
  return d.toLocaleString('pt-BR', { timeZone: safeTimeZone(tz), day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export const moneyBR = (n: number) => `R$ ${Math.round(n).toLocaleString('pt-BR')}`

/** Texto de exibição de uma célula (HTML, PDF e e-mail). Vazio vira "—". */
export function displayCell(v: CellValue | undefined, fmt: CellFormat | undefined, tz?: string): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '—'
    if (fmt === 'money') return moneyBR(v)
    if (fmt === 'int') return Math.round(v).toLocaleString('pt-BR')
    return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  }
  if (fmt === 'date') return dateBR(v, tz)
  if (fmt === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split('-').reverse().join('/')
  return v
}
