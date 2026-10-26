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
| Meta, token da API de Conversões | `META_CAPI_TOKEN` (*secret* do GitHub) | cadastrado em 21/10/2026. Gerenciador de Eventos > conjunto do AtendeRadar > Configurações > API de Conversões > Gerar token |
| Meta, 2º pixel (o da agência de tráfego) | `META_PIXEL_ID_2` (`app.env`, pelo deploy) | `1080108481699281`. A API de Conversões manda a ele o mesmo evento, com o mesmo `event_id`. O pixel no navegador fica com a agência, no GTM |
| Meta, token do 2º pixel | `META_CAPI_TOKEN_2` (*secret* do GitHub) | **não será criado** (TRAFEGO ALC, 26/10/2026): os anúncios usam o pixel `1795760021571040`, e o `1080108481699281` fica só no navegador. Sem o token, o log mostra `meta2:sem-id` e o 1º pixel segue igual. O envio ao 2º pixel pode sair do código quando for conveniente |
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

É o modo **básico** do Consent Mode (conferido em produção em 23/10/2026, seção "Achados em produção"):

- o GTM carrega sempre, mas as tags do Google e da Meta só disparam depois do aceite;
- sem permissão, nada é enviado ao Google nem à Meta, e nenhum cookie é gravado, como promete a /privacidade.

O modo avançado manda, sem permissão, pings sem cookie para o Google modelar as conversões. Para ativá-lo é preciso
mudar o GTM e o texto da /privacidade, as duas coisas com o OK do dono. A proposta está em "Propostas que dependem do
dono".

**Taxa de aceite.** Cada clique no aviso soma 1 num contador do dia (`ConsentChoiceDaily`: `accept_all`, `reject_all`,
`custom`), por `POST /api/public/consent`, sem cookie, IP ou identificador. Admin › Medição mostra os totais e as
porcentagens do período. Não há número de antes de 23/10/2026: o contador começou nessa data.

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
| `sign_up` | conta criada no app (cadastro por e-mail); não vai para empresa interna | `event_id` = `sign_up.<id da empresa>`, `method` = `email` |
| `activation` | a empresa conectou o WhatsApp pela 1ª vez; vai uma vez por navegador, na 1ª tela do app nas 48 h seguintes (janela de deduplicação da Meta); não vai para empresa interna | `event_id` = `activation.<id da empresa>`, `method` = `whatsapp` |
| `begin_checkout` | abriu a tela de pagamento de um plano | `event_id`, `ecommerce.value`, `currency` BRL, `items` |
| `add_payment_info` | clicou em pagar (antes de enviar o cartão) | `event_id`, `ecommerce.payment_type` = `cartao`, `value`, `items` |
| `purchase` | assinatura ativa na tela de pagamento, uma vez por assinatura neste navegador | `event_id` = `purchase.<id da assinatura no Pagar.me>`, `ecommerce.transaction_id` (o mesmo id), `value`, `currency` BRL, `items` |
| `cta_click` | clique num botão das páginas `/para/<segmento>` | `cta_id` (`cadastro`, `planos` ou `contato`), `cta_position` (`topo`, `hero`, `preco`, `duvidas` ou `final`), `page_segment` |
| `faq_open` | abriu uma pergunta das Dúvidas numa página `/para/<segmento>` | `faq_question` (o texto da pergunta), `page_segment` |
| `video_play` | deu play no vídeo de 20 s de uma página `/para/<segmento>`; só o 1º play de cada visita | `video_title` = `demo-20s`, `page_segment` |
| `video_complete` | o vídeo chegou ao fim | `video_title` = `demo-20s`, `page_segment` |

`items`: `[{ item_id: <código do plano>, item_name, item_variant: monthly|annual, price, quantity: 1 }]`.

**Tráfego interno.** Quem entra no app numa empresa interna (Admin › Medição) ganha o cookie `ar_internal=1` no
domínio `.atenderadar.com.br`, por 1 ano; ele sai no próximo acesso de quem deixou de ser interno. Com o cookie, o
`<head>` empurra `{ traffic_type: 'internal', ar_internal: true }` antes do GTM, no site e no app.

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
- **Também fica de fora o `activation`**: a ativação do GA4 vem só do servidor. Marque `activation` como evento-chave
  no GA4 (Admin > Eventos) depois que ele aparecer.
