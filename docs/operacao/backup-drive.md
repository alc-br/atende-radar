# Backup no Google Drive

Cópia diária, fora do servidor, do backup feito pelo `scripts/backup-db.ts`. Montado em 21/10/2026.

## Como funciona

- O workflow **Backup diário do banco** (`.github/workflows/backup.yml`, 03:00 de Brasília, runner no servidor) faz o backup local e depois roda `scripts/backup-drive.sh`.
- O script junta num `.tar.gz` o banco mais recente (`atenderadar-*.db`) com as pastas `wa-sessions-*` e `uploads-*` do mesmo horário e envia para o Drive pelo **rclone**.
- O envio passa pelo remoto `gdrive-cifrado` (rclone crypt): o conteúdo e os nomes chegam cifrados ao Drive. No Drive aparece só a pasta `atende-radar/` com nomes embaralhados.
- Depois do envio o script confere se o tamanho no Drive bate com o local. Se algo falhar, o job falha e abre a issue "ALERTA: backup diário do banco falhou".
- Retenção no Drive: 30 dias (`DRIVE_KEEP_DAYS`). Os mais antigos vão para a lixeira do Drive, que se esvazia sozinha.

## Onde está cada coisa

- **Pasta do Drive:** escolhida pelo dono, na conta Google da ALC (ID da pasta no `root_folder_id` do `rclone.conf`).
- **Autorização:** cliente OAuth "AtendeRadar backup Drive", do tipo app para computador, no projeto **ALC Consultoria** do Google Cloud. A conta já estava no limite de projetos e não deu para criar um projeto só para isso. A tela de consentimento desse projeto se chama "n8n" e está publicada; por isso a autorização não vence em 7 dias.
  - Por que não é uma conta de serviço: conta de serviço não tem espaço de armazenamento e não consegue gravar num Drive pessoal (sem Drive compartilhado).
- **Servidor:** `/opt/atende-radar/shared/rclone.conf` (dono `atende-radar`, `chmod 600`). Tem o cliente OAuth, o token da conta e as senhas do crypt já ofuscadas. Fica fora do repositório.
- **Cópia das chaves:** no arquivo local de chaves do dono, `GDRIVE_CLIENT_ID`, `GDRIVE_CLIENT_SECRET`, `GDRIVE_CRYPT_PASSWORD` e `GDRIVE_CRYPT_SALT`. **Sem as duas senhas do crypt, os backups do Drive não abrem.**

## Restaurar

No servidor (ou em qualquer máquina com o rclone e o mesmo `rclone.conf`):

```bash
rclone --config /opt/atende-radar/shared/rclone.conf lsl gdrive-cifrado:diario
rclone --config /opt/atende-radar/shared/rclone.conf copy gdrive-cifrado:diario/atenderadar-AAAAMMDD-HHMMSS.tar.gz /tmp/restaura
tar -C /tmp/restaura -xzf /tmp/restaura/atenderadar-*.tar.gz
```

Daí em diante é igual a restaurar um backup local (o simulado de restauração está em `scripts/restore-drill.ts`). As sessões do WhatsApp continuam cifradas pela `WA_SESSIONS_KEY`, e os telefones pela `PHONE_ENC_KEY`.

Sem o servidor: instale o rclone, crie um remoto `drive` com a conta Google da ALC e um remoto `crypt` sobre `<drive>:atende-radar`, usando as duas senhas do arquivo local de chaves (`rclone config` pede as senhas em texto e as ofusca).

Prova feita em 21/10/2026: envio, download, `tar` e `PRAGMA integrity_check` = ok.

## Trocar ou renovar a autorização

Se o token for revogado (por exemplo, ao remover o acesso em myaccount.google.com › Segurança › Apps de terceiros), o job falha e abre a issue. Para autorizar de novo:

1. Gere um token novo com o cliente OAuth acima: escopo `https://www.googleapis.com/auth/drive`, `access_type=offline`, `prompt=consent`. Pode ser pelo `rclone authorize "drive" "<client_id>" "<client_secret>"` numa máquina com navegador.
2. Troque a linha `token = …` do `rclone.conf` no servidor.
3. Rode o workflow à mão (Actions › Backup diário do banco › Run workflow) para conferir.
