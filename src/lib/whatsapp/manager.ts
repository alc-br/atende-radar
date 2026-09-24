/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'node:fs'
import path from 'node:path'
import { db } from '../db'
import { ingestEvent } from '../ingest'
import { mapBaileysMessage } from './map'

// Gerenciador das sessões de WhatsApp (Baileys). Roda dentro do servidor, ligado por WHATSAPP_GATEWAY=on.
// Só OBSERVA: nunca envia mensagem, nunca marca como lida, nunca aparece "online".
// As credenciais de cada número ficam em WA_SESSIONS_DIR/<connectionId> (são chaves da conta: pasta privada).

interface Session {
  sock: any
  state: 'connecting' | 'open'
  stopping: boolean
  retry: number
  retryTimer?: ReturnType<typeof setTimeout>
}

const g = globalThis as { __waSessions?: Map<string, Session>; __waLoop?: ReturnType<typeof setInterval> }
const sessions = () => (g.__waSessions ??= new Map())

const sessionsDir = () => process.env.WA_SESSIONS_DIR || path.resolve(process.cwd(), '..', 'wa-sessions')
const authDir = (id: string) => path.join(sessionsDir(), id)
const log = (...a: unknown[]) => console.log('[whatsapp]', ...a)

const silentLogger: any = { level: 'silent', trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {}, child() { return silentLogger } }

let baileysPromise: Promise<any> | null = null
const loadBaileys = () => (baileysPromise ??= import('@whiskeysockets/baileys'))

async function emit(connectionId: string, type: string, payload: Record<string, unknown>, occurredAt?: string, eventId?: string) {
  const r = await ingestEvent({ eventId: eventId ?? `wa-${connectionId}-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, connectionId, type, occurredAt, payload })
  if (!r.ok) log(`evento recusado (${type}): ${r.error}`)
}

async function startSession(connectionId: string) {
  if (sessions().has(connectionId)) return
  const b = await loadBaileys()
  const makeWASocket = b.default ?? b.makeWASocket
  fs.mkdirSync(authDir(connectionId), { recursive: true, mode: 0o700 })
  const { state, saveCreds } = await b.useMultiFileAuthState(authDir(connectionId))
  let version: number[] | undefined
  try {
    version = (await b.fetchLatestBaileysVersion()).version
  } catch {
    version = undefined // usa a versão embutida
  }

  const session: Session = { sock: null, state: 'connecting', stopping: false, retry: 0 }
  sessions().set(connectionId, session)

  const connect = () => {
    const sock = makeWASocket({
      ...(version ? { version } : {}),
      auth: state,
      logger: silentLogger,
      browser: ['AtendeRadar', 'Chrome', '1.0.0'],
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
    })
    session.sock = sock
    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (u: any) => {
      try {
        if (u.qr) await emit(connectionId, 'connection.qr', { qr: u.qr })
        if (u.connection === 'open') {
          session.state = 'open'
          session.retry = 0
          const digits = String(sock.user?.id ?? '').split('@')[0].split(':')[0].replace(/\D/g, '')
          await emit(connectionId, 'connection.status', { status: 'connected', ...(digits ? { phoneNumber: `+${digits}` } : {}) })
          log(`${connectionId} conectado`)
        }
        if (u.connection === 'close') {
          session.state = 'connecting'
          const code = u.lastDisconnect?.error?.output?.statusCode
          if (session.stopping) return
          if (code === b.DisconnectReason.loggedOut) {
            // o cliente removeu o aparelho no WhatsApp: credenciais inválidas
            session.stopping = true
            sessions().delete(connectionId)
            fs.rmSync(authDir(connectionId), { recursive: true, force: true })
            await emit(connectionId, 'connection.status', { status: 'disconnected', reason: 'logged_out' })
            log(`${connectionId} desconectado pelo aparelho (logged_out)`)
            return
          }
          // queda temporária: reconecta com espera crescente (máx. 60 s)
          await emit(connectionId, 'connection.status', { status: 'degraded', reason: `closed_${code ?? 'unknown'}` })
          const wait = code === b.DisconnectReason.restartRequired ? 500 : Math.min(60000, 1000 * 2 ** session.retry++)
          session.retryTimer = setTimeout(() => {
            if (!session.stopping) connect()
          }, wait)
        }
      } catch (e) {
        log('connection.update erro:', e instanceof Error ? e.message : e)
      }
    })

    sock.ev.on('messages.upsert', async ({ messages, type }: any) => {
      if (type !== 'notify') return
      for (const m of messages) {
        try {
          const ev = mapBaileysMessage(m)
          if (!ev) continue
          if (Date.now() - new Date(ev.occurredAt).getTime() > 7 * 86400000) continue // histórico velho não é atendimento
          await emit(connectionId, ev.type, ev.payload, ev.occurredAt, `wa-msg-${connectionId}-${ev.payload.externalId}`)
        } catch (e) {
          log('mensagem ignorada por erro:', e instanceof Error ? e.message : e)
        }
      }
    })
  }
  connect()
  log(`${connectionId} iniciando`)
}

async function stopSession(connectionId: string, opts: { logout?: boolean } = {}) {
  const s = sessions().get(connectionId)
  if (s) {
    s.stopping = true
    if (s.retryTimer) clearTimeout(s.retryTimer)
    try {
      if (opts.logout) await s.sock?.logout()
      else s.sock?.end(undefined)
    } catch {
      /* já estava fechado */
    }
    sessions().delete(connectionId)
  }
  if (opts.logout) fs.rmSync(authDir(connectionId), { recursive: true, force: true })
}

/** Compara o que o cliente pediu (banco) com as sessões abertas e ajusta. Roda a cada 15 s. */
export async function reconcile() {
  const conns = await db.whatsAppConnection.findMany({ select: { id: true, status: true, disabledAt: true } })
  const wanted = new Set<string>()
  for (const c of conns) {
    const s = sessions().get(c.id)
    if (c.disabledAt) {
      // pausada ou desconectada pelo cliente
      if (c.status === 'disconnected') await stopSession(c.id, { logout: true })
      else if (s) await stopSession(c.id)
      continue
    }
    // "reconectar" (novo QR) pedido pelo cliente enquanto a sessão está aberta: zera as credenciais
    if (c.status === 'qr_required' && s?.state === 'open') {
      await stopSession(c.id, { logout: true })
    }
    wanted.add(c.id)
    if (!sessions().has(c.id)) await startSession(c.id).catch((e) => log(`falha ao iniciar ${c.id}:`, e instanceof Error ? e.message : e))
  }
  for (const id of [...sessions().keys()]) if (!wanted.has(id)) await stopSession(id)
}

export function startWhatsApp() {
  if (g.__waLoop || process.env.WHATSAPP_GATEWAY !== 'on') return
  log('gateway ligado; sessões em', sessionsDir())
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      await reconcile()
    } catch (e) {
      log('reconcile erro:', e instanceof Error ? e.message : e)
    }
    running = false
  }
  g.__waLoop = setInterval(tick, 15000)
  g.__waLoop.unref?.()
  void tick()
}
