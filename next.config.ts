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
};

export default nextConfig;
