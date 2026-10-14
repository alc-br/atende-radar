# Sessões do WhatsApp: credenciais cifradas

Cada número conectado tem suas credenciais (as chaves da conta no WhatsApp) em `WA_SESSIONS_DIR/<id da conexão>/`
(produção: `/opt/atende-radar/wa-sessions`, pasta 0700). Quem tem esses arquivos consegue se passar pelo aparelho
conectado, por isso eles ficam **cifrados em disco** (AES-256-GCM, um arquivo por vez; código em
`src/lib/whatsapp/auth-store.ts`).

## A chave
- Variável `WA_SESSIONS_KEY` em `/opt/atende-radar/shared/app.env` (32 bytes em base64).
- É gerada **no próprio servidor** pelo deploy (`openssl rand -base64 32`) na primeira vez, igual a `GATEWAY_SECRET`
  e `PHONE_HASH_SECRET`. Nunca vai para o git nem para os secrets do GitHub. O deploy não troca uma chave existente.
- **Perder a chave = todas as empresas escaneiam o QR de novo.** Os arquivos cifrados não abrem sem ela, e os backups
  das sessões também estão cifrados com ela.

## Guardar a chave (faça uma vez, logo após o primeiro deploy com ela)
```bash
sudo grep '^WA_SESSIONS_KEY=' /opt/atende-radar/shared/app.env
```
Copie o valor para o cofre de senhas da empresa (fora do servidor). O servidor sozinho não é backup: se o disco se
perder, vão juntos a chave, as sessões e os backups locais.

## Migração das sessões que já existiam
- No primeiro deploy com a chave, antes de reiniciar o serviço, o deploy guarda as sessões como estavam (texto puro) em
  `/opt/atende-radar/backups/wa-sessions-pre-cifra-AAAAMMDD-HHMMSS.tar.gz`. Esse arquivo **não** é apagado sozinho.
- Ao subir, cada sessão cifra os próprios arquivos no lugar: grava a cópia cifrada num temporário, confere que ela abre
  e só então troca pelo original (rename atômico). No log: `[whatsapp] <id> N arquivo(s) de credencial cifrado(s)`.
- Confirmado que as conexões voltaram (tela de Conexões, status "Conectada"), apague o `.tar.gz` pré-cifra e, quando
  quiser, as cópias antigas `wa-sessions-*` em `backups/` (as anteriores à chave estão em texto puro; somem sozinhas
  pela retenção de 30).

## Se algo der errado
- **Sem a chave no ambiente:** o sistema continua funcionando em texto puro e avisa uma vez no log
  (`WA_SESSIONS_KEY ausente`). Sessões já cifradas não sobem (veja abaixo).
- **Chave errada ou ausente com sessões cifradas:** a sessão NÃO sobe, os arquivos ficam intactos, a conexão aparece
  como "Degradada" (motivo `credenciais_ilegiveis`) e o log mostra
  `ATENÇÃO: credenciais cifradas não abrem com a WA_SESSIONS_KEY atual`. Restaure a chave certa em `app.env` e
  reinicie: `sudo systemctl restart atende-radar.service`. Nada precisa ser reescaneado.
- **Voltar ao texto puro (último recurso):** pare o serviço, restaure o `.tar.gz` pré-cifra em
  `/opt/atende-radar/wa-sessions`, tire `WA_SESSIONS_KEY` do `app.env` e suba. Sessões que mudaram depois da migração
  podem pedir QR de novo.

## Backups
`scripts/backup-db.ts` (todo deploy e todo dia) copia `wa-sessions` para `backups/wa-sessions-<data>` junto com o
banco. As cópias continuam cifradas: restaurar exige a mesma chave.

## Trocar a chave
Ainda não há rotação automática. Trocar o valor no `app.env` deixa todas as sessões ilegíveis. Se for preciso, peça
uma rotina de rotação (decifra com a antiga, cifra com a nova) antes de mexer.
