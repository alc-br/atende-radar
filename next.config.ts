import type { NextConfig } from "next";

// No domínio do site, "/" é a página de vendas renderizada no servidor (src/app/inicio). Rewrite interno do Next,
// decidido pelo host; o endereço entra no build (NEXT_PUBLIC_SITE_URL, ver src/lib/hosts.ts).
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL && process.env.NEXT_PUBLIC_APP_URL ? process.env.NEXT_PUBLIC_SITE_URL : "";
const siteHostname = siteUrl ? new URL(siteUrl).hostname : "";

const nextConfig: NextConfig = {
  output: "standalone",
  // Baileys é ESM com dependências nativas: fica de fora do empacotamento
  serverExternalPackages: ['@whiskeysockets/baileys', 'libsignal', 'sharp', 'pino'],
  /* config options here */
  reactStrictMode: false,
  poweredByHeader: false,
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
        ],
      },
    ]
  },
};

export default nextConfig;
