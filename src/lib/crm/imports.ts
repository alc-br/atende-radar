import crypto from 'node:crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { crmTx, DomainError, type Actor } from './deals'
import { zodMessage } from './http'
import { createCompany, createPerson } from './people'
import { importRow } from './schemas'
import type { OwnerScope } from './scope'
import { cleanText, normEmail, normName, personEmailKey, personPhoneKey, phoneDigits } from './text'

// Importação de pessoas por planilha (CRM-01, só admin). A tela lê o arquivo e manda as linhas já com os nomes dos
// campos (name, email, phone, company, notes, tags). Duas passadas: prévia (dryRun) e gravação; a gravação refaz a
// validação, porque o banco pode ter mudado desde a prévia. Duplicado (telefone ou e-mail repetido na planilha ou já
// usado na empresa) é pulado, nunca sobrescreve. Empresa pelo nome: usa a ativa de mesmo nome ou cria.
// Grava em lotes de 200 linhas por transação, para não segurar o único escritor do SQLite (R17).

const CHUNK = 200
const ALL: OwnerScope = { kind: 'all' }
const emailOk = z.email()

export interface ImportReport {
  total: number
  valid: number
  created: number
  companiesToCreate: number
  /** linha da planilha (a 1 é o cabeçalho) e o campo repetido */
  duplicates: { row: number; field: 'telefone' | 'e-mail'; where: 'planilha' | 'empresa' }[]
  errors: { row: number; message: string }[]
  batchId: string | null
}

type Row = z.output<typeof importRow>
interface Parsed {
  row: number
  data: Row
  phoneKey: string | null
  emailKey: string | null
}

const splitTags = (v: string | null | undefined) => (v ? v.split(/[,;|]/).map((t) => t.trim()).filter(Boolean).slice(0, 20) : undefined)

async function existingKeys(organizationId: string, keys: string[]) {
  const found = new Set<string>()
  for (let i = 0; i < keys.length; i += 500) {
    const chunk = keys.slice(i, i + 500)
    const rows = await db.crmPerson.findMany({ where: { organizationId, OR: [{ phoneKey: { in: chunk } }, { emailKey: { in: chunk } }] }, select: { phoneKey: true, emailKey: true } })
    for (const r of rows) {
      if (r.phoneKey) found.add(r.phoneKey)
      if (r.emailKey) found.add(r.emailKey)
    }
  }
  return found
}

export async function importPeople(organizationId: string, rows: Record<string, unknown>[], dryRun: boolean, actor: Actor): Promise<ImportReport> {
  const report: ImportReport = { total: rows.length, valid: 0, created: 0, companiesToCreate: 0, duplicates: [], errors: [], batchId: null }
  const seen = new Set<string>()
  const parsed: Parsed[] = []
  rows.forEach((raw, i) => {
    const row = i + 2
    const p = importRow.safeParse(raw)
    if (!p.success) return void report.errors.push({ row, message: zodMessage(p.error) })
    let phoneKey: string | null = null
    if (p.data.phone?.trim()) {
      const digits = phoneDigits(p.data.phone)
      if (!digits) return void report.errors.push({ row, message: 'Telefone inválido (use DDD e número).' })
      phoneKey = personPhoneKey(organizationId, digits)
    }
    const email = normEmail(p.data.email)
    if (email && !emailOk.safeParse(email).success) return void report.errors.push({ row, message: 'E-mail inválido.' })
    const emailKey = email ? personEmailKey(organizationId, email) : null
    const repeated = phoneKey && seen.has(phoneKey) ? 'telefone' : emailKey && seen.has(emailKey) ? 'e-mail' : null
    if (repeated) return void report.duplicates.push({ row, field: repeated, where: 'planilha' })
    if (phoneKey) seen.add(phoneKey)
    if (emailKey) seen.add(emailKey)
    parsed.push({ row, data: p.data, phoneKey, emailKey })
  })

  const inOrg = await existingKeys(organizationId, [...seen])
  const fresh = parsed.filter((v) => {
    const field = v.phoneKey && inOrg.has(v.phoneKey) ? 'telefone' : v.emailKey && inOrg.has(v.emailKey) ? 'e-mail' : null
    if (field) report.duplicates.push({ row: v.row, field, where: 'empresa' })
    return !field
  })
  report.valid = fresh.length

  const companyNames = new Map<string, string>()
  for (const v of fresh) if (v.data.company?.trim()) companyNames.set(normName(v.data.company), cleanText(v.data.company, 120))
  const companyIds = new Map<string, string>()
  const names = [...companyNames.keys()]
  for (let i = 0; i < names.length; i += 500) {
    const found = await db.crmCompany.findMany({ where: { organizationId, status: 'active', nameNorm: { in: names.slice(i, i + 500) } }, select: { id: true, nameNorm: true } })
    for (const c of found) if (!companyIds.has(c.nameNorm)) companyIds.set(c.nameNorm, c.id)
  }
  report.companiesToCreate = names.filter((n) => !companyIds.has(n)).length
  if (dryRun) return report

  const batchId = crypto.randomUUID()
  report.batchId = batchId
  for (let i = 0; i < fresh.length; i += CHUNK) {
    const chunk = fresh.slice(i, i + CHUNK)
    // estado do lote em cópias locais: se a transação for repetida (disputa de escrita), nada da tentativa
    // desfeita fica no relatório nem no mapa de empresas
    const done = await crmTx(async (tx) => {
      const ids = new Map(companyIds)
      const dup: ImportReport['duplicates'] = []
      let created = 0
      for (const v of chunk) {
        const cn = v.data.company?.trim() ? normName(v.data.company) : null
        let companyId: string | null = cn ? ids.get(cn) ?? null : null
        if (cn && !companyId) {
          const c = await createCompany(tx, organizationId, ALL, { name: companyNames.get(cn) ?? v.data.company! }, actor, { importBatchId: batchId })
          ids.set(cn, c.id)
          companyId = c.id
        }
        try {
          await createPerson(
            tx,
            organizationId,
            ALL,
            { name: v.data.name, email: v.data.email ?? null, phone: v.data.phone ?? null, companyId, notes: v.data.notes ?? null, tags: splitTags(v.data.tags) },
            actor,
            { source: 'import', importBatchId: batchId },
          )
          created++
        } catch (e) {
          // criada por outra pessoa entre a checagem e a gravação: a checagem do domínio barra antes de escrever
          if (e instanceof DomainError && e.code === 'crm_duplicate') {
            dup.push({ row: v.row, field: v.phoneKey ? 'telefone' : 'e-mail', where: 'empresa' })
            continue
          }
          throw e
        }
      }
      return { ids, dup, created }
    })
    for (const [k, id] of done.ids) companyIds.set(k, id)
    report.duplicates.push(...done.dup)
    report.created += done.created
  }
  return report
}
