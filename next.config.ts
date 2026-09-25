import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Baileys é ESM com dependências nativas: fica de fora do empacotamento
  serverExternalPackages: ['@whiskeysockets/baileys', 'libsignal', 'sharp', 'pino'],
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  poweredByHeader: false,
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
