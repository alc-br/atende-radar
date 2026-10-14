import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { guard } from '@/lib/api-auth'
import { allow } from '@/lib/rate-limit'
import { UPLOAD_RATE_LIMIT, UPLOAD_RATE_WINDOW_MS, deleteImage, logoUrl, processImage, readImageForm, saveImage } from '@/lib/uploads'

// Logotipo da empresa (Configurações › Empresa): quem configura a empresa troca ou tira; todos os membros veem
// (barra superior, /api/media/logo).

export async function POST(request: Request) {
  const g = await guard('settings.manage')
  if (!g.ok) return g.res
  if (!allow(`upload:${g.auth.memberId}`, UPLOAD_RATE_LIMIT, UPLOAD_RATE_WINDOW_MS)) {
    return NextResponse.json({ error: 'Muitos envios de imagem na última hora. Tente novamente mais tarde.' }, { status: 429 })
  }
  const form = await readImageForm(request)
  if (!form.ok) return form.res
  const img = await processImage(form.bytes, 'logo')
  if (!img.ok) return NextResponse.json({ error: img.error }, { status: 400 })

  await saveImage(g.auth.orgId, 'logo', img.bytes)
  const org = await db.organization.update({
    where: { id: g.auth.orgId },
    data: { logoType: img.type, logoUpdatedAt: new Date() },
    select: { id: true, logoType: true, logoUpdatedAt: true },
  })
  await audit(g.auth, { action: 'organization.logo_changed', targetType: 'organization', targetId: g.auth.orgId })
  return NextResponse.json({ success: true, logoUrl: logoUrl(org) })
}

export async function DELETE() {
  const g = await guard('settings.manage')
  if (!g.ok) return g.res
  const org = await db.organization.findUnique({ where: { id: g.auth.orgId }, select: { logoType: true } })
  if (org?.logoType) {
    await db.organization.update({ where: { id: g.auth.orgId }, data: { logoType: null, logoUpdatedAt: null } })
    await deleteImage(g.auth.orgId, 'logo')
    await audit(g.auth, { action: 'organization.logo_removed', targetType: 'organization', targetId: g.auth.orgId })
  }
  return NextResponse.json({ success: true, logoUrl: null })
}
