'use client'

import { autoActionOf, type SystemTourStep } from '@/lib/system-tour/types'

// Leitura automática do "Tour pelo sistema": quem a liga não clica em nada, então o tour SIMULA a ação do passo.
// Um cursor de mentira desliza até o item, mostra o toque (onda + item "apertado") e então:
// - click/select: clica de verdade (só navegação: menu, tela, aba, botão que abre um formulário);
// - demo: só mostra onde fica (cadastro, envio, exclusão, pagamento NUNCA são executados) e segue.
// Tudo é cancelável (AbortSignal): pausar a leitura ou trocar de passo para o cursor e a ação pendente na hora.

export const AUTO_DEMO_MESSAGE = 'Na leitura automática só mostramos onde fica. Faça você mesmo quando quiser.'

/** Tempo do deslize do cursor até o item. */
export const GLIDE_MS = 600
/** Sem animação (prefers-reduced-motion): destaque parado por este tempo antes da ação. */
export const STILL_MS = 400
/** Sem o item na tela depois deste tempo, o passo segue sem a simulação (nunca trava). */
export const FIND_TIMEOUT_MS = 3000
/** Tempo do balão "só mostramos onde fica" na tela. */
const DEMO_HOLD_MS = 2200
const PRESS_MS = 260
const TYPE_KEY_MS = 70
const EXAMPLE_TEXT = 'Exemplo'

export type AutoResult = 'clicked' | 'demo' | 'missing'

class Aborted extends Error {}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Aborted())
    const t = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      window.clearTimeout(t)
      reject(new Aborted())
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

const visible = (el: Element) => {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}
const inViewport = (r: DOMRect) => r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth

function openDialog(): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')
  for (const d of all) if (!d.hasAttribute('data-system-tour-panel') && visible(d)) return d
  return null
}

function byTour(target: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(target)}"]`)) {
    if (!el.closest('[data-system-tour-panel]') && visible(el)) return el
  }
  return null
}

/** Espera o item aparecer, parado e dentro da tela (gaveta do celular abrindo, rolagem suave). */
async function waitForElement(find: () => HTMLElement | null, signal: AbortSignal): Promise<HTMLElement | null> {
  const started = Date.now()
  let last: string | null = null
  let scrolled = false
  while (Date.now() - started < FIND_TIMEOUT_MS) {
    const el = find()
    if (el) {
      const r = el.getBoundingClientRect()
      if (!inViewport(r) && !scrolled) {
        scrolled = true
        el.scrollIntoView({ block: 'center', inline: 'nearest' })
      }
      const key = `${Math.round(r.top)}:${Math.round(r.left)}:${Math.round(r.width)}`
      if (inViewport(r) && key === last) return el
      last = key
    }
    await sleep(120, signal)
  }
  return find()
}

const SUBMIT_WORDS = /^(salvar|criar|adicionar|convidar|gerar|enviar|conectar|cadastrar|confirmar)/i
const buttonText = (b: HTMLElement) => (b.textContent ?? '').trim()

/** Botão que concluiria o cadastro (só para apontar; nunca é clicado). */
function submitButtonIn(root: ParentNode): HTMLElement | null {
  const submit = root.querySelector<HTMLElement>('button[type="submit"]:not([disabled])')
  if (submit && visible(submit)) return submit
  for (const b of root.querySelectorAll<HTMLElement>('button')) {
    if (visible(b) && SUBMIT_WORDS.test(buttonText(b))) return b
  }
  return null
}

/** Primeiro campo de texto livre do formulário (recebe um exemplo digitado e apagado em seguida). */
function textFieldIn(root: ParentNode): HTMLInputElement | null {
  for (const i of root.querySelectorAll<HTMLInputElement>('input:not([type]), input[type="text"]')) {
    if (visible(i) && !i.disabled && !i.readOnly && !i.value) return i
  }
  return null
}

/** Onde a demonstração aponta: o formulário aberto, o item do passo ou o botão de salvar da tela. */
function demoTargets(step: SystemTourStep): { field: HTMLInputElement | null; button: HTMLElement | null; dialog: HTMLElement | null } {
  const dialog = openDialog()
  if (dialog) return { dialog, field: textFieldIn(dialog), button: submitButtonIn(dialog) }
  const own = step.target ? byTour(step.target) : null
  if (own) return { dialog: null, field: null, button: submitButtonIn(own) ?? own }
  const main = document.querySelector('main') ?? document.body
  return { dialog: null, field: null, button: submitButtonIn(main) }
}

