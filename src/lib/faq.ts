// Perguntas frequentes da página de vendas. Também vão para os dados estruturados (FAQPage) de /inicio, então o texto
// precisa ser o mesmo que aparece na tela. Respostas presas ao comportamento real do sistema: conexão pelo WhatsApp Web
// (Baileys, src/lib/whatsapp/manager.ts, que não envia mensagens) e cancelamento em Planos (src/lib/billing/service.ts).
export const FAQ: { q: string; a: string }[] = [
  { q: 'Preciso trocar meu WhatsApp?', a: 'Não. Você conecta o número que já usa hoje lendo um QR Code e continua atendendo normalmente pelo mesmo aparelho.' },
  {
    q: 'Meu WhatsApp pode ser bloqueado?',
    a: 'O risco existe e não podemos prometer que seja zero. O AtendeRadar entra como um aparelho conectado, igual ao WhatsApp Web, e só lê as conversas: não envia mensagens nem faz disparos pelo seu número. Mas a conexão não usa a API oficial do WhatsApp Business e não tem parceria com a Meta, que pode restringir números conforme as regras dela. Por isso o sistema pede que você confirme que entende esse risco antes de conectar um número.',
  },
  { q: 'Quem pode ver os dados?', a: 'Somente as pessoas que você convidar para a sua conta. Você define quem é administrador, gestor ou atendente, e cada um vê apenas o que a função permite.' },
  { q: 'Como funciona a privacidade?', a: 'As conversas ficam na sua conta e são usadas só para gerar as análises dela. Você pode excluir um contato da auditoria e apagar de forma definitiva as conversas e os dados dele quando precisar atender a um pedido de titular (LGPD).' },
  { q: 'O sistema detecta ou também responde?', a: 'Ele detecta. O AtendeRadar analisa as conversas e recomenda ações, mas não envia mensagens pelo seu número. Quem responde é sempre a sua equipe.' },
  {
    q: 'Como cancelo?',
    a: 'Pelo próprio sistema, sem falar com ninguém: o administrador da conta abre Planos e clica em Cancelar assinatura. Nada mais é cobrado e o plano continua valendo até o fim do período já pago. Nos primeiros 7 dias da contratação, dá para escolher entre usar até o fim do período ou encerrar na hora com o valor devolvido no cartão. Se mudar de ideia antes do fim do período, dá para reativar a renovação na mesma tela. No teste grátis não há nada a cancelar, porque nenhum cartão é pedido.',
  },
  {
    q: 'Tem fidelidade?',
    a: 'Não. Não há prazo mínimo nem multa de cancelamento. No plano mensal você paga mês a mês; no anual, paga os 12 meses de uma vez. Em qualquer um, cancelar só interrompe as próximas cobranças.',
  },
]
