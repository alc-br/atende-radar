import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { contentSecurityPolicy } from "./src/lib/csp";

// Versão mostrada no rodapé do painel e anexada aos chamados de suporte: a do package.json + o commit do build no CI.
const pkgVersion = (JSON.parse(readFileSync("./package.json", "utf8")) as { version?: string }).version || "0.0.0";
const commit = (process.env.GITHUB_SHA || "").slice(0, 7);
const appVersion = commit ? `${pkgVersion}+${commit}` : pkgVersion;

// No domínio do site, "/" é a página de vendas renderizada no servidor (src/app/inicio). Rewrite interno do Next,
// decidido pelo host; o endereço entra no build (NEXT_PUBLIC_SITE_URL, ver src/lib/hosts.ts).
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL && process.env.NEXT_PUBLIC_APP_URL ? process.env.NEXT_PUBLIC_SITE_URL : "";
const siteHostname = siteUrl ? new URL(siteUrl).hostname : "";

// Política de conteúdo (src/lib/csp.ts): nas páginas quem manda o cabeçalho é o proxy, com um nonce por requisição;
// aqui fica a versão sem nonce (nenhum script inline) para as respostas das APIs.
const dev = process.env.NODE_ENV !== "production";
const apiCsp = contentSecurityPolicy({ dev });

const nextConfig: NextConfig = {
  output: "standalone",
  // Baileys é ESM com dependências nativas: fica de fora do empacotamento
  serverExternalPackages: ['@whiskeysockets/baileys', 'libsignal', 'sharp', 'pino'],
  /* config options here */
  reactStrictMode: false,
  poweredByHeader: false,
  // Só no dev: desde o next 16.3 o /_next/hmr de outra origem é bloqueado, e sem ele a página não hidrata.
  // Os testes abrem o servidor por 127.0.0.1 (o dev se anuncia como localhost).
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // Worktrees com node_modules como junção para outra pasta: o Turbopack só aceita links dentro da raiz.
  // TURBOPACK_ROOT aponta uma pasta acima das duas (só no desenvolvimento; o build de produção não usa).
  ...(process.env.TURBOPACK_ROOT ? { turbopack: { root: process.env.TURBOPACK_ROOT } } : {}),
  env: { NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || appVersion },
  async rewrites() {
    if (!siteHostname) return { beforeFiles: [] };
    return { beforeFiles: [{ source: '/', has: [{ type: 'host', value: siteHostname }], destination: '/inicio' }] };
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' }, // ninguém embute o sistema em outro site (clickjacking)
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          // isolamento entre origens: outra aba/janela não ganha referência a esta, e o que a página carrega é só do
          // próprio domínio (todo recurso já é 'self' pela CSP; o Pagar.me e o ViaCEP são chamados com CORS)
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
      // logo e ícone aparecem nos e-mails (webmail de outro domínio carrega a imagem direto do app)
      { source: '/brand/:path*', headers: [{ key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' }] },
      { source: '/api/:path*', headers: [{ key: 'Content-Security-Policy', value: apiCsp }] },
    ]
  },
};

export default nextConfig;
