// Apoio aos testes de cobrança: cartões de teste do SANDBOX do Pagar.me. Na integração nova da Stone (13/10/2026) a
// recusa vem pelo número do cartão (final 0028 = "não autorizada"); o CVV 6xx da conta antiga passou a ser aprovado.
// O token é gerado direto no Pagar.me com a chave pública, como o navegador faz.
export const WEBHOOK_USER = 'webhook-e2e'
export const WEBHOOK_PASS = 'webhook-e2e-senha'
export const APPROVED = { number: '4000000000000010', cvv: '123' }
export const DECLINED = { number: '4000000000000028', cvv: '123' }
export const MASTERCARD = { number: '5555555555554444', cvv: '123' }

export async function cardToken(publicKey: string, card: { number: string; cvv: string }, holder = 'MARIA SILVA'): Promise<string> {
  const res = await fetch(`https://api.pagar.me/core/v5/tokens?appId=${publicKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'card', card: { number: card.number, holder_name: holder, exp_month: 12, exp_year: 2031, cvv: card.cvv } }),
  })
  const body = await res.json()
  if (!res.ok || !body.id) throw new Error(`token do cartão falhou: ${res.status} ${JSON.stringify(body)}`)
  return body.id
}

export const billingData = (overrides: Record<string, unknown> = {}) => ({
  holder: { name: 'Clínica Teste Ltda', email: 'financeiro@cliente.test', document: '11.222.333/0001-81', phone: '(11) 99999-8888' },
  address: { zipCode: '01310-100', street: 'Avenida Paulista', number: '1000', complement: 'Sala 1', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' },
  ...overrides,
})

export const basic = (user = WEBHOOK_USER, pass = WEBHOOK_PASS) => 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
