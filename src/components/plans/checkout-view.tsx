'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, ArrowRight, Check, CalendarClock, CreditCard, Crown, FlaskConical, Loader2, Lock, PiggyBank, RefreshCw,
  ShieldCheck, TriangleAlert, Users, Wallet, Wifi, XCircle, type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppStore, type View } from '@/lib/store'
import { canOpenView } from '@/lib/permissions'
import { formatCurrency } from '@/lib/utils'
import { formatDocument, formatPhone, isValidDocument, onlyDigits } from '@/lib/billing/format'
import { AddressFields, CardFields, EMPTY_ADDRESS, EMPTY_CARD, addressProblem, cardProblem, tokenizeCard, type AddressValue, type CardValue } from './payment-fields'

interface Plan {
  id: string
  code: string
  name: string
  description: string | null
  monthlyPrice: number
  annualPrice: number
  limits: { maxConnections: number; maxAgents: number; maxConversationsMonthly: number; retentionDays: number; maxAlertRules: number }
}

interface BillingSummary {
  enabled: boolean
  mode: 'test' | 'live' | null
  publicKey: string | null
  subscription: { status: string; plan: { id: string; name: string }; recurring: boolean; billingCycle: string; pending: boolean } | null
}

type Cycle = 'monthly' | 'annual'

const NEXT_STEPS: { view: View; icon: LucideIcon; title: string; text: string }[] = [
  { view: 'connections', icon: Wifi, title: 'Conecte seu WhatsApp', text: 'Conecte o número da empresa para começar a auditar as conversas.' },
  { view: 'members', icon: Users, title: 'Configure sua equipe', text: 'Convide as pessoas e defina as permissões de acesso.' },
  { view: 'alerts', icon: TriangleAlert, title: 'Acompanhe os alertas', text: 'Monitore os atendimentos e aja nos casos que precisam de atenção.' },
]

