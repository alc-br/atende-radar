# Baseline visual (F0-03)

Capturas de referência das telas atuais, tiradas antes de qualquer mudança do CRM. Servem para comparar depois: as
telas existentes não podem mudar sem aprovação (especificação, seção 4.6). Vale o que está aqui com comando e hash.

Resultado dos testes da mesma rodada: `reports/f0-testes.md` (passos 6 e 7).

## Referência congelada

| Item | Valor |
|---|---|
| Commit | `eac8042` (código igual ao do último deploy verde, `62ea82f`) |
| Worktree | durante as capturas, outro agente já tinha mudado `prisma/schema.prisma` e criado `src/lib/crm/`. O cliente Prisma não foi gerado de novo, não há migração nova e nada versionado importa os arquivos novos: as telas são as de `eac8042` (detalhes em `reports/f0-testes.md`) |
| Data | 31/10/2026, entre 00:02 e 00:13 (BRT) |
| Servidor | `next dev` (Next 16.4.1, Turbopack) na porta 3111, banco `prisma/test.db` recriado na hora |
| Navegador | Chromium 153.0.8010.12 do Playwright 1.63.0, em Windows 11 |
| Fontes | Inter (texto) e Plus Jakarta Sans (títulos), via `next/font/google` em `src/app/layout.tsx`. O `next dev` busca as fontes no Google; nesta rodada havia rede e as capturas mostram as fontes da marca (conferência visual, não automática). Sem esse acesso, o job `browsers` do CI de `eac8042` já falhou (`EXECUCAO-AUTONOMA.md`) |
| Dados | `prisma/seed.ts` + `prisma/seed-data.ts` (empresa OdontoVida, fictícia) e `tests/e2e/seed-test-orgs.ts` (Org A e Org B). Login `admin.a` da Org A |
| Conta vazia | criada na hora por `signupOrg()` (nome da empresa com sufixo aleatório) |

Todos os dados nas imagens são os fictícios do seed, que já está no repositório. Telefones de contato aparecem
mascarados pelo próprio app (`*****0001`). A tela de Configurações mostra o telefone, o CNPJ e o e-mail fictícios
da empresa do seed (`prisma/seed-data.ts`, linhas 22 a 29).

## Telas cobertas

As 11 telas do menu do painel, abertas pelo menu lateral (`[data-tour="nav-…"]`), com os tours marcados como vistos.

| Tela (`view`) | Título na tela | Item da especificação 4.6 |
|---|---|---|
| `dashboard` | Visão Geral | dashboard |
| `alerts` | Alertas | alertas |
| `conversations` | Conversas | conversas |
| `recovery` | Recuperação | recuperação |
| `team` | Equipe / Desempenho | equipe |
| `reports` | Relatórios | relatórios |
| `connections` | Conexões | conexão |
| `settings` | Configurações | configurações |
| `members` | Membros | — |
| `teams` | Equipes | — |
| `plans` | Planos e faturamento | faturamento |

Telas da especificação **sem captura** neste baseline:

- **Login.** O `a11y.ui` audita o login, mas não salva imagem.
- **Detalhe da conversa** e **perfil do atendente.** O `a11y.ui` audita os dois, sem imagem.
- **Checkout de faturamento** (`billing-checkout.ui.spec.ts`). Não rodou neste baseline.
- **Página de vendas.** O `landing.ui.spec.ts` salva `landing-<projeto>.png`, mas não rodou neste baseline.

## Larguras e temas capturados

Cada grupo tem as 11 telas, em página inteira (`fullPage`). Largura da imagem = largura CSS × densidade de pixels.

| Grupo (prefixo do arquivo) | Teste | Projeto | Largura CSS | Densidade | Imagem | Tema | Conta |
|---|---|---|---|---|---|---|---|
| `dados-ui-desktop` | design.ui | ui-desktop | 1280 | 1 | 1280 px | claro | com dados |
| `vazia-ui-desktop` | design.ui | ui-desktop | 1280 | 1 | 1280 px | claro | vazia |
| `largo1440-ui-desktop` | design.ui | ui-desktop | 1440 | 1 | 1440 px | claro | com dados |
| `largo1920-ui-desktop` | design.ui | ui-desktop | 1920 | 1 | 1920 px | claro | com dados |
| `reflow320-ui-desktop` | design.ui | ui-desktop | 320 | 1 | 320 px | claro | com dados |
| `dados-ui-mobile` | design.ui | ui-mobile (Pixel 7) | 412 | 2,625 | 1082 px | claro | com dados |
| `vazia-ui-mobile` | design.ui | ui-mobile (Pixel 7) | 412 | 2,625 | 1082 px | claro | vazia |
| `dados-ui-tablet` | design.ui | ui-tablet (iPad Mini, Chromium) | 768 | 2 | 1536 px | claro | com dados |
| `vazia-ui-tablet` | design.ui | ui-tablet (iPad Mini, Chromium) | 768 | 2 | 1536 px | claro | vazia |
| `light-ui-desktop` | a11y.ui | ui-desktop | 1280 | 1 | 1280 px | claro (forçado) | com dados |
| `dark-ui-desktop` | a11y.ui | ui-desktop | 1280 | 1 | 1280 px | escuro (forçado) | com dados |

Total gerado: 121 imagens, 46,8 MB (`design.ui`: 99 imagens, 39,4 MB; `a11y.ui`: 22 imagens, 7,4 MB).

O tema claro do `design.ui` é o padrão do app (`defaultTheme="light"` em `src/app/layout.tsx`), sem tema salvo, e o navegador do teste também está em modo claro. O `a11y.ui` força o tema gravando
`localStorage.theme` antes de abrir a página e confere a classe `dark` no `<html>`.

