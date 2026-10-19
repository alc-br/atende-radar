import { db } from '@/lib/db'
import { appUrl, sendMail } from '@/lib/mailer'
import { isIsolatedOrg } from '@/lib/sandbox'

// E-mails de cobrança e do teste grátis. Vão para os administradores ativos da empresa (quem pode contratar e trocar o
// cartão). Cada evento tem uma chave: o mesmo evento nunca sai duas vezes para a mesma pessoa (conferido no EmailOutbox
// pelo campo kind "billing:<evento>:<chave>"). Nunca lança erro: falha de e-mail não pode desfazer cobrança.

const TZ = 'America/Sao_Paulo'

export type BillingEmailEvent =
  | 'trial_3d' | 'trial_1d' | 'trial_6h' | 'trial_ended'
  | 'activated' | 'renewal_paid' | 'payment_failed' | 'renewal_canceled' | 'reactivated'
  | 'withdrawn' | 'refund_failed' | 'plan_ended' | 'card_updated'
  | 'past_due_reminder' | 'past_due_locked' | 'provider_canceled' | 'numbers_disconnected'

/** "17/10 às 14:30" no horário de Brasília. */
export function whenText(d: Date): string {
  const day = d.toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' })
  const time = d.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
  return `${day} às ${time}`
}

/** Tempo que falta em palavras: "3 dias", "5 horas", "8 minutos". */
export function leftText(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60_000))
  if (min < 60) return min === 1 ? '1 minuto' : `${min} minutos`
  const hours = Math.round(min / 60)
  if (hours < 48) return hours === 1 ? '1 hora' : `${hours} horas`
  const days = Math.ceil(ms / 86_400_000)
  return `${days} dias`
}

export const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const plansLink = () => `${appUrl()}/#plans`

/** Administradores ativos que recebem os e-mails de cobrança. */
async function recipients(orgId: string) {
  return db.organizationMember.findMany({
    where: { organizationId: orgId, role: 'admin', status: 'active' },
    select: { email: true, name: true },
    orderBy: { invitedAt: 'asc' },
    take: 20,
  })
}

interface Content { subject: string; body: (name: string) => string }

/**
 * Envia o e-mail do evento a cada administrador (uma vez por pessoa e chave). Devolve quantos saíram (ou ficaram na
 * fila). Demonstração e simulação não recebem nada.
 */
export async function billingEmail(orgId: string, event: BillingEmailEvent, key: string, content: Content): Promise<number> {
  try {
    if (await isIsolatedOrg(orgId)) return 0
    const kind = `billing:${event}:${key}`.slice(0, 190)
    let sent = 0
    for (const r of await recipients(orgId)) {
      const already = await db.emailOutbox.findFirst({ where: { kind, toEmail: r.email }, select: { id: true } })
      if (already) continue
      const first = r.name.trim().split(/\s+/)[0] || r.name
      await sendMail({ to: r.email, subject: content.subject, text: content.body(first), kind, organizationId: orgId })
      sent++
    }
    return sent
  } catch (e) {
    console.error('[billing] e-mail de cobrança falhou', event, e instanceof Error ? e.message : e)
    return 0
  }
}

/** O que acontece com a empresa bloqueada (teste vencido, plano encerrado ou pagamento em atraso). */
export const KEEP =
  'Seus dados, regras e históricos continuam guardados, e você pode exportar tudo (arquivo JSON) pelo painel, mesmo com ele bloqueado. ' +
  'Para proteger a sua privacidade e a da sua empresa, os números de WhatsApp conectados são desconectados automaticamente em até 2 dias depois do bloqueio: a partir daí as mensagens param de chegar. ' +
  'Ao contratar de novo, é só ler o QR Code para reconectar cada número.'
const SIGN = '— Equipe AtendeRadar'

// ---------- teste grátis ----------

export function trialEmail(stage: 'trial_3d' | 'trial_1d' | 'trial_6h' | 'trial_ended', trialEnd: Date, now: Date): Content {
  const at = whenText(trialEnd)
  const left = leftText(trialEnd.getTime() - now.getTime())
  if (stage === 'trial_ended') {
    return {
      subject: `Aviso da conta: período de teste encerrado em ${at.split(' ')[0]}`,
      body: (n) => `Olá, ${n}!\n\nO período de teste da sua empresa no AtendeRadar terminou em ${at} (horário de Brasília) e o painel foi bloqueado: alertas, análises, relatórios e cadastros estão parados.\n\n${KEEP}\n\nO painel é liberado na hora, do ponto onde parou, quando um plano for ativado em Planos:\n${plansLink()}\n\n${SIGN}`,
    }
  }
  if (stage === 'trial_6h') {
    return {
      subject: `Último aviso: seu teste grátis termina em ${left}`,
      body: (n) => `Olá, ${n}!\n\nEste é o último aviso: o seu teste grátis do AtendeRadar termina em ${left} (${at}, horário de Brasília).\n\nQuando o teste acabar, o painel fica bloqueado e os alertas e análises param até um plano ser contratado. ${KEEP}\n\nPara não ficar sem os alertas, contrate agora (leva 2 minutos, no cartão):\n${plansLink()}\n\n${SIGN}`,
    }
  }
  return {
    subject: `Seu teste grátis do AtendeRadar termina em ${left}`,
    body: (n) => `Olá, ${n}!\n\nO seu teste grátis do AtendeRadar termina em ${left}, em ${at} (horário de Brasília).\n\nPara continuar recebendo os alertas e as análises sem interrupção, escolha um plano antes disso. ${stage === 'trial_1d' ? 'Falta pouco: depois do fim do teste o painel fica bloqueado até a contratação.' : 'Os planos são mensais ou anuais, no cartão, e podem ser cancelados quando quiser.'}\n\nVer os planos:\n${plansLink()}\n\n${SIGN}`,
  }
}

