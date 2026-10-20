// Configuração da emissão de NFS-e (variáveis NFSE_* no .env). Desligada por padrão.
import { generateKeyPairSync } from 'node:crypto'
import forge from 'node-forge'
import type { Ambiente } from './xml'
import { loadCertificateFile, type Certificado } from './sign'

export interface NfseConfig {
  ambiente: Ambiente
  fake: boolean // NFSE_FAKE=1: sem rede e com certificado gerado na hora (testes automáticos)
  certFile: string
  certPassword: string
  cnpj: string
  municipio: string
  im: string | null
  serie: number
  cTribNac: string
  cTribMun: string | null
  cNbs: string | null
  pTotTribSN: string
  desde: Date // só faturas pagas a partir daqui (ligar a emissão não gera notas do passado)
}

export type ConfigResult = { ok: true; cfg: NfseConfig } | { ok: false; off: boolean; error: string }

export function nfseConfig(env: Record<string, string | undefined> = process.env): ConfigResult {
  const amb = (env.NFSE_AMBIENTE || 'off').trim()
  if (amb === 'off' || !amb) return { ok: false, off: true, error: 'Emissão de NFS-e desligada (NFSE_AMBIENTE=off)' }
  if (amb !== 'restrita' && amb !== 'producao') return { ok: false, off: false, error: `NFSE_AMBIENTE inválido: ${amb} (use off, restrita ou producao)` }
  const fake = env.NFSE_FAKE === '1'
  if (fake && amb === 'producao') return { ok: false, off: false, error: 'NFSE_FAKE só vale com NFSE_AMBIENTE=restrita' }
  const desde = new Date(env.NFSE_DESDE || '')
  if (Number.isNaN(desde.getTime())) return { ok: false, off: false, error: 'NFSE_DESDE ausente ou inválido (data ISO a partir da qual as faturas pagas geram nota)' }
  const serie = Number(env.NFSE_SERIE || '1')
  if (!Number.isInteger(serie) || serie < 1 || serie > 49999) return { ok: false, off: false, error: 'NFSE_SERIE deve ser de 1 a 49999' }
  const cTribNac = (env.NFSE_CTRIB_NAC || '010501').replace(/\D/g, '')
  if (cTribNac.length !== 6) return { ok: false, off: false, error: 'NFSE_CTRIB_NAC deve ter 6 dígitos' }
  const pTot = Number((env.NFSE_P_TOT_TRIB_SN || '6.00').replace(',', '.'))
  if (!(pTot >= 0 && pTot <= 100)) return { ok: false, off: false, error: 'NFSE_P_TOT_TRIB_SN inválido' }
  const cnpj = (env.NFSE_CNPJ || '').replace(/\D/g, '')
  const municipio = (env.NFSE_MUNICIPIO || '').replace(/\D/g, '')
  if (cnpj.length !== 14) return { ok: false, off: false, error: 'NFSE_CNPJ ausente ou inválido' }
  if (municipio.length !== 7) return { ok: false, off: false, error: 'NFSE_MUNICIPIO deve ser o código IBGE (7 dígitos)' }
  if (!fake && (!env.NFSE_CERT_FILE || !env.NFSE_CERT_PASSWORD)) return { ok: false, off: false, error: 'NFSE_CERT_FILE e NFSE_CERT_PASSWORD são obrigatórios' }
  return {
    ok: true,
    cfg: {
      ambiente: amb,
      fake,
      certFile: env.NFSE_CERT_FILE || '',
      certPassword: env.NFSE_CERT_PASSWORD || '',
      cnpj,
      municipio,
      im: env.NFSE_IM?.trim() || null,
      serie,
      cTribNac,
      cTribMun: env.NFSE_CTRIB_MUN?.trim() || null,
      cNbs: env.NFSE_CNBS?.replace(/\D/g, '') || null,
      pTotTribSN: pTot.toFixed(2),
      desde,
    },
  }
}

const g = globalThis as { __nfseCert?: { key: string; cert: Certificado } }

/** Certificado em memória (lido uma vez por arquivo+senha). No modo falso, um autoassinado com o CNPJ configurado. */
export function certificate(cfg: NfseConfig): Certificado {
  const key = cfg.fake ? `fake:${cfg.cnpj}` : `${cfg.certFile}:${cfg.certPassword.length}`
  if (g.__nfseCert?.key === key) return g.__nfseCert.cert
  const cert = cfg.fake ? fakeCertificate(cfg.cnpj) : loadCertificateFile(cfg.certFile, cfg.certPassword)
  g.__nfseCert = { key, cert }
  return cert
}

function fakeCertificate(cnpj: string): Certificado {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } })
  const key = forge.pki.privateKeyFromPem(privateKey) as forge.pki.rsa.PrivateKey
  const c = forge.pki.createCertificate()
  c.publicKey = forge.pki.setRsaPublicKey(key.n, key.e)
  c.serialNumber = '01'
  c.validity.notBefore = new Date(Date.now() - 86400_000)
  c.validity.notAfter = new Date(Date.now() + 365 * 86400_000)
  const attrs = [{ name: 'commonName', value: `EMPRESA DE TESTE:${cnpj}` }]
  c.setSubject(attrs)
  c.setIssuer(attrs)
  c.sign(key, forge.md.sha256.create())
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(c)).getBytes()
  return {
    keyPem: privateKey,
    certPem: forge.pki.certificateToPem(c),
    certB64: forge.util.encode64(der),
    cnpj,
    titular: 'EMPRESA DE TESTE',
    validoDe: c.validity.notBefore,
    validoAte: c.validity.notAfter,
  }
}
