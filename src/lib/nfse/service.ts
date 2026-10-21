// Emissão e cancelamento das NFS-e das faturas da assinatura (Padrão Nacional).
// Fluxo: fatura paga (contratação ou renovação) → nota pendente → emitida. Fatura reembolsada → cancelamento da nota
// (ou "dispensada", se ainda não tinha saído). Tudo passa por uma fila com novas tentativas; o número da DPS é reservado
// e gravado ANTES do envio, então um reenvio nunca gera nota em dobro (se a 1ª chegou lá, a consulta pela DPS acha).
// Cancelamento só dentro do mês de competência (./prazo.ts); reembolso depois disso vira "cancel_expired" para a contabilidade.
import { db } from '@/lib/db'
import { pagarme, pagarmeConfig } from '@/lib/billing/pagarme'
import { onlyDigits } from '@/lib/billing/core'
import { buildCancel, buildDps, CANCEL_REASONS, type Endereco } from './xml'
import { signXml } from './sign'
import * as real from './client'
import * as fake from './fake'
import { certificate, nfseConfig, type NfseConfig } from './config'
import { cancelavel, foraDoPrazo } from './prazo'
import type { EmissaoOk, EventoOk, Falha } from './client'

export const VER_APLIC = 'AtendeRadar-1.0'
export const MAX_ATTEMPTS = 6
const BACKOFF_MIN = [1, 5, 15, 60, 180, 720]
export type CancelMotivo = keyof typeof CANCEL_REASONS

export interface Tomador {
  tipo: 'CPF' | 'CNPJ'
  documento: string
  nome: string
  email: string | null
  endereco: (Omit<Endereco, 'ibge'> & { ibge: string | null; cidade: string; uf: string }) | null
}

function api(cfg: NfseConfig) {
  const cert = certificate(cfg)
  return cfg.fake
    ? {
        cert,
        emitir: (xml: string) => fake.emitir(cert, xml),
        evento: (chave: string, xml: string) => fake.registrarEvento(cert, chave, xml),
        chavePorDps: (id: string) => fake.chavePorDps(id),
        consultar: (chave: string) => fake.consultarNfse(chave),
      }
    : {
        cert,
        emitir: (xml: string) => real.emitir(cert, cfg.ambiente, xml),
        evento: (chave: string, xml: string) => real.registrarEvento(cert, cfg.ambiente, chave, xml),
        chavePorDps: (id: string) => real.chavePorDps(cert, cfg.ambiente, id),
        consultar: (chave: string) => real.consultarNfse(cert, cfg.ambiente, chave),
      }
}

// ───────────── dados do tomador ─────────────

export interface CustomerData {
  name: string
  email: string
  documentType: 'CPF' | 'CNPJ'
  document: string
  address: { zipCode: string; street: string; number: string; complement?: string; neighborhood: string; city: string; state: string }
}

/** Guarda quem paga (checkout). Nunca derruba a cobrança: falha aqui só é registrada no log. */
export async function saveBillingCustomer(orgId: string, c: CustomerData): Promise<void> {
  const a = c.address
  const data = {
    name: c.name, email: c.email, documentType: c.documentType, document: onlyDigits(c.document),
    zipCode: onlyDigits(a.zipCode), street: a.street, number: a.number, complement: a.complement || null, neighborhood: a.neighborhood, city: a.city, state: a.state, ibge: null,
  }
  await db.billingCustomer.upsert({ where: { organizationId: orgId }, create: { organizationId: orgId, ...data }, update: data })
    .catch((e) => console.error('[nfse] falha ao guardar o tomador', orgId, e instanceof Error ? e.message : e))
}

/** Troca de cartão manda um endereço novo: atualiza o do tomador (quando já existe). */
export async function updateBillingAddress(orgId: string, a: CustomerData['address']): Promise<void> {
  await db.billingCustomer.updateMany({
    where: { organizationId: orgId },
    data: { zipCode: onlyDigits(a.zipCode), street: a.street, number: a.number, complement: a.complement || null, neighborhood: a.neighborhood, city: a.city, state: a.state, ibge: null },
  }).catch((e) => console.error('[nfse] falha ao atualizar o endereço do tomador', orgId, e instanceof Error ? e.message : e))
}

