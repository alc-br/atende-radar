# Testes do CRM comercial

O que cada arquivo de teste prova, como rodar e o resultado de cada rodada. Vale o que tem saída de comando: número de
testes e tempo vêm da linha final do Playwright.

## 1. Como rodar

No worktree do CRM (um Playwright por checkout; porta e `prisma/test.db` próprios):

```bash
E2E_PORT=3111 TURBOPACK_ROOT="D:/ALC/clientes/alc/sistemas-proprios/atende-radar" bunx playwright test --project=unit --project=api tests/unit/crm.unit.spec.ts tests/e2e/crm-api.spec.ts tests/e2e/crm-f5.spec.ts --reporter=line
```

```bash
E2E_PORT=3111 TURBOPACK_ROOT="D:/ALC/clientes/alc/sistemas-proprios/atende-radar" bunx playwright test --project=ui-desktop --project=ui-mobile tests/e2e/crm.ui.spec.ts tests/e2e/crm-f5.ui.spec.ts tests/e2e/admin-crm.ui.spec.ts --reporter=line
```

Firefox e WebKit: `CROSS_BROWSER=1` liga os projetos `ui-firefox`, `ui-safari` e `ui-iphone`, que rodam os fluxos de
`CROSS_BROWSER` em `playwright.config.ts`. Todo `crm*.ui.spec.ts` entra nessa lista (`crm.ui`, `crm-f5.ui` e os seis
da F9); `admin-crm.ui.spec.ts` fica fora:

```bash
CROSS_BROWSER=1 E2E_PORT=3111 TURBOPACK_ROOT="D:/ALC/clientes/alc/sistemas-proprios/atende-radar" bunx playwright test --project=ui-firefox --project=ui-safari --project=ui-iphone tests/e2e/crm.ui.spec.ts tests/e2e/crm-f5.ui.spec.ts tests/e2e/crm-agenda.ui.spec.ts tests/e2e/crm-ajustes-visao.ui.spec.ts tests/e2e/crm-contatos.ui.spec.ts tests/e2e/crm-dados-sugestoes.ui.spec.ts tests/e2e/crm-reabrir.ui.spec.ts tests/e2e/crm-telas.ui.spec.ts --reporter=line
```

Fora do worktree (na raiz ou no CI) é só tirar `E2E_PORT` e `TURBOPACK_ROOT`. O banco de teste é recriado a cada
execução (`tests/e2e/reset-test-db.mjs` + migrações + seed); nada toca `dev.db` nem produção. Todos os dados são
fictícios: empresas criadas na hora por `signupOrg()`, e-mails `@cliente.test` e `@test.local`.

Os arquivos do CRM que ligam o CRM em empresas de teste chamam `crmOffAfterFile()` (`tests/e2e/crm-cleanup.ts`): no fim
do arquivo, as empresas que ele ligou voltam a desligado. Sem isso, o tick global dos arquivos seguintes (NFS-e,
ajustes) passava por todas elas e esgotava o tempo na suíte completa (§ 3). `admin-crm.ui` e `backup.spec` não usam:
o primeiro já desliga no próprio teste, e o segundo liga o CRM numa cópia do banco, não no `test.db`.

## 2. O que cada arquivo prova

