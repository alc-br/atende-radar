'use client'

import { useEffect, useState } from 'react'
import { ListTodo } from 'lucide-react'
import { ActivityList, clearActivitiesFilterPreset, peekActivitiesFilterPreset, type ActivitiesFilterPreset, type ActivityStatusFilter } from '@/components/crm/activity-list'
import type { DueWindow } from '@/lib/crm/agenda'
import { can } from '@/lib/permissions'
import { useAppStore } from '@/lib/store'

// Tela "Tarefas" do CRM: a lista completa com os filtros de situação e a agenda (Hoje, Próximos 7 dias). Quem enxerga a
// equipe pode ver só as suas. "Pendente" = aberta ou em andamento: Abertas, Hoje, Próximos 7 dias e Atrasadas contam as duas.

interface FilterDef {
  id: ActivitiesFilterPreset
  label: string
  title: string
  emptyTitle: string
  /** Vazio com "Só as minhas" ligado. */
  emptyMine: string
  emptyText: string
  status?: ActivityStatusFilter
  overdue?: boolean
  due?: DueWindow
}

const FILTERS: FilterDef[] = [
  {
    id: 'open',
    label: 'Abertas',
    title: 'Tarefas abertas',
    emptyTitle: 'Nenhuma tarefa aberta',
    emptyMine: 'Nenhuma tarefa aberta com você',
    emptyText: 'Tarefas lembram o próximo passo de cada negócio: retornar ao cliente, ligar, enviar a proposta. As em andamento também aparecem aqui. Crie uma em “Nova tarefa” ou aceite uma sugestão vinda das conversas.',
    status: 'pending',
  },
  {
    id: 'today',
    label: 'Hoje',
    title: 'Tarefas de hoje',
    emptyTitle: 'Nenhuma tarefa para hoje',
    emptyMine: 'Nenhuma tarefa sua para hoje',
    emptyText: 'Tarefas abertas ou em andamento com prazo para hoje aparecem aqui. As de dias anteriores que já venceram ficam em “Atrasadas”.',
    status: 'pending',
    due: 'today',
  },
  {
    id: 'next7',
    label: 'Próximos 7 dias',
    title: 'Tarefas dos próximos 7 dias',
    emptyTitle: 'Nenhuma tarefa nos próximos 7 dias',
    emptyMine: 'Nenhuma tarefa sua nos próximos 7 dias',
    emptyText: 'Tarefas abertas ou em andamento com prazo de hoje até o fim do sétimo dia aparecem aqui.',
    status: 'pending',
    due: 'next7',
  },
  {
    id: 'overdue',
    label: 'Atrasadas',
    title: 'Tarefas atrasadas',
    emptyTitle: 'Nenhuma tarefa atrasada',
    emptyMine: 'Nenhuma tarefa atrasada com você',
    emptyText: 'Tudo em dia. Tarefas com o prazo vencido aparecem aqui até serem concluídas, reagendadas ou canceladas.',
    overdue: true,
  },
  {
    id: 'done',
    label: 'Concluídas',
    title: 'Tarefas concluídas',
    emptyTitle: 'Nenhuma tarefa concluída',
    emptyMine: 'Nenhuma tarefa concluída com você',
    emptyText: 'Quando você concluir uma tarefa, ela aparece aqui. Uma tarefa concluída pode ser reaberta.',
    status: 'done',
  },
  {
    id: 'all',
    label: 'Todas',
    title: 'Todas as tarefas',
    emptyTitle: 'Nenhuma tarefa ainda',
    emptyMine: 'Nenhuma tarefa ainda com você',
    emptyText: 'Tarefas servem para não esquecer o próximo passo com cada cliente, com prazo e responsável. Nenhuma delas envia mensagem: o contato com o cliente continua sendo seu.',
  },
]

export default function CrmActivitiesView() {
  const me = useAppStore((s) => s.me)
  const [filter, setFilter] = useState<ActivitiesFilterPreset>(() => peekActivitiesFilterPreset() ?? 'open')
  const [onlyMine, setOnlyMine] = useState(false)

  // o filtro pedido pela Visão comercial vale só para esta abertura da tela
  useEffect(() => {
    clearActivitiesFilterPreset()
  }, [])

  const canView = can(me?.role, 'crm.activities.view')
  // atendente já vê só as dele; o interruptor é para quem enxerga a equipe
  const seesTeam = canView && can(me?.role, 'members.view') && !!me?.id
  const def = FILTERS.find((f) => f.id === filter) ?? FILTERS[0]
  const crmOn = !!me?.crm?.enabled

  return (
    <>
      <header className="cab-pagina">
        <div className="cab-pagina__titulo">
          <ListTodo className="ic cab-pagina__icone" aria-hidden="true" />
          <div>
            <h1>Tarefas</h1>
            <p>O próximo passo de cada negócio, com prazo e responsável.</p>
          </div>
        </div>
      </header>

      {!crmOn || !canView ? (
        <div className="cartao vazio">
          <ListTodo className="ic" aria-hidden="true" />
          <strong>{crmOn ? 'Tarefas não disponíveis para o seu perfil' : 'O CRM comercial está desligado'}</strong>
          <p>{crmOn ? 'Peça ao gestor da empresa para revisar o seu acesso.' : 'O administrador da empresa pode ligá-lo nas configurações do CRM.'}</p>
        </div>
      ) : (
        <>
          <div className="crm-filtros-tarefas" data-tour="crm-activities-filters">
            <div className="segmentado" role="group" aria-label="Situação das tarefas">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
            {seesTeam && (
              <label className="crm-filtros-tarefas__minhas" htmlFor="crm-tarefas-minhas">
                <span className="interruptor">
                  <input id="crm-tarefas-minhas" type="checkbox" role="switch" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
                  <span />
                </span>
                Só as minhas
              </label>
            )}
          </div>

          <ActivityList
            key={`${filter}-${onlyMine ? 'minhas' : 'todas'}`}
            status={def.status}
            overdue={def.overdue}
            due={def.due}
            onlyMine={seesTeam && onlyMine}
            title={def.title}
            emptyTitle={seesTeam && onlyMine ? def.emptyMine : def.emptyTitle}
            emptyText={def.emptyText}
          />
        </>
      )}
    </>
  )
}
