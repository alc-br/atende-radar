import type { Prisma } from '@prisma/client'
import { encryptPhone } from '@/lib/phone-crypto'
import { phoneHash } from '@/lib/phone-hash'
import { addDealEvent, checkOwner, DomainError, type Actor, type Tx } from './deals'
import { companyWhere, personWhere, type OwnerScope } from './scope'
import { cleanText, normEmail, normName, personEmailKey, personPhoneKey, phoneDigits } from './text'

// Pessoas e empresas comerciais (CRM-01). A pessoa é separada do contato observado no WhatsApp (D4) e ligada a ele
// por CrmIdentityLink. Telefone: cifrado com a chave do contato (encryptPhone), hash por empresa e 4 últimos dígitos
// em claro; nunca em log, auditoria ou histórico. Duplicidade só dentro da empresa, por phoneKey/emailKey (únicos
// enquanto a pessoa está ativa; arquivar ou mesclar libera a chave).

export interface PersonInput {
  name: string
  email?: string | null
  phone?: string | null
  companyId?: string | null
  ownerMemberId?: string | null
  notes?: string | null
  tags?: string[]
}

export type PersonPatch = Partial<PersonInput> & { version: number }

export interface CompanyInput {
  name: string
  taxId?: string | null
  domain?: string | null
  segment?: string | null
  ownerMemberId?: string | null
  notes?: string | null
}

export type CompanyPatch = Partial<CompanyInput> & { version: number }

const personNotFound = () => new DomainError(404, 'crm_not_found', 'Pessoa não encontrada.')
const companyNotFound = () => new DomainError(404, 'crm_not_found', 'Empresa não encontrada.')
const stale = (what: string, version: number) =>
  new DomainError(409, 'crm_version_conflict', `Esta ${what} foi alterada por outra pessoa. Recarregue e tente de novo.`, { currentVersion: version })

/** Campos de telefone a gravar (cifrado, hash, 4 últimos, chave de duplicidade). `null` limpa. */
function phoneFields(organizationId: string, raw: string | null) {
  if (raw === null || !raw.trim()) return { phoneEncrypted: null, phoneHash: null, phoneLast4: null, phoneKey: null }
  const digits = phoneDigits(raw)
  if (!digits) throw new DomainError(400, 'crm_invalid', 'Telefone inválido (use DDD e número).')
  return { phoneEncrypted: encryptPhone(organizationId, digits), phoneHash: phoneHash(organizationId, digits), phoneLast4: digits.slice(-4), phoneKey: personPhoneKey(organizationId, digits) }
}

function emailFields(organizationId: string, raw: string | null) {
  const emailNorm = normEmail(raw)
  return { email: emailNorm, emailNorm, emailKey: emailNorm ? personEmailKey(organizationId, emailNorm) : null }
}

/** Telefone ou e-mail já usado por outra pessoa ativa da empresa: 409 crm_duplicate (o ID só para quem a enxerga). */
async function checkDuplicate(tx: Tx, organizationId: string, scope: OwnerScope, keys: { phoneKey?: string | null; emailKey?: string | null }, selfId?: string) {
  for (const [field, key] of [['telefone', keys.phoneKey], ['e-mail', keys.emailKey]] as const) {
    if (!key) continue
    const other = await tx.crmPerson.findFirst({ where: field === 'telefone' ? { phoneKey: key } : { emailKey: key }, select: { id: true } })
    if (!other || other.id === selfId) continue
    const visible = await tx.crmPerson.findFirst({ where: { id: other.id, ...personWhere(organizationId, scope) }, select: { id: true } })
    throw new DomainError(409, 'crm_duplicate', `Já existe uma pessoa com este ${field} na empresa.`, visible ? { existingId: other.id } : {})
  }
}

async function checkCompany(tx: Tx, organizationId: string, scope: OwnerScope, companyId: string | null | undefined) {
  if (!companyId) return
  const c = await tx.crmCompany.findFirst({ where: { id: companyId, status: 'active', ...companyWhere(organizationId, scope) }, select: { id: true } })
  if (!c) throw new DomainError(400, 'crm_invalid', 'Empresa não encontrada.')
}

const cleanTags = (tags: string[]) => JSON.stringify([...new Set(tags.map((t) => cleanText(t, 40)).filter(Boolean))].slice(0, 20))

