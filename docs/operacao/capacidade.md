# Capacidade medida (SQLite, 1 servidor)

Medido em 25/09/2026 com `node scripts/load-test.mjs` contra a build de produção, na máquina de desenvolvimento
(não é o servidor real: **repetir no servidor antes de prometer números a cliente**).

| Cenário | Resultado |
|---|---|
| Ingestão de 2.000 mensagens (200 conversas × 10), 10 conexões simultâneas | **49 mensagens/s**, 0 falhas |
| Motor de análise, 200 conversas novas | 9,5 s |
| Motor de análise, 200 conversas sem novidade | 4,3 s |
| Painel, conversas, alertas, recuperação, equipe, relatórios (com 2.000 mensagens) | 18–45 ms cada |
| 50 pessoas abrindo o painel ao mesmo tempo | 0,4 s no total |

## Como ler
- **49 msg/s ≈ 4 milhões de mensagens por dia**: com folga para um piloto (dezenas de empresas pequenas).
- O motor roda a cada 60 s. Desde 26/09/2026 é **incremental**: a cada rodada só entram as conversas que podem mudar de estado
  (marcadas pela ingestão ou por ação manual, esperando a empresa, com alerta/promessa em aberto, com oportunidade ativa ou paradas
  além do prazo de inatividade). Conversa quieta e sem pendência não é reprocessada, então o custo cresce com o que MUDA, não com o
  histórico (~20–45 ms por conversa analisada). O gargalo passa a ser o número de conversas simultaneamente esperando a empresa.
  Teste: `tests/e2e/engine-incremental.spec.ts`.
- Um único servidor e um único arquivo de banco: sem redundância. Backup diário e antes de cada deploy (ver `backup-e-restauracao.md`).

## Ajustes que fizeram diferença
- Logs de consulta do Prisma só em desenvolvimento (em produção custavam ~30% da vazão e vazavam dados nos logs).
- SQLite em modo WAL (leitura não bloqueia a escrita) e espera de até 20 s pelo banco (`socket_timeout`) em vez de falhar na hora.
- Falha passageira ao gravar uma mensagem: o registro de idempotência é desfeito e o gerenciador tenta 4 vezes (antes, uma falha
  transitória descartava a mensagem para sempre).

## Quando migrar para Postgres
Sinais: mais de ~20 números conectados ao mesmo tempo, mais de ~1.500 conversas abertas por empresa, necessidade de mais de um
servidor de aplicação, ou de réplica/backup contínuo. Até lá o SQLite com WAL é adequado ao piloto.
