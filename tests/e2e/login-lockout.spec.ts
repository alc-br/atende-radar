import { test, expect, request } from '@playwright/test'
import { BASE_URL, signupOrg, uid } from './helpers'

// Bloqueio por tentativas (5 senhas erradas): o login devolve um erro próprio ("locked:<minutos>", que a tela mostra
// como "Muitas tentativas… tente em X minutos") — e devolve o MESMO erro para e-mail que não existe, para o bloqueio
// não servir de teste de quais e-mails têm conta.
const ipNovo = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`

/** Tenta entrar e devolve o erro do NextAuth (o que o navegador recebe em signIn().error), ou null se entrou. */
async function tenta(email: string, password: string, ip: string) {
  const ctx = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { 'x-forwarded-for': ip } })
  const csrf = (await (await ctx.get('/api/auth/csrf')).json()).csrfToken
  const res = await ctx.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email, password, json: 'true' } })
  const url = (await res.json()).url as string
  const logado = (await ctx.get('/api/me')).status() === 200
  await ctx.dispose()
  return logado ? null : new URL(url).searchParams.get('error') ?? 'sem-erro'
}

test('5 senhas erradas: aviso de "muitas tentativas" igual para e-mail que existe e que não existe', async () => {
  test.setTimeout(90_000)
  const { email, password } = await signupOrg()
  const fantasma = `ninguem.${uid()}@cliente.test`
  const ip = ipNovo()

  const real: (string | null)[] = []
  const falso: (string | null)[] = []
  for (let i = 0; i < 5; i++) {
    real.push(await tenta(email, `errada-${i}-Zz9`, ip))
    falso.push(await tenta(fantasma, `errada-${i}-Zz9`, ip))
  }
  // 1ª a 4ª: erro genérico de credenciais; 5ª: já avisa do bloqueio (15 minutos)
  expect(real.slice(0, 4)).toEqual(Array(4).fill('CredentialsSignin'))
  expect(real[4]).toBe('locked:15')
  expect(falso).toEqual(real) // nada distingue o e-mail inexistente

  // bloqueada: nem a senha certa entra, e o aviso continua (com o tempo que falta)
  const depois = await tenta(email, password, ip)
  expect(depois).toMatch(/^locked:(14|15)$/)
  expect(await tenta(fantasma, password, ip)).toBe(depois)
})
