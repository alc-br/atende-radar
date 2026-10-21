# Medição e anúncios: GTM, GA4 e Meta

Guia da medição do AtendeRadar, no site (atenderadar.com.br) e no app (app.atenderadar.com.br). O site e o app já
mandam os eventos para o `dataLayer`. O servidor já manda a compra (GA4 e Meta) e o cadastro (Meta) na hora em que
acontecem. Os IDs foram criados em 20/10/2026 na conta operacional da ALC. Os públicos o deploy grava no `app.env`.
Os dois segredos vão como *secrets* do GitHub, que o deploy também grava. Nenhum ID foi inventado. O que ainda falta
está marcado como **PENDENTE**.

**As tags do GTM são configuradas pela ALC; não publique versão do GTM.**

## IDs

| Onde | Variável | Situação |
|---|---|---|
| Google Tag Manager (contêiner web) | `GTM_ID` (`app.env`, pelo deploy) | `GTM-P43TS3SF` |
| GA4, ID de medição | `GA4_MEASUREMENT_ID` (`app.env`, pelo deploy) e tag no GTM | `G-1KVLT8H1ZP` (conta a412743241, propriedade p559894910, fluxo web 16169835418) |
| GA4, segredo da API do Measurement Protocol | `GA4_API_SECRET` (*secret* do GitHub) | **PENDENTE**, o dono cadastra. Chave "atenderadar-servidor" em GA4 > Administrador > Fluxos de dados > fluxo do AtendeRadar > Chaves secretas da API do Measurement Protocol |
| Meta, ID do pixel (conjunto de dados) | `META_PIXEL_ID` (`app.env`, pelo deploy) e tag no GTM | `1795760021571040` (portfólio "Al Chipak Treinamentos e Serviços") |
| Meta, token da API de Conversões | `META_CAPI_TOKEN` (*secret* do GitHub) | **PENDENTE**, o dono cadastra. Gerenciador de Eventos > conjunto do AtendeRadar > Configurações > API de Conversões > Gerar token |
| Meta, código de teste | `META_TEST_EVENT_CODE` (`app.env`, só durante o teste; apagar depois) | opcional |
| Google Ads, conversão de compra | só no GTM | PENDENTE: sem conta do Ads por enquanto |

Outras variáveis do servidor:

- `GA4_DEBUG=1` faz a compra do servidor aparecer no DebugView. Tire depois do teste.
- `META_GRAPH_VERSION` tem padrão `v23.0`.

Todas estão no `.env.example`. O GTM só carrega com um `GTM_ID` válido (`GTM-` e 4 a 12 letras ou números), em todas
as páginas do site e do app (layout raiz, `src/app/layout.tsx`). Sem os segredos, nada é enviado pelo servidor e o
log registra `ga4:sem-id` / `meta:sem-id`.

### Cadastrar os segredos (dono)

Os valores não passam por arquivo, commit, chat nem log: o repositório é público. No computador do dono, com o `gh`
logado na conta do repositório, cada comando pede o valor sem mostrar na tela:

```bash
gh secret set GA4_API_SECRET --repo alc-br/atende-radar
```

```bash
gh secret set META_CAPI_TOKEN --repo alc-br/atende-radar
```

Os segredos entram no `app.env` no próximo deploy (qualquer push na `main` ou "Run workflow" no Actions). Para conferir
no servidor sem ver o valor: `grep -c '^GA4_API_SECRET=.' /opt/atende-radar/shared/app.env` deve dar `1`.

## Consentimento (Consent Mode v2 e LGPD)

Até a pessoa escolher, `analytics_storage`, `ad_storage`, `ad_user_data` e `ad_personalization` ficam **denied**. Esse
padrão vem no `<head>`, antes do GTM (`CONSENT_DEFAULT_SCRIPT` em `src/lib/gtm.ts`). Se já houver escolha salva no
cookie `ar_consent`, vale o que está nele. Com anúncios negados, vai também `ads_data_redaction`. O script ainda empurra
o evento `consent_state`.

