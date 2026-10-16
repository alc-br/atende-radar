# Manual Stone: cobrança com cartão e Pix nos sistemas da ALC

Manual para integrar qualquer sistema da ALC (AtendeRadar, Completa, ALCADEMY…) à conta Stone da A L CHIPAK. Escrito a partir do AtendeRadar, que já cobra assim, e conferido na API em 16/10/2026. Não há segredos aqui.

## 1. Qual API usar

Em 2026 a Pagar.me passou a fazer parte da Stone. Tem três nomes no caminho, e só um deles é para nós:

| Nome | O que é | Usamos? |
|---|---|---|
| **Dash Stone** (conta.stone.com.br) | Painel da conta: vendas, webhooks, chaves, saldo | **Sim**, é onde se administra tudo |
| **API Pagar.me v5** (`https://api.pagar.me/core/v5`, doc em docs.pagar.me) | API de pagamentos com cliente, cartão guardado, assinatura, pedido avulso, Pix, estorno e webhooks | **Sim**, é a API de integração |
| **Stone Online** (online.stone.com.br, `payments.stone.com.br/v1/charges`) | API de **autorizador**, para gateways e subadquirentes que têm certificação PCI DSS, antifraude e recorrência próprios. Recebe o número do cartão em aberto. | **Não**. A própria doc da Stone manda quem não tem essas estruturas usar a API Pagar.me |

O dash.pagar.me antigo só serve para consulta e mostra a conta antiga como "INATIVO". Isso é esperado.

**Prova (16/10/2026):** as chaves geradas na Dash Stone respondem 200 na API v5. Em produção e em teste, elas geram token de cartão, criam pedido, fazem estorno e geram QR Code de Pix. A Dash Stone envia os webhooks da conta real para os três sistemas, e os três respondem 200.

## 2. Chaves e variáveis

Na **Dash Stone**, abra o menu do usuário (canto superior direito) → Perfil → **Chaves de autenticação**. Use as do tipo "Nova integração". São quatro chaves:

| Variável | Formato | Onde fica |
|---|---|---|
| `PAGARME_PUBLIC_KEY` | `pk_…` | navegador (gera o token do cartão) |
| `PAGARME_SECRET_KEY` | `sk_…` | **só no servidor** |
| `PAGARME_PUBLIC_KEY_TEST` | `pk_test_…` | navegador, no modo teste |
| `PAGARME_SECRET_KEY_TEST` | `sk_test_…` | servidor, no modo teste |
| `PAGARME_WEBHOOK_USER` / `PAGARME_WEBHOOK_PASS` | você escolhe | servidor e cadastro do webhook |
| `PAGARME_MODE` | `test` ou `live` | servidor; o padrão deve ser `test` |

- A chave secreta nunca vai para o navegador, para o git nem para log.
- Uma variável de modo escolhe o par de chaves: `live` usa as chaves de produção, qualquer outro valor usa as de teste.
- A conta é **compartilhada** pelos sistemas da ALC: as mesmas chaves servem para todos.

## 3. Autenticação

Toda chamada do servidor usa **HTTP Basic** com a chave secreta como usuário e senha vazia:

```
Authorization: Basic base64("sk_...:")
Content-Type: application/json
```

Conferência rápida da chave (deve responder 200):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -u "$PAGARME_SECRET_KEY:" https://api.pagar.me/core/v5/customers?size=1
```

## 4. Cartão: checkout transparente, sem o cartão passar pelo servidor

1. **No navegador**, o formulário manda o cartão direto para a API, só com a chave pública:

   ```js
   const res = await fetch(`https://api.pagar.me/core/v5/tokens?appId=${publicKey}`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ type: 'card', card: { number, holder_name, exp_month, exp_year, cvv } }),
   })
   const { id: cardToken } = await res.json() // "token_…", vale 60 s e só pode ser usado uma vez
   ```

2. O navegador envia **só o `cardToken`** ao seu servidor, junto com nome, e-mail, CPF/CNPJ e endereço de cobrança.
3. O servidor cria a cobrança (seção 5 ou 6) com a chave secreta.

- **CSP:** se o sistema usa Content-Security-Policy, inclua `https://api.pagar.me` em `connect-src`.
- **Domínios:** em 16/10/2026 a geração de token funcionou de qualquer origem, sem precisar cadastrar domínio na conta.

## 5. Assinatura (cobrança recorrente, como no AtendeRadar)

