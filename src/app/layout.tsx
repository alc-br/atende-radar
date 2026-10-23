import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/components/auth/auth-provider";
import { CookieConsent } from "@/components/consent/cookie-consent";
import { CONSENT_DEFAULT_SCRIPT, gtmId, gtmSnippet } from "@/lib/gtm";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

// Verificação do domínio na Meta (Gerenciador de Negócios > Segurança da marca > Domínios): o código vem do app.env.
const metaDomain = /^[a-z0-9]{10,64}$/.test(process.env.META_DOMAIN_VERIFICATION || "") ? process.env.META_DOMAIN_VERIFICATION! : null;

export const metadata: Metadata = {
  ...(metaDomain ? { verification: { other: { "facebook-domain-verification": metaDomain } } } : {}),
  title: "AtendeRadar - Auditor de Receita e Qualidade no WhatsApp",
  description: "Encontre o dinheiro que a equipe comercial está deixando escapar no atendimento.",
  keywords: ["AtendeRadar", "auditoria", "WhatsApp", "qualidade", "receita", "atendimento"],
  authors: [{ name: "AtendeRadar" }],
  icons: {
    icon: "/brand/favicon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Nonce da CSP desta requisição (src/proxy.ts): o script do tema roda inline e precisa dele. Ler os cabeçalhos
  // também deixa toda página dinâmica, que é o que permite um nonce novo a cada acesso.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  // medição (src/lib/gtm.ts): padrão do Consent Mode antes do GTM; o GTM só com GTM_ID válido no servidor
  const gtm = gtmId();
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${inter.variable} ${jakarta.variable}`}>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: CONSENT_DEFAULT_SCRIPT }} />
        {gtm && <script nonce={nonce} dangerouslySetInnerHTML={{ __html: gtmSnippet(gtm) }} />}
      </head>
      <body
        className={`antialiased bg-background text-foreground`}
      >
        {gtm && (
          <noscript>
            <iframe src={`https://www.googletagmanager.com/ns.html?id=${gtm}`} height="0" width="0" style={{ display: "none", visibility: "hidden" }} title="Google Tag Manager" />
          </noscript>
        )}
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          <AuthProvider>
            <TooltipProvider delayDuration={300}>
              {children}
            </TooltipProvider>
          </AuthProvider>
          <Toaster richColors position="top-right" />
          <CookieConsent />
        </ThemeProvider>
      </body>
    </html>
  );
}
