'use client'

import { SITE_URL, splitHosts } from '@/lib/hosts'

// Termos e privacidade moram no domínio do site; sem domínios separados (dev/testes), no mesmo endereço.
const legalLink = (path: string) => (splitHosts ? SITE_URL + path : path)

/** Aceite obrigatório dos Termos de Uso e da Política de Privacidade (cadastro e aceite de convite). Links abrem em nova aba. */
export function TermsCheckbox({ id, checked, onChange, disabled }: { id: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start gap-2.5 text-left text-sm leading-snug">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-[18px] shrink-0 accent-[var(--verde-600)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        required
        disabled={disabled}
      />
      <label htmlFor={id}>
        Li e aceito os{' '}
        <a className="link-verde" href={legalLink('/termos')} target="_blank" rel="noopener noreferrer">Termos de Uso</a>
        {' '}e a{' '}
        <a className="link-verde" href={legalLink('/privacidade')} target="_blank" rel="noopener noreferrer">Política de Privacidade</a>.
        <span className="sr-only"> (os links abrem em nova aba)</span>
      </label>
    </div>
  )
}
