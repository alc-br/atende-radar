import { NextResponse } from 'next/server'
import { readJson } from '@/lib/json-body'
import { allow, clientIp } from '@/lib/rate-limit'
import { confirmEmailChange } from '@/lib/email-change'

// Link do e-mail de troca de endereço (P7). Público: quem abre o link pode não estar logado; o token identifica o membro.
export async function POST(request: Request) {
  if (!allow(`confirm-email:${clientIp(request)}`, 30, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas tentativas. Tente novamente mais tarde.' }, { status: 429 })
  }
  const j = await readJson<{ token?: unknown }>(request, { optional: true })
  if (!j.ok) return j.res
  const token = typeof j.body?.token === 'string' ? j.body.token : ''
  const r = await confirmEmailChange(token)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ success: true })
}