/** Código IBGE do município pelo CEP (ViaCEP). null se não achar; a nota sai sem o endereço do tomador. */
export async function ibgeFromCep(cep: string, cfg: NfseConfig): Promise<string | null> {
  const d = onlyDigits(cep)
  if (d.length !== 8) return null
  if (cfg.fake) return '4106902'
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    const j = (await r.json()) as { ibge?: string; erro?: unknown }
    return j.erro || !/^\d{7}$/.test(j.ibge ?? '') ? null : j.ibge!
  } catch {
    return null
  }
}

/** Tomador da nota: o que foi guardado no checkout; para quem contratou antes disso, o cliente no Pagar.me. */
async function resolveTomador(orgId: string, cfg: NfseConfig): Promise<Tomador | null> {
  let c = await db.billingCustomer.findUnique({ where: { organizationId: orgId } })
  if (!c) {
    const sub = await db.subscription.findUnique({ where: { organizationId: orgId }, select: { providerCustomerId: true } })
    const pc = pagarmeConfig()
    if (sub?.providerCustomerId && pc) {
      try {
        const cu = await pagarme.getCustomer(pc, sub.providerCustomerId)
        const addr = (cu.address ?? {}) as Record<string, string>
        // line_1 gravado pelo checkout: "número, rua, bairro"
        const [number, ...rest] = String(addr.line_1 ?? '').split(',').map((x) => x.trim())
        const neighborhood = rest.length > 1 ? rest.pop()! : ''
        const docType = String(cu.document_type ?? '').toUpperCase() === 'CNPJ' || onlyDigits(String(cu.document ?? '')).length === 14 ? 'CNPJ' : 'CPF'
        await saveBillingCustomer(orgId, {
          name: String(cu.name ?? ''), email: String(cu.email ?? ''), documentType: docType, document: String(cu.document ?? ''),
          address: { zipCode: addr.zip_code ?? '', street: rest.join(', '), number: number ?? '', complement: addr.line_2 ?? '', neighborhood, city: addr.city ?? '', state: addr.state ?? '' },
        })
        c = await db.billingCustomer.findUnique({ where: { organizationId: orgId } })
      } catch (e) {
        console.error('[nfse] cliente do Pagar.me indisponível', orgId, e instanceof Error ? e.message : e)
      }
    }
  }
  if (!c || !c.name || !c.document) return null
  let ibge = c.ibge
  if (!ibge && c.zipCode) {
    ibge = await ibgeFromCep(c.zipCode, cfg)
    if (ibge) await db.billingCustomer.update({ where: { organizationId: orgId }, data: { ibge } })
  }
  const completo = c.street && c.number && c.neighborhood && c.zipCode
  return {
    tipo: c.documentType === 'CNPJ' ? 'CNPJ' : 'CPF',
    documento: c.document,
    nome: c.name,
    email: c.email || null,
    endereco: completo ? { ibge, cep: c.zipCode, logradouro: c.street, numero: c.number, complemento: c.complement, bairro: c.neighborhood, cidade: c.city, uf: c.state } : null,
  }
}

// ───────────── fila ─────────────

const fmtDate = (d: Date | null | undefined) => (d ? d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '')

// Texto da atividade do CNAE 6311-9/00, definido pelo dono em 21/10/2026 (vai em toda nota, seguido do plano e do período).
const SERVICO =
  'Tratamento e processamento contínuo de dados empresariais. Prestação de serviços de tratamento e processamento automatizado de dados empresariais, ' +
  'incluindo análise contínua de comunicações comerciais, identificação de padrões de atendimento, produção de indicadores de desempenho, ' +
  'emissão de relatórios gerenciais, diagnósticos e alertas por meio de infraestrutura tecnológica própria. Serviço'

