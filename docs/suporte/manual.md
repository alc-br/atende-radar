# Manual de suporte

Para quem atende os clientes do AtendeRadar. Cada resposta diz **o que perguntar**, **onde olhar** e **o que fazer**.
Os caminhos das telas usam "›", como aparecem para o cliente. Tudo aqui foi conferido no código em 14/10/2026. Os
pontos marcados como **Limitação** são comportamentos atuais que confundem o cliente; não prometa o que eles não fazem.

Problema que atinge várias empresas ao mesmo tempo, como o site fora do ar, muitas conexões caindo ou pagamentos sem
ativar, não é caso de suporte individual: siga `docs/operacao/incidente.md`.

## Onde as coisas ficam

**Menu lateral do cliente:**
- Visão Geral, Alertas, Conversas, Recuperação, Equipe, Relatórios e Conexões.
- Em **Administração**: Configurações, Membros, Equipes, Planos e Admin. **Admin** só aparece para o operador da
  plataforma.
- **No rodapé:** **Treinamento do sistema** e **Precisa de ajuda?**.
- **Menu com o nome da pessoa** (no topo):
  - Meu perfil;
  - Central de ajuda e suporte;
  - Tour desta tela e Tour de boas-vindas.

**Papéis:** Administrador, Gestor, Supervisor, Analista, Membro, Atendente e Visualizador. **Só o Administrador**
mexe em cobrança (Planos), membros e conexões do WhatsApp. Se o cliente "não vê" um botão, pergunte primeiro qual é o
papel dele.

**Admin, para o operador da plataforma** (só os e-mails em `PLATFORM_ADMIN_EMAILS`):

| Aba | Para que serve no suporte |
|---|---|
| Visão Geral | números gerais e **Exclusões agendadas** (empresas pedindo para encerrar a conta) |
| Organizações | escolher a empresa; em **Assinatura**: Plano, Situação e **Válido até** (estende o teste grátis), com **Salvar assinatura** |
| Usuários Globais | lista e filtra as pessoas cadastradas em todas as empresas |
| Sistema | saúde do banco, da autenticação e do armazenamento |
| Produto | funil, retenção semanal, uso por tela, guia de telas, custo de IA |
| Suporte | chamados de "Falar com o suporte": ler, **responder por e-mail**, **Fechar chamado** ou **Reabrir chamado** |

**Admin › Organizações › Assinatura muda só o nosso registro. Não cria, não cancela e não altera a cobrança no
Pagar.me.** Use para estender um teste ou acertar a situação depois de conferir o painel do Pagar.me.

## Chamados de suporte

- O cliente abre o chamado em **Central de ajuda e suporte › Falar com o suporte**: Assunto, Mensagem e uma captura de
  tela opcional de até 2 MB. O limite é de 5 chamados por hora. Ele vê "Recebemos o seu chamado. A resposta chega no
  seu e-mail."
- O chamado aparece em **Admin › Suporte**. Também vai por e-mail para `SUPPORT_EMAIL`, **se essa variável estiver
  definida no servidor**. Sem ela, o chamado só existe no Admin.
- **Responder:** abra o chamado em **Admin › Suporte**, escreva em **Responder por e-mail** e clique em **Enviar
  resposta**.
  - A resposta vai por e-mail para quem abriu o chamado, com a mensagem original no fim, e fica listada em
    **Respostas enviadas** com a situação do e-mail.
  - Marque **Fechar o chamado ao enviar** se o assunto terminou. Sem essa opção, o chamado passa para **Respondido**.
  - "O e-mail ficou na fila" quer dizer que o servidor está sem provedor de e-mail (veja "O e-mail não chegou"). "Não
    foi entregue": o sistema tenta enviar de novo sozinho.
- **Situação do chamado:** **Aberto** (novo), **Respondido** (já tem resposta) e **Fechado**. O cliente vê a mesma
  situação na Central de ajuda. Use **Fechar chamado** e **Reabrir chamado** no próprio chamado.
- **Limitação:** a resposta chega ao cliente **só por e-mail**; ele não a lê dentro do sistema. O chamado também não
  guarda qual operador respondeu.

## Perguntas frequentes

### "O QR Code não aparece" ou "não consigo conectar o WhatsApp"

1. **Quem está tentando?** Só o Administrador conecta.
2. **Crie a conexão, se ainda não existe:**
   - vá em **Conexões › Nova conexão**;
   - no diálogo "Nova conexão WhatsApp", ligue o interruptor que confirma o risco da integração não oficial (é
     obrigatório);
   - clique em **Criar conexão**.
   - Se a criação falhar, o motivo aparece em vermelho dentro do próprio diálogo. No **limite de conexões do plano** a
     mensagem diz quantas o plano permite e traz o botão **Ver planos**. No Essencial cabe 1 conexão, no Growth 3 e
     no Performance 10.
