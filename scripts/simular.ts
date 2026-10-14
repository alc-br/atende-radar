// Ambiente de simulação (S1) pela linha de comando: é o que o operador e o agente de IA usam para rodar os cenários
// e conferir o resultado sem tela. Documentação: docs/operacao/simulacao.md
//
//   bun scripts/simular.ts listar [--json]
//   bun scripts/simular.ts rodar <id|todos> [--json] [--manter]
//   bun scripts/simular.ts limpar [--json]
//
// Direto no banco (DATABASE_URL, como o servidor) por padrão. Com --api <url> chama a API do servidor em vez disso,
// autenticado pelo Bearer SIMULATION_SECRET (variável de ambiente; nunca na linha de comando).
//
// Só funciona com SIMULATION_ENABLED=on (no modo --api, a variável que vale é a do servidor).
// Código de saída: 0 = tudo verde · 1 = alguma asserção falhou (ou cenário com erro) · 2 = uso errado / desligado / falha.

process.env.DB_QUIET = '1' // sem o log de cada consulta do Prisma

type Result = { scenarioId: string; title: string; status: string; durationMs: number; organizationId: string | null; kept: boolean; error?: string; assertions: { at: number | null; label: string; ok: boolean; detail?: string }[] }
type Catalog = { id: string; title: string; description: string; plan: string; steps: number }[]

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const option = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const apiUrl = option('--api')
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--api')
const [command, target] = positional
const json = flag('--json')
const keep = flag('--manter')

const USAGE = `Uso:
  bun scripts/simular.ts listar [--json]
  bun scripts/simular.ts rodar <id|todos> [--json] [--manter]
  bun scripts/simular.ts limpar [--json]
Opções: --api <url> (usa a API do servidor com SIMULATION_SECRET), --manter (não apaga a empresa simulada; some em 24 h)`

function die(msg: string, code = 2): never {
  if (json) console.log(JSON.stringify({ ok: false, error: msg }))
  else console.error(msg)
  process.exit(code)
}

async function api<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const secret = process.env.SIMULATION_SECRET
  if (!secret) die('--api precisa da variável SIMULATION_SECRET')
  const res = await fetch(new URL(`/api/admin/simulation/${path}`, apiUrl), {
    method,
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (res.status === 404 && !data.error) die('Simulação desligada no servidor (SIMULATION_ENABLED) ou endereço errado')
  if (!res.ok) die(`API respondeu ${res.status}: ${data.error ?? 'erro'}`)
  return data
}

function printResult(r: Result) {
  const mark = r.status === 'passed' ? 'OK   ' : r.status === 'failed' ? 'FALHA' : 'ERRO '
  console.log(`${mark} ${r.scenarioId} — ${r.title} (${(r.durationMs / 1000).toFixed(1)} s)${r.kept ? ` [mantida: ${r.organizationId}]` : ''}`)
  if (r.error) console.log(`      erro: ${r.error}`)
  for (const a of r.assertions) {
    if (a.ok && r.status === 'passed') continue
    console.log(`      ${a.ok ? '✓' : '✗'} ${a.at === null ? 'fim' : `min ${a.at}`}: ${a.label}${a.detail ? ` — ${a.detail}` : ''}`)
  }
}

async function main() {
  if (!command || !['listar', 'rodar', 'limpar'].includes(command)) die(USAGE)
  if (!apiUrl && process.env.SIMULATION_ENABLED !== 'on') die('Ambiente de simulação desligado: defina SIMULATION_ENABLED=on (só em ambiente de teste/homologação).')

  if (command === 'listar') {
    const catalog: Catalog = apiUrl ? (await api<{ scenarios: Catalog }>('GET', 'scenarios')).scenarios : (await import('../src/lib/simulation/scenarios')).scenarioCatalog()
    if (json) console.log(JSON.stringify({ ok: true, scenarios: catalog }, null, 2))
    else for (const s of catalog) console.log(`${s.id.padEnd(32)} [${s.plan}] ${s.title}`)
    return 0
  }

  if (command === 'limpar') {
    const r = apiUrl ? await api<{ deleted: number }>('POST', 'clean') : await (await import('../src/lib/simulation/cleanup')).cleanSimulations('cli')
    if (json) console.log(JSON.stringify({ ok: true, deleted: r.deleted }))
    else console.log(`${r.deleted} empresa(s) simulada(s) apagada(s).`)
    return 0
  }

  if (!target) die(`Informe o cenário (ou "todos").\n${USAGE}`)
  let results: Result[]
  if (apiUrl) {
    results = (await api<{ results: Result[] }>('POST', 'run', { scenarioId: target, keep })).results
  } else {
    const { runScenarios, scenarioById } = await import('../src/lib/simulation/runner')
    if (target !== 'todos' && target !== 'all' && !scenarioById(target)) die(`Cenário "${target}" não existe. Veja: bun scripts/simular.ts listar`)
    results = await runScenarios(target, { keep, startedBy: 'cli' })
  }
  const passed = results.filter((r) => r.status === 'passed').length
  const ok = passed === results.length
  if (json) console.log(JSON.stringify({ ok, total: results.length, passed, failed: results.length - passed, results }, null, 2))
  else {
    for (const r of results) printResult(r)
    console.log(`\n${passed}/${results.length} cenário(s) verde(s).`)
  }
  return ok ? 0 : 1
}

main()
  .then(async (code) => {
    if (!apiUrl) await (await import('../src/lib/db')).db.$disconnect().catch(() => {})
    process.exit(code)
  })
  .catch((e) => die(`Falha: ${e instanceof Error ? e.message : String(e)}`))
