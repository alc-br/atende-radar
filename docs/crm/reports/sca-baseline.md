# Vulnerabilidades conhecidas nas dependências (SCA, baseline F0)

Rodado em 30/10/2026 às 23:30 (Brasília), com o `bun audit` do Bun 1.3.14, no worktree `crm` (commit `eac8042`).
O `bun audit` lê o `bun.lock` e consulta a base de avisos do registro npm (GitHub Advisory Database).
A saída completa ficou fora do repositório; aqui vai só o resumo. Licenças: `licencas-baseline.md`. SBOM: `sbom-baseline.json`.

## O que foi rodado

| Comando | Resultado | Código de saída |
|---|---|---|
| `bun audit --json` (todos os níveis, sem ignorar nada) | 22 avisos em 10 pacotes | 1 |
| `bun audit` (texto, para ver os caminhos de dependência) | "22 vulnerabilities (7 high, 10 moderate, 5 low)" | 1 |
| `bun audit --audit-level=high --ignore GHSA-vfj7-8cjw-p6xm --ignore GHSA-ggr8-5vv4-36mx --ignore GHSA-86w9-cpqp-85rv` (o mesmo comando do `deploy.yml`) | "5 vulnerabilities (5 high)", todas no `node-forge` | 1 |
| `bun info node-forge version` | `1.4.2` | 0 |

Nenhum aviso **critical**.

## Por severidade

| Severidade | Avisos | Pacotes |
|---|---|---|
| critical | 0 | - |
| high | 7 | `node-forge` (6), `deepmerge-ts` (1) |
| moderate | 10 | `node-forge` (3), `next-intl` (2), `ajv`, `prismjs`, `uuid`, `@humanfs/node`, `minimatch` |
| low | 5 | `node-forge` (3), `@babel/core`, `diff` |
| **Total** | **22** | **10 pacotes** |

## Por pacote

"Alcance" segue o critério de `licencas-baseline.md`: produção = alcançável a partir de `dependencies`.
"Sem uso no código" = nenhum import encontrado por busca de texto em `src`, `scripts`, `mini-services`, `tests` e configs.

| Pacote | Instalado | Faixa vulnerável | Avisos | Chega por | Alcance | Situação |
|---|---|---|---|---|---|---|
| `node-forge` | 1.4.0 (pin exato) | `<=1.4.0` | 6 high, 3 moderate, 3 low | direta | produção | 1.4.2 já publicada, fora da faixa dos 12 avisos. Ver abaixo |
| `deepmerge-ts` | 7.1.5 | `<8.0.0` | 1 high | `prisma` > `@prisma/config` | produção (CLI do Prisma) | já ignorado no CI; correção só na major 8, que o Prisma não usa |
| `next-intl` | 4.7.0 | `<4.9.1` | 2 moderate | direta | produção | sem uso no código: remover (ou subir para 4.9.1 ou mais) |
| `uuid` | 11.1.0 | `<11.1.1` | 1 moderate | direta (a cópia do `next-auth` já é 11.1.1) | produção | sem uso no código: remover ou subir |
| `prismjs` | 1.27.0 | `<1.30.0` | 1 moderate | `react-syntax-highlighter` > `refractor` | produção | a cópia de topo já é 1.30.0; `react-syntax-highlighter` sem uso no código: remover |
| `diff` | 5.2.0 | `>=5.0.0 <5.2.2` | 1 low | `@mdxeditor/editor` > `unidiff` | produção | `@mdxeditor/editor` sem uso no código: remover |
| `ajv` | 6.12.6 | `<6.14.0` | 1 moderate | `eslint` > `@eslint/eslintrc` | só desenvolvimento | lint; não roda em produção |
| `@humanfs/node` | 0.16.7 | `<0.16.8` | 1 moderate | `eslint` | só desenvolvimento | lint |
| `minimatch` | 3.1.5 e 10.2.6 | `<11.0.1` | 1 moderate | `eslint` e `typescript-eslint` | só desenvolvimento | lint |
| `@babel/core` | 7.28.6 | `<=7.29.0` | 1 low | `eslint-config-next` > `eslint-plugin-react-hooks` | só desenvolvimento | lint |

