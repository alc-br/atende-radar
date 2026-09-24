import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'

const KEYLEN = 64

/** Hash de senha com scrypt (nativo do Node, sem dependência): `scrypt$<salt>$<hash>`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, KEYLEN).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  // Sempre gasta o mesmo tempo, exista ou não o hash (evita descobrir e-mails pelo tempo de resposta).
  const [scheme, salt, hash] = (stored || 'scrypt$00$00').split('$')
  const expected = Buffer.from(hash || '', 'hex')
  const actual = scryptSync(password, salt || '00', KEYLEN)
  if (!stored || scheme !== 'scrypt' || expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}

const COMMON = ['12345678', '123456789', '1234567890', 'password', 'senha123', 'demo123', 'qwerty123', 'abc12345']

/** Regras de senha (retorna mensagem de erro em português, ou null se aceita). */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < 10) return 'A senha precisa ter pelo menos 10 caracteres.'
  if (password.length > 128) return 'A senha é longa demais (máximo 128 caracteres).'
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return 'A senha precisa ter letras e números.'
  const lower = password.toLowerCase()
  if (COMMON.some((c) => lower.includes(c))) return 'Essa senha é comum demais. Escolha outra.'
  if (email && lower.includes(email.split('@')[0].toLowerCase()) && email.split('@')[0].length >= 4) {
    return 'A senha não pode conter o seu e-mail.'
  }
  return null
}

export function newToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashToken(token) }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