function tagsOf(json: string | null): string[] {
  try {
    const v = JSON.parse(json || '[]')
    return Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : []
  } catch {
    return []
  }
}

export async function createPerson(
  tx: Tx,
  organizationId: string,
  scope: OwnerScope,
  input: PersonInput,
  actor: Actor,
  origin: { source?: 'manual' | 'whatsapp' | 'import'; importBatchId?: string } = {},
) {
  const owner = input.ownerMemberId === undefined && scope.kind === 'own' ? scope.memberId : input.ownerMemberId ?? null
  await checkOwner(tx, organizationId, scope, owner)
  await checkCompany(tx, organizationId, scope, input.companyId)
  const phone = phoneFields(organizationId, input.phone ?? null)
  const email = emailFields(organizationId, input.email ?? null)
  await checkDuplicate(tx, organizationId, scope, { phoneKey: phone.phoneKey, emailKey: email.emailKey })
  const name = cleanText(input.name, 120)
  return tx.crmPerson.create({
    data: {
      organizationId,
      name,
      nameNorm: normName(name),
      ...email,
      ...phone,
      companyId: input.companyId ?? null,
      ownerMemberId: owner,
      source: origin.source ?? 'manual',
      notes: input.notes ? cleanText(input.notes, 5000) : null,
      tagsJson: cleanTags(input.tags ?? []),
      importBatchId: origin.importBatchId ?? null,
      createdBy: actor.memberId,
    },
  })
}

export async function loadPerson(tx: Tx, organizationId: string, scope: OwnerScope, id: string, version?: number) {
  const p = await tx.crmPerson.findFirst({ where: { id, ...personWhere(organizationId, scope) } })
  if (!p) throw personNotFound()
  if (version !== undefined && p.version !== version) throw stale('pessoa', p.version)
  return p
}

async function bumpPerson(tx: Tx, cur: { id: string; version: number }, data: Prisma.CrmPersonUncheckedUpdateManyInput) {
  const r = await tx.crmPerson.updateMany({ where: { id: cur.id, version: cur.version }, data: { ...data, version: { increment: 1 } } })
  if (!r.count) {
    const now = await tx.crmPerson.findUnique({ where: { id: cur.id }, select: { version: true } })
    throw stale('pessoa', now?.version ?? cur.version)
  }
  return tx.crmPerson.findUniqueOrThrow({ where: { id: cur.id } })
}

export async function updatePerson(tx: Tx, organizationId: string, scope: OwnerScope, id: string, patch: PersonPatch) {
  const cur = await loadPerson(tx, organizationId, scope, id, patch.version)
  if (cur.status !== 'active') throw new DomainError(409, 'crm_invalid_transition', 'Pessoa arquivada ou mesclada não pode ser editada.')
  const data: Prisma.CrmPersonUncheckedUpdateManyInput = {}
  if (patch.ownerMemberId !== undefined && patch.ownerMemberId !== cur.ownerMemberId) {
    if (scope.kind === 'own') throw new DomainError(403, 'crm_forbidden', 'Só o supervisor ou o gestor troca o responsável.')
    await checkOwner(tx, organizationId, scope, patch.ownerMemberId)
    data.ownerMemberId = patch.ownerMemberId
  }
  if (patch.companyId !== undefined) {
    await checkCompany(tx, organizationId, scope, patch.companyId)
    data.companyId = patch.companyId
  }
  if (patch.name !== undefined) {
    data.name = cleanText(patch.name, 120)
    data.nameNorm = normName(data.name)
  }
  if (patch.phone !== undefined) Object.assign(data, phoneFields(organizationId, patch.phone))
  if (patch.email !== undefined) Object.assign(data, emailFields(organizationId, patch.email))
  await checkDuplicate(tx, organizationId, scope, { phoneKey: data.phoneKey as string | null | undefined, emailKey: data.emailKey as string | null | undefined }, cur.id)
  if (patch.notes !== undefined) data.notes = patch.notes ? cleanText(patch.notes, 5000) : null
  if (patch.tags !== undefined) data.tagsJson = cleanTags(patch.tags)
  if (!Object.keys(data).length) return cur
  return bumpPerson(tx, cur, data)
}