1. Crie o cliente com `POST /customers`:

   ```json
   { "name": "…", "email": "…", "document": "12345678909", "document_type": "CPF", "type": "individual",
     "code": "id-do-cliente-no-seu-sistema",
     "address": { "line_1": "número, rua, bairro", "zip_code": "83301010", "city": "Piraquara", "state": "PR", "country": "BR" },
     "phones": { "mobile_phone": { "country_code": "55", "area_code": "41", "number": "999999999" } } }
   ```

   Para empresa: `"document_type": "CNPJ", "type": "company"`.

2. Crie a assinatura com `POST /subscriptions`:

   ```json
   { "customer_id": "cus_…", "payment_method": "credit_card", "interval": "month", "interval_count": 1,
     "billing_type": "prepaid", "installments": 1, "currency": "BRL", "statement_descriptor": "NOMENAFATURA",
     "items": [{ "description": "Plano Pro (mensal)", "quantity": 1, "pricing_scheme": { "scheme_type": "unit", "price": 29900 } }],
     "card_token": "token_…", "card": { "billing_address": { …mesmo formato do address… } },
     "metadata": { "app": "nome-do-sistema", "organizationId": "…" } }
   ```

3. **Só libere o acesso quando a 1ª fatura estiver paga.** Para conferir, leia as faturas com `GET /invoices?subscription_id=sub_…`. Se o cartão for recusado, cancele a assinatura na hora.

As outras operações:

| Operação | Chamada |
|---|---|
| Trocar o cartão | `PATCH /subscriptions/{id}/card` com `{ "card_token": "…", "card": { "billing_address": … } }` |
| Cancelar | `DELETE /subscriptions/{id}` com `{ "cancel_pending_invoices": true }`. É definitivo: a assinatura não volta. Para reativar, crie uma nova com `card_id` e `start_at` no fim do período pago |
| Consultar | `GET /subscriptions/{id}` |
| Estorno (ex.: arrependimento em 7 dias) | `DELETE /charges/{charge_id}` com o id da cobrança **atual** da fatura (uma cobrança reprocessada ganha id novo) |

## 6. Compra avulsa (como no Completa e no ALCADEMY): `POST /orders`

**Cartão:**

```json
{ "code": "id-do-pedido-no-seu-sistema",
  "items": [{ "code": "apostila-123", "description": "Apostila TRF – Português", "quantity": 1, "amount": 4990 }],
  "customer": { …mesmo formato do POST /customers… },
  "payments": [{ "payment_method": "credit_card",
                 "credit_card": { "installments": 1, "statement_descriptor": "NOMENAFATURA", "card_token": "token_…",
                                  "card": { "billing_address": { … } } } }],
  "metadata": { "app": "nome-do-sistema", "pedido": "…" } }
```

A resposta traz `status` (`paid`, `failed`, `pending`…) e `charges[0].id`. Estorno: `DELETE /charges/{charge_id}`; para estorno parcial, envie `{ "amount": centavos }` no corpo.

**Pix:** troque o pagamento por `{ "payment_method": "pix", "pix": { "expires_in": 3600 } }`. O QR Code vem em `charges[0].last_transaction.qr_code` (copia e cola) e `qr_code_url` (imagem). A confirmação do pagamento chega pelo webhook `order.paid` / `charge.paid`.

**Valores:** sempre em centavos e sempre calculados no servidor, nunca vindos do navegador.

## 7. Webhooks

**Cadastro:** Dash Stone → **Vendas online → Webhooks**.

| Campo | Valor |
|---|---|
| URL | a rota do seu sistema, por exemplo `https://app.atenderadar.com.br/api/billing/webhook` |
| Autenticação | Basic, com `PAGARME_WEBHOOK_USER` / `PAGARME_WEBHOOK_PASS` |
| Eventos | **todos**: o sistema ignora o que não é dele |

**Regras para a rota (todas usadas no AtendeRadar):**

1. **Confira o Basic Auth** com comparação de tempo constante. Se não bater, responda 401.
2. **Não confie no conteúdo do aviso.** Use o aviso só para saber *qual* assinatura ou pedido mudou e **leia o estado de novo na API** (`GET /subscriptions/{id}` ou `GET /orders/{id}`). Assim um aviso falso não libera nada.
3. **A conta é compartilhada.** Todos os sistemas recebem os avisos de todos. Por isso toda cobrança leva `metadata.app = "nome-do-sistema"`. Se o objeto relido não tiver o seu `app`, responda **200** e ignore. Se a API responder 404 (objeto de outra conta ou ambiente), também responda 200.
4. **Avisos repetidos:** grave o `id` do evento e não processe duas vezes.
5. **Erro seu (banco fora, API fora):** responda 500, e a Stone reenvia o aviso. Para tudo o mais, responda 200.
6. **Não dependa só do webhook.** Tenha também uma varredura periódica (no AtendeRadar, a cada 15 min) e uma leitura ao abrir a tela de cobrança.