- **`sign_up` pelo servidor.** O servidor pode mandar o `sign_up` ao GA4 também (`GA4_SERVER_SIGNUP=on` no
  `app.env`). Fica desligado enquanto a tag do GTM manda o `sign_up`: o GA4 não deduplica e contaria duas vezes. Para
  passar ao servidor: tirar `sign_up` da tag do GTM, publicar, e só então ligar a variável e reiniciar.
- **Tráfego interno.** Variável do dataLayer `traffic_type`, posta como parâmetro `traffic_type` na Tag do Google.
  No GA4, Admin > Filtros de dados > "Tráfego interno" em **Ativo**.

**Meta**

- Pixel base em todas as páginas.
- `CompleteRegistration` no evento `sign_up` e `Purchase` no evento `purchase`, os dois com `eventID` = variável do
  dataLayer `event_id`. O servidor manda os mesmos eventos pela API de Conversões com o mesmo `event_id`, e a Meta junta
  os dois.
- No `Purchase`: `value` = `ecommerce.value`, `currency` = `BRL`.
- `StartTrial` no evento `activation`, com `eventID` = `event_id`. O servidor manda o mesmo pela API de Conversões.
  É o evento padrão da Meta para "começou a usar o teste" e já serve para otimizar campanha, sem conversão
  personalizada. O cadastro já é o `CompleteRegistration`; a ativação é o passo seguinte.
- **2º pixel (`1080108481699281`).** O servidor manda `CompleteRegistration`, `StartTrial` e `Purchase` aos dois
  pixels, com o mesmo `event_id`. Um erro em um não impede o outro; a conversão volta para a fila e a Meta descarta
  a repetição pelo `event_id`. No navegador, o GTM versão 3 (publicada pela TRAFEGO ALC em 25/10/2026, com o OK do
  dono) faz o `fbq('init')` dos dois pixels na tag "Meta - Base", e as tags com `fbq('track')` valem para os dois.
  A CSP já libera o `connect.facebook.net`.
- **`StartTrial` no navegador desde a versão 4 do GTM (25/10/2026):** a tag "Meta - StartTrial" dispara no evento `activation`,
  com `eventID` = `{{DLV - event_id}}` e consentimento `ad_storage`/`ad_user_data`, para os dois pixels. Antes disso, a
  ativação ia só pelo servidor.
- `InitiateCheckout` no `begin_checkout` e `AddPaymentInfo` no `add_payment_info` são opcionais: o servidor não manda
  esses dois.
- Para não contar quem é da casa: acionador de exceção com `ar_internal` igual a `true` nas tags de conversão.

**Google Ads (PENDENTE, quando houver conta)**

- Vinculador de conversões em todas as páginas.
- Conversão de compra no evento `purchase`, com valor `ecommerce.value`, moeda BRL e ID da transação
  `ecommerce.transaction_id`.
- Conversão de ativação no evento `activation`, com ID da transação = `event_id` (o Google Ads deduplica por ele).
- Ou, sem tag: importação do CSV de Admin › Medição (seção "Google Ads offline" abaixo).

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
parâmetros por 90 dias no cookie próprio `ar_attr`, junto com a página de entrada e a hora, sem nome nem e-mail. O
cookie vale para `.atenderadar.com.br` (site e app). A regra é "último clique marcado": uma visita nova com campanha
troca a anterior, e uma visita sem campanha não apaga nada. O cookie é gravado mesmo sem aceite, porque não identifica
ninguém e é próprio; o que sai para Google e Meta continua dependendo do consentimento. Ao abrir o app, ele tira só
`modo` e `demo` do endereço: `utm_*`, `gclid` e `_gl` ficam para as tags que leem a URL.

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
| `sign_up` | conta criada | Meta (`CompleteRegistration`, mesmo `event_id` do navegador). GA4 (`sign_up`, `method` = `email`, campanha) só com `GA4_SERVER_SIGNUP=on` | GA4 com medição; Meta com anúncios |
| `activation` | 1ª conexão do WhatsApp da empresa (marco `first_connection`), uma vez: `activation.<id da empresa>` | GA4 (`activation`, `method` = `whatsapp`, campanha) e Meta (`StartTrial`, mesmo `event_id`, `em`/`external_id` em SHA-256, `fbp`/`fbc`) | o consentimento e os cookies são os do cadastro: a conexão chega pelo gateway, sem navegador |
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
| `meta2:ok` / `meta2:sem-id` | o mesmo para o 2º pixel; só aparece com `META_PIXEL_ID_2` |
| `ga4:sem-consentimento` / `meta:sem-consentimento` | a pessoa não aceitou |
| `ga4:sem-client-id` | aceitou, mas não havia `_ga` (GTM ainda sem a tag do GA4, ou bloqueador) |
| `ignorado:sandbox` | Pagar.me de teste |
| `ignorado:interna` | empresa interna ou simulada (a lista vale na hora do envio) |
| `ga4:pelo-navegador` | `sign_up` com `GA4_SERVER_SIGNUP` desligado: o GA4 recebe da tag do GTM |
| `nao-enviado:renovacao` | renovação, não é enviada |