### Larguras da especificação (320, 375, 390, 768, 1024, 1440, 1920)

| Largura | Situação | Onde | Observação |
|---|---|---|---|
| 320 | **coberta** (só claro) | `reflow320-ui-desktop` | janela do desktop reduzida a 320×720; sem emulação de toque |
| 375 | **falta** | — | nenhum projeto usa 375 |
| 390 | **falta** | — | o celular dos testes é o Pixel 7, com 412 |
| 768 | **coberta** (só claro) | `dados-` e `vazia-ui-tablet` | iPad Mini em retrato, no Chromium |
| 1024 | **falta** | — | o desktop padrão é 1280; o iPad Mini não roda deitado |
| 1440 | **coberta** (só claro) | `largo1440-ui-desktop` | só conta com dados |
| 1920 | **coberta** (só claro) | `largo1920-ui-desktop` | só conta com dados |

Fora da lista da especificação, também há 412 (Pixel 7) e 1280 (desktop padrão).

**Tema escuro:** só existe em 1280 (desktop). Faltam escuro em 320, 375/390, 768, 1024, 1440 e 1920, e em celular
e tablet. A especificação (4.5) pede comparação claro/escuro em desktop, tablet e celular.

Para fechar as lacunas seria preciso mudar os testes (ex.: projetos novos ou larguras extras no `design.ui`, e o
tema escuro na varredura). Isso fica para a fase em que testes podem ser alterados; este baseline não mexeu em código.

## O que os testes verificam

### `tests/e2e/design.ui.spec.ts` (varredura de design)

Para cada uma das 11 telas, em cada largura:

- o título da tela aparece em até 15 s;
- a página não fica mais larga que a tela (compara `scrollWidth` com a largura real do aparelho);
- nenhum elemento visível de `main` passa da borda direita, fora de contêineres com rolagem própria;
- a partir de 1024 px, cartões lado a lado (`.kpis`, `.grade*`) não se sobrepõem (mais de 2 px);
- nenhum erro de página, nenhum erro de console (exceto favicon e aviso do React DevTools) e nenhuma resposta de
  `/api/*` com status 400 ou mais (exceto 401).

As checagens são `expect.soft`: o teste junta todos os problemas antes de falhar. Além da varredura:

- **Telas largas:** 1440×900 e 1920×1080, conta com dados, só no `ui-desktop`. Capturas só com `DESIGN_CAPTURAS=1`.
- **Reflow 320 px** (WCAG 1.4.10): 320×720, conta com dados, só no `ui-desktop`.
- **Menu no celular:** começa fechado e fora da tela, abre pelo botão, mostra os textos, fecha ao escolher uma tela
  e ao tocar no fundo.
- **Teclado:** chega ao item "Alertas" do menu só com Tab (até 40 toques), o foco é visível (contorno ou sombra) e
  Enter abre a tela.

### `tests/e2e/a11y.ui.spec.ts` (acessibilidade e temas)

Usa o axe (`@axe-core/playwright`) com as regras WCAG 2.0 e 2.1, níveis A e AA. **Falha só em violações críticas
ou sérias** (rótulo ausente, contraste, nome de botão etc.). O relatório completo de cada tela vai para
`test-results/a11y/*.json`.

- As 11 telas em tema claro e em tema escuro, conferindo que o tema foi aplicado. Salva uma captura de cada.
- Página de vendas (com movimento reduzido) e login.
- Detalhe da conversa, perfil do atendente e o diálogo "Adicionar membro" (espera a animação terminar).
- Conta nova vazia: dashboard, alertas, conexões, membros e planos.

**Resultado nesta rodada:** as 32 auditorias do `ui-desktop` saíram com lista vazia, ou seja, nenhuma violação de
nenhum nível (nem moderada nem menor). Conferido nos 32 JSON: todos têm o conteúdo `[]`.

## Estabilidade entre execuções

**Provado (hash):** as capturas claras de 1280 px do `design.ui` e do `a11y.ui` vêm de duas execuções separadas,
cada uma com o banco recriado. Em 8 das 11 telas os arquivos são idênticos byte a byte (alertas, conversas, equipe,
relatórios, conexões, configurações, membros e planos). Em 3 telas (dashboard, recuperação e equipes) as dimensões
são as mesmas, mas os bytes diferem.

**Inferência:** a diferença vem de dados relativos ao horário (o seed usa "há N horas"), de valores com data (ex.:
"Vale até" em Planos) ou de animação. Não investiguei pixel a pixel. Numa comparação automática, essas três telas
precisam de máscara nas áreas dinâmicas. A conta vazia muda a cada execução (nome da empresa aleatório).

## Detalhes que aparecem nas capturas e não são do produto

- **Indicador do Next em desenvolvimento** (círculo "N" no canto inferior esquerdo), por cima de "Preferências de
  cookies" no menu lateral. Só existe no `next dev`.
- **Menu lateral cortado na captura de página inteira:** no desktop o menu tem a altura da janela (800 px); abaixo
  disso a imagem mostra fundo vazio. É efeito provável da captura `fullPage` com menu fixo, não da tela real
  (inferência; não conferi rolando a página).

## Capturas guardadas no repositório

O total gerado (46,8 MB) passa do limite de 15 MB. Por isso ficaram só as telas principais da especificação (9 das 11:
sem Membros e Equipes), em três versões:

- desktop claro: `dados-ui-desktop-*` (do `design.ui`);
- desktop escuro: `dark-ui-desktop-*` (do `a11y.ui`);
- celular claro: `dados-ui-mobile-*` (do `design.ui`).

