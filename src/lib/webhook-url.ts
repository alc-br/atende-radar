import { createHmac, randomBytes } from 'node:crypto'
import dns from 'node:dns'
import net from 'node:net'

// Regras puras do webhook de saída (sem banco): bloqueio de endereços internos (SSRF), validação da URL e assinatura.
// Separado de webhooks.ts para poder ser testado em unidade.

/** Só nos testes (WEBHOOK_ALLOW_LOCAL=1 no playwright.config.ts): libera http://127.0.0.1 para o receptor local. Nunca em produção. */
const allowLocal = () => process.env.WEBHOOK_ALLOW_LOCAL === '1' && process.env.NODE_ENV !== 'production'

// ---------- endereços bloqueados ----------

function v4ToInt(ip: string): number {
  const p = ip.split('.').map(Number)
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]
}

const V4_BLOCKS: Array<[string, number]> = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]

function blockedV4(n: number): boolean {
  return V4_BLOCKS.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
    return ((n & mask) >>> 0) === ((v4ToInt(base) & mask) >>> 0)
  })
}

/** IPv6 em 8 grupos de 16 bits (aceita "::" e final em IPv4 pontuado). null = não entendeu. */
function expandV6(ip: string): number[] | null {
  let s = ip.toLowerCase()
  const zone = s.indexOf('%')
  if (zone >= 0) s = s.slice(0, zone)
  const dotted = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/)
  if (dotted) {
    if (!net.isIPv4(dotted[2])) return null
    const n = v4ToInt(dotted[2])
    s = `${dotted[1]}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null
  const groups = [...head, ...Array<string>(fill).fill('0'), ...tail].map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN))
  return groups.length === 8 && groups.every((g) => !Number.isNaN(g)) ? groups : null
}

function blockedV6(ip: string): boolean {
  const g = expandV6(ip)
  if (!g) return true
  const v4 = (hi: number, lo: number) => ((hi << 16) >>> 0) + lo
  const zeros = (from: number, to: number) => g.slice(from, to).every((x) => x === 0)
  if (zeros(0, 6)) return blockedV4(v4(g[6], g[7])) // :: , ::1 e IPv4 compatível
  if (zeros(0, 5) && g[5] === 0xffff) return blockedV4(v4(g[6], g[7])) // ::ffff:a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b && zeros(2, 6)) return blockedV4(v4(g[6], g[7])) // NAT64
  if (g[0] === 0x2002) return blockedV4(v4(g[1], g[2])) // 6to4
  if ((g[0] & 0xfe00) === 0xfc00) return true // ULA fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0) return true // link-local / site-local
  if ((g[0] & 0xff00) === 0xff00) return true // multicast
  if (g[0] === 0x2001 && (g[1] === 0x0db8 || g[1] === 0)) return true // documentação / Teredo
  return false
}

/** true = endereço que não pode receber webhook (loopback, privado, link-local, reservado...). */
export function isBlockedAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return blockedV4(v4ToInt(ip))
  if (net.isIPv6(ip)) return blockedV6(ip)
  return true
}

// ---------- validação da URL ----------

export type UrlCheck = { ok: true; url: string } | { ok: false; error: string }

export function validateWebhookUrl(raw: unknown): UrlCheck {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, error: 'Informe a URL do webhook.' }
  if (raw.length > 2000) return { ok: false, error: 'URL longa demais.' }
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return { ok: false, error: 'URL inválida.' }
  }
  if (u.username || u.password) return { ok: false, error: 'Não coloque usuário ou senha na URL.' }
  const local = allowLocal() && u.hostname === '127.0.0.1'
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return { ok: false, error: 'A URL precisa começar com https://.' }
  if (!local) {
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    if (net.isIP(host)) {
      if (isBlockedAddress(host)) return { ok: false, error: 'Endereço interno ou privado não é permitido.' }
    } else if (host === 'localhost' || /\.(localhost|local|internal|lan|home|localdomain)\.?$/.test(host) || !host.includes('.')) {
      return { ok: false, error: 'Endereço interno ou privado não é permitido.' }
    }
  }
  return { ok: true, url: u.toString() }
}

/** Na hora de salvar: o nome resolve para endereço interno? (falha de DNS não bloqueia o cadastro; o envio confere de novo) */
export async function resolvesToBlocked(url: string): Promise<boolean> {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(host)) return false // já conferido em validateWebhookUrl
  try {
    const list = await Promise.race([
      dns.promises.lookup(host, { all: true }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000).unref?.()),
    ])
    return list.some((a) => isBlockedAddress(a.address))
  } catch {
    return false
  }
}

// ---------- assinatura ----------

export function generateSecret(): string {
  return `whsec_${randomBytes(32).toString('base64url')}`
}

export function signBody(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex')
}