// ---------- cobrança ----------

export function activatedEmail(planName: string, cycle: string, amountCents: number, periodEnd: Date | null, cardLast4: string | null): Content {
  const ciclo = cycle === 'annual' ? 'anual' : 'mensal'
  return {
    subject: `Plano ${planName} ativo — pagamento confirmado`,
    body: (n) => `Olá, ${n}!\n\nRecebemos o seu pagamento e o plano ${planName} (${ciclo}) já está ativo. Obrigado por escolher o AtendeRadar!\n\nValor: ${brl(amountCents)}${cardLast4 ? `\nCartão: final ${cardLast4}` : ''}${periodEnd ? `\nPróxima renovação: ${periodEnd.toLocaleDateString('pt-BR', { timeZone: TZ })}` : ''}\n\nA renovação é automática no mesmo cartão. Você pode ver as faturas, trocar o cartão ou cancelar em Planos.\n\nVocê tem 7 dias para desistir da contratação com estorno integral (direito de arrependimento).\n\nAbrir o painel:\n${appUrl()}/#plans\n\n${SIGN}`,
  }
}

export function renewalPaidEmail(planName: string, amountCents: number, periodEnd: Date | null, cardLast4: string | null): Content {
  return {
    subject: `Renovação do plano ${planName} confirmada`,
    body: (n) => `Olá, ${n}!\n\nA renovação do plano ${planName} foi paga com sucesso.\n\nValor: ${brl(amountCents)}${cardLast4 ? `\nCartão: final ${cardLast4}` : ''}${periodEnd ? `\nVálido até: ${periodEnd.toLocaleDateString('pt-BR', { timeZone: TZ })}` : ''}\n\nAs faturas ficam em Planos:\n${plansLink()}\n\n${SIGN}`,
  }
}

export function paymentFailedEmail(planName: string, reason: string | null, graceEnd: Date): Content {
  return {
    subject: 'Não conseguimos cobrar a renovação do AtendeRadar',
    body: (n) => `Olá, ${n}!\n\nA cobrança da renovação do plano ${planName} não foi aprovada${reason ? ` (motivo informado pela operadora: ${reason})` : ''}.\n\nTudo continua funcionando normalmente até ${whenText(graceEnd)} (7 dias de tolerância). Para resolver, troque o cartão em Planos: a fatura em aberto é cobrada na hora no cartão novo.\n${plansLink()}\n\nSe o pagamento não for feito até lá, o painel é bloqueado e a análise para. ${KEEP}\n\n${SIGN}`,
  }
}

/** Lembrete da inadimplência (dias 3 e 6 da tolerância). */
export function pastDueReminderEmail(planName: string, graceEnd: Date, now: Date): Content {
  const left = leftText(graceEnd.getTime() - now.getTime())
  return {
    subject: `Pagamento em atraso: o AtendeRadar será bloqueado em ${left}`,
    body: (n) => `Olá, ${n}!\n\nA renovação do plano ${planName} continua sem pagamento. Tudo segue funcionando até ${whenText(graceEnd)} (horário de Brasília), daqui a ${left}.\n\nTroque o cartão em Planos: a fatura em aberto é cobrada na hora no cartão novo e nada é interrompido.\n${plansLink()}\n\nSe o pagamento não for feito até lá, o painel é bloqueado e a análise para. ${KEEP}\n\n${SIGN}`,
  }
}

export function pastDueLockedEmail(planName: string): Content {
  return {
    subject: 'Painel do AtendeRadar bloqueado por falta de pagamento',
    body: (n) => `Olá, ${n}!\n\nA renovação do plano ${planName} ficou 7 dias sem pagamento e o painel do AtendeRadar foi bloqueado: alertas, análises, relatórios e cadastros pararam.\n\n${KEEP}\n\nPara voltar, troque o cartão (a fatura em aberto é cobrada na hora) ou contrate um plano em Planos:\n${plansLink()}\n\n${SIGN}`,
  }
}

