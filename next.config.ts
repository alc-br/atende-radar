import type { NextConfig } from "next";
import { readFileSync } from "node:fs";

// Versão mostrada no rodapé do painel e anexada aos chamados de suporte: a do package.json + o commit do build no CI.
const pkgVersion = (JSON.parse(readFileSync("./package.json", "utf8")) as { version?: string }).version || "0.0.0";
const commit = (process.env.GITHUB_SHA || "").slice(0, 7);
const appVersion = commit ? `${pkgVersion}+${commit}` : pkgVersion;

// No domínio do site, "/" é a página de vendas renderizada no servidor (src/app/inicio). Rewrite interno do Next,
// decidido pelo host; o endereço entra no build (NEXT_PUBLIC_SITE_URL, ver src/lib/hosts.ts).
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL && process.env.NEXT_PUBLIC_APP_URL ? process.env.NEXT_PUBLIC_SITE_URL : "";
const siteHostname = siteUrl ? new URL(siteUrl).hostname : "";

// Política de conteúdo: só scripts/estilos do próprio domínio (o Next injeta scripts inline, daí 'unsafe-inline');
// o navegador só conversa com o próprio app, com o Pagar.me (token do cartão) e com o ViaCEP. Em dev o Turbopack
// precisa de eval e de websocket para recarregar.
const dev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' https://api.pagar.me https://viacep.com.br${dev ? " ws: wss:" : ""}`,
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  // Baileys é ESM com dependências nativas: fica de fora do empacotamento
  serverExternalPackages: ['@whiskeysockets/baileys', 'libsignal', 'sharp', 'pino'],
  /* config options here */
  reactStrictMode: false,
  poweredByHeader: false,
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
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' }, // ninguém embute o sistema em outro site (clickjacking)
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ]
  },
};

export default nextConfig;
