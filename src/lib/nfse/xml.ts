// XML da NFS-e Padrão Nacional (leiaute 1.01): a DPS (declaração que vira a nota) e o pedido de cancelamento.
// Regras do Manual Integrado §6.1.1: uma linha só, sem espaço entre tags, sem prefixo de namespace, UTF-8.
// A assinatura (sign.ts) vem depois e nada pode mudar no XML depois dela.

export const NFSE_NS = 'http://www.sped.fazenda.gov.br/nfse'
export const LEIAUTE = '1.01'

export type Ambiente = 'producao' | 'restrita'
export const tpAmb = (a: Ambiente) => (a === 'producao' ? '1' : '2')

export interface Endereco {
  ibge: string // código IBGE do município (7 dígitos)
  cep: string
  logradouro: string
  numero: string
  complemento?: string | null
  bairro: string
}

export interface DpsInput {
  ambiente: Ambiente
  dhEmi: Date
  serie: number
  nDps: number
  competencia: Date
  verAplic: string
  prestador: { cnpj: string; municipio: string; im?: string | null }
  tomador: { tipo: 'CPF' | 'CNPJ'; documento: string; nome: string; email?: string | null; endereco?: Endereco | null }
  servico: { cTribNac: string; cTribMun?: string | null; cNbs?: string | null; descricao: string }
  valorCents: number
  pTotTribSN: string // alíquota efetiva do Simples Nacional, ex. "6.00"
}

const digits = (s: string) => s.replace(/\D/g, '')