São 27 arquivos, 13,3 MB, em `docs/crm/screenshots/baseline/`, com o nome original. As outras 94 estão listadas no
fim deste documento com o hash, para conferência quando forem geradas de novo.

## Como regenerar

No worktree (ou em qualquer checkout, com outra porta), um Playwright por vez:

```bash
export E2E_PORT=3111
export TURBOPACK_ROOT='D:\ALC\clientes\alc\sistemas-proprios\atende-radar'   # só em worktree com node_modules em junção

# 1) varredura de design: 11 telas × (dados, vazia) × (desktop, celular, tablet) + 1440, 1920 e 320
DESIGN_CAPTURAS=1 bunx playwright test tests/e2e/design.ui.spec.ts --project=ui-desktop --project=ui-mobile --project=ui-tablet
cp -r test-results/screens test-results/screens-largas /algum/lugar/fora/   # o próximo Playwright limpa test-results/

# 2) acessibilidade e temas: 11 telas em claro e escuro (só desktop)
bunx playwright test tests/e2e/a11y.ui.spec.ts --project=ui-desktop
# capturas em test-results/screens/{light,dark}-ui-desktop-*.png; relatórios do axe em test-results/a11y/*.json

# 3) conferir com o baseline (Python 3 + Pillow; as pastas são as cópias dos passos 1 e 2)
python scripts/visual/comparar_baseline.py docs/crm/screenshots/baseline <screens do passo 1 e 2 juntas> <saída dos diffs>
python scripts/visual/comparar_hashes.py docs/crm/01-baseline-visual.md <cópia do passo 1> <cópia do passo 2>
```

Cada execução do Playwright apaga `test-results/` no começo. Copie as capturas do passo 1 antes de rodar o passo 2.

Para comparar: mesmo commit, mesmo Chromium, fontes baixadas e os mesmos dados do seed. Hash diferente não quer
dizer defeito: as três telas citadas em "Estabilidade" mudam de uma execução para outra. Diferença de dimensão ou
nas outras oito telas merece olhar.

## Comparação depois do CRM (flag desligada)

Pergunta: com o CRM pronto e desligado (o padrão de toda organização), as telas que já existiam mudaram?

| Item | Valor |
|---|---|
| Data | 31/10/2026, 05:02 a 05:13 (BRT) |
| Código | worktree `crm/integracao` com todo o CRM (F1 a F8) sobre `eac8042`, antes das correções visuais do CRM da mesma manhã (`06-ux-e-design.md`); essas correções só usam seletores `.ar .crm-*`, que as telas antigas não têm |
| Ambiente | o mesmo da referência: `next dev` na porta 3111, `prisma/test.db` recriado, mesmo seed, Chromium 153 do Playwright 1.63, Windows 11, fontes da marca baixadas |
| Execuções | `design.ui` (desktop, celular, tablet, 1440, 1920 e 320): 12 passaram, 9 pulados (os que só valem para outro projeto); `a11y.ui` (desktop): 5 passaram, nenhuma violação séria ou crítica |
| Ferramentas | `scripts/visual/comparar_baseline.py` (pixel a pixel contra as 27 guardadas; diferença acima de 16 em 255) e `scripts/visual/comparar_hashes.py` (hash e dimensão contra as 121 listadas neste documento) |

**Resultado nas 121 capturas:** 66 idênticas byte a byte, 55 com a mesma dimensão e bytes diferentes, **nenhuma com
dimensão diferente**.

**Nas 27 guardadas (pixel a pixel):** 20 idênticas. As 7 diferentes mudam menos de 0,1 % dos pixels, e o recorte
lado a lado mostra o que é:

| Captura | Pixels diferentes | O que muda |
|---|---:|---|
| `dados-ui-mobile-alerts` | 0,059 % | "3min atrás" virou "4min atrás" (7 cartões) |
| `dados-ui-mobile-conversations` | 0,005 % | "3min atrás" → "4min atrás" |
| `dark-ui-desktop-connections` | 0,082 % | "Último evento: 32min atrás" → "31min", "50min" → "49min" |
| `dados-ui-desktop-recovery` e `dark-ui-desktop-recovery` | 0,032 % e 0,035 % | horário da coluna de data: "00:02" (hora da F0) → "05:02" (hora desta rodada) |
| `dados-ui-desktop-dashboard` e `dados-ui-mobile-dashboard` | 0,036 % e 0,060 % | os pontos sobre as linhas do gráfico de evolução: na F0 a captura pegou o gráfico antes de o Recharts desenhar os pontos (fim da animação); agora pegou depois. A linha e os valores são os mesmos. Na versão escura o painel saiu idêntico |

`src/components/dashboard`, `src/components/connections` e `src/components/reports` não mudaram no branch
(`git diff origin/main` vazio). Alertas, conversas e recuperação ganharam botões do CRM, que só aparecem com o CRM
ligado e permissão de criar tarefas (`useCrmTaskAllowed`; telas em `06-ux-e-design.md` § 2).

**Nas 94 só listadas (hash e dimensão):** as 48 diferentes, todas com a mesma dimensão, são:

- 33 da conta vazia (`vazia-*`): o nome da empresa é sorteado a cada execução (já dito em "Estabilidade");
- 15 de telas com hora relativa ou gráfico animado: painel (4), recuperação (4), equipes (3), conexões (2), alertas a
  1440 px, relatórios a 1920 px. Conexões e relatórios mostram "há N min" (`connections-view.tsx` e `reports-view.tsx`).

Essas 48 não podem ser comparadas pixel a pixel porque a imagem da F0 não foi guardada (só o hash); a conclusão sobre
elas é inferência pela dimensão igual, pelo código sem mudança e pelo padrão visto nas 27. As capturas e os diffs desta
rodada ficaram fora do repositório (pasta temporária da sessão).

