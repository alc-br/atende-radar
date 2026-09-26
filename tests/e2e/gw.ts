import { request, type APIRequestContext } from '@playwright/test'
import { BASE_URL, loginAs, signupOrg, uid } from './helpers'

export const GATEWAY_SECRET = 'gateway-secret-test'

export async function gatewayClient(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Authorization: `Bearer ${GATEWAY_SECRET}` } })
}

export const minutesAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString()
export const newChat = () => `55119${Math.floor(10000000 + Math.random() * 89999999)}@s.whatsapp.net`

/** Uma empresa nova (cadastro real) com um WhatsApp conectado, pronta para receber mensagens. */
export async function setupCompany() {
  const { email, password } = await signupOrg()
  const admin = await loginAs(email, password)
  const gw = await gatewayClient()
  const connectionId = (await (await admin.post('/api/connections', { data: { name: 'Recepção', phoneNumber: '+5511900001234' } })).json()).connection.id as string
  await gw.post('/api/gateway/events', { data: { eventId: `st-${uid()}`, connectionId, type: 'connection.status', payload: { status: 'connected' } } })
  // Mesmo formato que a tela de Configurações grava (chaves na raiz de settings).
  const settings = async (patch: Record<string, unknown>) => {
    const r = await admin.patch('/api/settings', { data: { settings: patch } })
    if (r.status() !== 200) throw new Error(`settings falhou ${r.status()} ${await r.text()}`)
  }
  // Os testes de tempo não podem depender da hora em que rodam: por padrão o tempo fora do expediente CONTA.
  await settings({ outsideRule: 'atraso' })

  const send = async (chatId: string, text: string, opts: { minutes?: number; fromMe?: boolean; pushName?: string } = {}) => {
    const r = await gw.post('/api/gateway/events', {
      data: {
        eventId: `ev-${uid()}${Date.now()}`,
        connectionId,
        type: opts.fromMe ? 'message.sent' : 'message.received',
        occurredAt: minutesAgo(opts.minutes ?? 0),
        payload: { externalId: `wa-${uid()}${Date.now()}`, chatId, isGroup: false, fromMe: !!opts.fromMe, text, messageType: 'text', pushName: opts.pushName ?? (opts.fromMe ? undefined : 'Cliente') },
      },
    })
    if (r.status() !== 200) throw new Error(`ingest falhou ${r.status()} ${await r.text()}`)
  }
  const tick = async () => {
    const r = await gw.post('/api/gateway/tick', { data: {} })
    if (r.status() !== 200) throw new Error(`tick falhou ${r.status()} ${await r.text()}`)
    return r.json()
  }
  const alerts = async (status?: string) => {
    const q = status ? `?status=${status}&limit=100` : '?limit=100'
    return (await (await admin.get(`/api/alerts${q}`)).json()) as { alerts: Array<{ id: string; ruleName: string; severity: string; status: string; conversationId: string | null; customerName: string; agentName: string }>; counts: Record<string, number>; total: number }
  }
  const conversations = async (search = '') => (await (await admin.get(`/api/conversations?limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}`)).json()).conversations as Array<Record<string, any>>
  const dispose = async () => {
    await admin.dispose()
    await gw.dispose()
  }
  return { email, password, admin, gw, connectionId, send, tick, alerts, conversations, settings, dispose }
}
