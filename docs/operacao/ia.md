# Classificação por IA (Claude)

Montada em 21/10/2026 (item 8; o dono escolheu o Claude). **Pronta e desligada.** Enquanto estiver desligada, nada sai do servidor e a análise segue nas regras de palavras (`src/lib/analysis/classify.ts`).

## O que faz

- A cada rodada do motor (`src/lib/analysis/engine.ts`), as conversas que mudaram vão ao Claude (`src/lib/analysis/ai-classify.ts`). Ele devolve os mesmos 4 rótulos das regras: intenção, sentimento, urgência e confiança. A etapa sai da intenção, igual às regras.
- Vão as últimas 40 mensagens com texto (até 6.000 caracteres), marcadas CLIENTE/EMPRESA, **já mascaradas** (CPF, cartão). Junto vão o segmento e os termos do setor da aba Configurações › Análise.
- A saída é JSON validado (structured outputs com Zod). Se a resposta não vier, vier recusada ou der erro, a conversa fica nas regras de palavras naquela rodada.
- **Cache:** `AiClassification` guarda por conversa só os rótulos e um hash do texto. O Claude só é chamado de novo quando a conversa, o segmento, os termos ou o modelo mudam. O texto não fica guardado no cache.
- **Custo:** cada chamada entra no `AiUsage` e aparece em Admin › Produto ("Custo de IA").
- Correção manual continua vencendo sempre. A classificação grava `source = 'llm'` e o motivo "Claude (IA)". O relatório de qualidade diz qual método foi usado.

## Ligar e desligar

Em `/opt/atende-radar/shared/app.env`, depois reinicie o app:

| Variável | Efeito |
|---|---|
| `AI_CLASSIFIER=claude` | liga. Sem ela (ou com outro valor), fica desligado. |
| `ANTHROPIC_API_KEY` | chave da API (cópia no arquivo local de chaves do dono, `CLAUDE_SECRET_KEY`). Sem a chave, fica desligado. |
| `AI_MODEL` | modelo. Padrão `claude-opus-5-5`. |
| `AI_MAX_CALLS_PER_TICK` | máximo de chamadas por rodada do motor (padrão 20; 4 em paralelo). |
| `AI_DAILY_LIMIT_PER_ORG` | máximo de chamadas por empresa por dia (padrão 500, contado no `AiUsage`). |
| `AI_PRICE_BRL_PER_MTOK_IN` / `_OUT` | preço por milhão de tokens em R$, para o Admin › Produto mostrar o custo. |

Para desligar, apague `AI_CLASSIFIER` e reinicie. Nada mais muda; o cache fica para quando ligar de novo.

## Antes de ligar em produção

1. **Política de Privacidade:** hoje ela diz que o conteúdo das conversas não vai para serviços de IA de terceiros (`src/app/privacidade/page.tsx`, "Conversas analisadas"). Ligar exige uma versão nova: a Anthropic entra como suboperadora, recebendo o texto mascarado para classificar, e é preciso avisar os clientes.
2. **Textos que dizem "sem IA":** o aviso da aba Configurações › Análise (`settings-view.tsx`), a ajuda da nota (`src/content/ajuda.ts`), o tour e a narração (`src/lib/system-tour/content.ts` e `narration.ts`). A nota de 0 a 100 continua por regras; muda só a classificação.
3. **Modelo e custo:** ver a medição abaixo.

## Medição (21/10/2026, chave real, 5 conversas de teste)

Cada chamada usa cerca de 1.400 tokens de entrada e 40 de saída.

| Modelo | Acertos | Custo por chamada | 10 mil chamadas/mês |
|---|---|---|---|
| `claude-opus-5-5` (padrão) | 5 de 5 | ~US$ 0,0065 | ~US$ 65 |
| `claude-haiku-5-5` | 4 de 5 (leu "vou desistir" de quem queria fechar como cancelamento) | ~US$ 0,00016 | ~US$ 1,60 |

As regras de palavras erram esse mesmo caso. Uma chamada acontece quando a conversa muda e o motor a analisa, não por mensagem lida.