/** Texto livre: sem caracteres de controle, aspas e travessões tipográficos (já deram rejeição), espaços normalizados. */
export function cleanText(s: string, max: number): string {
  const t = s
    .normalize('NFC')
    .replace(/[–—−]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\P{C}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return t.slice(0, max).trim()
}

/** Escape de conteúdo de elemento (nenhum dado livre vai em atributo). */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const tag = (name: string, value: string | number | null | undefined) =>
  value === null || value === undefined || value === '' ? '' : `<${name}>${typeof value === 'number' ? value : esc(value)}</${name}>`

/** Data e hora no fuso de Brasília (sem horário de verão desde 2019), sem milissegundos: 2026-10-20T10:15:00-03:00 */
export function brDateTime(d: Date): string {
  const local = new Date(d.getTime() - 3 * 3600_000)
  return local.toISOString().slice(0, 19) + '-03:00'
}
export const brDate = (d: Date) => brDateTime(d).slice(0, 10)

export function money(cents: number): string {
  if (!Number.isInteger(cents) || cents <= 0) throw new Error(`valor inválido: ${cents}`)
  return (cents / 100).toFixed(2)
}

/** Id da DPS: "DPS" + município(7) + tipo de inscrição(1: 1=CPF, 2=CNPJ) + inscrição(14) + série(5) + número(15). */
export function dpsId(municipio: string, cnpj: string, serie: number, nDps: number): string {
  const id = `DPS${digits(municipio).padStart(7, '0')}2${digits(cnpj).padStart(14, '0')}${String(serie).padStart(5, '0')}${String(nDps).padStart(15, '0')}`
  if (!/^DPS\d{42}$/.test(id)) throw new Error(`Id da DPS inválido: ${id}`)
  return id
}

export function buildDps(i: DpsInput): { id: string; xml: string } {
  if (!Number.isInteger(i.serie) || i.serie < 1 || i.serie > 49999) throw new Error('série fora da faixa de aplicativo próprio (1 a 49999)')
  if (!Number.isInteger(i.nDps) || i.nDps < 1) throw new Error('número da DPS inválido')
  if (!/^\d{6}$/.test(i.servico.cTribNac)) throw new Error('código de tributação nacional deve ter 6 dígitos')
  const id = dpsId(i.prestador.municipio, i.prestador.cnpj, i.serie, i.nDps)
  const doc = digits(i.tomador.documento)
  if (i.tomador.tipo === 'CPF' ? doc.length !== 11 : doc.length !== 14) throw new Error('documento do tomador inválido')

  const e = i.tomador.endereco
  const end = e
    ? `<end><endNac><cMun>${digits(e.ibge)}</cMun><CEP>${digits(e.cep)}</CEP></endNac>${tag('xLgr', cleanText(e.logradouro, 255))}${tag('nro', cleanText(e.numero, 60))}${tag('xCpl', e.complemento ? cleanText(e.complemento, 156) : '')}${tag('xBairro', cleanText(e.bairro, 60))}</end>`
    : ''
  const toma = `<toma>${tag(i.tomador.tipo, doc)}${tag('xNome', cleanText(i.tomador.nome, 300))}${end}${tag('email', i.tomador.email ? cleanText(i.tomador.email, 80) : '')}</toma>`

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<DPS xmlns="${NFSE_NS}" versao="${LEIAUTE}"><infDPS Id="${id}">` +
    tag('tpAmb', tpAmb(i.ambiente)) +
    tag('dhEmi', brDateTime(i.dhEmi)) +
    tag('verAplic', cleanText(i.verAplic, 20)) +
    tag('serie', String(i.serie)) +
    tag('nDPS', String(i.nDps)) +
    tag('dCompet', brDate(i.competencia)) +
    tag('tpEmit', '1') +
    tag('finNFSe', '0') + // NT 009/2026: finalidade 0 = nota normal
    tag('cLocEmi', digits(i.prestador.municipio)) +
    // tpEmit=1 (o próprio prestador): sem nome e endereço do prestador (E0121/E0128); ME/EPP do Simples com apuração pelo SN
    `<prest>${tag('CNPJ', digits(i.prestador.cnpj))}${tag('IM', i.prestador.im || '')}<regTrib><opSimpNac>3</opSimpNac><regApTribSN>1</regApTribSN><regEspTrib>0</regEspTrib></regTrib></prest>` +
    toma +
    `<serv><locPrest><cLocPrestacao>${digits(i.prestador.municipio)}</cLocPrestacao></locPrest><cServ>${tag('cTribNac', i.servico.cTribNac)}${tag('cTribMun', i.servico.cTribMun || '')}${tag('xDescServ', cleanText(i.servico.descricao, 2000))}${tag('cNBS', i.servico.cNbs || '')}</cServ></serv>` +
    // ISS devido no município, sem retenção; ME/EPP não informa alíquota (E0613) e informa o total de tributos pelo percentual do SN (E0712)
    `<valores><vServPrest><vServ>${money(i.valorCents)}</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun><totTrib><pTotTribSN>${i.pTotTribSN}</pTotTribSN></totTrib></trib></valores>` +
    `</infDPS></DPS>`
  return { id, xml }
}

export const CANCEL_REASONS = { erro: '1', naoPrestado: '2', outros: '9' } as const

export interface CancelInput {
  ambiente: Ambiente
  dhEvento: Date
  verAplic: string
  cnpj: string
  chave: string
  motivo: keyof typeof CANCEL_REASONS
  texto: string // 15 a 255 caracteres
}

/** Pedido de registro do evento 101101 (cancelamento). Id: "PRE" + chave(50) + código do evento(6). */
export function buildCancel(c: CancelInput): { id: string; xml: string } {
  if (!/^\d{50}$/.test(c.chave)) throw new Error('chave de acesso inválida')
  const motivo = cleanText(c.texto, 255)
  if (motivo.length < 15) throw new Error('motivo do cancelamento precisa de pelo menos 15 caracteres')
  const id = `PRE${c.chave}101101`
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<pedRegEvento xmlns="${NFSE_NS}" versao="${LEIAUTE}"><infPedReg Id="${id}">` +
    tag('tpAmb', tpAmb(c.ambiente)) +
    tag('verAplic', cleanText(c.verAplic, 20)) +
    tag('dhEvento', brDateTime(c.dhEvento)) +
    tag('CNPJAutor', digits(c.cnpj)) +
    tag('chNFSe', c.chave) +
    `<e101101><xDesc>Cancelamento de NFS-e</xDesc>${tag('cMotivo', CANCEL_REASONS[c.motivo])}${tag('xMotivo', motivo)}</e101101>` +
    `</infPedReg></pedRegEvento>`
  return { id, xml }
}
