// Conexões "estacionadas": ninguém escaneou o QR a tempo. A sessão só volta quando o cliente pede um QR novo, o que
// grava a linha da conexão no banco (updatedAt muda). Sem dependências para poder ser testado sozinho.

export type ParkedMap = Map<string, number>

/**
 * Estaciona a conexão. A gravação que marca "QR expirou" também muda o updatedAt da linha; por isso a marca é o
 * updatedAt que o banco devolveu, e não a hora de antes da gravação (senão a própria gravação parece um pedido novo
 * e a sessão volta a pedir QR ao WhatsApp a cada 15 s, para sempre). Enquanto grava, fica estacionada de vez.
 */
export async function park(map: ParkedMap, id: string, write: () => Promise<{ updatedAt: Date }>): Promise<void> {
  map.set(id, Number.POSITIVE_INFINITY)
  try {
    const row = await write()
    map.set(id, row.updatedAt.getTime())
  } catch (e) {
    map.set(id, Date.now())
    throw e
  }
}

/** true = continua estacionada (o cliente ainda não pediu de novo); false = pode abrir a sessão. Tira da lista ao liberar. */
export function stillParked(map: ParkedMap, id: string, updatedAt: Date): boolean {
  const at = map.get(id)
  if (at === undefined) return false
  if (updatedAt.getTime() <= at) return true
  map.delete(id)
  return false
}
