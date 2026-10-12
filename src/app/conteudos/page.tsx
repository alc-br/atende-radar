import type { Metadata } from 'next'
import { BlogShell } from '@/components/site/blog-shell'
import { ConteudosLista } from '@/components/site/conteudos'
import { SITE_URL } from '@/lib/hosts'

export const metadata: Metadata = {
  title: 'Conteúdos — AtendeRadar',
  description: 'Dicas práticas e estratégias para vender mais, atender melhor e não perder oportunidades no WhatsApp.',
  alternates: SITE_URL ? { canonical: `${SITE_URL}/conteudos` } : undefined,
}

export default function ConteudosPage() {
  return (
    <BlogShell>
      <ConteudosLista />
    </BlogShell>
  )
}
