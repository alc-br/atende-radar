# Licenças das dependências (baseline F0)

Gerado em 30/10/2026 por um script próprio (sem ferramenta baixada) que lê o `package.json` de cada pacote instalado em
`node_modules` (escopos `@x/y` e `node_modules` aninhados). Commit de referência `eac8042`, branch `crm/integracao`.
O SBOM correspondente está em `sbom-baseline.json` (CycloneDX 1.5).

Base: licença **declarada** no `package.json` (campo `license` ou `licenses`). Não li o texto de cada LICENSE,
exceto para pacote sem licença declarada (aí a leitura do arquivo é marcada como inferência).

## Números

| Item | Valor |
|---|---|
| Pacotes únicos (nome@versão) | 909 |
| Cópias instaladas (contando aninhadas) | 928 |
| Dependências diretas (package.json) | 88 de 88 encontradas no topo de `node_modules` |
| Alcançados a partir de `dependencies` | 590 |
| Só a partir de `devDependencies` | 318 |
| Não alcançados por nenhuma das duas | 1 |
| Entradas no `bun.lock` | 1033 |
| No `bun.lock` e não instalados | 125 (117 são de outro sistema/CPU) |
| Instalados e fora do `bun.lock` | 1: `zod@4.3.5` em `node_modules/eslint-plugin-react-hooks/node_modules/zod` |
| No `bun.lock`, não instalados e sem `os`/`cpu` no lock | `@emnapi/core@1.8.1`, `@emnapi/runtime@1.11.3`, `@emnapi/wasi-threads@1.1.0`, `@img/sharp-wasm32@0.35.5`, `@napi-rs/wasm-runtime@0.2.12`, `@tybys/wasm-util@0.10.1`, `@emnapi/runtime@1.8.1`, `@napi-rs/wasm-runtime@1.1.1` |

"Alcançado" = existe caminho de dependência a partir do `package.json` do app, resolvido como o Node resolve
(aninhado primeiro, depois para cima), seguindo `dependencies`, `optionalDependencies` e `peerDependencies` não
opcionais. É um teto: o build `standalone` do Next copia só o que o rastreio de arquivos encontra, que é menos.

## Contagem por licença declarada

| Licença | Pacotes |
|---|---|
| `MIT` | 774 |
| `ISC` | 42 |
| `Apache-2.0` | 41 |
| `BSD-3-Clause` | 21 |
| `BSD-2-Clause` | 8 |
| `MPL-2.0` | 5 |
| `0BSD` | 2 |
| `BlueOak-1.0.0` | 2 |
| `CC0-1.0` | 2 |
| `Unlicense` | 2 |
| `(BSD-3-Clause OR GPL-2.0)` | 1 |
| `(MIT AND Zlib)` | 1 |
| `Apache-2.0 AND LGPL-3.0-or-later` | 1 |
| `Apache-2.0 AND MIT` | 1 |
| `CC-BY-4.0` | 1 |
| `GPL-3.0` | 1 |
| `MIT AND ISC` | 1 |
| `Python-2.0` | 1 |
| `SEE LICENSE IN ./LICENSE` | 1 |
| `W3C-20150513` | 1 |

## Copyleft, restritivas e sem licença

Critério: GPL, AGPL, LGPL, SSPL, BUSL, EUPL, CC-BY-NC, `UNLICENSED`, `SEE LICENSE IN` e sem licença declarada.
Expressão com `OR` conta pela opção mais branda (ex.: `MIT OR GPL-3.0` = MIT); com `AND`, pela mais restritiva.
A lista abaixo traz também as duplas com `OR` que citam GPL, para ficar registrado que a opção permissiva foi a escolhida.

| Pacote | Versão | Licença | Classe efetiva | Direta | Alcance | Avaliação para SaaS fechado |
|---|---|---|---|---|---|---|
| `@codesandbox/nodebox` | 0.1.8 | `SEE LICENSE IN ./LICENSE` | indefinida | não | produção | **Alto se usado; hoje não é.** O LICENSE é a Sustainable Use License 1.0 (fair-code): só permite uso interno ou não comercial e proíbe distribuir com cobrança. Num SaaS pago, mandar esse código ao navegador do cliente seria distribuição comercial. Chega por `@mdxeditor/editor` > `@codesandbox/sandpack-react` > `@codesandbox/sandpack-client`. Nenhum arquivo do app importa `@mdxeditor/editor`, então não entra no build. Ação: remover `@mdxeditor/editor`. |
| `libsignal` | 6.0.0 | `GPL-3.0` | GPL | não | produção | **Médio.** GPL-3.0 sem exceção, puxado pelo `@whiskeysockets/baileys` (conexão WhatsApp, núcleo do produto). Roda só no servidor: está em `serverExternalPackages` no `next.config.ts` e o import é dinâmico em `src/lib/whatsapp/manager.ts`. Num SaaS o código não é distribuído, e a GPL (diferente da AGPL) não obriga a abrir o AtendeRadar. Vira bloqueio se o servidor for entregue a terceiros (instalação no cliente, white label, venda do pacote). Regra: não distribuir o servidor sem parecer jurídico. |
| `@img/sharp-win32-x64` | 0.35.5 | `Apache-2.0 AND LGPL-3.0-or-later` | LGPL | não | produção | **Baixo.** O binário traz a libvips (LGPL-3.0-or-later) ligada dinamicamente. Uso só no servidor (imagens do Next e testes), sem distribuição. Se um dia distribuir, manter os avisos e permitir trocar a biblioteca. Este é o pacote do Windows; no servidor Linux o par é `@img/sharp-linux-x64` + `@img/sharp-libvips-linux-x64`, com a mesma licença (inferência pelo `bun.lock`; não estão instalados nesta máquina). |
| `node-forge` | 1.4.0 | `(BSD-3-Clause OR GPL-2.0)` | permissiva | sim (dependencies) | produção | **Baixo (licença).** Dupla licença: vale a BSD-3-Clause, permissiva; a GPL-2.0 não se aplica. Manter o aviso BSD. As vulnerabilidades dele estão em `sca-baseline.md`. |

