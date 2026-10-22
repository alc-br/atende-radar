// O libsignal (dependência do Baileys) imprime o objeto da sessão inteiro com console.info/log/warn ao fechar, abrir,
// migrar ou descartar sessões. Esse objeto tem chave privada efêmera, rootKey e a identidade do contato: material
// secreto que ia parar no journal do servidor. Aqui essas linhas são descartadas; os logs do sistema passam intactos.
// Sem dependências para poder ser testado sozinho.

const DUMP_PREFIXES = [
  'Closing session',
  'Closing open session',
  'Removing old closed session',
  'Migrating session to',
  'Opening session',
  'Session already closed',
  'Session already open',
]

// SessionEntry do libsignal: sempre tem indexInfo (objeto) e normalmente currentRatchet/_chains.
const looksLikeSession = (v: unknown): boolean => {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return !!o.indexInfo && typeof o.indexInfo === 'object' && ('currentRatchet' in o || '_chains' in o || 'baseKey' in (o.indexInfo as object))
}

export function isSignalSessionDump(args: unknown[]): boolean {
  const first = args[0]
  if (typeof first === 'string' && DUMP_PREFIXES.some((p) => first.startsWith(p))) return true
  return args.some(looksLikeSession)
}

type ConsoleLike = Pick<Console, 'log' | 'info' | 'warn' | 'debug'>
const FILTERED = Symbol.for('atende-radar.signalLogFilter')

/** Envolve console.log/info/warn/debug para descartar os despejos de sessão do libsignal. Idempotente. */
export function installSignalLogFilter(c: ConsoleLike = console): void {
  const marked = c as ConsoleLike & { [FILTERED]?: true }
  if (marked[FILTERED]) return
  marked[FILTERED] = true
  for (const level of ['log', 'info', 'warn', 'debug'] as const) {
    const original = c[level].bind(c)
    c[level] = (...args: unknown[]) => {
      if (isSignalSessionDump(args)) return
      original(...args)
    }
  }
}