3. **Leia o QR:** o diálogo "Conectar o WhatsApp" busca o QR a cada 3 segundos.
   - O QR apareceu: o cliente lê pelo celular em **WhatsApp › Aparelhos conectados › Conectar um aparelho**. Quando
     conecta, aparece "WhatsApp conectado!".
   - Em 45 segundos sem QR, a tela mostra "O QR Code não chegou." e diz que o serviço de conexão do WhatsApp pode estar
     desligado.
     - Se acontece com um cliente só, peça para fechar e clicar em **Gerar QR** no cartão da conexão.
     - Se acontece com vários, é incidente (`incidente.md`, seção 4).
4. **O QR expirou sem ser lido:** depois de vários QRs sem leitura, a sessão para de gerar QR e a conexão fica "QR
   necessário". Basta clicar em **Gerar QR** de novo, com o celular na mão.
5. **O número já está conectado e o cliente quer trocar de aparelho:** **Reconectar** e depois **Gerar QR**.
6. **Diagnóstico:**
   - o botão **Diagnóstico** no cartão da conexão mostra Socket, Heartbeat, Filas pendentes, Eventos, Integração e
     Mensagens, além de "Ações recomendadas";
   - peça uma captura dessa tela.
   - **"Degradada" com motivo de credenciais** é problema do servidor, não do cliente: escale.
   - **"Bloqueada"**: o número foi bloqueado pelo WhatsApp. Não há o que fazer pelo sistema.
7. **"Pausada":** alguém clicou em **Pausar** no cartão da conexão. Antes de investigar, pergunte se foi de propósito;
   para voltar, basta clicar em **Retomar**.

### "O alerta não chegou"

Primeiro, onde ele esperava o alerta:

- **No sistema** (sino e tela Alertas):
  - confira em **Alertas**, nas abas Ativos, Em acompanhamento, Resolvidos e Ignorados;
  - a regra precisa estar **Ativa** em **Alertas › Regras**.
- **A conversa precisa ter entrado.** Se a conexão do WhatsApp estava fora, a mensagem não foi registrada e não gera
  alerta.
- **Análise pausada pela cobrança.** Se o sino mostrou "Teste grátis encerrado: análise pausada", "Assinatura
  encerrada: análise pausada" ou "Limite de conversas do plano atingido", nenhum alerta novo é gerado até a empresa
  contratar ou mudar de plano. Veja "Trocar de plano".
- **Por e-mail:**
  - o e-mail só sai para regras com o canal **e-mail**; 6 das 8 regras que vêm prontas já têm;
  - o canal se escolhe em **Avisar por**, ao criar a regra (**Nova regra**) ou ao editá-la (botão de editar ao lado da
    regra, em **Alertas › Regras**);
  - **Quem recebe:** os membros ativos que **podem ver aquele alerta** pelo papel e pela equipe, e que estão com
    **Meu perfil › Alertas por e-mail** ligado.
  - **Configurações › Notificações › Destinatários não é usado** (a tela diz "uso futuro").
  - **Horários de Silêncio** (Configurações › Notificações): no período de silêncio os e-mails ficam retidos e chegam
    depois. Em branco, o silêncio vale fora do horário de atendimento. Só passam no silêncio os alertas **críticos**,
    se **Alertas imediatos** estiver ligado.
  - **Resumo de alertas:** no máximo um e-mail por regra a cada intervalo, que por padrão é de 15 minutos. Alertas
    retidos por mais de 72 h não são mais enviados.
  - **A pessoa se descadastrou** pelo link do e-mail: ela religa em **Meu perfil › Alertas por e-mail**.
  - Se a entrega falhou de vez, quem deveria receber ganha a notificação "Alerta por e-mail não foi entregue". Siga
    "O e-mail não chegou".

### "O e-mail não chegou" (convite, recuperação de senha, alerta, relatório)

1. **Peça para olhar o spam e a aba Promoções.**
2. **O servidor precisa estar com um provedor de e-mail configurado** (`MAIL_PROVIDER=brevo`). Sem ele, os e-mails
   ficam na fila e **nunca saem**, para ninguém. Se nenhum cliente recebe nada, é isso: escale.
3. **Tentativas:** o sistema tenta de novo depois de 5 min, 30 min e 2 h, num total de 4 tentativas. Um e-mail
   recém-pedido pode demorar.
   - **Limitação:** não há tela que mostre os e-mails enviados. Para saber se um e-mail específico saiu é preciso
     olhar o banco ou o painel do provedor de e-mail.
