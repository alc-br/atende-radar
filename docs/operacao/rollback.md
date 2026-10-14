# Rollback: desfazer um deploy ruim

## Como o deploy funciona (o que isso significa para o rollback)

`.github/workflows/deploy.yml`, job `deploy`, no runner do servidor:

1. `rsync -a --delete` do código para `/opt/atende-radar/current` (preserva só `.env`, `node_modules` e `.next`).
2. `bun install`.
3. Backup do banco (`scripts/backup-db.ts`) em `/opt/atende-radar/backups/atenderadar-AAAAMMDD-HHMMSS.db` + ensaio de restauração (`scripts/restore-drill.ts`).
4. `db:generate` e `db:migrate:deploy` (aplica as migrações de `prisma/migrations` que faltam; ver `migracoes.md`).
5. `scripts/sync-plan-catalog.ts`, build, `sudo systemctl restart atende-radar.service`, `curl -sf http://127.0.0.1:3200`.

Consequências:

- **Não existe versão anterior guardada no servidor.** O deploy sobrescreve `current/` no lugar; desfazer = publicar de novo o código bom.
- **Não há rollback automático.** Se o health check falhar, o job falha, mas o serviço fica com o build novo.
- **O banco não volta sozinho.** Cada deploy deixa um backup feito *antes* das migrações; restaurar é manual.
- Se o deploy falhou **antes** do restart (testes, backup, migrações, build), o serviço continua com a versão anterior: não há o que desfazer no servidor, só corrigir e mandar de novo.
  (Atenção: se falhou no build, `current/` já tem o código novo, mas o serviço continua no build anterior até o próximo restart.)

## 1. Caminho normal: reverter no git (com testes)

```bash
git revert <sha-ruim>       # um commit por vez, do mais novo para o mais antigo
git push origin main        # roda testes + deploy de novo (~45 min de testes)
```

**Se o deploy ruim trouxe uma migração**, não reverta o commit inteiro: migração já aplicada não se desfaz apagando a
pasta (o `--check` do CI falharia e o histórico do banco ficaria diferente do git). Reverta só o código e mantenha a
migração e o `schema.prisma` (campos novos opcionais não atrapalham o código antigo). Se for mesmo preciso tirar algo
do banco, crie uma migração **nova** que faça isso, depois de conferir o backup.

## 2. Mais rápido: republicar um commit bom à mão (sem testes)

Use quando o site está quebrado e não dá para esperar a suíte. No servidor, com o usuário do runner
(o mesmo dono de `/opt/atende-radar/current`):

```bash
SHA=<sha-bom>                                  # último commit que estava bom (veja o histórico do Actions)
rm -rf /tmp/ar-rollback
git clone https://github.com/alc-br/atende-radar.git /tmp/ar-rollback
git -C /tmp/ar-rollback checkout "$SHA"
rsync -a --delete --exclude '.env' --exclude 'node_modules' --exclude '.next' /tmp/ar-rollback/ /opt/atende-radar/current/
cd /opt/atende-radar/current
/usr/local/bin/bun install
/usr/local/bin/bun run db:generate             # NÃO rode migrações nem db:push aqui: o banco fica como está
if [ -f /opt/atende-radar/shared/dominios.env ]; then set -a; . /opt/atende-radar/shared/dominios.env; set +a; fi
NODE_OPTIONS=--max-old-space-size=1536 /usr/local/bin/bun run build
sudo systemctl restart atende-radar.service
sleep 3 && curl -sf http://127.0.0.1:3200 > /dev/null && echo OK
```

Depois, corrija a `main` (passo 1): **o próximo push na `main` publica o que estiver nela**, inclusive o código ruim.
Rode também a fumaça: Actions → "Fumaça em produção" → Run workflow (ou `bash scripts/smoke.sh https://app.atenderadar.com.br https://atenderadar.com.br`).

## 3. Se o banco também precisa voltar

Só quando o deploy estragou dados (ex.: mudança de schema aprovada com perda de dados, script que gravou errado).
**Tudo que entrou depois do backup é perdido** (cadastros, conversas, pagamentos): prefira consertar os dados se der.

1. Ache o backup daquele deploy. O log do passo "Backup database" no Actions mostra o arquivo
   (`backup-db: /opt/atende-radar/backups/atenderadar-...db`). O horário no nome é **UTC**. Os backups diários
   (03:00 de Brasília = 06:00 UTC) usam o mesmo padrão de nome. Lista: `ls -lt /opt/atende-radar/backups`.
2. Descubra o arquivo do banco em uso: é o `DATABASE_URL` (caminho relativo a `prisma/`, ou seja,
   `/opt/atende-radar/current/prisma/<arquivo>.db` quando relativo). Confira com `systemctl cat atende-radar.service`
   (`EnvironmentFile`/`Environment`) e `grep '^DATABASE_URL=' /opt/atende-radar/current/.env /opt/atende-radar/shared/app.env`.
3. Siga "Restaurar" em `docs/operacao/backup-e-restauracao.md`:
   ```bash
   sudo systemctl stop atende-radar.service
   cp <banco-em-uso>.db /opt/atende-radar/backups/ANTES-DA-RESTAURACAO-$(date +%s).db
   cp /opt/atende-radar/backups/atenderadar-<escolhido>.db <banco-em-uso>.db
   rm -f <banco-em-uso>.db-wal <banco-em-uso>.db-shm
   sudo systemctl start atende-radar.service
   curl -sf http://127.0.0.1:3200 > /dev/null && echo OK
   ```
   O backup tem o schema **de antes** do deploy ruim: restaure o banco junto com o código bom (passo 2), não com o ruim.
4. Sessões do WhatsApp: o backup também guarda `wa-sessions-<data>` ao lado. Só restaure (copiando por cima de
   `/opt/atende-radar/wa-sessions`, com o serviço parado) se elas se perderam; senão os clientes teriam de ler o QR de novo.

Para provar que um backup abre e é lido pelo app sem tocar no banco em uso: `cd /opt/atende-radar/current && bun scripts/restore-drill.ts`
(testa sempre o backup **mais recente** da pasta; ele roda sozinho em todo deploy).

## Depois

- Registre o que aconteceu no `handoff.md` (Diário) e no `CHANGELOG.md`.
- Se restaurou o banco, avise os clientes afetados pelo período perdido.
