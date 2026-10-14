import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

// Credenciais do WhatsApp (Baileys) cifradas em disco: AES-256-GCM por arquivo, chave em WA_SESSIONS_KEY.
// Formato: "ARENC1" (6 bytes) | IV (12) | tag (16) | conteúdo cifrado. O cabeçalho entra como AAD.
// Mesmo layout de arquivos do useMultiFileAuthState do Baileys (um JSON por chave), para a migração ser no lugar.
//
// Regras de segurança (perder estes arquivos = a empresa escaneia o QR de novo):
// - arquivo sem cabeçalho é JSON em texto puro (sessões antigas): é lido e regravado cifrado (troca atômica,
//   só depois de a cópia cifrada ser lida de volta e conferida);
// - sem WA_SESSIONS_KEY: continua em texto puro (dev/testes) e avisa uma vez no log;
// - arquivo cifrado que não abre (chave errada ou ausente): NUNCA é apagado nem sobrescrito; a sessão não sobe
//   (SessionKeyError) e volta a funcionar quando a chave certa for restaurada.

const MAGIC = Buffer.from('ARENC1', 'ascii')
const IV_LEN = 12
const TAG_LEN = 16
const HEADER_LEN = MAGIC.length + IV_LEN + TAG_LEN
const TMP_MARK = '.tmp-'

export class SessionKeyError extends Error {
  constructor(
    message: string,
    readonly file: string,
  ) {
    super(message)
    this.name = 'SessionKeyError'
  }
}

/** Lê a chave (32 bytes em base64). Ausente ou inválida → null (modo texto puro), com o motivo. */
export function parseSessionsKey(raw: string | undefined): { key: Buffer | null; problem?: string } {
  const v = raw?.trim()
  if (!v) return { key: null, problem: 'WA_SESSIONS_KEY ausente' }
  const key = Buffer.from(v, 'base64')
  if (key.length !== 32) return { key: null, problem: `WA_SESSIONS_KEY inválida (precisa de 32 bytes em base64, veio ${key.length})` }
  return { key }
}

let warned = false
/** Chave do ambiente. Sem chave, avisa uma única vez por processo. */
export function sessionsKeyFromEnv(log: (...a: unknown[]) => void = console.warn): Buffer | null {
  const { key, problem } = parseSessionsKey(process.env.WA_SESSIONS_KEY)
  if (!key && !warned) {
    warned = true
    log(`[whatsapp] ${problem}: credenciais das sessões ficam em TEXTO PURO no disco`)
  }
  return key
}

export const isEncrypted = (data: Buffer) => data.length >= MAGIC.length && data.subarray(0, MAGIC.length).equals(MAGIC)

export function encryptBlob(plain: Buffer, key: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_LEN)
  const c = crypto.createCipheriv('aes-256-gcm', key, iv)
  c.setAAD(MAGIC)
  const body = Buffer.concat([c.update(plain), c.final()])
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), body])
}

/** Sem cabeçalho → devolve como está (texto puro). Com cabeçalho e sem chave/chave errada → SessionKeyError. */
export function decryptBlob(data: Buffer, key: Buffer | null, file = '?'): Buffer {
  if (!isEncrypted(data)) return data
  if (!key) throw new SessionKeyError(`arquivo cifrado e WA_SESSIONS_KEY ausente/inválida: ${file}`, file)
  if (data.length < HEADER_LEN) throw new SessionKeyError(`arquivo cifrado truncado: ${file}`, file)
  try {
    const iv = data.subarray(MAGIC.length, MAGIC.length + IV_LEN)
    const tag = data.subarray(MAGIC.length + IV_LEN, HEADER_LEN)
    const d = crypto.createDecipheriv('aes-256-gcm', key, iv)
    d.setAAD(MAGIC)
    d.setAuthTag(tag)
    return Buffer.concat([d.update(data.subarray(HEADER_LEN)), d.final()])
  } catch {
    throw new SessionKeyError(`não foi possível decifrar (chave diferente da usada para gravar?): ${file}`, file)
  }
}

/** Grava em arquivo temporário (fsync) e troca pelo definitivo com rename: nunca deixa arquivo pela metade. */
export async function writeFileAtomic(file: string, data: Buffer) {
  const tmp = `${file}${TMP_MARK}${process.pid}-${crypto.randomBytes(4).toString('hex')}`
  const fh = await fs.open(tmp, 'w', 0o600)
  try {
    await fh.writeFile(data)
    await fh.sync()
  } finally {
    await fh.close()
  }
  try {
    await fs.rename(tmp, file)
  } catch (e) {
    await fs.rm(tmp, { force: true })
    throw e
  }
}

