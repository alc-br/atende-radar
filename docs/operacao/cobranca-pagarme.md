# Cobrança com Pagar.me (checkout transparente)

## Como funciona

- **Checkout transparente:** a pessoa contrata pela tela **Planos → Assinar** sem sair do sistema. O navegador troca o cartão por um token direto no Pagar.me (`POST /core/v5/tokens` com a chave **pública**). Só o token chega ao nosso servidor; número e CVV nunca passam por ele.
- **Cobrança automática:** o servidor cria um cliente e uma **assinatura** no Pagar.me (cartão de crédito, pré-paga, mensal ou anual). O Pagar.me cobra o cartão a cada ciclo.
- **Ativação:** o plano só muda quando a 1ª fatura é paga. Com cartão recusado, a assinatura no Pagar.me é cancelada na hora e a empresa fica como estava.
- **Troca de plano:** abre uma assinatura nova, cobrada integralmente na hora. Quando ela é paga, a anterior é cancelada no Pagar.me. Não há desconto proporcional pelo período restante.
- **Cancelamento:** **Planos → Cancelar renovação** para as cobranças na hora. O plano vale até o fim do período pago. Depois disso, o cadastro de novos itens é bloqueado até a pessoa contratar de novo.
- **Reativar a renovação:** depois de cancelar e antes do fim do período pago, **Planos → Reativar renovação**. Nada é cobrado na hora. Detalhes em [Reativação da renovação](#reativação-da-renovação).
- **Troca de cartão:** **Planos → Trocar cartão**. O novo token substitui o cartão na assinatura.
- **Cobrança recusada na renovação:** o status vira `past_due` e aparece o aviso “Pagamento pendente” com o motivo. O admin recebe uma notificação. Depois da troca de cartão, as próximas tentativas de cobrança usam o cartão novo.
- **Sincronização:**
  - Webhook (instantâneo).
  - Leitura ao abrir **Planos** (se a última tiver mais de 2 min).
  - Varredura a cada 15 min. O sistema funciona mesmo se o webhook falhar.
- **Só quem é admin** contrata, troca o cartão, cancela ou reativa (`billing.manage`). Toda ação fica no registro de auditoria.

## Reativação da renovação

No Pagar.me (API v5), cancelar uma assinatura (`DELETE /subscriptions/{id}`) é definitivo: não existe rota para reativar. Por isso o sistema cria uma **assinatura de continuação**:

- **Mesmo cliente e mesmo cartão:** usa o `card_id` da assinatura cancelada. O cartão continua salvo e ativo na carteira do cliente depois do cancelamento (conferido no sandbox). Se o cartão não estiver mais ativo, a resposta é 409 `card_unavailable` e a pessoa contrata de novo.
- **Mesmo valor e ciclo:** o preço vem do item da assinatura anterior, não do catálogo. Preço novo em Admin › Planos não afeta quem reativa.
- **Começa no fim do período pago:** `start_at` é o dia seguinte ao fim do período, à meia-noite UTC (o Pagar.me guarda só a data). A continuação nasce com status `future`, sem fatura. O período já pago nunca é cobrado de novo; a 1ª cobrança cai no mesmo dia em que a assinatura original renovaria.
- **Metadados:** `reactivatedFrom` aponta a assinatura anterior. Com ele, a sincronização mantém a empresa `active` até a 1ª fatura da continuação (sem fatura paga, uma assinatura comum ficaria pendente). Se essa 1ª cobrança for recusada, vale o fluxo normal de pagamento pendente.
- **Quando não dá:** sem cobrança automática (teste grátis, modo diferente) → 409 `no_recurring`; renovação não cancelada → 409 `not_canceled`; troca de plano aguardando pagamento → 409 `change_pending`; período pago já acabou (ou falta menos de 1 h) → 409 `period_over`, e a pessoa contrata de novo. Falha no Pagar.me → 502, e nada muda no nosso banco.
- **Registro:** auditoria `subscription.reactivated` (assinatura anterior, data e valor da próxima cobrança) e notificação “Renovação automática reativada” com valor, data e final do cartão.
- **Cancelar de novo** cancela a continuação no Pagar.me, como qualquer assinatura.
- **Não testado de ponta a ponta:** a cobrança de fato na data de `start_at`. O sandbox não adianta o relógio; a sincronização trata essa 1ª fatura como uma renovação comum.

## Catálogo de planos (Admin › Planos)

- **Quem edita:** só o operador da plataforma (`PLATFORM_ADMIN_EMAILS`). Para os outros, a rota responde 403.
- **O que edita:** nome, descrição, destaques exibidos (o campo `features`, que hoje é só vitrine), selo “Mais escolhido”, preço mensal e anual, e se o plano está à venda.
- **O que não edita:** limites (cotas) e código. Os limites valem para quem já assina.
- **Preço:** vale só para novas contratações e trocas de plano. Quem já assina continua pagando o valor gravado na própria assinatura do Pagar.me, inclusive ao reativar a renovação. A tela Planos do cliente mostra o valor da fatura, não o do catálogo. O KPI de receita do Admin ainda usa o preço do catálogo (estimativa).
- **Fora de venda:** o plano some da página de vendas e de Planos, e o checkout recusa com 404 `plan_not_found`. Quem já tem o plano continua com ele. O sistema não deixa desativar o último plano à venda (409 `last_active_plan`), porque o cadastro novo entra no plano ativo mais barato.
- **Auditoria:** `plan.updated`, com o de/para de cada campo, no registro da empresa do operador.
- **Deploy:** o passo `scripts/sync-plan-catalog.ts` leva para o banco o nome e a descrição do código (`src/lib/seed-data.ts`), mas só troca um campo que ainda tem um valor antigo do código (`PREVIOUS_CATALOG` em `src/lib/plan-catalog.ts`). O que foi editado no Admin nunca é sobrescrito. Ao mudar nome ou descrição no código, acrescente o valor que sai em `PREVIOUS_CATALOG`.

## Variáveis (`/opt/atende-radar/shared/app.env`, gravadas pelo deploy a partir dos *secrets* do GitHub)

| Variável | Uso |
|---|---|
| `PAGARME_MODE` | `test` (sandbox, padrão) ou `live` (cobrança real) |
| `PAGARME_PUBLIC_KEY_TEST` / `PAGARME_SECRET_KEY_TEST` | chaves do sandbox |
| `PAGARME_PUBLIC_KEY` / `PAGARME_SECRET_KEY` | chaves de produção (usadas com `PAGARME_MODE=live`) |
| `PAGARME_WEBHOOK_USER` / `PAGARME_WEBHOOK_PASS` | usuário e senha (Basic Auth) que o Pagar.me usa ao chamar o webhook |
| `CHECKOUT_ATTEMPTS_PER_HOUR` | tentativas de pagamento por empresa por hora (padrão 8, contra teste de cartões) |

- **Trocar uma chave:** atualize o *secret* no GitHub (`gh secret set NOME`) e faça um deploy. O passo “Variáveis do app” substitui o valor no servidor.
- **`PAGARME_MODE`:** fica só no servidor. O deploy grava `test` se a variável faltar e nunca a sobrescreve.

## Webhook (configurar no painel do Pagar.me)

- **URL:** `https://app.atenderadar.com.br/api/billing/webhook`
- **Autenticação:** Basic, com `PAGARME_WEBHOOK_USER` e `PAGARME_WEBHOOK_PASS`.
- **Eventos:** `subscription.*`, `invoice.*` e `charge.*` (ou todos).

Os webhooks estão cadastrados só na conta **real**. A conta de **teste** não tem nenhuma entrega (conferido em 16/10/2026 com `GET /core/v5/hooks`): em `PAGARME_MODE=test` a sincronização vem da leitura ao abrir Planos e da varredura. A Dash Stone não tem webhook para o ambiente de teste (um cadastro só, sem seletor), então em teste os avisos nunca chegam; a rota é testada no CI chamando-a com assinaturas reais do sandbox.

Manual genérico para os outros sistemas da ALC: [`docs/manual-stone.md`](../manual-stone.md).

O conteúdo do evento não é confiado: o sistema extrai só o id da assinatura e relê o estado direto da API. Eventos de outros sistemas da mesma conta (sem `metadata.app = atende-radar`) recebem `200 ignored`. Eventos repetidos são detectados e registrados uma só vez.

## Chaves (painel Stone)

O Pagar.me agora fica no painel da Stone: **conta.stone.com.br → Chaves de autenticação** (chaves do tipo “Nova integração”). A API continua a mesma (`api.pagar.me/core/v5`), então nada muda no código nem na CSP. Em 13/10/2026 foram criadas chaves novas de produção e de teste; as quatro foram conferidas direto na API (secretas respondem 200, públicas geram token) e gravadas nos secrets do GitHub.

## Passar para cobrança real

1. No painel da Stone, confirme que a conta de produção está ativa e copie as chaves de **produção**: `pk_…` e `sk_…`, sem `_test`.
2. Atualize os secrets `PAGARME_PUBLIC_KEY` e `PAGARME_SECRET_KEY` e faça um deploy.
3. No servidor, troque `PAGARME_MODE=test` por `PAGARME_MODE=live` em `app.env` e reinicie o serviço.
4. Cadastre o webhook também no painel **live**.
5. Faça uma contratação real de valor baixo e cancele em seguida.

As assinaturas feitas no sandbox não valem no modo live: o sistema passa a tratá-las como sem cobrança automática, e a empresa contrata de novo.

## Limites do plano, troca de plano e teste grátis

- **Exportações por mês (`maxExports`):** contam as exportações de indicadores (CSV/JSON) e o CSV de um relatório do histórico. Abrir o relatório em HTML não conta. O mês é o calendário, e a contagem recomeça no dia 1º. Acima do limite, a resposta é 402 `quota_exceeded`. A contagem vem do registro de auditoria (`report.exported`), e a limpeza de retenção guarda as exportações do mês corrente.
- **Rebaixar acima dos limites:** se a empresa tiver mais conexões, atendentes ativos ou regras de alerta próprias do que o plano novo permite, o checkout e o "Solicitar troca" respondem 409 `plan_limits_exceeded` com a lista do excedente. Essa checagem vem antes de qualquer cobrança.
- **Operador da plataforma (Admin → Organizações → empresa → Assinatura):** escolhe o plano, a situação e o "válido até" (no teste grátis, essa data é o fim do teste), e grava depois de confirmar. Ele pode rebaixar mesmo com excedente, mas recebe um aviso, e a empresa fica sem novos cadastros até reduzir o uso. Mudar aqui não altera uma cobrança automática já ativa no Pagar.me.
- **Avisos de fim do teste:** uma notificação quando faltam 3 dias ou menos e outra quando falta 1 dia ou menos. Cada uma sai uma vez por data de fim, e estender o teste gera avisos novos. O agendador interno roda a cada 15 min, e os testes usam `POST /api/gateway/tick` com `{ trialNoticesAt }`. A faixa do topo também muda de tom nos 3 últimos dias.

## Sandbox (testes)

- **Aprovado:** cartão `4000 0000 0000 0010`, validade futura, CVV `123`.
- **Recusado:** cartão `4000 0000 0000 0028` (na integração nova da Stone, o CVV `6xx` passou a ser aprovado).
- **Testes automáticos:** `tests/e2e/billing-pagarme.spec.ts` (API) e `tests/e2e/billing-checkout.ui.spec.ts` (tela, desktop e celular) rodam contra o sandbox real. Sem as chaves de teste no ambiente, são pulados.
- **Boleto:** não está habilitado na conta, então só cartão de crédito é oferecido.