Erro HTTP gera nova tentativa. O texto do erro nunca leva o token.

O GA4 recebe `campaign_source`, `campaign_medium`, `campaign`, `campaign_content` e `campaign_term` quando há UTM. O
Measurement Protocol não atribui por `gclid`; a ligação com o Google Ads vem da tag (vinculador) ou do CSV abaixo.

## Empresas internas (Admin › Medição)

Uma empresa é interna quando o `adminEmail` ou o e-mail de algum membro bate com um e-mail ou domínio da lista
(domínio vale também para subdomínios). A lista fica no banco (`PlatformSetting`, chave `marketing.internal`), nunca no
repositório, e só o operador da plataforma a edita. No log de auditoria vai só a contagem. Empresas simuladas são
sempre internas.

Empresa interna:

- não manda `sign_up` nem `activation` ao dataLayer;
- tem tudo da fila marcado `ignorado:interna`, inclusive o que já estava esperando;
- fica fora do funil e do CSV do Google Ads.

## Funil por campanha (Admin › Medição)

Só leitura, por dia (horário de Brasília) × `utm_source`/`utm_medium`/`utm_campaign` da campanha do cadastro da
empresa. Sem UTM, mas com `gclid`/`gbraid`/`wbraid`, conta como `google`/`cpc`; com `fbclid`, como `meta`/`cpc`. Sem
nada, `(direto)`. Colunas:

| Coluna | De onde vem |
|---|---|
| cadastros | marco `signup` |
| ativações | marco `first_connection` |
| testes vencidos sem contratar | `Subscription.trialEnd` no dia, já passado, sem nenhuma fatura paga da empresa |
| assinaturas pagas | marco `first_payment` |
| receita | faturas `paid` pela data do pagamento (valor bruto, sem estornos) |
| cancelamentos | auditoria `subscription.canceled` e `subscription.withdrawn` |

"Baixar funil (CSV)" baixa a mesma tabela.

## Achados em produção (23/10/2026)

Conferido com um navegador limpo (Chromium do Playwright, sem cookies) em https://atenderadar.com.br, com o contêiner
publicado GTM-P43TS3SF.

- **Antes da escolha:**
  - padrão `analytics_storage`, `ad_storage`, `ad_user_data` e `ad_personalization` = `denied`;
  - só o `gtm.js` carrega;
  - nenhum cookie do Google ou da Meta (só o `ar_attr`, nosso).
- **No contêiner**, a tag do Google (G-1KVLT8H1ZP) e o evento GA4 exigem o consentimento adicional
  `analytics_storage`, e o Vinculador de conversões exige `ad_storage` + `ad_user_data`. Por isso o modo é básico.
- **Aceitar na 1ª página não dispara nada nessa página.** O `consent update` e o evento `consent_update` chegam ao
  dataLayer, mas nenhuma tag do Google nem da Meta dispara. A medição só começa na página seguinte (`page_view` com
  `gcs=G111`).
  - Consequência: o GA4 não vê a página de entrada com utm/gclid. A sessão pode ficar sem a campanha, e o `_gcl_aw`
    só é gravado se a próxima página ainda tiver o `gclid` na URL.
  - A conversão pelo servidor (Meta CAPI, GA4 MP e CSV do Google Ads) não perde a campanha, porque ela fica no
    cookie `ar_attr`, nosso, e vai para a conta no cadastro.
  - Causa provável, a confirmar no Preview do GTM: as tags estão em "Uma vez por página" e a tentativa bloqueada no
    `gtm.js` já conta como disparo.
