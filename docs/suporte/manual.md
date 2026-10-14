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
- **No rodapé:** **Tour pelo sistema** e **Precisa de ajuda?**.
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
| Suporte | chamados abertos em "Falar com o suporte": ler, **Marcar como resolvido** ou **Reabrir chamado** |

**Admin › Organizações › Assinatura muda só o nosso registro. Não cria, não cancela e não altera a cobrança no
Pagar.me.** Use para estender um teste ou acertar a situação depois de conferir o painel do Pagar.me.

## Chamados de suporte

- O cliente abre o chamado em **Central de ajuda e suporte › Falar com o suporte**: Assunto, Mensagem e uma captura de
  tela opcional de até 2 MB. O limite é de 5 chamados por hora. Ele vê "Recebemos o seu chamado. A resposta chega no
  seu e-mail."
- O chamado aparece em **Admin › Suporte**. Também vai por e-mail para `SUPPORT_EMAIL`, **se essa variável estiver
  definida no servidor**. Sem ela, o chamado só existe no Admin.
- **Limitação:** não há como responder pelo sistema. Responda por e-mail, de fora, para o endereço do chamado, e depois
  clique em **Marcar como resolvido**.

## Perguntas frequentes

### "O QR Code não aparece" ou "não consigo conectar o WhatsApp"

1. **Quem está tentando?** Só o Administrador conecta.
2. **Crie a conexão, se ainda não existe:**
   - vá em **Conexões › Nova conexão**;
   - no diálogo "Nova Conexão WhatsApp", ligue o interruptor que confirma o risco da integração não oficial (é
     obrigatório);
   - clique em **Criar conexão**.
   - **Limitação:** se a criação falhar, por exemplo por ter chegado ao **limite de conexões do plano**, a tela não
     mostra mensagem nenhuma. Confira o plano em **Planos**. No Essencial cabe 1 conexão, no Growth 3 e no
     Performance 10.
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
7. **Limitação:** uma conexão **pausada** (botão Pausar) aparece com o estado "Erro". Antes de investigar, pergunte se
   alguém pausou e peça para clicar em **Retomar**.

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
  - **Limitação:** a **Nova regra** criada pela tela fica só no sistema, sem e-mail, e não há como incluir o e-mail
    pela tela.
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
2. **O servidor precisa estar com um provedor de e-mail configurado** (`MAIL_PROVIDER=resend`). Sem ele, os e-mails
   ficam na fila e **nunca saem**, para ninguém. Se nenhum cliente recebe nada, é isso: escale.
3. **Tentativas:** o sistema tenta de novo depois de 5 min, 30 min e 2 h, num total de 4 tentativas. Um e-mail
   recém-pedido pode demorar.
   - **Limitação:** não há tela que mostre os e-mails enviados. Para saber se um e-mail específico saiu é preciso
     olhar o banco ou o painel do provedor de e-mail.
4. **Por tipo:**
   - **Convite:** **Membros › Mais ações › Reenviar convite**. Limite de 10 por hora; o convite vale 7 dias.
     - **Limitação:** a mensagem de sucesso aparece mesmo quando a entrega falha.
     - Convite vencido mostra "Convite inválido ou expirado. Peça um novo ao administrador.": reenvie.
   - **Recuperar senha:** na tela de login, **Esqueceu sua senha?** abre "Recuperar acesso". O link vale **1 hora**. O
     limite é de 5 pedidos por hora por e-mail.
   - **Relatório:** em **Relatórios**, no histórico, o botão **Reenviar** manda de novo, com o PDF, aos destinatários
     do relatório.

### "Não consigo entrar"

- A mensagem é sempre "E-mail ou senha inválidos" e não diz qual dos dois está errado. Siga o caminho de **Esqueceu
  sua senha?**.
- **Limitação:** depois de 5 tentativas erradas o acesso fica **bloqueado por 15 minutos**, mas a tela continua
  mostrando a mesma mensagem. Se o cliente jura que a senha está certa, peça para esperar 15 minutos.
- A sessão dura 7 dias. Depois disso, pede login de novo.

### "Meu cartão foi recusado"

- **Na contratação:**
  - A tela mostra "Pagamento recusado: <motivo>" e diz que **nenhum valor foi cobrado**.
  - O plano não muda e a empresa continua como estava. Peça para tentar outro cartão ou falar com o banco.
  - "Muitas tentativas de pagamento. Aguarde uma hora…": é a proteção contra teste de cartões. Ele precisa esperar.
- **Na renovação:**
  - A situação vira **Pagamento pendente** e o Administrador recebe uma notificação.
  - Em **Planos** aparece "A última cobrança foi recusada: <motivo>…" com o pedido de trocar o cartão.
  - Ele deve usar **Planos › Trocar cartão**. As próximas tentativas usam o cartão novo.
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
  - Depois disso, o cadastro de novos itens fica bloqueado até contratar de novo. Os dados continuam lá.
- **Encerrar a conta e apagar tudo:** veja "Apagar os dados".

### "Quero exportar ou apagar os dados"

**De um cliente final** (pedido de um titular, LGPD). Na conversa, menu **Privacidade do cliente**, para Administrador
e Gestor:
- **Exportar dados deste cliente (JSON):** baixa um arquivo com tudo o que existe sobre aquele contato.
  - Precisa de **Configurações › Privacidade › Exportação pelo titular** ligado.
  - **Limitação:** com essa opção desligada, o navegador baixa um arquivo com uma mensagem de erro em vez dos dados.
    Se o "arquivo veio estranho", é isso.
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

- **Tour pelo sistema:**
  - fica no rodapé do menu lateral, acima de **Precisa de ajuda?**, e também no menu com o nome da pessoa;
  - é o manual passo a passo, com capítulos só do que o papel dela usa e o progresso de cada um;
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
