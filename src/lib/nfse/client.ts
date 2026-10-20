// Cliente da API do Sistema Nacional da NFS-e (Sefin Nacional e ADN), autenticado pelo certificado A1 (TLS mútuo).
// O fetch do Node não aceita certificado de cliente; por isso node:https.
import https from 'node:https'
import { gzipSync, gunzipSync } from 'node:zlib'
import type { Ambiente } from './xml'
import type { Certificado } from './sign'

export const HOSTS: Record<Ambiente, { sefin: string; adn: string }> = {
  restrita: { sefin: 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional', adn: 'https://adn.producaorestrita.nfse.gov.br' },
  producao: { sefin: 'https://sefin.nfse.gov.br/SefinNacional', adn: 'https://adn.nfse.gov.br' },
}

export interface Mensagem {
  codigo: string
  descricao: string
  complemento?: string
}

export interface ApiResult {
  status: number
  body: Record<string, unknown> | null
  raw: string
}

export const gz64 = (xml: string) => gzipSync(Buffer.from(xml, 'utf8')).toString('base64')
export const ungz64 = (b64: string) => gunzipSync(Buffer.from(b64, 'base64')).toString('utf8')

const agents = new WeakMap<Certificado, https.Agent>()
function agentFor(cert: Certificado) {
  let a = agents.get(cert)
  if (!a) {
    // A cadeia da ICP-Brasil não está no repositório de CAs do Node; o servidor é identificado pelo nome do host
    // (gov.br) e a autenticação que importa aqui é a nossa, pelo certificado do cliente.
    a = new https.Agent({ key: cert.keyPem, cert: cert.certPem, rejectUnauthorized: false, keepAlive: true, maxSockets: 4 })
    agents.set(cert, a)
  }
  return a
}

export function request(cert: Certificado, method: 'GET' | 'POST' | 'HEAD', url: string, body?: unknown, timeoutMs = 60_000): Promise<ApiResult> {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : Buffer.from(JSON.stringify(body), 'utf8')
    const req = https.request(
      url,
      {
        method,
        agent: agentFor(cert),
        headers: { Accept: 'application/json', ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}) },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8')
          let parsed: Record<string, unknown> | null = null
          try {
            parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : null
          } catch {
            parsed = null
          }
          resolve({ status: res.statusCode || 0, body: parsed, raw })
        })
      },
    )
    req.on('timeout', () => req.destroy(new Error(`tempo esgotado (${timeoutMs} ms) em ${method} ${url}`)))
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

/** Junta erros e alertas, que a API devolve com chaves em maiúsculas ou minúsculas e às vezes num objeto só. */
export function mensagens(body: Record<string, unknown> | null, ...keys: string[]): Mensagem[] {
  if (!body) return []
  const out: Mensagem[] = []
  for (const k of keys) {
    const v = body[k] ?? body[k.charAt(0).toUpperCase() + k.slice(1)]
    const list = Array.isArray(v) ? v : v ? [v] : []
    for (const item of list) {
      const o = item as Record<string, unknown>
      const pick = (n: string) => String(o[n] ?? o[n.charAt(0).toUpperCase() + n.slice(1)] ?? '').trim()
      const codigo = pick('codigo')
      const descricao = pick('descricao') || pick('mensagem')
      if (codigo || descricao) out.push({ codigo, descricao, ...(pick('complemento') ? { complemento: pick('complemento') } : {}) })
    }
  }
  return out
}

export const describe = (m: Mensagem[]) => m.map((e) => `${e.codigo}: ${e.descricao}${e.complemento ? ` (${e.complemento})` : ''}`).join(' | ')

export interface EmissaoOk {
  ok: true
  chave: string
  nfseXml: string
  idDps: string | null
  alertas: Mensagem[]
}
export interface Falha {
  ok: false
  status: number
  erros: Mensagem[]
  raw: string
}

export async function emitir(cert: Certificado, amb: Ambiente, dpsAssinada: string): Promise<EmissaoOk | Falha> {
  const r = await request(cert, 'POST', `${HOSTS[amb].sefin}/nfse`, { dpsXmlGZipB64: gz64(dpsAssinada) })
  const chave = String(r.body?.chaveAcesso ?? '')
  const nfse = r.body?.nfseXmlGZipB64
  if (r.status >= 200 && r.status < 300 && /^\d{50}$/.test(chave) && typeof nfse === 'string')
    return { ok: true, chave, nfseXml: ungz64(nfse), idDps: (r.body?.idDps as string) ?? null, alertas: mensagens(r.body, 'alertas') }
  return { ok: false, status: r.status, erros: mensagens(r.body, 'erros', 'erro'), raw: r.raw.slice(0, 4000) }
}

export interface EventoOk {
  ok: true
  eventoXml: string
}

export async function registrarEvento(cert: Certificado, amb: Ambiente, chave: string, pedidoAssinado: string): Promise<EventoOk | Falha> {
  const r = await request(cert, 'POST', `${HOSTS[amb].sefin}/nfse/${chave}/eventos`, { pedidoRegistroEventoXmlGZipB64: gz64(pedidoAssinado) })
  const ev = r.body?.eventoXmlGZipB64
  if (r.status >= 200 && r.status < 300 && typeof ev === 'string') return { ok: true, eventoXml: ungz64(ev) }
  return { ok: false, status: r.status, erros: mensagens(r.body, 'erros', 'erro'), raw: r.raw.slice(0, 4000) }
}

/** Consulta a nota pela chave. 200 com o XML, 404 se não existe. */
export async function consultarNfse(cert: Certificado, amb: Ambiente, chave: string): Promise<{ status: number; nfseXml: string | null; raw: string }> {
  const r = await request(cert, 'GET', `${HOSTS[amb].sefin}/nfse/${chave}`)
  const nfse = r.body?.nfseXmlGZipB64
  return { status: r.status, nfseXml: typeof nfse === 'string' ? ungz64(nfse) : null, raw: r.raw.slice(0, 4000) }
}

/** Descobre a chave da nota gerada por uma DPS (para quando o envio caiu sem resposta). */
export async function chavePorDps(cert: Certificado, amb: Ambiente, idDps: string): Promise<{ status: number; chave: string | null; raw: string }> {
  const r = await request(cert, 'GET', `${HOSTS[amb].sefin}/dps/${idDps}`)
  const chave = String(r.body?.chaveAcesso ?? '')
  return { status: r.status, chave: /^\d{50}$/.test(chave) ? chave : null, raw: r.raw.slice(0, 4000) }
}

/** Situação da nota pelos eventos registrados (cancelamento = 101101). */
export async function eventos(cert: Certificado, amb: Ambiente, chave: string): Promise<ApiResult> {
  return request(cert, 'GET', `${HOSTS[amb].sefin}/nfse/${chave}/eventos`)
}
