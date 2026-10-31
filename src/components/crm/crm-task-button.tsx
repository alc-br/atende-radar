'use client'

import { useState } from 'react'
import { ListTodo } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { browserZoneDiffers, isoFromZonedParts, safeTimezone, timezoneLabel, zonedDate } from '@/lib/crm/agenda'
import { crmErrorMessage, crmSend, type CrmActivity } from '@/lib/crm/client'
import { ACTIVITY_TYPE_LABEL, PRIORITY_LABEL } from '@/lib/crm/labels'
import { can } from '@/lib/permissions'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'

// Tarefa do CRM a partir de um alerta, de um item de recuperação ou de um negócio ligado à conversa (F5, CRM-04/07).
// O servidor guarda uma tarefa aberta por alerta ou item: pedir de novo devolve a mesma, sem duplicar. Nada aqui
// envia mensagem (D3).

export interface CrmTaskSource {
  /** Tarefa para tratar este alerta. */
  alertId?: string
  /** Tarefa para este item da recuperação. */
  recoveryItemId?: string
  /** Negócio a que a tarefa fica ligada (e, com alerta ou item, o negócio fica ligado à conversa). */
  dealId?: string
  /** Título sugerido (a pessoa pode trocar). */
  defaultTitle?: string
  /** Para o texto do diálogo: de onde a tarefa vem. */
  context?: string
}

const TYPES = Object.entries(ACTIVITY_TYPE_LABEL) as [keyof typeof ACTIVITY_TYPE_LABEL, string][]
const PRIORITIES = Object.entries(PRIORITY_LABEL) as [keyof typeof PRIORITY_LABEL, string][]
const SELECT_CLASS = 'flex h-10 w-full rounded-[var(--raio-sm)] border border-[var(--borda-forte)] bg-[var(--superficie)] px-3 text-sm text-[var(--texto)]'
const D3_HINT = 'Nenhum tipo envia mensagem. “WhatsApp (fora do AtendeRadar)” só registra um contato feito por fora: o AtendeRadar não envia nada ao cliente.'

/** CRM ligado na empresa e papel que cria tarefas. Fora disso, nem o botão aparece. */
export function useCrmTaskAllowed(): boolean {
  const me = useAppStore((s) => s.me)
  return !!me?.crm?.enabled && can(me?.role, 'crm.activities.manage')
}

// prazo padrão amanhã às 09:00, no fuso da empresa (o mesmo da tela Tarefas: crm/agenda.ts)
const emptyForm = (tz: string) => ({ type: 'follow_up', title: '', date: zonedDate(1, tz), time: '09:00', priority: 'normal', notes: '' })

export interface CrmTaskDialogProps extends CrmTaskSource {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Depois de criar (ou de achar a tarefa aberta que já existia). */
  onDone?: (activity: CrmActivity, created: boolean) => void
}