/** Arquiva (soft delete): some das listas e libera telefone e e-mail para outra pessoa. Negócios ficam como estão. */
export async function archivePerson(tx: Tx, organizationId: string, scope: OwnerScope, id: string, version: number) {
  const cur = await loadPerson(tx, organizationId, scope, id, version)
  if (cur.status === 'archived') return cur
  if (cur.status !== 'active') throw new DomainError(409, 'crm_invalid_transition', 'Pessoa mesclada não pode ser arquivada.')
  return bumpPerson(tx, cur, { status: 'archived', phoneKey: null, emailKey: null })
}

/**
 * Mescla `mergeId` em `keepId` (só admin e gestor: escopo da empresa). Move negócios, atividades e vínculos com o
 * WhatsApp; completa na pessoa mantida o que faltava (e-mail, telefone, empresa, responsável, etiquetas). A mesclada
 * fica com status "merged", `mergedIntoId` e, em `mergeDataJson`, o que foi movido (para desfazer à mão, se preciso).
 */
export async function mergePeople(tx: Tx, organizationId: string, input: { keepId: string; mergeId: string; keepVersion: number; mergeVersion: number }, actor: Actor) {
  if (input.keepId === input.mergeId) throw new DomainError(400, 'crm_invalid', 'Escolha duas pessoas diferentes.')
  const all: OwnerScope = { kind: 'all' }
  const keep = await loadPerson(tx, organizationId, all, input.keepId, input.keepVersion)
  const merge = await loadPerson(tx, organizationId, all, input.mergeId, input.mergeVersion)
  if (keep.status !== 'active' || merge.status !== 'active') throw new DomainError(409, 'crm_invalid_transition', 'Só pessoas ativas podem ser mescladas.')

  const deals = await tx.crmDeal.findMany({ where: { organizationId, personId: merge.id }, select: { id: true, organizationId: true, version: true } })
  const activities = await tx.crmActivity.findMany({ where: { organizationId, personId: merge.id }, select: { id: true } })
  const links = await tx.crmIdentityLink.findMany({ where: { organizationId, entityType: 'contact', externalId: merge.id }, select: { id: true } })

  for (const d of deals) {
    await tx.crmDeal.update({ where: { id: d.id }, data: { personId: keep.id, version: { increment: 1 } } })
    await addDealEvent(tx, { ...d, version: d.version + 1 }, 'updated', actor, { data: { fields: ['personId'], mergedFrom: merge.id } })
  }
  if (activities.length) await tx.crmActivity.updateMany({ where: { id: { in: activities.map((a) => a.id) } }, data: { personId: keep.id } })
  if (links.length) await tx.crmIdentityLink.updateMany({ where: { id: { in: links.map((l) => l.id) } }, data: { externalId: keep.id } })

  // libera as chaves da mesclada antes de passá-las para a mantida (são únicas)
  await tx.crmPerson.update({
    where: { id: merge.id },
    data: {
      status: 'merged',
      mergedIntoId: keep.id,
      phoneKey: null,
      emailKey: null,
      version: { increment: 1 },
      mergeDataJson: JSON.stringify({ deals: deals.map((d) => d.id), activities: activities.map((a) => a.id), identityLinks: links.map((l) => l.id), at: new Date().toISOString(), by: actor.memberId }),
    },
  })
  const fill: Prisma.CrmPersonUncheckedUpdateManyInput = {}
  if (!keep.emailKey && merge.emailKey) Object.assign(fill, { email: merge.email, emailNorm: merge.emailNorm, emailKey: merge.emailKey })
  if (!keep.phoneKey && merge.phoneKey) Object.assign(fill, { phoneEncrypted: merge.phoneEncrypted, phoneHash: merge.phoneHash, phoneLast4: merge.phoneLast4, phoneKey: merge.phoneKey })
  if (!keep.companyId && merge.companyId) fill.companyId = merge.companyId
  if (!keep.ownerMemberId && merge.ownerMemberId) fill.ownerMemberId = merge.ownerMemberId
  fill.tagsJson = cleanTags([...tagsOf(keep.tagsJson), ...tagsOf(merge.tagsJson)])
  if (merge.lastInteractionAt && (!keep.lastInteractionAt || merge.lastInteractionAt > keep.lastInteractionAt)) fill.lastInteractionAt = merge.lastInteractionAt
  const kept = await bumpPerson(tx, keep, fill)
  return { person: kept, moved: { deals: deals.length, activities: activities.length, identityLinks: links.length } }
}

