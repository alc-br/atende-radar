# CRM — deploy, liberação e rollback

Como o CRM comercial chega à produção, como é ligado empresa por empresa e como se desfaz. Vale para a arquitetura
nativa B (ADR-001): o CRM é parte do mesmo app, do mesmo deploy e do mesmo banco SQLite. Não há processo, banco nem fila
novos.

Base: `docs/operacao/rollback.md`, `migracoes.md` e `backup-e-restauracao.md`. Aqui fica só o que o CRM acrescenta.

## 1. O que vai para o servidor

| Peça | O que é | Efeito sem ninguém ligar o CRM |
|---|---|---|
| Migração `20261031120000_crm_base` | 16 tabelas `Crm*` e 45 índices. Só `CREATE TABLE` e `CREATE INDEX`: nenhuma tabela existente muda | tabelas vazias |
| Migração `20261031140000_crm_indices_empresa` | 2 índices (`organizationId, companyId`) em `CrmPerson` e `CrmDeal`, achados na medição de carga (`08-testes-e2e.md` › Carga). Só `CREATE INDEX` | índices em tabelas vazias |
| Rotas `/api/crm/*` (25) e `/api/admin/organizations/:id/crm` | contrato de `04-api-crm.md` | toda rota do CRM responde 404 `crm_disabled` |
| Agendador (`src/lib/background.ts`) | captura a cada 15 s, fila a cada 60 s, limpeza e reconciliação a cada 15 min | consulta as empresas com `crm.enabled` ligada, não acha nenhuma e não faz nada |
| Telas (`src/components/crm/`) | pacote separado (`next/dynamic`) | o grupo "Comercial" não aparece no menu; ninguém baixa o pacote |
| `CRM_DISABLED` no `.env.example` | desligamento geral | vazio = respeita a liberação por empresa |

Ninguém ganha o CRM por causa do deploy. Sem linha em `CrmFeatureState`, a flag vale desligada (D7).

## 2. Como chega à produção

1. O trabalho fica na branch `crm/integracao`. PR para a `main`, com o CI do `pull_request` (testes em 5 partes,
   `db:check`, `bun audit`).
2. Merge na `main` = deploy. O `deploy.yml` faz, nesta ordem: rsync, `bun install`, **backup do banco**
   (`scripts/backup-db.ts`), **ensaio de restauração** (`scripts/restore-drill.ts`), `db:generate`,
   `db:migrate:deploy`, build, restart e health check.
3. A migração do CRM roda depois do backup e com o app no ar (`migracoes.md`). Por ser só criação, o código anterior
   segue funcionando durante os minutos entre a migração e o restart.
4. Não rode o `workflow_dispatch` na branch `crm/integracao`: ele publica a branch escolhida em produção.

### Auditoria de dependências (`bun audit`)

Em 31/10/2026, o `node-forge` ≤1.4.0 ganhou 5 avisos altos (GHSA-8hrf-8g6f-7xwp, GHSA-hqq3-7jhf-c5jx,
GHSA-5x38-2vff-x55p, GHSA-7wch-p9px-956x, GHSA-jc66-7q78-782g). O passo de auditoria do deploy falha com eles, na
`main` também, e não é efeito do CRM.

A correção (1.4.2) saiu em 27/10/2026. Pela regra do projeto, pacote novo só com 2 semanas de publicado. Por isso:

- o `deploy.yml` ignora os 5 avisos, com a justificativa de cada um ao lado e a data. Nenhum é alcançável por entrada de
  terceiros: o `.p12` é o certificado A1 da própria ALC (NFS-e), e TLS e `verifyCertificateChain()` do forge não são
  usados (`reports/sca-baseline.md`);
- **a partir de 10/11/2026**: trocar o pin para `node-forge@1.4.2`, rodar os testes de NFS-e e tirar as 5 exceções.

Conferido: `bun audit` com as exceções sai com 0.

## 3. Ligar o CRM numa empresa

Só o operador da plataforma liga (`crm.enabled`). A empresa não liga sozinha.

1. Em Admin › Organizações, abrir a empresa e, na seção "CRM comercial", clicar em "Ligar o CRM comercial" e
   confirmar. A confirmação repete o nome da empresa e diz que nenhuma mensagem é enviada. Se o `CRM_DISABLED=1`
   estiver valendo, a seção avisa: a flag é gravada, mas fica sem efeito até tirar o `CRM_DISABLED`.
   A tela chama `PATCH /api/admin/organizations/<id>/crm` com `{"enabled": true}`, que também pode ser chamado direto,
   logado como operador; a resposta traz `killSwitch: true` no mesmo caso.
2. Fica na auditoria: `crm.enabled_changed`, com `operator: true`.
3. Na sessão seguinte (ou ao recarregar), o `/api/me` traz `crm.enabled` e o grupo "Comercial" aparece para quem tem a
   permissão.
4. Ao ligar, o app cria o vínculo da empresa e o "Funil comercial" com 5 etapas, se faltarem (`provisionCrmTenant`,
   idempotente: religar não duplica). Na rodada seguinte (até 15 s), a captura lê as conversas dos últimos 30 dias e,
   dali em diante, só o que mudar. A reconciliação relê os últimos 7 dias a cada 6 h.