O aviso de cookies fica em `src/components/consent/cookie-consent.tsx`, com Aceitar todos, Recusar e Configurar no
mesmo peso. A escolha fica no cookie próprio `ar_consent` por 180 dias, no domínio `.atenderadar.com.br`, o que vale
para o site e para o app. Depois da escolha vão `gtag('consent','update',...)` e o evento `consent_update`, com
`consent_analytics` e `consent_ads`. Para rever a escolha:

- no site, "Preferências de cookies" no rodapé;
- no app, "Preferências de cookies" no menu lateral.

A explicação ao cliente está na /privacidade, seção 5 ("Cookies"), na versão 2026-10-21.

No GTM:

1. Admin > Configurações do contêiner > ativar **Visão geral do consentimento**.
2. Tags do Google:
   - GA4 com consentimento adicional `analytics_storage`;
   - Ads com `ad_storage` + `ad_user_data`.

   Sem permissão, nenhuma tag grava cookie, como diz a /privacidade.
3. Tags da Meta com consentimento adicional `ad_storage`. Sem ele, não disparam.
4. Acionador extra para as tags de página: evento personalizado `consent_update`, para a página em que a pessoa aceitou.

## Eventos do dataLayer

| Evento | Quando | Dados |
|---|---|---|
| `consent_state` | toda página, antes do GTM | `consent_analytics`, `consent_ads` (`granted`/`denied`) |
| `consent_update` | a pessoa escolheu no aviso | `consent_analytics`, `consent_ads` |
| `sign_up` | conta criada no app (cadastro por e-mail) | `event_id` = `sign_up.<id da empresa>`, `method` = `email` |
| `begin_checkout` | abriu a tela de pagamento de um plano | `event_id`, `ecommerce.value`, `currency` BRL, `items` |
| `add_payment_info` | clicou em pagar (antes de enviar o cartão) | `event_id`, `ecommerce.payment_type` = `cartao`, `value`, `items` |
| `purchase` | assinatura ativa na tela de pagamento, uma vez por assinatura neste navegador | `event_id` = `purchase.<id da assinatura no Pagar.me>`, `ecommerce.transaction_id` (o mesmo id), `value`, `currency` BRL, `items` |

`items`: `[{ item_id: <código do plano>, item_name, item_variant: monthly|annual, price, quantity: 1 }]`.

Nunca vai dado pessoal para o `dataLayer`: nome, e-mail, telefone e documento ficam fora. Antes de cada evento de
e-commerce vai `{ ecommerce: null }`, para um evento não herdar os itens do anterior.

**Sem `generate_lead`.** O AtendeRadar não tem formulário de lead. O "Começar teste grátis" leva direto ao cadastro, que já é
o `sign_up`, e o contato comercial é por e-mail ou WhatsApp, fora do site. Se um formulário de lead for criado, ele
manda `generate_lead` com `event_id` = `lead.<id>`, no padrão acima.

## Tags a criar no GTM

**GA4**

- Tag do Google com `G-1KVLT8H1ZP`, acionada em todas as páginas.
- Uma tag de evento GA4 para `sign_up`, `begin_checkout` e `add_payment_info`, com "Enviar dados de e-commerce" a
  partir do dataLayer. Fica de fora o `purchase`: a compra do GA4 vem só do servidor (Measurement Protocol), na 1ª
  cobrança paga, com o `client_id` do `_ga` do comprador. Uma tag `purchase` no GTM contaria a venda duas vezes.

**Meta**

- Pixel base em todas as páginas.
- `CompleteRegistration` no evento `sign_up` e `Purchase` no evento `purchase`, os dois com `eventID` = variável do
  dataLayer `event_id`. O servidor manda os mesmos eventos pela API de Conversões com o mesmo `event_id`, e a Meta junta
  os dois.
