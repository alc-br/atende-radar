import { test, expect } from '@playwright/test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { SYSTEM_TOUR_CHAPTERS } from '../../src/lib/system-tour/content'
import { allDone, chapterStatus, chaptersFor, NARRATION_MAX, resumeChapter, stepSpeechText, stepSpokenText, stepsFor } from '../../src/lib/system-tour/engine'
import { NARRATIONS } from '../../src/lib/system-tour/narration'
import { normalizeTtsText, tourAudioKey, ttsConfig } from '../../src/lib/system-tour/tts'
import { applyUpdate, EMPTY_PROGRESS, isChapterId, parseProgress, parseUpdate } from '../../src/lib/system-tour/progress'
import { TOUR_SIGNALS } from '../../src/lib/system-tour/signals'
import { can, canOpenView, ROLES } from '../../src/lib/permissions'

// Tour pelo sistema: o conteúdo é coerente com as telas e cada papel recebe só o que pode usar.

function sourceText(dir: string): string {
  let out = ''
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out += sourceText(p)
    else if (/\.(tsx|ts)$/.test(name) && !p.includes(join('lib', 'system-tour'))) out += readFileSync(p, 'utf8') + '\n'
  }
  return out
}
const SRC = sourceText(join(__dirname, '..', '..', 'src'))
const SIDEBAR_VIEWS = ['dashboard', 'alerts', 'conversations', 'recovery', 'team', 'reports', 'connections', 'settings', 'members', 'teams', 'plans', 'admin']

const ids = (who: { role: string; isPlatformOperator?: boolean }) =>
  chaptersFor({ role: who.role, isPlatformOperator: !!who.isPlatformOperator }).map((c) => c.id)

test.describe('conteúdo do tour pelo sistema', () => {
  test('ids válidos e únicos, passos com título, texto e o que precisam', () => {
    const chapterIds = SYSTEM_TOUR_CHAPTERS.map((c) => c.id)
    expect(new Set(chapterIds).size).toBe(chapterIds.length)
    for (const c of SYSTEM_TOUR_CHAPTERS) {
      expect(isChapterId(c.id), c.id).toBe(true)
      expect(c.title.length).toBeGreaterThan(3)
      expect(c.summary.length).toBeGreaterThan(10)
      expect(c.views.length).toBeGreaterThan(0)
      const stepIds = c.steps.map((s) => s.id)
      expect(new Set(stepIds).size, `passos repetidos em ${c.id}`).toBe(stepIds.length)
      for (const s of c.steps) {
        expect(s.title.length, `${c.id}/${s.id}`).toBeGreaterThan(3)
        expect(s.body.length, `${c.id}/${s.id}`).toBeGreaterThan(0)
        if (s.kind === 'click') expect(s.target, `${c.id}/${s.id}: clique sem alvo`).toBeTruthy()
        if (s.kind === 'task') {
          expect(s.signal, `${c.id}/${s.id}: tarefa sem aviso`).toBeTruthy()
          expect(TOUR_SIGNALS).toContain(s.signal!)
        }
      }
    }
  })

  test('todo item destacado existe em alguma tela (data-tour)', () => {
    for (const c of SYSTEM_TOUR_CHAPTERS) {
      for (const s of c.steps) {
        if (!s.target) continue
        if (s.target.startsWith('nav-')) {
          expect(SIDEBAR_VIEWS, `${c.id}/${s.id}`).toContain(s.target.slice(4))
          continue
        }
        const found = SRC.includes(`"${s.target}"`) || SRC.includes(`'${s.target}'`)
        expect(found, `data-tour="${s.target}" (${c.id}/${s.id}) não existe em src/`).toBe(true)
      }
    }
  })

  test('todo aviso usado por um passo de tarefa é emitido por alguma tela', () => {
    const used = new Set(SYSTEM_TOUR_CHAPTERS.flatMap((c) => c.steps.map((s) => s.signal).filter(Boolean)))
    for (const sig of used) expect(SRC.includes(`tourSignal('${sig}')`), `ninguém emite ${sig}`).toBe(true)
  })

  test('cada capítulo termina com explicação ou clique (nunca numa tarefa que não daria para ver o resultado)', () => {
    for (const c of SYSTEM_TOUR_CHAPTERS) expect(c.steps[c.steps.length - 1].kind, c.id).not.toBe('task')
  })
})