## Copyleft fraco por arquivo (MPL, EPL, CDDL, CC-BY-SA)

Fora do critério pedido, mas registrado: obriga a publicar só alterações feitas nos próprios arquivos do pacote.
Usar sem modificar não cria obrigação além de manter o aviso de licença.

| Pacote | Versão | Licença | Direta | Alcance |
|---|---|---|---|---|
| `@axe-core/playwright` | 4.13.0 | `MPL-2.0` | sim (devDependencies) | só desenvolvimento |
| `axe-core` | 4.11.1 | `MPL-2.0` | não | só desenvolvimento |
| `axe-core` | 4.13.0 | `MPL-2.0` | não | só desenvolvimento |
| `lightningcss` | 1.30.2 | `MPL-2.0` | não | só desenvolvimento |
| `lightningcss-win32-x64-msvc` | 1.30.2 | `MPL-2.0` | não | só desenvolvimento |

## Licenças que o script não reconheceu

Nenhuma: toda licença declarada caiu em uma classe conhecida.

## Dependências diretas sem uso no código

Nenhum import destes pacotes em `src`, `scripts`, `mini-services`, `tests` nem nos arquivos de configuração
(busca de texto; é indício forte, não prova). "Exclusivos" = pacotes que saem da árvore de produção se a
dependência for removida (calculado pelo script).

| Dependência direta | Exclusivos | Destaques entre os exclusivos |
|---|---|---|
| `@mdxeditor/editor` | 156 | `diff@5.2.0`, `intersection-observer@0.10.0`, `@codesandbox/nodebox@0.1.8` |
| `react-syntax-highlighter` | 23 | `prismjs@1.27.0` |
| `next-intl` | 24 | `next-intl@4.7.0` |
| `uuid` | 1 | `uuid@11.1.0` |
| `z-ai-web-dev-sdk` | 1 | - |
| `react-markdown` | 23 | - |
| `framer-motion` | 3 | - |
| `@tanstack/react-query` | 2 | - |
| `@tanstack/react-table` | 2 | - |
| `@dnd-kit/core` | 0 | - |
| `@dnd-kit/sortable` | 1 | - |
| `@dnd-kit/utilities` | 0 | - |
| `@hookform/resolvers` | 2 | - |
| `@reactuses/core` | 5 | - |

## Conclusão

- **Nada de AGPL, SSPL, BUSL, EUPL, CC-BY-NC, `UNLICENSED` ou pacote sem licença declarada.**
- **`libsignal` (GPL-3.0)** é o único copyleft forte, e está no caminho do WhatsApp. Aceitável para SaaS hospedado pela ALC.
  É bloqueio para qualquer distribuição do servidor. Registrar essa regra no handoff.
- **`@codesandbox/nodebox` (Sustainable Use License)** é o único pacote com licença não comercial. Está instalado por uma
  dependência direta que o código não usa (`@mdxeditor/editor`). Remover essa dependência tira o pacote da árvore
  (ver tabela de exclusivos).
- LGPL só no binário do `sharp` (libvips) e MPL-2.0 só em ferramentas de build e teste (`lightningcss`, `axe-core`).
  Nenhum dos dois cria obrigação para o SaaS.
- `intersection-observer` declara `W3C-20150513` (W3C Software License), permissiva com aviso; o script a trata como permissiva.
- `caniuse-lite` é CC-BY-4.0: permissiva, pede atribuição. Usada só no build (listas de navegadores).
- Licenças permissivas (MIT, ISC, BSD, Apache-2.0) pedem que o aviso de copyright acompanhe o código distribuído.
  Num SaaS isso vale para o JavaScript que vai ao navegador. Falta gerar um arquivo de avisos de terceiros no build.

### O que este baseline não prova (portão LIC-01)

- É a instalação da máquina de desenvolvimento (Windows x64), com `devDependencies`. O servidor é Linux: os pacotes
  nativos mudam (`@img/sharp-linux-*`, `@next/swc-linux-*`, `lightningcss-linux-*`, motores do Prisma).
- Não é o build implantado. O `standalone` do Next leva menos pacotes do que a coluna "produção" indica.
- `node_modules` difere um pouco do `bun.lock` (ver Números). O SBOM descreve o que está instalado, não o lock.
- O Open Mercato ainda não entrou: o LIC-01 pede o mesmo levantamento na POC, incluindo transitivas e a ausência de
  `@open-mercato/enterprise`.
- Os 8 pacotes do lock sem `os`/`cpu` e não instalados são do runtime WebAssembly (`@emnapi/*`, `@napi-rs/wasm-runtime`,
  `@img/sharp-wasm32`): alternativa opcional quando não há binário nativo (inferência pelo nome).
- Próximo passo: rodar o mesmo script no servidor (ou num container Linux) sobre o build da versão em produção.

## Como regenerar

```
node sbom.mjs [--nm <node_modules>] [--root <pasta do package.json>] [--out <pasta de saída>]
```

O script e o arquivo de avaliações (`avaliacoes.json`) ficam fora do repositório nesta fase (rascunho do agente).
Ele não usa rede nem instala nada. Rodar de novo depois de `bun install` muda os números; o SBOM leva data e
`serialNumber` novos a cada execução.
