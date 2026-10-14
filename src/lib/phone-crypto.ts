import crypto from 'node:crypto'

// B5/B9 · telefone completo do cliente final, cifrado no banco (Contact.phoneEncrypted).
// AES-256-GCM com chave em PHONE_ENC_KEY (32 bytes em base64, gerada no servidor pelo deploy; nunca no git).
// O texto cifrado fica preso à organização (AAD), então copiar o valor para o contato de outra empresa não abre.
// Sem a chave o sistema continua funcionando: só não grava (nem mostra) o telefone completo, como antes.
// Formato: "v1:" + base64(iv 12 bytes | tag 16 bytes | texto cifrado). Doc: docs/operacao/telefone-cifrado.md.

const PREFIX = 'v1:'
const IV_LEN = 12
const TAG_LEN = 16

let warned = false

export function parsePhoneKey(raw: string | undefined): { key: Buffer | null; problem?: string } {
  const v = (raw || '').trim()
  if (!v) return { key: null, problem: 'PHONE_ENC_KEY ausente' }
  const key = Buffer.from(v, 'base64')
  if (key.length !== 32) return { key: null, problem: `PHONE_ENC_KEY inválida (precisa de 32 bytes em base64, veio ${key.length})` }
  return { key }
}

/** Chave do ambiente. Sem chave (ou inválida) avisa uma vez no log e devolve null. */
export function phoneKey(): Buffer | null {
  const { key, problem } = parsePhoneKey(process.env.PHONE_ENC_KEY)
  if (!key && !warned) {
    warned = true
    console.warn(`[phone-crypto] ${problem}: o telefone completo dos contatos não será gravado (só os 4 últimos dígitos)`)
  }
  return key
}

const aad = (orgId: string) => Buffer.from(`contact-phone:${orgId}`)

/** Cifra os dígitos do telefone. null quando não há chave. */
export function encryptPhone(orgId: string, digits: string, key: Buffer | null = phoneKey()): string | null {
  if (!key || !digits) return null
  const iv = crypto.randomBytes(IV_LEN)
  const c = crypto.createCipheriv('aes-256-gcm', key, iv)
  c.setAAD(aad(orgId))
  const enc = Buffer.concat([c.update(digits, 'utf8'), c.final()])
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64')
}

/** Decifra. null se não há valor, não há chave, a chave é outra ou o valor é de outra organização. */
export function decryptPhone(orgId: string, value: string | null | undefined, key: Buffer | null = phoneKey()): string | null {
  if (!value || !key || !value.startsWith(PREFIX)) return null
  try {
    const raw = Buffer.from(value.slice(PREFIX.length), 'base64')
    if (raw.length <= IV_LEN + TAG_LEN) return null
    const d = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, IV_LEN))
    d.setAAD(aad(orgId))
    d.setAuthTag(raw.subarray(IV_LEN, IV_LEN + TAG_LEN))
    return Buffer.concat([d.update(raw.subarray(IV_LEN + TAG_LEN)), d.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** Dígitos → forma legível. Brasil: +55 (11) 98765-4321; demais: +<dígitos>. */
export function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, '')
  const br = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d)
  if (br) return `+55 (${br[1]}) ${br[2]}-${br[3]}`
  return `+${d}`
}
