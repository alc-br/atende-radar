// Executa uma vez quando o servidor sobe (Next.js). Liga as tarefas em segundo plano (motor de análise).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { startBackgroundJobs } = await import('./lib/background')
  startBackgroundJobs()
}
