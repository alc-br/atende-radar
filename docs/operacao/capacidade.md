# Capacidade medida (SQLite, 1 servidor)

Medido em 25/09/2026 com `node scripts/load-test.mjs` contra a build de produção, na máquina de desenvolvimento
(não é o servidor real: **repetir no servidor antes de prometer números a cliente**).
Com uma empresa de 20 mil conversas / 200 mil mensagens: ver `desempenho.md`.

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

## Limites do serviço no systemd (I8): proposta

Hoje o serviço `atende-radar.service` não tem limite de memória nem de processos. Se houver um vazamento de memória
ou um laço que cria tarefas sem parar, o processo cresce até o kernel acionar o OOM killer. O OOM killer pode
derrubar o próprio app, o nginx, o sshd ou o runner do GitHub, e aí nem o deploy volta a funcionar. A proposta abaixo
põe um teto no app e faz ele voltar sozinho se cair. **O deploy não muda.**

### O arquivo

`/etc/systemd/system/atende-radar.service.d/limites.conf`:

```ini
[Unit]
# Se o app cair 5 vezes em 10 minutos, o systemd para de tentar (evita laço de reinício) e o serviço fica "failed".
StartLimitIntervalSec=600
StartLimitBurst=5

[Service]
# Volta sozinho se o processo morrer por erro ou por falta de memória; não volta depois de um "systemctl stop".
Restart=on-failure
RestartSec=5

# Memória do app (o Node/Next com o gateway do WhatsApp no mesmo processo).
# MemoryHigh: acima disso o kernel recupera memória do serviço com força (fica mais lento, mas não morre).
# MemoryMax: teto duro; acima disso o OOM killer mata SÓ o app, e o Restart=on-failure o sobe de novo.
MemoryHigh=1200M
MemoryMax=1536M
# Não deixa o app ir para o swap quando passar do MemoryHigh (o swap esconderia o problema e travaria o servidor).
MemorySwapMax=0

# Teto de processos e threads do serviço (o Node usa ~11 threads; o uso normal fica bem abaixo de 100).
TasksMax=512
```

### Por que esses valores

Valores para uma VPS com **4 GB de RAM**. Confira antes com `free -m`; a tabela abaixo dá os valores para outros tamanhos.

- **Uso em produção ainda não medido.** Antes de aplicar, olhe o uso real com `systemctl status atende-radar.service`
  (linha `Memory:`) ou `systemctl show atende-radar.service -p MemoryCurrent`, em um horário de movimento.
  `MemoryHigh` precisa ficar com pelo menos 50% de folga acima do pico visto.
- **O build não roda dentro do serviço.** O deploy roda `bun run build` com `NODE_OPTIONS=--max-old-space-size=1536`
  pelo runner, fora deste serviço. Esses limites não afetam o build.
  - A VPS precisa ter memória para o build e o app ao mesmo tempo: o build ocupa até cerca de 1,5 GB de heap, mais o
    processo, e o app fica no ar durante o build. É por isso que o teto do app não passa de 1,5 GB numa máquina de 4 GB.
  - O que sobra fica para o build, o nginx, o runner e o sistema.
- **Valores adotados para o app em produção:**
  - `MemoryHigh` = 1200M, para o kernel avisar e frear antes do teto.
  - `MemoryMax` = 1536M, o mesmo número do heap do build, para facilitar a conta.
- **`TasksMax=512`.**
  - O padrão do systemd costuma ser 15% de `pids_max`, alguns milhares.
  - O app normal usa poucas dezenas de threads: Node, libuv, o pool do SQLite e o Baileys.
  - 512 dá folga de sobra e ainda segura um laço de `spawn` antes que ele afete o servidor.
- **`Restart=on-failure` com `RestartSec=5`.**
  - Cobre a queda do processo e a morte pelo `MemoryMax`.
  - O `StartLimit*` evita reinício sem fim quando o erro é na subida, como `app.env` quebrado ou banco ilegível.
    Nesse caso o serviço fica `failed` e o `smoke.yml` abre a issue `operacao` em até 6 h.
  - Quem estiver de plantão segue `incidente.md`.

| RAM da VPS | MemoryHigh | MemoryMax |
|---|---|---|
| 2 GB | 700M | 900M (e diminua o `--max-old-space-size` do build para 1024, ou tenha swap) |
| 4 GB | 1200M | 1536M |
| 8 GB ou mais | 2500M | 3G |

### Comando único (o dono do servidor roda, com sudo)

O runner do deploy só pode rodar `sudo systemctl restart atende-radar.service`. Ele não consegue criar este arquivo
nem rodar `daemon-reload`, por isso o comando abaixo é feito uma vez, à mão, por quem tem acesso de administrador:

```bash
sudo mkdir -p /etc/systemd/system/atende-radar.service.d
sudo tee /etc/systemd/system/atende-radar.service.d/limites.conf > /dev/null <<'EOF'
[Unit]
StartLimitIntervalSec=600
StartLimitBurst=5

[Service]
Restart=on-failure
RestartSec=5
MemoryHigh=1200M
MemoryMax=1536M
MemorySwapMax=0
TasksMax=512
EOF
sudo systemctl daemon-reload
sudo systemctl restart atende-radar.service
systemctl show atende-radar.service -p MemoryHigh -p MemoryMax -p TasksMax -p Restart   # confere
curl -sf http://127.0.0.1:3200 > /dev/null && echo OK
```

O restart derruba o app por alguns segundos e as conexões do WhatsApp se reconectam sozinhas. Faça fora do horário
de pico.

### Depois de aplicar

- **Ver se o app foi morto por memória:** `journalctl -u atende-radar.service | grep -iE 'oom|memory'`. Pelo
  status, aparece `Result: oom-kill`.
- **Reinícios repetidos pelo `MemoryMax` indicam vazamento.** Não suba o limite sem investigar. Registre o caso na issue
  `operacao` e veja `incidente.md`, seção "App fora do ar".
- **Desfazer:**
  1. `sudo rm /etc/systemd/system/atende-radar.service.d/limites.conf`
  2. `sudo systemctl daemon-reload`
  3. `sudo systemctl restart atende-radar.service`
- **Se o arquivo de unidade principal já tiver `Restart=`:** confira com `systemctl cat atende-radar.service`. O
  drop-in vale por cima.
