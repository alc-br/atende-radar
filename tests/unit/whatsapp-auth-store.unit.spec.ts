import { test, expect } from '@playwright/test'
import crypto from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  SessionKeyError,
  decryptBlob,
  encryptBlob,
  isEncrypted,
  parseSessionsKey,
  loadEncryptedAuthState,
} from '../../src/lib/whatsapp/auth-store'

// Credenciais do WhatsApp cifradas em disco (WA_SESSIONS_KEY). Dependências do Baileys trocadas por equivalentes simples.
const deps = {
  initAuthCreds: () => ({ registered: false, noiseKey: 'novo' }),
  BufferJSON: { replacer: (_k: string, v: any) => v, reviver: (_k: string, v: any) => v },
  proto: { Message: { AppStateSyncKeyData: { fromObject: (v: unknown) => v } } },
}
const keyA = crypto.randomBytes(32)
const keyB = crypto.randomBytes(32)

let dir: string
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ar-wa-auth-'))
})
test.afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const files = () => readdirSync(dir).sort()
const raw = (name: string) => readFileSync(join(dir, name))

test.describe('credenciais do WhatsApp cifradas', () => {
  test('cifra e decifra (ida e volta); sem cabeçalho passa como texto', () => {
    const plain = Buffer.from('{"segredo":"chave-da-conta"}')
    const enc = encryptBlob(plain, keyA)
    expect(enc.subarray(0, 6).toString()).toBe('ARENC1')
    expect(enc.includes(Buffer.from('chave-da-conta'))).toBe(false)
    expect(decryptBlob(enc, keyA).equals(plain)).toBe(true)
    expect(decryptBlob(plain, keyA).equals(plain)).toBe(true)
    expect(() => decryptBlob(enc, keyB)).toThrow(SessionKeyError)
    expect(() => decryptBlob(enc, null)).toThrow(SessionKeyError)
  })

  test('chave: 32 bytes em base64; ausente ou curta vira modo texto puro', () => {
    expect(parseSessionsKey(keyA.toString('base64')).key?.equals(keyA)).toBe(true)
    expect(parseSessionsKey(undefined).key).toBeNull()
    expect(parseSessionsKey('').key).toBeNull()
    expect(parseSessionsKey(crypto.randomBytes(16).toString('base64')).key).toBeNull()
  })

  test('com chave: creds e chaves gravadas cifradas e lidas de volta', async () => {
    const a = await loadEncryptedAuthState(dir, { ...deps, key: keyA })
    a.state.creds.registered = true
    await a.saveCreds()
    await a.state.keys.set({ 'pre-key': { '1': { private: 'pk-secreta' } }, session: { 'x:1@s': { s: 'sessao' } } })

    expect(files()).toEqual(['creds.json', 'pre-key-1.json', 'session-x-1@s.json'])
    for (const f of files()) {
      expect(isEncrypted(raw(f))).toBe(true)
      expect(raw(f).includes(Buffer.from('secreta'))).toBe(false)
    }

    const b = await loadEncryptedAuthState(dir, { ...deps, key: keyA })
    expect(b.state.creds).toEqual({ registered: true, noiseKey: 'novo' })
    expect(await b.state.keys.get('pre-key', ['1', '2'])).toEqual({ '1': { private: 'pk-secreta' }, '2': null })
    await b.state.keys.set({ 'pre-key': { '1': null } })
    expect(existsSync(join(dir, 'pre-key-1.json'))).toBe(false)
  })

  test('sessão antiga em texto puro: lida normalmente e cifrada no lugar (sem perder nada)', async () => {
    writeFileSync(join(dir, 'creds.json'), JSON.stringify({ registered: true, me: 'antigo' }))
    writeFileSync(join(dir, 'session-abc.json'), JSON.stringify({ s: 'sessao-antiga' }))
    writeFileSync(join(dir, 'creds.json.tmp-999-dead'), 'sobra de gravação interrompida')

    const a = await loadEncryptedAuthState(dir, { ...deps, key: keyA })
    expect(a.migrated).toBe(2)
    expect(a.state.creds).toEqual({ registered: true, me: 'antigo' })
    expect(await a.state.keys.get('session', ['abc'])).toEqual({ abc: { s: 'sessao-antiga' } })
    expect(files()).toEqual(['creds.json', 'session-abc.json'])
    expect(isEncrypted(raw('creds.json'))).toBe(true)
    expect(isEncrypted(raw('session-abc.json'))).toBe(true)

    // arquivo em texto que aparece depois (migração preguiçosa): lido, e regravado cifrado no próximo save
    writeFileSync(join(dir, 'pre-key-7.json'), JSON.stringify({ k: 7 }))
    expect(await a.state.keys.get('pre-key', ['7'])).toEqual({ '7': { k: 7 } })
    await a.state.keys.set({ 'pre-key': { '7': { k: 8 } } })
    expect(isEncrypted(raw('pre-key-7.json'))).toBe(true)
    expect(await a.state.keys.get('pre-key', ['7'])).toEqual({ '7': { k: 8 } })
    expect(files().some((f) => f.includes('.tmp-'))).toBe(false)
  })

  test('chave errada: não sobe a sessão e NÃO apaga nem altera os arquivos', async () => {
    const a = await loadEncryptedAuthState(dir, { ...deps, key: keyA })
    a.state.creds.registered = true
    await a.saveCreds()
    await a.state.keys.set({ session: { s1: { s: 1 } } })
    const before = files().map((f) => [f, raw(f).toString('hex')])

    await expect(loadEncryptedAuthState(dir, { ...deps, key: keyB })).rejects.toThrow(SessionKeyError)
    await expect(loadEncryptedAuthState(dir, { ...deps, key: null })).rejects.toThrow(SessionKeyError)
    expect(files().map((f) => [f, raw(f).toString('hex')])).toEqual(before)

    // restaurando a chave certa, tudo volta
    const c = await loadEncryptedAuthState(dir, { ...deps, key: keyA })
    expect(c.state.creds.registered).toBe(true)
  })

  test('sem chave: continua em texto puro (dev e testes)', async () => {
    const sub = join(dir, 'conn1')
    mkdirSync(sub)
    writeFileSync(join(sub, 'creds.json'), JSON.stringify({ registered: true }))
    const a = await loadEncryptedAuthState(sub, { ...deps, key: null })
    expect(a.migrated).toBe(0)
    expect(a.state.creds).toEqual({ registered: true })
    await a.state.keys.set({ session: { s1: { s: 1 } } })
    expect(JSON.parse(readFileSync(join(sub, 'session-s1.json'), 'utf-8'))).toEqual({ s: 1 })
    expect(isEncrypted(readFileSync(join(sub, 'creds.json')))).toBe(false)

    // pasta nova sem chave: credenciais novas do Baileys
    const fresh = await loadEncryptedAuthState(join(dir, 'conn2'), { ...deps, key: null })
    expect(fresh.state.creds).toEqual({ registered: false, noiseKey: 'novo' })
  })
})
