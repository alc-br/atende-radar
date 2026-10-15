# Motor de análise: venda/perda automática e correção humana (B6)

Código: `src/lib/analysis/outcome.ts` (regras), `src/lib/analysis/engine.ts` (aplicação), `src/lib/analysis/alert-groups.ts`
(agrupamento de alertas, ver [alertas por e-mail](alertas-por-email.md) e [webhook](../webhooks.md)).

## Venda e perda pelas mensagens

Além do abandono (cliente some depois da resposta), o motor fecha a conversa quando as mensagens deixam o resultado claro.

| Resultado | Sinais (exemplos) |
|---|---|
| Venda (`won`, etiqueta `venda-detectada`) | Cliente: "paguei", "fiz o pix", "segue o comprovante". Empresa: "recebemos o pagamento", "pedido confirmado", "consulta confirmada para quinta". Cliente responde "pode confirmar" / "confirmado" logo depois de a empresa oferecer o horário ou o pedido. |
| Perda (`lost`, etiqueta `perda-declarada`) | "comprei em outro lugar", "fechei com outra clínica", "desisti", "perdi o interesse", "não vou mais precisar". |

Precisão vem antes de cobertura. **Não** decide:

- pergunta ("posso pagar no pix?"), negação ("ainda não paguei"), condição ("se eu fechar com outra"), futuro ("vou fazer o pix");
- compra antiga ("da última vez paguei 200"), remarcação ("desisti do horário de terça");
- sinal de venda **e** de perda na mesma conversa, ou cliente que desistiu e depois voltou a querer ("na verdade quero sim").

Só vale em conversa aberta, com oportunidade de venda ainda em aberto e sem resultado marcado por uma pessoa.

Efeito: a conversa fecha com o resultado, a oportunidade vira ganha/perdida e os itens abertos da Recuperação fecham como
"recuperado" ou "perdido", com o motivo terminando em "(automático)". Perda declarada não cria item de "abandono".

## Correção humana vence a reanálise

| Correção | O que o motor faz na reanálise |
|---|---|
| Intenção, urgência, sentimento ou etapa (detalhe da conversa ou classificação) | Mantém o valor corrigido. A classificação fica `corrected` e não é reescrita. |
| Intenção corrigida para algo que não é venda (ex.: suporte) | Apaga a oportunidade **em aberto** da conversa: sai do valor em risco, das oportunidades e da fila. Venda/perda já decididas ficam. |
| Resultado (ganha/perdida) marcado na conversa | Fica registrado como correção (`ClassificationFeedback`, tipo `outcome`). O motor não muda mais o resultado: nem venda/perda automática, nem abandono. Mensagem nova do cliente abre **outra** conversa, em vez de reabrir esta. |

A correção não exige mais o valor anterior (corrigir uma intenção ou atendente vazio dava erro 400).

Conversa perdida por **abandono** (decisão do motor por silêncio) continua reabrindo dentro da "Janela de reabertura" e a
oportunidade volta a valer. Conversa ganha ou perdida por qualquer outro motivo não reabre.