function descricao(inv: { planName: string | null; billingCycle: string | null; periodStart: Date | null; periodEnd: Date | null }): string {
  const ciclo = inv.billingCycle === 'annual' ? 'anual' : 'mensal'
  const periodo = inv.periodStart && inv.periodEnd ? ` - período de ${fmtDate(inv.periodStart)} a ${fmtDate(inv.periodEnd)}` : ''
  return `${SERVICO} AtendeRadar, plano ${inv.planName ?? 'contratado'}, assinatura ${ciclo}${periodo}.`
}

/**
 * Cria as notas pendentes das faturas pagas (a partir de NFSE_DESDE) e marca para cancelar as das faturas reembolsadas.
 * Idempotente. Em produção, só faturas cobradas com as chaves reais do Pagar.me.
 */
export async function enqueueNfse(now = new Date()): Promise<{ created: number; toCancel: number; skipped: number; expired: number; error?: string }> {
  const c = nfseConfig()
  if (!c.ok) return { created: 0, toCancel: 0, skipped: 0, expired: 0, ...(c.off ? {} : { error: c.error }) }
  const cfg = c.cfg
  if (cfg.ambiente === 'producao' && pagarmeConfig()?.mode !== 'live') return { created: 0, toCancel: 0, skipped: 0, expired: 0, error: 'NFS-e em produção exige o Pagar.me com chaves reais (PAGARME_MODE=live)' }

  const paid = await db.billingInvoice.findMany({
    where: { status: 'paid', paidAt: { gte: cfg.desde, lte: now }, amountCents: { gt: 0 }, organization: { isSimulation: false } },
    select: { id: true, organizationId: true, providerInvoiceId: true, amountCents: true, paidAt: true, planName: true, billingCycle: true, periodStart: true, periodEnd: true },
    orderBy: { paidAt: 'asc' },
    take: 500,
  })
  const existing = new Set((await db.nfseDocument.findMany({ where: { billingInvoiceId: { in: paid.map((p) => p.id) } }, select: { billingInvoiceId: true } })).map((d) => d.billingInvoiceId))
  let created = 0
  for (const inv of paid) {
    if (existing.has(inv.id)) continue
    try {
      await db.nfseDocument.create({
        data: {
          organizationId: inv.organizationId, billingInvoiceId: inv.id, providerInvoiceId: inv.providerInvoiceId, ambiente: cfg.ambiente, serie: cfg.serie,
          amountCents: inv.amountCents, competencia: inv.paidAt!, descricao: descricao(inv),
        },
      })
      created++
    } catch (e) {
      if (!(e instanceof Error && /Unique constraint/i.test(e.message))) throw e // outro processo criou ao mesmo tempo
    }
  }

  // reembolsos: nota emitida → cancelar (se ainda no mês de competência); nota que ainda não saiu → dispensada
  const refunded = await db.billingInvoice.findMany({ where: { status: 'refunded' }, select: { id: true }, take: 2000 })
  const docs = await db.nfseDocument.findMany({ where: { billingInvoiceId: { in: refunded.map((r) => r.id) }, status: { in: ['issued', 'pending', 'failed'] } } })
  let toCancel = 0
  let skipped = 0
  let expired = 0
  for (const d of docs) {
    if (d.status === 'issued' && !cancelavel(d.competencia, now)) {
      const r = await db.nfseDocument.updateMany({
        where: { id: d.id, status: 'issued' },
        data: { status: 'cancel_expired', cancelRequestedAt: now, lastError: `Fatura reembolsada. ${foraDoPrazo(d.competencia)}` },
      })
      expired += r.count
    } else if (d.status === 'issued') {
      const r = await db.nfseDocument.updateMany({
        where: { id: d.id, status: 'issued' },
        data: { status: 'cancel_pending', cancelMotivo: 'naoPrestado', cancelReason: 'Contratação desfeita pelo cliente com reembolso integral do pagamento', cancelRequestedAt: now, attempts: 0, nextAttemptAt: now, lastError: null },
      })
      toCancel += r.count
    } else {
      const r = await db.nfseDocument.updateMany({ where: { id: d.id, status: d.status }, data: { status: 'skipped', lastError: 'Fatura reembolsada antes da emissão: nota dispensada' } })
      skipped += r.count
    }
  }
  return { created, toCancel, skipped, expired }
}

