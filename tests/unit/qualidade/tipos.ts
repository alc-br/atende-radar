// Conjunto rotulado para medir a qualidade dos alertas que dependem do TEXTO (os de tempo são exatos e têm testes
// próprios). Cada conversa foi rotulada pelo que um gestor esperaria do sistema, não pelo que as regras fazem hoje.
//
// Como rotular (o usuário valida estes critérios e os rótulos):
//  · pedido — o que o cliente quer e que vira alerta se ficar sem resposta:
//      'alta'  = quer comprar, fechar, agendar/reagendar, reservar ou negociar condição → "Cliente com alta intenção sem resposta"
//                (pedir horário/vaga para marcar conta como 'alta'; perguntar o preço E querer marcar também é 'alta')
//      'preco' = pergunta preço/valor/orçamento/forma de pagamento, sem ainda querer fechar → "Orçamento pendente"
//      'outro' = informação, suporte, reclamação, cancelamento, pós-venda, conversa social
//  · frustrado — o cliente está irritado/impaciente AGORA (nas últimas mensagens), não só em algum momento passado.
//  · promessa — a empresa se comprometeu a fazer algo DEPOIS (verificar, retornar, enviar mais tarde). Mandar algo na
//    mesma hora ("segue o endereço") não é promessa.
//
// As conversas são escritas à mão, com o jeito de escrever no WhatsApp (abreviações, sem acento, erros). Conjunto
// sintético: quando houver clientes reais, juntar conversas reais anonimizadas (com consentimento) e re-medir.

export type Quem = 'c' | 'e' // c = cliente, e = empresa
export interface ConversaRotulada {
  id: string
  seg: string
  msgs: Array<[Quem, string]>
  pedido: 'alta' | 'preco' | 'outro'
  frustrado: boolean
  promessa: boolean
  obs?: string
}
