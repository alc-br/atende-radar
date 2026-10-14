'use client'

import { useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'
import { ErrorScreen } from '@/components/layout/error-screen'
import './globals.css'

// Último recurso: falha no próprio layout raiz. Substitui o layout inteiro, por isso tem <html> e <body> próprios
// e importa os estilos de novo (sem as fontes do layout: cai nas fontes do sistema).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="pt-BR">
      <body className="antialiased">
        <title>Algo deu errado — AtendeRadar</title>
        <ErrorScreen
          icon={TriangleAlert}
          title="Algo deu errado"
          text="O AtendeRadar teve um problema ao abrir. Tente de novo em instantes."
          retry={reset}
          code={error.digest}
        />
      </body>
    </html>
  )
}
