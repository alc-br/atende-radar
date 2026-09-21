import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Toda rota de API exige sessão válida. Só /api/auth/* (login do NextAuth) fica público.
export async function proxy(req: NextRequest) {
  const token = await getToken({ req })
  if (!token?.sub) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/api', '/api/((?!auth(?:/|$)).*)'],
}
