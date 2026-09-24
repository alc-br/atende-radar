import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard } from '@/lib/api-auth'
import { can } from '@/lib/permissions'

// Guia de primeiros passos: cada passo é calculado a partir dos dados reais da organização (nada de marcação manual).
export async function GET() {
  const g = await guard('dashboard.view')
  if (!g.ok) return g.res
  const orgId = g.auth.orgId

  const [connections, members, conversations] = await Promise.all([
    db.whatsAppConnection.count({ where: { organizationId: orgId } }),
    db.organizationMember.count({ where: { organizationId: orgId } }),
    db.conversation.count({ where: { organizationId: orgId } }),
  ])

  const steps = [
    {
      id: 'connect',
      title: 'Conecte o WhatsApp da empresa',
      description: 'É por ele que o AtendeRadar enxerga as conversas. Leva poucos minutos.',
      done: connections > 0,
      view: 'connections',
      action: 'Conectar WhatsApp',
    },
    {
      id: 'invite',
      title: 'Convide a sua equipe',
      description: 'Gestores e atendentes entram com o próprio acesso e só veem o que lhes cabe.',
      done: members > 1,
      view: 'members',
      action: 'Convidar equipe',
    },
    {
      id: 'conversations',
      title: 'Receba as primeiras conversas',
      description: 'Assim que o WhatsApp estiver conectado, as conversas aparecem aqui e os alertas começam a valer.',
      done: conversations > 0,
      view: 'conversations',
      action: 'Ver conversas',
    },
  ]

  return NextResponse.json({
    steps,
    complete: steps.every((s) => s.done),
    // só quem configura a organização vê o guia
    canManage: can(g.auth.role, 'settings.manage'),
  })
}
