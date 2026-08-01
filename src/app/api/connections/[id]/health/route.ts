import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const connection = await db.whatsAppConnection.findUnique({
      where: { id },
      include: {
        sessionEvents: {
          orderBy: { occurredAt: 'desc' },
          take: 5,
        },
      },
    })

    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const tenMinAgo = new Date(Date.now() - 10 * 60000)
    const [recentEventCount, messageCount] = await Promise.all([
      db.rawChannelEvent.count({ where: { connectionId: id, receivedAt: { gte: tenMinAgo } } }),
      db.message.count({ where: { conversation: { connectionId: id } } }),
    ])

    // Build diagnostics based on connection state
    const minutesSinceEvent = connection.lastEventAt
      ? (Date.now() - connection.lastEventAt.getTime()) / 60000
      : 9999

    const minutesSinceSync = connection.lastSyncAt
      ? (Date.now() - connection.lastSyncAt.getTime()) / 60000
      : 9999

    const eventRate = `${(recentEventCount / 10).toFixed(1)}/min`

    let socketStatus = 'NONE'
    let recentErrors: string[] = []
    let recommendedActions: string[] = []

    switch (connection.status) {
      case 'connected':
        socketStatus = 'OPEN'
        if (minutesSinceEvent > 10) {
          socketStatus = 'OPEN (unstable)'
          recentErrors.push(`Sem eventos há ${Math.floor(minutesSinceEvent)} minutos`)
          recommendedActions.push('Monitorar conexão nas próximas 2h')
        }
        break
      case 'disconnected':
        socketStatus = 'CLOSED'
        recentErrors.push('Conexão desconectada')
        recommendedActions.push('Gerar novo QR Code para reconectar')
        break
      case 'syncing':
        socketStatus = 'CONNECTING'
        recentErrors.push('Sincronização em andamento')
        recommendedActions.push('Aguardar conclusão da sincronização')
        break
      case 'qr_required':
        socketStatus = 'NONE'
        recentErrors.push('QR Code não escaneado — aguardando pareamento')
        recommendedActions.push('Escanear o QR Code com o WhatsApp do número desejado')
        break
      case 'degraded':
        socketStatus = 'OPEN (unstable)'
        recentErrors.push('Latência elevada detectada')
        recommendedActions.push('Verificar rede local e firewall')
        break
      case 'paused':
        socketStatus = 'CLOSED'
        recentErrors.push('Conexão pausada pelo administrador')
        recommendedActions.push('Reativar a conexão nas configurações')
        break
    }

    // Get recent errors from session events
    const errorEvents = connection.sessionEvents.filter(
      (e) => e.eventType === 'error' || e.eventType === 'disconnect'
    )
    if (errorEvents.length > 0) {
      recentErrors = errorEvents.map(
        (e) => e.sanitizedDetails || e.reasonCode || e.eventType
      )
    }

    return NextResponse.json({
      id: connection.id,
      name: connection.name,
      status: connection.status,
      diagnostics: {
        socketStatus,
        lastHeartbeat: connection.lastEventAt?.toISOString() || '—',
        pendingQueues: 0,
        eventRate,
        recentErrors,
        protocolVersion: connection.status === 'qr_required' ? '—' : 'WAWeb v2.2426.66',
        messageCount,
        recommendedActions,
      },
    })
  } catch (error) {
    console.error('Connection health error:', error)
    return NextResponse.json({ error: 'Failed to load connection health' }, { status: 500 })
  }
}
