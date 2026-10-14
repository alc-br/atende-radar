import { cellFormat, dateBR, displayCell, type CellFormat, type CellValue, type ReportContent } from './types'

// Células que começam com = + - @ viram fórmula no Excel (injeção de planilha): o texto vem de clientes, então é neutralizado.
const safeCell = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s)
const csvField = (s: string) => {
  const v = safeCell(s)
  return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}
/**
 * Célula do CSV: número sem separador de milhar e com vírgula decimal (o Excel brasileiro lê como número). Valor em
 * dinheiro também vai como número (o "(R$)" está no cabeçalho), com no máximo 2 casas.
 */
function csvCell(v: CellValue | undefined, fmt: CellFormat | undefined, tz?: string): string {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const n = fmt === 'int' ? Math.round(v) : fmt === 'money' ? Math.round(v * 100) / 100 : v
    return String(n).replace('.', ',')
  }
  if (v === null || v === undefined || v === '') return fmt === 'date' ? '—' : ''
  return csvField(displayCell(v, fmt, tz))
}

/** CSV para Excel brasileiro: separador ";" e BOM UTF-8 (acentos corretos). */
export function toCsv(r: ReportContent): string {
  const tz = r.timezone
  const lines: string[] = [
    csvField(r.title),
    `${csvField('Empresa')};${csvField(r.orgName)}`,
    `${csvField('Período')};${csvField(`${dateBR(r.periodStart, tz)} a ${dateBR(r.periodEnd, tz)}`)}`,
    `${csvField('Gerado em')};${csvField(dateBR(r.generatedAt, tz))}`,
    '',
  ]
  for (const s of r.summary) lines.push(csvField(s))
  if (r.summary.length) lines.push('')
  for (const sec of r.sections) {
    lines.push(csvField(sec.heading))
    lines.push(sec.columns.map(csvField).join(';'))
    sec.rows.forEach((row, ri) => lines.push(row.map((v, ci) => csvCell(v, cellFormat(sec, ri, ci), tz)).join(';')))
    lines.push('')
  }
  return '﻿' + lines.join('\r\n')
}

const esc = (v: string | number) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const isNumeric = (f: CellFormat | undefined) => f === 'int' || f === 'decimal' || f === 'money'

/** HTML imprimível (o navegador salva como PDF em "Imprimir"). Todo conteúdo é escapado. */
export function toHtml(r: ReportContent): string {
  const tz = r.timezone
  const sections = r.sections
    .map(
      (s) => `<h2>${esc(s.heading)}</h2>
${s.rows.length === 0 ? '<p class="empty">Sem registros no período.</p>' : ''}
<table><thead><tr>${s.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
<tbody>${s.rows
        .map((row, ri) => `<tr>${row.map((c, ci) => {
          const f = cellFormat(s, ri, ci)
          return `<td${isNumeric(f) ? ' class="num"' : ''}>${esc(displayCell(c, f, tz))}</td>`
        }).join('')}</tr>`)
        .join('')}</tbody></table>`
    )
    .join('\n')
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(r.title)} — ${esc(r.orgName)}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:32px auto;max-width:960px;padding:0 16px}
  header{border-bottom:3px solid #059669;padding-bottom:12px;margin-bottom:16px}
  h1{margin:0;font-size:24px} h2{margin:28px 0 8px;font-size:17px}
  .meta{color:#555;font-size:13px;margin-top:4px}
  table{border-collapse:collapse;width:100%;font-size:13px} th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}
  td.num{text-align:right;white-space:nowrap}
  th{background:#f3f4f6} tr:nth-child(even) td{background:#fafafa}
  .empty{color:#777;font-style:italic} .summary li{margin:2px 0}
  footer{margin-top:32px;color:#888;font-size:12px}
  @media print{body{margin:0} button{display:none}}
</style></head><body>
<header><h1>${esc(r.title)}</h1>
<div class="meta">${esc(r.orgName)} · Período: ${esc(dateBR(r.periodStart, tz))} a ${esc(dateBR(r.periodEnd, tz))} · Gerado em ${esc(dateBR(r.generatedAt, tz))}</div></header>
${r.summary.length ? `<ul class="summary">${r.summary.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
${sections}
<footer>Gerado pelo AtendeRadar. Também disponível em PDF, XLSX, CSV e JSON no histórico de relatórios.</footer>
</body></html>`
}

/** JSON da foto do relatório (valores crus: números como número, datas em ISO 8601). */
export function toJson(r: ReportContent): string {
  return JSON.stringify(r, null, 2)
}

/** Nome-base do arquivo: atenderadar-<tipo>-<AAAA-MM-DD>. */
export function reportFileName(type: string, createdAt: Date): string {
  return `atenderadar-${type.replace(/[^a-z_]/g, '')}-${createdAt.toISOString().slice(0, 10)}`
}