/** Diálogo controlado: quem abre é um botão (CrmTaskButton) ou um item de menu. */
export function CrmTaskDialog({ open, onOpenChange, onDone, alertId, recoveryItemId, dealId, defaultTitle, context }: CrmTaskDialogProps) {
  const setView = useAppStore((s) => s.setView)
  const tz = safeTimezone(useAppStore((s) => s.me?.crm?.timezone))
  const zoneHint = browserZoneDiffers(tz) ? ` Data e hora no ${timezoneLabel(tz)}.` : ''
  const [form, setForm] = useState(() => emptyForm(tz))
  const [sending, setSending] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  // o formulário recomeça a cada abertura (sem efeito: compara com a abertura anterior durante a renderização)
  const [openedFor, setOpenedFor] = useState<boolean>(false)
  if (open !== openedFor) {
    setOpenedFor(open)
    if (open) {
      setForm({ ...emptyForm(tz), title: (defaultTitle ?? '').slice(0, 160) })
      setFormError(null)
    }
  }

  async function submit() {
    const t = form.title.trim()
    if (!t) {
      setFormError('Informe o título.')
      return
    }
    const body: Record<string, unknown> = { type: form.type, title: t.slice(0, 160), priority: form.priority }
    if (form.date) {
      const dueAt = isoFromZonedParts(form.date, form.time, tz)
      if (!dueAt) {
        setFormError('Data inválida.')
        return
      }
      body.dueAt = dueAt
    }
    const notes = form.notes.trim()
    if (notes) body.notes = notes.slice(0, 5000)
    if (alertId) body.alertId = alertId
    if (recoveryItemId) body.recoveryItemId = recoveryItemId
    if (dealId) body.dealId = dealId
    setFormError(null)
    setSending(true)
    try {
      const r = await crmSend<{ activity: CrmActivity; created: boolean }>('/api/crm/activities', { json: body, idempotent: true })
      const action = { action: { label: 'Ver tarefas', onClick: () => setView('crm-activities') } }
      if (r.created) toast.success('Tarefa criada no CRM.', action)
      else toast.info(`Já existe uma tarefa aberta para isto: “${r.activity.title}”. Nada foi duplicado.`, action)
      onOpenChange(false)
      onDone?.(r.activity, r.created)
    } catch (e) {
      toast.error(crmErrorMessage(e))
    } finally {
      setSending(false)
    }
  }

  const description = context ?? (dealId ? 'A tarefa fica ligada a este negócio.' : 'Um lembrete do próximo passo com o cliente.')

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && sending) return
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="crm-task-dialog">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
          className="grid gap-4"
          noValidate
        >
          <DialogHeader>
            <DialogTitle>Criar tarefa no CRM</DialogTitle>
            <DialogDescription>{description} Se já houver uma tarefa aberta para isto, ela é reaproveitada.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="crm-nova-tarefa-tipo">Tipo</Label>
            <select id="crm-nova-tarefa-tipo" className={SELECT_CLASS} value={form.type} aria-describedby="crm-nova-tarefa-tipo-dica" onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              {TYPES.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
            <p id="crm-nova-tarefa-tipo-dica" className="text-xs text-[var(--suave)]">
              {D3_HINT}
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="crm-nova-tarefa-titulo">Título</Label>
            <Input
              id="crm-nova-tarefa-titulo"
              value={form.title}
              maxLength={160}
              required
              aria-invalid={formError === 'Informe o título.'}
              placeholder="Ex.: Retornar ao cliente sobre o orçamento"
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="crm-nova-tarefa-data">Prazo</Label>
              <Input id="crm-nova-tarefa-data" type="date" value={form.date} aria-describedby="crm-nova-tarefa-data-dica" onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="crm-nova-tarefa-hora">Hora</Label>
              <Input id="crm-nova-tarefa-hora" type="time" value={form.time} disabled={!form.date} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} />
            </div>
            <p id="crm-nova-tarefa-data-dica" className="col-span-2 text-xs text-[var(--suave)]">
              Apague a data para criar sem prazo.{zoneHint}
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="crm-nova-tarefa-prioridade">Prioridade</Label>
            <select id="crm-nova-tarefa-prioridade" className={SELECT_CLASS} value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
              {PRIORITIES.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="crm-nova-tarefa-notas">Observação (opcional)</Label>
            <Textarea id="crm-nova-tarefa-notas" rows={3} maxLength={5000} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          {formError && (
            <p role="alert" className="text-sm text-[var(--vermelho)]">
              {formError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={sending} onClick={() => onOpenChange(false)}>
              Voltar
            </Button>
            <Button type="submit" disabled={sending}>
              {sending ? 'Criando…' : 'Criar tarefa'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export interface CrmTaskButtonProps extends CrmTaskSource {
  /** Classe do botão (padrão `btn`; `btn btn--sm` nos blocos menores). */
  className?: string
  /** Texto do botão (padrão "Criar tarefa"). */
  label?: string
  /** Nome acessível quando há vários botões iguais na tela (ex.: um por negócio). */
  ariaLabel?: string
  onDone?: (activity: CrmActivity, created: boolean) => void
}

/** Botão que abre o diálogo. Sem CRM ligado ou sem permissão de criar tarefas, não aparece. */
export function CrmTaskButton({ className, label = 'Criar tarefa', ariaLabel, ...source }: CrmTaskButtonProps) {
  const allowed = useCrmTaskAllowed()
  const [open, setOpen] = useState(false)
  if (!allowed) return null
  return (
    <>
      <button type="button" className={cn('btn', className)} aria-label={ariaLabel} onClick={() => setOpen(true)} data-testid="crm-task-button">
        <ListTodo className="ic" aria-hidden="true" />
        {label}
      </button>
      <CrmTaskDialog open={open} onOpenChange={setOpen} {...source} />
    </>
  )
}