| Arquivo | Projeto | Testes | Prova |
|---|---|---|---|
| `tests/unit/crm.unit.spec.ts` | unit | 26 | regras puras: dinheiro em centavos (estimativa, texto brasileiro, teto, "Valor não informado"), nome para busca, telefone normalizado, chave de duplicidade por empresa, texto livre, CSV sem fórmula, backoff da fila, chave e payload mínimo do evento, etapa analítica, esquemas `.strict()` (sem mass assignment, com versão, perda com motivo, importação), permissões do CRM por papel e telas mapeadas, `organizationId` dentro de todo filtro por relação do escopo |
| `tests/e2e/crm-api.spec.ts` | api | 25 | contrato `/api/crm/*`: liberação por empresa (desligado = 404 `crm_disabled`), pessoas (telefone mascarado, duplicado, idempotência, versão, entrada hostil), negócios (ciclo completo, corrida = 409, etapa de outro funil), isolamento entre empresas, escopo por papel (inclusive as contagens da lista de empresas), tarefas e visão geral, exportação e importação, limite por minuto, sincronização (oportunidade vira sugestão, D2), desfecho humano manda, LGPD |
| `tests/e2e/crm-f5.spec.ts` | api | 5 | F5: tarefa a partir de alerta e de item de recuperação (uma aberta por causa, escopo das telas de origem, contato excluído = 404, sugestão automática expira), negócios ligados a uma conversa |
| `tests/e2e/backup.spec.ts` › F8 | api | 2 | as 16 tabelas `Crm*` voltam do backup com as mesmas contagens; backup de antes da migração não quebra o ensaio |
| `tests/e2e/rbac.spec.ts` | api | (matriz) | cada rota do CRM por papel com o CRM desligado: quem pode recebe 404, quem não pode 403 |
| `tests/e2e/admin-crm.ui.spec.ts` | ui | 1 | operador liga e desliga o CRM no Admin, com confirmação e auditoria; desligar não apaga |
| `tests/e2e/crm.ui.spec.ts` | ui | 5 | quadro de negócios no navegador: criar, mover pelo menu (foco volta), pelo teclado e arrastando, gravado depois de recarregar; ganho e perda; axe em claro e escuro nas 6 telas, 3 detalhes e no diálogo; nenhuma rolagem lateral de 320 a 1920 px; T08.02 de ponta a ponta: empresa, pessoa, nota e negócio com HTML e script gravados aparecem como texto no quadro e nos detalhes, sem nó injetado, sem script rodando e sem diálogo |
| `tests/e2e/crm-f5.ui.spec.ts` | ui | 2 | "Tarefa no CRM" no alerta e na recuperação, sem duplicar; bloco "Negócios relacionados" na conversa; axe no diálogo e no bloco; com o CRM desligado, nada aparece (conferido com o menu já carregado), e o link direto `#crm-deals` volta à Visão geral |
| `tests/e2e/crm-matriz.spec.ts` | api | 52 | matriz T01–T12 da especificação (28 da F7, 12 da F9, 4 das lacunas da rastreabilidade, 5 da verificação dela e 3 da revisão da tarefa por causa), o que faltava nos outros arquivos: suspenso e bloqueado (T02.04), escopo do supervisor em lista, quadro, detalhe e painel (T02.05, T12.04), busca e importação de 1, 100 e 5.000 linhas (T03.02, T03.03), grupo, excluído e simulada em cada caminho (T03.04, T05.08), funil com negócio aberto, vários negócios por pessoa e valor no limite (T04), "se eu pagar" × "já paguei" e alerta que volta (T05), corrida e virada do dia nas tarefas (T06), dez rodadas sem duplicar, eventos fora de ordem e DLQ (T07), exclusão da empresa e injeção de instrução (T08), negócio com duas conversas no painel (T10), jornadas de ponta a ponta e plano vencido (T12). Na F9: isolamento em busca, filtro por ID, quadro com cursor de outra empresa, painel e exportação (T02.01, T10.04), ID de outra empresa = 404 em cada rota (T02.02), `organizationId` no corpo ou na URL = 400 e cabeçalho de empresa ignorado (T02.03), cadastro inválido e no limite exato (T03.01), duas edições na mesma versão (T04.04), telefone só cifrado no banco (T08.06), painel depois de reabrir e perder (T10.06), etapa só sugerida (T05.03), recuperação concluída (T06.02), tarefa do alerta não resolve o alerta (T06.03), desfecho humano manda (T05.06) e espera entre tentativas até a DLQ (T07.05). Das lacunas da rastreabilidade: fechar o negócio reflete na recuperação da conversa, com o motivo da perda (T06.02, CRM-07); `autoCreateDeals` ligado cria o negócio sozinho, desligado só sugere (CRM-06); o mesmo evento entregue 2, 10 e 100 vezes não repete sugestão, negócio nem tarefa, e outra versão da mesma oportunidade não abre segunda sugestão (T07.01); a exportação da empresa leva os vínculos sem a chave interna (CRM-11). Da verificação da rastreabilidade: `tenantId` no corpo e na URL = 400 sem gravar nada (T02.03); marcar ganho ou perda negado a analista e visualizador (403) e a atendente com negócio de outro responsável (404) (T04.05); uma tarefa por causa de alerta, aceita pela sugestão ou criada à mão, também quando o alerta volta depois de resolvido (T05.07, dois testes); com a criação automática ligada e uma tarefa aceita, a oportunidade e o alerta entregues 100 vezes não criam segundo negócio, sugestão nem tarefa (T07.01). Da revisão da tarefa por causa (T05.07): o falso positivo expira a sugestão dele e o alerta seguinte pede a sua; sugestão no prazo de outro alerta aberto segura a causa, e vencida não; o mesmo alerta reaberto pelo motor depois da tarefa concluída pede de novo, e recusada a sugestão não pede; com dois negócios na conversa, aceitar uma sugestão expira a do outro e sai uma tarefa só |
| `tests/unit/crm-matriz.unit.spec.ts` | unit | 6 | sem rede: `CRM_DISABLED=1` desliga tudo sem consultar o banco (T11.05), nenhum arquivo do CRM alcança o WhatsApp (T05.09), o gateway do WhatsApp (sessões, eventos e conexões) não envia, não marca lida nem abre a sessão como online (T01.03), log do CRM sem corpo, payload, nome, telefone, e-mail, token nem `e.message` (T08.04), as rotinas do CRM no agendador e no tick com o mesmo log, só o tipo do erro (T08.04), tela do CRM sem HTML injetado (T08.02, parte estática) |
| `tests/e2e/crm-reabrir.spec.ts` | api | 7 | CRM-03 · T04.05: reabrir exige motivo (vazio, curto, só invisíveis, acima de 500, controle e bidi = 400 com a mensagem do campo), o motivo vai para o histórico (`data.reason`, com quebra de linha) e não para a auditoria, negócio aberto = 409, versão velha = 409, atendente com negócio de outro responsável ou sem responsável = 404, desligado = 404 |
| `tests/e2e/crm-agenda.spec.ts` | api | 8 | CRM-04 · T06.01 · T06.05: `dueAfter` inclusivo e `dueBefore` estrito, `due=today|next7` no fuso da empresa (São Paulo e depois Manaus), "em andamento" conta como pendente e atrasada, filtro inválido = 400, `pending` recusado como situação gravada; atendente não troca responsável (403) nem vê tarefa alheia (404); reatribuir e concluir auditam campos, situação anterior e IDs de membro, sem texto; PATCH sem mudança real não gasta versão nem audita; visualizador e analista não podem ser responsáveis (400) |
| `tests/e2e/crm-telas.ui.spec.ts` | ui | 2 | T12.04 · CRM-09: menu "Comercial" de cada um dos 7 papéis contra `permissions.ts`, link direto para tela proibida volta à Visão geral e a API dá 403 (só desktop); CRM-10 · T12.01: o guia de Negócios abre na primeira visita, o "Próximo" fica inteiro na tela em todo passo, e o guia não volta depois de recarregar |
| `tests/e2e/crm-contatos.ui.spec.ts` | ui | 6 | CRM-01 · T03.01 · T03.02: novo contato pelo diálogo (telefone mascarado, gravado), cadastro inválido com erro no campo e nada gravado, repetido abre o existente, busca sem acento, por e-mail e por 4 dígitos, filtro de empresa; nova empresa com nome, CNPJ e site inválidos e CNPJ repetido; T12.04: atendente sem Importar, Exportar e Mesclar, e a importação dá 403 |
| `tests/e2e/crm-ajustes-visao.ui.spec.ts` | ui | 7 | CRM-09: interruptor de automação com volta quando o servidor falha; CRM-02 · T04.01 · T04.03: funil novo pelo diálogo com os erros de vazio, reordenar etapas com Subir e Descer, etapa com negócio aberto não sai; T12.04: gestor muda os Ajustes, supervisor e atendente recebem 403; CRM-08 · T09.05 · T10.01 · T04.07: Visão comercial vazia, estimativa separada do declarado, ganho sem valor não vira R$ 0,00, atalho para Tarefas; CRM-12: analista e visualizador só com números agregados |
| `tests/e2e/crm-dados-sugestoes.ui.spec.ts` | ui | 6 | CRM-11 · T03.03: prévia da importação com contagens e erro na linha, nada gravado antes de confirmar; T03.05: exportação desligada avisa e a API recusa, ligada baixa o CSV mascarado e o completo só com confirmação; gestor sem Importar e Exportar (403); CRM-06 · T05.03: aceitar e descartar sugestões, a de etapa mudada à mão não é aplicada; analista sem painel de sugestões (403); CRM-10: busca da Ajuda acha o artigo do CRM e abre o guia na tela |
| `tests/e2e/crm-reabrir.ui.spec.ts` | ui | 1 | CRM-03: "Reabrir" pede o motivo; vazio, curto e só invisíveis mostram o erro sem chamar a API; com o motivo reabre e a linha do tempo mostra o motivo com a quebra de linha; no celular o diálogo rola por dentro |
| `tests/e2e/crm-agenda.ui.spec.ts` | ui | 3 | CRM-04: com o navegador em Tóquio, Hoje, Próximos 7 dias e Atrasadas seguem o dia da empresa, e o prazo é mostrado e reagendado no horário de Brasília; «Editar tarefa» (título vazio não salva; título, responsável e Em andamento gravados); atendente edita a própria tarefa sem o campo Responsável |

