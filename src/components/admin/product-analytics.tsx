'use client'

import { useCallback, useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import type { ProductAnalytics } from '@/lib/product-analytics'

// I7 · Admin › Produto: números do produto medidos no próprio servidor (sem ferramenta de terceiros).

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`)
const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const num = (v: number) => new Intl.NumberFormat('pt-BR').format(v)
const hours = (h: number | null) => {
  if (h === null) return '—'
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`
  if (h < 48) return `${h.toFixed(1).replace('.', ',')} h`
  return `${(h / 24).toFixed(1).replace('.', ',')} dias`
}

const VIEW_LABELS: Record<string, string> = {
  dashboard: 'Visão Geral',
  alerts: 'Alertas',
  conversations: 'Conversas',
  'conversation-detail': 'Detalhe da conversa',
  recovery: 'Recuperação',
  team: 'Equipe',
  'agent-profile': 'Perfil do atendente',
  reports: 'Relatórios',
  connections: 'Conexões',
  settings: 'Configurações',
  onboarding: 'Primeiros passos',
  members: 'Membros',
  teams: 'Times',
  plans: 'Planos',
  checkout: 'Pagamento',
  notifications: 'Notificações',
  admin: 'Admin',
  profile: 'Perfil',
}

export function ProductAnalyticsPanel() {
  const [days, setDays] = useState<30 | 90>(30)
  const [data, setData] = useState<ProductAnalytics | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (d: 30 | 90) => {
    setError(null)
    try {
      const res = await fetch(`/api/admin/analytics?days=${d}`)
      if (!res.ok) throw new Error('Não foi possível carregar os números do produto')
      setData((await res.json()) as ProductAnalytics)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
    }
  }, [])

  useEffect(() => {
    void load(days)
  }, [days, load])

  if (error) {
    return (
      <div className="cartao vazio" role="alert">
        <strong>{error}</strong>
        <button type="button" onClick={() => void load(days)} className="btn btn--sm mt-3">Tentar novamente</button>
      </div>
    )
  }

  const loading = !data || data.days !== days

  return (
    <div className="space-y-[18px]" data-testid="admin-produto">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período">
        {([30, 90] as const).map((d) => (
          <button
            key={d}
            type="button"
            className={`btn btn--sm ${days === d ? 'btn--primario' : ''}`}
            aria-pressed={days === d}
            onClick={() => setDays(d)}
          >
            Últimos {d} dias
          </button>
        ))}
        <span className="text-xs suave">Funil e retenção contam as empresas que se cadastraram no período.</span>
      </div>

      {loading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : (
        <>
          <div className="kpis">
            <article className="cartao kpi">
              <p className="kpi__rotulo">Tempo até o 1º alerta (mediana)</p>
              <p className="kpi__valor">{hours(data.activation.medianHoursToFirstAlert)}</p>
            </article>
            <article className="cartao kpi">
              <p className="kpi__rotulo">Tempo até conectar o WhatsApp (mediana)</p>
              <p className="kpi__valor">{hours(data.activation.medianHoursToFirstConnection)}</p>
            </article>
            <article className="cartao kpi">
              <p className="kpi__rotulo">Custo de IA no período</p>
              <p className="kpi__valor" data-testid="admin-produto-custo-ia">
                {data.ai.mode === 'rules' ? 'R$ 0,00 — análise por regras' : brl(data.ai.totalCostBrl)}
              </p>
            </article>
          </div>

          <section className="cartao" aria-labelledby="t-funil">
            <div className="cartao__cab">
              <div>
                <h2 id="t-funil">Funil</h2>
                <p>Visita → cadastro → conexão → 1ª conversa → 1º alerta → pagamento</p>
              </div>
            </div>
            <div className="cartao__corpo">
              <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Funil">
                <table className="tabela tabela--cab-cinza">
                  <thead>
                    <tr>
                      <th>Etapa</th>
                      <th>Total</th>
                      <th>Da etapa anterior</th>
                      <th className="hidden sm:table-cell">Do cadastro</th>
                      <th className="hidden md:table-cell">Tempo desde o cadastro (mediana)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.funnel.map((s) => (
                      <tr key={s.key}>
                        <td className="forte">{s.label}</td>
                        <td>{num(s.count)}</td>
                        <td>{pct(s.conversionFromPrevious)}</td>
                        <td className="hidden sm:table-cell">{pct(s.conversionFromSignup)}</td>
                        <td className="hidden md:table-cell suave">{hours(s.medianHoursFromSignup)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="cartao" aria-labelledby="t-retencao">
            <div className="cartao__cab">
              <div>
                <h2 id="t-retencao">Retenção semanal</h2>
                <p>Empresas que usaram o painel na semana N depois do cadastro</p>
              </div>
            </div>
            <div className="cartao__corpo">
              <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Retenção semanal">
                <table className="tabela tabela--cab-cinza">
                  <thead>
                    <tr><th>Semana</th><th>Empresas</th><th>Ativas</th><th>Retenção</th></tr>
                  </thead>
                  <tbody>
                    {data.retention.map((r) => (
                      <tr key={r.week}>
                        <td className="forte">Semana {r.week}</td>
                        <td>{num(r.eligible)}</td>
                        <td>{num(r.active)}</td>
                        <td>{pct(r.rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <div className="grade grade-2">
            <section className="cartao" aria-labelledby="t-telas">
              <div className="cartao__cab">
                <div>
                  <h2 id="t-telas">Uso por tela</h2>
                  <p>Sem a conta de demonstração</p>
                </div>
              </div>
              <div className="cartao__corpo">
                <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Uso por tela">
                  <table className="tabela tabela--cab-cinza">
                    <thead>
                      <tr><th>Tela</th><th>Aberturas</th><th>Empresas</th></tr>
                    </thead>
                    <tbody>
                      {data.screens.length === 0 ? (
                        <tr><td colSpan={3} className="centro suave py-8">Nenhum uso registrado no período.</td></tr>
                      ) : data.screens.map((s) => (
                        <tr key={s.view}>
                          <td className="forte">{VIEW_LABELS[s.view] ?? s.view}</td>
                          <td>{num(s.views)}</td>
                          <td>{num(s.organizations)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section className="cartao" aria-labelledby="t-tour">
              <div className="cartao__cab">
                <div>
                  <h2 id="t-tour">Guia de telas (tour)</h2>
                  <p>Concluído até o fim x pulado</p>
                </div>
              </div>
              <div className="cartao__corpo">
                <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Conclusão do tour">
                  <table className="tabela tabela--cab-cinza">
                    <thead>
                      <tr><th>Tour</th><th>Concluídos</th><th>Pulados</th><th>Conclusão</th></tr>
                    </thead>
                    <tbody>
                      {data.tours.length === 0 ? (
                        <tr><td colSpan={4} className="centro suave py-8">Nenhum tour finalizado no período.</td></tr>
                      ) : data.tours.map((t) => (
                        <tr key={t.tour}>
                          <td className="forte">{t.tour === 'welcome' ? 'Boas-vindas' : VIEW_LABELS[t.tour] ?? t.tour}</td>
                          <td>{num(t.completed)}</td>
                          <td>{num(t.skipped)}</td>
                          <td>{pct(t.completionRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>

          <section className="cartao" aria-labelledby="t-custo-ia">
            <div className="cartao__cab">
              <div>
                <h2 id="t-custo-ia">Custo de IA por empresa</h2>
                <p>
                  {data.ai.mode === 'rules'
                    ? 'Nenhuma chamada de IA no período: a análise é feita por regras, sem custo.'
                    : `Custo médio por conversa: ${data.ai.costPerConversationBrl === null ? '—' : brl(data.ai.costPerConversationBrl)}`}
                </p>
              </div>
            </div>
            {data.ai.mode === 'provider' && (
              <div className="cartao__corpo">
                <div className="tabela-wrap" tabIndex={0} role="region" aria-label="Custo de IA por empresa">
                  <table className="tabela tabela--cab-cinza">
                    <thead>
                      <tr>
                        <th>Empresa</th>
                        <th className="hidden sm:table-cell">Chamadas</th>
                        <th className="hidden md:table-cell">Tokens (entrada / saída)</th>
                        <th className="hidden sm:table-cell">Conversas</th>
                        <th>Custo</th>
                        <th className="hidden md:table-cell">Por conversa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ai.byOrganization.map((o) => (
                        <tr key={o.organizationId}>
                          <td className="forte">{o.organization}</td>
                          <td className="hidden sm:table-cell">{num(o.calls)}</td>
                          <td className="hidden md:table-cell suave">{num(o.inputTokens)} / {num(o.outputTokens)}</td>
                          <td className="hidden sm:table-cell">{num(o.conversations)}</td>
                          <td>{brl(o.costBrl)}</td>
                          <td className="hidden md:table-cell">{o.costPerConversationBrl === null ? '—' : brl(o.costPerConversationBrl)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