function setInputValue(input: HTMLInputElement, value: string) {
  // campo controlado do React: usa o setter nativo e avisa com "input" para o estado acompanhar
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

/** Clique de verdade, com a sequência que abas e menus (Radix) escutam: pointerdown/mousedown/mouseup/click. */
function realClick(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  const init = { bubbles: true, cancelable: true, composed: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }
  if (typeof PointerEvent !== 'undefined') el.dispatchEvent(new PointerEvent('pointerdown', { ...init, pointerType: 'mouse', isPrimary: true }))
  el.dispatchEvent(new MouseEvent('mousedown', init))
  if (typeof PointerEvent !== 'undefined') el.dispatchEvent(new PointerEvent('pointerup', { ...init, pointerType: 'mouse', isPrimary: true }))
  el.dispatchEvent(new MouseEvent('mouseup', init))
  el.click()
}

// ── cursor simulado ──
// Fica no <body>, acima do painel do tour e dos formulários (z-index 55; toasts e menus continuam por cima).
// aria-hidden, sem foco e sem receber cliques: a pessoa continua usando a tela normalmente.

let lastPos: { x: number; y: number } | null = null

export class GhostCursor {
  private root: HTMLDivElement
  private balloonEl: HTMLDivElement

  constructor() {
    const root = document.createElement('div')
    root.className = 'tour-fantasma'
    root.setAttribute('aria-hidden', 'true')
    root.setAttribute('data-testid', 'system-tour-ghost')
    root.dataset.state = 'idle'
    root.innerHTML =
      '<span class="tour-fantasma__onda"></span>' +
      '<svg class="tour-fantasma__seta" viewBox="0 0 24 24" width="28" height="28" focusable="false">' +
      '<path d="M4 2.5 L4 20 L8.6 15.6 L11.6 22 L14.6 20.6 L11.7 14.4 L18 14.4 Z" /></svg>' +
      '<div class="tour-fantasma__balao" data-testid="system-tour-ghost-balloon"></div>'
    this.balloonEl = root.querySelector('.tour-fantasma__balao') as HTMLDivElement
    this.root = root
    document.body.appendChild(root)
    const start = lastPos ?? { x: window.innerWidth / 2, y: window.innerHeight * 0.6 }
    this.place(start.x, start.y, false)
  }

  get element() {
    return this.root
  }

  private place(x: number, y: number, animate: boolean) {
    this.root.classList.toggle('tour-fantasma--deslizando', animate)
    this.root.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
    lastPos = { x, y }
  }

  async moveTo(el: HTMLElement, reduced: boolean, signal: AbortSignal) {
    const r = el.getBoundingClientRect()
    const x = r.left + Math.min(r.width / 2, 48)
    const y = r.top + r.height / 2
    this.root.dataset.state = 'moving'
    // força o estilo atual antes de mudar a posição, para a transição sair de onde o cursor está
    void this.root.offsetWidth
    this.place(x, y, !reduced)
    await sleep(reduced ? 0 : GLIDE_MS, signal)
    // o item pode ter andado durante o deslize (rolagem): acerta sem animar
    const r2 = el.getBoundingClientRect()
    if (Math.abs(r2.top - r.top) > 2 || Math.abs(r2.left - r.left) > 2) this.place(r2.left + Math.min(r2.width / 2, 48), r2.top + r2.height / 2, false)
  }

  /** Onda no ponto do cursor (ou anel parado, sem animação). */
  press() {
    this.root.dataset.state = 'press'
    const wave = this.root.querySelector('.tour-fantasma__onda')
    if (wave) {
      wave.classList.remove('tour-fantasma__onda--ativa')
      void (wave as HTMLElement).offsetWidth
      wave.classList.add('tour-fantasma__onda--ativa')
    }
  }

  balloon(text: string | null) {
    this.balloonEl.textContent = text ?? ''
    this.root.classList.toggle('tour-fantasma--balao', !!text)
    // balão abre para o lado que cabe na tela
    const x = lastPos?.x ?? 0
    const y = lastPos?.y ?? 0
    this.root.classList.toggle('tour-fantasma--balao-esq', x > window.innerWidth - 300)
    this.root.classList.toggle('tour-fantasma--balao-cima', y > window.innerHeight - 140)
    if (!text) this.root.dataset.state = 'idle'
    else this.root.dataset.state = 'demo'
  }

  idle() {
    this.root.dataset.state = 'idle'
    this.root.querySelector('.tour-fantasma__onda')?.classList.remove('tour-fantasma__onda--ativa')
    this.balloon(null)
  }

  destroy() {
    this.root.remove()
  }
}

/** Marca o item como "apertado" (ou "escolhido", em aba/filtro) enquanto a simulação acontece. */
function mark(el: HTMLElement, cls: string) {
  el.classList.add(cls)
  return () => el.classList.remove(cls)
}

export interface AutoRunOptions {
  ghost: GhostCursor
  signal: AbortSignal
  reduced: boolean
  /** O formulário aberto foi aberto pelo próprio tour no passo anterior: fecha depois de demonstrar. */
  closeDialogAfter: boolean
  /** Chamado quando começa a demonstração (para o painel mostrar o aviso). */
  onDemo?: () => void
}

/**
 * Simula a ação do passo. Devolve 'clicked' (clicou de verdade), 'demo' (só mostrou) ou 'missing' (item não apareceu).
 * Rejeita só quando cancelado (signal); quem chama ignora o erro.
 */
export async function runAutoAction(step: SystemTourStep, o: AutoRunOptions): Promise<AutoResult> {
  const action = autoActionOf(step)
  const undo: Array<() => void> = []
  let typed: HTMLInputElement | null = null
  try {
    if (action === 'click' || action === 'select') {
      const el = step.target ? await waitForElement(() => byTour(step.target as string), o.signal) : null
      if (!el) return 'missing'
      await o.ghost.moveTo(el, o.reduced, o.signal)
      if (action === 'select') {
        undo.push(mark(el, 'tour-alvo--escolhendo'))
        await sleep(o.reduced ? STILL_MS : 450, o.signal)
      } else if (o.reduced) {
        undo.push(mark(el, 'tour-alvo--parado'))
        await sleep(STILL_MS, o.signal)
      }
      o.ghost.press()
      undo.push(mark(el, 'tour-alvo--apertado'))
      await sleep(PRESS_MS, o.signal)
      undo.splice(0).forEach((f) => f())
      realClick(el) // a onda termina sobre a tela nova; o cursor volta ao normal quando o passo muda
      return 'clicked'
    }

    // demo: aponta o campo e o botão, sem nunca enviar nada
    let t = demoTargets(step)
    if (!t.button && !t.field) {
      await waitForElement(() => {
        t = demoTargets(step)
        return t.field ?? t.button
      }, o.signal)
    }
    o.onDemo?.()
    if (t.field) {
      await o.ghost.moveTo(t.field, o.reduced, o.signal)
      o.ghost.press()
      undo.push(mark(t.field, 'tour-alvo--apertado'))
      await sleep(PRESS_MS, o.signal)
      typed = t.field
      if (o.reduced) {
        setInputValue(typed, EXAMPLE_TEXT)
        await sleep(STILL_MS, o.signal)
      } else {
        for (let i = 1; i <= EXAMPLE_TEXT.length; i++) {
          setInputValue(typed, EXAMPLE_TEXT.slice(0, i))
          await sleep(TYPE_KEY_MS, o.signal)
        }
        await sleep(300, o.signal)
      }
      setInputValue(typed, '')
      typed = null
      undo.splice(0).forEach((f) => f())
    }
    if (t.button) {
      await o.ghost.moveTo(t.button, o.reduced, o.signal)
      if (o.reduced) {
        undo.push(mark(t.button, 'tour-alvo--parado'))
      } else {
        o.ghost.press()
        undo.push(mark(t.button, 'tour-alvo--apertado'))
        await sleep(PRESS_MS, o.signal)
        undo.splice(0).forEach((f) => f())
        undo.push(mark(t.button, 'tour-alvo--parado'))
      }
    }
    o.ghost.balloon(AUTO_DEMO_MESSAGE)
    await sleep(DEMO_HOLD_MS, o.signal)
    o.ghost.idle()
    undo.splice(0).forEach((f) => f())
    if (o.closeDialogAfter && t.dialog && t.dialog.isConnected) closeDialog(t.dialog)
    return 'demo'
  } finally {
    // cancelado no meio: nada fica marcado nem digitado
    undo.forEach((f) => f())
    if (typed) setInputValue(typed, '')
  }
}

/** Fecha o formulário que o próprio tour abriu (Esc, como a pessoa faria; o Radix trata e cancela o evento). */
function closeDialog(dialog: HTMLElement) {
  dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))
}

export const isAborted = (e: unknown) => e instanceof Aborted