const backoff = (attempts: number, now: Date) => new Date(now.getTime() + BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)] * 60_000)
const numeroDe = (nfseXml: string) => /<nNFSe>(\d+)<\/nNFSe>/.exec(nfseXml)?.[1] ?? null
const falhaTexto = (f: Falha) => (f.erros.length ? real.describe(f.erros) : `HTTP ${f.status}: ${f.raw.slice(0, 300)}`)

async function reserveNumber(doc: { id: string; ambiente: string; serie: number }, cfg: NfseConfig): Promise<{ nDps: number; dpsId: string }> {
  return db.$transaction(async (tx) => {
    const seq = await tx.nfseSequence.upsert({ where: { id: `${doc.ambiente}:${doc.serie}` }, create: { id: `${doc.ambiente}:${doc.serie}`, last: 1 }, update: { last: { increment: 1 } } })
    const { id: dpsId } = buildDps({
      // só para calcular o Id com o número reservado; o XML de verdade é montado no envio
      ambiente: cfg.ambiente, dhEmi: new Date(), serie: doc.serie, nDps: seq.last, competencia: new Date(), verAplic: VER_APLIC,
      prestador: { cnpj: cfg.cnpj, municipio: cfg.municipio }, tomador: { tipo: 'CNPJ', documento: cfg.cnpj, nome: 'x' },
      servico: { cTribNac: cfg.cTribNac, descricao: 'x' }, valorCents: 1, pTotTribSN: cfg.pTotTribSN,
    })
    await tx.nfseDocument.update({ where: { id: doc.id }, data: { nDps: seq.last, dpsId } })
    return { nDps: seq.last, dpsId }
  })
}

async function markIssued(id: string, chave: string, nfseXml: string | null, dpsXml: string | null, now: Date) {
  await db.nfseDocument.update({
    where: { id },
    data: { status: 'issued', chave, nfseXml, numero: nfseXml ? numeroDe(nfseXml) : null, ...(dpsXml ? { dpsXml } : {}), issuedAt: now, lastError: null },
  })
}