## 3. Resultados

| Rodada | Data | Comando | Resultado |
|---|---|---|---|
| CRM unit + api | 31/10/2026 | `crm.unit` + `crm-api` | 48 passaram (24 + 24) |
| F5 API | 31/10/2026 | `crm-f5.spec.ts` | 5 passaram (47,2 s) |
| Unit depois da integração da F4 | 31/10/2026 | `ui-text`, `tours`, `system-tour`, `crm`, `role-descriptions` | 75 passaram (31,8 s) |
| Completa nº 3 | 31/10/2026 | unit + api + ui | 2554 passaram, 7 falharam (1 real, corrigida; 6 tempo esgotado), 14 pulados, 7 não rodaram (33,3 min) |
| Reexecução dos afetados | 31/10/2026 | arquivos com falha na nº 3 | 55 passaram (7,2 min) |
| Interface do CRM, desktop nº 1 | 31/10/2026 | `crm.ui` + `crm-f5.ui` (ui-desktop) | 1 passou, 5 falharam (7,2 min); entre elas, o quadro de negócios fazia a página rolar 530 px para o lado |
| Interface do CRM, desktop nº 2 | 31/10/2026 | idem | 5 passaram, 1 falhou (3,3 min): Visão comercial rolava 377 px em 320 e 322 px em 375 |
| Interface do CRM, desktop nº 3 | 31/10/2026 | idem | 6 passaram (3,2 min) |
| Interface do CRM, celular nº 1 | 31/10/2026 | `crm.ui` + `crm-f5.ui` (ui-mobile) | 3 passaram, 2 falharam, 1 pulado (7,9 min): o `openView` do teste não abria a gaveta logo depois de um diálogo fechar |
| Interface do CRM, celular nº 2 | 31/10/2026 | idem | 5 passaram, 1 pulado (2,5 min). O pulado é a varredura de larguras, que roda só no desktop |
| Interface do CRM, desktop nº 4 (helper novo) | 31/10/2026 | `crm.ui` + `crm-f5.ui` (ui-desktop) | 6 passaram (3,2 min) |
| Outros navegadores | 31/10/2026 | `CROSS_BROWSER=1`, `crm.ui` + `crm-f5.ui` em ui-firefox, ui-safari (WebKit) e ui-iphone (WebKit) | 17 passaram, 1 pulado (9,9 min). O pulado é a varredura de larguras no iPhone (`isMobile`); no Firefox e no Safari de desktop ela rodou e passou. Arrastar, teclado, axe em claro e escuro e a F5 passaram nos três |
| Contrato da API depois do ajuste de empresas | 31/10/2026 | `crm-api.spec.ts` | 25 passaram (1,5 min), com o teste novo das contagens e nomes na lista e no detalhe de empresas |
| Matriz T01–T12 nº 1 | 31/10/2026 | `crm.unit` + `crm-matriz.unit` + `crm-api` + `crm-f5` + `crm-matriz` | 87 passaram, 1 falhou (4,4 min). A falha era do teste (T11.05): o `expect(...).toBe(dublê)` da pré-condição chamava o dublê |
| Matriz T01–T12 nº 2 | 31/10/2026 | `crm-matriz.unit` + `crm-matriz`, com os `expect.soft` trocados por verificações normais | 32 passaram (3,2 min) |
| Interface nº 5 (com o XSS de ponta a ponta) | 31/10/2026 | `crm.ui` + `crm-f5.ui` + `admin-crm.ui` (ui-desktop, ui-mobile) | 12 passaram, 3 falharam, 1 pulado (6,3 min). O T08.02 de tela passou nos dois. As 3 falhas foram espera acima de 5 s com a CPU tomada (abaixo) |
| Interface nº 6 (CPU liberada) | 31/10/2026 | `crm.ui` (ui-desktop, ui-mobile) | 9 passaram, 1 pulado (4,5 min). Os 3 que falharam na nº 5 passaram sem mudança de código; o pulado é a varredura de larguras no celular |
| Interface por requisito (F9) | 31/10/2026 | `crm-contatos.ui`, `crm-ajustes-visao.ui`, `crm-dados-sugestoes.ui`, `crm-reabrir.ui`, `crm-agenda.ui`, `crm.ui`, `crm-telas.ui` (ui-desktop, ui-mobile) | 58 passaram, 2 pulados (12,3 min). Pulados, previstos: menu por papel e varredura de larguras, que rodam só no desktop. Primeira execução dos 5 arquivos novos, sem falha |
| API e unidade da F9 | 31/10/2026 | unit (`crm`, `crm-matriz`, `ui-text`); api (`crm-reabrir`, `crm-agenda`, `crm-api`, `crm-matriz`, `crm-f5`, `rbac`); `crm-f5.ui` e `admin-crm.ui` (ui-desktop, ui-mobile) | 1307 passaram (8,6 min), sem falha e sem reexecução. `crm-reabrir` 7, `crm-agenda` 8, `crm-matriz` 40 (com os 12 da F9), `crm-api` 25 |
| Completa nº 4 | 31/10/2026 (08:03–09:20) | unit + api + ui (desktop, celular e tablet), código da F9 | 3040 passaram, 4 falharam, 57 pulados, 11 não rodaram (1,3 h). As 4 falhas são tempo esgotado à espera do tick global: `nfse.spec:47` e `settings-effect.spec:56` (api) e `nfse.ui.spec:47` (desktop e celular). As duas primeiras já falhavam assim na linha de base da F0 (`reports/f0-testes.md`). Causa e correção abaixo |
| Medição do tick | 31/10/2026 | `crmTick` três vezes sobre a cópia do `test.db` do fim da nº 4 (`.tmp`, fora do Git) | 536 empresas no banco, 149 com o CRM ligado (deixadas pelos testes). A análise global leva cerca de 13,5 s; o CRM levava 4,8 s, metade em 740 gravações de checkpoint de rodadas sem linha nova. Com a regravação ociosa limitada a uma por minuto: 2,4 s e 0 gravações na rodada seguinte |
| Direcionada depois da correção do tick | 31/10/2026 | unit (`crm-matriz`, `crm`); api (`crm-matriz`, `crm-api`, `crm-f5`, `nfse`, `settings-effect`); `nfse.ui` (ui-desktop, ui-mobile) | 126 passaram (6,3 min), sem falha. Primeira execução dos 5 testes novos da rastreabilidade (`crm-matriz` 44, `crm-matriz.unit` 5). Os quatro testes que esgotaram o tempo na nº 4 passaram. Com menos empresas no banco que no fim de uma completa, esta rodada prova a correção, não a ausência do tempo esgotado sob a carga da completa |
| Comparação visual final (F9) | 31/10/2026 (09:47–10:01) | `design.ui` e `a11y.ui` isolados, com o banco recriado, como pede o `01-baseline-visual.md` | `design.ui` 12 passaram, 9 pulados (5,2 min); `a11y.ui` 5 passaram (2,8 min); tablet repetido, 3 passaram e 4 pulados (1,5 min). Das 121 capturas das telas antigas, 53 idênticas à F0 e 68 com diferença só de hora relativa, nome sorteado e momento da animação (`01-baseline-visual.md` › Comparação final) |
| T07.01 com 2, 10 e 100 entregas | 31/10/2026 | `crm-matriz` (api), `-g T07.01` | 2 passaram (54,8 s): as dez rodadas (10,3 s) e o mesmo evento entregue 100 vezes (24,0 s). Depois de o teste passar a contar também as tarefas: 1 passou (49,8 s; o teste em 28,7 s) |
| Outros navegadores, todas as telas do CRM | 31/10/2026 (10:10–10:39) | `CROSS_BROWSER=1`, os 8 arquivos `crm*.ui` (sem o `admin-crm.ui`) em ui-firefox, ui-safari (WebKit) e ui-iphone (WebKit) | 92 passaram, 2 falharam, 2 pulados (28,6 min). Os 2 pulados são a varredura de larguras e o menu por papel no iPhone. As 2 falhas são do mesmo teste (`crm.ui:29`) e do teste, não do produto: no Firefox a página recarregava antes de o arraste terminar de gravar a etapa; no Safari a seta apertada antes de o quadro medir as colunas não movia o card. Correção abaixo |
| Direcionada depois da verificação da rastreabilidade | 31/10/2026 (10:47–10:55) | unit (`crm-matriz`, `crm`); api (`crm-matriz`, `crm-api`, `crm-f5`, `crm-reabrir`); ui-desktop (`crm.ui`, `crm-f5.ui`) | 124 passaram, 1 falhou (7,8 min). Os 6 testes novos (5 na `crm-matriz`, 1 na `crm-matriz.unit`), a correção da tarefa por causa (T05.07) e os testes reforçados passaram na primeira execução. A falha foi a checagem nova do teclado em `crm.ui:29` no Chromium: o aviso "Movendo" já tinha sido trocado por "sobre a etapa" quando o teste leu. Passou a aceitar um ou outro |
| Quadro em quatro navegadores, depois da correção | 31/10/2026 (10:57–11:18) | `CROSS_BROWSER=1`, `crm.ui` em ui-desktop (Chromium), ui-firefox, ui-safari (WebKit) e ui-iphone (WebKit), `--repeat-each=2` | 38 passaram, 2 pulados (20,9 min), sem falha. O teste do quadro (teclado, menu e arraste) passou duas vezes em cada navegador. Os pulados são a varredura de larguras no iPhone (`isMobile`) |
| Direcionada depois da revisão do T05.07 | 31/10/2026 (11:34–11:40) | unit (`crm-matriz`, `crm`); api (`crm-matriz`, `crm-f5`, `crm-api`); ui-desktop (`crm-dados-sugestoes.ui`) | 120 passaram (5,6 min), sem falha. Primeira execução dos 3 testes novos e do reforçado da tarefa por causa (`crm-matriz` 52) |
| Completa nº 5 (código final) | 31/10/2026 (11:42–12:57) | unit + api + ui (desktop, celular e tablet) | 3046 passaram, 12 falharam, 57 pulados, 11 não rodaram (1,2 h). 8 falhas são do CRM no celular, todas `cadastro falhou com 429`: os testes novos do CRM criam empresa pelo cadastro público e a suíte passou dos 20 cadastros por hora do mesmo IP. As outras 4 são as de espera do tick global (`nfse.spec:47`, `nfse.ui:47` no desktop e no celular, `system-tour.ui:500` no celular). Os 11 que não rodaram são os testes seguintes dos arquivos `nfse` em modo serial |
| Direcionada das falhas da nº 5 | 31/10/2026 (12:59–13:11) | `crm-f5.ui`, `crm-reabrir.ui`, `crm-telas.ui`, `crm.ui`, `nfse.ui`, `system-tour.ui` (ui-desktop, ui-mobile) e `nfse.spec` (api), arquivos inteiros | 72 passaram, 2 pulados (11,6 min), sem falha. Inclui os 12 que falharam e os 11 que não rodaram na nº 5. Antes da rodada, `signupOrg` (`tests/e2e/helpers.ts`) passou a mandar um `x-forwarded-for` de teste (198.18.0.0/15) por cadastro; nenhum 429 no log |

