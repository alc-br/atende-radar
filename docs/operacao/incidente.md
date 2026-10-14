# Incidentes: o que fazer quando algo dá errado

Roteiro para quem estiver de plantão. Cada seção diz **como perceber**, **o que olhar** e **o que fazer**, e aponta
para o documento detalhado. Os comandos no servidor pedem acesso de administrador (sudo), salvo quando indicado.

Lembrete de permissões: o runner do deploy (GitHub Actions, no próprio servidor) só tem um `sudo` liberado,
`sudo systemctl restart atende-radar.service`. Parar o serviço, ler o `journalctl` de outros serviços, mexer em
`/etc` ou restaurar banco exige alguém com acesso de administrador ao servidor.

## 0. Primeiros 5 minutos (qualquer incidente)

1. **Confirme e meça o tamanho.**
   - Página pública de status: `https://app.atenderadar.com.br/status`. É calculada pelo próprio app e mostra:
     - "Todos os sistemas operando normalmente": tudo certo;
     - "Funcionando, com atraso na análise": o agendador está parado há mais de 5 min, mas o painel responde;
     - "Instabilidade no serviço": o banco não responde.
   - Se a página nem abre, o app ou o nginx estão fora.
   - API da mesma informação: `curl -s https://app.atenderadar.com.br/api/public/status`. Responde **503** só quando o
     painel está fora e **200** com "degraded" quando só a análise está atrasada.
   - Fumaça completa, só leitura: `bash scripts/smoke.sh https://app.atenderadar.com.br https://atenderadar.com.br`,
     ou Actions → "Fumaça em produção" → Run workflow.
2. **Abra (ou atualize) uma issue com o rótulo `operacao`.** Os alertas automáticos já fazem isso:
   - `smoke.yml` (a cada 6 h e depois de cada deploy) abre "ALERTA: fumaça em produção falhou";
   - `backup.yml` (todo dia às 03:00 de Brasília) abre "ALERTA: backup diário do banco falhou".
   Anote na issue o horário de início (em horário de Brasília), o que se vê e cada ação tomada. A issue é o registro do
   incidente.
3. **Não faça deploy "para ver se resolve"** sem saber a causa. Todo deploy faz backup e migração. Se o problema é
   banco ou disco, ele pode piorar.
4. Se o incidente envolve **dados pessoais** (vazamento, acesso indevido, perda), vá também para a seção 6: os prazos da
   LGPD começam a contar quando a empresa fica sabendo.

## 1. App fora do ar

**Sinais:**
- `/status` não abre ou mostra "Instabilidade no serviço";
- a fumaça falha em "página inicial abre";
- clientes não conseguem entrar.

**Olhar, no servidor:**
```bash
systemctl status atende-radar.service          # está rodando? quando reiniciou? "Result: oom-kill"?
journalctl -u atende-radar.service -n 200 --no-pager
curl -sf http://127.0.0.1:3200 > /dev/null && echo APP_OK   # o app responde sem passar pelo nginx?
df -h /opt/atende-radar                         # disco cheio derruba o SQLite
free -m
```

**Fazer:**
- **App parado ou travado:** reinicie com `sudo systemctl restart atende-radar.service` e confira com
  `curl -sf http://127.0.0.1:3200`. As conexões do WhatsApp voltam sozinhas.
- **App responde em `127.0.0.1:3200`, mas o site não abre:** o problema está no nginx, no DNS ou no certificado.
  - Rode `sudo nginx -t && sudo systemctl status nginx`.
  - O certificado é conferido pela fumaça e pelo backup diário, que falham quando faltam menos de 15 dias para vencer.
- **Disco cheio:** apague backups antigos além dos 30 mais recentes (a retenção é automática) e os
  `wa-sessions-pre-cifra-*.tar.gz` já conferidos (ver `sessoes-whatsapp.md`). Nunca apague o banco nem
  `/opt/atende-radar/wa-sessions`. O `backup.yml` falha quando o disco chega a 85%.
- **Morto por falta de memória (`oom-kill`) ou reiniciando sem parar:** veja a proposta de limites em
  `capacidade.md` ("Limites do serviço no systemd"). Registre na issue. Se acontecer de novo, é vazamento: investigue
  antes de aumentar memória.
