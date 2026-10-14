import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { cellFormat, dateBR, displayCell, moneyBR, type CellFormat, type ReportContent, type ReportSection } from './types'

// PDF executivo (1–2 páginas A4): título, empresa, período, indicadores principais, top 5 conversas a recuperar e as
// tabelas resumidas. Fonte Helvetica embutida no próprio PDF (padrão do formato, sem arquivo de fonte nem rede);
// ela cobre os acentos do português. Caracteres fora dela (emoji etc.) viram "?" em vez de quebrar a geração.
// Os dados são os mesmos da foto do relatório (telefone mascarado, promessas com dados sensíveis mascarados).

const A4: [number, number] = [595.28, 841.89]
const M = 40 // margem
const MAX_PAGES = 2
const MAX_ROWS = 12 // linhas por tabela no PDF (o arquivo completo fica no XLSX/CSV)

const VERDE = rgb(0.02, 0.59, 0.41)
const TEXTO = rgb(0.07, 0.07, 0.07)
const SUAVE = rgb(0.4, 0.4, 0.4)
const LINHA = rgb(0.85, 0.85, 0.85)
const FUNDO = rgb(0.95, 0.96, 0.96)

class Writer {
  page!: PDFPage
  y = 0
  pages = 0
  full = false // chegou ao limite de páginas
  private cache = new Map<string, string>()

  constructor(
    private doc: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont,
  ) {
    this.newPage()
  }

  newPage(): boolean {
    if (this.pages >= MAX_PAGES) {
      this.full = true
      return false
    }
    this.page = this.doc.addPage(A4)
    this.pages++
    this.y = A4[1] - M
    return true
  }

  /** Garante espaço vertical; abre página nova se precisar (false = acabou o limite de páginas). */
  ensure(h: number): boolean {
    if (this.full) return false
    if (this.y - h >= M + 24) return true
    return this.newPage()
  }

  /** Só caracteres que a fonte padrão (WinAnsi) codifica. */
  clean(text: string, font: PDFFont = this.font): string {
    let out = ''
    for (const ch of text.normalize('NFC').replace(/[\t\r\n]+/g, ' ')) {
      let ok = this.cache.get(ch)
      if (ok === undefined) {
        try {
          font.encodeText(ch)
          ok = ch
        } catch {
          ok = '?'
        }
        this.cache.set(ch, ok)
      }
      out += ok
    }
    return out
  }

  /** Corta o texto com "…" para caber na largura. */
  fit(text: string, size: number, width: number, font: PDFFont = this.font): string {
    let t = this.clean(text, font)
    if (font.widthOfTextAtSize(t, size) <= width) return t
    while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > width) t = t.slice(0, -1)
    return `${t}…`
  }

  /** Quebra o texto em linhas que cabem na largura. */
  wrap(text: string, size: number, width: number, font: PDFFont = this.font): string[] {
    const words = this.clean(text, font).split(' ')
    const lines: string[] = []
    let cur = ''
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w
      if (font.widthOfTextAtSize(next, size) <= width) cur = next
      else {
        if (cur) lines.push(cur)
        cur = this.fit(w, size, width, font)
      }
    }
    if (cur) lines.push(cur)
    return lines
  }

  text(t: string, x: number, y: number, size: number, opts: { font?: PDFFont; color?: ReturnType<typeof rgb> } = {}) {
    const font = opts.font ?? this.font
    this.page.drawText(this.clean(t, font), { x, y, size, font, color: opts.color ?? TEXTO })
  }
}

const WIDTH = A4[0] - 2 * M
const isNumeric = (f: CellFormat | undefined) => f === 'int' || f === 'decimal' || f === 'money'

