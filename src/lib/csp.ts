// Política de conteúdo (CSP). Nas páginas, o proxy (src/proxy.ts) gera um nonce novo a cada requisição e o Next o
// aplica sozinho aos próprios scripts: nenhum script inline sem o nonce roda ('unsafe-inline' fora do script-src).
// Estilos continuam com 'unsafe-inline': React, Radix, sonner e next-themes usam atributo style e <style> criados em
// tempo de execução, que não carregam nonce. O navegador só conversa com o próprio app, com o Pagar.me (token do
// cartão) e com o ViaCEP. Em dev o Turbopack precisa de eval e de websocket para recarregar.
export function contentSecurityPolicy({ nonce, dev }: { nonce?: string; dev: boolean }): string {
  return [
    "default-src 'self'",
    `script-src 'self'${nonce ? ` 'nonce-${nonce}' 'strict-dynamic'` : ''}${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' https://api.pagar.me https://viacep.com.br${dev ? ' ws: wss:' : ''}`,
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ')
}

/** Nonce aleatório (128 bits, base64) para uma requisição. */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes))
}
