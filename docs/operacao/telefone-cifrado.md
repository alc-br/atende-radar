# Telefone completo do cliente: cifrado no banco (B5/B9)

Até aqui o AtendeRadar guardava do cliente final só o **hash** do telefone (`Contact.phoneHash`, para achar o mesmo
contato de novo) e os **4 últimos dígitos** (`phoneLast4`). Agora guarda também o número completo, **cifrado**, em
`Contact.phoneEncrypted`. Código: `src/lib/phone-crypto.ts`.

## Como funciona
- Cifrado na entrada da mensagem (`src/lib/ingest.ts`) com AES-256-GCM. O valor fica como `v1:<base64>` e é preso à
  empresa: copiar o valor para o contato de outra empresa não abre.
- Contato criado antes da chave existir ganha o número completo na próxima mensagem dele.
- **Quem vê:** só quem já pode abrir aquela conversa (atendente: só as dele; supervisor: a equipe; gestor/admin: todas),
  e só no detalhe da conversa, clicando em **Mostrar**. Listas, painéis, alertas e relatórios continuam mostrando só o
  final (`*****1234`). Cada "Mostrar" vai para o registro de auditoria ("Telefone completo do cliente visto").
  Rota: `GET /api/conversations/<id>/phone` (sem cache).
- **LGPD:**
  - A exportação pelo titular (Privacidade) inclui o telefone completo (`contact.phone`).
  - "Apagar dados do cliente" apaga o contato, e o número vai junto.
  - "Excluir do monitoramento" e "Números excluídos" (Configurações › Privacidade) apagam o número completo: um contato
    que não é monitorado não fica com o número guardado.
  - A exclusão da empresa apaga todos os contatos.

## A chave
- Variável `PHONE_ENC_KEY` em `/opt/atende-radar/shared/app.env` (32 bytes em base64).
- É gerada **no próprio servidor** pelo deploy (`openssl rand -base64 32`) na primeira vez, igual a `WA_SESSIONS_KEY`.
  Ela nunca vai para o git nem para os secrets do GitHub, e o deploy não troca uma chave que já existe.
- **Sem a chave** o sistema continua funcionando como antes: não grava nem mostra o número completo, só o final. O log
  avisa uma vez: `[phone-crypto] PHONE_ENC_KEY ausente`.
- **Perder a chave = perder os números completos.** O resto continua: conversas, hash e final do número. Os backups
  do banco têm os números cifrados com essa mesma chave, então também não abrem sem ela.
- **Não troque a chave.** Os números já gravados deixariam de abrir. Se precisar trocar mesmo assim (vazamento), apague
  `phoneEncrypted` de todos os contatos: os números voltam a ser gravados com a chave nova conforme as mensagens chegam.
- Nos testes há uma chave fixa só de teste (`tests/e2e/media-env.ts`). Ela nunca vale em produção.

## Guardar a chave (dono: faça uma vez, logo após o primeiro deploy com ela)
```bash
sudo grep '^PHONE_ENC_KEY=' /opt/atende-radar/shared/app.env
```
Copie o valor para o cofre de senhas da empresa, **fora do servidor**, junto com `WA_SESSIONS_KEY`. O servidor sozinho
não é backup: se o disco se perder, a chave, o banco e os backups locais vão juntos.

## Restaurar em outro servidor
Coloque a mesma `PHONE_ENC_KEY` no `app.env` do servidor novo **antes** de subir o serviço com o banco restaurado.