**Conclusão:** com o CRM desligado, nenhuma tela existente mudou de layout; as diferenças são de horário, de nome
sorteado ou do momento da animação do gráfico. A comparação com o código final está em "Comparação final (F9)", abaixo.

## Comparação final (F9)

Mesma pergunta, com o código final: todo o CRM (F1 a F9) e as correções da F9, com a flag desligada.

| Item | Valor |
|---|---|
| Data | 31/10/2026, 09:47 a 10:01 (BRT) |
| Código | worktree `crm/integracao` sobre `eac8042`, com o código que vai para o PR |
| Ambiente | o mesmo da referência (`next dev` na porta 3111, `prisma/test.db` recriado, mesmo seed, Chromium do Playwright 1.63, Windows 11, fontes da marca baixadas) |
| Execuções | `design.ui` (desktop, celular, tablet, 1440, 1920 e 320): 12 passaram, 9 pulados (5,2 min). `a11y.ui` (desktop): 5 passaram (2,8 min), nenhuma violação séria ou crítica. `design.ui` só no tablet, repetido para conferir uma captura: 3 passaram, 4 pulados (1,5 min) |
| Referência | as 27 guardadas, os hashes das 121 deste documento e as 121 imagens da F0, que ficaram copiadas na pasta temporária da sessão (fora do Git). Com essas cópias, desta vez as 121 foram comparadas pixel a pixel |

**Hash e dimensão (121):** 53 idênticas byte a byte, 67 com a mesma dimensão e bytes diferentes, 1 com dimensão
diferente: `dados-ui-tablet-connections`, 1536×2720 em vez de 1536×2928. Cada cartão de conexão mostra o botão
"Diagnóstico" só depois que `/api/connections/:id/health` responde (`connections-view.tsx`, sem mudança no branch), e a
captura do tablet saiu antes disso: três linhas de cartões sem o botão dão os 208 px da imagem (104 px de tela; o
tablet captura em dobro). Repetido só o tablet, a captura voltou a 1536×2928, e as 22 capturas do tablet ficaram com a
dimensão da F0. É corrida da captura, não do produto: o teste espera a rede ficar parada, e a chamada de cada conexão
sai depois que a lista chega.

**Nas 27 guardadas (pixel a pixel):** 18 idênticas; as 9 diferentes mudam menos de 0,1 % dos pixels:

| O que muda | Capturas |
|---|---|
| hora relativa ("34min atrás" → "33min", "espera 124min" → "123min") | conexões (desktop claro e escuro, celular), alertas e conversas no celular |
| horário da coluna de data da recuperação ("00:02", hora da F0, → "09:47", hora desta rodada) | recuperação (desktop claro e escuro) |
| momento da animação do gráfico de evolução: no celular a captura pegou a linha ainda sendo desenhada | painel (desktop e celular) |

**Nas 121 contra as imagens da F0 (pixel a pixel):** 53 idênticas, 68 diferentes, todas (fora a corrida do tablet) com
a mesma dimensão:

- 33 da conta vazia: nome e e-mail sorteados a cada execução (a coluna de e-mail de Membros muda de largura com eles) e
  a animação da linha do gráfico;
- 35 da conta com dados: hora relativa (conexões, alertas, conversas, painel, recuperação e o "Último acesso" de
  Membros, "31min atrás" → "30min"), o horário da recuperação, a animação do gráfico e, em Conversas a 1440 px e no
  tablet (até 0,85 %), as colunas da tabela andando 2 px porque a coluna "Espera" acompanha a largura do texto
  ("122min" → "121min"). Três delas (Equipes a 1280 e a 1920 px e Membros no tablet) têm de 0 a 4 pixels acima do
  limite de 16 em 255: suavização de borda, invisível no recorte.

**O que estas capturas não mostram:** o guia das telas. Os testes marcam todos os guias como vistos antes de capturar,
para o cartão não cobrir a tela. A mudança em `tour-overlay.tsx` (o cartão vai para o outro lado do alvo quando não
cabe, e o guia sem o último alvo fica gravado como visto) muda o comportamento das telas antigas nesse caso e espera o
OK do dono no PR (risco R6 em `QA-MESTRE-RESULTADO.md`). Também não mostram o rótulo do "X" dos diálogos ("Close" →
"Fechar"), que é só para leitor de tela.

**Capturas da completa nº 4:** não servem para esta comparação. Na completa, a empresa do seed acumula o que os arquivos
anteriores gravaram e as telas com dados crescem (49 capturas com outra dimensão; as da conta vazia mantiveram a
dimensão). Por isso o procedimento acima roda `design.ui` e `a11y.ui` isolados, com o banco recriado.

**Conclusão:** com o código final e o CRM desligado, nenhuma tela existente mudou de layout. As diferenças são de hora
relativa, de nome sorteado, do momento da animação e de uma corrida da captura, que a repetição desfez. As capturas e os
diffs ficaram fora do repositório (pasta temporária da sessão).

## Lista das capturas guardadas (27)

Pasta `docs/crm/screenshots/baseline/`. Tamanho em KB; imagem em pixels (largura × altura).

