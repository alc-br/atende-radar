# Licenças do Open Mercato 0.9.0 (POC F1-02)

Gerado em 31/10/2026 por um script próprio da POC (`tests/licencas.mjs`, sem ferramenta baixada). Ele lê o
`package.json` de cada pacote instalado em `crm/node_modules`, com escopos `@x/y` e `node_modules` aninhados. Mesmo
método do `licencas-baseline.md`.

Base: licença **declarada** no `package.json`. Li o texto do LICENSE só nos casos marcados abaixo.

## Projeto

| Item | Valor |
|---|---|
| Repositório | Open Mercato, tag 0.9.0, commit `f451ce4c390087f90d5314e002e9d009d5339e08` |
| Licença da raiz | MIT ("Copyright (c) 2025-2026 Open Mercato contributors"), lida no arquivo `LICENSE` |
| Pacotes `@open-mercato/*` instalados pelo scaffold | 29: 28 MIT e o `@open-mercato/enterprise` |

## Os dois estados medidos

| Estado | Pacotes únicos | Fora da lista permissiva |
|---|---|---|
| Como o scaffold gera (preset `crm`) | 1.892 | 13 |
| Sem `@open-mercato/enterprise` e `newrelic`, com `@open-mercato/web-research` direto | 1.814 | 11 |

No segundo estado o build passou (`yarn build`, 1 min 52 s) e as 93 verificações da POC deram o mesmo resultado do
primeiro (90 passaram; as 3 falhas são o defeito C15, que não tem a ver com licença).

## Bloqueios (D8: sem Enterprise ou dependência paga)

| Pacote | Licença | Quem traz | Situação |
|---|---|---|---|
| `@open-mercato/enterprise@0.9.0` | "SEE LICENSE IN LICENSE.md": software comercial. Sem licença comercial, só avaliação de desenvolvedor fora de produção. Proíbe produção, uso comercial, redistribuição e modificação (lido em `packages/enterprise/LICENSE.md`) | `dependencies` do app gerado | **Removido.** Os módulos dele já nascem desligados (`OM_ENABLE_ENTERPRISE_MODULES=false`), mas o pacote fica instalado e iria para o servidor |
| `@newrelic/security-agent@3.0.4` | New Relic Software License v1.0: só para uso com o serviço pago da New Relic (lido no `LICENSE` do pacote) | `newrelic@14.8.0` (Apache-2.0), que está nas `dependencies` do app gerado | **Removido** junto com o `newrelic` |

Para tirar o enterprise sem quebrar o build:

1. Apagar o bloco do enterprise em `src/modules.ts`.
2. Apagar `src/modules/agent_examples` (importa o SDK do enterprise).
3. `yarn remove @open-mercato/enterprise newrelic`.
4. `yarn add @open-mercato/web-research@0.9.0` (MIT). Sem ele o build falha com
   `Cannot find module '@open-mercato/web-research'`: o pacote só vinha pelo enterprise e o arquivo gerado
   `.mercato/generated/web-research-adapters.generated.ts` importa os tipos dele.

**Inferência:** o `newrelic` não é usado pelo app. Nenhum arquivo de `src` o importa, o `@open-mercato/telemetry` não
o declara e a telemetria sai por OTLP, desligada por padrão.

## Contagem por licença (sem enterprise)

| Licença declarada | Pacotes |
|---|---|
| MIT | 1.459 |
| Apache-2.0 | 173 |
| ISC | 78 |
| BSD-3-Clause | 34 |
| BSD-2-Clause | 31 |
| BlueOak-1.0.0 | 12 |
| MIT-0, MPL-2.0, (MIT OR CC0-1.0) | 3 cada |
| (MIT OR EUPL-1.1+), Unlicense, CC0-1.0, 0BSD | 2 cada |
| outras (uma cada) | 11 |

## Fora da lista permissiva (sem enterprise)

| Pacote | Licença declarada | Quem traz | Leitura |
|---|---|---|---|
| `@img/sharp-win32-x64@0.35.5` | Apache-2.0 AND LGPL-3.0-or-later | `sharp` (imagens do Next) | binário da libvips, ligado dinamicamente. No Linux o par é `sharp-linux-x64` com a libvips. Uso normal; manter os avisos |
| `@sesamecare-oss/redlock@1.4.0` | UNLICENSED | `@hocuspocus/extension-redis` ← `@open-mercato/documents` | o `package.json` diz UNLICENSED, mas o `LICENSE.md` do pacote é MIT (lido). Inconsistência do autor. Risco baixo; some se o módulo `documents` sair |
| `@zone-eu/mailsplit@5.4.16` e `5.4.23` | MIT OR EUPL-1.1+ | `imapflow`, `mailparser` ← `channel-imap` | escolher MIT |
| `axe-core@4.14.0` | MPL-2.0 | `eslint-plugin-jsx-a11y` | ferramenta de lint, não vai para produção |
| `lightningcss@1.32.0` e o binário win32 | MPL-2.0 | `@tailwindcss/node` | ferramenta de build. MPL vale por arquivo e só obriga quem modifica |
| `duck@0.1.12` | BSD | `lop` ← `mammoth` ← `documents` | BSD sem versão; permissiva |
| `json-schema@0.4.0` | AFL-2.1 OR BSD-3-Clause | `@ai-sdk/provider` | escolher BSD-3-Clause |
| `jszip@3.10.2` | MIT OR GPL-3.0-or-later | `@open-mercato/documents`, `mammoth` | escolher MIT |
| `node-forge@1.3.1` | BSD-3-Clause OR GPL-2.0 | `@parse/node-apn` ← `channel-apns` | escolher BSD-3-Clause |

Nenhum desses obriga a abrir o código do AtendeRadar nem depende de serviço pago.

## Conclusão para o portão LIC

- Núcleo e módulos usados pelo CRM (`core`, `shared`, `ui`, `events`, `queue`, `webhooks`, `cli`): MIT.
- O app gerado **não** passa como vem: traz um pacote comercial e um agente proprietário. Passa depois dos quatro passos
  acima, que foram provados com build e com as provas HTTP.
- O `package.json` do serviço tem de travar essa lista. Um teste da F7 confere que `@open-mercato/enterprise`,
  `newrelic` e `@newrelic/*` não estão no lockfile.
- **Inferência, não testada:** dá para tirar mais pacotes que o CRM não usa (`documents`, `checkout`,
  `gateway-stripe`, `channel-apns` e outros canais), o que também tira os casos de `redlock`, `jszip`, `duck` e
  `node-forge`.

Arquivos completos na pasta da POC: `evidencias/licencas-com-enterprise.json`, `evidencias/licencas-sem-enterprise.json`
e os resumos `.txt`.
