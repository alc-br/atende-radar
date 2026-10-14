// Catálogo de planos (V7): o que o operador da plataforma edita em Admin › Planos e as regras do sync do deploy.
// Puro (sem banco): usado no servidor, no navegador (nomes dos recursos) e em scripts/sync-plan-catalog.ts.

/**
 * Recursos exibidos como destaques do plano (chaves do campo `features` do Plan), na ordem da página de vendas.
 * Hoje nenhum deles é aplicado como permissão: são só texto de vitrine. O que vale de fato são os limites (cotas).
 */
export const PLAN_FEATURES: [string, string][] = [
  ['conversation_audit', 'Auditoria de conversas'],
  ['alert_rules', 'Alertas de oportunidades em risco'],
  ['basic_dashboard', 'Painel de visão geral'],
  ['daily_report', 'Relatório diário'],
  ['team_management', 'Gestão de equipes'],
  ['advanced_dashboard', 'Painel avançado'],
  ['custom_reports', 'Relatórios personalizados'],
  ['api_access', 'Acesso à API'],
]
const FEATURE_KEYS = new Set(PLAN_FEATURES.map(([k]) => k))

export interface PlanPatch {
  name?: string
  description?: string | null
  monthlyPrice?: number
  annualPrice?: number
  features?: Record<string, boolean>
  highlight?: boolean
  active?: boolean
}

const MAX_PRICE = 100_000

function price(v: unknown, label: string): number | string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return `${label}: informe um número`
  if (v <= 0 || v > MAX_PRICE) return `${label}: entre R$ 0,01 e R$ ${MAX_PRICE.toLocaleString('pt-BR')}`
  if (Math.round(v * 100) !== Math.round(v * 100 * 1000) / 1000) return `${label}: no máximo 2 casas decimais`
  return Math.round(v * 100) / 100
}

/** Valida o corpo do PATCH de Admin › Planos. Só os campos de vitrine e de venda; limites (cotas) e código não mudam aqui. */
export function parsePlanPatch(body: unknown): { ok: true; patch: PlanPatch } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Corpo inválido' }
  const b = body as Record<string, unknown>
  const allowed = new Set(['name', 'description', 'monthlyPrice', 'annualPrice', 'features', 'highlight', 'active'])
  const extra = Object.keys(b).filter((k) => !allowed.has(k))
  if (extra.length) return { ok: false, error: `Campo não editável aqui: ${extra.join(', ')}` }
  const patch: PlanPatch = {}
  if (b.name !== undefined) {
    if (typeof b.name !== 'string') return { ok: false, error: 'Nome inválido' }
    const name = b.name.trim().replace(/\s+/g, ' ')
    if (name.length < 2 || name.length > 40) return { ok: false, error: 'O nome precisa ter de 2 a 40 caracteres' }
    patch.name = name
  }
  if (b.description !== undefined) {
    if (b.description !== null && typeof b.description !== 'string') return { ok: false, error: 'Descrição inválida' }
    const d = (b.description ?? '').trim()
    if (d.length > 200) return { ok: false, error: 'A descrição pode ter até 200 caracteres' }
    patch.description = d || null
  }
  for (const [key, label] of [['monthlyPrice', 'Preço mensal'], ['annualPrice', 'Preço anual']] as const) {
    if (b[key] === undefined) continue
    const v = price(b[key], label)
    if (typeof v === 'string') return { ok: false, error: v }
    patch[key] = v
  }
  if (b.features !== undefined) {
    if (!b.features || typeof b.features !== 'object' || Array.isArray(b.features)) return { ok: false, error: 'Destaques inválidos' }
    const f: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(b.features as Record<string, unknown>)) {
      if (!FEATURE_KEYS.has(k) || typeof v !== 'boolean') return { ok: false, error: `Destaque desconhecido: ${k}` }
      f[k] = v
    }
    patch.features = f
  }
  for (const key of ['highlight', 'active'] as const) {
    if (b[key] === undefined) continue
    if (typeof b[key] !== 'boolean') return { ok: false, error: `${key} inválido` }
    patch[key] = b[key] as boolean
  }
  if (!Object.keys(patch).length) return { ok: false, error: 'Nada para alterar' }
  return { ok: true, patch }
}

/**
 * Valores que o catálogo do código já teve (por código do plano). O sync do deploy só troca nome/descrição que ainda
 * estejam num destes valores antigos, isto é, que ninguém editou em Admin › Planos. Valor editado no Admin nunca
 * coincide com um valor antigo do código (a não ser que o operador volte a ele de propósito), então fica como está.
 * Ao mudar nome/descrição em src/lib/seed-data.ts, acrescente aqui o valor que sai.
 */
export const PREVIOUS_CATALOG: Record<string, { names: string[]; descriptions: string[] }> = {
  essencial: { names: [], descriptions: ['Para clínicas que estão começando a monitorar atendimento via WhatsApp.'] },
  gestao: { names: ['Gestão'], descriptions: ['Para clínicas que querem controle total do atendimento e métricas avançadas.'] },
  performance: { names: [], descriptions: ['Para clínicas e redes que exigem o máximo em inteligência de atendimento.'] },
}

/** O que o sync do deploy pode gravar num plano: só campos que ainda têm um valor antigo do código. null = nada. */
export function catalogSyncPatch(
  code: string,
  current: { name: string; description: string | null },
  target: { name: string; description: string | null },
): { name?: string; description?: string | null } | null {
  const prev = PREVIOUS_CATALOG[code]
  if (!prev) return null
  const patch: { name?: string; description?: string | null } = {}
  if (current.name !== target.name && prev.names.includes(current.name)) patch.name = target.name
  if (current.description !== target.description && current.description !== null && prev.descriptions.includes(current.description)) patch.description = target.description
  return Object.keys(patch).length ? patch : null
}
