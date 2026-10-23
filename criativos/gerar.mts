// Criativos de anúncio do AtendeRadar (criativos/README.md): imagens PNG 1080×1080 e 1080×1920 e 2 vídeos verticais
// de 20 s, desenhados em HTML e fotografados pelo Chromium do Playwright. Todos os dados são inventados.
// Rodar (Windows, Bun não abre os navegadores do Playwright): node --experimental-strip-types criativos/gerar.mts
// Saída em criativos/saida/ (fora do git). Os vídeos precisam do ffmpeg no PATH ou em FFMPEG.

import { chromium, type Page } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const OUT = join(DIR, 'saida')
const FFMPEG = process.env.FFMPEG || 'ffmpeg'
const ICONE = readFileSync(join(DIR, 'icone-atenderadar.svg'), 'utf8')
const LOGO_CLARO = readFileSync(join(DIR, 'logo-atenderadar-clara.svg'), 'utf8')
const LOGO = readFileSync(join(DIR, 'logo-atenderadar.svg'), 'utf8')

const FONTES = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=block">'
const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{width:var(--w);height:var(--h);overflow:hidden;font-family:Inter,sans-serif;color:#0d1726;-webkit-font-smoothing:antialiased}
.tela{position:relative;width:100%;height:100%;padding:var(--pad);display:flex;flex-direction:column;
  background:radial-gradient(70% 50% at 100% 0%,rgba(44,203,124,.35),transparent 60%),radial-gradient(60% 40% at 0% 100%,rgba(44,203,124,.25),transparent 60%),linear-gradient(160deg,#063d26 0%,#0a5c3b 55%,#07452d 100%);color:#fff}
.tela>*{flex-shrink:0}
.tela--clara{background:radial-gradient(60% 40% at 100% 0%,#dcf6e7,transparent 70%),#f3faf6;color:#0d1726}
h1{font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;letter-spacing:-.02em;line-height:1.08;font-size:var(--h1)}
h1 .verde{color:#2ccb7c}.tela--clara h1 .verde{color:#0d8f53}
.sub{font-size:var(--sub);line-height:1.35;opacity:.9;margin-top:.6em}
.logo svg{height:var(--logo);width:auto}
.chat{background:#efeae2;border-radius:28px;overflow:hidden;box-shadow:0 30px 60px -20px rgba(0,0,0,.45);color:#0d1726;font-size:var(--chat)}
.chat__topo{background:#0b6e4f;color:#fff;padding:.7em 1em;display:flex;align-items:center;gap:.6em;font-weight:600}
.chat__topo i{width:1.8em;height:1.8em;border-radius:50%;background:#bdeccf;display:inline-block}
.chat__topo small{display:block;font-weight:400;opacity:.8;font-size:.75em}
.chat__corpo{padding:1em;display:flex;flex-direction:column;gap:.6em}
.bolha{background:#fff;border-radius:.4em 1em 1em 1em;padding:.6em .8em;max-width:85%;line-height:1.3;box-shadow:0 1px 1px rgba(0,0,0,.08)}
.bolha--eu{align-self:flex-end;background:#d9fdd3;border-radius:1em .4em 1em 1em}
.bolha time{display:block;text-align:right;font-size:.65em;color:#667;margin-top:.2em}
.pendente{align-self:center;background:#fff4e5;color:#9a5b00;border-radius:999px;padding:.45em 1em;font-weight:600;font-size:.85em}
.alerta{background:#fff;color:#0d1726;border-radius:24px;padding:1.1em 1.2em;box-shadow:0 30px 60px -20px rgba(0,0,0,.45);font-size:var(--chat);border-left:8px solid #f5a524}
.alerta b.tag{display:inline-block;background:#fff4e5;color:#9a5b00;border-radius:999px;padding:.2em .7em;font-size:.7em;letter-spacing:.04em;text-transform:uppercase}
.alerta h3{font-family:'Plus Jakarta Sans',sans-serif;font-size:1.15em;margin:.4em 0 .2em}
.alerta p{color:#475467;line-height:1.35}
.cta{display:inline-flex;white-space:nowrap;align-items:center;gap:.5em;background:#2ccb7c;color:#063d26;font-weight:800;font-family:'Plus Jakarta Sans',sans-serif;border-radius:999px;padding:.7em 1.3em;font-size:var(--cta)}
.tela--clara .cta{background:#0d8f53;color:#fff}
.miuda{font-size:var(--miuda);opacity:.75}
.kpis{display:grid;grid-template-columns:1fr 1fr;gap:var(--gap)}
.kpi{background:#fff;color:#0d1726;border-radius:22px;padding:.8em 1em;font-size:var(--chat)}
.kpi b{display:block;font-family:'Plus Jakarta Sans',sans-serif;font-size:1.9em;line-height:1.1}
.kpi small{color:#5b6675;font-size:.8em}
.kpi--risco b{color:#d92d20}
.lista{display:flex;flex-direction:column;gap:var(--gap)}
.item{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:22px;padding:.8em 1em;font-size:var(--sub);display:flex;gap:.7em;align-items:center}
.item span{width:1.8em;height:1.8em;flex:none;border-radius:12px;background:#2ccb7c;color:#063d26;display:grid;place-items:center;font-weight:800}
.espaco{flex:1}
.linha{display:flex;align-items:center;justify-content:space-between;gap:20px}
`

// No story o rodapé empilha: botão na largura toda e a marca embaixo
const STORY_CSS = '.linha{flex-direction:column-reverse;align-items:stretch;gap:36px}.linha .cta{justify-content:center}'

type Fmt = 'quadrado' | 'story'
const VARS: Record<Fmt, string> = {
  quadrado: '--w:1080px;--h:1080px;--pad:64px 72px 56px;--h1:64px;--sub:30px;--logo:54px;--chat:27px;--cta:30px;--miuda:20px;--gap:18px',
  story: '--w:1080px;--h:1920px;--pad:220px 84px 260px;--h1:80px;--sub:36px;--logo:68px;--chat:32px;--cta:40px;--miuda:24px;--gap:24px',
}
const doc = (fmt: Fmt, body: string, extraCss = '') =>
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">${FONTES}<style>:root{${VARS[fmt]}}${CSS}${fmt === 'story' ? STORY_CSS : ''}${extraCss}</style></head><body>${body}</body></html>`

const chat = (cliente: string, eu: string, pendente: string, cls = '') => `
<div class="chat ${cls}"><div class="chat__topo"><i></i><span>Cliente<small>online</small></span></div>
<div class="chat__corpo"><div class="bolha b1">${cliente}<time>10:24</time></div><div class="bolha bolha--eu b2">${eu}<time>10:25</time></div>
<div class="pendente b3">⏱ ${pendente}</div></div></div>`
const alerta = (p: string, cls = '') =>
  `<div class="alerta ${cls}"><b class="tag">Atenção</b><h3>Oportunidade em risco</h3><p>${p}</p></div>`
const rodape = (claro = false) => `<div class="linha"><div class="logo">${claro ? LOGO : LOGO_CLARO}</div><span class="cta">Teste grátis por 14 dias →</span></div>
<p class="miuda" style="margin-top:14px">Sem cartão de crédito · Exemplo ilustrativo, dados fictícios</p>`

// ---------- imagens ----------
const IMAGENS: { nome: string; fmt: Fmt; html: string }[] = []
for (const fmt of ['quadrado', 'story'] as Fmt[]) {
  const st = fmt === 'story'
  IMAGENS.push({
    nome: `01-vendas-perdidas-${fmt}`,
    fmt,
    html: doc(fmt, `<div class="tela">
      <h1>Quantas vendas sua empresa perde <span class="verde">depois que o cliente chama</span> no WhatsApp?</h1>
      <div class="espaco"></div>
      <div style="display:grid;gap:var(--gap);${st ? '' : 'grid-template-columns:1.1fr 1fr;align-items:end'}">
        ${chat('Oi! Quanto fica e tem horário amanhã?', 'Vou verificar e já te retorno.', 'Sem retorno há 2 dias')}
        ${alerta('Cliente com intenção de compra ficou sem retorno.')}
      </div>
      <div class="espaco"></div>${rodape()}</div>`),
  })
  IMAGENS.push({
    nome: `02-clinicas-${fmt}`,
    fmt,
    html: doc(fmt, `<div class="tela tela--clara">
      <h1>O paciente pediu horário. <span class="verde">Alguém respondeu?</span></h1>
      <p class="sub">O AtendeRadar aponta quem ficou sem retorno no WhatsApp da recepção.</p>
      <div class="espaco"></div>
      ${chat('Quanto fica a avaliação e tem horário na quinta à tarde?', 'Vou confirmar com a agenda e já te falo.', 'Sem retorno há 2 dias')}
      <div class="espaco"></div>${rodape(true)}</div>`),
  })
  IMAGENS.push({
    nome: `03-painel-${fmt}`,
    fmt,
    html: doc(fmt, `<div class="tela">
      <h1>Seu atendimento no WhatsApp, <span class="verde">auditado todo dia.</span></h1>
      <p class="sub">Clientes sem retorno, propostas esquecidas e promessas não cumpridas, sem ler conversa por conversa.</p>
      <div class="espaco"></div>
      <div class="kpis">
        <div class="kpi"><b>523</b><small>conversas analisadas</small></div>
        <div class="kpi kpi--risco"><b>37</b><small>oportunidades em risco</small></div>
        <div class="kpi"><b>28</b><small>propostas identificadas</small></div>
        <div class="kpi"><b>12</b><small>promessas vencidas</small></div>
      </div>
      <div class="espaco"></div>${rodape()}</div>`),
  })
}

// ---------- vídeos (20 s, 30 fps, 1080×1920) ----------
const DUR = 20
const FPS = 30
const anim = `
/* no vídeo cada cena tem uma ideia só: dá para usar letra maior que na imagem */
:root{--h1:100px;--sub:44px;--chat:40px;--cta:46px;--miuda:28px;--gap:28px}
@keyframes entra{from{opacity:0;transform:translateY(60px)}to{opacity:1;transform:none}}
@keyframes sai{to{opacity:0;transform:translateY(-40px)}}
@keyframes aparece{from{opacity:0}to{opacity:1}}
@keyframes pulsa{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
.a{opacity:0;animation:entra .7s cubic-bezier(.2,.7,.2,1) forwards}
.cena{position:absolute;inset:0;padding:var(--pad);display:flex;flex-direction:column}
`
const at = (s: number) => `style="animation-delay:${s}s"`
/** Cena que aparece em `de` segundos e sai em `ate` (null: fica até o fim). */
const cena = (de: number, ate: number | null, inner: string) =>
  `<div class="cena" style="animation:aparece .4s ${de}s both${ate === null ? '' : `, sai .5s ${ate}s forwards`}">${inner}</div>`

const VIDEOS: { nome: string; html: string }[] = [
  {
    nome: 'video-01-orcamento-sem-retorno-story',
    html: doc('story', `<div class="tela" style="padding:0">
      ${cena(0, 4.2, `<h1 class="a" ${at(0.2)}>O cliente pediu orçamento no WhatsApp…</h1><p class="sub a" ${at(1.2)}>e a conversa parou ali.</p>`)}
      ${cena(4.5, 12.6, `<div class="espaco"></div>
        <div class="chat"><div class="chat__topo"><i></i><span>Cliente<small>online</small></span></div><div class="chat__corpo">
        <div class="bolha a" ${at(4.8)}>Bom dia! Consegue me passar um orçamento?<time>10:24</time></div>
        <div class="bolha bolha--eu a" ${at(6.3)}>Bom dia! Vou montar e te envio ainda hoje.<time>10:25</time></div>
        <div class="pendente a" ${at(8.6)}>⏱ 3 dias sem retorno</div></div></div>
        <p class="sub a" ${at(9.6)} style="text-align:center;margin-top:1.2em">Quantas conversas assim existem na sua empresa?</p><div class="espaco"></div>`)}
      ${cena(12.8, 16.6, `<div class="espaco"></div><p class="sub a" ${at(12.9)}>O AtendeRadar encontra para você:</p>
        <div class="a" ${at(13.6)} style="margin-top:.8em">${alerta('Cliente pediu orçamento e ficou sem retorno. Retome o contato hoje.')}</div><div class="espaco"></div>`)}
      ${cena(16.8, null, `<div class="espaco"></div><div class="logo a" ${at(16.9)}>${LOGO_CLARO}</div>
        <h1 class="a" ${at(17.3)} style="margin-top:.5em">Nenhum cliente <span class="verde">esquecido.</span></h1>
        <div class="a" ${at(17.9)} style="margin-top:1.2em"><span class="cta" style="animation:pulsa 1.2s 18.6s 2">Teste grátis por 14 dias →</span></div>
        <p class="miuda a" ${at(18.2)} style="margin-top:1em">Sem cartão de crédito · Exemplo ilustrativo, dados fictícios</p><div class="espaco"></div>`)}
    </div>`, anim),
  },
  {
    nome: 'video-02-tres-sinais-story',
    html: doc('story', `<div class="tela" style="padding:0">
      ${cena(0, 3.8, `<div class="espaco"></div><h1 class="a" ${at(0.2)}>3 vendas que escapam <span class="verde">no seu WhatsApp</span></h1><p class="sub a" ${at(1.2)}>e que ninguém está vendo.</p><div class="espaco"></div>`)}
      ${cena(4, 13.6, `<div class="espaco"></div><div class="lista">
        <div class="item a" ${at(4.2)}><span>1</span>Cliente que perguntou o preço e ficou sem resposta</div>
        <div class="item a" ${at(7.2)}><span>2</span>Proposta enviada que ninguém retomou</div>
        <div class="item a" ${at(10.2)}><span>3</span>"Te retorno amanhã" que nunca aconteceu</div></div><div class="espaco"></div>`)}
      ${cena(13.8, 16.8, `<div class="espaco"></div><p class="sub a" ${at(13.9)}>O AtendeRadar audita as conversas e mostra o que precisa de atenção:</p>
        <div class="kpis a" ${at(14.5)} style="margin-top:1em"><div class="kpi kpi--risco"><b>37</b><small>oportunidades em risco</small></div><div class="kpi"><b>12</b><small>promessas vencidas</small></div></div><div class="espaco"></div>`)}
      ${cena(17, null, `<div class="espaco"></div><div class="logo a" ${at(17.1)}>${LOGO_CLARO}</div>
        <h1 class="a" ${at(17.5)} style="margin-top:.5em">Conecte seu WhatsApp e <span class="verde">veja hoje.</span></h1>
        <div class="a" ${at(18)} style="margin-top:1.2em"><span class="cta">Teste grátis por 14 dias →</span></div>
        <p class="miuda a" ${at(18.3)} style="margin-top:1em">Sem cartão de crédito · Exemplo ilustrativo, dados fictícios</p><div class="espaco"></div>`)}
    </div>`, anim),
  },
]

async function abrir(page: Page, html: string) {
  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
}

// Nada pode passar da margem de segurança (no story, a área sob a interface do Instagram/Facebook)
async function dentroDaMargem(page: Page, nome: string) {
  const fora = await page.evaluate(() => {
    const tela = document.querySelector('.tela') as HTMLElement
    const limite = tela.clientHeight - parseFloat(getComputedStyle(tela).paddingBottom)
    let max = 0
    for (const el of tela.querySelectorAll('*')) max = Math.max(max, el.getBoundingClientRect().bottom)
    return Math.round(max - limite)
  })
  if (fora > 0) throw new Error(`${nome}: conteúdo passa ${fora}px da margem de segurança`)
}

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
try {
  for (const img of IMAGENS) {
    const page = await browser.newPage({ viewport: { width: 1080, height: img.fmt === 'story' ? 1920 : 1080 } })
    await abrir(page, img.html)
    await dentroDaMargem(page, img.nome)
    await page.screenshot({ path: join(OUT, `${img.nome}.png`) })
    await page.close()
    console.log('imagem', img.nome)
  }
  for (const v of VIDEOS) {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } })
    await abrir(page, v.html)
    const frames = join(OUT, `.frames-${v.nome}`)
    rmSync(frames, { recursive: true, force: true })
    mkdirSync(frames)
    // tempo controlado: todas as animações pausadas e posicionadas quadro a quadro (vídeo sem engasgo)
    await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
    for (let f = 0; f < DUR * FPS; f++) {
      const ms = (f / FPS) * 1000
      await page.evaluate((t) => document.getAnimations().forEach((a) => (a.currentTime = t)), ms)
      await page.screenshot({ path: join(frames, `${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 })
    }
    await page.close()
    execFileSync(FFMPEG, ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', join(frames, '%04d.jpg'),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', join(OUT, `${v.nome}.mp4`)])
    rmSync(frames, { recursive: true, force: true })
    console.log('vídeo', v.nome)
  }
} finally {
  await browser.close()
}
