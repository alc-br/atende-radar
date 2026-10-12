// Ícones da landing: os mesmos desenhos do sprite do pacote de design (atenderadar-completo).
import type { SVGProps } from 'react'

type IconName =
  | 'seta' | 'check' | 'play' | 'brilho' | 'msg' | 'relogio' | 'pessoas' | 'olho' | 'lupa' | 'cifrao'
  | 'barras' | 'sino' | 'equipe' | 'arquivo' | 'alvo' | 'escudo' | 'chat' | 'menu' | 'fechar'

const STROKE = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const

function shape(name: IconName) {
  switch (name) {
    case 'seta':
      return <g {...STROKE} strokeWidth={2.2}><path d="M5 12h14M13 6l6 6-6 6" /></g>
    case 'check':
      return (
        <>
          <circle cx="12" cy="12" r="10" fill="currentColor" />
          <path d="m7.8 12.4 2.8 2.8 5.6-6" fill="none" stroke="#fff" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )
    case 'play':
      return <g {...STROKE} strokeWidth={2}><circle cx="12" cy="12" r="10" /><path d="M10 8.5v7l5.5-3.5z" fill="currentColor" /></g>
    case 'brilho':
      return <path fill="currentColor" d="M12 1.5c.5 4.9 2.6 7.5 9 8.5v4c-6.4 1-8.5 3.6-9 8.5-.5-4.9-2.6-7.5-9-8.5v-4c6.4-1 8.5-3.6 9-8.5z" />
    case 'msg':
      return <g {...STROKE} strokeWidth={2}><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /><path d="M8 12h.01M12 12h.01M16 12h.01" strokeWidth={2.8} /></g>
    case 'relogio':
      return <g {...STROKE} strokeWidth={2}><circle cx="12" cy="12" r="9.5" /><path d="M12 6.5V12l3.5 2" /></g>
    case 'pessoas':
      return (
        <g {...STROKE} strokeWidth={2}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </g>
      )
    case 'olho':
      return (
        <g {...STROKE} strokeWidth={2}>
          <path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0" /><circle cx="12" cy="12" r="3" />
        </g>
      )
    case 'lupa':
      return <g {...STROKE} strokeWidth={2.4}><circle cx="11" cy="11" r="7" /><path d="m20.5 20.5-4.2-4.2" /></g>
    case 'cifrao':
      return <g {...STROKE} strokeWidth={2.4}><path d="M12 2v20M17 5.5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></g>
    case 'barras':
      return (
        <g fill="currentColor">
          <rect x="3.5" y="13" width="4.2" height="8" rx="1.2" /><rect x="9.9" y="8" width="4.2" height="13" rx="1.2" />
          <rect x="16.3" y="3" width="4.2" height="18" rx="1.2" />
        </g>
      )
    case 'sino':
      return <g {...STROKE} strokeWidth={2.2}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></g>
    case 'equipe':
      return (
        <g fill="currentColor">
          <circle cx="12" cy="7.2" r="3.4" /><circle cx="5.2" cy="9" r="2.5" /><circle cx="18.8" cy="9" r="2.5" />
          <path d="M6.2 20.5a5.8 5.8 0 0 1 11.6 0v.5H6.2z" />
          <path d="M1 20.5c0-2.6 1.9-4.6 4.4-4.6.7 0 1.3.1 1.9.4a7.6 7.6 0 0 0-2.4 4.7H1z" />
          <path d="M23 20.5c0-2.6-1.9-4.6-4.4-4.6-.7 0-1.3.1-1.9.4a7.6 7.6 0 0 1 2.4 4.7H23z" />
        </g>
      )
    case 'arquivo':
      return (
        <g {...STROKE} strokeWidth={2.2}>
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4M9 13h6M9 17h6M9 9h2" />
        </g>
      )
    case 'alvo':
      return (
        <g {...STROKE} strokeWidth={2.4}>
          <path d="M20.6 9.4A9 9 0 1 1 14.6 3.4" /><path d="M15.8 11.2a4 4 0 1 1-3-3" /><path d="m12 12 7.5-7.5M15.5 4.5h4v4" />
        </g>
      )
    case 'escudo':
      return (
        <>
          <path d="M12 22s8-3.6 8-10V5.2L12 2 4 5.2V12c0 6.4 8 10 8 10z" fill="currentColor" />
          <path d="m8.6 12 2.4 2.4 4.4-4.6" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )
    case 'chat':
      return <g {...STROKE} strokeWidth={2}><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></g>
    case 'menu':
      return <g {...STROKE} strokeWidth={2}><path d="M4 7h16M4 12h16M4 17h16" /></g>
    case 'fechar':
      return <g {...STROKE} strokeWidth={2}><path d="M6 6l12 12M18 6 6 18" /></g>
  }
}

export function Icon({ name, className, ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" className={className ? `ic ${className}` : 'ic'} aria-hidden="true" focusable="false" {...rest}>
      {shape(name)}
    </svg>
  )
}