// ── Empresas ─────────────────────────────────────────────────────────────────

const taxDigits = (v: string | null | undefined) => (v ? v.replace(/\D/g, '') : null)

async function checkTaxId(tx: Tx, organizationId: string, taxId: string | null, selfId?: string) {
  if (!taxId) return
  const other = await tx.crmCompany.findFirst({ where: { organizationId, taxId, status: 'active', ...(selfId ? { id: { not: selfId } } : {}) }, select: { id: true } })
  if (other) throw new DomainError(409, 'crm_duplicate', 'Já existe uma empresa com este CNPJ.')
}

export async function createCompany(tx: Tx, organizationId: string, scope: OwnerScope, input: CompanyInput, actor: Actor, origin: { importBatchId?: string } = {}) {
  const owner = input.ownerMemberId === undefined && scope.kind === 'own' ? scope.memberId : input.ownerMemberId ?? null
  await checkOwner(tx, organizationId, scope, owner)
  const taxId = taxDigits(input.taxId)
  await checkTaxId(tx, organizationId, taxId)
  const name = cleanText(input.name, 120)
  return tx.crmCompany.create({
    data: {
      organizationId,
      name,
      nameNorm: normName(name),
      taxId,
      domain: input.domain?.toLowerCase() ?? null,
      segment: input.segment ? cleanText(input.segment, 80) : null,
      ownerMemberId: owner,
      notes: input.notes ? cleanText(input.notes, 5000) : null,
      importBatchId: origin.importBatchId ?? null,
      createdBy: actor.memberId,
    },
  })
}

export async function loadCompany(tx: Tx, organizationId: string, scope: OwnerScope, id: string, version?: number) {
  const c = await tx.crmCompany.findFirst({ where: { id, ...companyWhere(organizationId, scope) } })
  if (!c) throw companyNotFound()
  if (version !== undefined && c.version !== version) throw stale('empresa', c.version)
  return c
}

async function bumpCompany(tx: Tx, cur: { id: string; version: number }, data: Prisma.CrmCompanyUncheckedUpdateManyInput) {
  const r = await tx.crmCompany.updateMany({ where: { id: cur.id, version: cur.version }, data: { ...data, version: { increment: 1 } } })
  if (!r.count) {
    const now = await tx.crmCompany.findUnique({ where: { id: cur.id }, select: { version: true } })
    throw stale('empresa', now?.version ?? cur.version)
  }
  return tx.crmCompany.findUniqueOrThrow({ where: { id: cur.id } })
}

export async function updateCompany(tx: Tx, organizationId: string, scope: OwnerScope, id: string, patch: CompanyPatch) {
  const cur = await loadCompany(tx, organizationId, scope, id, patch.version)
  if (cur.status !== 'active') throw new DomainError(409, 'crm_invalid_transition', 'Empresa arquivada não pode ser editada.')
  const data: Prisma.CrmCompanyUncheckedUpdateManyInput = {}
  if (patch.ownerMemberId !== undefined && patch.ownerMemberId !== cur.ownerMemberId) {
    if (scope.kind === 'own') throw new DomainError(403, 'crm_forbidden', 'Só o supervisor ou o gestor troca o responsável.')
    await checkOwner(tx, organizationId, scope, patch.ownerMemberId)
    data.ownerMemberId = patch.ownerMemberId
  }
  if (patch.name !== undefined) {
    data.name = cleanText(patch.name, 120)
    data.nameNorm = normName(data.name)
  }
  if (patch.taxId !== undefined) {
    data.taxId = taxDigits(patch.taxId)
    await checkTaxId(tx, organizationId, data.taxId, cur.id)
  }
  if (patch.domain !== undefined) data.domain = patch.domain?.toLowerCase() ?? null
  if (patch.segment !== undefined) data.segment = patch.segment ? cleanText(patch.segment, 80) : null
  if (patch.notes !== undefined) data.notes = patch.notes ? cleanText(patch.notes, 5000) : null
  if (!Object.keys(data).length) return cur
  return bumpCompany(tx, cur, data)
}

export async function archiveCompany(tx: Tx, organizationId: string, scope: OwnerScope, id: string, version: number) {
  const cur = await loadCompany(tx, organizationId, scope, id, version)
  if (cur.status === 'archived') return cur
  return bumpCompany(tx, cur, { status: 'archived' })
}
