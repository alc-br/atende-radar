// Versão do sistema (package.json + commit do build no CI), definida em next.config.ts e embutida no build.
// Aparece no rodapé do painel e vai junto de cada chamado de suporte.
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || 'dev'
