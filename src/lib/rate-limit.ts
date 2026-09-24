// Limite de tentativas em memória (janela deslizante). Suficiente para uma instância única;
// se o sistema passar a rodar em mais de uma instância, trocar por Redis/banco.
const hits = new Map<string, number[]>()

/** Registra uma tentativa. Devolve false se passou do limite dentro da janela. */
export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs)
  if (recent.length >= limit) {
    hits.set(key, recent)
    return false
  }
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k)
  }
  return true
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
}
