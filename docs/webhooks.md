# Webhook de alertas (AtendeRadar → seu sistema)

Configure em **Configurações › Webhook** (administrador ou gestor). O AtendeRadar envia um `POST` em JSON para a sua URL
quando um alerta é criado ou resolvido.

## Eventos

| Evento | Quando |
|---|---|
| `alert.created` | um alerta foi aberto |
| `alert.resolved` | um alerta foi resolvido (pelo sistema ou por alguém da equipe) |
| `webhook.test` | botão "Enviar teste" |

## Corpo

```json
{
  "event": "alert.created",
  "occurredAt": "2026-10-13T14:05:00.000Z",
  "organizationId": "cm…",
  "data": {
    "alertId": "cm…",
    "ruleName": "Cliente sem primeira resposta",
    "severity": "critical",
    "status": "new",
    "conversationId": "cm…",
    "potentialValue": 1500,
    "confidence": 0.8,
    "createdAt": "2026-10-13T14:05:00.000Z",
    "resolvedAt": null
  }
}
```

O corpo traz só os dados do alerta. O texto das mensagens, os telefones e o nome do cliente nunca são enviados.

## Cabeçalhos

| Cabeçalho | Conteúdo |
|---|---|
| `X-AtendeRadar-Signature` | `sha256=<hex>`: HMAC-SHA256 do **corpo cru**, calculado com o segredo do webhook |
| `X-AtendeRadar-Timestamp` | momento do envio (segundos Unix) |
| `X-AtendeRadar-Event` | o mesmo `event` do corpo |
| `X-AtendeRadar-Delivery` | id da entrega (UUID). Se houver nova tentativa, o id é o mesmo: use-o para não processar a mesma entrega duas vezes |

O segredo (`whsec_…`) aparece **uma vez só**, quando você cria o webhook ou gera um segredo novo. Ao gerar um segredo
novo, o anterior deixa de valer na hora.

## Como validar a assinatura (Node.js)

Calcule o HMAC sobre os **bytes recebidos**, antes de qualquer `JSON.parse`. Se o JSON for reformatado, a assinatura
deixa de bater.

```js
import express from 'express'
import { createHmac, timingSafeEqual } from 'node:crypto'

const SECRET = process.env.ATENDERADAR_WEBHOOK_SECRET // whsec_...
const app = express()

app.post('/webhooks/atenderadar', express.raw({ type: 'application/json' }), (req, res) => {
  const expected = 'sha256=' + createHmac('sha256', SECRET).update(req.body).digest('hex')
  const received = req.get('X-AtendeRadar-Signature') || ''
  const ok = received.length === expected.length && timingSafeEqual(Buffer.from(received), Buffer.from(expected))
  if (!ok) return res.status(401).end()

  // opcional: recuse envios antigos (aqui, mais de 5 minutos)
  const ts = Number(req.get('X-AtendeRadar-Timestamp'))
  if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) return res.status(400).end()

  const event = JSON.parse(req.body.toString('utf8'))
  // ... processe event.event / event.data (idempotente por X-AtendeRadar-Delivery)
  res.status(200).end()
})
```

## Entrega e novas tentativas

- A entrega conta como feita quando sua URL responde **2xx** em até **5 segundos**. Redirecionamentos (3xx) não são seguidos e contam como falha.
- Se falhar, há nova tentativa depois de cerca de 1 minuto e de novo depois de 5 minutos (3 tentativas no total). Depois disso, a entrega é abandonada.
- A tela mostra o resultado da última tentativa e as últimas entregas (sem o corpo).
- A URL precisa usar `https://` e ser acessível pela internet. Endereços internos (`localhost`, redes privadas, link-local) são recusados, e o endereço é conferido de novo a cada envio.
