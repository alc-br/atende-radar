# Máscara de dados sensíveis nas conversas (LGPD · Trello B9/T17)

Nota técnica. Não altera o texto das páginas de privacidade/termos (isso depende da revisão jurídica).

## O que é mascarado

Função pura `maskSensitive(text)` em `src/lib/mask-sensitive.ts`:

| Dado | Quando | Fica assim |
|---|---|---|
| CPF | com ou sem pontuação (`000.000.000-00`, `00000000000`, `000 000 000 00`), **só se os dígitos verificadores batem** e não é sequência repetida | `•••.•••.•••-••` |
| Cartão | 13–19 dígitos (4-4-4-4 com espaço/traço, 4-6-5 Amex, ou seguidos), começa como bandeira (2–6; 13 dígitos só Visa), **Luhn válido** | `•••• 1234` (4 últimos) |
| CVV | só com rótulo explícito antes: `cvv`, `cvc`, `código de segurança`, `cód. seg.` | `cvv •••` |

Não mexe em: telefone (`(11) 99999-8888`, `5511999998888`), CEP, valores (`R$ 1.234,56`), datas, número de pedido/protocolo
que não passa nas verificações, linha digitável de boleto. **CNPJ não é mascarado** (é dado da empresa, não da pessoa); um
CNPJ válido de 14 dígitos também nunca é tratado como cartão.

Limites conhecidos: CPF de dígitos válidos escrito de forma "estranha" (ex.: `529-982-247/25`) passa; CVV sem rótulo
("o código é 123") passa de propósito, para não apagar horários, salas e quantidades. Um número de pedido que por acaso seja
Luhn-válido e pareça cartão é mascarado (preferimos errar para o lado da privacidade).

## Onde é aplicado

1. **Na entrada** (`src/lib/ingest.ts`): o texto já é gravado mascarado. É a proteção principal: o dado nunca chega ao
   banco, ao backup, ao motor de análise nem a logs. Nenhuma regra do classificador depende desses dígitos.
2. **No motor** (`src/lib/analysis/engine.ts`): as mensagens lidas do banco passam pela máscara antes de qualquer regra,
   então evidência de achado, descrição de alerta, notificação e promessa nunca copiam o número, mesmo de mensagens antigas.
3. **Nas saídas, como rede de segurança para linhas antigas** (gravadas antes desta mudança):
   detalhe da conversa (`/api/conversations/[id]`: mensagens, evidências, promessas, perguntas), alertas, notificações,
   painel de administração, perfil do atendente (promessas), relatório de promessas e a exportação LGPD de um cliente.

As linhas antigas **não são reescritas** no banco (sem migração). Elas continuam em claro no SQLite até o prazo de
retenção apagar o texto (`retContent`, padrão 365 dias, em `src/lib/privacy.ts`). Se for preciso limpar antes, um script
pontual pode aplicar `maskSensitive` em `Message.text`, `AuditFinding.evidence`, `Alert.description`,
`Notification.message` e `Promise.action`, rodando com backup feito.

## Testes

- Unidade: `tests/unit/mask-sensitive.unit.spec.ts` (positivos e negativos em pt-BR).
- API: `tests/e2e/mask-sensitive.spec.ts` (mensagem com CPF + cartão + CVV pelo gateway → banco, tela, alerta, notificação e
  exportação só com a versão mascarada).
