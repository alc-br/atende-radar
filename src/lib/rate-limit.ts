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

/** Já passou do limite? (só consulta, não registra tentativa) */
export function exceeded(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  return (hits.get(key) || []).filter((t) => now - t < windowMs).length >= limit
}

/**
 * IP de quem chamou. Atrás do nginx o ÚLTIMO item do X-Forwarded-For é o que o próprio nginx viu; os anteriores vêm
 * do cliente e podem ser inventados para escapar dos limites.
 */
export function ipFromHeaders(get: (name: string) => string | null | undefined): string {
  const xff = get('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean)
  return xff?.at(-1) || get('x-real-ip') || 'unknown'
}

export function clientIp(req: Request): string {
  return ipFromHeaders((n) => req.headers.get(n))
}
