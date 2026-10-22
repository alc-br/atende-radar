import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { db } from '../db'
import { PLATFORM_AI_ORG, recordAiUsage } from '../product-events'
import { aiEnabled, aiModel, anthropic } from './ai-classify'

// Situações novas · uma vez por semana o Claude junta as frases de "novidade" (novelty-signal.ts) em temas. Tema que já
// existe (inclusive descartado ou já mapeado) só ganha a contagem nova; o operador vê em Admin › Situações novas e decide.
// Quem decide é sempre uma pessoa: o sistema não cria assunto nem alerta sozinho.

const CLUSTER_AFTER_DAYS = 7
/** Com muitas frases juntas, agrupa antes de completar a semana. */
const CLUSTER_MIN_BATCH = 200
const MAX_SIGNALS_PER_RUN = 400
const MAX_KNOWN = 120
const MAX_EXAMPLES = 5
/** Depois de uma falha (erro, recusa), espera antes de tentar de novo: o laço de limpeza roda a cada 15 min. */
const RETRY_AFTER_MS = 6 * 3600_000

export const NOVELTY_STATUSES = ['new', 'mapped', 'dismissed'] as const
export type NoveltyStatus = (typeof NOVELTY_STATUSES)[number]

const Grupos = z.object({
  grupos: z.array(z.object({
    tema_existente: z.string().nullable(),
    titulo: z.string(),
    resumo: z.string(),
    itens: z.array(z.number().int()),
  })),
})

const SYSTEM = `Você organiza situações que apareceram em conversas de WhatsApp entre clientes e empresas brasileiras (clínicas, lojas, escolas, oficinas, prestadores de serviço).
Cada frase nova descreve uma situação importante que os avisos do sistema ainda não cobrem.

Junte as frases que descrevem a MESMA situação num grupo. Para cada grupo:
- tema_existente: se o grupo é um dos temas já conhecidos, o código dele (por exemplo "T3"); senão null.
- titulo: nome curto da situação (até 8 palavras), genérico, sem nome de empresa ou pessoa.
- resumo: uma frase dizendo o que acontece e por que importa para a empresa.
- itens: os números das frases do grupo.

Toda frase entra em exatamente um grupo. Um grupo pode ter uma frase só. Não junte situações diferentes só porque são do mesmo setor.`

let running = false
let lastFailureAt = 0

const parseList = (json: string): string[] => {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** Hora de agrupar: a frase mais antiga sem tema já tem uma semana, ou juntaram muitas. */
export async function clusteringDue(now = new Date()): Promise<boolean> {
  const oldest = await db.novelSignal.findFirst({ where: { clusterId: null }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } })
  if (!oldest) return false
  if (now.getTime() - oldest.createdAt.getTime() >= CLUSTER_AFTER_DAYS * 86400_000) return true
  return (await db.novelSignal.count({ where: { clusterId: null } })) >= CLUSTER_MIN_BATCH
}

export interface ClusterResult { signals: number; created: number; updated: number }

/**
 * Agrupa as frases sem tema. Sem IA ligada, ou fora da hora (sem `force`), não faz nada e devolve null.
 * `force` é o botão "Agrupar agora" do Admin.
 */