async function issueOne(docId: string, cfg: NfseConfig, now: Date): Promise<'issued' | 'failed'> {
  const a = api(cfg)
  let doc = await db.nfseDocument.findUniqueOrThrow({ where: { id: docId } })
  const fail = async (msg: string) => {
    await db.nfseDocument.update({ where: { id: docId }, data: { status: 'failed', attempts: doc.attempts + 1, nextAttemptAt: backoff(doc.attempts + 1, now), lastError: msg.slice(0, 2000) } })
    return 'failed' as const
  }
  try {
    if (doc.ambiente !== cfg.ambiente) return fail(`Nota criada para o ambiente ${doc.ambiente}, mas o sistema está em ${cfg.ambiente}`)
    if (!doc.nDps || !doc.dpsId) {
      await reserveNumber(doc, cfg)
      doc = await db.nfseDocument.findUniqueOrThrow({ where: { id: docId } })
    } else if (doc.attempts > 0) {
      // tentativa anterior pode ter chegado ao governo sem a resposta chegar aqui: procura a nota pela DPS
      const found = await a.chavePorDps(doc.dpsId)
      if (found.chave) {
        const c = await a.consultar(found.chave)
        await markIssued(docId, found.chave, c.nfseXml, null, now)
        return 'issued'
      }
    }
    const tomador = await resolveTomador(doc.organizationId, cfg)
    if (!tomador) return fail('Sem os dados de quem paga (nome, CPF/CNPJ e endereço): a empresa precisa refazer o pagamento ou atualizar o cartão em Planos')
    const { xml } = buildDps({
      ambiente: cfg.ambiente, dhEmi: new Date(now.getTime() - 5000), serie: doc.serie, nDps: doc.nDps!, verAplic: VER_APLIC,
      competencia: doc.competencia.getTime() > now.getTime() - 5000 ? new Date(now.getTime() - 5000) : doc.competencia,
      prestador: { cnpj: cfg.cnpj, municipio: cfg.municipio, im: cfg.im },
      tomador: {
        tipo: tomador.tipo, documento: tomador.documento, nome: tomador.nome, email: tomador.email,
        endereco: tomador.endereco?.ibge ? { ...tomador.endereco, ibge: tomador.endereco.ibge } : null,
      },
      servico: { cTribNac: cfg.cTribNac, cTribMun: cfg.cTribMun, cNbs: cfg.cNbs, descricao: doc.descricao },
      valorCents: doc.amountCents, pTotTribSN: cfg.pTotTribSN,
    })
    const signed = signXml(xml, 'infDPS', a.cert)
    await db.nfseDocument.update({ where: { id: docId }, data: { dpsXml: signed, tomadorJson: JSON.stringify(tomador) } })
    let r: EmissaoOk | Falha
    try {
      r = await a.emitir(signed)
    } catch (e) {
      // queda de rede/tempo esgotado: a próxima tentativa começa pela consulta da DPS
      return fail(`Sem resposta do Sistema Nacional: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (r.ok) {
      await markIssued(docId, r.chave, r.nfseXml, signed, now)
      return 'issued'
    }
    if (r.erros.some((e) => e.codigo === 'E0014')) {
      const found = await a.chavePorDps(doc.dpsId!)
      if (found.chave) {
        const c = await a.consultar(found.chave)
        await markIssued(docId, found.chave, c.nfseXml, null, now)
        return 'issued'
      }
    }
    return fail(falhaTexto(r))
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e))
  }
}

async function cancelOne(docId: string, cfg: NfseConfig, now: Date): Promise<'canceled' | 'cancel_failed' | 'cancel_expired'> {
  const a = api(cfg)
  const doc = await db.nfseDocument.findUniqueOrThrow({ where: { id: docId } })
  // o mês virou com o cancelamento ainda na fila (ou falhando): não manda mais
  if (!cancelavel(doc.competencia, now)) {
    await db.nfseDocument.update({ where: { id: docId }, data: { status: 'cancel_expired', lastError: foraDoPrazo(doc.competencia) } })
    return 'cancel_expired'
  }
  const fail = async (msg: string) => {
    await db.nfseDocument.update({ where: { id: docId }, data: { status: 'cancel_failed', attempts: doc.attempts + 1, nextAttemptAt: backoff(doc.attempts + 1, now), lastError: msg.slice(0, 2000) } })
    return 'cancel_failed' as const
  }
  try {
    if (!doc.chave) return fail('Nota sem chave de acesso')
    const { xml } = buildCancel({
      ambiente: cfg.ambiente, dhEvento: new Date(now.getTime() - 5000), verAplic: VER_APLIC, cnpj: cfg.cnpj, chave: doc.chave,
      motivo: (doc.cancelMotivo as CancelMotivo) in CANCEL_REASONS ? (doc.cancelMotivo as CancelMotivo) : 'outros',
      texto: doc.cancelReason || 'Cancelamento solicitado pelo prestador',
    })
    const signed = signXml(xml, 'infPedReg', a.cert)
    let r: EventoOk | Falha
    try {
      r = await a.evento(doc.chave, signed)
    } catch (e) {
      return fail(`Sem resposta do Sistema Nacional: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (!r.ok) return fail(falhaTexto(r))
    await db.nfseDocument.update({ where: { id: docId }, data: { status: 'canceled', eventoXml: r.eventoXml, canceledAt: now, lastError: null } })
    return 'canceled'
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e))
  }
}

const g = globalThis as { __nfseRunning?: boolean }

