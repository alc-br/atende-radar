# E-mail: Brevo (transacional) e Mautic (contatos e marketing)

## Como funciona

| O quê | Onde | Código |
|---|---|---|
| E-mails do serviço (confirmação, convite, senha, alertas, relatórios, suporte) | **Brevo**, API de e-mail transacional | `src/lib/mailer.ts` |
| Contatos (todo membro de empresa real e todo destinatário de e-mail) | **Mautic** (mautic.alc.srv.br), usuário de API `atenderadar-api` | `src/lib/mautic.ts` |
| E-mail de marketing (se houver) | **Mautic** (campanhas, segmentos), não o sistema | — |

Todo e-mail passa antes pelo `EmailOutbox` (registro e novas tentativas). Sem `MAIL_PROVIDER=brevo`, fica `queued`.

No Mautic, o contato recebe `sistema_origem` = `atenderadar` (sem tirar o de outros sistemas), as tags de origem e os
campos `ar_*`. Demonstração e simulação ficam de fora. A falha do Mautic nunca atrapalha o cadastro: vai para o log. O
deploy roda `scripts/mautic-sync.ts` e o app repete o mesmo sync a cada 6 h (`src/lib/background.ts`), o que mantém
plano e assinatura em dia sem chamadas espalhadas pelo código de cobrança.

## Organização no Mautic

Criada por `scripts/mautic-setup.ts` (idempotente; o catálogo fica em `src/lib/mautic-catalog.ts`). Para mudar um
segmento ou campo, mude o catálogo e rode de novo (local serve: o Mautic não restringe IP):
`bun --env-file=D:/ALC/env/.env.atenderadar scripts/mautic-setup.ts`. Faça backup antes (`/opt/mautic/90-backup.sh`).

- **Categoria** `AtendeRadar`: use em todo segmento, e-mail, campanha e formulário do AtendeRadar, sempre com o
  prefixo `[AtendeRadar]` no nome (convenção da instância, compartilhada com outros sistemas).
- **Tags de origem:** `atenderadar` (todos), `atenderadar-membro` (usuário de uma empresa cliente),
  `atenderadar-destinatario` (só recebe e-mail, ex.: relatório para um endereço extra).
- **Campos** (grupo Core, preenchidos pelo sistema; não editar à mão, o sync sobrescreve):

| Campo | Valores |
|---|---|
| `ar_papel` | admin, gestor, supervisor, analista, member, atendente, viewer |
| `ar_membro` | ativo, convidado, suspenso |
| `ar_plano` | essencial, gestao (Growth), performance |
| `ar_assinatura` | teste, teste_vencido, ativa, cancelamento_agendado, inadimplente, cancelada, sem_assinatura |
| `ar_teste_fim` | data do fim do teste grátis |
| `ar_cadastro`, `ar_ultimo_acesso` | data e hora (Brasília) |
| `ar_email_confirmado` | sim/não |
| `ar_empresa_id` | id da empresa no AtendeRadar (agrupa pessoas da mesma empresa) |

- **Segmentos** `[AtendeRadar] …` (todos filtram `sistema_origem = atenderadar`): Todos; Usuários; Donos da conta
  (administradores); Gestores e supervisores; Equipe de atendimento; Em teste grátis; Teste vencido sem assinar;
  Clientes ativos; Cancelamento agendado; Pagamento pendente; Cancelados; Plano Essencial / Growth / Performance;
  Convite pendente; E-mail não confirmado. Situação da assinatura é da empresa: todos os membros dela entram juntos;
  para falar só com quem decide, combine com "Donos da conta".

## Variáveis (servidor, `app.env`)

| Variável | De onde vem |
|---|---|
| `BREVO_API_KEY`, `MAUTIC_USUARIO`, `MAUTIC_SENHA` | secrets do GitHub (o deploy grava; trocar o secret troca no servidor) |
| `MAUTIC_URL` | o deploy cria (`https://mautic.alc.srv.br`) |
| `MAIL_FROM` | o deploy cria (`AtendeRadar <nao-responda@atenderadar.com.br>`) |
| `MAIL_PROVIDER` | o deploy liga (`brevo`) **só** se `scripts/mail-check.ts` confirmar que o domínio do remetente está autenticado no Brevo. `off` no app.env desliga de propósito e o deploy respeita. |

Cópia local das credenciais: `D:\ALC\env\.env.atenderadar` (seções `# BREVO` e `# MAUTIC`).

## Regras

- **Teste de envio só a partir do servidor.** A conta do Brevo só aceita chamadas de IPs autorizados (o do servidor). Da
  máquina local a API devolve 401 ("unrecognised IP address"). No servidor:
  `set -a; . /opt/atende-radar/shared/app.env; set +a; MAIL_TEST_TO=<endereço> bun scripts/mail-check.ts`
- O remetente precisa estar num domínio autenticado no Brevo (DKIM/DMARC). `atenderadar.com.br`: conferir com o
  mail-check (o deploy imprime a situação).
- Plano Free do Brevo: 300 e-mails/dia na conta inteira (somando Mautic e outros sistemas).
- Usuário `atenderadar-api` no Mautic: papel "AtendeRadar (API)", com tudo de marketing (contatos, segmentos, campos,
  e-mails, campanhas, formulários, páginas, pontos, estágios, relatórios, webhooks). Sem configuração, usuários, papéis
  ou plugins. Manual do Mautic: `D:\ALC\ferramentas\mautic\manual-mautic.md`.

## Entregabilidade (DNS e Gmail)

Zona DNS no registro.br (modo avançado), conferida em 15/10/2026:

- **Brevo:** `brevo-code` (TXT) e DKIM `brevo1`/`brevo2._domainkey` (CNAME). O Brevo envia com endereço de retorno
  próprio, então o SPF do domínio não precisa incluí-lo; o alinhamento do DMARC vem do DKIM.
- **DMARC:** `v=DMARC1; p=quarantine; rua=mailto:rua@dmarc.brevo.com` (relatórios no painel do Brevo). Qualquer serviço
  novo que mande e-mail como `@atenderadar.com.br` precisa assinar DKIM com o domínio antes, senão cai no spam.
- **iCloud** (caixa do contato@): MX, SPF `include:icloud.com`, DKIM `sig1._domainkey`.
- **Google Postmaster Tools:** domínio verificado (TXT `google-site-verification`, conta ilivindigital@gmail.com).
  Mostra taxa de spam, autenticação e reputação quando houver volume para o Gmail. Manter a taxa de spam abaixo de 0,1 %
  (o Gmail pune acima de 0,3 %).
- **Descadastro com um clique (RFC 8058, exigido pelo Gmail e pelo Yahoo):** e-mails recorrentes levam
  `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` e um link no texto. O POST em
  `/api/public/unsubscribe` age na hora (o GET não age: antivírus abre links). Alertas: desliga os alertas por e-mail
  da pessoa (`src/lib/alert-email.ts`). Relatórios agendados: tira o endereço dos relatórios da empresa
  (`src/lib/report-unsubscribe.ts`, token `r.`). E-mails de conta (cadastro, senha, convite) são transacionais e não
  levam. Marketing sai pelo Mautic, sempre com `{unsubscribe_url}`.