test.describe('filtro por papel', () => {
  for (const role of ROLES) {
    test(`${role}: só capítulos e passos que o papel pode usar`, () => {
      const chapters = chaptersFor({ role, isPlatformOperator: false })
      expect(chapters.length).toBeGreaterThanOrEqual(3)
      expect(chapters[0].id).toBe('primeiros-passos')
      expect(chapters.some((c) => c.id === 'ajuda')).toBe(true)
      for (const c of chapters) {
        expect(c.steps.length).toBeGreaterThan(0)
        for (const v of c.views) expect(canOpenView(role, v), `${role} não abre ${v} (${c.id})`).toBe(true)
        if (c.requires) expect(can(role, c.requires)).toBe(true)
        for (const s of c.steps) {
          if (s.requires) expect(can(role, s.requires), `${role}: ${c.id}/${s.id}`).toBe(true)
          if (s.view) expect(canOpenView(role, s.view), `${role}: ${c.id}/${s.id}`).toBe(true)
          if (s.target?.startsWith('nav-')) expect(canOpenView(role, s.target.slice(4)), `${role}: ${c.id}/${s.id} aponta para ${s.target}`).toBe(true)
        }
      }
    })
  }

  test('dono vê Equipes, Membros, Conexões, Planos e Privacidade; atendente não', () => {
    const owner = ids({ role: 'admin' })
    for (const id of ['equipes', 'membros', 'whatsapp', 'planos', 'privacidade', 'configuracoes', 'relatorios']) expect(owner).toContain(id)
    const atendente = ids({ role: 'atendente' })
    for (const id of ['equipes', 'membros', 'whatsapp', 'planos', 'privacidade', 'configuracoes', 'equipe', 'admin']) expect(atendente).not.toContain(id)
    for (const id of ['primeiros-passos', 'visao-geral', 'alertas', 'conversas', 'recuperacao', 'ajuda']) expect(atendente).toContain(id)
  })

  test('só o operador da plataforma vê o capítulo Admin', () => {
    expect(ids({ role: 'admin' })).not.toContain('admin')
    expect(ids({ role: 'admin', isPlatformOperator: true })).toContain('admin')
    expect(ids({ role: 'viewer', isPlatformOperator: true })).toContain('admin')
  })

  test('passos de cadastro somem para quem não pode cadastrar', () => {
    const equipes = SYSTEM_TOUR_CHAPTERS.find((c) => c.id === 'equipes')!
    const sup = stepsFor(equipes, { role: 'supervisor', isPlatformOperator: false })
    expect(sup.length).toBeGreaterThan(0)
    expect(sup.some((s) => s.kind === 'task')).toBe(false)
    expect(stepsFor(equipes, { role: 'gestor', isPlatformOperator: false }).some((s) => s.signal === 'team.created')).toBe(true)

    const alertas = SYSTEM_TOUR_CHAPTERS.find((c) => c.id === 'alertas')!
    const at = stepsFor(alertas, { role: 'atendente', isPlatformOperator: false })
    expect(at.some((s) => s.target === 'alerts-tab-rules' || s.signal === 'alert-rule.created')).toBe(false)
  })

  test('mantém a ordem do manual (capítulos e passos)', () => {
    const order = SYSTEM_TOUR_CHAPTERS.map((c) => c.id)
    for (const role of ROLES) {
      const got = chaptersFor({ role, isPlatformOperator: true })
      const positions = got.map((c) => order.indexOf(c.id))
      expect(positions).toEqual([...positions].sort((a, b) => a - b))
      for (const c of got) {
        const all = SYSTEM_TOUR_CHAPTERS.find((x) => x.id === c.id)!.steps.map((s) => s.id)
        const pos = c.steps.map((s) => all.indexOf(s.id))
        expect(pos).toEqual([...pos].sort((a, b) => a - b))
      }
    }
  })

  test('papel desconhecido não quebra: só o que todo mundo abre', () => {
    const got = ids({ role: 'inventado' })
    expect(got).not.toContain('equipes')
    expect(got).not.toContain('membros')
  })
})

