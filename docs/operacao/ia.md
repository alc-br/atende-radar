# Classificação por IA (Claude)

Montada em 21/10/2026 (item 8; o dono escolheu o Claude). **Ligada em produção desde 21/10/2026 com o Haiku 5.5**, junto com a nova Política de Privacidade, que cita a Anthropic como suboperadora. Desligada, nada sai do servidor e a análise segue nas regras de palavras (`src/lib/analysis/classify.ts`).

## O que faz

- A cada rodada do motor (`src/lib/analysis/engine.ts`), as conversas que mudaram vão ao Claude (`src/lib/analysis/ai-classify.ts`). Ele devolve os mesmos 4 rótulos das regras: intenção, sentimento, urgência e confiança. A etapa sai da intenção, igual às regras.
- Vão as últimas 40 mensagens com texto (até 6.000 caracteres), marcadas CLIENTE/EMPRESA, **já mascaradas** (CPF, cartão). Junto vão o segmento e os termos do setor da aba Configurações › Análise.
- A saída é JSON validado (structured outputs com Zod). Se a resposta não vier, vier recusada ou der erro, a conversa fica nas regras de palavras naquela rodada.
- **Cache:** `AiClassification` guarda por conversa só os rótulos e um hash do texto. O Claude só é chamado de novo quando a conversa, o segmento, os termos ou o modelo mudam. O texto não fica guardado no cache.
- **Custo:** cada chamada entra no `AiUsage` e aparece em Admin › Produto ("Custo de IA").
- Correção manual continua vencendo sempre. A classificação grava `source = 'llm'` e o motivo "Claude (IA)". O relatório de qualidade diz qual método foi usado.

## Situações novas (22/10/2026)

Como o sistema aprende situações que os alertas ainda não cobrem, com uma pessoa decidindo:

1. **Sinal:** junto com os rótulos, o Claude devolve `novidade`: quase sempre `null`; quando a conversa mostra algo importante que nenhum alerta cobre (risco de perder o cliente, prejuízo, problema legal, de saúde ou de segurança), uma frase curta e genérica, sem nome, contato, documento, valor ou data. O servidor ainda limpa e-mail, número longo, CPF e cartão (`src/lib/analysis/novelty-signal.ts`) e guarda uma frase por conversa em `NovelSignal`.
2. **Agrupamento** (`src/lib/analysis/novelty.ts`): no laço de limpeza (a cada 15 min), quando a frase mais antiga sem tema faz 7 dias ou juntam 200, uma chamada ao Claude junta as frases parecidas em temas (`NovelCluster`), reaproveitando os temas que já existem (até 120). Até 400 frases por rodada. O uso entra no `AiUsage` com a empresa `plataforma` (Admin › Produto mostra "Plataforma (situações novas)"). Se falhar, tenta de novo depois de 6 h.
3. **Decisão:** Admin › Situações novas lista os temas (a decidir primeiro), com contagem de conversas, número de empresas (nunca quais) e até 5 frases de exemplo. O operador marca "Vale mapear" ou "Descartar". "Agrupar agora" roda sem esperar a semana.
4. **Nada é automático:** um tema marcado "Vale mapear" vira assunto ou alerta no código, por decisão de quem desenvolve. Tema descartado continua recebendo a contagem, mas fica no fim da lista.
5. **Retenção:** a frase fica 30 dias (`purgeProductEvents`, `src/lib/privacy.ts`); o tema fica. A Política de Privacidade (versão 2026-10-22) descreve isso.

## Ligar e desligar

Em `/opt/atende-radar/shared/app.env`, depois reinicie o app:

| Variável | Efeito |
|---|---|
| `AI_CLASSIFIER=claude` | liga. Sem ela (ou com outro valor), fica desligado. |
| `ANTHROPIC_API_KEY` | chave da API (cópia no arquivo local de chaves do dono, `CLAUDE_SECRET_KEY`). Sem a chave, fica desligado. |
| `AI_MODEL` | modelo. Padrão `claude-haiku-5-5` (escolha do dono). `claude-opus-5-5` acerta mais, mas custa cerca de 40 vezes mais. |
| `AI_MAX_CALLS_PER_TICK` | máximo de chamadas por rodada do motor (padrão 20; 4 em paralelo). |
| `AI_DAILY_LIMIT_PER_ORG` | máximo de chamadas por empresa por dia (padrão 500, contado no `AiUsage`). |
| `AI_PRICE_BRL_PER_MTOK_IN` / `_OUT` | preço por milhão de tokens em R$, para o Admin › Produto mostrar o custo. Produção: 0,55 / 2,75 (Haiku 5.5 a US$ 0,10 / 0,50, dólar a R$ 5,50; estimativa). |

Para desligar, apague `AI_CLASSIFIER` e reinicie. Nada mais muda; o cache fica para quando ligar de novo.

## O que foi feito para ligar (21/10/2026)

1. **Política de Privacidade** (`src/app/privacidade/page.tsx`): "Conversas analisadas" diz que o texto vai ao Claude; a seção 4 lista a Anthropic (o que recebe e o que não recebe) e o Google Drive (backup cifrado), com a transferência internacional (LGPD art. 33).
2. **Textos que diziam "sem IA":** o aviso da aba Configurações › Análise, a ajuda da nota, o tour e a narração. A nota de 0 a 100 continua por regras; só o tom (Qualidade) vem da classificação.
3. **Modelo:** Haiku 5.5 (medição abaixo).

Se desligar a IA, volte esses textos e a política, porque eles descrevem a IA ligada.

## Medição (21/10/2026, chave real, 5 conversas de teste)

Cada chamada usa cerca de 1.400 tokens de entrada e 40 de saída.

| Modelo | Acertos | Custo por chamada | 10 mil chamadas/mês |
|---|---|---|---|
| `claude-opus-5-5` | 5 de 5 | ~US$ 0,0065 | ~US$ 65 |
| `claude-haiku-5-5` (padrão) | 4 de 5 (leu "vou desistir" de quem queria fechar como cancelamento) | ~US$ 0,00016 | ~US$ 1,60 |

As regras de palavras erram esse mesmo caso. Uma chamada acontece quando a conversa muda e o motor a analisa, não por mensagem lida.