export async function clusterNovelSignals(now = new Date(), opts: { force?: boolean } = {}): Promise<ClusterResult | null> {
  if (!aiEnabled() || running) return null
  if (!opts.force && (Date.now() - lastFailureAt < RETRY_AFTER_MS || !(await clusteringDue(now)))) return null
  running = true
  try {
    const signals = await db.novelSignal.findMany({
      where: { clusterId: null }, orderBy: { createdAt: 'asc' }, take: MAX_SIGNALS_PER_RUN,
      select: { id: true, organizationId: true, description: true },
    })
    if (!signals.length) return { signals: 0, created: 0, updated: 0 }
    const texts = [...new Set(signals.map((s) => s.description))]
    const known = (await db.novelCluster.findMany({ orderBy: { lastSeenAt: 'desc' }, take: MAX_KNOWN, select: { id: true, title: true, summary: true } }))
      .map((c, i) => ({ ...c, ref: `T${i + 1}` }))

    const content = `Temas já conhecidos:\n${known.map((k) => `${k.ref}: ${k.title}. ${k.summary}`).join('\n') || '(nenhum)'}\n\nFrases novas:\n${texts.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
    let parsed: z.infer<typeof Grupos> | null = null
    try {
      const response = await anthropic().messages.parse(
        { model: aiModel(), max_tokens: 16000, system: SYSTEM, output_config: { effort: 'medium', format: zodOutputFormat(Grupos) }, messages: [{ role: 'user', content }] },
        { timeout: 5 * 60_000 },
      )
      await recordAiUsage({ organizationId: PLATFORM_AI_ORG, provider: 'anthropic', model: aiModel(), feature: 'novelty_cluster', inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens })
      if (response.stop_reason !== 'refusal') parsed = response.parsed_output ?? null
    } catch (e) {
      console.error('[novidade] agrupamento falhou', e instanceof Error ? e.message : e)
    }
    if (!parsed) {
      lastFailureAt = Date.now()
      return null
    }

    // cada frase no primeiro grupo que a citou; a que ficou de fora vira um grupo próprio
    const used = new Set<number>()
    const groups = parsed.grupos.map((g) => ({
      ...g,
      itens: g.itens.filter((n) => n >= 1 && n <= texts.length && !used.has(n) && (used.add(n), true)),
    })).filter((g) => g.itens.length)
    texts.forEach((t, i) => { if (!used.has(i + 1)) groups.push({ tema_existente: null, titulo: t, resumo: t, itens: [i + 1] }) })

    let created = 0
    let updated = 0
    await db.$transaction(async (tx) => {
      await tx.novelCluster.updateMany({ where: { lastRunConversations: { gt: 0 } }, data: { lastRunConversations: 0 } })
      for (const g of groups) {
        const groupTexts = g.itens.map((n) => texts[n - 1])
        const sigs = signals.filter((s) => groupTexts.includes(s.description))
        const orgIds = [...new Set(sigs.map((s) => s.organizationId))]
        const k = known.find((x) => x.ref === g.tema_existente?.trim())
        const cluster = k ? await tx.novelCluster.findUnique({ where: { id: k.id } }) : null
        let clusterId: string
        if (cluster) {
          clusterId = cluster.id
          await tx.novelCluster.update({
            where: { id: cluster.id },
            data: {
              conversations: { increment: sigs.length },
              lastRunConversations: sigs.length,
              orgIdsJson: JSON.stringify([...new Set([...parseList(cluster.orgIdsJson), ...orgIds])]),
              examplesJson: JSON.stringify([...new Set([...parseList(cluster.examplesJson), ...groupTexts])].slice(0, MAX_EXAMPLES)),
              lastSeenAt: now,
            },
          })
          updated++
        } else {
          clusterId = (await tx.novelCluster.create({
            data: {
              title: g.titulo.trim().slice(0, 120) || groupTexts[0], summary: g.resumo.trim().slice(0, 400),
              conversations: sigs.length, lastRunConversations: sigs.length,
              orgIdsJson: JSON.stringify(orgIds), examplesJson: JSON.stringify(groupTexts.slice(0, MAX_EXAMPLES)),
              firstSeenAt: now, lastSeenAt: now,
            },
            select: { id: true },
          })).id
          created++
        }
        await tx.novelSignal.updateMany({ where: { id: { in: sigs.map((s) => s.id) } }, data: { clusterId } })
      }
    })
    return { signals: signals.length, created, updated }
  } finally {
    running = false
  }
}

export interface NoveltyCluster {
  id: string
  title: string
  summary: string
  status: NoveltyStatus
  conversations: number
  lastRunConversations: number
  organizations: number
  examples: string[]
  firstSeenAt: string
  lastSeenAt: string
  decidedAt: string | null
  decidedBy: string | null
}

const toCluster = (c: Awaited<ReturnType<typeof db.novelCluster.findFirstOrThrow>>): NoveltyCluster => ({
  id: c.id, title: c.title, summary: c.summary, status: (NOVELTY_STATUSES as readonly string[]).includes(c.status) ? (c.status as NoveltyStatus) : 'new',
  conversations: c.conversations, lastRunConversations: c.lastRunConversations, organizations: parseList(c.orgIdsJson).length,
  examples: parseList(c.examplesJson), firstSeenAt: c.firstSeenAt.toISOString(), lastSeenAt: c.lastSeenAt.toISOString(),
  decidedAt: c.decidedAt?.toISOString() ?? null, decidedBy: c.decidedBy,
})

/** Admin › Situações novas: os temas (a decidir primeiro, os que mais apareceram na última rodada no topo). */
export async function listNovelties() {
  const [clusters, pending] = await Promise.all([
    db.novelCluster.findMany({ orderBy: [{ lastRunConversations: 'desc' }, { conversations: 'desc' }], take: 300 }),
    db.novelSignal.count({ where: { clusterId: null } }),
  ])
  const order: Record<NoveltyStatus, number> = { new: 0, mapped: 1, dismissed: 2 }
  return {
    aiEnabled: aiEnabled(),
    pending,
    clusters: clusters.map(toCluster).sort((a, b) => order[a.status] - order[b.status]),
  }
}

export async function decideNovelty(id: string, status: NoveltyStatus, by: string): Promise<NoveltyCluster | null> {
  const exists = await db.novelCluster.findUnique({ where: { id }, select: { id: true } })
  if (!exists) return null
  const c = await db.novelCluster.update({
    where: { id },
    data: status === 'new' ? { status, decidedAt: null, decidedBy: null } : { status, decidedAt: new Date(), decidedBy: by },
  })
  return toCluster(c)
}
