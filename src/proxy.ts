import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Toda rota de API exige sessão válida. Ficam públicos: /api/auth/* (login/cadastro/recuperação) e /api/public/* (catálogo da página de vendas).
export async function proxy(req: NextRequest) {
  const token = await getToken({ req })
  if (!token?.sub) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/api', '/api/((?!auth(?:/|$)|public(?:/|$)).*)'],
}
