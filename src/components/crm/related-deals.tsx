'use client'

import { Briefcase, CalendarClock, ExternalLink } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useCrmQuery, type CrmDeal } from '@/lib/crm/client'
import { DEAL_STATUS_LABEL, DEAL_STATUS_TAG } from '@/lib/crm/labels'
import { formatCents } from '@/lib/crm/money'
import { can } from '@/lib/permissions'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { CrmTaskButton } from './crm-task-button'

// Bloco "Negócios relacionados" no detalhe da conversa (CRM-05). Só os negócios ligados a esta conversa (por sugestão
// aceita, tarefa de alerta ou de recuperação), no escopo de quem vê. O valor declarado e a estimativa nunca se misturam.

type RelatedDeal = CrmDeal & {
  person: { id: string; name: string } | null
  company: { id: string; name: string } | null
  stage: { id: string; name: string } | null
  nextTask: { id: string; title: string; dueAt: string | null } | null
}

interface RelatedDealsResponse {
  items: RelatedDeal[]
  total: number
  members: { id: string; name: string }[]
}

const LIMIT = 5
const dueFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export function RelatedDeals({ conversationId }: { conversationId: string }) {
  const me = useAppStore((s) => s.me)
  const openCrm = useAppStore((s) => s.openCrm)
  const setView = useAppStore((s) => s.setView)
  const canView = !!me?.crm?.enabled && can(me?.role, 'crm.deals.view')
  const q = useCrmQuery<RelatedDealsResponse>(canView ? `/api/crm/deals?conversationId=${encodeURIComponent(conversationId)}&limit=${LIMIT}` : null)

  if (!canView) return null

  const items = q.data?.items ?? []
  const names = new Map((q.data?.members ?? []).map((m) => [m.id, m.name]))
  const more = (q.data?.total ?? 0) - items.length

  return (
    <section className="cartao bloco crm-relacionados" aria-labelledby="crm-relacionados-titulo" data-testid="crm-related-deals">
      <header className="bloco__cab">
        <div>
          <h2 id="crm-relacionados-titulo">
            <Briefcase className="ic verde-txt" aria-hidden="true" />
            Negócios relacionados
          </h2>
          <p className="suave bloco__sub">Do CRM comercial, ligados a esta conversa.</p>
        </div>
        {items.length > 0 && <span className="tag tag--cinza tag--contorno">{q.data?.total}</span>}
      </header>

      {q.loading && !q.data ? (
        <div className="grid gap-2" aria-busy="true" aria-label="Carregando negócios relacionados">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : q.error && !q.data ? (
        <div className="bloco__texto" role="alert">
          <p className="suave">Não foi possível carregar os negócios desta conversa.</p>
          <button type="button" className="btn btn--sm mt-2" onClick={q.refetch}>
            Tentar novamente
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="bloco__texto suave">
          Nenhum negócio ligado a esta conversa. Ele aparece aqui quando uma sugestão do CRM é aceita ou quando uma tarefa de alerta ou de recuperação é criada para um negócio.
        </p>
      ) : (
        <ul className="crm-relacionados__lista">
          {items.map((d) => {
            const owner = d.ownerMemberId ? (names.get(d.ownerMemberId) ?? 'Responsável da equipe') : 'Sem responsável'
            return (
              <li key={d.id} className="crm-relacionados__item">
                <div className="crm-relacionados__topo">
                  <strong className="crm-relacionados__titulo">{d.title}</strong>
                  <span className={cn('tag', DEAL_STATUS_TAG[d.status] ?? 'tag--cinza')}>{DEAL_STATUS_LABEL[d.status] ?? d.status}</span>
                </div>
                <dl className="crm-relacionados__dados">
                  <div>
                    <dt>Etapa</dt>
                    <dd>{d.stage?.name ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Responsável</dt>
                    <dd>{owner}</dd>
                  </div>
                  <div>
                    <dt>Valor</dt>
                    <dd>{formatCents(d.amountCents)}</dd>
                  </div>
                  {d.amountCents === null && d.estimatedAmountCents !== null && (
                    <div>
                      <dt>Estimativa</dt>
                      <dd className="suave">{formatCents(d.estimatedAmountCents)} (estimado, não informado)</dd>
                    </div>
                  )}
                </dl>
                <p className="crm-relacionados__proxima">
                  <CalendarClock className="ic" aria-hidden="true" />
                  {d.nextTask ? (
                    <span>
                      Próxima tarefa: {d.nextTask.title}
                      {d.nextTask.dueAt && <> · {dueFormat.format(new Date(d.nextTask.dueAt))}</>}
                    </span>
                  ) : (
                    <span className="suave">Sem próxima tarefa</span>
                  )}
                </p>
                <div className="crm-relacionados__acoes">
                  <button type="button" className="btn btn--sm" onClick={() => openCrm('deal', d.id)} aria-label={`Abrir no CRM: ${d.title}`}>
                    <ExternalLink className="ic" aria-hidden="true" />
                    Abrir no CRM
                  </button>
                  {d.status === 'open' && (
                    <CrmTaskButton className="btn--sm" dealId={d.id} ariaLabel={`Criar tarefa para ${d.title}`} onDone={() => q.refetch()} />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {more > 0 && (
        <p className="bloco__texto suave mt-2">
          Mostrando {items.length} de {q.data?.total}, os atualizados por último.{' '}
          <button type="button" className="btn btn--link" onClick={() => setView('crm-deals')}>
            Ir para Negócios
          </button>
        </p>
      )}
    </section>
  )
}