O que as falhas dessas rodadas ensinaram:

- **Limite de cadastro por IP na completa nº 5:** o cadastro público aceita 20 por hora do mesmo IP
  (`SIGNUP_RATE_LIMIT_PER_HOUR`). Com os testes novos do CRM, que criam a empresa pelo cadastro, a suíte inteira
  passou disso, e os últimos a cadastrar (os de celular) receberam 429. É o limite do produto funcionando; a correção
  foi no teste: cada cadastro do `signupOrg` sai de um IP de teste próprio, como o `brute-force.spec` já fazia.
- **CPU tomada por processos alheios:** 13 processos `python3.exe -` órfãos (abertos entre 19 e 28/10, sem o processo
  pai) ocupavam os 12 núcleos da máquina. Na interface nº 5 três passos passaram dos 5 s de espera do teste, sempre na
  primeira chamada de uma rota (que o `next dev` compila nessa hora): o retrato da página mostrava "Carregando a
  empresa…" e "Confirmando…" no fim da espera, com a mudança já gravada. É a causa provável também dos 6 estouros de
  tempo da completa nº 3. Os processos não foram
  encerrados (não são desta execução); a prioridade deles foi baixada para "ociosa" em 31/10, e a rodada seguinte
  repetiu os mesmos testes.

- **Teclado e arraste fora do Chromium (`crm.ui:29`):** o teste soltava o arraste e recarregava a página sem esperar
  o `POST /stage`; no Firefox a recarga chegava antes da gravação. No WebKit, a seta para a direita apertada logo
  depois do espaço não movia o card, porque o quadro ainda não tinha medido as colunas. O teste passou a esperar a
  resposta da gravação (200) e a repetir a seta até o aviso do quadro (`role=status`) dizer a etapa de destino.
  O produto não mudou.
