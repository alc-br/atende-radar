import type { ReportContent } from './build'

// Células que começam com = + - @ viram fórmula no Excel (injeção de planilha): o texto vem de clientes, então é neutralizado.
const safeCell = (v: string | number) => {
  const s = String(v ?? '')
  return /^[=+\-@\t\r]/.test(s) && typeof v === 'string' ? `'${s}` : s
}
const csvField = (v: string | number) => {
  const s = safeCell(v)
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const dateBR = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

/** CSV para Excel brasileiro: separador ";" e BOM UTF-8 (acentos corretos). */
export function toCsv(r: ReportContent): string {
  const lines: string[] = [
    csvField(r.title),
    `${csvField('Empresa')};${csvField(r.orgName)}`,
    `${csvField('Período')};${csvField(`${dateBR(r.periodStart)} a ${dateBR(r.periodEnd)}`)}`,
    `${csvField('Gerado em')};${csvField(dateBR(r.generatedAt))}`,
    '',
  ]
  for (const s of r.summary) lines.push(csvField(s))
  if (r.summary.length) lines.push('')
  for (const sec of r.sections) {
    lines.push(csvField(sec.heading))
    lines.push(sec.columns.map(csvField).join(';'))
    for (const row of sec.rows) lines.push(row.map(csvField).join(';'))
    lines.push('')
  }
  return '﻿' + lines.join('\r\n')
}

const esc = (v: string | number) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** HTML imprimível (o navegador salva como PDF em "Imprimir"). Todo conteúdo é escapado. */
export function toHtml(r: ReportContent): string {
  const sections = r.sections
    .map(
      (s) => `<h2>${esc(s.heading)}</h2>
${s.rows.length === 0 ? '<p class="empty">Sem registros no período.</p>' : ''}
<table><thead><tr>${s.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
<tbody>${s.rows.map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
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
  th{background:#f3f4f6} tr:nth-child(even) td{background:#fafafa}
  .empty{color:#777;font-style:italic} .summary li{margin:2px 0}
  footer{margin-top:32px;color:#888;font-size:12px}
  @media print{body{margin:0} button{display:none}}
</style></head><body>
<header><h1>${esc(r.title)}</h1>
<div class="meta">${esc(r.orgName)} · Período: ${esc(dateBR(r.periodStart))} a ${esc(dateBR(r.periodEnd))} · Gerado em ${esc(dateBR(r.generatedAt))}</div></header>
${r.summary.length ? `<ul class="summary">${r.summary.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
${sections}
<footer>Gerado pelo AtendeRadar. Para salvar em PDF: Imprimir → Salvar como PDF.</footer>
</body></html>`
}
