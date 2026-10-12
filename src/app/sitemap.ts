import type { MetadataRoute } from 'next'
import { ARTIGOS } from '@/content/artigos'
import { SITE_URL } from '@/lib/hosts'

// Páginas públicas do site (o app fica fora do Google).
export default function sitemap(): MetadataRoute.Sitemap {
  const base = SITE_URL || ''
  return [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/conteudos`, changeFrequency: 'weekly', priority: 0.8 },
    ...ARTIGOS.map((a) => ({ url: `${base}/conteudos/${a.slug}`, lastModified: a.data, changeFrequency: 'monthly' as const, priority: 0.7 })),
    { url: `${base}/privacidade`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/termos`, changeFrequency: 'yearly', priority: 0.2 },
  ]
}