// Um arquivo por vez (o Baileys lê e grava as mesmas chaves em paralelo).
const locks = new Map<string, Promise<unknown>>()
function withLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(file) ?? Promise.resolve()
  const run = prev.then(fn, fn)
  const tail = run.catch(() => undefined)
  locks.set(file, tail)
  void tail.then(() => {
    if (locks.get(file) === tail) locks.delete(file)
  })
  return run
}

/**
 * Confere a pasta antes de a sessão subir: todo arquivo cifrado precisa abrir com a chave atual
 * (senão SessionKeyError, sem tocar em nada) e, com chave, os arquivos em texto puro são cifrados no lugar.
 */
export async function prepareSessionFolder(folder: string, key: Buffer | null) {
  let migrated = 0
  const names = await fs.readdir(folder).catch(() => [] as string[])
  for (const name of names) {
    const file = path.join(folder, name)
    if (name.includes(TMP_MARK)) {
      // sobra de uma gravação interrompida: o original continua intacto ao lado
      await fs.rm(file, { force: true })
      continue
    }
    if (!name.endsWith('.json')) continue
    await withLock(file, async () => {
      const data = await fs.readFile(file)
      if (isEncrypted(data)) {
        decryptBlob(data, key, file)
        return
      }
      if (!key) return
      try {
        JSON.parse(data.toString('utf-8'))
      } catch {
        return // texto puro corrompido: deixa como está (o Baileys já trata como ausente)
      }
      const enc = encryptBlob(data, key)
      // confere a cópia cifrada antes de ela substituir o original
      if (!decryptBlob(enc, key, file).equals(data)) throw new Error(`migração não conferiu: ${file}`)
      await writeFileAtomic(file, enc)
      const back = await fs.readFile(file)
      if (!decryptBlob(back, key, file).equals(data)) throw new Error(`migração não conferiu após gravar: ${file}`)
      migrated++
    })
  }
  return { migrated }
}

interface BaileysAuthDeps {
  initAuthCreds: () => any
  BufferJSON: { replacer: (k: string, v: any) => any; reviver: (k: string, v: any) => any }
  proto: any
}

/**
 * Igual ao useMultiFileAuthState do Baileys, mas cifrando cada arquivo (quando há chave) e com gravação atômica.
 * Lança SessionKeyError se algum arquivo cifrado não abre: nesse caso nada é gravado.
 */
export async function loadEncryptedAuthState(folder: string, opts: BaileysAuthDeps & { key: Buffer | null }) {
  const { key, initAuthCreds, BufferJSON, proto } = opts
  await fs.mkdir(folder, { recursive: true, mode: 0o700 })
  const st = await fs.stat(folder)
  if (!st.isDirectory()) throw new Error(`não é uma pasta: ${folder}`)
  const { migrated } = await prepareSessionFolder(folder, key)

  const fixFileName = (file: string) => file.replace(/\//g, '__').replace(/:/g, '-')
  const fileOf = (name: string) => path.join(folder, fixFileName(name))

  const writeData = (data: unknown, name: string) => {
    const file = fileOf(name)
    return withLock(file, async () => {
      const plain = Buffer.from(JSON.stringify(data, BufferJSON.replacer), 'utf-8')
      await writeFileAtomic(file, key ? encryptBlob(plain, key) : plain)
    })
  }

  const readData = (name: string) => {
    const file = fileOf(name)
    return withLock(file, async () => {
      let data: Buffer
      try {
        data = await fs.readFile(file)
      } catch {
        return null // não existe
      }
      const plain = decryptBlob(data, key, file) // cifrado que não abre: propaga, nunca vira "vazio"
      try {
        return JSON.parse(plain.toString('utf-8'), BufferJSON.reviver)
      } catch {
        return null
      }
    })
  }

  const removeData = (name: string) => {
    const file = fileOf(name)
    return withLock(file, () => fs.rm(file, { force: true }))
  }

  const creds = (await readData('creds.json')) || initAuthCreds()

  return {
    migrated,
    state: {
      creds,
      keys: {
        get: async (type: string, ids: string[]) => {
          const data: Record<string, any> = {}
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}.json`)
              if (type === 'app-state-sync-key' && value) value = proto.Message.AppStateSyncKeyData.fromObject(value)
              data[id] = value
            }),
          )
          return data
        },
        set: async (data: Record<string, Record<string, unknown>>) => {
          const tasks: Promise<unknown>[] = []
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id]
              const name = `${category}-${id}.json`
              tasks.push(value ? writeData(value, name) : removeData(name))
            }
          }
          await Promise.all(tasks)
        },
      },
    },
    saveCreds: () => writeData(creds, 'creds.json'),
  }
}