| Arquivo | Tamanho (KB) | Imagem (px) | SHA-256 |
|---|---:|---|---|
| `dados-ui-desktop-alerts.png` | 465 | 1280x2914 | `46c54582d70cf31def222f57f9e42b1bd8455d394ce9976348a4405a6e2aa637` |
| `dados-ui-desktop-connections.png` | 251 | 1280x1073 | `90f52c3fede63fa4d110fb583eec84b9020465c48e09b9a2c3fcdb36d7446a05` |
| `dados-ui-desktop-conversations.png` | 362 | 1280x1643 | `e0f4ea6bf26b7d415f573616e3f06a1840f5ef233189444728da922f160076e7` |
| `dados-ui-desktop-dashboard.png` | 540 | 1280x2811 | `fc9159b4b48b96bcc86f932227179c9a1a6ac498c3f21bd37d21653f11c32914` |
| `dados-ui-desktop-plans.png` | 315 | 1280x1634 | `83dda39f82ff1a579cdee5900fff6d2030bd3595399d18bbc6e4347f7260a2a4` |
| `dados-ui-desktop-recovery.png` | 275 | 1280x1135 | `82b5bd2a1c5f6c048ad142da4805818b34c04b8ea181d81e2ef699374b8d5846` |
| `dados-ui-desktop-reports.png` | 290 | 1280x1185 | `535196008bdcd1d4e645aa844dc14978d2c3df4b78e043b8777abff8e4b14e41` |
| `dados-ui-desktop-settings.png` | 246 | 1280x1252 | `b0d1cec6908c54a848c9a99863a72bd1deebed65901fed706398d81d18f3e02f` |
| `dados-ui-desktop-team.png` | 376 | 1280x2077 | `680606960fe92db798abdbede9cbc64184350168af05cc38524f671b8d1eb12b` |
| `dados-ui-mobile-alerts.png` | 1161 | 1082x13409 | `5ad0abb1cc1639d35a73b233b89fcc5d8f42f2c05482052a9934e0d179382a78` |
| `dados-ui-mobile-connections.png` | 687 | 1082x7337 | `eae65daf6afd756f9b998835072f54dc38688651fe6f2402909767c7a9c6960c` |
| `dados-ui-mobile-conversations.png` | 548 | 1082x5838 | `5a7c8196a61e7db983a923d1d10fe3d1173e2c8796fe2092f4239cb36b89bb83` |
| `dados-ui-mobile-dashboard.png` | 1246 | 1082x10928 | `14cd67426f30db1d2b5065519f8a2f2c6f4cb286345b8924a079c0709bfdad49` |
| `dados-ui-mobile-plans.png` | 668 | 1082x7156 | `070946a97db28694c6e2768c63548a7ac03586f2d736dafc3820fd686d24658a` |
| `dados-ui-mobile-recovery.png` | 421 | 1082x5166 | `1d3b4ac7b2498e8111ae753088c818ab46037938bdefcb7aebbf8e53a9c41be9` |
| `dados-ui-mobile-reports.png` | 750 | 1082x9059 | `2e842b895f95144b379f07be33150863dc90e189976ec0bd94c2779387f9fe12` |
| `dados-ui-mobile-settings.png` | 427 | 1082x5326 | `1453f0d595be3ce9ef380d77c4026b21bdbf535ef7a6a2a3a8afa28273961506` |
| `dados-ui-mobile-team.png` | 844 | 1082x8474 | `e7e12b6841a7a59323d9da92b9f7fb5b66ffac4017373fa92ca4bc0cb5948569` |
| `dark-ui-desktop-alerts.png` | 467 | 1280x2914 | `ab007def15867b6c3e552816f3a811fdacb8bee6c90ba77391ca7244bbf9eb71` |
| `dark-ui-desktop-connections.png` | 252 | 1280x1073 | `4256ac486309d54d81ad200cee6316cc3607a4b4f330637727c008f20c75f88c` |
| `dark-ui-desktop-conversations.png` | 367 | 1280x1643 | `d009362b81933970049cd839b371aaa7077af53745f3bc6a5db046c1eea97c4e` |
| `dark-ui-desktop-dashboard.png` | 551 | 1280x2811 | `b70e7fcf9c35056f42d7fd6b5e1c131e53cfa2ac656b1bf3be6ab41be4f81694` |
| `dark-ui-desktop-plans.png` | 313 | 1280x1634 | `2d4201bd041d33dc8f928d7f93bf0d57eb362797580a3c54ab6fce2a4e9931c9` |
| `dark-ui-desktop-recovery.png` | 277 | 1280x1135 | `2d929a587e4cbfd64fc853776d2aa25fbfcda9b518ea3dfbb1cbdc2060cbbc57` |
| `dark-ui-desktop-reports.png` | 287 | 1280x1185 | `8eb33c6f1d1220e1fc3d10ba42efcd04b1ecae8767a52f808ae3e2cbfac3f132` |
| `dark-ui-desktop-settings.png` | 245 | 1280x1252 | `4ee38ee67631551deb5ecbcba2e500a12ea91c31dfa3cdc0291e38352ceb6082` |
| `dark-ui-desktop-team.png` | 379 | 1280x2077 | `59a309c5f91d1ca524f1b24c9280f990d5ff821db701974f6a0d836f40b9c0d3` |

## Demais capturas geradas e não guardadas (94)

Formato: SHA-256, imagem em pixels, bytes, origem. `design/` = `design.ui` (`test-results/screens` e `test-results/screens-largas`); `a11y/` = `a11y.ui` (`test-results/screens`).

