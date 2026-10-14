// Trava dos scripts de carga: só rodam contra um banco SQLite dentro de .tmp (nunca dev.db, test.db ou produção).
export const ORG_GRANDE = 'org_carga_grande'
export const TAMANHO = { conversas: 20_000, mensagens: 200_000 }

export function exigirBancoDeCarga() {
  const url = process.env.DATABASE_URL || ''
  const caminho = url.replace(/^file:/, '').replace(/\\/g, '/')
  if (!url.startsWith('file:') || !/\/\.tmp\/[^/]+\.db$/.test(caminho)) {
    console.error(`DATABASE_URL precisa apontar para um arquivo .db dentro de .tmp (recebido: ${url || 'vazio'})`)
    process.exit(2)
  }
}