// Checkout transparente: a pessoa não sai do sistema. O cartão vira token no Pagar.me (navegador → Pagar.me) e só o
// token chega ao nosso servidor, que cria a assinatura com cobrança automática no cartão.
// Visual: assinatura.html do pacote (estado concluído: ativado.html), dentro do conteúdo do painel.
export default function CheckoutView() {
  const { checkout, setView, me, currentOrganization, incrementRefresh } = useAppStore()
  const [plans, setPlans] = useState<Plan[] | null>(null)
  const [billing, setBilling] = useState<BillingSummary | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [cycle, setCycle] = useState<Cycle>(checkout?.cycle ?? 'monthly')
  const [holder, setHolder] = useState({ name: currentOrganization?.name ?? '', document: '', email: me?.email ?? '', phone: currentOrganization?.phone ? formatPhone(currentOrganization.phone) : '' })
  const [address, setAddress] = useState<AddressValue>(EMPTY_ADDRESS)
  const [card, setCard] = useState<CardValue>(EMPTY_CARD)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [done, setDone] = useState<{ status: 'active' | 'processing'; planName: string } | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([fetch('/api/plans'), fetch('/api/billing')])
      .then(async ([p, b]) => {
        if (!p.ok || !b.ok) throw new Error('Não foi possível carregar o checkout.')
        const [pj, bj] = await Promise.all([p.json(), b.json()])
        if (!alive) return
        setPlans(pj.plans || [])
        setBilling(bj)
      })
      .catch((e) => alive && setLoadError(e instanceof Error ? e.message : 'Erro ao carregar'))
    return () => { alive = false }
  }, [])

  // Pagamento ainda em análise: acompanha até a assinatura virar ativa (ou recusar)
  useEffect(() => {
    if (done?.status !== 'processing') return
    const t = setInterval(async () => {
      const r = await fetch('/api/billing').catch(() => null)
      const j = r?.ok ? await r.json() : null
      if (j?.subscription && !j.subscription.pending && j.subscription.plan.name === done.planName && j.subscription.status === 'active') {
        setDone({ status: 'active', planName: done.planName })
        incrementRefresh()
      }
    }, 5000)
    return () => clearInterval(t)
  }, [done, incrementRefresh])

  const plan = useMemo(() => plans?.find((p) => p.id === checkout?.planId) ?? null, [plans, checkout])
  const price = plan ? (cycle === 'annual' ? plan.annualPrice : plan.monthlyPrice) : 0
  const annualSaving = plan ? plan.monthlyPrice * 12 - plan.annualPrice : 0
  const sub = billing?.subscription
  const isChange = !!sub?.recurring && sub.status === 'active'
  const per = cycle === 'annual' ? '/ano' : '/mês'

  const back = () => setView('plans')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!plan || !billing?.publicKey) return
    const problem =
      (holder.name.trim().length < 3 && 'Informe o nome ou a razão social') ||
      (!isValidDocument(holder.document).ok && 'CPF ou CNPJ inválido') ||
      (!/^\S+@\S+\.\S+$/.test(holder.email.trim()) && 'E-mail inválido') ||
      (![10, 11].includes(onlyDigits(holder.phone).length) && 'Telefone inválido (com DDD)') ||
      addressProblem(address) ||
      cardProblem(card)
    if (problem) { setFormError(problem); return }
    setFormError(null)
    setSubmitting(true)
    try {
      const cardToken = await tokenizeCard(billing.publicKey, card)
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, cycle, cardToken, holder, address }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Não foi possível concluir o pagamento.')
      setCard(EMPTY_CARD)
      setDone({ status: data.status, planName: data.planName })
      if (data.status === 'active') {
        incrementRefresh()
        toast.success(`Plano ${data.planName} ativo.`)
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível concluir o pagamento.')
      setCard((c) => ({ ...c, cvv: '' }))
    } finally {
      setSubmitting(false)
    }
  }

  const header = (
    <div>
      <button type="button" className="voltar link-verde inline-flex items-center gap-2 border-0 bg-transparent p-0 no-underline" onClick={back}>
        <ArrowLeft className="ic" aria-hidden="true" />Voltar para Planos
      </button>
      <h1 className="titulo-conta mt-2 text-[clamp(26px,3vw,34px)]">{isChange ? 'Mudar de plano' : 'Contratar plano'}</h1>
      <p className="sub-conta mt-1 text-base">Pagamento com cartão de crédito e renovação automática.</p>
    </div>
  )

  if (loadError) {
    return (
      <div className="conta grid gap-5">
        {header}
        <div className="conta-cartao flex flex-col items-center justify-center gap-4 px-6 py-12 text-center">
          <p className="font-medium text-[var(--vermelho)]">{loadError}</p>
          <button type="button" className="btn btn--lg" onClick={back}>Voltar para Planos</button>
        </div>
      </div>
    )
  }

  if (!plans || !billing) {
    return (
      <div className="conta grid gap-5">
        {header}
        <div className="assinatura">
          <Skeleton className="h-[480px] rounded-3xl" />
          <Skeleton className="h-72 rounded-3xl" />
        </div>
      </div>
    )
  }

  if (!plan || !billing.enabled) {
    return (
      <div className="conta grid gap-5">
        {header}
        <div className="conta-cartao grid justify-items-center gap-4 px-6 py-10 text-center">
          <p className="text-[var(--texto-2)]">{!billing.enabled ? 'O pagamento on-line ainda não está disponível. Use "Solicitar troca" na tela Planos.' : 'Escolha um plano na tela Planos.'}</p>
          <button type="button" className="btn btn--lg" onClick={back}>Voltar para Planos</button>
        </div>
      </div>
    )
  }

  if (done) {
    const active = done.status === 'active'
    const steps = NEXT_STEPS.filter((s) => !!me && canOpenView(me.role, s.view))
    // Compacto, no padrão dos cartões do painel. Destino principal: o painel (primeira contratação: os próximos
    // passos). "Ver assinatura e faturas" leva a Planos, onde ficam a fatura paga, o cartão e a próxima cobrança.
    return (
      <div className="pagamento-ok" data-testid="checkout-done">
        <section className="cartao cartao--pad grid gap-5">
          <div className="pagamento-ok__topo">
            <span className={`pagamento-ok__ic ${active ? '' : 'pagamento-ok__ic--espera'}`} aria-hidden="true">
              {active ? <Check className="ic" /> : <Loader2 className="ic animate-spin" />}
            </span>
            <div>
              <h1>{active ? 'Pagamento aprovado' : 'Pagamento em análise'}</h1>
              <p>
                {active
                  ? `O plano ${done.planName} já está ativo, com os novos limites. A renovação é automática no mesmo cartão.`
                  : `O Pagar.me ainda está confirmando a cobrança. Esta tela atualiza sozinha; o plano ${done.planName} é ativado assim que o pagamento for aprovado.`}
              </p>
            </div>
          </div>

          <dl className="pagamento-ok__resumo">
            <div><dt>Plano</dt><dd>{done.planName}</dd></div>
            <div><dt>Valor</dt><dd>{formatCurrency(price)}<span className="suave font-medium">{per}</span></dd></div>
            <div><dt>Renovação</dt><dd>{cycle === 'annual' ? 'Anual, automática' : 'Mensal, automática'}</dd></div>
            <div><dt>Pagamento</dt><dd>Cartão de crédito</dd></div>
          </dl>

          {active && !isChange && steps.length === NEXT_STEPS.length && (
            <div className="grid gap-2" aria-labelledby="t-prox">
              <h2 id="t-prox" className="text-[14px] font-bold">Próximos passos</h2>
              <ol className="pagamento-ok__passos">
                {steps.map((s, i) => {
                  const Icon = s.icon
                  return (
                    <li key={s.view}>
                      <button type="button" onClick={() => setView(s.view)}>
                        <span className="num" aria-hidden="true">{i + 1}</span>
                        <Icon className="ic" aria-hidden="true" />
                        <span><b>{s.title}</b><span>{s.text}</span></span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn" onClick={back}>Ver assinatura e faturas</button>
            <button type="button" className="btn btn--primario" onClick={() => setView('dashboard')}>Ir para o painel <ArrowRight className="ic" aria-hidden="true" /></button>
          </div>
        </section>
      </div>
    )
  }

  const features = [
    `Até ${plan.limits.maxConversationsMonthly.toLocaleString('pt-BR')} conversas/mês`,
    `${plan.limits.maxAgents} agentes`,
    `${plan.limits.maxConnections} conexão(ões) WhatsApp`,
    `${plan.limits.maxAlertRules} regras de alerta`,
  ]

  const cycles: { value: Cycle; label: string; detail: string }[] = [
    { value: 'monthly', label: 'Mensal', detail: `${formatCurrency(plan.monthlyPrice)}/mês` },
    { value: 'annual', label: 'Anual', detail: annualSaving > 0 ? `${formatCurrency(plan.annualPrice)}/ano · economize ${formatCurrency(annualSaving)}` : `${formatCurrency(plan.annualPrice)}/ano` },
  ]

  return (
    <div className="conta grid gap-4">
      {header}

      {billing.mode === 'test' && (
        <div className="nota-segura" role="note" data-testid="checkout-test-mode">
          <FlaskConical className="ic" aria-hidden="true" />
          <span><b>Ambiente de testes do Pagar.me</b>Nenhuma cobrança real é feita. Use o cartão 4000 0000 0000 0010, qualquer validade futura e CVV 123.</span>
        </div>
      )}

      <form onSubmit={submit} className="assinatura mt-0" noValidate>
        <div className="conta-cartao assinatura__form">
          <div className="passo-form">
            <span className="passo-form__num" aria-hidden="true">1</span>
            <div><h2>Ciclo de cobrança</h2><p>Escolha de quanto em quanto tempo o cartão é cobrado.</p></div>
          </div>
          <div className="forma-pag" role="radiogroup" aria-label="Ciclo de cobrança">
            {cycles.map((c) => (
              <label key={c.value} className="forma">
                <input type="radio" name="cycle" value={c.value} checked={cycle === c.value} onChange={() => setCycle(c.value)} disabled={submitting} aria-label={c.label} />
                {c.value === 'annual' ? <PiggyBank className="ic" aria-hidden="true" /> : <RefreshCw className="ic" aria-hidden="true" />}
                <span><b>{c.label}</b><small>{c.detail}</small></span>
              </label>
            ))}
          </div>

          <div className="passo-form">
            <span className="passo-form__num" aria-hidden="true">2</span>
            <div><h2>Dados de cobrança</h2><p>Aparecem na fatura e no recibo do Pagar.me.</p></div>
          </div>
          <div className="grade-form">
            <div className="campo todo">
              <label htmlFor="holder-name">Nome ou razão social</label>
              <input className="entrada" id="holder-name" autoComplete="organization" value={holder.name} onChange={(e) => setHolder({ ...holder, name: e.target.value })} disabled={submitting} />
            </div>
            <div className="campo">
              <label htmlFor="holder-document">CPF ou CNPJ</label>
              <input className="entrada" id="holder-document" inputMode="numeric" placeholder="000.000.000-00 ou 00.000.000/0001-00" value={holder.document} onChange={(e) => setHolder({ ...holder, document: formatDocument(e.target.value) })} disabled={submitting} />
            </div>
            <div className="campo">
              <label htmlFor="holder-phone">Celular</label>
              <input className="entrada" id="holder-phone" inputMode="tel" autoComplete="tel" placeholder="(11) 99999-9999" value={holder.phone} onChange={(e) => setHolder({ ...holder, phone: formatPhone(e.target.value) })} disabled={submitting} />
            </div>
            <div className="campo todo">
              <label htmlFor="holder-email">E-mail para recibos</label>
              <input className="entrada" id="holder-email" type="email" autoComplete="email" value={holder.email} onChange={(e) => setHolder({ ...holder, email: e.target.value })} disabled={submitting} />
            </div>
          </div>

          <div className="passo-form">
            <span className="passo-form__num" aria-hidden="true">3</span>
            <div><h2>Endereço de cobrança</h2><p>O do titular do cartão. Digite o CEP para preencher o resto.</p></div>
          </div>
          <AddressFields value={address} onChange={setAddress} disabled={submitting} variant="conta" />

          <div className="passo-form">
            <span className="passo-form__num" aria-hidden="true">4</span>
            <div><h2>Cartão de crédito</h2><p>Os dados do cartão vão direto ao Pagar.me; não ficam no AtendeRadar.</p></div>
          </div>
          <CardFields value={card} onChange={setCard} disabled={submitting} variant="conta" />

          {formError && (
            <p className="rounded-xl border border-[var(--vermelho-borda)] bg-[var(--vermelho-fundo)] px-4 py-3 text-sm font-medium text-[var(--vermelho)]" role="alert" data-testid="checkout-error">{formError}</p>
          )}
          <button type="submit" className="btn btn--escuro btn--xl btn--bloco" disabled={submitting}>
            {submitting
              ? <><Loader2 className="ic animate-spin" aria-hidden="true" />Processando…</>
              : <><Lock className="ic" aria-hidden="true" />Pagar {formatCurrency(price)}</>}
          </button>
          <p className="flex items-center justify-center gap-1.5 text-center text-[12.5px] text-[var(--suave)]">
            <Lock className="ic" aria-hidden="true" /> Pagamento seguro: o cartão é processado pelo Pagar.me.
          </p>
        </div>

        <aside className="conta-cartao resumo-plano" aria-label="Seu plano">
          <div className="resumo-plano__cab"><span>Seu plano</span><span className="tag tag--verde">{cycle === 'annual' ? 'Anual' : 'Mensal'}</span></div>
          <div className="resumo-plano__nome">
            <span className="coroa coroa--sm"><Crown className="ic" aria-hidden="true" /></span>
            <div>
              <b>Plano <span data-testid="checkout-plan">{plan.name}</span></b>
              <span className="preco" data-testid="checkout-price">{formatCurrency(price)}{per}</span>
              <small>Renovação automática • Cancele quando quiser</small>
            </div>
          </div>
          <ul className="lista-ok">
            {features.map((f) => (
              <li key={f}><Check className="ic" aria-hidden="true" />{f}</li>
            ))}
          </ul>
          {cycle === 'annual' && annualSaving > 0 && (
            <div className="presente">
              <PiggyBank className="ic" aria-hidden="true" />
              <div><b>Economia de {formatCurrency(annualSaving)} por ano</b>Comparado a 12 mensalidades do plano mensal.</div>
            </div>
          )}
          <div className="totais">
            <div><span>Plano {plan.name}</span><span>{formatCurrency(price)}</span></div>
            <div className="total-hoje"><b>Total hoje</b><strong>{formatCurrency(price)}</strong></div>
            <small>Renova a cada {cycle === 'annual' ? 'ano' : 'mês'} no mesmo cartão</small>
          </div>
          {isChange && (
            <p className="text-xs text-[var(--texto-2)]">O plano atual ({sub!.plan.name}) é encerrado quando este pagamento for aprovado. Não há desconto proporcional pelo período restante.</p>
          )}
          <ul className="garantias">
            <li><span className="ic-bola"><ShieldCheck className="ic" aria-hidden="true" /></span><span><b>Pagamento seguro</b>Número e CVV do cartão vão direto ao Pagar.me.</span></li>
            <li><span className="ic-bola"><XCircle className="ic" aria-hidden="true" /></span><span><b>Cancele quando quiser</b>Em Planos; o plano vale até o fim do período pago.</span></li>
          </ul>
        </aside>
      </form>
    </div>
  )
}
