import { createHash } from 'node:crypto'

// Origem da venda e escolha de cookies (docs/operacao/medicao.md), lidas dos cookies próprios, que valem para o site e
// para o app (mesmo domínio registrável):
// - ar_attr: campanha da última visita que veio de anúncio ou link marcado (utm_*, gclid, gbraid, wbraid, fbclid), 90 dias;
//   gravado pelo navegador (components/consent/cookie-consent.tsx). Nunca guarda nome, e-mail ou telefone.
// - ar_consent: a escolha no aviso de cookies ({ analytics, ads }).
// _ga, _fbp e _fbc só existem quando as tags rodaram com consentimento.
export const ATTR_COOKIE = 'ar_attr'
export const CONSENT_COOKIE = 'ar_consent'
export const ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'gbraid', 'wbraid', 'fbclid'] as const

export type Consent = { analytics: boolean; ads: boolean }
export type Attribution = Partial<Record<(typeof ATTR_KEYS)[number] | 'landing' | 'at' | 'ga' | 'gs' | 'fbp' | 'fbc', string>> & { consent?: Consent }

function cookies(header: string | null): Map<string, string> {
  const out = new Map<string, string>()
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i < 1) continue
    try {
      out.set(part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim()))
    } catch {
      // cookie malformado: ignora
    }
  }
  return out
}

const clip = (v: unknown) => (typeof v === 'string' && v.length ? v.slice(0, 200) : undefined)

export function consentFrom(headers: Headers): Consent {
  try {
    const c = JSON.parse(cookies(headers.get('cookie')).get(CONSENT_COOKIE) ?? '{}')
    return { analytics: c?.analytics === true, ads: c?.ads === true }
  } catch {
    return { analytics: false, ads: false }
  }
}

/** Só as chaves conhecidas, cada uma cortada em 200 caracteres. Sem campanha nem consentimento: null. */
export function attributionFrom(headers: Headers): Attribution | null {
  const jar = cookies(headers.get('cookie'))
  let raw: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(jar.get(ATTR_COOKIE) ?? '{}')
    if (parsed && typeof parsed === 'object') raw = parsed
  } catch {
    // cookie inválido: sem campanha
  }
  const out: Attribution = {}
  for (const k of ATTR_KEYS) {
    const v = clip(raw[k])
    if (v) out[k] = v
  }
  const landing = clip(raw.landing)
  const at = clip(raw.at)
  if (landing) out.landing = landing
  if (at) out.at = at
  // _ga = GA1.1.<client_id>; _ga_<stream> = GS1.1.s<session_id>... (ou GS2.1.s<session>$...)
  const ga = jar.get('_ga')?.match(/^GA\d\.\d\.(\d+\.\d+)$/)?.[1]
  if (ga) out.ga = ga
  const gs = [...jar].find(([k]) => k.startsWith('_ga_'))?.[1]?.match(/^GS\d\.\d\.s?(\d+)/)?.[1]
  if (gs) out.gs = gs
  const fbp = clip(jar.get('_fbp'))
  if (fbp) out.fbp = fbp
  const fbc = clip(jar.get('_fbc')) ?? (out.fbclid ? `fb.1.${Date.parse(out.at ?? '') || Date.now()}.${out.fbclid}` : undefined)
  if (fbc) out.fbc = fbc
  out.consent = consentFrom(headers)
  return Object.keys(out).length > 1 || out.consent.analytics || out.consent.ads ? out : null
}

/** A visita de agora; sem campanha nela, a campanha do cadastro da empresa (a primeira origem conhecida). */
export function withCampaign(visit: Attribution | null, account: Attribution | null): Attribution | null {
  const campaignKeys = [...ATTR_KEYS, 'landing', 'at'] as const
  const hasCampaign = (x: Attribution) => campaignKeys.some((k) => x[k])
  if (visit && hasCampaign(visit)) return visit
  const kept = Object.fromEntries(campaignKeys.filter((k) => account?.[k]).map((k) => [k, account![k]])) as Attribution
  return visit || Object.keys(kept).length ? { ...kept, ...(visit ?? {}) } : null
}

export function parseAttribution(json: string | null | undefined): Attribution | null {
  if (!json) return null
  try {
    const v = JSON.parse(json)
    return v && typeof v === 'object' ? (v as Attribution) : null
  } catch {
    return null
  }
}

/** SHA-256 do valor normalizado (minúsculas, sem espaços), como a Meta pede para e-mail e telefone. */
export const sha256 = (v: string) => createHash('sha256').update(v.trim().toLowerCase()).digest('hex')

/** Celular para a Meta: só dígitos, com o código do país (55). */
export const normalizedPhone = (digits: string) => {
  const d = digits.replace(/\D/g, '')
  return d.length === 10 || d.length === 11 ? '55' + d : d
}
