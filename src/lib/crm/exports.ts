import { db } from '@/lib/db'
import { decryptPhone, formatPhone } from '@/lib/phone-crypto'
import { LOST_REASON_LABEL } from './outcome'
import { memberNames } from './queries'

// Exportação do CRM em CSV (só admin, com a sub-flag crm.exports ligada). O arquivo é gerado e devolvido na própria
// resposta: nada fica guardado no servidor. Telefone sai mascarado (só os 4 últimos), a menos que quem exporta marque
// e confirme o número completo; a rota audita as duas formas. Separador ";" e BOM, como os demais CSV do produto
// (abre direto no Excel em português).

export const EXPORT_MAX_ROWS = 20_000

/** Célula sem fórmula: texto que começa com = + - @ (ou tab, CR) ganha apóstrofo, contra injeção na planilha. */
export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  let s = String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const toCsv = (rows: (string | number | null | undefined)[][]) => '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n'
const money = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2).replace('.', ','))
const date = (d: Date | null) => (d ? d.toISOString() : '')

const STATUS: Record<string, string> = { active: 'Ativa', archived: 'Arquivada', open: 'Aberto', won: 'Ganho', lost: 'Perdido' }

export async function exportPeople(organizationId: string, opts: { fullPhone: boolean }) {
  const rows = await db.crmPerson.findMany({
    where: { organizationId, status: { in: ['active', 'archived'] } },
    orderBy: { createdAt: 'asc' },
    take: EXPORT_MAX_ROWS,
    include: { company: { select: { name: true } } },
  })
  const owners = new Map((await memberNames(db, organizationId, rows.map((r) => r.ownerMemberId))).map((m) => [m.id, m.name]))
  const phone = (p: (typeof rows)[number]) => {
    if (!p.phoneLast4) return ''
    if (!opts.fullPhone) return `•••• ${p.phoneLast4}`
    const digits = decryptPhone(organizationId, p.phoneEncrypted)
    return digits ? formatPhone(digits) : `•••• ${p.phoneLast4}`
  }
  const tags = (json: string | null) => {
    try {
      const v = JSON.parse(json || '[]')
      return Array.isArray(v) ? v.join(', ') : ''
    } catch {
      return ''
    }
  }
  const csv = toCsv([
    ['ID', 'Nome', 'E-mail', 'Telefone', 'Empresa', 'Etiquetas', 'Responsável', 'Origem', 'Situação', 'Criada em (UTC)', 'Última interação (UTC)'],
    ...rows.map((p) => [p.id, p.name, p.email, phone(p), p.company?.name, tags(p.tagsJson), p.ownerMemberId ? owners.get(p.ownerMemberId) : '', p.source, STATUS[p.status] ?? p.status, date(p.createdAt), date(p.lastInteractionAt)]),
  ])
  return { csv, rows: rows.length, truncated: rows.length === EXPORT_MAX_ROWS }
}

export async function exportDeals(organizationId: string) {
  const rows = await db.crmDeal.findMany({
    where: { organizationId, status: { not: 'archived' } },
    orderBy: { createdAt: 'asc' },
    take: EXPORT_MAX_ROWS,
    include: { pipeline: { select: { name: true } }, stage: { select: { name: true } }, person: { select: { name: true } }, company: { select: { name: true } } },
  })
  const owners = new Map((await memberNames(db, organizationId, rows.map((r) => r.ownerMemberId))).map((m) => [m.id, m.name]))
  const csv = toCsv([
    ['ID', 'Título', 'Funil', 'Etapa', 'Situação', 'Valor declarado (R$)', 'Valor estimado pela análise (R$)', 'Responsável', 'Pessoa', 'Empresa', 'Origem', 'Criado em (UTC)', 'Fechado em (UTC)', 'Motivo da perda'],
    ...rows.map((d) => [
      d.id,
      d.title,
      d.pipeline.name,
      d.stage.name,
      STATUS[d.status] ?? d.status,
      money(d.amountCents),
      money(d.estimatedAmountCents),
      d.ownerMemberId ? owners.get(d.ownerMemberId) : '',
      d.person?.name,
      d.company?.name,
      d.source,
      date(d.createdAt),
      date(d.closedAt),
      d.lostReasonCode ? LOST_REASON_LABEL[d.lostReasonCode as keyof typeof LOST_REASON_LABEL] ?? d.lostReasonCode : '',
    ]),
  ])
  return { csv, rows: rows.length, truncated: rows.length === EXPORT_MAX_ROWS }
}
