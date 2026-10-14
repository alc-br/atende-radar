import type { Metadata } from 'next'
import { SearchX } from 'lucide-react'
import { ErrorScreen } from '@/components/layout/error-screen'

export const metadata: Metadata = {
  title: 'Página não encontrada — AtendeRadar',
  robots: { index: false, follow: false },
}

// Endereço que não existe (ou artigo removido do blog): resposta 404 com caminho de volta.
export default function NotFound() {
  return (
    <ErrorScreen
      icon={SearchX}
      title="Página não encontrada"
      text="O endereço pode ter mudado ou estar digitado errado. Use os botões abaixo para voltar."
    />
  )
}
