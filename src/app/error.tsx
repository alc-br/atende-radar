'use client'

import { useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'
import { ErrorScreen } from '@/components/layout/error-screen'

// Falha inesperada ao montar uma página: o detalhe vai só para o console (e o log do servidor tem o mesmo digest).
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <ErrorScreen
      icon={TriangleAlert}
      title="Algo deu errado"
      text="Não conseguimos abrir esta página agora. Tente novamente; se continuar, volte ao painel."
      retry={reset}
      code={error.digest}
    />
  )
}
