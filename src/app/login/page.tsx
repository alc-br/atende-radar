import { redirect } from 'next/navigation'

// A tela de entrar/cadastro mora no app ("/"); este endereço existe para links antigos, para o NextAuth e para o
// "Sair". Repassa ?modo=cadastro|entrar|senha.
export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === 'string') params.set(k, v)
  params.delete('demo') // a demonstração pública não existe mais
  if (!params.has('modo')) params.set('modo', 'entrar')
  redirect(`/?${params}`)
}
