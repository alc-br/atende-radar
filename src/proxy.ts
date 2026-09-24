import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Toda rota de API exige sessão válida. Ficam públicos: /api/auth/* (login/cadastro/recuperação) e /api/public/* (catálogo da página de vendas) e /api/gateway/* (serviço do WhatsApp, autenticado por segredo próprio na rota).
export async function proxy(req: NextRequest) {
  const token = await getToken({ req })
  if (!token?.sub) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }
  // Sessão de demonstração (senha pública): só leitura. O guia de telas (tour) continua funcionando.
  const method = req.method.toUpperCase()
  const readOnlyMethod = method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
  if ((token as { demo?: boolean }).demo && !readOnlyMethod && !req.nextUrl.pathname.startsWith('/api/tours')) {
    return NextResponse.json({ error: 'A conta de demonstração é somente leitura. Crie a sua conta grátis para testar de verdade.' }, { status: 403 })
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/api', '/api/((?!auth(?:/|$)|public(?:/|$)|gateway(?:/|$)).*)'],
}
