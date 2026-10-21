#!/usr/bin/env bash
# Cópia do backup mais recente (banco + sessões do WhatsApp + fotos) para o Google Drive, cifrada pelo rclone (crypt)
# antes de sair do servidor. Roda depois do scripts/backup-db.ts no workflow "Backup diário do banco".
#   bash scripts/backup-drive.sh
# Variáveis: RCLONE_CONFIG (padrão /opt/atende-radar/shared/rclone.conf), BACKUP_DIR (padrão /opt/atende-radar/backups),
#            DRIVE_KEEP_DAYS (quantos dias ficam no Drive; padrão 30).
# Restaurar e trocar a autorização: docs/operacao/backup-drive.md
set -euo pipefail

CONF="${RCLONE_CONFIG:-/opt/atende-radar/shared/rclone.conf}"
DIR="${BACKUP_DIR:-/opt/atende-radar/backups}"
KEEP_DAYS="${DRIVE_KEEP_DAYS:-30}"
DEST="gdrive-cifrado:diario"

if [ ! -r "$CONF" ]; then
  echo "backup-drive: $CONF não existe ou não pode ser lido; sem cópia fora do servidor" >&2
  exit 1
fi

db=$(ls -t "$DIR"/atenderadar-*.db 2>/dev/null | head -1 || true)
if [ -z "$db" ]; then
  echo "backup-drive: nenhum atenderadar-*.db em $DIR" >&2
  exit 1
fi
stamp=$(basename "$db" .db)
stamp=${stamp#atenderadar-}

# o backup-db.ts usa o mesmo carimbo para o banco e as pastas copiadas junto
itens=("$(basename "$db")")
for d in "wa-sessions-$stamp" "uploads-$stamp"; do
  if [ -d "$DIR/$d" ]; then itens+=("$d"); fi
done

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
pacote="$tmp/atenderadar-$stamp.tar.gz"
tar -C "$DIR" -czf "$pacote" "${itens[@]}"

rclone --config "$CONF" copy "$pacote" "$DEST"
# confere que chegou com o mesmo tamanho antes de dar como feito
local_size=$(stat -c %s "$pacote")
remote_size=$(rclone --config "$CONF" lsf --format s --files-only --include "atenderadar-$stamp.tar.gz" "$DEST" | head -1)
if [ "$remote_size" != "$local_size" ]; then
  echo "backup-drive: tamanho no Drive ($remote_size) diferente do local ($local_size)" >&2
  exit 1
fi
echo "backup-drive: atenderadar-$stamp.tar.gz no Drive ($local_size bytes; ${itens[*]})"

# retenção: mais antigos que DRIVE_KEEP_DAYS vão para a lixeira do Drive (que esvazia sozinha em 30 dias)
rclone --config "$CONF" delete --min-age "${KEEP_DAYS}d" "$DEST"
echo "backup-drive: no Drive agora: $(rclone --config "$CONF" lsf --files-only "$DEST" | wc -l) cópias"