- **Página larga (quadro e Visão comercial):** defeitos reais do CRM, corrigidos em `painel-ajustes.css` (detalhe em
  `06-ux-e-design.md` § 7).
- **Arraste na coluna errada:** o teste arrastava numa janela em que a coluna de destino ficava fora da tela. Passou a
  usar 1920 px, a medir de novo a posição do destino antes de soltar e a conferir a etapa gravada.
- **Corrida na F5:** o teste lia o banco antes de o diálogo terminar de gravar. Agora espera o diálogo fechar.
- **Gaveta do celular:** quando um diálogo ou menu do Radix acaba de fechar, o resto da página ainda fica `aria-hidden`
  por um instante. O `getByRole('button', { name: 'Abrir menu' })` não achava o botão, o teste pulava a abertura da
  gaveta e o clique no item falhava ("element is outside of the viewport"). Diagnóstico medido no navegador: gaveta em
  `left: -264`, `aria-expanded="false"`, nenhum diálogo aberto 8 s depois. O app está certo (a pessoa toca no botão
  depois que o diálogo fecha); o helper `openView` (`tests/e2e/crm-ui.ts`) passou a decidir pela largura da janela, a
  esperar o botão e a só clicar nele com a gaveta fechada.
- **Seis faltas do produto achadas pela matriz** (escrita afirmando a regra certa, antes de qualquer correção), todas
  corrigidas antes da rodada nº 1 da matriz:
  1. Conversa de grupo virava negócio sem pessoa pela conversão manual. Agora responde 409 (`deals.ts`).
  2. Evento de oportunidade de contato excluído ou de grupo ia para nova tentativa até a DLQ. Agora é ignorado sem erro
     (`consumer.ts`).
  3. Empresa de simulação alimentava o CRM. A captura não lê mais essas empresas (`capture.ts`).
  4. Empresa bloqueada pelo plano seguia gerando eventos e sugestões. A captura pausa como a análise, com o cursor
     parado (`capture.ts`).
  5. O teto de valor (R$ 1 bilhão) não cabia na coluna de centavos e a rota respondia 500. O teto passou a R$ 20 milhões
     (`money.ts`).
  6. "Alerta criado" que chegava depois do "resolvido" abria sugestão de tarefa. Agora vale o estado de agora do alerta
     (`consumer.ts`).

  Junto, o log do CRM deixou de levar `e.message`, que no Prisma pode citar telefone ou e-mail da consulta: vai só o tipo
  e o código do erro (`errTag` em `log.ts`).

