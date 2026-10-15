import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard } from '@/lib/api-auth'
import { imageResponse, readImage } from '@/lib/uploads'

const notFound = () => NextResponse.json({ error: 'Imagem não encontrada' }, { status: 404 })

// Foto de um membro: só para quem está logado na MESMA empresa. Outra empresa recebe 404 (nem confirma que existe).
export async function GET(_request: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const g = await guard()
  if (!g.ok) return g.res
  const { memberId } = await params
  const m = await db.organizationMember.findFirst({
    where: { id: memberId, organizationId: g.auth.orgId },
    select: { id: true, organizationId: true, avatarType: true },
  })
  if (!m?.avatarType) return notFound()
  const bytes = await readImage(m.organizationId, 'avatar', m.id)
  return bytes ? imageResponse(bytes, m.avatarType, 'foto') : notFound()
}