function header(w: Writer, r: ReportContent) {
  const tz = r.timezone
  w.page.drawRectangle({ x: M, y: w.y - 4, width: WIDTH, height: 3, color: VERDE })
  w.y -= 30
  w.text(r.title, M, w.y, 20, { font: w.bold })
  w.y -= 18
  w.text(r.orgName || '—', M, w.y, 11, { font: w.bold, color: SUAVE })
  w.y -= 14
  w.text(`Período: ${dateBR(r.periodStart, tz)} a ${dateBR(r.periodEnd, tz)}  ·  Gerado em ${dateBR(r.generatedAt, tz)}`, M, w.y, 9, { color: SUAVE })
  w.y -= 20
}

function cards(w: Writer, r: ReportContent) {
  const h = r.highlights
  if (!h) return
  const items: Array<[string, string]> = [
    ['Valor em risco', moneyBR(h.valueAtRisk)],
    ['Conversas', h.conversations.toLocaleString('pt-BR')],
    ['Aguardando resposta', h.waiting.toLocaleString('pt-BR')],
    ['Alertas', h.alerts.toLocaleString('pt-BR')],
  ]
  const gap = 10
  const cw = (WIDTH - gap * (items.length - 1)) / items.length
  const ch = 54
  w.ensure(ch + 12)
  items.forEach(([label, value], i) => {
    const x = M + i * (cw + gap)
    w.page.drawRectangle({ x, y: w.y - ch, width: cw, height: ch, color: FUNDO, borderColor: LINHA, borderWidth: 0.6 })
    w.page.drawRectangle({ x, y: w.y - ch, width: 3, height: ch, color: VERDE })
    w.text(w.fit(label, 8.5, cw - 18), x + 10, w.y - 17, 8.5, { color: SUAVE })
    w.text(w.fit(value, 16, cw - 18, w.bold), x + 10, w.y - 40, 16, { font: w.bold })
  })
  w.y -= ch + 18
}

function summary(w: Writer, r: ReportContent) {
  if (!r.summary.length) return
  for (const s of r.summary) {
    const lines = w.wrap(s, 10, WIDTH - 12)
    if (!w.ensure(lines.length * 13 + 2)) return
    lines.forEach((l, i) => {
      if (i === 0) w.text('•', M, w.y, 10, { color: VERDE })
      w.text(l, M + 12, w.y, 10)
      w.y -= 13
    })
  }
  w.y -= 8
}

/** Larguras das colunas proporcionais ao conteúdo (com mínimo), somando a largura útil. */
function columnWidths(w: Writer, sec: ReportSection, rows: ReportSection['rows'], tz?: string): number[] {
  const want = sec.columns.map((c, ci) => {
    const lens = rows.map((row, ri) => w.font.widthOfTextAtSize(w.clean(displayCell(row[ci], cellFormat(sec, ri, ci), tz)), 8.5))
    return Math.max(w.bold.widthOfTextAtSize(w.clean(c), 8.5) * 0.8, ...lens, 30) + 10
  })
  const total = want.reduce((a, b) => a + b, 0)
  if (total <= WIDTH) return want.map((x) => (x / total) * WIDTH)
  // aperta as colunas largas primeiro
  const cap = WIDTH / sec.columns.length
  const small = want.filter((x) => x <= cap).reduce((a, b) => a + b, 0)
  const bigCount = want.filter((x) => x > cap).length
  const each = bigCount ? (WIDTH - small) / bigCount : cap
  const out = want.map((x) => (x <= cap ? x : each))
  const sum = out.reduce((a, b) => a + b, 0)
  return out.map((x) => (x / sum) * WIDTH)
}

