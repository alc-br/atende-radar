import { NextResponse } from 'next/server'
import { guard, isPlatformOperator } from '@/lib/api-auth'
import { productAnalytics } from '@/lib/product-analytics'

// I7 · Admin › Produto: funil, ativação, retenção, uso por tela, tour e custo de IA. Só o operador da plataforma.
export async function GET(request: Request) {
  const g = await guard()
  if (!g.ok) return g.res
  if (!isPlatformOperator(g.auth)) {
    return NextResponse.json({ error: 'Sem permissão para esta ação' }, { status: 403 })
  }
  const days = new URL(request.url).searchParams.get('days') === '90' ? 90 : 30
  try {
    return NextResponse.json(await productAnalytics(days))
  } catch (error) {
    console.error('Admin analytics error:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Não foi possível carregar os números do produto' }, { status: 500 })
  }
}