- No `Purchase`: `value` = `ecommerce.value`, `currency` = `BRL`.
- `InitiateCheckout` no `begin_checkout` e `AddPaymentInfo` no `add_payment_info` são opcionais: o servidor não manda
  esses dois.

**Google Ads (PENDENTE, quando houver conta)**

- Vinculador de conversões em todas as páginas.
- Conversão de compra no evento `purchase`, com valor `ecommerce.value`, moeda BRL e ID da transação
  `ecommerce.transaction_id`.

**Cuidados com a CSP do AtendeRadar** (`src/lib/csp.ts`):

- Os scripts rodam com nonce + `'strict-dynamic'`. O `gtm.js` recebe o nonce da página e passa a confiança para os
  scripts que ele carrega. Isso também vale para os modelos da galeria e o pixel por modelo.
- Prefira as tags nativas e os **modelos** da galeria da comunidade a HTML personalizado. Um `<script>` inline de uma
  tag de HTML personalizado depende do GTM repassar o nonce e pode ser bloqueado pela CSP. Teste sempre no modo Preview,
  com o console aberto, antes de pedir a publicação.
- Domínios liberados:
  - **script-src:** www.googletagmanager.com, connect.facebook.net, www.googleadservices.com, googleads.g.doubleclick.net
  - **connect-src:** `*.google-analytics.com`, `*.analytics.google.com`, `*.googletagmanager.com`, `*.g.doubleclick.net`, www.google.com, www.facebook.com, connect.facebook.net
  - **img-src:** os mesmos do connect-src, mais www.google.com.br
  - **frame-src:** www.googletagmanager.com, td.doubleclick.net

  Uma tag que chame outro domínio é bloqueada: mude a CSP e o teste `tests/e2e/csp.ui.spec.ts` junto.
- O site manda `Cross-Origin-Embedder-Policy: require-corp`. Os scripts e pixels do Google e da Meta respondem com
  `Cross-Origin-Resource-Policy: cross-origin` e carregam. O iframe `td.doubleclick.net` do remarketing do Ads pode
  ser recusado pelo navegador por causa da COEP. Se a conversão do Ads não registrar, comece a investigar por aí.

## Origem da venda (UTM)

Quando a visita chega com `utm_*`, `gclid`, `gbraid`, `wbraid` ou `fbclid`, o script do `<head>` guarda esses
parâmetros por 90 dias no cookie próprio `ar_attr`, junto com a página de entrada e a hora, sem nome nem e-mail. Ele
roda antes do app tirar a query do endereço.

No cadastro, a origem vai para `Organization.attribution`, com o `_ga`, `_ga_<fluxo>`, `_fbp`, `_fbc` (ou um montado do
`fbclid`) e a escolha de consentimento.

No checkout, vai para `Subscription.attribution`: a origem da visita, o e-mail e o celular só em hash SHA-256, e o id
externo. Se a visita do checkout não tiver campanha, vale a do cadastro.

Para consultar no servidor:

```bash
sqlite3 <banco do DATABASE_URL> "select id, attribution from Subscription where organizationId = '...'"
```

## Envio pelo servidor

A fila é a tabela `ConversionEvent` (`src/lib/conversions.ts`). Ela roda meio segundo depois de cada registro e, de
novo, a cada minuto. Se falhar, tenta até 6 vezes (1, 5, 15, 60 e 240 min). Envios:

| Evento | Quando | Para onde | Condição |
|---|---|---|---|
| `purchase` | 1ª cobrança paga de uma assinatura do AtendeRadar (`metadata.app = atende-radar`), na ativação: checkout, aviso do Pagar.me ou sincronização. Uma vez: o id é `purchase.<id da assinatura>` | GA4 (`purchase`, `client_id` do `_ga`, `session_id`, `transaction_id`, valor, BRL, itens) e Meta (`Purchase`, mesmo `event_id`, `em`/`ph`/`external_id` em SHA-256, `fbp`/`fbc`, valor, BRL) | GA4 só com consentimento de medição; Meta só com consentimento de anúncios |
| `sign_up` | conta criada | Meta (`CompleteRegistration`, mesmo `event_id` do navegador) | consentimento de anúncios |
| `renewal` | renovação paga | nada: fica registrada (`nao-enviado:renovacao`) | renovação não é compra |

