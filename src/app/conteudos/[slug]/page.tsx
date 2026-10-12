import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BlogShell } from '@/components/site/blog-shell'
import { ArtigoView } from '@/components/site/conteudos'
import { ARTIGOS, artigoPorSlug } from '@/content/artigos'
import { SITE_URL } from '@/lib/hosts'

export const dynamicParams = false

export function generateStaticParams() {
  return ARTIGOS.map((a) => ({ slug: a.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = artigoPorSlug((await params).slug)
  if (!a) return {}
  const url = SITE_URL ? `${SITE_URL}/conteudos/${a.slug}` : undefined
  return {
    title: `${a.titulo} — AtendeRadar`,
    description: a.resumo,
    alternates: url ? { canonical: url } : undefined,
    openGraph: { type: 'article', title: a.titulo, description: a.resumo, url, publishedTime: a.data, siteName: 'AtendeRadar', locale: 'pt_BR' },
  }
}

export default async function ArtigoPage({ params }: { params: Promise<{ slug: string }> }) {
  const a = artigoPorSlug((await params).slug)
  if (!a) notFound()
  return (
    <BlogShell>
      <ArtigoView a={a} />
    </BlogShell>
  )
}