Os eventos mais úteis:
- **Assinatura:** `subscription.created`, `subscription.canceled`, `invoice.paid`, `invoice.payment_failed`.
- **Pedido:** `order.paid`, `order.payment_failed`, `order.canceled`.
- **Cobrança:** `charge.paid`, `charge.refunded`, `charge.payment_failed`.

**Como ver se os avisos estão chegando:**
- No painel: Vendas online → Webhooks → **Eventos**.
- Pela API: `GET /hooks?size=10` lista as entregas com `status`, tentativas e o código que o seu sistema respondeu.

```bash
curl -s -u "$PAGARME_SECRET_KEY:" "https://api.pagar.me/core/v5/hooks?size=10"
```

**Modo teste: a Stone não envia webhook de vendas de teste.** A Dash Stone tem um único cadastro de webhook, sem seletor de ambiente (só as chaves têm versão de teste), e ele vale para a conta real. Em 16/10/2026 a conta de teste tinha zero entregas, mesmo depois de 3 pedidos de teste no dia. Consequências:

- Em teste, o sistema precisa se sincronizar sozinho: varredura periódica e leitura ao abrir a tela.
- Para testar a rota do webhook, chame-a você mesmo com um evento no formato da Stone, com Basic Auth e o id de uma assinatura ou pedido real do sandbox. Como a rota relê o estado na API, o teste exercita o caminho inteiro (ex.: `tests/e2e/billing-pagarme.spec.ts`, "aviso (webhook)").
- A prova de ponta a ponta com a própria Stone só existe em produção: uma venda real de valor baixo, estornada em seguida, e conferir em Webhooks → Eventos ou em `GET /hooks`.

## 8. Testes (sandbox)

- **Cartão aprovado:** `4000 0000 0000 0010`, validade futura, CVV `123`.
- **Cartão recusado:** `4000 0000 0000 0028`. Na integração nova da Stone, o CVV `6xx` deixou de recusar.
- **Onde ver:** as vendas de teste aparecem na Dash Stone → Vendas online → **Vendas de teste**.
- **Boleto:** não está habilitado na conta.
- **Pix:** gera QR Code no sandbox.

## 9. Passar para produção

1. Confira se as chaves de produção (`pk_…` / `sk_…`, sem `_test`) estão no servidor.
2. Troque `PAGARME_MODE=test` por `live` e reinicie o serviço.
3. Faça uma compra real de valor baixo, confira em **Webhooks → Eventos** se o aviso chegou com resposta 200 e estorne.
4. As assinaturas e pedidos feitos no sandbox não existem na produção.

## 10. Armadilhas já vistas

- **"Stone Online" não é a API certa.** Ela exige PCI DSS e não tem assinatura, cliente nem webhook. Não migre para ela.
- **Sem webhook em teste:** a Stone só avisa vendas reais; o sandbox depende da sincronização do próprio sistema.
- **Conta compartilhada:** sem `metadata.app`, um sistema pode liberar acesso por um pagamento de outro sistema.
- **Valores em centavos.** `29900` = R$ 299,00.
- **Token de cartão:** vale **60 s** e só pode ser usado uma vez. Gere o token só no clique de pagar.
- **Cancelamento de assinatura:** é definitivo.
- **Cobrança reprocessada** ganha **id novo**: estorne pelo id atual.
- **Mudanças de 28/08/2026** em docs.pagar.me/docs/mudanças-de-apis (recebíveis, saldo, antecipação): não atingem cobrança, assinatura nem webhook.

## Referência no código do AtendeRadar

- **Cliente da API:** `src/lib/billing/pagarme.ts`
- **Regras puras:** `src/lib/billing/core.ts`, com testes em `tests/unit/billing.unit.spec.ts`
- **Fluxo:** `src/lib/billing/service.ts`
- **Webhook:** `src/app/api/billing/webhook/route.ts`
- **Token no navegador:** `src/components/plans/payment-fields.tsx`
- **Testes reais no sandbox:** `tests/e2e/billing-pagarme.spec.ts`, `tests/e2e/billing-checkout.ui.spec.ts`
- **Operação deste sistema:** `docs/operacao/cobranca-pagarme.md`