- **Tempo esgotado na completa nº 4:** os quatro testes chamam `/api/gateway/tick` sem empresa, que analisa todas as
  empresas do banco e depois roda o CRM de todas as que estão com ele ligado. No fim da completa o banco tem centenas de
  empresas criadas pelos arquivos anteriores, e as do CRM ficavam ligadas até o fim. A medição mostrou duas parcelas: a
  análise global (cerca de 13,5 s, código anterior ao CRM, a mesma causa da falha da F0) e o CRM (4,8 s). Do CRM, metade
  era regravar o checkpoint de cada empresa e recurso mesmo sem linha nova. Duas correções:
  1. Produto: a rodada ociosa só regrava o checkpoint uma vez por minuto (`IDLE_SAVE_MS` em `capture.ts`;
     `05-sincronizacao.md` § 3). Em produção a captura roda a cada 15 s, então isso tira 3 de cada 4 gravações das
     empresas paradas.
  2. Testes: `crmOffAfterFile()` (`tests/e2e/crm-cleanup.ts`) desliga, no fim de cada arquivo do CRM, as empresas que o
     arquivo ligou. Só age com um worker, como na configuração, quando nenhum outro arquivo roda junto.

  O custo da análise global sobre muitas empresas continua; não é do CRM e fica registrado como na F0.

