import { cookies } from 'next/headers'
import { decode, encode } from 'next-auth/jwt'
import { authOptions } from './auth'

// Nomes do cookie de sessão do NextAuth (com HTTPS ele ganha o prefixo __Secure-).
const COOKIE_NAMES = ['__Secure-next-auth.session-token', 'next-auth.session-token']

/**
 * Regrava o cookie de sessão DESTA requisição com a nova sessionVersion. Usado depois de "sair de todos os
 * aparelhos" e de trocar a senha: as outras sessões morrem (versão antiga) e quem fez a ação continua logado.
 * Só chamar depois de o guard() ter validado a sessão atual. Devolve false se não conseguiu (a sessão atual
 * também cai, e a tela leva a pessoa para o login).
 */
export async function reissueSessionCookie(sessionVersion: number): Promise<boolean> {
  const secret = authOptions.secret || process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET
  if (!secret) return false
  const jar = await cookies()
  const name = COOKIE_NAMES.find((n) => jar.get(n)?.value)
  if (!name) return false
  try {
    const current = await decode({ token: jar.get(name)!.value, secret })
    if (!current) return false
    const { iat: _iat, exp: _exp, jti: _jti, ...claims } = current as Record<string, unknown>
    const maxAge = authOptions.session?.maxAge ?? 30 * 24 * 60 * 60
    const value = await encode({ token: { ...claims, sv: sessionVersion }, secret, maxAge })
    jar.set(name, value, { httpOnly: true, sameSite: 'lax', path: '/', secure: name.startsWith('__Secure-'), maxAge })
    return true
  } catch {
    return false
  }
}
