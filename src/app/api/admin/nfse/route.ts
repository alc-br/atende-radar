import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { readJson } from '@/lib/json-body'
import { operatorGuard } from '@/lib/support-admin'
import { audit } from '@/lib/audit'
import { certificate, nfseConfig } from '@/lib/nfse/config'
import { MAX_ATTEMPTS, processNfse } from '@/lib/nfse/service'

const STATUSES = ['pending', 'issuing', 'issued', 'failed', 'cancel_pending', 'canceling', 'canceled', 'cancel_failed', 'skipped']

/** Notas fiscais (NFS-e) de todas as empresas, para o operador: configuração, contagem por situação e a lista. */
export async function GET(request: Request) {
  const g = await operatorGuard()
  if (!g.ok) return g.res
  const status = new URL(request.url).searchParams.get('status')
  const c = nfseConfig()
  let cert: { titular: string; cnpj: string | null; validoAte: string } | null = null
  let certError: string | null = null
  if (c.ok) {
    try {
      const k = certificate(c.cfg)
      cert = { titular: k.titular, cnpj: k.cnpj, validoAte: k.validoAte.toISOString() }
      if (k.cnpj && k.cnpj !== c.cfg.cnpj) certError = `O certificado é do CNPJ ${k.cnpj}, mas NFSE_CNPJ é ${c.cfg.cnpj}`
    } catch (e) {
      certError = `Certificado ilegível: ${e instanceof Error ? e.message : String(e)}`
    }
  }
  const [docs, grouped] = await Promise.all([
    db.nfseDocument.findMany({
      where: status && STATUSES.includes(status) ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, organizationId: true, providerInvoiceId: true, ambiente: true, status: true, serie: true, nDps: true, amountCents: true, competencia: true,
        chave: true, numero: true, attempts: true, nextAttemptAt: true, lastError: true, issuedAt: true, cancelMotivo: true, cancelReason: true, canceledAt: true, createdAt: true,
        tomadorJson: true, dpsXml: true, nfseXml: true, eventoXml: true,
      },
    }),
    db.nfseDocument.groupBy({ by: ['status'], _count: { _all: true } }),
  ])
  const orgs = await db.organization.findMany({ where: { id: { in: [...new Set(docs.map((d) => d.organizationId))] } }, select: { id: true, name: true } })
  const orgName = new Map(orgs.map((o) => [o.id, o.name]))
  return NextResponse.json({
    config: c.ok
      ? { enabled: true, ambiente: c.cfg.ambiente, fake: c.cfg.fake, cnpj: c.cfg.cnpj, municipio: c.cfg.municipio, serie: c.cfg.serie, cTribNac: c.cfg.cTribNac, desde: c.cfg.desde.toISOString(), certificado: cert, error: certError }
      : { enabled: false, error: c.off ? null : c.error },
    maxAttempts: MAX_ATTEMPTS,
    counts: Object.fromEntries(grouped.map((r) => [r.status, r._count._all])),
    docs: docs.map(({ tomadorJson, dpsXml, nfseXml, eventoXml, ...d }) => {
      const t = tomadorJson ? (JSON.parse(tomadorJson) as { nome?: string; tipo?: string; documento?: string }) : null
      return {
        ...d,
        organizationName: orgName.get(d.organizationId) ?? '(empresa excluída)',
        tomador: t ? { nome: t.nome ?? '', tipo: t.tipo ?? '', documento: t.documento ?? '' } : null,
        files: { dps: !!dpsXml, nfse: !!nfseXml, evento: !!eventoXml },
      }
    }),
  })
}

/** { action: 'run' }: processa a fila agora (mesmo passo do agendador). */
export async function POST(request: Request) {
  const g = await operatorGuard()
  if (!g.ok) return g.res
  const j = await readJson<{ action?: unknown }>(request)
  if (!j.ok) return j.res
  if (j.body.action !== 'run') return NextResponse.json({ error: "action deve ser 'run'" }, { status: 400 })
  const result = await processNfse()
  await audit(g.auth, { action: 'nfse.run', targetType: 'nfse', targetId: 'fila', details: { ...result } })
  return NextResponse.json({ ok: true, result })
}
