# NFS-e Padrão Nacional

A nota fiscal de serviço é emitida pelo Sistema Nacional NFS-e (API do Emissor Nacional, `sefin.nfse.gov.br`) com o certificado A1 da empresa.

**Situação em 20/10/2026:** pronta e testada, mas **desligada** (`NFSE_AMBIENTE=off`). Só liga em produção depois de duas coisas:

- as decisões da contabilidade que ainda faltam (ver [Orientação da contabilidade](#orientação-da-contabilidade-20102026));
- uma emissão completa ser provada (ver [O que está provado](#o-que-está-provado)).

Código: `src/lib/nfse/` (`xml.ts`, `sign.ts`, `client.ts`, `config.ts`, `service.ts`, `prazo.ts`, `fake.ts`). Tela: **Admin → Notas fiscais**.

## Como funciona

- **Contratação e renovação:** toda fatura paga (`BillingInvoice` com `status paid` e `paidAt` desde `NFSE_DESDE`) gera **uma** nota (`NfseDocument`, uma por fatura). Empresas de simulação ficam de fora. Em produção, a emissão só acontece com `PAGARME_MODE=live`.
- **Tomador (quem paga):**
  - Vem dos dados do checkout, guardados em `BillingCustomer`: nome, CPF ou CNPJ, e-mail e endereço. O código IBGE do município sai do CEP (ViaCEP).
  - Clientes antigos, sem esse registro, são lidos do cliente no Pagar.me.
  - A troca de cartão atualiza o endereço.
- **Serviço:** `NFSE_CTRIB_NAC` (padrão `010501`, licenciamento de programas) e NBS `NFSE_CNBS` (padrão `115062100`, ou seja 1.1506.21.00, SaaS). O ISS é devido no município do prestador, sem retenção. A empresa é ME/EPP do Simples Nacional: não informa alíquota e informa o total de tributos em `NFSE_P_TOT_TRIB_SN`. A descrição é o texto da atividade definido pelo dono em 21/10/2026 ("Tratamento e processamento contínuo de dados empresariais. Prestação de serviços de tratamento e processamento automatizado de dados empresariais, incluindo …"), seguido de "Serviço AtendeRadar, plano X, assinatura mensal/anual - período de … a …" (`src/lib/nfse/service.ts`).
- **Numeração:** a DPS recebe série `NFSE_SERIE` e número sequencial (`NfseSequence`, por ambiente e série). O número é **reservado e gravado antes do envio**. Uma DPS rejeitada mantém o número e o reaproveita na nova tentativa.
- **Competência:** a data em que o pagamento foi aprovado (confirmado pela contabilidade).
- **Reembolso (regra do dono, 21/10/2026):** não existe reembolso parcial. Pedido em até 7 dias da contratação: reembolso integral e a nota é cancelada. Depois de 7 dias, não há reembolso (a tela não oferece e a API recusa).
  - Nota já emitida, com fatura `refunded` (arrependimento em 7 dias ou estorno), **dentro do mês de competência**: ela é **cancelada** sozinha. O cancelamento usa o evento 101101 com motivo 2 ("serviço não prestado") e o texto "Contratação desfeita pelo cliente com reembolso integral do pagamento".
  - Nota já emitida, com reembolso **depois do mês de competência**: a nota **não pode mais ser cancelada**, porque o imposto já foi apurado (orientação da contabilidade). Ela fica como **Reembolso fora do prazo** (`cancel_expired`) para a contabilidade resolver. Um cancelamento que ainda estava na fila quando o mês virou também para aí, sem ser enviado. O mês é contado no horário de Brasília (`src/lib/nfse/prazo.ts`).
  - Nota ainda não emitida: fica **dispensada** (`skipped`).
  - Isso acontece com frequência: o arrependimento de 7 dias de uma compra feita nos últimos dias do mês cai no mês seguinte.
- **Fila:**
  - Roda no agendador a cada 60 s, logo depois de cada sincronização do Pagar.me e no botão **Processar agora**.
  - Falhas são tentadas de novo em 1, 5, 15, 60, 180 e 720 minutos, até 6 tentativas. Depois disso, só o operador pede outra tentativa.
  - Notas presas em "emitindo" ou "cancelando" por 10 min voltam para a fila.
- **Queda de rede depois do envio:** antes de reenviar, o sistema consulta a DPS pelo Id (`GET /dps/{id}`). Se a nota já existe, ela é recuperada e nada é emitido em dobro. A resposta E0014 (DPS duplicada) também leva a essa consulta.
- **Guarda:** XML da DPS assinada, XML da nota autorizada e XML do evento de cancelamento ficam no banco. A nota **não é apagada** quando a empresa é excluída (obrigação fiscal).

## Tela (Admin → Notas fiscais)

- Mostra a configuração: desligada, produção restrita ou produção, CNPJ, município, série, serviço, desde quando, e o certificado (titular, CNPJ e validade). Avisa se o certificado for de outro CNPJ.
- Contagem e lista com filtros (todas, falhas, emitidas, canceladas, na fila).
- Detalhe de cada nota:
  - número, chave de acesso e tomador;
  - último erro do governo (código e texto) e a próxima tentativa;
  - download dos XML (nota, DPS, cancelamento);
  - **Tentar novamente agora**, para falhas;
  - **Cancelar esta nota**, para notas emitidas dentro do mês de competência. Pede motivo (erro na emissão, serviço não prestado, outros) e explicação de 15 a 255 caracteres. O cancelamento não pode ser desfeito. Depois do mês, o botão some e a tela avisa que o prazo acabou.
- Filtro **Fora do prazo** e aviso no topo para os reembolsos que chegaram depois do mês de competência.
- Tudo fica na auditoria: `nfse.run`, `nfse.retry`, `nfse.cancel_requested`.

## Variáveis (`/opt/atende-radar/shared/app.env`)

| Variável | Uso |
|---|---|
| `NFSE_AMBIENTE` | `off` (padrão), `restrita` (testes do governo, sem valor fiscal) ou `producao` |
| `NFSE_DESDE` | obrigatória; data ISO. Só faturas pagas a partir dela geram nota, para que ligar a emissão não gere notas do passado. |
| `NFSE_CNPJ` | CNPJ do prestador (o mesmo do certificado) |
| `NFSE_MUNICIPIO` | código IBGE do município do prestador (Piraquara = `4119509`) |
| `NFSE_IM` | inscrição municipal, se o município exigir |
| `NFSE_CERT_FILE` | caminho do `.p12` no servidor: `/opt/atende-radar/shared/nfse/certificado.p12` |
| `NFSE_CERT_PASSWORD` | senha do `.p12`. Só no `app.env`, nunca no repositório nem no chat. |
| `NFSE_SERIE` | 1 a 49999 (faixa de aplicativo próprio), padrão 1 |
| `NFSE_CTRIB_NAC` | código de tributação nacional (6 dígitos), padrão `010501` (1.05.01, CNAE 6311-9/00, decidido em 21/10/2026) |
| `NFSE_CNBS` | NBS (9 dígitos), padrão `115062100` (1.1506.21.00, SaaS, indicada pela contabilidade). Vazio = não informa. |
| `NFSE_CTRIB_MUN` | código municipal, se a contabilidade pedir |
| `NFSE_P_TOT_TRIB_SN` | percentual total de tributos do Simples, padrão `6.00`. **Confirmar com a contabilidade** e atualizar quando a faixa mudar com o faturamento. |
| `NFSE_FAKE` | `1` = Sistema Nacional falso, sem rede (só testes automáticos; exige `restrita`) |

O deploy **não** grava essas variáveis: sem elas, a emissão fica desligada.

## Ligar

1. Copiar o certificado para o servidor, fora do repositório, com permissão só para o usuário do serviço:

   ```bash
   install -d -m 700 /opt/atende-radar/shared/nfse
   install -m 600 certificado.p12 /opt/atende-radar/shared/nfse/certificado.p12
   ```

2. Fazer backup do `app.env` e acrescentar as variáveis `NFSE_*` (primeiro com `NFSE_AMBIENTE=restrita`).
3. Reiniciar o serviço e abrir **Admin → Notas fiscais**. A tela deve mostrar o certificado com o CNPJ certo e a validade.
4. Produção: `NFSE_AMBIENTE=producao` e `NFSE_DESDE` com a data a partir da qual as vendas geram nota. Depois, reiniciar.
5. Renovar o certificado antes do vencimento (o atual vale até 16/10/2027) e trocar o arquivo no servidor.

## O que está provado

**Contra a produção restrita real do governo (20/10/2026; repetido no mesmo dia com o NBS 115062100 e com os códigos 010501 e 010301, mesmo resultado)**, com o certificado da empresa e mTLS, pelas sondas usadas no desenvolvimento:

- conexão mTLS com o certificado A1 funciona;
- **DPS aceita no esquema e na assinatura.** A recusa veio depois, na regra de negócio E0037 ("município emissor inexistente no cadastro de convênio"): Piraquara não tem convênio ativo na produção restrita;
- com outro município (Curitiba) passou mais adiante e parou em dados de teste:
  - E0207: o CPF precisa existir;
  - E0084: o CNPJ não tem estabelecimento naquele município;
- **pedido de cancelamento aceito no esquema e na assinatura.** A resposta foi E1831 ("NFS-e não existe"), a esperada para uma chave inexistente;
- consulta de nota e de DPS respondem 404 (E2404) como esperado.

**Nos testes automáticos** (Sistema Nacional falso, mesma montagem de XML e assinatura conferida a cada envio):

- `tests/unit/nfse.unit.spec.ts`: XML, ordem do leiaute, escapes, datas, assinatura, cancelamento, leitura do `.p12`, configuração;
- `tests/e2e/nfse.spec.ts` (API):
  - emissão, renovação e cancelamento por reembolso;
  - filtro `NFSE_DESDE`;
  - rejeição e nova tentativa;
  - queda de rede sem nota em dobro;
  - falta de tomador;
  - cancelamento recusado e manual;
  - XML e acesso negado a cliente;
- `tests/e2e/nfse.ui.spec.ts` (tela, desktop e celular);
- `tests/e2e/billing-pagarme.spec.ts`: no sandbox real do Pagar.me, a contratação grava o tomador e emite a nota, e o arrependimento a cancela.

**Não provado:** uma emissão **completa** (nota autorizada) no Sistema Nacional real. A produção restrita (ambiente de testes do governo) não aceita nosso CNPJ: lá Piraquara aparece sem convênio (E0037) e outros municípios dão E0084. Em **produção** isso não se aplica: Piraquara já emite pelo Sistema Nacional (é por ele que a contabilidade emite hoje), e a emissão é no padrão nacional, sem nada a pedir à prefeitura.

O caminho para a prova completa é, com o aval da contabilidade e do dono, emitir em produção uma 1ª nota real de valor baixo e cancelá-la no mesmo mês (prova emissão e cancelamento de ponta a ponta). Só depois de 03/11 (NT 009) e com o CNAE incluído.

## Orientação da contabilidade (20/10/2026)

Respostas da contabilidade (Katia Rocha) às perguntas enviadas pelo dono.

**Já aplicado no sistema:**

- Competência = data da aprovação do pagamento.
- Série própria, separada da 70000 do Emissor Web: pode.
- Cancelamento só dentro do mês de competência (de 1 a 31). Depois disso o imposto já foi apurado.
- NBS 1.1506.21.00 (SaaS), a mesma para os códigos 1.03 e 1.05.
- CPF ou CNPJ de quem paga: identificar sempre (o checkout já exige).
- Venda parcelada: a nota sai pelo valor total. O AtendeRadar cobra por fatura, e cada fatura gera uma nota pelo valor cobrado.

**Decidido pelo dono em 21/10/2026:** CNAE **6311-9/00** com o código **1.05.01** (`NFSE_CTRIB_NAC=010501`, já é o padrão). A contabilidade inclui o CNAE no CNPJ. Os caminhos que ela tinha listado:
  - 1.03.01 (processamento de dados) com CNAE 6190-6/01: Anexo III;
  - 1.05.01 (licenciamento de uso) com CNAE 6311-9/00: Anexo III **com fator R**;
  - CNAE 6203-1/00: Anexo III **com fator R**.
  - "Com fator R" quer dizer: se a folha (com pró-labore) for menor que 28% do faturamento, a receita cai no Anexo V, com imposto bem maior. Isso pesa na escolha.
  - O sistema usa `010501` (1.05.01) por padrão; trocar é só mudar `NFSE_CTRIB_NAC`. A produção restrita aceitou os dois formatos (010501 e 010301).
**Ainda falta decidir (dono e contabilidade):**

- **Percentual de tributos na nota.** A contabilidade informou "2,17% com base no faturamento atual", em resposta à pergunta do ISS. Falta confirmar se 2,17% é só a parte do ISS ou o total do Simples. O campo da nota (`NFSE_P_TOT_TRIB_SN`) é o **total**. Esse percentual muda quando o faturamento muda de faixa.
- ~~Reembolso parcial~~: não existe (decisão do dono, 21/10/2026).
- **Cliente no exterior** e **imunidade da apostila em PDF:** a contabilidade aguarda a consultoria. Isso é dos outros sistemas (Completa e ALCADEMY), não do AtendeRadar.

**Outros sistemas (fora deste repositório):**

- Cursos online (ALCADEMY e Completa): 8.02.01, CNAEs 8599-6/04 (já está no CNPJ) e 8599-6/05, Anexo III sem fator R.
- Apostila em PDF sob medida (Completa): é serviço, por ser personalizada; 17.02.01, CNAE 5811-5/00.
- Curso e apostila na mesma venda: **uma nota para cada item**, porque os códigos são diferentes.

## NT 009/2026 (reforma tributária, IBS/CBS)

A produção restrita já roda a versão `SefinNacional_1.6.0` (NT 009), que exige `<finNFSe>0</finNFSe>`. O XML atual vai com esse campo.

- **30/10/2026:** 2ª entrega na produção restrita. Pode passar a exigir novos campos para o Simples (`regApIBSCBSSN`, `cAtvSN`, `indDest`). Rodar a sonda de novo depois dessa data.
- **03/11/2026:** NT 009 em produção. Antes disso, a produção pode recusar o `finNFSe`. Não ligar a produção antes de 03/11 sem testar.

Referências:

- [NT 009 (Legisweb)](https://www.legisweb.com.br/noticia/?id=32820)
- [Discussão do finNFSe na produção restrita (t3wv/nfse#72)](https://github.com/t3wv/nfse/issues/72)
