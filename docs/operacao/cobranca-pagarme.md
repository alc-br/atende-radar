# Cobrança com Pagar.me (checkout transparente)

## Como funciona

- **Checkout transparente:** a pessoa contrata pela tela **Planos → Assinar** sem sair do sistema. O navegador troca o cartão por um token direto no Pagar.me (`POST /core/v5/tokens` com a chave **pública**). Só o token chega ao nosso servidor; número e CVV nunca passam por ele.
- **Cobrança automática:** o servidor cria um cliente e uma **assinatura** no Pagar.me (cartão de crédito, pré-paga, mensal ou anual). O Pagar.me cobra o cartão a cada ciclo.
- **Ativação:** o plano só muda quando a 1ª fatura é paga. Com cartão recusado, a assinatura no Pagar.me é cancelada na hora e a empresa fica como estava.
- **Troca de plano:** abre uma assinatura nova, cobrada integralmente na hora. Quando ela é paga, a anterior é cancelada no Pagar.me. Não há desconto proporcional pelo período restante.
- **Cancelamento:** **Planos → Cancelar renovação** para as cobranças na hora. O plano vale até o fim do período pago. Depois disso, o cadastro de novos itens é bloqueado até a pessoa contratar de novo.
- **Troca de cartão:** **Planos → Trocar cartão**. O novo token substitui o cartão na assinatura.
- **Cobrança recusada na renovação:** o status vira `past_due` e aparece o aviso “Pagamento pendente” com o motivo. O admin recebe uma notificação. Depois da troca de cartão, as próximas tentativas de cobrança usam o cartão novo.
- **Sincronização:**
  - Webhook (instantâneo).
  - Leitura ao abrir **Planos** (se a última tiver mais de 2 min).
  - Varredura a cada 15 min. O sistema funciona mesmo se o webhook falhar.
- **Só quem é admin** contrata, troca o cartão ou cancela (`billing.manage`). Toda ação fica no registro de auditoria.

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
- **Recusado:** CVV começando com `6`.
- **Testes automáticos:** `tests/e2e/billing-pagarme.spec.ts` (API) e `tests/e2e/billing-checkout.ui.spec.ts` (tela, desktop e celular) rodam contra o sandbox real. Sem as chaves de teste no ambiente, são pulados.
- **Boleto:** não está habilitado na conta, então só cartão de crédito é oferecido.
