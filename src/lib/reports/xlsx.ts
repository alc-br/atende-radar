import writeXlsxFile, { type Cell, type Sheet } from 'write-excel-file/node'
import { cellFormat, dateBR, safeTimeZone, type CellFormat, type CellValue, type ReportContent } from './types'

// Planilha do relatório: aba "Resumo" + uma aba por seção, cabeçalhos em pt-BR, números como número e datas como data.
// Texto vai sempre como texto (sharedStrings), nunca como fórmula: conteúdo de cliente começando com "=" não executa.

const MONEY_FMT = '"R$" #,##0.00'
const INT_FMT = '#,##0'
const DECIMAL_FMT = '#,##0.00'
const DATE_FMT = 'dd/mm/yyyy hh:mm'
const DAY_FMT = 'dd/mm/yyyy'

/** O Excel não guarda fuso: a data vai com o "relógio de parede" do fuso da empresa (o que o gestor espera ver). */
function wallClock(iso: string, tz: string): Date | null {
  const d = new Date(iso)
  if (!/^\d{4}-\d{2}-\d{2}T/.test(iso) || Number.isNaN(d.getTime())) return null
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  )
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second))
}

function cell(v: CellValue | undefined, fmt: CellFormat | undefined, tz: string): Cell {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null
    const format = fmt === 'money' ? MONEY_FMT : fmt === 'int' ? INT_FMT : fmt === 'decimal' ? DECIMAL_FMT : undefined
    return format ? { value: v, type: Number, format } : { value: v, type: Number }
  }
  if (fmt === 'date') {
    const d = wallClock(v, tz)
    if (d) return { value: d, type: Date, format: DATE_FMT }
  }
  const day = fmt === 'day' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null
  if (day) return { value: new Date(Date.UTC(+day[1], +day[2] - 1, +day[3])), type: Date, format: DAY_FMT }
  return { value: v, type: String }
}

const header = (s: string): Cell => ({ value: s, type: String, fontWeight: 'bold', backgroundColor: '#E5F4EE' })

/** Nome de aba válido no Excel: até 31 caracteres, sem : \ / ? * [ ], único no arquivo. */
function sheetName(heading: string, used: Set<string>): string {
  const base = heading.replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Dados'
  let name = base
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 31 - String(i).length - 1)} ${i}`
  used.add(name.toLowerCase())
  return name
}

export async function toXlsx(r: ReportContent): Promise<Buffer> {
  const tz = safeTimeZone(r.timezone)
  const used = new Set<string>()
  const meta = (label: string, value: Cell): Cell[] => [{ value: label, type: String, fontWeight: 'bold' }, value]

  const resumo: Cell[][] = [
    [{ value: r.title, type: String, fontWeight: 'bold', fontSize: 14 }],
    meta('Empresa', { value: r.orgName || '—', type: String }),
    meta('Início do período', cell(r.periodStart, 'date', tz)),
    meta('Fim do período', cell(r.periodEnd, 'date', tz)),
    meta('Gerado em', cell(r.generatedAt, 'date', tz)),
    meta('Fuso horário', { value: tz, type: String }),
  ]
  if (r.highlights) {
    resumo.push([], [header('Indicador principal'), header('Valor')])
    resumo.push(meta('Valor estimado em risco', cell(r.highlights.valueAtRisk, 'money', tz)))
    resumo.push(meta('Conversas no período', cell(r.highlights.conversations, 'int', tz)))
    resumo.push(meta('Clientes aguardando resposta', cell(r.highlights.waiting, 'int', tz)))
    resumo.push(meta('Alertas no período', cell(r.highlights.alerts, 'int', tz)))
    resumo.push(meta('Oportunidades detectadas', cell(r.highlights.opportunities, 'int', tz)))
  }
  if (r.summary.length) {
    resumo.push([], [header('Resumo')])
    for (const s of r.summary) resumo.push([{ value: s, type: String }])
  }
  const sheets: Sheet<Buffer>[] = [{ sheet: sheetName('Resumo', used), data: resumo, columns: [{ width: 34 }, { width: 28 }] }]

  for (const sec of r.sections) {
    const data: Cell[][] = [sec.columns.map(header)]
    sec.rows.forEach((row, ri) => data.push(sec.columns.map((_, ci) => cell(row[ci], cellFormat(sec, ri, ci), tz))))
    if (sec.rows.length === 0) data.push([{ value: 'Sem registros no período.', type: String }])
    sheets.push({
      sheet: sheetName(sec.heading, used),
      data,
      columns: sec.columns.map((c, ci) => ({ width: Math.min(48, Math.max(12, c.length + 2, ...sec.rows.slice(0, 50).map((row) => String(row[ci] ?? '').length + 2))) })),
      stickyRowsCount: 1,
    })
  }
  return writeXlsxFile(sheets).toBuffer()
}