/** A operadora encerrou a cobrança automática depois das tentativas sem sucesso. */
export function providerCanceledEmail(planName: string, graceEnd: Date | null, now: Date): Content {
  const open = !!graceEnd && graceEnd.getTime() > now.getTime()
  return {
    subject: 'A cobrança automática do AtendeRadar foi encerrada',
    body: (n) => `Olá, ${n}!\n\nDepois das tentativas sem sucesso, a cobrança automática do plano ${planName} foi encerrada pela operadora do cartão. O cartão salvo não será mais cobrado.\n\n${open ? `Tudo continua funcionando até ${whenText(graceEnd!)}. ` : ''}Para continuar usando o AtendeRadar, contrate o plano de novo em Planos:\n${plansLink()}\n\n${KEEP}\n\n${SIGN}`,
  }
}

export function numbersDisconnectedEmail(count: number): Content {
  return {
    subject: `Aviso da conta: ${count === 1 ? 'número de WhatsApp desconectado' : `${count} números de WhatsApp desconectados`}`,
    body: (n) => `Olá, ${n}!\n\nO painel da sua empresa no AtendeRadar está bloqueado há 2 dias. Para proteger a sua privacidade, ${count === 1 ? 'o número de WhatsApp conectado foi desconectado' : `os ${count} números de WhatsApp conectados foram desconectados`} do AtendeRadar. A partir de agora as mensagens não chegam mais ao sistema; no celular, o WhatsApp continua funcionando normalmente.\n\nSeus dados continuam guardados e você pode exportar tudo (arquivo JSON) pelo painel:\n${appUrl()}\n\nQuando o painel for liberado, cada número é reconectado lendo o QR Code em Conexões.\n\n${SIGN}`,
  }
}

export function renewalCanceledEmail(planName: string, until: Date): Content {
  return {
    subject: 'Renovação automática cancelada',
    body: (n) => `Olá, ${n}!\n\nA renovação automática do plano ${planName} foi cancelada. Nenhuma nova cobrança será feita.\n\nO plano continua valendo até ${until.toLocaleDateString('pt-BR', { timeZone: TZ })}. Depois disso o painel fica bloqueado até uma nova contratação. ${KEEP}\n\nMudou de ideia? Reative a renovação em Planos, sem custo agora:\n${plansLink()}\n\n${SIGN}`,
  }
}

export function reactivatedEmail(planName: string, nextChargeAt: Date, amountCents: number, cardLast4: string | null): Content {
  return {
    subject: 'Renovação automática reativada',
    body: (n) => `Olá, ${n}!\n\nA renovação automática do plano ${planName} foi reativada. Nada foi cobrado agora.\n\nPróxima cobrança: ${brl(amountCents)} em ${nextChargeAt.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}${cardLast4 ? ` no cartão final ${cardLast4}` : ''}.\n\nDetalhes em Planos:\n${plansLink()}\n\n${SIGN}`,
  }
}

export function withdrawnEmail(planName: string, amountCents: number, cardLast4: string | null): Content {
  return {
    subject: 'Contratação desfeita e estorno solicitado',
    body: (n) => `Olá, ${n}!\n\nConforme o seu pedido, a contratação do plano ${planName} foi desfeita (direito de arrependimento) e o estorno integral de ${brl(amountCents)} foi pedido à operadora do cartão${cardLast4 ? ` final ${cardLast4}` : ''}.\n\nO crédito aparece na fatura do cartão conforme o prazo do banco emissor (normalmente até 2 faturas). O painel fica bloqueado até uma nova contratação. ${KEEP}\n\nSe quiser voltar, os planos estão aqui:\n${plansLink()}\n\n${SIGN}`,
  }
}

export function refundFailedEmail(planName: string, amountCents: number): Content {
  return {
    subject: 'Recebemos o seu pedido de arrependimento',
    body: (n) => `Olá, ${n}!\n\nA renovação do plano ${planName} foi cancelada, mas a operadora do cartão não aceitou o estorno automático de ${brl(amountCents)} neste momento.\n\nNossa equipe já foi avisada e vai concluir o reembolso manualmente. Se tiver dúvidas, responda para contato@atenderadar.com.br.\n\n${SIGN}`,
  }
}

export function planEndedEmail(planName: string): Content {
  return {
    subject: `O plano ${planName} terminou`,
    body: (n) => `Olá, ${n}!\n\nO período pago do plano ${planName} chegou ao fim e, como a renovação estava cancelada, o painel do AtendeRadar foi bloqueado.\n\n${KEEP} Contratando de novo, tudo volta a funcionar na hora:\n${plansLink()}\n\n${SIGN}`,
  }
}

export function cardUpdatedEmail(cardBrand: string | null, cardLast4: string | null): Content {
  const card = [cardBrand, cardLast4 ? `final ${cardLast4}` : null].filter(Boolean).join(' ')
  return {
    subject: 'Cartão da assinatura atualizado',
    body: (n) => `Olá, ${n}!\n\nO cartão da assinatura do AtendeRadar foi trocado${card ? ` para o ${card}` : ''}. As próximas renovações serão cobradas nele.\n\nSe não foi você, troque a sua senha e escreva para contato@atenderadar.com.br.\n\nVer em Planos:\n${plansLink()}\n\n${SIGN}`,
  }
}
