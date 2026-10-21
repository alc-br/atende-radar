// Aviso de cookies nos testes: todo navegador começa com a escolha já feita (medição e anúncios recusados), para o aviso
// não cobrir botões nos testes de tela. O teste do próprio aviso (consentimento.ui.spec.ts) começa sem escolha.
// Usado pelo playwright.config.ts (use.storageState) e por quem abre um contexto novo (browser.newContext).

export const CONSENT_DENIED_STATE = {
  cookies: [
    {
      name: 'ar_consent',
      value: encodeURIComponent(JSON.stringify({ v: 1, analytics: false, ads: false, at: '2026-10-21T00:00:00.000Z' })),
      domain: '127.0.0.1',
      path: '/',
      expires: Math.floor(Date.now() / 1000) + 180 * 86400,
      httpOnly: false,
      secure: false,
      sameSite: 'Lax' as const,
    },
  ],
  origins: [] as { origin: string; localStorage: { name: string; value: string }[] }[],
}
