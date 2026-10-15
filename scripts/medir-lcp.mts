// V6 · Mede o LCP (Largest Contentful Paint) de uma página com rede 4G lenta e CPU desacelerada, no Chromium.
//
//   node --experimental-strip-types scripts/medir-lcp.mts <url> [--vezes=5] [--cpu=4] [--desktop]
//   ex.: node --experimental-strip-types scripts/medir-lcp.mts https://atenderadar.com.br/
//
// (O Bun não abre os navegadores do Playwright no Windows; por isso node com .mts.)
//
// Perfil: o mesmo "Slow 4G" do Lighthouse com limitação no DevTools (latência 562,5 ms, 1,47 Mbit/s de descida,
// 675 kbit/s de subida) + CPU 4× mais lenta, tela de celular 412×823. Cada rodada usa um contexto novo (sem cache nem
// cookies), então mede a PRIMEIRA visita. Mostra cada rodada e a mediana. Só lê a página (GET), não envia nada.
import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
const url = args.find((a) => !a.startsWith('--'))
const opt = (name: string, def: number) => {
  const a = args.find((x) => x.startsWith(`--${name}=`))
  return a ? Number(a.split('=')[1]) : def
}
if (!url || !/^https?:\/\//.test(url)) {
  console.error('uso: node --experimental-strip-types scripts/medir-lcp.mts <url> [--vezes=5] [--cpu=4] [--desktop]')
  process.exit(2)
}
const runs = opt('vezes', 5)
const cpuRate = opt('cpu', 4)
const desktop = args.includes('--desktop')

const NETWORK = { offline: false, latency: 562.5, downloadThroughput: (1474.56 * 1024) / 8, uploadThroughput: (675 * 1024) / 8 }

type Result = { lcp: number; fcp: number | null; ttfb: number | null; element: string; size: number; status: number | null }

async function measureOnce(): Promise<Result> {
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext(
      desktop
        ? { viewport: { width: 1350, height: 940 } }
        : { viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true },
    )
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    await cdp.send('Network.emulateNetworkConditions', NETWORK)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate })

    // o observador entra antes de qualquer script da página; buffered pega o que já foi pintado
    await page.addInitScript(() => {
      const w = window as unknown as { __lcp: { t: number; el: string; size: number } | null }
      w.__lcp = null
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as Array<PerformanceEntry & { element?: Element; size: number; url?: string }>) {
          const el = e.element
          const desc = el ? `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''}` : (e.url ?? '?')
          w.__lcp = { t: e.startTime, el: desc, size: e.size }
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true })
    })

    const resp = await page.goto(url!, { waitUntil: 'load', timeout: 120_000 })
    await page.waitForTimeout(3000) // deixa chegar um LCP tardio (fonte, imagem)
    // o LCP para de ser atualizado na primeira interação; aqui não há interação, então lê o último candidato
    const data = await page.evaluate(() => {
      const w = window as unknown as { __lcp: { t: number; el: string; size: number } | null }
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]
      return { lcp: w.__lcp, ttfb: nav ? nav.responseStart : null, fcp: fcp ? fcp.startTime : null }
    })
    if (!data.lcp) throw new Error('o navegador não registrou LCP')
    return { lcp: data.lcp.t, fcp: data.fcp, ttfb: data.ttfb, element: data.lcp.el, size: data.lcp.size, status: resp?.status() ?? null }
  } finally {
    await browser.close()
  }
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const ms = (x: number | null) => (x == null ? '—' : `${Math.round(x)} ms`)

console.log(`LCP de ${url}`)
console.log(`perfil: ${desktop ? 'desktop 1350×940' : 'celular 412×823'}, rede Slow 4G (562,5 ms, 1,47 Mbit/s ↓, 675 kbit/s ↑), CPU ${cpuRate}×, sem cache, ${runs} rodada(s)`)
const results: Result[] = []
for (let i = 1; i <= runs; i++) {
  const r = await measureOnce()
  results.push(r)
  console.log(`  #${i}: HTTP ${r.status} · TTFB ${ms(r.ttfb)} · FCP ${ms(r.fcp)} · LCP ${ms(r.lcp)} (${r.element}, ${r.size} px²)`)
}
const lcpMed = median(results.map((r) => r.lcp))
console.log(`mediana: LCP ${ms(lcpMed)} · FCP ${ms(median(results.map((r) => r.fcp ?? 0)))} · TTFB ${ms(median(results.map((r) => r.ttfb ?? 0)))}`)
console.log(`faixa: ${lcpMed <= 2500 ? 'BOM (≤ 2,5 s)' : lcpMed <= 4000 ? 'PRECISA MELHORAR (2,5–4 s)' : 'RUIM (> 4 s)'} pelos limites do Core Web Vitals`)