Reativar uma assinatura cancelada também não conta como compra. No Pagar.me de teste (`PAGARME_MODE=test`), a compra
fica `ignorado:sandbox`.

Uma linha por envio no log (`journalctl -u atende-radar.service | grep '"event":"conversion"'`):

```json
{"event":"conversion","kind":"purchase","id":"purchase.sub_...","result":["ga4:ok","meta:ok"]}
```

Resultados possíveis:

| Resultado | Significado |
|---|---|
| `ga4:ok` / `meta:ok` | enviado |
| `ga4:sem-id` / `meta:sem-id` | falta ID ou segredo no `app.env` |
| `ga4:sem-consentimento` / `meta:sem-consentimento` | a pessoa não aceitou |
| `ga4:sem-client-id` | aceitou, mas não havia `_ga` (GTM ainda sem a tag do GA4, ou bloqueador) |
| `ignorado:sandbox` | Pagar.me de teste |
| `nao-enviado:renovacao` | renovação, não é enviada |

Erro HTTP gera nova tentativa. O texto do erro nunca leva o token.

## Teste de aceite

1. **GTM no ar.** Depois do deploy, o site e o app carregam `https://www.googletagmanager.com/gtm.js?id=GTM-P43TS3SF`:
   - DevTools > Rede, em atenderadar.com.br e app.atenderadar.com.br;
   - ou `curl -s https://atenderadar.com.br/ | grep -c GTM-P43TS3SF`.
2. **Segredos.** Com os segredos cadastrados (seção acima), ponha no `app.env` `GA4_DEBUG=1` e
   `META_TEST_EVENT_CODE=<código da aba Eventos de teste>`, depois `sudo systemctl restart atende-radar.service`.
3. **Assinatura real.** Numa janela anônima, abra `https://atenderadar.com.br/?utm_source=teste&utm_campaign=medicao`,
   aceite os cookies, crie uma conta e assine com cartão real o plano de R$ 1.
4. **GA4.** Em DebugView, `purchase` com `transaction_id` = id da assinatura e valor 1.
5. **Meta.** Em Eventos de teste:
   - `Purchase` do navegador e do servidor, mostrado como desduplicado;
   - `CompleteRegistration` do servidor (e do navegador, se a tag existir).
6. **Servidor.**
   - `Subscription.attribution` com `utm_source = teste`;
   - log `{"event":"conversion","kind":"purchase",...,"result":["ga4:ok","meta:ok"]}`.
7. **Recusa.** Em outra janela anônima, recuse os cookies:
   - o GTM Preview mostra as tags bloqueadas por consentimento;
   - nenhum cookie `_ga`/`_fbp` é gravado.
8. **Limpeza.** Tire `GA4_DEBUG` e `META_TEST_EVENT_CODE` do `app.env` e reinicie. O estorno da assinatura de teste é
   feito pelo dono no Dash Stone.

Os testes automáticos cobrem:

- `tests/unit/conversions.unit.spec.ts`: origem, hash, envio GA4/Meta com o fetch simulado, consentimento, ID do GTM e CSP;
- `tests/e2e/conversions-billing.spec.ts`: a 1ª cobrança paga envia uma vez, a renovação não;
- `tests/e2e/consentimento.ui.spec.ts`:
  - recusar não grava cookie de terceiro com o contêiner real carregado;
  - aceitar põe a escolha e o `sign_up` no dataLayer;
- `tests/e2e/csp.ui.spec.ts`: os domínios novos passam e os outros continuam bloqueados.