- **CSP e COEP bloqueiam medições do Google Ads**, já com o aceite:
  - `www.google.com/ccm/collect` falha por COEP (`ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep`): imagem de outro domínio sem `Cross-Origin-Resource-Policy`;
  - `ad.doubleclick.net/ccm/s/collect` é recusado pela CSP (`connect-src` e `img-src`).
- **Entre os domínios** está certo: um único `_ga` em `.atenderadar.com.br`. O app (app.atenderadar.com.br) lê o mesmo
  valor do site e o mesmo `ar_attr`. Não precisa de vinculador entre domínios (`_gl`).
- **No site há um erro no console:** `/api/auth/session` do app é recusado pela CSP do site. É o cliente de sessão
  tentando falar com o app, sem efeito na medição.

## Propostas que dependem do dono

Nada disto foi aplicado.

### 1. Disparo na página em que a pessoa aceita (GTM, sem mudar texto)

Nas tags "Google tag", "Vinculador de conversões" e "Meta Pixel - PageView":

1. Mude as opções de disparo de "Uma vez por página" para "**Uma vez por evento**".
2. Mantenha os acionadores "Inicialização - Todas as páginas" e o evento `consent_update`.

Quem volta com o aceite gravado não recebe `consent_update`, então não há disparo duplo. Teste no Preview e publique
só com o OK.

### 2. Modo avançado (GTM + texto da /privacidade)

Mudança no GTM:

- Tag do Google, eventos GA4 e Vinculador de conversões: "Não é necessário consentimento adicional". As tags do Google
  já respeitam o consentimento sozinhas.
- Meta continua exigindo `ad_storage`.

Texto proposto para /privacidade, seção 2 (Google e Meta), no lugar de "só com a sua permissão no aviso de cookies":

> Sem a sua permissão, o Google recebe apenas sinais sem cookie e sem identificador (a página visitada e se houve
> cadastro), usados de forma estatística para estimar resultados de anúncios; nada é gravado no seu navegador e a
> Meta não recebe nada. Com a permissão, [...]

E na seção 5: "sem permissão, elas não gravam cookies; o Google recebe só sinais sem cookie, como explicado na seção 2".

### 3. CSP e COEP mínimos para Google Ads (código, `src/lib/csp.ts` e `next.config.ts`)

- CSP, `connect-src` e `img-src`: acrescentar `https://ad.doubleclick.net` e `https://www.googleadservices.com`.
  - `https://*.g.doubleclick.net` e `https://www.google.com` já estão.
  - Para remarketing em quadro, `frame-src` com `https://td.doubleclick.net` já está.
- COEP: tirar o `Cross-Origin-Embedder-Policy: require-corp`.
  - Nada no sistema usa isolamento entre origens (`crossOriginIsolated`, `SharedArrayBuffer`). O cabeçalho entrou só
    para calar um alerta do ZAP.
  - A alternativa `credentialless` deixa as imagens do Google passarem, mas sem os cookies delas, o que piora o
    remarketing.
  - O COOP e o CORP continuam.

Depois do OK: um teste e2e garante que a CSP contém os novos domínios. Aí sim, Preview do GTM com uma tag de
conversão do Ads e uma de remarketing.

### 4. Conversões otimizadas do Google (texto da /privacidade)

Hoje só a Meta recebe e-mail e celular em hash. Para as conversões otimizadas do Google (e-mail em minúsculas, sem
espaços, e celular em E.164, em SHA-256), a seção 2 passaria a dizer:

> Na contratação e no cadastro, o Google e a Meta recebem também o e-mail e o celular transformados em código (hash
> SHA-256, que não permite ler o dado), para saber se vieram de um anúncio.

### 5. Termos: risco da conexão por QR Code

Item novo na seção 7 dos Termos, logo depois do primeiro:

> A conexão por QR Code funciona como o WhatsApp Web e não é uma integração oficial da Meta. O WhatsApp pode
> restringir ou bloquear números por uso fora das regras dele (por exemplo, envio em massa ou mensagens não
> solicitadas). O AtendeRadar só lê as conversas e não envia mensagens em nome da empresa, mas não controla nem
> responde por decisões do WhatsApp sobre o número conectado.

