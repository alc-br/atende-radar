import type { Metadata } from 'next'
import { BlogShell } from '@/components/site/blog-shell'
import { SITE_URL } from '@/lib/hosts'
import { healthReport, type ComponentState } from '@/lib/health'

// Situação do serviço para clientes, na linguagem deles. Calculada a cada visita (sem cache) e SEM detalhe técnico:
// nada de erro, versão, horário do último ciclo ou nome de banco. A página responde 200 mesmo com o serviço fora,
// para que o cliente sempre consiga ler o aviso.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Status do serviço — AtendeRadar',
  description: 'Veja se o AtendeRadar está funcionando normalmente agora.',
  alternates: SITE_URL ? { canonical: `${SITE_URL}/status` } : undefined,
}

const GERAL: Record<ComponentState, { titulo: string; texto: string }> = {
  ok: { titulo: 'Todos os sistemas operando normalmente', texto: 'O painel está no ar e as conversas estão sendo analisadas.' },
  degraded: {
    titulo: 'Funcionando, com atraso na análise',
    texto: 'O painel está no ar, mas alertas e indicadores podem demorar alguns minutos a mais para aparecer. Nenhuma mensagem é perdida.',
  },
  down: { titulo: 'Instabilidade no serviço', texto: 'Estamos trabalhando para normalizar. Nenhuma mensagem é perdida: tudo é analisado quando o serviço voltar.' },
}

const SITUACAO: Record<ComponentState, string> = { ok: 'Operando normalmente', degraded: 'Com atraso', down: 'Fora do ar' }

export default async function StatusPage() {
  const saude = await healthReport()
  const geral = GERAL[saude.status]
  const componentes: Array<[string, ComponentState]> = [
    ['Painel e dados', saude.components.painel],
    ['Análise das conversas e alertas', saude.components.analise],
  ]
  const conferido = new Date(saude.checkedAt).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
  return (
    <BlogShell>
      <main className="container">
        <article className="legal" data-status={saude.status}>
          <nav className="trilha" aria-label="Você está em">
            <a href="/">Início</a>/<span>Status</span>
          </nav>
          <header className="artigo-cab">
            <h1>Status do serviço</h1>
            <p className="linha-fina">Conferido às {conferido} (horário de Brasília). Atualize a página para conferir de novo.</p>
          </header>
          <section className="cartao status-geral" role="status">
            <span className={`status-ponto status-ponto--${saude.status}`} aria-hidden="true" />
            <div>
              <b>{geral.titulo}</b>
              <p>{geral.texto}</p>
            </div>
          </section>
          <ul className="status-lista" aria-label="Partes do serviço">
            {componentes.map(([nome, estado]) => (
              <li key={nome} className="cartao">
                <b>{nome}</b>
                <span>{SITUACAO[estado]}</span>
              </li>
            ))}
          </ul>
        </article>
      </main>
    </BlogShell>
  )
}
