import type { Scenario } from '../types'

// Cenários de horário comercial (Configurações › Horários). O início virtual é fixado num dia da semana e hora de
// São Paulo (startAt), então o resultado não depende da hora em que a bateria roda. Padrão da empresa: seg–sex
// 08:00–18:00, tolerância de 10 min antes de abrir e 30 min depois de fechar; "Cliente sem primeira resposta" = 10 min.

const FIRST = 'Cliente sem primeira resposta'

export const EXPEDIENTE: Scenario[] = [
  {
    id: 'expediente-domingo-ignora',
    title: 'Mensagem no domingo à noite (fora do expediente não conta)',
    description: 'Regra "fora do expediente: ignora". Cliente escreve domingo 20:00: domingo à noite e segunda 07:45 (antes da tolerância) não geram alerta; segunda 08:15 (25 min de expediente contando a tolerância de 07:50) gera.',
    plan: 'essencial',
    startAt: { weekday: 0, time: '20:00' },
    settings: { outsideRule: 'ignora' },
    steps: [
      { kind: 'message', at: 0, chat: 'domingo', from: 'customer', text: 'Boa noite, vocês abrem amanhã?', name: 'Cliente de Domingo' },
      { kind: 'tick', at: 60, expect: [{ noAlert: FIRST, chat: 'domingo', anyStatus: true }] },
      { kind: 'tick', at: 705, expect: [{ noAlert: FIRST, chat: 'domingo', anyStatus: true }] },
      { kind: 'tick', at: 735, expect: [{ alert: FIRST, chat: 'domingo', status: 'new', count: 1 }] },
    ],
  },
  {
    id: 'expediente-domingo-atraso',
    title: 'Mensagem no domingo com "conta como atraso"',
    description: 'Mesma mensagem de domingo 20:00, mas a empresa escolheu "fora do expediente conta como atraso": o alerta abre em 1 hora.',
    plan: 'essencial',
    startAt: { weekday: 0, time: '20:00' },
    settings: { outsideRule: 'atraso' },
    steps: [
      { kind: 'message', at: 0, chat: 'domingo', from: 'customer', text: 'Boa noite, vocês abrem amanhã?', name: 'Cliente de Domingo' },
      { kind: 'tick', at: 60, expect: [{ alert: FIRST, chat: 'domingo', status: 'new' }] },
    ],
  },
  {
    id: 'expediente-domingo-alerta',
    title: 'Mensagem no domingo com "alerta mesmo fora do expediente"',
    description: 'Regra "alerta": o alerta abre fora do expediente (relógio corrido), mas a nota do atendimento conta só o tempo de expediente.',
    plan: 'essencial',
    startAt: { weekday: 0, time: '20:00' },
    settings: { outsideRule: 'alerta' },
    steps: [
      { kind: 'message', at: 0, chat: 'domingo', from: 'customer', text: 'Boa noite, vocês abrem amanhã?', name: 'Cliente de Domingo' },
      { kind: 'tick', at: 60, expect: [{ alert: FIRST, chat: 'domingo', status: 'new' }] },
    ],
  },
  {
    id: 'expediente-sexta-noite',
    title: 'Sexta à noite até segunda de manhã',
    description: 'Regra "ignora". Cliente escreve sexta 18:40 (depois da tolerância de 18:30): a conversa não é encerrada por inatividade no fim de semana (só conta expediente) e segunda 08:10 abre o alerta (20 min de expediente).',
    plan: 'essencial',
    startAt: { weekday: 5, time: '18:40' },
    settings: { outsideRule: 'ignora' },
    steps: [
      { kind: 'message', at: 0, chat: 'sexta', from: 'customer', text: 'Boa noite, tudo bem?', name: 'Cliente de Sexta' },
      { kind: 'tick', at: 60, expect: [{ noAlert: FIRST, chat: 'sexta', anyStatus: true }] },
      { kind: 'tick', at: 1440, expect: [{ noAlert: FIRST, chat: 'sexta', anyStatus: true }] },
      { kind: 'tick', at: 3690, expect: [{ alert: FIRST, chat: 'sexta', status: 'new', count: 1 }] },
    ],
  },
  {
    id: 'expediente-tolerancia-fechamento',
    title: 'Mensagem perto de fechar (tolerância depois do expediente)',
    description: 'Regra "ignora". Cliente escreve sexta 17:50: a tolerância de 30 min depois das 18:00 ainda conta, então o alerta abre às 18:20.',
    plan: 'essencial',
    startAt: { weekday: 5, time: '17:50' },
    settings: { outsideRule: 'ignora' },
    steps: [
      { kind: 'message', at: 0, chat: 'fecha', from: 'customer', text: 'Bom dia, ainda dá tempo?', name: 'Cliente Fechando' },
      { kind: 'tick', at: 5, expect: [{ noAlert: FIRST, chat: 'fecha' }] },
      { kind: 'tick', at: 30, expect: [{ alert: FIRST, chat: 'fecha', status: 'new' }] },
    ],
  },
  {
    id: 'expediente-tolerancia-abertura',
    title: 'Mensagem antes de abrir (tolerância antes do expediente)',
    description: 'Regra "ignora". Cliente escreve segunda 07:30; o tempo conta a partir de 07:50 (10 min antes das 08:00): 07:55 sem alerta, 08:05 com alerta.',
    plan: 'essencial',
    startAt: { weekday: 1, time: '07:30' },
    settings: { outsideRule: 'ignora' },
    steps: [
      { kind: 'message', at: 0, chat: 'cedo', from: 'customer', text: 'Bom dia', name: 'Cliente Cedo' },
      { kind: 'tick', at: 25, expect: [{ noAlert: FIRST, chat: 'cedo', anyStatus: true }] },
      { kind: 'tick', at: 35, expect: [{ alert: FIRST, chat: 'cedo', status: 'new' }] },
    ],
  },
  {
    id: 'expediente-feriado',
    title: 'Feriado cadastrado não conta',
    description: 'Regra "ignora" e a quarta-feira cadastrada como feriado: cliente escreve quarta 09:00 e 3 horas depois ainda não há alerta.',
    plan: 'essencial',
    startAt: { weekday: 3, time: '09:00' },
    holidayOnStart: true,
    settings: { outsideRule: 'ignora' },
    steps: [
      { kind: 'message', at: 0, chat: 'feriado', from: 'customer', text: 'Bom dia, vocês estão abertos hoje?', name: 'Cliente do Feriado' },
      { kind: 'tick', at: 180, expect: [{ noAlert: FIRST, chat: 'feriado', anyStatus: true }] },
    ],
  },
  {
    id: 'expediente-sabado-meio-periodo',
    title: 'Empresa que abre sábado de manhã',
    description: 'A empresa liga o sábado 08:00–12:00 (regra "ignora"). Cliente escreve sábado 10:00: alerta às 10:20. Outro escreve sábado 13:00 (depois da tolerância): sem alerta até segunda.',
    plan: 'essencial',
    startAt: { weekday: 6, time: '10:00' },
    settings: { outsideRule: 'ignora', businessHours: { '6': { open: '08:00', close: '12:00', enabled: true } } },
    steps: [
      { kind: 'message', at: 0, chat: 'sabado', from: 'customer', text: 'Bom dia', name: 'Cliente de Sábado' },
      { kind: 'tick', at: 20, expect: [{ alert: FIRST, chat: 'sabado', status: 'new' }] },
      { kind: 'message', at: 180, chat: 'tarde', from: 'customer', text: 'Boa tarde', name: 'Cliente de Sábado à Tarde' },
      { kind: 'tick', at: 300, expect: [{ noAlert: FIRST, chat: 'tarde', anyStatus: true }] },
    ],
  },
]