5. As sub-flags (`crm.autoCreateDeals`, `crm.suggestStage`, `crm.notifications`, `crm.exports`) o admin ou gestor
   da empresa liga em Configurações › CRM. Todas começam desligadas e só valem com `crm.enabled` ligada.

Liberação controlada: começar por uma empresa interna ou de homologação, depois uma por vez. Ligar em todas as empresas
precisa de autorização do dono.

## 4. Desligar e desfazer

Do mais leve ao mais pesado. Em todos, **nenhum dado do CRM é apagado**.

| Situação | O que fazer | Efeito |
|---|---|---|
| Problema numa empresa | Admin › Organizações › a empresa › "Desligar o CRM comercial" (ou o `PATCH` com `{"enabled": false}`) | rotas dessa empresa voltam a 404 `crm_disabled`, o menu some, a captura e a fila param para ela. Evento já na fila fica como processado sem efeito |
| Problema em todas | `CRM_DISABLED=1` no `/opt/atende-radar/shared/app.env` e `sudo systemctl restart atende-radar.service` | desliga em todas as empresas sem mexer no banco: rotas 404, captura, fila, reconciliação e tick do gateway param |
| Código do CRM com defeito | `git revert` do código na `main` (`rollback.md`, passo 1), **mantendo a migração e o `schema.prisma`** | o app volta ao código anterior; as tabelas `Crm*` ficam, sem uso |
| Site fora do ar | republicar um commit bom à mão (`rollback.md`, passo 2) | igual ao anterior, sem esperar a suíte |
| Dado estragado | restaurar o backup do deploy (`rollback.md`, passo 3) | **perde tudo que entrou depois do backup**, do app inteiro. Só em último caso |

Não faça:

- reverter o commit da migração ou apagar a pasta dela: o `db:check` do CI quebra e o histórico do banco fica diferente
  do git (`migracoes.md`). Para tirar as tabelas, uma migração **nova**, depois de conferir o backup;
- apagar linhas `Crm*` à mão para "desligar": desligar é a flag.

Religar depois de desligar: a mesma chamada com `{"enabled": true}` (ou tirar o `CRM_DISABLED` e reiniciar). Os dados
voltam como estavam e o funil não é duplicado. A captura continua do ponto onde parou, e a reconciliação relê os
últimos 7 dias.

## 5. Backup e restauração

O CRM está no mesmo arquivo SQLite. O backup diário (03:00 de Brasília), o do deploy e o ensaio de restauração já levam
as tabelas `Crm*`, sem passo novo (`backup-e-restauracao.md`).

Restaurar um backup de antes da migração do CRM num app com o código do CRM: o `db:migrate:deploy` do próximo deploy
cria as tabelas de novo, vazias. Restaurar o banco junto com o código da mesma época (`rollback.md`, passo 3).

O ensaio de restauração do deploy (`scripts/restore-drill.ts`) conta as linhas de cada tabela `Crm*` do backup
restaurado e escreve no log do deploy uma linha `restore-drill: crm {...}` com as 16 contagens. Só números, sem dado de
cliente. No primeiro deploy com o CRM o backup é de antes da migração: o ensaio passa e escreve
`restore-drill: crm ausente (backup de antes da migração do CRM)`.

Testado em `tests/e2e/backup.spec.ts` (F8): numa cópia parada do banco de teste, as 16 tabelas voltam do backup com as
mesmas contagens e o funil volta com as etapas na ordem; e um backup sem as tabelas `Crm*` não quebra o ensaio.

## 6. Como saber se está saudável

- `GET /api/crm/integration/status` (admin ou gestor da empresa): fila pendente, com falha e parada, última captura e
  última reconciliação.
- Evento parado (dead letter): `POST /api/crm/integration/dlq/<id>/retry` repõe (só admin), com auditoria
  `crm.dlq_retried`. A tela de status mostra os 20 mais recentes, só com tipo, tentativas e código do erro.
- Log do servidor: erro inesperado do CRM é uma linha `[crm] <requestId> <tipo> <código>`, sem dado de cliente.
  Falha do agendador aparece como `captura do CRM`, `fila do CRM` ou `reconciliação do CRM`
  (`journalctl -u atende-radar.service | grep -i crm`).
- O CRM nunca derruba a análise nem a ingestão do WhatsApp: a gravação do evento não lança erro e o agendador isola cada
  tarefa (`safely`).

## 7. Pendências

| # | Item | Situação |
|---|---|---|
| D1 | Tela no Admin para ligar e desligar o CRM numa empresa | feito: Admin › Organizações › "CRM comercial", com confirmação (`tests/e2e/admin-crm.ui.spec.ts`) |
| D2 | Trocar `node-forge` para 1.4.2 e tirar as 5 exceções do `bun audit` | a partir de 10/11/2026 |
| D3 | Teste de `CRM_DISABLED=1` | feito: `crm-matriz.unit` › T11.05 |
| D4 | Ensaio de restauração conferindo as tabelas `Crm*` | feito: § 5 (`tests/e2e/backup.spec.ts`, F8) |
| D5 | Medir memória e disputa de escrita no SQLite com o CRM ligado | não medido: a carga da F7 (`08-testes-e2e.md` § 4) fez uma operação por vez, fora do servidor e sem a análise rodando junto. Medir no canário, com `systemctl status atende-radar.service` (memória do cgroup) e o tempo das gravações da análise antes e depois de ligar |