4. **Por tipo:**
   - **Convite:** **Membros › Mais ações › Reenviar convite**. Limite de 10 por hora; o convite vale 7 dias.
     - Se o provedor recusar o e-mail, a tela avisa em vermelho que ele "não foi entregue" e copia o link do
       convite para o administrador repassar. O sistema também tenta enviar de novo sozinho.
     - Convite vencido mostra "Convite inválido ou expirado. Peça um novo ao administrador.": reenvie.
   - **Recuperar senha:** na tela de login, **Esqueceu sua senha?** abre "Recuperar acesso". O link vale **1 hora**. O
     limite é de 5 pedidos por hora por e-mail.
   - **Relatório:** em **Relatórios**, no histórico, o botão **Reenviar** manda de novo, com o PDF, aos destinatários
     do relatório.

### "Não consigo entrar"

- A mensagem é sempre "E-mail ou senha inválidos" e não diz qual dos dois está errado. Siga o caminho de **Esqueceu
  sua senha?**.
- Depois de **5 tentativas erradas** o acesso fica **bloqueado por 15 minutos** e a tela mostra "Muitas tentativas de
  entrar. Tente novamente em X minutos". Nem a senha certa entra antes disso; recuperar a senha desbloqueia na hora.
  - O aviso aparece igual mesmo para um e-mail que **não tem conta**. Ele não confirma que o cadastro existe.
  - O mesmo aviso aparece quando muitas senhas erradas saem da mesma rede (proteção contra ataque).
- A sessão dura 7 dias. Depois disso, pede login de novo.

### "Meu cartão foi recusado"

- **Na contratação:**
  - A tela mostra "Pagamento recusado: <motivo>" e diz que **nenhum valor foi cobrado**.
  - O plano não muda e a empresa continua como estava. Peça para tentar outro cartão ou falar com o banco.
  - "Muitas tentativas de pagamento. Aguarde uma hora…": é a proteção contra teste de cartões. Ele precisa esperar.