- **Caiu logo depois de um deploy:** é a seção 2.
- **Só "atraso na análise":** o painel funciona, mas o agendador (motor de análise, e-mails, relatórios) não roda há
  mais de 5 min.
  - Procure no `journalctl` o erro do agendador e reinicie o serviço.
  - Alertas e e-mails atrasados saem na rodada seguinte.

## 2. Deploy falhou ou deixou o site quebrado

**Sinais:**
- o job `deploy` do Actions ficou vermelho;
- a fumaça que roda depois do deploy falhou;
- o site quebrou logo após um push na `main`.

**O que importa é em que passo falhou.** Detalhes em `rollback.md`:

| Falhou em | Estado do site | O que fazer |
|---|---|---|
| testes (`test`/`browsers`) | intacto, nada foi ao servidor | corrigir e mandar de novo |
| backup ou ensaio de restauração | intacto | ver o log; normalmente disco cheio ou banco ilegível (seções 1 e 3) |
| migrações (`db:migrate:deploy`) | intacto, na versão anterior; a transação da migração é desfeita | `migracoes.md` › "Se uma migração falhar no servidor" |
| build | intacto até o próximo restart (`current/` já tem o código novo) | corrigir e mandar de novo; **não reinicie o serviço** antes disso |
| restart ou health check (`curl -sf http://127.0.0.1:3200`) | **quebrado**, com o build novo | `rollback.md`: caminho 2 (republicar um commit bom à mão) e depois caminho 1 (`git revert` na `main`) |

- Não existe rollback automático nem versão anterior guardada no servidor: desfazer é publicar de novo o código bom.
- **Se o deploy trouxe migração:** não reverta o commit da migração (ver `rollback.md` e `migracoes.md`).

## 3. Banco corrompido ou dados estragados

**Sinais:**
- erros `SQLITE_CORRUPT`, `database disk image is malformed` ou `file is not a database` no `journalctl`;
- o backup diário falha no `integrity_check`;
- dados claramente errados depois de um deploy ou script.

**Fazer:**
1. **Pare de escrever.** Use `sudo systemctl stop atende-radar.service`. Cada minuto rodando sobre um banco corrompido
   pode piorar o arquivo. Atualize a issue e a página de status deixa de responder. Avise os clientes (seção 7).
2. **Guarde o estado atual** antes de qualquer coisa. Copie o `.db` e também o `-wal` e o `-shm`:
   `cp <banco>.db* /opt/atende-radar/backups/` com o sufixo `ANTES-DA-RESTAURACAO-<data>`.
3. **Tente ler:** rode `sqlite3 <banco>.db 'PRAGMA integrity_check;'`. Se o problema for só um índice, `REINDEX` pode
   resolver sem perda. Na dúvida, restaure.
4. **Restaure o backup mais recente que passa no `integrity_check`.**
   - Siga `backup-e-restauracao.md` › "Restaurar" e `rollback.md` › passo 3. Lá está como achar o arquivo do banco em
     uso pelo `DATABASE_URL`.
   - O ensaio de restauração (`bun scripts/restore-drill.ts`) prova que o backup mais recente abre, sem tocar no banco em
     uso.
5. **Tudo o que entrou depois do backup se perde.** Isso inclui cadastros, mensagens, alertas e pagamentos. Anote o
   intervalo perdido para avisar os clientes afetados.
   - Os pagamentos se recuperam sozinhos: a varredura de 15 min relê as assinaturas no Pagar.me. Confira na seção 5.
6. **Sessões do WhatsApp:** só restaure `wa-sessions-<data>` se elas também se perderam. Com o serviço parado, copie
   por cima de `/opt/atende-radar/wa-sessions`. Elas são cifradas e precisam da mesma `WA_SESSIONS_KEY`.

**Atenção:** os backups ficam na mesma máquina. Se o disco se perdeu, não há cópia externa (card B10). Nesse caso a
recuperação depende de cópias feitas fora do servidor, se alguém tiver feito.

## 4. WhatsApp: desconexão em massa

**Sinais:**
- muitas conexões ficam "Desconectada", "QR necessário" ou "Degradada" ao mesmo tempo (tela Conexões de cada
  empresa; o Admin mostra só a quantidade de conexões, não o estado de cada uma);
- clientes dizem que as conversas pararam de chegar.

**Diagnóstico pelo log** (`journalctl -u atende-radar.service | grep '\[whatsapp\]'`):