test.describe('progresso', () => {
  test('lê JSON estragado ou malicioso sem quebrar', () => {
    expect(parseProgress(null)).toEqual(EMPTY_PROGRESS)
    expect(parseProgress('{')).toEqual(EMPTY_PROGRESS)
    expect(parseProgress('"x"')).toEqual(EMPTY_PROGRESS)
    const p = parseProgress(JSON.stringify({ chapters: { equipes: { step: 2, done: true }, 'ID ruim': { step: 1 }, alertas: { step: -4 } }, last: 'equipes' }))
    expect(p.chapters.equipes).toEqual({ step: 2, done: true })
    expect(p.chapters['ID ruim']).toBeUndefined()
    expect(p.chapters.alertas).toEqual({ step: 0, done: false })
    expect(p.last).toBe('equipes')
  })

  test('valida o corpo do PATCH', () => {
    expect(parseUpdate(null)).toEqual(expect.any(String))
    expect(parseUpdate({ chapterId: '../x' })).toEqual(expect.any(String))
    expect(parseUpdate({ chapterId: 'equipes', step: 1.5 })).toEqual(expect.any(String))
    expect(parseUpdate({ chapterId: 'equipes', step: 9999 })).toEqual(expect.any(String))
    expect(parseUpdate({ chapterId: 'equipes', done: 'sim' })).toEqual(expect.any(String))
    expect(parseUpdate({ chapterId: 'equipes', step: 3, done: true })).toEqual({ chapterId: 'equipes', step: 3, done: true })
  })

  test('concluído não volta atrás; recomeçar volta ao passo 0; último capítulo é lembrado', () => {
    let p = applyUpdate(EMPTY_PROGRESS, { chapterId: 'equipes', step: 2 })
    expect(p).toEqual({ chapters: { equipes: { step: 2, done: false } }, last: 'equipes' })
    p = applyUpdate(p, { chapterId: 'equipes', step: 4, done: true })
    p = applyUpdate(p, { chapterId: 'equipes', reset: true })
    expect(p.chapters.equipes).toEqual({ step: 0, done: true })
    p = applyUpdate(p, { chapterId: 'alertas', step: 1 })
    expect(p.last).toBe('alertas')
  })

  test('status, continuar de onde parei e fim do manual', () => {
    const chapters = chaptersFor({ role: 'atendente', isPlatformOperator: false })
    const first = chapters[0]
    let p = applyUpdate(EMPTY_PROGRESS, { chapterId: first.id, step: 999 % 200 })
    expect(chapterStatus(first, p).step).toBe(first.steps.length - 1) // passo salvo além do fim é limitado
    expect(chapterStatus(first, p).started).toBe(true)
    p = applyUpdate(p, { chapterId: chapters[1].id, step: 1 })
    expect(resumeChapter(chapters, p)?.id).toBe(chapters[1].id)
    p = applyUpdate(p, { chapterId: chapters[1].id, done: true })
    expect(resumeChapter(chapters, p)?.id).toBe(first.id)
    expect(allDone(chapters, p)).toBe(false)
    for (const c of chapters) p = applyUpdate(p, { chapterId: c.id, done: true })
    expect(allDone(chapters, p)).toBe(true)
    expect(resumeChapter(chapters, p)).toBeNull()
  })
})

test('texto para leitura em voz alta: sem marcas de negrito, com listas e a instrução', () => {
  const text = stepSpeechText({
    id: 'x',
    kind: 'click',
    title: 'Título',
    body: ['Um **destaque** aqui', { list: ['item um', 'item dois.'] }],
    action: 'Clique em Criar',
  })
  expect(text).toBe('Título. Um destaque aqui. item um. item dois. Clique em Criar.')
  expect(text).not.toContain('*')
})

