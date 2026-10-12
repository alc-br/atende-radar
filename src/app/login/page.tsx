import { redirect } from 'next/navigation'

// A tela de entrar/cadastro mora no app ("/"); este endereço existe para links antigos, para o NextAuth e para o
// "Sair". Repassa ?modo=cadastro|entrar|senha e ?demo=1.
export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === 'string') params.set(k, v)
  if (!params.has('modo') && !params.has('demo')) params.set('modo', 'entrar')
  redirect(`/?${params}`)
}
