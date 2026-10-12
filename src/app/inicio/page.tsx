import type { Metadata } from 'next'
import LandingPage from '@/components/landing/landing-page'
import { SITE_URL } from '@/lib/hosts'
import { publicPlans } from '@/lib/public-plans'

// Página de vendas renderizada no servidor (o Google lê o texto e os preços sem rodar JavaScript).
// No domínio do site o proxy serve esta rota em "/"; quem abre /inicio é levado para "/".
export const dynamic = 'force-dynamic' // preços vêm do banco a cada acesso

const TITULO = 'AtendeRadar: auditoria de vendas e atendimento no WhatsApp'
const DESCRICAO =
  'Descubra quantas vendas sua empresa perde depois que o cliente chama no WhatsApp. O AtendeRadar audita as conversas, aponta clientes sem retorno, propostas esquecidas e promessas não cumpridas. Teste grátis por 14 dias, sem cartão.'

export const metadata: Metadata = {
  metadataBase: SITE_URL ? new URL(SITE_URL) : undefined,
  title: TITULO,
  description: DESCRICAO,
  alternates: { canonical: SITE_URL ? `${SITE_URL}/` : '/' },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'AtendeRadar',
    title: TITULO,
    description: DESCRICAO,
    url: SITE_URL ? `${SITE_URL}/` : undefined,
    images: [{ url: '/brand/logo-atenderadar.webp' }],
  },
  twitter: { card: 'summary', title: TITULO, description: DESCRICAO },
}

export default async function InicioPage() {
  const plans = await publicPlans().catch(() => null) // sem banco, os planos carregam no navegador (com "Tentar novamente")
  const pagos = (plans ?? []).filter((p) => p.monthlyPrice > 0)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'AtendeRadar',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: DESCRICAO,
    ...(SITE_URL ? { url: `${SITE_URL}/` } : {}),
    ...(pagos.length
      ? {
          offers: {
            '@type': 'AggregateOffer',
            priceCurrency: pagos[0].currency || 'BRL',
            lowPrice: Math.min(...pagos.map((p) => p.monthlyPrice)),
            highPrice: Math.max(...pagos.map((p) => p.monthlyPrice)),
            offerCount: pagos.length,
          },
        }
      : {}),
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\u003c') }} />
      <LandingPage initialPlans={plans} />
    </>
  )
}