## 4. Carga

Metas do § 13.4 da especificação: lista p95 ≤ 500 ms, mutação p95 ≤ 800 ms, evento da fila processado em até 60 s,
nenhum duplicado e nenhuma leitura de outra empresa. A medição chama direto no banco as mesmas funções que as rotas
`/api/crm/**` usam (`queries.ts`, `overview.ts`, `deals.ts`, `activities.ts`, `capture.ts`, `worker.ts`), sem servidor
na frente. Mede o banco e a regra de escopo, não a rede.

Como rodar (PowerShell, num arquivo dentro de `.tmp`; o script recusa `dev.db`, `test.db` e produção):

```powershell
$env:DATABASE_URL = "file:$PWD\.tmp\carga-crm.db"; bunx prisma db push --skip-generate
bun scripts/carga/semear.ts
$env:NODE_ENV = "production"; bun scripts/carga/medir-crm.ts
```

`semear.ts` é a base de carga do AtendeRadar (conversas, mensagens, alertas). `medir-crm.ts` semeia o CRM se faltar,
mede e grava `.tmp/carga-crm-resultado.json` e `.tmp/carga-crm-planos.txt` (o `EXPLAIN QUERY PLAN` de cada SQL
executado). Tempos de preparo nesta máquina: `db push` 7 s, `semear` 1 min 31 s, `medir-crm` 7 min 29 s.

Máquina: Windows 11, 12 núcleos lógicos, Bun 1.3.14, Node 24.13. Descoberto depois das medições: 13 processos
`python3.exe -` órfãos (abertos entre 19 e 28/10, fora desta execução) ocupavam um núcleo cada, e a CPU ficou perto
de 99% o tempo todo. Os números abaixo foram medidos com a máquina saturada; numa máquina livre devem sair menores.

### Volume declarado

| Onde | Membros | Empresas | Pessoas | Negócios | Tarefas | Conversas | Mensagens |
|---|---|---|---|---|---|---|---|
| Empresa grande do CRM | 30 | 2.000 | 10.000 | 5.000 (3.000 abertos, 1.200 ganhos, 800 perdidos) | 15.000 (6.000 abertas) | — | — |
| 20 empresas pequenas do CRM (cada) | 3 | 40 | 200 | 100 | 300 | — | — |
| Base do AtendeRadar no mesmo arquivo | — | — | — | — | — | 25.000 (20.000 na empresa grande) | 237.073 |

São 7.000 negócios no banco. A empresa grande do AtendeRadar (`org_carga_grande`) é a que alimenta a captura.

### Leituras (ms; 15 medições por cenário, depois de uma de aquecimento)

| Cenário | p50 | p95 |
|---|---|---|
| Negócios, lista (todos) | 25 | 102 |
| Negócios, busca por título | 34 | 41 |
| Negócios, por valor, página 40 | 46 | 57 |
| Negócios, carteira do vendedor | 29 | 39 |
| Quadro (todos) | 64 | 76 |
| Quadro (supervisor) | 64 | 107 |
| Quadro (vendedor) | 64 | 96 |
| Detalhe do negócio | 20 | 34 |
| Contatos (todos) | 20 | 37 |
| Contatos, busca por nome | 23 | 38 |
| Contatos (vendedor) | 25 | 47 |
| Contatos (supervisor) | 24 | 29 |
| Detalhe do contato | 24 | 46 |
| Empresas (todas) | 20 | 26 |
| Empresas (vendedor) | 58 | 89 |
| Detalhe da empresa | 18 | 29 |
| Tarefas abertas | 16 | 44 |
| Tarefas atrasadas | 35 | 52 |
| Tarefas do vendedor | 49 | 52 |
| Visão comercial (todos) | 74 | 92 |
| Visão comercial (supervisor) | 34 | 42 |
| Visão comercial (vendedor) | 20 | 25 |
| Estado da fila | 3 | 8 |

