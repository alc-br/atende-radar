import { test, expect } from '@playwright/test'
import { installSignalLogFilter, isSignalSessionDump } from '../../src/lib/whatsapp/signal-log-filter'

// O libsignal (usado pelo Baileys) imprime o objeto da sessão inteiro ao fechar/abrir/migrar sessões: chaves privadas,
// rootKey e identidade do contato iam parar no journal do servidor. O filtro descarta só essas linhas.
const fakeSession = () => ({
  currentRatchet: { ephemeralKeyPair: { pubKey: Buffer.from('pub'), privKey: Buffer.from('segredo') }, rootKey: Buffer.from('raiz') },
  indexInfo: { baseKey: Buffer.from('base'), closed: -1, remoteIdentityKey: Buffer.from('id') },
})

const fakeConsole = () => {
  const out: unknown[][] = []
  const c = {
    log: (...a: unknown[]) => out.push(a),
    info: (...a: unknown[]) => out.push(a),
    warn: (...a: unknown[]) => out.push(a),
    debug: (...a: unknown[]) => out.push(a),
    error: (...a: unknown[]) => out.push(a),
  }
  return { c, out }
}

test.describe('WhatsApp · logs do libsignal', () => {
  test('reconhece as mensagens do libsignal que despejam a sessão', () => {
    for (const msg of ['Closing session:', 'Closing open session in favor of incoming prekey bundle', 'Removing old closed session:', 'Migrating session to:', 'Opening session:', 'Session already closed'])
      expect(isSignalSessionDump([msg, fakeSession()])).toBe(true)
    // objeto de sessão em qualquer posição, mesmo sem a mensagem conhecida
    expect(isSignalSessionDump(['outra coisa', fakeSession()])).toBe(true)
  })

  test('não mexe nos logs do próprio sistema', () => {
    expect(isSignalSessionDump(['[whatsapp]', 'conectado'])).toBe(false)
    expect(isSignalSessionDump(['Closing the report'])).toBe(false)
    expect(isSignalSessionDump([{ indexInfo: 1 }])).toBe(false)
    expect(isSignalSessionDump([])).toBe(false)
    expect(isSignalSessionDump([null, undefined, 3])).toBe(false)
  })

  test('instalado, descarta o despejo e deixa passar o resto (e só instala uma vez)', () => {
    const { c, out } = fakeConsole()
    installSignalLogFilter(c)
    installSignalLogFilter(c)
    c.info('Closing session:', fakeSession())
    c.warn('Closing open session in favor of incoming prekey bundle')
    c.log('Removing old closed session:', fakeSession())
    c.warn('Session already closed', fakeSession())
    c.log('[whatsapp]', 'conectado')
    c.error('Session error:Error: Bad MAC')
    expect(out).toEqual([['[whatsapp]', 'conectado'], ['Session error:Error: Bad MAC']])
    expect(JSON.stringify(out)).not.toContain('segredo')
  })
})