test.describe('narração falada', () => {
  test('todo passo tem narração explicativa, sem marcas de tela e dentro do limite', () => {
    for (const c of SYSTEM_TOUR_CHAPTERS) {
      for (const s of c.steps) {
        const n = s.narration ?? ''
        const where = `${c.id}/${s.id}`
        expect(n.trim().length, `${where}: sem narração`).toBeGreaterThan(60)
        expect(n.length, `${where}: narração com ${n.length} caracteres`).toBeLessThanOrEqual(NARRATION_MAX)
        expect(n, `${where}: markdown`).not.toMatch(/\*\*|__|`|#|\[|\]|→|←/)
        expect(n, `${where}: emoji`).not.toMatch(/\p{Extended_Pictographic}/u)
        expect(n, `${where}: sigla que a voz leria mal`).not.toMatch(/\b(SLA|CSV|XLSX|JSON|DPO|LGPD|KPI|QR Code)\b/)
        expect(n.split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length, `${where}: 2 a 5 frases ou mais curtas`).toBeGreaterThanOrEqual(2)
        // explica, não lê a tela: não pode ser só o texto da tela
        expect(normalizeTtsText(n)).not.toBe(normalizeTtsText(stepSpeechText(s)))
        expect(stepSpokenText(s)).toBe(n.trim())
      }
    }
  })

  test('toda narração pertence a um passo que existe', () => {
    const keys = new Set(SYSTEM_TOUR_CHAPTERS.flatMap((c) => c.steps.map((s) => `${c.id}/${s.id}`)))
    for (const k of Object.keys(NARRATIONS)) expect(keys.has(k), `narração órfã: ${k}`).toBe(true)
  })

  test('sem narração, a voz lê o texto da tela', () => {
    const step = { id: 'x', kind: 'info' as const, title: 'Título', body: ['Texto **forte**'] }
    expect(stepSpokenText(step)).toBe('Título. Texto forte.')
    expect(stepSpokenText({ ...step, narration: '   ' })).toBe('Título. Texto forte.')
    expect(stepSpokenText({ ...step, narration: ' Fala própria. ' })).toBe('Fala própria.')
  })
})

test.describe('cache do áudio da narração', () => {
  test('chave: sha256 em hexadecimal, estável, muda com voz, formato e texto', () => {
    const k = tourAudioKey('pt_BR-faber-medium.onnx', 'Olá, mundo.', 'mp3')
    expect(k).toMatch(/^[0-9a-f]{64}$/)
    expect(tourAudioKey('pt_BR-faber-medium.onnx', 'Olá, mundo.', 'mp3')).toBe(k)
    expect(tourAudioKey('pt_BR-faber-medium.onnx', '  Olá,\n  mundo. ', 'mp3'), 'espaços não mudam a fala').toBe(k)
    expect(tourAudioKey('pt_BR-edresson-low.onnx', 'Olá, mundo.', 'mp3')).not.toBe(k)
    expect(tourAudioKey('pt_BR-faber-medium.onnx', 'Olá, mundo!', 'mp3')).not.toBe(k)
    expect(tourAudioKey('pt_BR-faber-medium.onnx', 'Olá, mundo.', 'wav')).not.toBe(k)
  })

  test('texto para o Piper: uma linha só', () => {
    expect(normalizeTtsText(' a\n\nb\t c ')).toBe('a b c')
  })

  test('sem Piper configurado (ou com a voz ausente), o áudio fica indisponível', () => {
    expect(ttsConfig({})).toBeNull()
    expect(ttsConfig({ PIPER_BIN: 'piper' })).toBeNull()
    expect(ttsConfig({ PIPER_BIN: 'piper', PIPER_VOICE: join(__dirname, 'nao-existe.onnx') })).toBeNull()
    const voice = join(__dirname, 'system-tour.unit.spec.ts') // qualquer arquivo que exista
    const cfg = ttsConfig({ PIPER_BIN: 'node', PIPER_ARGS: '["a b.mjs", "--x"]', PIPER_VOICE: voice, TOUR_AUDIO_DIR: 'cache-x' })!
    expect(cfg.args).toEqual(['a b.mjs', '--x'])
    expect(cfg.voiceName).toBe('system-tour.unit.spec.ts')
    expect(cfg.dir).toBe(join(process.cwd(), 'cache-x'))
    expect(ttsConfig({ PIPER_BIN: 'node', PIPER_ARGS: '--a --b', PIPER_VOICE: voice })!.args).toEqual(['--a', '--b'])
  })
})