/** Um passo da fila: cria o que falta, emite e cancela o que venceu. Não roda em paralelo consigo mesmo. */
export async function processNfse(now = new Date()) {
  const out = { created: 0, issued: 0, canceled: 0, failed: 0, cancelFailed: 0, skipped: 0, expired: 0, error: undefined as string | undefined }
  const c = nfseConfig()
  if (!c.ok) return { ...out, error: c.off ? undefined : c.error }
  if (g.__nfseRunning) return out
  g.__nfseRunning = true
  try {
    const q = await enqueueNfse(now)
    out.created = q.created
    out.skipped = q.skipped
    out.expired = q.expired
    out.error = q.error
    // emissões/cancelamentos interrompidos (servidor reiniciado no meio): voltam para a fila e começam pela consulta
    const stuck = new Date(now.getTime() - 10 * 60_000)
    await db.nfseDocument.updateMany({ where: { status: 'issuing', updatedAt: { lt: stuck } }, data: { status: 'failed', attempts: { increment: 1 }, nextAttemptAt: now, lastError: 'Emissão interrompida; conferindo no Sistema Nacional' } })
    await db.nfseDocument.updateMany({ where: { status: 'canceling', updatedAt: { lt: stuck } }, data: { status: 'cancel_failed', nextAttemptAt: now, lastError: 'Cancelamento interrompido; tentando de novo' } })

    const due = await db.nfseDocument.findMany({
      where: { status: { in: ['pending', 'failed', 'cancel_pending', 'cancel_failed'] }, nextAttemptAt: { lte: now }, attempts: { lt: MAX_ATTEMPTS } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, status: true },
      take: 50,
    })
    for (const d of due) {
      const issuing = d.status === 'pending' || d.status === 'failed'
      const claimed = await db.nfseDocument.updateMany({ where: { id: d.id, status: d.status }, data: { status: issuing ? 'issuing' : 'canceling' } })
      if (claimed.count !== 1) continue
      if (issuing) {
        const r = await issueOne(d.id, c.cfg, now)
        if (r === 'issued') out.issued++
        else out.failed++
      } else {
        const r = await cancelOne(d.id, c.cfg, now)
        if (r === 'canceled') out.canceled++
        else if (r === 'cancel_expired') out.expired++
        else out.cancelFailed++
      }
    }
  } finally {
    g.__nfseRunning = false
  }
  return out
}

/** Dispara a fila logo após um pagamento/reembolso, sem esperar (o agendador cobre se falhar). */
export function kickNfse(): void {
  if (!nfseConfig().ok) return
  void processNfse().catch((e) => console.error('[nfse] fila falhou', e instanceof Error ? e.message : e))
}

// ───────────── ações do operador ─────────────

/** Nova tentativa manual (zera o contador de tentativas automáticas). */
export async function retryNfse(id: string): Promise<boolean> {
  const now = new Date()
  const a = await db.nfseDocument.updateMany({ where: { id, status: 'failed' }, data: { status: 'pending', attempts: 0, nextAttemptAt: now } })
  if (a.count) return true
  const b = await db.nfseDocument.updateMany({ where: { id, status: 'cancel_failed' }, data: { status: 'cancel_pending', attempts: 0, nextAttemptAt: now } })
  return b.count > 0
}

/** Cancelamento pedido pelo operador (nota emitida errada, por exemplo). */
export async function requestCancel(id: string, motivo: CancelMotivo, texto: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = texto.trim()
  if (!(motivo in CANCEL_REASONS)) return { ok: false, error: 'Motivo inválido' }
  if (t.length < 15 || t.length > 255) return { ok: false, error: 'Descreva o motivo com 15 a 255 caracteres' }
  const now = new Date()
  const doc = await db.nfseDocument.findUnique({ where: { id }, select: { competencia: true } })
  if (doc && !cancelavel(doc.competencia, now)) return { ok: false, error: foraDoPrazo(doc.competencia) }
  const r = await db.nfseDocument.updateMany({
    where: { id, status: 'issued' },
    data: { status: 'cancel_pending', cancelMotivo: motivo, cancelReason: t, cancelRequestedAt: now, attempts: 0, nextAttemptAt: now, lastError: null },
  })
  return r.count ? { ok: true } : { ok: false, error: 'Só nota emitida pode ser cancelada' }
}