```text
ed78ca5f7dad4600d37620940effaf47f0d0a7b37adb2af36432d927d8849474  1280x1324    291440  design/screens/dados-ui-desktop-members.png
02ff5501d8dbabe20b9ed9297bf3ece457d6d72e5f2b727e4e606d139cf5b784  1280x800    203951  design/screens/dados-ui-desktop-teams.png
a8e634640b9655541218a24ecd386c2fee2a62b3a3bf6f163fcf2f073ee31745  1082x4392    469890  design/screens/dados-ui-mobile-members.png
7ca67750e2bf7bcc8a59106469a239ed626553be9eb26ff4db250f43f09f7de1  1082x3691    323493  design/screens/dados-ui-mobile-teams.png
9946ca6def04a28b2b54c2056d66a5427f76133187469455e24ac613de162fce  1536x5884    834360  design/screens/dados-ui-tablet-alerts.png
33faff6c2ff88fb9a2859d610f3c023739fdeee90509b17d6cd57855e179e6df  1536x2928    398399  design/screens/dados-ui-tablet-connections.png
e0a2b59ba3fee0e2fcd4075327e62b8e7bc4b63ebf9b7a093811f1bfcb3cab88  1536x3434    499377  design/screens/dados-ui-tablet-conversations.png
df3bfcc8bb59c53cb860d2238aa537ece7a0846643dd5e44b3a61861e86a3c29  1536x6672   1035511  design/screens/dados-ui-tablet-dashboard.png
b0e9e6b602449f3d998104f7f3f02c476a5455d808903799b720db81b10c75be  1536x2704    410169  design/screens/dados-ui-tablet-members.png
361c3248b5f68e25143a9bb9f2434e3d14339ac783409f724d7e166ac8761607  1536x4402    516180  design/screens/dados-ui-tablet-plans.png
a163a83a19afea708e5d2b6a12b339cd66312ea6fd6ca197cd27c0a3b8642908  1536x2790    384619  design/screens/dados-ui-tablet-recovery.png
5deba36819dbcf68bcc15c8cf729d83551a576b44f44b76a873bffada8cf8b05  1536x3674    453571  design/screens/dados-ui-tablet-reports.png
0cfcd103b3edbc844b459262316e7694fe0751ba6c9963f459be6165052183d8  1536x2626    322975  design/screens/dados-ui-tablet-settings.png
8766efceb49bb00f8aa4072224c1ddb6739e70c9c13965995ea490b0e58fbe2c  1536x4764    610708  design/screens/dados-ui-tablet-team.png
43f8b67dbfd5ddb70bc0ce89d1e701323e9695fe50deaf6f588e15f0fe8f579a  1536x2048    221761  design/screens/dados-ui-tablet-teams.png
59cf7fe00def35bcdfbc4e7bcbe26e7cc92258b974c4c7593e55638c0a59b99d  320x6461    381855  design/screens/reflow320-ui-desktop-alerts.png
73146eaeba65b1e07d38d2aae950159fd705dd62464aa8539f0333855302f1d0  320x3037    204308  design/screens/reflow320-ui-desktop-connections.png
e733ae14844767fcaf14fa6f7b8ed74c90c135d67cdbaa36e51068c390ad90cd  320x2366    174134  design/screens/reflow320-ui-desktop-conversations.png
1fb3683e106eef75db83dab7086e15b88d249749f1b8a9111360a5bb662d4590  320x4372    336807  design/screens/reflow320-ui-desktop-dashboard.png
a5a668b28ad864ec035b55656771da478d55cc7661663fac23225e8024f95632  320x1741    125088  design/screens/reflow320-ui-desktop-members.png
8a242b3bc5e0e9194d979540e30b53a67c5c81ce7b1ac3185ed2250f0828860c  320x2901    198964  design/screens/reflow320-ui-desktop-plans.png
29a5059caba2663e729590fb7d13b2674c5c752926ad2c893e351f03a442edd7  320x2065    125439  design/screens/reflow320-ui-desktop-recovery.png
b063c6d78c436effbd4666106f613354eec567a97a2056f9270d4dbba715c159  320x3532    240783  design/screens/reflow320-ui-desktop-reports.png
51de8ac55031c03393966d231d0c3b9a9fc7ccf302846ac8dc375827ec015efe  320x2112    134408  design/screens/reflow320-ui-desktop-settings.png
8228d12e23b8f27d35ebc44c07be08bd2ee77fad48b990d01a463fd840d3f8d2  320x3558    258264  design/screens/reflow320-ui-desktop-team.png
7595c0bfb0d6a2ed9cb6a29636137af8649a965f45804bf2d611ff465b793217  320x1550     98808  design/screens/reflow320-ui-desktop-teams.png
38ad6794c52bfe66e8ad3e910b90febdf8a4ce1a4d7195ab1f4a950844b8aac3  1280x1006    209144  design/screens/vazia-ui-desktop-alerts.png
b97853870f8a9a3b0e1c70dbf24c2ecb30272d7bbc51335f193b1c529539de94  1280x800    201173  design/screens/vazia-ui-desktop-connections.png
e090795ece193cd9bda7e174647e3c48a3ea6d22f23cf3d5f43ee9a3a84268b4  1280x920    204620  design/screens/vazia-ui-desktop-conversations.png
d80c29cb9876e3a0c52b9e16db5aadbdbba08d23b199d0e190b3a580ca771eb2  1280x2595    442407  design/screens/vazia-ui-desktop-dashboard.png
3a77889212f197b841b77998446f9f8294fefab996c55ab2b36c29e88c1d9190  1280x800    199300  design/screens/vazia-ui-desktop-members.png
25036e91ba5b15897802a9dd8e4056f1e7cb440ca9c99d1ca1524b215679b661  1280x1712    341002  design/screens/vazia-ui-desktop-plans.png
b18c87e736c76e60ed5564e7020f9856517cd521e3422742677469b82f8e441b  1280x883    230379  design/screens/vazia-ui-desktop-recovery.png
75e9ea5a9aea7990ef5993a132dd9a91f36e42ba6a239584182cc766fcb96613  1280x1224    299471  design/screens/vazia-ui-desktop-reports.png
fd43d9235e21c041ee1eeaf728d09c7bdace6145447031ae51081748c2503f94  1280x1330    258391  design/screens/vazia-ui-desktop-settings.png
8a9f718073eea481ed7e9dc9aa3bd5d99ceebaf0de716c30fa5529019ce2bc08  1280x1063    237100  design/screens/vazia-ui-desktop-team.png
577bd8313613fbcfe722069a0b0d22eafef65f99d8a9a6bd4d3e4d03e4189dbc  1280x800    194436  design/screens/vazia-ui-desktop-teams.png
881c26566949ad06ff014f4f21adad313928ac61ef5b10934c57311b3f25fbf4  1082x3560    298505  design/screens/vazia-ui-mobile-alerts.png
616a2b63edab7f974f3514d156c2770b96f9f20a10c9e588a468ea351f569c03  1082x3583    308251  design/screens/vazia-ui-mobile-connections.png
23a5599090fcc5bb7aebddadacdf25361b6bddea32aa9cf7d9aa93d740631da4  1082x2636    224696  design/screens/vazia-ui-mobile-conversations.png
a0fee16e3d5436b890a6d9b25e8c8f8eb0e51ee3436f93303e09ccba783c1557  1082x10849   1158883  design/screens/vazia-ui-mobile-dashboard.png
e6972ebb0a72dbb66b1038adae4493f3377c3f389a7e175ebc032f9d8be68e7c  1082x2615    262648  design/screens/vazia-ui-mobile-members.png
9d454c0f619530746a8de579652020141e67ff6a1eb3a0b9cac53aa40a20cb75  1082x7704    737982  design/screens/vazia-ui-mobile-plans.png
e929a61e8464fc45d0c4d4676f81a183a96c3be35dd57bbc114f4e7f8f5449b5  1082x4641    371080  design/screens/vazia-ui-mobile-recovery.png
1c344fef7a116fdb7cd10da683289b7d0b5e4b4d86fc96a9b135ca7d2997f58f  1082x9400    780701  design/screens/vazia-ui-mobile-reports.png
204e46d7c67b4354e91daec7c49d6f06687b18154cd14d4c76f51557d6eeffeb  1082x5667    455255  design/screens/vazia-ui-mobile-settings.png
6f10511c0ea4c682796ecf87bf34a6fbd2477887ddcbd569696f593d6a28bef3  1082x4331    391451  design/screens/vazia-ui-mobile-team.png
14fae6387b1165d42870c65bb809ee09ee5288db1f3e99da4077ee6b1405bf85  1082x3326    279843  design/screens/vazia-ui-mobile-teams.png
8dd070bdc14c96392e4a1c1a4d69f161664c100b4e1f1c4de5dcb2a82b153da7  1536x2068    228693  design/screens/vazia-ui-tablet-alerts.png
fcbc631e90538c5250ab7718e0d7b2682014d5ca1f3cb5f6dc073f034b69d13c  1536x2048    221636  design/screens/vazia-ui-tablet-connections.png
193916c03ddcf896e1d37881b0fb4db564a66939922978b228e1db13dddc32ab  1536x2048    221400  design/screens/vazia-ui-tablet-conversations.png
ed3735b04e27798aadb0e2c32120570e9e567e0301ced240e1ce60b7aa350e8f  1536x5982    814373  design/screens/vazia-ui-tablet-dashboard.png
2335cf20346fbf1bc3f613dd037b431fc830bb7f9cbd956967ccec759a553e40  1536x2048    204927  design/screens/vazia-ui-tablet-members.png
6ac64cf56024a91d6562ccf18951e3419a00d04320e3da0c2e55b43efd3a0cf5  1536x4628    535815  design/screens/vazia-ui-tablet-plans.png
feeea7056a1a63b0522c3fa9651c666189b0aec4df5b015882556497122d97d6  1536x2286    283023  design/screens/vazia-ui-tablet-recovery.png
1c1000e24a939fa5cf6a0c0bc7828b3b29ae57292a12b6a2cbaaf6832e8da6e3  1536x3830    457316  design/screens/vazia-ui-tablet-reports.png
6771477e1663e316ef210e873dfa8e42dd20f9d3cab7eec36947540b71c1f93e  1536x2782    334746  design/screens/vazia-ui-tablet-settings.png
d0b114115c01f60c38961ae20401faf39fb9ee844fa8d89ea2cdf4ab21b5e5c8  1536x2496    299808  design/screens/vazia-ui-tablet-team.png
83c4956cc9751ea4722b712f8ae5ce79982a81d164fd9ca478b9846a7e11f258  1536x2048    206773  design/screens/vazia-ui-tablet-teams.png
14618c747af9f49b972d162eee144ce92be4ab6f69d1dde71173d7cf1753b8dd  1440x2380    488341  design/screens-largas/largo1440-ui-desktop-alerts.png
ca1dd92d38d5c62ec2f68a42541e07c266f61422e728bb62bcbb474a68b8b40e  1440x1057    309103  design/screens-largas/largo1440-ui-desktop-connections.png
e6bc885c37aa55be7aaa762465e2ae74b4996fcf306ebd5786224d70cef6c267  1440x1643    409283  design/screens-largas/largo1440-ui-desktop-conversations.png
655650f2d1f21195b0a5144b3da7296eb14195428c7a9b9f409b80c66fdee7ec  1440x2620    576108  design/screens-largas/largo1440-ui-desktop-dashboard.png
2ef445c9c959832ef4d9599e69c8d7fe3ab740ad6cca55083ace53eb98c5f9c9  1440x1324    307538  design/screens-largas/largo1440-ui-desktop-members.png
9cc34095c50982696fd4f8b8de2e6da848fcc390e0d32407dfed1e67751f36f4  1440x1615    336072  design/screens-largas/largo1440-ui-desktop-plans.png
e95a6e539852db1643081107c942a4b54800f810e1bfff07a33f4fcd8cb4ac0e  1440x1104    302844  design/screens-largas/largo1440-ui-desktop-recovery.png
2c8819210a47ae3433e69c52f96aa032f5999b04505950ee778ca7dccba214ab  1440x1092    310016  design/screens-largas/largo1440-ui-desktop-reports.png
a74b4512a35d9c7898679f0c293bb31a5bc32b8f0ab5348de2be8f16f05fec0a  1440x1252    270566  design/screens-largas/largo1440-ui-desktop-settings.png
77e3a1df4cda39004e27b7c12a83afa8e3f3d4f830f1295ed00495dcdf98e134  1440x2197    416911  design/screens-largas/largo1440-ui-desktop-team.png
c9f52d08ba8bf0b439d4f5542a48961ab6cfb2ef41ef656fa081ab3fa8b935ed  1440x900    222164  design/screens-largas/largo1440-ui-desktop-teams.png
305202a0dd9b6a8673c77849f3f3bcc848f97008b1d563ae8bd80d0c89d2b622  1920x2359    515327  design/screens-largas/largo1920-ui-desktop-alerts.png
187a64c6ff2818aea3b33f95ff1345ad6f44e396b5e39f580612ea93ae7f99cf  1920x1080    316742  design/screens-largas/largo1920-ui-desktop-connections.png
123d7ce0fcb350a9ba49a0a15b280216859b54d6947d5e8076f52ee2f9c4eb87  1920x1546    501752  design/screens-largas/largo1920-ui-desktop-conversations.png
d0e4dab0fef138b115ea7f2190907ef7c218d72133bd5033ed2547aa97a82879  1920x2599    614941  design/screens-largas/largo1920-ui-desktop-dashboard.png
5f9a849de4821fe8ecf40aa0481170e2f13ea7ff47ed748c888c3955de4bd9dc  1920x1303    328677  design/screens-largas/largo1920-ui-desktop-members.png
e740197434d28bbee1e646509098014729777114576b1c370c4afe9cb57c64b6  1920x1594    360392  design/screens-largas/largo1920-ui-desktop-plans.png
bc5deab512ff361bb2eea94d71feb914bcbe2d76da08425e9e006877e8bf150f  1920x1080    313200  design/screens-largas/largo1920-ui-desktop-recovery.png
b17a73033b516b84b0a99f32f41462c399457ae2e6de6666cd2dd90c73ea05f0  1920x1080    316576  design/screens-largas/largo1920-ui-desktop-reports.png
6256090096449ee55dc2dc2357edfc57950f7d8657821d88e388c8193ab9e34f  1920x1231    291646  design/screens-largas/largo1920-ui-desktop-settings.png
61961b041ac3484a90927efe32e56188e2c543d955582c5a4b34054e6d836dbf  1920x1955    416359  design/screens-largas/largo1920-ui-desktop-team.png
fed436fbff34a5cd528fcba6e674fd1b3207366940d579226d45a252f236dfb8  1920x1080    240276  design/screens-largas/largo1920-ui-desktop-teams.png
536cbc53050c96308b16a445c8022994aa14c6a8c0bad61311f68eff8ce46d94  1280x1324    289739  a11y/screens/dark-ui-desktop-members.png
b59a10f0eb06b54c0b02c0fc14f33e3b061dee82aacbaf96f3263a892736de23  1280x800    204193  a11y/screens/dark-ui-desktop-teams.png
46c54582d70cf31def222f57f9e42b1bd8455d394ce9976348a4405a6e2aa637  1280x2914    476859  a11y/screens/light-ui-desktop-alerts.png
90f52c3fede63fa4d110fb583eec84b9020465c48e09b9a2c3fcdb36d7446a05  1280x1073    257710  a11y/screens/light-ui-desktop-connections.png
e0f4ea6bf26b7d415f573616e3f06a1840f5ef233189444728da922f160076e7  1280x1643    370802  a11y/screens/light-ui-desktop-conversations.png
34964987c6d923a5384466ce0436b3f9c144c8da6a801582ef62c3fcf3ba1851  1280x2811    560319  a11y/screens/light-ui-desktop-dashboard.png
ed78ca5f7dad4600d37620940effaf47f0d0a7b37adb2af36432d927d8849474  1280x1324    291440  a11y/screens/light-ui-desktop-members.png
83dda39f82ff1a579cdee5900fff6d2030bd3595399d18bbc6e4347f7260a2a4  1280x1634    323510  a11y/screens/light-ui-desktop-plans.png
08a02d996f541217000ad72e9f02ceb498ff9a4f9a5ed6f07b47793037e60185  1280x1135    281830  a11y/screens/light-ui-desktop-recovery.png
535196008bdcd1d4e645aa844dc14978d2c3df4b78e043b8777abff8e4b14e41  1280x1185    297554  a11y/screens/light-ui-desktop-reports.png
b0d1cec6908c54a848c9a99863a72bd1deebed65901fed706398d81d18f3e02f  1280x1252    252734  a11y/screens/light-ui-desktop-settings.png
680606960fe92db798abdbede9cbc64184350168af05cc38524f671b8d1eb12b  1280x2077    385854  a11y/screens/light-ui-desktop-team.png
dbc96a2c3efc3a301975ddf4b0b8c7400eeecf69e00aa1e0aa1fdc9cad9a38a4  1280x800    203948  a11y/screens/light-ui-desktop-teams.png
```
