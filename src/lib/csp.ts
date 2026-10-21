// Política de conteúdo (CSP). Nas páginas, o proxy (src/proxy.ts) gera um nonce novo a cada requisição e o Next o
// aplica sozinho aos próprios scripts: nenhum script inline sem o nonce roda ('unsafe-inline' fora do script-src).
// Estilos continuam com 'unsafe-inline': React, Radix, sonner e next-themes usam atributo style e <style> criados em
// tempo de execução, que não carregam nonce. O navegador só conversa com o próprio app, com o Pagar.me (token do
// cartão), com o ViaCEP e com as tags de medição do Google Tag Manager (GA4, Google Ads e pixel da Meta, só com
// consentimento: docs/operacao/medicao.md). Em dev o Turbopack precisa de eval e de websocket para recarregar.
// Com 'strict-dynamic', a lista de hosts do script-src vale só para navegador antigo (sem CSP3); nos atuais, o gtm.js
// (com o nonce) carrega as tags dele.
const TAG_SCRIPTS = ['https://www.googletagmanager.com', 'https://connect.facebook.net', 'https://www.googleadservices.com', 'https://googleads.g.doubleclick.net']
const TAG_CONNECT = [
  'https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com', 'https://*.g.doubleclick.net',
  'https://www.google.com', 'https://www.facebook.com', 'https://connect.facebook.net',
]
const TAG_IMAGES = [...TAG_CONNECT, 'https://www.google.com.br']
const TAG_FRAMES = ['https://www.googletagmanager.com', 'https://td.doubleclick.net']

export function contentSecurityPolicy({ nonce, dev }: { nonce?: string; dev: boolean }): string {
  return [
    "default-src 'self'",
    `script-src 'self'${nonce ? ` 'nonce-${nonce}' 'strict-dynamic'` : ''} ${TAG_SCRIPTS.join(' ')}${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${TAG_IMAGES.join(' ')}`,
    "font-src 'self' data:",
    `connect-src 'self' https://api.pagar.me https://viacep.com.br ${TAG_CONNECT.join(' ')}${dev ? ' ws: wss:' : ''}`,
    `frame-src ${TAG_FRAMES.join(' ')}`,
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
