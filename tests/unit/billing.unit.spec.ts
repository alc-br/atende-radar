import { test, expect } from '@playwright/test'
import {
  isValidCpf, isValidCnpj, isValidDocument, luhnValid, cardBrand, formatCardNumber, formatExpiry, formatDocument, formatCep, formatPhone,
  parseExpiry, priceCents, effectiveStatus, deriveFromProvider, mapInvoice, keepRefunded, subscriptionIdFromEvent, checkBasicAuth, friendlyPaymentError,
  reactivationStartAt,
} from '../../src/lib/billing/core'

// B8 · Cobrança recorrente (Pagar.me): regras puras, sem rede.
test.describe('B8 · documentos e cartão', () => {
  test('CPF e CNPJ com dígito verificador', () => {
    expect(isValidCpf('111.444.777-35')).toBe(true)
    expect(isValidCpf('111.444.777-36')).toBe(false)
    expect(isValidCpf('111.111.111-11')).toBe(false) // sequência repetida
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true)
    expect(isValidCnpj('11.222.333/0001-82')).toBe(false)
    expect(isValidDocument('11144477735')).toEqual({ ok: true, type: 'CPF', digits: '11144477735' })
    expect(isValidDocument('11222333000181')).toEqual({ ok: true, type: 'CNPJ', digits: '11222333000181' })
    expect(isValidDocument('123').ok).toBe(false)
  })

  test('cartão: Luhn, bandeira e máscaras', () => {
    expect(luhnValid('4000 0000 0000 0010')).toBe(true)
    expect(luhnValid('4000 0000 0000 0011')).toBe(false)
    expect(cardBrand('4111')).toBe('Visa')
    expect(cardBrand('5555 5555')).toBe('Mastercard')
    expect(cardBrand('3782 822463 10005')).toBe('American Express')
    expect(cardBrand('6363 68')).toBe('Elo')
    expect(formatCardNumber('4000000000000010')).toBe('4000 0000 0000 0010')
    expect(formatCardNumber('378282246310005')).toBe('3782 822463 10005')
    expect(formatExpiry('1230')).toBe('12/30')
    expect(formatDocument('11144477735')).toBe('111.444.777-35')
    expect(formatDocument('11222333000181')).toBe('11.222.333/0001-81')
    expect(formatCep('01310100')).toBe('01310-100')
    expect(formatPhone('11999998888')).toBe('(11) 99999-8888')
  })

  test('validade: mês/ano no futuro', () => {
    const now = new Date('2026-10-11T12:00:00Z')
    expect(parseExpiry('12/30', now)).toEqual({ month: 12, year: 2030 })
    expect(parseExpiry('10/26', now)).toEqual({ month: 10, year: 2026 }) // ainda vale neste mês
    expect(parseExpiry('09/26', now)).toBeNull()
    expect(parseExpiry('13/30', now)).toBeNull()
  })
})