O pior p95 é 107 ms, contra a meta de 500 ms.

### Mutações (ms; 15 medições por cenário)

Cada uma é uma transação: registro, versão e histórico (`CrmDealEvent`). Mutação do CRM não passa pela fila, que só
leva o que vem da Auditoria para o CRM.

| Cenário | p50 | p95 |
|---|---|---|
| Criar negócio | 20 | 40 |
| Mover de etapa | 17 | 38 |
| Criar tarefa | 18 | 60 |
| Fechar como ganho | 21 | 40 |

O pior p95 é 60 ms, contra a meta de 800 ms.

### Captura e fila

Primeira captura da empresa grande, com o CRM recém-ligado e 20 mil conversas de histórico. Cada rodada lê até 2.000
linhas por recurso; o script repete até a rodada que não acha nada novo.

| Etapa | Tempo | O que saiu |
|---|---|---|
| Captura, rodada 1 | 40,7 s | 4.391 eventos (2.000 oportunidades, 2.000 alertas, 391 recuperações) |
| Captura, rodada 2 | 45,3 s | 4.400 eventos (2.000 oportunidades, 1.924 alertas) |
| Captura, rodada 3 | 17,0 s | 1.790 eventos (895 oportunidades com "detectada" e "estimativa mudou") |
| Captura, rodada 4 | 0,1 s | nenhum: acabou o histórico |
| Fila, esvaziar a janela inicial | 317,6 s | 10.581 eventos em 212 lotes, nenhum na fila de falhas, nenhum negócio criado (D2) |

A janela inicial anda a uns 33 eventos por segundo. É o pior caso, e só acontece uma vez por empresa. Por isso o atraso
dela é informativo e não entra na meta de 60 s.

Regime normal, numa segunda rodada sobre o mesmo banco:

- A captura de novo não emitiu nada (0 eventos em 160 ms): o que já saiu não sai de novo.
- 200 oportunidades abertas mudaram de estimativa: 200 eventos, todos processados em 10,6 s, nenhum pendente, nenhum na
  fila de falhas.
- Atraso de cada evento entre ser gravado e ser processado: **p50 6,0 s, p95 6,9 s** (meta 60 s). Na operação real some
  até 15 s, o intervalo da captura (`captureCrmChanges` roda a cada 15 s), e o pior caso fica perto de 22 s.

### Planos de consulta

Rodada limpa: 153 consultas distintas, todas com índice, menos uma. A exceção é um `SCAN` em `OrganizationMember`
(`memberForAgent`), que leva 0 ms: são os membros de uma empresa só, já filtrados pelo índice de chave única. A rodada
de regime normal repetiu o resultado com 152 consultas.

### O que a carga achou

- **Escopo lento com muitos dados:** a lista de contatos do vendedor levava 13,1 s e a de empresas do vendedor 17,1 s; a
  de empresas da equipe, 3,5 s. O filtro por relação do Prisma vira um `EXISTS` correlacionado, e sem `organizationId`
  dentro dele o SQLite não usava índice. A correção pôs `organizationId` dentro dos filtros por relação
  (`src/lib/crm/scope.ts`) e criou dois índices (`CrmPerson` e `CrmDeal` por empresa e empresa vinculada, migração
  `20261031140000_crm_indices_empresa`, só `CREATE INDEX`). Depois: p95 de 47 ms, 89 ms e 58 ms.
- **A captura não acordava a fila:** chamada direto, `captureOrg` grava os eventos mas não chama a fila; quem chama é
  `captureCrmChanges` (o ciclo de 15 s) e a reconciliação. Na operação isso está certo. A primeira versão do script de
  regime normal chamava `captureOrg`, e os eventos ficaram parados até o ciclo de 60 s da fila. O script passou a usar
  `captureCrmChanges`, como no servidor.
- **Rótulos errados no script:** a seção "fila · esvaziar" das mutações media uma fila vazia, porque mutação não usa a
  fila. A seção saiu, e o comentário explica o motivo.
- **Somas acima de R$ 21 milhões:** `_sum` do Prisma sobre colunas de centavos passa de 2^31 sem estourar (conferido
  contra a mesma soma em SQL: 3.670.946.400 nos dois). O teto de um valor só ficou em R$ 20 milhões (`MAX_AMOUNT_CENTS`).

Evidência: `.tmp/carga-crm-resultado.json` e `.tmp/carga-crm-planos.txt` (rodada limpa),
`.tmp/carga-crm-resultado-regime.json` e `.tmp/carga-crm-planos-regime.txt` (regime normal), fora do Git.
