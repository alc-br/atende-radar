# Alertas por e-mail

Código: `src/lib/alert-email.ts` (fila e envio) e `src/lib/mailer.ts` (EmailOutbox e novas tentativas).

## Quem recebe

Quando uma regra com o canal **e-mail** abre um alerta, recebe cada membro da empresa que cumpre todas estas condições:

- está ativo (convite pendente não recebe);
- tem "Alertas por e-mail" ligado (Meu perfil; ligado por padrão);
- o papel dele vê alertas;
- o alerta está no escopo dele. O atendente vê só as conversas dele. O supervisor com equipe vê a equipe dele e as conversas sem atendente.

O campo `AlertRule.recipients` **não** é usado. A lista "Destinatários" de Configurações › Notificações também não.

A empresa de demonstração nunca manda e-mail.

## O que vai no e-mail

O e-mail leva a regra, a gravidade, o horário (no fuso da empresa), o link do painel (`/#alerts`) e o link "parar de receber". **Não** leva o texto da mensagem, o nome do cliente nem o telefone.

## Antispam (padrões)

| O quê | Padrão | Onde muda |
|---|---|---|
| Intervalo por pessoa e regra | 15 min (mín. 5, máx. 1440). O que chega no meio-tempo vai num resumo único ("N alertas: regra"). | Configurações › Notificações › Resumo de alertas. Desligado = 1 e-mail por alerta. |
| Horário de silêncio | Em branco = fora do horário de atendimento da empresa. Início igual ao fim = sem silêncio. | Configurações › Notificações › Horários de Silêncio. Vale para a empresa toda (não existe silêncio por pessoa). |
| Crítico no silêncio | Passa. | "Alertas imediatos" desligado faz o crítico também esperar. |
| Pendente velho | Descartado após 72 h. Se o alerta foi resolvido ou dispensado antes do envio, também é descartado. | — |

O envio roda a cada minuto (agendador interno) e em `POST /api/gateway/tick`.

## Novas tentativas

Sem `MAIL_PROVIDER=resend`, o e-mail fica `queued` e não é tentado de novo. Com o provedor, uma falha marca o e-mail como `failed` e ele é tentado de novo depois de 5 min, 30 min e 2 h. São 4 envios no máximo.

Na última falha, o campo `error` termina com "desistiu após 4 tentativas" e `nextAttemptAt` fica nulo. Se o e-mail era de alerta, a empresa recebe no sino o aviso "Alerta por e-mail não foi entregue".

E-mail com anexo (relatório) não é tentado de novo sozinho, porque o anexo não fica guardado. Para ele existe o "Tentar novamente" do histórico de relatórios.

## Parar de receber

O link do e-mail é `/descadastrar?token=...` e pede confirmação num botão. O cabeçalho `List-Unsubscribe` aponta para `POST /api/public/unsubscribe?token=...` e aceita o clique único do Gmail e do Outlook (RFC 8058).

O token é um HMAC do id do membro com `NEXTAUTH_SECRET`. Se esse segredo trocar, os links antigos deixam de valer. O desligamento fica no registro de auditoria (`account.alert_emails_changed`).

## Depois do deploy

As regras padrão de toda empresa já vêm com o canal e-mail. Por isso, com `MAIL_PROVIDER=resend`, os alertas passam a sair por e-mail assim que este código entrar.