Remover as quatro dependências diretas sem uso (`@mdxeditor/editor`, `react-syntax-highlighter`, `next-intl`, `uuid`)
tira 5 dos 22 avisos e, de quebra, o único pacote de licença não comercial (`@codesandbox/nodebox`).
Antes de remover, confirmar com `bun run build` e a suíte de testes.

## `node-forge`: o portão do deploy vai barrar

O passo "Auditoria de dependências" do `deploy.yml` (shard 1) usa exatamente o terceiro comando da tabela. Aqui ele
saiu com código 1 por 5 avisos high novos do `node-forge`. A lista de ignorados foi revisada pela última vez em 20/10/2026.
**Inferência:** o CI consulta a mesma base, então o próximo push na `main` deve parar nesse passo. Não rodei o CI.

Exposição real, pela leitura do código (inferência, sem teste de exploração):

| Aviso high | Do que se trata | O app usa? |
|---|---|---|
| GHSA-86w9-cpqp-85rv | verificação de assinatura RSA PKCS#1 v1.5 | não (já ignorado; a assinatura do XML é conferida pelo `xml-crypto` com o crypto do Node) |
| GHSA-8hrf-8g6f-7xwp | negação de serviço no TLS do forge | não: `forge.tls` não aparece no código |
| GHSA-hqq3-7jhf-c5jx | negação de serviço no TLS do forge | não |
| GHSA-5x38-2vff-x55p | `verifyCertificateChain()` aceita cadeia inválida | não: a função não aparece no código |
| GHSA-7wch-p9px-956x | ReDoS no `pem.decode` | só no modo `NFSE_FAKE`, com uma chave que o próprio app gera (`src/lib/nfse/config.ts`) |
| GHSA-jc66-7q78-782g | MAC do PKCS#12 forjável com contagem de iterações zero | **sim, é o caminho usado** (`pkcs12FromAsn1` em `src/lib/nfse/sign.ts`), mas o arquivo é o certificado A1 da própria ALC, lido de um caminho configurado no servidor |

Resumo: nenhum dos avisos tem entrada de terceiros hoje. O do PKCS#12 passa a importar se algum módulo (o CRM
inclusive) aceitar `.p12` enviado por cliente.

Saída recomendada (não aplicada; `package.json` e `bun.lock` não foram alterados):
1. Trocar o pin `node-forge` de `1.4.0` para `1.4.2` (fora da faixa `<=1.4.0` dos 12 avisos).
2. Tirar o `--ignore GHSA-86w9-cpqp-85rv` do `deploy.yml`.
3. Rodar `tests/unit/nfse.unit.spec.ts` e o fluxo de NFS-e em `NFSE_AMBIENTE=restrita`.

Ignorar os 5 avisos novos também destrava o CI, mas deixa o pin numa versão que já tem correção.

## Ignorados do CI hoje

| Aviso | Estado em 30/10/2026 |
|---|---|
| GHSA-vfj7-8cjw-p6xm (`braces`) | não aparece mais na saída completa, com `braces@3.0.3` ainda instalado. O ignore não tem efeito. Motivo (aviso retirado ou faixa corrigida) não verificado |
| GHSA-ggr8-5vv4-36mx (`deepmerge-ts`) | continua valendo; só o CLI do Prisma usa |
| GHSA-86w9-cpqp-85rv (`node-forge`) | continua; some com o `node-forge` 1.4.2 |

## Limites deste retrato

- O `bun audit` olha o `bun.lock`, não o `node_modules`. A diferença entre os dois é de um pacote (`zod@4.3.5`, só lint).
- A base de avisos muda todo dia. Este é o estado de 30/10/2026.
- Não cobre o Open Mercato (entra na POC), os pacotes do sistema do servidor, a imagem do Node nem o nginx.
- Avisos low e moderate não derrubam o deploy e não aparecem no log do CI.
