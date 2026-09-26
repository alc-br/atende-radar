# Roteiro de teste de usabilidade (D6) — 5 pessoas × 5 tarefas

Este teste **não pode ser automatizado**: mede se pessoas de verdade, sem treino, conseguem usar o AtendeRadar.
Cinco participantes já mostram a maior parte dos problemas de uso. Não precisa de laboratório: uma chamada de vídeo
com compartilhamento de tela, ou a pessoa ao lado, basta.

## Quem chamar
- 5 pessoas do perfil do cliente: dona(o) ou gerente de clínica/loja que atende pelo WhatsApp e **nunca viu o sistema**.
- Nenhuma pode ser da equipe do produto. Amigos servem, desde que não tenham visto as telas antes.
- Cada sessão dura 30–40 min. Grave a tela (com autorização) ou anote.

## Preparação (antes de cada sessão)
1. Crie uma conta nova pelo cadastro público (uma por participante) — assim a pessoa vê a primeira experiência real.
2. Para as tarefas que precisam de dados, use a **demonstração** (`Ver demonstração` na página inicial), que tem conversas e alertas.
3. Tenha o cronômetro e a tabela de registro abaixo à mão.
4. Diga à pessoa: *"Não é você que está sendo testado, é o sistema. Pense em voz alta. Eu não vou ajudar durante a tarefa."*

## As 5 tarefas (leia exatamente assim, sem explicar como fazer)
| # | Tarefa (o que dizer) | Sucesso = | Limite |
|---|---|---|---|
| 1 | "Crie sua conta e chegue à tela inicial do sistema." | Chegou à Visão Geral com o guia "Primeiros passos" visível. | 5 min |
| 2 | "Conecte o WhatsApp da empresa." (na conta nova) | Chegou ao QR Code na tela Conexões e entendeu que precisa escanear com o celular (pode parar antes de escanear). | 4 min |
| 3 | "Descubra qual cliente está esperando resposta há mais tempo e abra a conversa dele." (na demonstração) | Abriu o detalhe da conversa certa, partindo de Alertas ou de Conversas. | 4 min |
| 4 | "Diga quanto dinheiro a empresa corre risco de perder hoje e onde você viu isso." (na demonstração) | Apontou o valor em risco na Visão Geral ou na Recuperação. | 3 min |
| 5 | "Faça o sistema parar de contar atraso fora do horário comercial da sua empresa (segunda a sexta, 9h às 18h)." (na conta nova) | Salvou a aba Horários com os dias/horários certos e a regra "Ignora". | 5 min |

## O que registrar (por tarefa, por pessoa)
| Participante | Tarefa | Concluiu? (sim / com ajuda / não) | Tempo | Cliques errados / onde travou | Frase dita em voz alta que mais explica |
|---|---|---|---|---|---|

Ao final, 3 perguntas:
1. "De 1 a 5, quão fácil foi?" (por tarefa)
2. "O que você achou que o sistema faria e ele não fez?"
3. "Você pagaria por isso? Quanto?" (não é pesquisa de preço, é sinal de valor percebido)

## Como ler o resultado (critério de D6)
- **Passa** se pelo menos 4 de 5 pessoas concluem cada tarefa **sem ajuda** dentro do limite.
- Tarefa em que 2 ou mais pessoas travam no mesmo lugar = **problema de design**, vira card no Trello (D7) com: o passo, a frase da pessoa e a tela.
- Tempo alto sem travar = texto/rótulo confuso, não estrutura.

## O que já sabemos que pode aparecer (para não se surpreender)
- Tarefa 2 depende de o WhatsApp real estar validado (T6); a pessoa pode estranhar o aviso do QR.
- Tarefa 5: a regra "fora do expediente" tem três opções; se ninguém entender a diferença, o texto das opções precisa melhorar.
- O sistema é por regras, não por IA; se a pessoa esperar "resumo automático da conversa", anote — é o B6.
