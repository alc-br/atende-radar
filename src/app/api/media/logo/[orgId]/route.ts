import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard } from '@/lib/api-auth'
import { imageResponse, readImage } from '@/lib/uploads'

const notFound = () => NextResponse.json({ error: 'Imagem não encontrada' }, { status: 404 })

// Logotipo da empresa: só para os membros dela. Outra empresa recebe 404 (nem confirma que existe).
export async function GET(_request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const g = await guard()
  if (!g.ok) return g.res
  const { orgId } = await params
  if (orgId !== g.auth.orgId) return notFound()
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { logoType: true } })
  if (!org?.logoType) return notFound()
  const bytes = await readImage(orgId, 'logo')
  return bytes ? imageResponse(bytes, org.logoType, 'logotipo') : notFound()
}
