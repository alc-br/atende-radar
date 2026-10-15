import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { guard } from '@/lib/api-auth'
import { allow } from '@/lib/rate-limit'
import { UPLOAD_RATE_LIMIT, UPLOAD_RATE_WINDOW_MS, avatarUrl, deleteImage, processImage, readImageForm, saveImage } from '@/lib/uploads'

// Foto do perfil (P7): cada pessoa troca ou tira a PRÓPRIA foto. Vista pelos membros da mesma empresa (/api/media/avatar).

export async function POST(request: Request) {
  const g = await guard()
  if (!g.ok) return g.res
  if (!allow(`upload:${g.auth.memberId}`, UPLOAD_RATE_LIMIT, UPLOAD_RATE_WINDOW_MS)) {
    return NextResponse.json({ error: 'Muitos envios de imagem na última hora. Tente novamente mais tarde.' }, { status: 429 })
  }
  const form = await readImageForm(request)
  if (!form.ok) return form.res
  const img = await processImage(form.bytes, 'avatar')
  if (!img.ok) return NextResponse.json({ error: img.error }, { status: 400 })

  await saveImage(g.auth.orgId, 'avatar', img.bytes, g.auth.memberId)
  const m = await db.organizationMember.update({
    where: { id: g.auth.memberId },
    data: { avatarType: img.type, avatarUpdatedAt: new Date() },
    select: { id: true, avatarType: true, avatarUpdatedAt: true },
  })
  await audit(g.auth, { action: 'account.avatar_changed', targetType: 'member', targetId: g.auth.memberId, targetLabel: g.auth.email })
  return NextResponse.json({ success: true, avatarUrl: avatarUrl(m) })
}

export async function DELETE() {
  const g = await guard()
  if (!g.ok) return g.res
  const m = await db.organizationMember.findUnique({ where: { id: g.auth.memberId }, select: { avatarType: true } })
  if (m?.avatarType) {
    await db.organizationMember.update({ where: { id: g.auth.memberId }, data: { avatarType: null, avatarUpdatedAt: null } })
    await deleteImage(g.auth.orgId, 'avatar', g.auth.memberId)
    await audit(g.auth, { action: 'account.avatar_removed', targetType: 'member', targetId: g.auth.memberId, targetLabel: g.auth.email })
  }
  return NextResponse.json({ success: true, avatarUrl: null })
}