Conferido no código em 23/10: `src/` não tem nenhum envio de mensagem pelo WhatsApp conectado (nenhum `sendMessage`).
O sistema só lê.

## Google Ads offline (CSV)

"Conversões do Google Ads (CSV)" em Admin › Medição baixa uma linha por ativação e por compra com `gclid` no período
(pela hora da conversão), sem internas, simuladas e sandbox. Formato da importação por arquivo:

```
Parameters:TimeZone=America/Sao_Paulo
Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency
TESTE123,AtendeRadar - Ativacao,2026-10-23 14:30:05,,BRL
TESTE123,AtendeRadar - Assinatura,2026-10-23 15:00:00,299.00,BRL
```

- Os nomes das conversões são editados em Admin › Medição e precisam ser **iguais** aos das ações de conversão no
  Google Ads (tipo "Importar > Cliques"). Padrão: `AtendeRadar - Ativacao` e `AtendeRadar - Assinatura`.
- Ativação vai sem valor (vale o valor padrão da ação). A compra vai com o valor da 1ª cobrança.
- `gbraid` e `wbraid` (iOS) ficam guardados, mas não entram no CSV: a importação por arquivo só aceita o `gclid`.
- Espere de 4 a 6 horas depois de criar a ação de conversão antes de importar. Clique com mais de 90 dias é recusado.
- O Google trata a importação por arquivo como legado e recomenda o Data Manager ou a API. O próximo passo é o envio
  automático pela API do Google Ads (`ConversionUploadService`), com `gbraid`/`wbraid` e conversões otimizadas
  (`user_identifiers` com e-mail e telefone em SHA-256, normalizados como o Google pede: minúsculas, sem espaços, sem
  pontos antes do `@` em gmail.com, telefone em E.164 com `+`). Precisa do token de desenvolvedor e do OAuth da conta.
  Não foi feito.

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
- `tests/e2e/csp.ui.spec.ts`: os domínios novos passam e os outros continuam bloqueados;
- `tests/e2e/marketing.spec.ts`: ativação uma vez na 1ª conexão, empresas internas fora, só o operador vê a medição, o
  funil por campanha, o CSV do Google Ads e o contador do aviso de cookies;
- `tests/e2e/admin-medicao.ui.spec.ts`: Admin › Medição na tela, com os dois CSVs baixados.

## Páginas de anúncio por segmento

`https://atenderadar.com.br/para/<segmento>`, com `clinicas`, `servicos`, `imobiliarias`, `escolas` e `agencias`
(texto em `src/lib/segments.ts`; as conversas são exemplos inventados).

- Fora do Google (`noindex, nofollow`) e fora do `sitemap.xml`.
- Sem menu: os únicos links são os botões de cadastro e o rodapé legal (Privacidade e Termos em nova aba, preferências
  de cookies).
- Os botões abrem `app.atenderadar.com.br/?modo=cadastro` com `utm_*`, `gclid`, `gbraid`, `wbraid`, `fbclid` e `_gl`
  da visita. A campanha também fica no cookie `ar_attr`, que vale para os dois domínios.
- Renderizadas no servidor e sem animação de entrada (para o LCP). O único JavaScript da página são os eventos
  `cta_click`, `faq_open`, `video_play` e `video_complete` (`src/app/para/[segmento]/medicao.tsx`, tabela acima).
- Seções: dores do segmento, como funciona, vídeo de 20 s (`public/para/video-demo.mp4`, 540×960, sem áudio,
  `preload="none"`; é o `video-01` dos criativos), preço depois do teste (o plano pago mais barato, lido do banco),
  "Meu número pode ser bloqueado?" e "Quem vê as conversas?" (texto do FAQ da home e da Política de Privacidade;
  clínicas tem a linha de dado de saúde da LGPD, campo `privacidade` do segmento), Dúvidas (o resto do FAQ) e
  "Fale com a gente" (e-mail de contato, com o segmento no assunto).
- Segmento que não existe dá 404.
- Teste: `tests/e2e/segmentos.ui.spec.ts`.

## Verificação do domínio na Meta

Em Gerenciador de Negócios > Segurança da marca > Domínios > "Meta tag", copie só o código do `content` para
`META_DOMAIN_VERIFICATION` no `app.env` e reinicie o app. A tag `facebook-domain-verification` sai em todas as páginas.
Sem a variável, não sai nada.