| No log ou na tela | Causa provável | Fazer |
|---|---|---|
| `ATENÇÃO: credenciais cifradas não abrem com a WA_SESSIONS_KEY atual`, conexões "Degradada" com motivo `credenciais_ilegiveis` | `WA_SESSIONS_KEY` sumiu ou mudou no `app.env` | restaurar a chave certa (do cofre de senhas) e reiniciar; **ninguém precisa reescanear** (`sessoes-whatsapp.md`) |
| `WA_SESSIONS_KEY ausente` | chave fora do ambiente | idem |
| `desconectado pelo aparelho (logged_out)` em muitas conexões | o WhatsApp derrubou as sessões (mudança do lado deles, bloqueio) ou alguém saiu pelo celular | cada empresa precisa gerar o QR de novo; avisar os clientes |
| nenhuma linha `[whatsapp]` | gateway desligado (`WHATSAPP_GATEWAY` diferente de `on` no `app.env`) | conferir o `app.env` e reiniciar |
| conexões "Bloqueada" | o número foi banido pelo WhatsApp (risco da integração não oficial) | não há o que fazer no sistema; avisar a empresa |

- Depois de qualquer correção, confira algumas conexões no **Diagnóstico** (na tela Conexões): Socket, Heartbeat e
  Mensagens.
- Mensagens que chegaram com a sessão fora do ar **não** são recuperadas.
- **Não apague** `/opt/atende-radar/wa-sessions` nem restaure cópias antigas "para ver se resolve". Uma credencial velha
  pode forçar novo QR em todas as empresas.

## 5. Cobrança: webhook ou Pagar.me falhando

**Sinais:**
- empresas que pagaram continuam "Em teste" ou "Pagamento pendente";
- erros em `/api/billing/webhook` no log;
- no painel da Stone/Pagar.me, entregas de webhook falhando.

**Antes de tudo, saiba que o sistema se corrige sozinho.** O estado da assinatura é sincronizado por três caminhos:
o webhook (instantâneo), a leitura ao abrir **Planos** (se a última tiver mais de 2 min) e a varredura a cada 15 min.
Um webhook falhando atrasa a ativação em no máximo cerca de 15 min. Não é preciso mexer no banco à mão.

**Olhar:**
- **`journalctl` com "billing" ou "webhook":**
  - 401 no webhook: o usuário e a senha (`PAGARME_WEBHOOK_USER`/`PASS`) diferem dos cadastrados no painel;
  - 5xx: o erro do nosso lado.
- **Painel da Stone (conta.stone.com.br):**
  - status da API do Pagar.me;
  - a URL do webhook deve ser `https://app.atenderadar.com.br/api/billing/webhook`, cadastrada no painel do modo
    certo (`test` ou `live`).
- **`PAGARME_MODE` no `app.env`:** chaves `live` com modo `test`, ou o contrário, fazem toda chamada falhar.

**Fazer:**
- **Credencial errada:** acerte o secret no GitHub (`gh secret set ...`) e faça deploy, ou corrija o `app.env` e
  reinicie. Ver `cobranca-pagarme.md`.
- **Pagar.me fora:**
  - nada a fazer no sistema; os pagamentos novos falham com mensagem para o cliente e nada é cobrado;
  - as renovações são feitas pelo próprio Pagar.me e sincronizam quando ele voltar.
- **Um cliente específico:** veja o manual de suporte (`docs/suporte/manual.md`, "Cartão recusado"). Admin ›
  Organizações › empresa › Assinatura **muda só o nosso registro, não a cobrança no Pagar.me**: use só para estender um
  teste ou corrigir a situação depois de conferir no painel da Stone.

## 6. Suspeita de vazamento de dados (LGPD)

Exemplos:
- dados de uma empresa aparecendo para outra;
- banco, backup ou `app.env` expostos;
- segredo publicado no git (o repositório é **público**);
- acesso indevido ao servidor;
- `WA_SESSIONS_KEY` vazada.

**Conter primeiro (mesmo dia):**
1. **Segredo exposto:** troque o segredo **antes** de investigar.
   - Chaves do Pagar.me: no painel da Stone, depois o secret no GitHub, depois deploy.
   - Senha do webhook, `NEXTAUTH_SECRET`, `GATEWAY_SECRET`: no `app.env`, e reinicie.
   - `WA_SESSIONS_KEY`: ainda não há rotação. Trate os arquivos de sessão como comprometidos e peça às empresas que
     saiam dos aparelhos conectados no celular (WhatsApp › Aparelhos conectados) e gerem o QR de novo.
   - Tirar o segredo do git **não basta**: o histórico é público. Considere o segredo vazado.
