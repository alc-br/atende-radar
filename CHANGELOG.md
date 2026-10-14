# Changelog

Resumo do que mudou, por data (mais recente primeiro). Detalhe em `git log` e no Diário do `handoff.md`.

## 2026-10-14
- **Tour pelo sistema:** manual interativo por papel (botão no rodapé do menu, acima de "Precisa de ajuda?"). Capítulos com passos de explicação, de clique e de cadastro real, que avançam sozinhos; progresso salvo por pessoa; leitura em voz alta grátis do navegador (pt-BR, velocidade 0,8–1,5×); funciona no celular. Artigo novo na Central de ajuda.
- **Tour com voz natural:** cada passo ganhou uma narração própria (fala explicativa, não a leitura da tela). O áudio é gerado no servidor com o Piper (grátis, local), uma vez por texto, e reaproveitado do cache; se não houver, o navegador lê com a própria voz. O deploy instala o Piper sozinho. Detalhes em `docs/operacao/tour-audio.md`.
- **Alertas por e-mail:** regras com o canal e-mail agora mandam e-mail para os membros que veem o alerta (respeita o escopo de supervisor e atendente). Sem texto de mensagem, nome ou telefone do cliente. No máximo 1 e-mail por regra a cada 15 min por pessoa (o resto vai num resumo), horário de silêncio (crítico passa) e link "parar de receber" (também no cabeçalho List-Unsubscribe). Liga e desliga em Meu perfil. Detalhes em `docs/operacao/alertas-por-email.md`.
- **Migrações do banco versionadas (B10):** o deploy deixa de usar `db push` e aplica só as migrações revisadas em `prisma/migrations` (a `0_init` é o banco de hoje; o banco de produção vira baseline automaticamente, só se for igual a ela). O CI barra mudança no schema sem migração e os testes criam o banco pelas migrações. Guia em `docs/operacao/migracoes.md`.
- **E-mails que falham** são tentados de novo sozinhos (até 4 envios: 5 min, 30 min e 2 h depois). Se for alerta e desistir, aparece um aviso no sino.

## 2026-10-13
- **Segurança:** Content-Security-Policy em todas as páginas; a varredura ZAP passa a barrar falta de CSP.
- **Qualidade dos alertas:** conjuntos rotulados (treino, validação e cego) com barras de precisão e cobertura; ajuste do classificador (menos falsos "frustrado").
- **Telas:** ações que falham (alertas, recuperação, conversas, conexões, configurações) agora mostram erro em vez de silenciar.
- **Docs:** `handoff.md` com o estado do trabalho.

## 2026-10-12
- **Novo design** em todo o sistema (página de vendas, telas de conta, onboarding, checkout e painel).
- **Domínios separados:** site em atenderadar.com.br e app em app.atenderadar.com.br.
- **Site:** nova página de vendas renderizada no servidor (SEO), blog (lista e artigos), privacidade e termos.
- **Testes "pode vender":** fumaça nos dois domínios, jornada completa do cliente, Firefox/Safari/iPhone, e-mails de relatórios agendados, força bruta no login, ensaio de restauração e ZAP.
- **Correções:** erro 500 na página inicial do site; campos das páginas de link (senha, convite) liberados só após carregar (Safari).

## 2026-10-11
- **Cobrança recorrente com Pagar.me** e checkout transparente no próprio design; o checkout espera o resultado da 1ª cobrança.

## 2026-09-26
- **Configurações valem de verdade:** horário comercial, regra fora do horário, SLA na nota, abandono, fechamento por inatividade.
- **Supervisor por equipe** vê só a própria equipe; registro de auditoria (quem fez o quê) com retenção.
- **LGPD:** exportação dos dados de um cliente (JSON).
- **Motor incremental:** só reprocessa conversas que podem mudar de estado; avisos de cota mensal (80/95/100 %).
- **Qualidade:** type-check e lint barram o deploy (51 erros de tipo corrigidos); varreduras de acessibilidade, teclado e 320 px; matriz de telas por papel.
- **Operação:** fumaça e backup abrem issue (`operacao`) quando falham; roteiro de teste de usabilidade.

## 2026-09-25
- Relatórios e exportações reais (sem ações falsas nem dados de amostra); tour de boas-vindas por papel.
- Acessibilidade, tema escuro, tablet e conversas no celular.
- Privacidade (parte técnica da LGPD), cabeçalhos de segurança, backup das sessões do WhatsApp.
- Teste de carga, SQLite em WAL; fumaça em produção após cada deploy e a cada 6 h.

## 2026-09-24
- **Login real:** cadastro, senha própria, recuperação, convites e bloqueio por tentativas; demonstração somente leitura.
- **WhatsApp real (Baileys)** com QR na tela e **motor de análise** sobre as conversas reais.
- **Planos:** limites por plano, pedido de troca, aviso de teste grátis.
- **Deploy seguro:** testes E2E antes de todo deploy, backup do banco antes de mexer no schema, mudanças de schema perigosas só com aprovação no repositório.
- Página de vendas sem números inventados, com planos reais.

## 2026-09-21
- Toda rota de API exige sessão; organizações isoladas e papéis aplicados em todas as rotas.

## 2026-08-03
- **Tour guiado** (boas-vindas e uma por tela do menu).
- Mutirão de correções: botões que não salvavam nada (configurações, conexões, regras de alerta, recuperação, atribuir), dados fabricados removidos, telas que quebravam (alertas, configurações).

## 2026-07-30 a 2026-07-31
- MVP: página de vendas, login, painel (visão geral, alertas, conversas, recuperação, equipe, relatórios, conexões, configurações, membros, planos, notificações, admin) ligado a APIs reais; workflow de deploy no servidor.
