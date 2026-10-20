// Sistema Nacional falso, para os testes automáticos (NFSE_FAKE=1): mesmas respostas do cliente real, sem rede.
// Confere a assinatura de verdade (com o certificado em uso) e guarda as notas na memória do processo.
// Para provar os caminhos de erro, o nome do tomador decide o desfecho:
//   contém "NFSE-REJEITAR"      → rejeição E0000 (como uma regra de negócio do governo)
//   contém "NFSE-QUEDA"         → queda de rede no 1º envio; a nota fica emitida lá (o reenvio descobre pela DPS)
//   contém "NFSE-CANCEL-FALHA"  → cancelamento recusado E0000 (como fora do prazo)
import type { EmissaoOk, EventoOk, Falha } from './client'
import type { Certificado } from './sign'
import { verifyXml } from './sign'

interface FakeNota { chave: string; idDps: string; nfseXml: string; cancelada: boolean; tomador: string }
const g = globalThis as { __nfseFake?: { seq: number; porChave: Map<string, FakeNota>; porDps: Map<string, string>; quedas: Set<string> } }
const state = () => (g.__nfseFake ??= { seq: 0, porChave: new Map(), porDps: new Map(), quedas: new Set() })

const pick = (xml: string, tag: string) => new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml)?.[1] ?? ''
const falha = (codigo: string, descricao: string, status = 400): Falha => ({ ok: false, status, erros: [{ codigo, descricao }], raw: JSON.stringify({ erros: [{ codigo, descricao }] }) })

export async function emitir(cert: Certificado, dps: string): Promise<EmissaoOk | Falha> {
  if (!verifyXml(dps, cert.certPem)) return falha('E1235', 'Assinatura inválida (simulado)')
  const s = state()
  const idDps = /Id="(DPS\d{42})"/.exec(dps)?.[1] ?? ''
  const tomador = pick(dps.split('<toma>')[1] ?? '', 'xNome')
  if (s.porDps.has(idDps)) return falha('E0014', 'Conjunto de Série, Número, Código do Município Emissor e CNPJ informado na DPS já existe (simulado)')
  if (tomador.includes('NFSE-REJEITAR')) return falha('E0000', 'Rejeição simulada para teste')
  const n = ++s.seq
  const chave = (pick(dps, 'cLocEmi') + '2' + '2' + pick(dps, 'CNPJ').padStart(14, '0') + String(n).padStart(13, '0')).padEnd(50, '0').slice(0, 50)
  const nfseXml = `<?xml version="1.0" encoding="UTF-8"?><NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infNFSe Id="NFS${chave}"><nNFSe>${n}</nNFSe><ambGer>2</ambGer><DPS>${dps.replace(/^<\?xml[^>]*>/, '')}</DPS></infNFSe></NFSe>`
  s.porChave.set(chave, { chave, idDps, nfseXml, cancelada: false, tomador })
  s.porDps.set(idDps, chave)
  if (tomador.includes('NFSE-QUEDA') && !s.quedas.has(idDps)) {
    s.quedas.add(idDps)
    throw new Error('socket hang up (simulado)')
  }
  return { ok: true, chave, nfseXml, idDps, alertas: [] }
}

export async function registrarEvento(cert: Certificado, chave: string, pedido: string): Promise<EventoOk | Falha> {
  if (!verifyXml(pedido, cert.certPem)) return falha('E1235', 'Assinatura inválida (simulado)')
  const nota = state().porChave.get(chave)
  if (!nota) return falha('E1831', 'O evento não pode ser recepcionado pois a NFS-e indicada não existe (simulado)')
  if (nota.cancelada) return falha('E1840', 'NFS-e já cancelada (simulado)')
  if (nota.tomador.includes('NFSE-CANCEL-FALHA')) return falha('E0000', 'Cancelamento recusado (simulado)')
  nota.cancelada = true
  return { ok: true, eventoXml: `<?xml version="1.0" encoding="UTF-8"?><evento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infEvento><chNFSe>${chave}</chNFSe><tpEvento>101101</tpEvento></infEvento></evento>` }
}

export async function chavePorDps(idDps: string): Promise<{ status: number; chave: string | null; raw: string }> {
  const chave = state().porDps.get(idDps) ?? null
  return { status: chave ? 200 : 404, chave, raw: '' }
}

export async function consultarNfse(chave: string): Promise<{ status: number; nfseXml: string | null; raw: string }> {
  const nota = state().porChave.get(chave)
  return { status: nota ? 200 : 404, nfseXml: nota?.nfseXml ?? null, raw: '' }
}