2. **Falha de isolamento entre empresas:**
   - Se der para isolar a rota ou a tela, desligue-a (revert e deploy). Se não der, pare o serviço.
   - Os testes `tests/e2e/isolation*.spec.ts` devem ganhar um caso que reproduza a falha antes da correção.
3. **Guarde as provas:**
   - copie o `journalctl` do período, os logs do nginx e uma cópia do banco do momento (`backup-db.ts`);
   - não apague logs;
   - registre na issue `operacao` **quando a empresa ficou sabendo** (o prazo conta daí).

**Avaliar:** que dados (nomes, telefones, conteúdo de conversas, e-mails, dados de cobrança; o cartão nunca passa
pelo servidor), de quais empresas, quantos titulares, desde quando e se o acesso indevido é provável ou confirmado.

**Comunicar (Resolução CD/ANPD nº 15/2024):**
- **Papéis:** o AtendeRadar é **operador** dos dados das conversas (a empresa cliente é a controladora) e
  **controlador** dos dados de cadastro e cobrança de quem usa o sistema.
- **Dados das conversas:** avise **as empresas clientes afetadas sem demora**. São elas que comunicam a ANPD e os
  titulares. Mande o que elas precisam para isso: natureza dos dados, número de titulares, período, medidas tomadas e
  um contato.
- **Dados de que o AtendeRadar é controlador:** se o incidente pode causar risco ou dano relevante aos titulares,
  comunique **a ANPD** (formulário no site da ANPD) **e os titulares** em até **3 dias úteis** a partir de quando
  soube do incidente.
  - A comunicação pode ser complementada depois, dentro de 20 dias úteis, com o que se descobrir.
  - O texto aos titulares deve ser claro e dizer o que aconteceu, que dados, os riscos, o que foi feito e o que a
    pessoa pode fazer.
- **Registro:** mantenha o registro do incidente por pelo menos **5 anos**, inclusive quando decidir não comunicar
  (anote o porquê). A issue `operacao` com os anexos serve de base.
- **Revisão jurídica:** os textos legais e o encarregado (DPO) ainda dependem de revisão jurídica (pendência do
  dono). Num incidente real, envolva o jurídico **no primeiro dia**.

## 7. Comunicação com clientes

- **Página de status (`/status`):** atualiza sozinha a partir do health check. Não há como escrever um aviso nela à
  mão. Para dar contexto, use e-mail.
- **E-mail aos administradores das empresas afetadas:** curto, sem jargão. Diga o que está fora, desde quando, o que os
  clientes devem fazer (por exemplo, "gere o QR de novo") e quando vem a próxima atualização. Mande atualizações até
  resolver.
- **Depois de restaurar o banco:** diga o intervalo de dados perdidos.
- **Não prometa prazo** que depende de terceiros (WhatsApp, Pagar.me).

## 8. Depois do incidente

- Feche a issue `operacao` com um resumo: causa, impacto (quem, quanto tempo, que dados), o que foi feito e o que
  impede de repetir.
- Registre no `handoff.md` (Diário) e, se mudou código, no `CHANGELOG.md`.
- Toda falha que um teste poderia ter pegado vira teste.
- Rode a fumaça de novo e confira o próximo backup diário.

## Referências

- `rollback.md`: desfazer deploy, republicar à mão, restaurar banco junto com o código.
- `backup-e-restauracao.md`: onde ficam os backups, backup manual, restaurar.
- `migracoes.md`: migrações versionadas, falha no servidor.
- `sessoes-whatsapp.md`: `WA_SESSIONS_KEY`, sessões cifradas, chave errada.
- `cobranca-pagarme.md`: Pagar.me, variáveis, webhook, sandbox.
- `capacidade.md`: limites do servidor e proposta de limites do serviço no systemd.
- `.github/workflows/smoke.yml`, `backup.yml`, `deploy.yml`, `scripts/smoke.sh`: verificações automáticas.
- `docs/suporte/manual.md`: dúvidas de clientes (QR, alertas, e-mail, cobrança, dados).