test.describe('B8 · preço e situação da assinatura', () => {
  const plan = { monthlyPrice: 149, annualPrice: 1490 }
  test('preço em centavos pelo ciclo', () => {
    expect(priceCents(plan, 'monthly')).toBe(14900)
    expect(priceCents(plan, 'annual')).toBe(149000)
    expect(priceCents({ monthlyPrice: 99.9, annualPrice: 0 }, 'monthly')).toBe(9990)
  })

  const now = new Date('2026-10-11T12:00:00Z')
  test('teste grátis vencido não vale como ativo', () => {
    expect(effectiveStatus({ status: 'trialing', trialEnd: new Date('2026-10-20T00:00:00Z'), cancelAtPeriodEnd: false, currentPeriodEnd: new Date('2026-10-20T00:00:00Z') }, now)).toBe('trialing')
    expect(effectiveStatus({ status: 'trialing', trialEnd: new Date('2026-10-01T00:00:00Z'), cancelAtPeriodEnd: false, currentPeriodEnd: new Date('2026-10-01T00:00:00Z') }, now)).toBe('expired')
  })
  test('cancelada continua valendo até o fim do período pago', () => {
    expect(effectiveStatus({ status: 'active', trialEnd: null, cancelAtPeriodEnd: true, currentPeriodEnd: new Date('2026-11-01T00:00:00Z') }, now)).toBe('active')
    expect(effectiveStatus({ status: 'active', trialEnd: null, cancelAtPeriodEnd: true, currentPeriodEnd: new Date('2026-10-01T00:00:00Z') }, now)).toBe('canceled')
  })

  const paid = { status: 'paid', dueAt: new Date('2026-10-11T23:59:59Z'), cycleStart: new Date('2026-10-11T00:00:00Z'), cycleEnd: new Date('2026-11-10T23:59:59Z'), createdAt: new Date('2026-10-11T01:00:00Z') }
  test('situação a partir do provedor: fatura mais recente paga → ativa no ciclo dela', () => {
    expect(deriveFromProvider({ providerStatus: 'active', invoices: [paid] }, now)).toEqual({ status: 'active', periodStart: paid.cycleStart, periodEnd: paid.cycleEnd, everPaid: true })
  })
  test('renovação recusada ou vencida sem pagamento → pagamento pendente; antes do vencimento continua ativa', () => {
    const renewalFailed = { status: 'failed', dueAt: new Date('2026-11-11T23:59:59Z'), cycleStart: new Date('2026-11-11T00:00:00Z'), cycleEnd: new Date('2026-12-10T23:59:59Z'), createdAt: new Date('2026-11-11T01:00:00Z') }
    expect(deriveFromProvider({ providerStatus: 'active', invoices: [paid, renewalFailed] }, new Date('2026-11-11T12:00:00Z')).status).toBe('past_due')
    const pendingNotDue = { ...renewalFailed, status: 'pending' }
    expect(deriveFromProvider({ providerStatus: 'active', invoices: [paid, pendingNotDue] }, new Date('2026-11-11T12:00:00Z')).status).toBe('active')
    expect(deriveFromProvider({ providerStatus: 'active', invoices: [paid, pendingNotDue] }, new Date('2026-11-13T12:00:00Z')).status).toBe('past_due')
  })
  test('nunca pago → sem ativação; cancelada no provedor → canceled', () => {
    expect(deriveFromProvider({ providerStatus: 'active', invoices: [{ ...paid, status: 'failed' }] }, now)).toMatchObject({ status: 'past_due', everPaid: false })
    expect(deriveFromProvider({ providerStatus: 'canceled', invoices: [paid] }, now)).toMatchObject({ status: 'canceled', everPaid: true })
  })
  test('V7 · renovação reativada: sem fatura ainda, segue ativa (período já pago pela assinatura anterior)', () => {
    expect(deriveFromProvider({ providerStatus: 'future', invoices: [], prepaid: true }, now)).toMatchObject({ status: 'active', everPaid: false })
    expect(deriveFromProvider({ providerStatus: 'future', invoices: [] }, now).status).toBe('past_due')
    // a 1ª cobrança da continuação recusada derruba para pagamento pendente, como numa renovação comum
    const failed = { ...paid, status: 'failed', createdAt: new Date('2026-11-11T01:00:00Z') }
    expect(deriveFromProvider({ providerStatus: 'active', invoices: [failed], prepaid: true }, now).status).toBe('past_due')
    expect(deriveFromProvider({ providerStatus: 'canceled', invoices: [], prepaid: true }, now).status).toBe('canceled')
  })
  test('V7 · 1ª cobrança da renovação reativada: o dia seguinte ao fim do período pago (meia-noite UTC)', () => {
    expect(reactivationStartAt(new Date('2026-11-13T23:59:59Z')).toISOString()).toBe('2026-11-14T00:00:00.000Z')
    expect(reactivationStartAt(new Date('2026-11-13T23:59:59.999Z')).toISOString()).toBe('2026-11-14T00:00:00.000Z')
    expect(reactivationStartAt(new Date('2026-11-13T15:30:00Z')).toISOString()).toBe('2026-11-14T00:00:00.000Z')
    expect(reactivationStartAt(new Date('2026-12-31T23:59:59Z')).toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })
})

test.describe('B8 · fatura e aviso (webhook) do Pagar.me', () => {
  const apiInvoice = {
    id: 'in_1', amount: 19700, status: 'paid', payment_method: 'credit_card', due_at: '2026-10-12T23:59:59Z', created_at: '2026-10-12T01:08:26Z',
    subscription: { id: 'sub_1' }, cycle: { start_at: '2026-10-11T00:00:00Z', end_at: '2026-11-10T23:59:59Z' },
    charge: { id: 'ch_1', status: 'paid', paid_at: '2026-10-12T01:08:27Z', last_transaction: { acquirer_message: 'Transação aprovada' } },
    metadata: {},
  }
  test('fatura vira linha da nossa tabela', () => {
    expect(mapInvoice(apiInvoice)).toEqual({
      providerInvoiceId: 'in_1', providerSubscriptionId: 'sub_1', providerChargeId: 'ch_1', amountCents: 19700, status: 'paid', paymentMethod: 'credit_card',
      dueAt: new Date('2026-10-12T23:59:59Z'), paidAt: new Date('2026-10-12T01:08:27Z'), periodStart: new Date('2026-10-11T00:00:00Z'), periodEnd: new Date('2026-11-10T23:59:59Z'),
      failureMessage: null, createdAt: new Date('2026-10-12T01:08:26Z'),
    })
    const failed = mapInvoice({ ...apiInvoice, status: 'failed', charge: { id: 'ch_2', status: 'failed', last_transaction: { acquirer_message: 'Saldo insuficiente' } } })
    expect(failed.failureMessage).toBe('Saldo insuficiente')
    expect(failed.paidAt).toBeNull()
    // estorno (arrependimento): fatura e cobrança "canceled" no Pagar.me, mas a cobrança tinha sido paga
    const charge = { id: 'ch_1', status: 'canceled', paid_at: '2026-10-12T01:08:27Z', paid_amount: 19700, canceled_amount: 19700 }
    expect(mapInvoice({ ...apiInvoice, status: 'canceled', charge })).toMatchObject({ status: 'refunded', paidAt: new Date('2026-10-12T01:08:27Z') })
    // cancelada antes de cobrar continua "canceled"
    expect(mapInvoice({ ...apiInvoice, status: 'canceled', charge: { id: 'ch_3', status: 'canceled', paid_amount: 0, canceled_amount: 19700 } }).status).toBe('canceled')
  })

  test('estorno é final: a fatura estornada não volta para paga quando o Pagar.me ainda a lista como paga', () => {
    const paid = mapInvoice(apiInvoice)
    expect(keepRefunded(paid, 'refunded')).toMatchObject({ status: 'refunded', paidAt: paid.paidAt })
    expect(keepRefunded({ ...paid, status: 'failed', failureMessage: 'x' }, 'refunded')).toMatchObject({ status: 'refunded', failureMessage: null })
    // sem estorno no nosso banco, vale o que o Pagar.me diz
    expect(keepRefunded(paid, 'pending')).toBe(paid)
    expect(keepRefunded(paid, undefined)).toBe(paid)
    const refunded = { ...paid, status: 'refunded' }
    expect(keepRefunded(refunded, 'refunded')).toBe(refunded)
  })

  test('acha a assinatura em qualquer tipo de aviso', () => {
    expect(subscriptionIdFromEvent({ type: 'subscription.created', data: { id: 'sub_9' } })).toBe('sub_9')
    expect(subscriptionIdFromEvent({ type: 'invoice.paid', data: { id: 'in_1', subscription: { id: 'sub_9' } } })).toBe('sub_9')
    expect(subscriptionIdFromEvent({ type: 'invoice.paid', data: { id: 'in_1', subscriptionId: 'sub_9' } })).toBe('sub_9')
    expect(subscriptionIdFromEvent({ type: 'charge.paid', data: { id: 'ch_1', invoice: { subscription_id: 'sub_9' } } })).toBe('sub_9')
    expect(subscriptionIdFromEvent({ type: 'charge.paid', data: { id: 'ch_1', invoice: { subscriptionId: 'sub_9' } } })).toBe('sub_9')
    expect(subscriptionIdFromEvent({ type: 'customer.created', data: { id: 'cus_1' } })).toBeNull()
    expect(subscriptionIdFromEvent(null)).toBeNull()
  })

  test('autenticação básica do aviso: só com usuário e senha certos', () => {
    const header = 'Basic ' + Buffer.from('hook:s3nha').toString('base64')
    expect(checkBasicAuth(header, 'hook', 's3nha')).toBe(true)
    expect(checkBasicAuth(header, 'hook', 'outra')).toBe(false)
    expect(checkBasicAuth(null, 'hook', 's3nha')).toBe(false)
    expect(checkBasicAuth(header, '', '')).toBe(false) // sem credencial configurada, ninguém entra
  })

  test('erros do provedor viram mensagem clara em português', () => {
    expect(friendlyPaymentError(412, { message: 'Could not be created the subscription because Could not create credit card. The card verification failed.' })).toContain('recusado')
    expect(friendlyPaymentError(422, { message: 'The request is invalid.', errors: { 'card.number': ['invalid'] } })).toContain('dados')
    expect(friendlyPaymentError(401, { message: 'Authorization has been denied for this request.' })).toContain('configuração')
    expect(friendlyPaymentError(500, null)).toContain('Pagar.me')
  })
})