function table(w: Writer, sec: ReportSection, tz: string | undefined, maxRows = MAX_ROWS) {
  const rows = sec.rows.slice(0, maxRows)
  const rowH = 15
  if (!w.ensure(22 + rowH * (Math.min(rows.length, 2) + 1))) return
  w.text(sec.heading, M, w.y, 12, { font: w.bold })
  w.y -= 8
  if (rows.length === 0) {
    w.y -= 10
    w.text('Sem registros no período.', M, w.y, 9, { color: SUAVE })
    w.y -= 18
    return
  }
  const widths = columnWidths(w, sec, rows, tz)
  const drawRow = (cells: string[], opts: { head?: boolean; numeric?: boolean[]; zebra?: boolean }) => {
    w.page.drawRectangle({ x: M, y: w.y - rowH, width: WIDTH, height: rowH, color: opts.head ? FUNDO : opts.zebra ? rgb(0.985, 0.985, 0.985) : rgb(1, 1, 1) })
    w.page.drawLine({ start: { x: M, y: w.y - rowH }, end: { x: M + WIDTH, y: w.y - rowH }, thickness: 0.5, color: LINHA })
    let x = M
    cells.forEach((c, i) => {
      const font = opts.head ? w.bold : w.font
      const t = w.fit(c, 8.5, widths[i] - 8, font)
      const tx = opts.numeric?.[i] ? x + widths[i] - 4 - font.widthOfTextAtSize(t, 8.5) : x + 4
      w.text(t, tx, w.y - rowH + 4.5, 8.5, { font })
      x += widths[i]
    })
    w.y -= rowH
  }
  // colunas numéricas (e a coluna "Valor" das tabelas indicador/valor) alinham à direita, cabeçalho incluso
  const last = sec.columns.length - 1
  const right = sec.columns.map((_, ci) => isNumeric(sec.formats?.[ci]) || (!!sec.rowFormats && ci === last))
  w.y -= 4
  drawRow(sec.columns, { head: true, numeric: right })
  for (let ri = 0; ri < rows.length; ri++) {
    if (!w.ensure(rowH)) return
    if (w.y === A4[1] - M) drawRow(sec.columns, { head: true, numeric: right }) // repete o cabeçalho na página nova
    const fmts = sec.columns.map((_, ci) => cellFormat(sec, ri, ci))
    drawRow(sec.columns.map((_, ci) => displayCell(rows[ri][ci], fmts[ci], tz)), { numeric: fmts.map((f, ci) => right[ci] || isNumeric(f)), zebra: ri % 2 === 1 })
  }
  if (sec.rows.length > rows.length && w.ensure(14)) {
    w.y -= 11
    w.text(`+ ${sec.rows.length - rows.length} linha(s): veja o arquivo completo em XLSX ou CSV.`, M, w.y, 8, { color: SUAVE })
  }
  w.y -= 18
}

export async function toPdf(r: ReportContent): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`${r.title} — ${r.orgName}`)
  doc.setAuthor('AtendeRadar')
  doc.setProducer('AtendeRadar')
  doc.setCreator('AtendeRadar')
  doc.setLanguage('pt-BR')
  doc.setCreationDate(new Date(r.generatedAt))
  const w = new Writer(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold))
  const tz = r.timezone

  header(w, r)
  cards(w, r)
  summary(w, r)

  // Diário/semanal: o que pede ação primeiro (top 5), depois os indicadores; os demais tipos seguem a ordem do relatório.
  const byKey = (k: string) => r.sections.find((s) => s.key === k)
  const ordered = r.highlights
    ? [byKey('top_recover'), byKey('kpis'), ...r.sections.filter((s) => s.key !== 'top_recover' && s.key !== 'kpis')].filter((s): s is ReportSection => !!s)
    : r.sections
  for (const sec of ordered) {
    if (w.full) break
    table(w, sec, tz, sec.key === 'top_recover' ? 5 : sec.key === 'kpis' ? 20 : MAX_ROWS)
  }

  const pages = doc.getPages()
  pages.forEach((p, i) => {
    const font = w.font
    const note = w.full ? 'Resumo executivo; o relatório completo está no XLSX/CSV.  ·  ' : ''
    const label = w.clean(`${note}AtendeRadar  ·  página ${i + 1} de ${pages.length}`)
    p.drawLine({ start: { x: M, y: M }, end: { x: A4[0] - M, y: M }, thickness: 0.5, color: LINHA })
    p.drawText(label, { x: M, y: M - 14, size: 8, font, color: SUAVE })
  })
  return doc.save()
}