- **Na renovação:**
  - A situação vira **Pagamento pendente** e o Administrador recebe uma notificação e um e-mail.
  - **Durante 7 dias tudo continua funcionando** (inclusive cadastrar). A faixa do topo mostra até quando.
    Lembretes no 3º e no 6º dia.
  - Ele deve usar **Planos › Trocar cartão**: a fatura em aberto é **cobrada na hora** no cartão novo e tudo volta
    ao normal. Se o cartão novo também for recusado, a tela avisa.
  - Passados os 7 dias sem pagamento, o painel é **bloqueado** ("O pagamento da assinatura está em atraso há mais de
    7 dias"): só Planos, Meu perfil e Ajuda. Trocar o cartão (ou contratar) libera na hora.
  - Se a operadora já encerrou a cobrança automática depois das tentativas, Planos mostra **Assinar o plano** no lugar
    de "Trocar cartão": ele contrata de novo.
  - No Admin, o filtro **Inadimplentes** em Organizações lista essas empresas.
- **"Paguei e continua em teste ou pendente":**
  - O sistema confere o pagamento sozinho ao abrir **Planos** (se a última conferência tiver mais de 2 minutos) e a
    cada 15 minutos.
  - Peça para abrir **Planos** de novo depois de alguns minutos.
  - Se passar de meia hora, escale com o nome da empresa e o horário do pagamento.
- O número do cartão nunca passa pelo nosso servidor. Não peça dados de cartão ao cliente em hipótese nenhuma.

### "Quero trocar de plano"

- Só o Administrador, em **Planos**:
  - **Assinar**, quando a empresa ainda não tem cobrança automática (por exemplo, no teste grátis);
  - **Mudar para este plano**, quando já tem uma assinatura ativa;
  - **Solicitar troca**, quando o pagamento on-line está desligado no servidor.
- Os planos são **Essencial**, **Growth** e **Performance**.
- **A troca cobra o plano novo inteiro na hora.** Não há desconto proporcional ao período restante. O plano antigo é
  cancelado no Pagar.me quando o novo é pago.
- **Rebaixar com uso acima do limite** (mais conexões, atendentes ativos ou regras próprias do que o plano novo
  permite): a tela recusa com "Remova o excedente…" e lista o que sobra. Ele precisa remover antes. Nada é cobrado
  nesse caso.
- **Limite do plano atingido** (conexões, atendentes, regras, exportações no mês): a tela avisa e o cadastro novo é
  recusado até trocar de plano.
- **Teste grátis:**
  - a faixa no topo mostra "Teste grátis: N dias restantes";
  - para **estender**, use **Admin › Organizações › empresa › Assinatura › Válido até** e **Salvar assinatura**;
  - isso não envolve cobrança.

### "Quero cancelar"

- **Só a renovação:**
  - Vá em **Planos › Cancelar renovação**. Só o Administrador.
  - Para as próximas cobranças na hora; **o plano continua valendo até o fim do período pago**. A situação mostra
    "Não renova".
  - Depois disso, o painel é bloqueado até contratar de novo. Os dados continuam lá.
- **Encerrar a conta e apagar tudo:** veja "Apagar os dados".

### "Meu painel está bloqueado" (teste vencido, plano encerrado ou pagamento em atraso)

- O Administrador vê só Planos, Meu perfil e Ajuda; os demais papéis veem o aviso para falar com o Administrador.
- Nada é analisado e nenhum alerta ou relatório é enviado. **Os dados continuam guardados.**
- **Exportar tudo:** o Administrador baixa um arquivo JSON com todos os dados da empresa pelo botão
  **Exportar todos os dados (JSON)** no próprio aviso (também em Configurações › Privacidade). É direito dele.
- **Privacidade:** 2 dias depois do bloqueio, os números de WhatsApp são **desconectados automaticamente** e as
  mensagens param de chegar. Ao contratar, o painel volta na hora e ele lê o QR Code de novo em
  **Conexões › Reconectar**.

### "Quero exportar ou apagar os dados"

**De um cliente final** (pedido de um titular, LGPD). Na conversa, menu **Privacidade do cliente**, para Administrador
e Gestor:
- **Exportar dados deste cliente (JSON):** baixa um arquivo com tudo o que existe sobre aquele contato.
  - Precisa de **Configurações › Privacidade › Exportação pelo titular** ligado.
  - Com essa opção desligada, nada é baixado e a tela avisa que a exportação está desligada em **Configurações ›
    Privacidade**.
- **Parar de monitorar este contato:** a conversa some das telas e das análises e as próximas mensagens dele não são
  guardadas. O que já existe **não** é apagado.
- **Apagar dados deste cliente:** remove de vez conversas, mensagens, alertas, promessas e itens de recuperação daquele
  contato. **Não dá para desfazer.** Se a pessoa escrever de novo, ela volta como contato novo; para evitar, use
  também **Parar de monitorar**.
- **Outras opções** em **Configurações › Privacidade**: tempo de guarda (retenção), **Mascaramento automático** de
  dados sensíveis, números excluídos (nunca monitorados), base legal e encarregado (DPO).

**Da empresa inteira (encerrar a conta):**
1. Só o **dono** da empresa: **Configurações › Privacidade › Zona de perigo · Encerrar conta e apagar a empresa**.
2. Ele confirma com a senha e o nome da empresa, depois clica em **Sim, apagar a empresa**.
3. **Na hora:** a renovação é cancelada e o WhatsApp é desconectado. Uma faixa no topo mostra a data da exclusão para
   todos os membros. Só o dono vê o botão **Desistir da exclusão**.
   - Desistir **não** devolve a assinatura nem as conexões. Ele precisa contratar de novo em **Planos** e ler o QR de
     novo em **Conexões**; a própria tela avisa isso.
4. **Depois de 7 dias** tudo é apagado de vez e não há como recuperar. As exclusões pendentes aparecem em
   **Admin › Visão Geral › Exclusões agendadas**.
5. Antes de confirmar, sugira exportar os relatórios e os indicadores que ele quiser guardar.

### "Como funciona o tour?" ou "quero ver a explicação de novo"

- **Treinamento do sistema:**
  - fica no rodapé do menu lateral, acima de **Precisa de ajuda?**, e também no menu com o nome da pessoa;
  - são as aulas passo a passo, só do que o papel dela usa e o progresso de cada um;
  - dá para parar e continuar depois, até em outro aparelho.
- **Tour desta tela:** no menu com o nome da pessoa, mostra o guia rápido da tela aberta.
- **Tour de boas-vindas:** no mesmo menu, repete a apresentação inicial, que muda conforme o papel.
- **Central de ajuda e suporte** (ou **Precisa de ajuda?**): artigos com busca, inclusive o **glossário**, atalhos
  para os tours e o **Falar com o suporte**. Ela abre dentro do painel; não há um endereço `/ajuda` para mandar por
  link.

## Antes de escalar

Mande para quem cuida da operação:
- nome da empresa e e-mail de quem relatou;
- papel da pessoa;
- tela e caminho;
- horário (de Brasília);
- o texto exato da mensagem na tela;
- uma captura de tela, quando der (no caso de conexão, a do **Diagnóstico**).

Nunca peça senha, código do WhatsApp nem dados de cartão.
