# Backup e restauração do banco

O banco é um arquivo SQLite (`DATABASE_URL`, caminho relativo a `prisma/`). Não há réplica: **o backup é a única proteção contra perda de dados.**

## O que já acontece sozinho
- **A cada deploy** (`.github/workflows/deploy.yml`): antes de mexer no schema, `scripts/backup-db.ts` faz uma cópia consistente (`VACUUM INTO`) e confere `PRAGMA integrity_check`. Se o backup falhar, o deploy para.
- **Todo dia às 03:00 (Brasília)** (`.github/workflows/backup.yml`): mesma cópia.
- **Onde ficam:** `/opt/atende-radar/backups/atenderadar-AAAAMMDD-HHMMSS.db` (fora de `current/`, então o `rsync --delete` do deploy não apaga). Mantém os 30 mais recentes (`BACKUP_KEEP`).
- **Mudança de schema perigosa:** o deploy usa `prisma db push` **sem** `--accept-data-loss`. Se a mudança apagaria dados, o deploy falha e o site continua no ar com a versão antiga. Quem decide é uma pessoa (migração manual ou `db:push` com a flag, depois de conferir o backup).

## Fazer um backup agora
Actions → "Backup diário do banco" → Run workflow. Ou no servidor:
```bash
cd /opt/atende-radar/current && BACKUP_REQUIRE_DB=true bun scripts/backup-db.ts
```

## Restaurar
1. Escolha o backup: `ls -lt /opt/atende-radar/backups`.
2. Pare o serviço: `sudo systemctl stop atende-radar.service`.
3. Guarde o banco atual antes de substituir: `cp prisma/<arquivo>.db /opt/atende-radar/backups/ANTES-DA-RESTAURACAO-$(date +%s).db`.
4. Copie o backup escolhido por cima do arquivo do banco (caminho do `DATABASE_URL`), e apague `-wal`/`-shm` ao lado, se existirem.
5. Suba: `sudo systemctl start atende-radar.service` e confira `curl -sf http://127.0.0.1:3200`.

## Limites conhecidos
- Os backups ficam **na mesma máquina** do banco. Se o disco/servidor se perder, perde-se tudo. Falta cópia externa (bucket/outro servidor) — está no card B10 do Trello.
- A restauração ainda não é exercitada em produção; o teste automatizado só prova que a cópia abre e contém os dados (`tests/e2e/backup.spec.ts`).
