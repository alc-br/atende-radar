'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, CheckCircle2, FlaskConical, Loader2, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useAppStore } from '@/lib/store'
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

// Checkout transparente: a pessoa não sai do sistema. O cartão vira token no Pagar.me (navegador → Pagar.me) e só o
// token chega ao nosso servidor, que cria a assinatura com cobrança automática no cartão.
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
    <div className="flex items-center gap-3">
      <Button variant="ghost" size="icon" onClick={back} aria-label="Voltar para Planos"><ArrowLeft className="w-4 h-4" /></Button>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{isChange ? 'Mudar de plano' : 'Contratar plano'}</h1>
        <p className="text-muted-foreground mt-1">Pagamento com cartão de crédito e renovação automática.</p>
      </div>
    </div>
  )

  if (loadError) {
    return (
      <div className="space-y-6">
        {header}
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <p className="text-destructive font-medium">{loadError}</p>
          <Button variant="outline" onClick={back}>Voltar para Planos</Button>
        </div>
      </div>
    )
  }

  if (!plans || !billing) {
    return (
      <div className="space-y-6">
        {header}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-[480px] rounded-xl lg:col-span-2" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    )
  }

  if (!plan || !billing.enabled) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <CardContent className="py-10 text-center space-y-4">
            <p className="text-muted-foreground">{!billing.enabled ? 'O pagamento on-line ainda não está disponível. Use "Solicitar troca" na tela Planos.' : 'Escolha um plano na tela Planos.'}</p>
            <Button variant="outline" onClick={back}>Voltar para Planos</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (done) {
    return (
      <div className="space-y-6">
        {header}
        <Card className="max-w-xl mx-auto" data-testid="checkout-done">
          <CardContent className="py-10 text-center space-y-4">
            {done.status === 'active' ? (
              <>
                <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-xl font-semibold">Pagamento aprovado</h2>
                <p className="text-muted-foreground">O plano {done.planName} já está ativo, com os novos limites. A renovação é automática no mesmo cartão; você pode cancelar quando quiser em Planos.</p>
              </>
            ) : (
              <>
                <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                <h2 className="text-xl font-semibold">Pagamento em análise</h2>
                <p className="text-muted-foreground">O Pagar.me ainda está confirmando a cobrança. Esta tela atualiza sozinha; o plano {done.planName} é ativado assim que o pagamento for aprovado.</p>
              </>
            )}
            <Button onClick={back}>Ir para Planos</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const features = [
    `Até ${plan.limits.maxConversationsMonthly.toLocaleString('pt-BR')} conversas/mês`,
    `${plan.limits.maxAgents} agentes`,
    `${plan.limits.maxConnections} conexão(ões) WhatsApp`,
    `${plan.limits.maxAlertRules} regras de alerta`,
    `Histórico de ${plan.limits.retentionDays} dias`,
  ]

  return (
    <div className="space-y-6">
      {header}

      {billing.mode === 'test' && (
        <Alert data-testid="checkout-test-mode">
          <FlaskConical className="w-4 h-4" />
          <AlertTitle>Ambiente de testes do Pagar.me</AlertTitle>
          <AlertDescription>Nenhuma cobrança real é feita. Use o cartão 4000 0000 0000 0010, qualquer validade futura e CVV 123.</AlertDescription>
        </Alert>
      )}

      <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start" noValidate>
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Dados de cobrança</CardTitle>
              <CardDescription>Aparecem na fatura e no recibo do Pagar.me.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="holder-name">Nome ou razão social</Label>
                <Input id="holder-name" autoComplete="organization" value={holder.name} onChange={(e) => setHolder({ ...holder, name: e.target.value })} disabled={submitting} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="holder-document">CPF ou CNPJ</Label>
                <Input id="holder-document" inputMode="numeric" value={holder.document} onChange={(e) => setHolder({ ...holder, document: formatDocument(e.target.value) })} disabled={submitting} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="holder-phone">Celular</Label>
                <Input id="holder-phone" inputMode="tel" autoComplete="tel" placeholder="(11) 99999-9999" value={holder.phone} onChange={(e) => setHolder({ ...holder, phone: formatPhone(e.target.value) })} disabled={submitting} />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="holder-email">E-mail para recibos</Label>
                <Input id="holder-email" type="email" autoComplete="email" value={holder.email} onChange={(e) => setHolder({ ...holder, email: e.target.value })} disabled={submitting} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Endereço de cobrança</CardTitle>
              <CardDescription>O do titular do cartão. Digite o CEP para preencher o resto.</CardDescription>
            </CardHeader>
            <CardContent>
              <AddressFields value={address} onChange={setAddress} disabled={submitting} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Cartão de crédito</CardTitle>
              <CardDescription className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Os dados do cartão vão direto ao Pagar.me; não ficam no Atende Radar.</CardDescription>
            </CardHeader>
            <CardContent>
              <CardFields value={card} onChange={setCard} disabled={submitting} />
            </CardContent>
          </Card>
        </div>

        <Card className="lg:sticky lg:top-4">
          <CardHeader>
            <CardTitle className="text-lg">Resumo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Plano</p>
              <p className="text-xl font-semibold" data-testid="checkout-plan">{plan.name}</p>
            </div>
            <ToggleGroup type="single" variant="outline" value={cycle} onValueChange={(v) => v && setCycle(v as Cycle)} className="w-full" disabled={submitting} aria-label="Ciclo de cobrança">
              <ToggleGroupItem value="monthly" className="flex-1">Mensal</ToggleGroupItem>
              <ToggleGroupItem value="annual" className="flex-1">Anual</ToggleGroupItem>
            </ToggleGroup>
            <div>
              <p className="text-3xl font-bold" data-testid="checkout-price">
                {formatCurrency(price)}
                <span className="text-base font-normal text-muted-foreground">{cycle === 'annual' ? '/ano' : '/mês'}</span>
              </p>
              {cycle === 'annual' && annualSaving > 0 && <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-1">Economia de {formatCurrency(annualSaving)} por ano</p>}
            </div>
            <ul className="space-y-1.5 border-t pt-3">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm"><Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />{f}</li>
              ))}
            </ul>
            <div className="border-t pt-3 text-xs text-muted-foreground space-y-1.5">
              <p>Cobrança hoje de {formatCurrency(price)} e renovação automática a cada {cycle === 'annual' ? 'ano' : 'mês'} no mesmo cartão. Cancele quando quiser em Planos; o plano vale até o fim do período pago.</p>
              {isChange && <p>O plano atual ({sub!.plan.name}) é encerrado quando este pagamento for aprovado. Não há desconto proporcional pelo período restante.</p>}
            </div>
            {formError && <p className="text-sm text-destructive" role="alert" data-testid="checkout-error">{formError}</p>}
            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processando…</> : <>Pagar {formatCurrency(price)}</>}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
