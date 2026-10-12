'use client'

import { useRef, useState } from 'react'
import { CreditCard } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { cardBrand, formatCardNumber, formatCep, formatExpiry, luhnValid, onlyDigits, parseExpiry, UFS } from '@/lib/billing/format'

// Campos de cartão e endereço do checkout. `variant="conta"` usa o desenho das páginas de conta do pacote
// (campo/entrada; só funciona dentro de `.ar`). O padrão usa os componentes do sistema, para servir também dentro de
// diálogos (portais, fora de `.ar`). O cartão é trocado por um token DIRETO no Pagar.me, pelo navegador, com a chave
// pública: número e CVV nunca chegam ao nosso servidor.

export interface CardValue { number: string; holder: string; expiry: string; cvv: string }
export interface AddressValue { zipCode: string; street: string; number: string; complement: string; neighborhood: string; city: string; state: string }

export const EMPTY_CARD: CardValue = { number: '', holder: '', expiry: '', cvv: '' }
export const EMPTY_ADDRESS: AddressValue = { zipCode: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' }

type Variant = 'padrao' | 'conta'

/** Problema no cartão antes de enviar (ou null se está ok). */
export function cardProblem(c: CardValue): string | null {
  if (!luhnValid(c.number)) return 'Número do cartão inválido'
  if (c.holder.trim().length < 3) return 'Informe o nome impresso no cartão'
  if (!parseExpiry(c.expiry)) return 'Validade inválida (MM/AA)'
  const cvvLen = cardBrand(c.number) === 'American Express' ? 4 : 3
  if (onlyDigits(c.cvv).length !== cvvLen) return `CVV deve ter ${cvvLen} dígitos`
  return null
}

export function addressProblem(a: AddressValue): string | null {
  if (onlyDigits(a.zipCode).length !== 8) return 'CEP inválido'
  if (!a.street.trim() || !a.number.trim() || !a.neighborhood.trim() || !a.city.trim()) return 'Preencha o endereço de cobrança completo'
  if (!UFS.includes(a.state)) return 'Escolha a UF'
  return null
}

/** Gera o token do cartão no Pagar.me (válido por 60 s, uso único). */
export async function tokenizeCard(publicKey: string, c: CardValue): Promise<string> {
  const exp = parseExpiry(c.expiry)!
  let res: Response
  try {
    res = await fetch(`https://api.pagar.me/core/v5/tokens?appId=${encodeURIComponent(publicKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'card', card: { number: onlyDigits(c.number), holder_name: c.holder.trim().slice(0, 64), exp_month: exp.month, exp_year: exp.year, cvv: onlyDigits(c.cvv) } }),
    })
  } catch {
    throw new Error('Não foi possível falar com o Pagar.me. Confira sua internet e tente de novo.')
  }
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.id) throw new Error('O Pagar.me não aceitou os dados do cartão. Confira número, validade e CVV.')
  return body.id as string
}

/** Rótulo + entrada nos dois visuais; ids e atributos iguais em ambos. */
function Field({ variant, id, label, className, ...input }: { variant: Variant; id: string; label: React.ReactNode; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  if (variant === 'conta') {
    return (
      <div className={cn('campo', className)}>
        <label htmlFor={id}>{label}</label>
        <input id={id} className="entrada" {...input} />
      </div>
    )
  }
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...input} />
    </div>
  )
}

export function CardFields({ value, onChange, disabled, variant = 'padrao' }: { value: CardValue; onChange: (v: CardValue) => void; disabled?: boolean; variant?: Variant }) {
  const brand = cardBrand(value.number)
  const set = (k: keyof CardValue) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const v = k === 'number' ? formatCardNumber(raw) : k === 'expiry' ? formatExpiry(raw) : k === 'cvv' ? onlyDigits(raw).slice(0, 4) : raw.toUpperCase().replace(/[^A-ZÀ-Ú ]/g, '')
    onChange({ ...value, [k]: v })
  }
  const holder = { id: 'card-holder', autoComplete: 'cc-name', placeholder: 'COMO ESTÁ NO CARTÃO', value: value.holder, onChange: set('holder'), disabled }
  const expiry = { id: 'card-expiry', inputMode: 'numeric' as const, autoComplete: 'cc-exp', placeholder: 'MM/AA', value: value.expiry, onChange: set('expiry'), disabled }
  const cvv = { id: 'card-cvv', inputMode: 'numeric' as const, autoComplete: 'cc-csc', placeholder: brand === 'American Express' ? '4 dígitos' : '3 dígitos', value: value.cvv, onChange: set('cvv'), disabled }

  if (variant === 'conta') {
    return (
      <div className="grid gap-3.5">
        <div className="campo">
          <label htmlFor="card-number">Número do cartão</label>
          <div className="campo-ic">
            <CreditCard className="ic" aria-hidden="true" />
            <input id="card-number" className="entrada pr-28" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" value={value.number} onChange={set('number')} disabled={disabled} />
            {brand && <span className="marcas detectada"><span className="marca ativa" data-testid="card-brand">{brand}</span></span>}
          </div>
        </div>
        <div className="grade-cartao">
          <Field variant="conta" label="Nome impresso no cartão" {...holder} />
          <Field variant="conta" label="Validade" {...expiry} />
          <Field variant="conta" label="CVV" {...cvv} />
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2 space-y-1.5">
        <Label htmlFor="card-number">Número do cartão</Label>
        <div className="relative">
          <Input id="card-number" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" value={value.number} onChange={set('number')} disabled={disabled} className="pr-28" />
          {brand && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground" data-testid="card-brand">{brand}</span>}
        </div>
      </div>
      <Field variant="padrao" className="col-span-2" label="Nome impresso no cartão" {...holder} />
      <Field variant="padrao" label="Validade" {...expiry} />
      <Field variant="padrao" label="CVV" {...cvv} />
    </div>
  )
}

export function AddressFields({ value, onChange, disabled, idPrefix = 'addr', variant = 'padrao' }: { value: AddressValue; onChange: (v: AddressValue) => void; disabled?: boolean; idPrefix?: string; variant?: Variant }) {
  const [lookingUp, setLookingUp] = useState(false)
  // valor mais recente: a resposta do ViaCEP chega depois e não pode apagar o que a pessoa digitou enquanto isso
  const latest = useRef(value)
  latest.current = value
  const set = (k: keyof AddressValue) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: k === 'zipCode' ? formatCep(e.target.value) : e.target.value })

  // CEP completo → preenche rua, bairro, cidade e UF pelo ViaCEP (se falhar, a pessoa digita)
  const lookup = async (cep: string) => {
    const d = onlyDigits(cep)
    if (d.length !== 8) return
    setLookingUp(true)
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`)
      const j = await r.json()
      const v = latest.current
      if (!j?.erro && onlyDigits(v.zipCode) === d) onChange({ ...v, street: j.logradouro || v.street, neighborhood: j.bairro || v.neighborhood, city: j.localidade || v.city, state: j.uf || v.state })
    } catch {
      /* sem internet ou ViaCEP fora: preenchimento manual */
    } finally {
      setLookingUp(false)
    }
  }

  const id = (k: string) => `${idPrefix}-${k}`
  const conta = variant === 'conta'
  const muted = conta ? 'text-[var(--suave)]' : 'text-muted-foreground'
  return (
    <div className={cn('grid grid-cols-6', conta ? 'gap-x-[18px] gap-y-3.5' : 'gap-3')}>
      <Field variant={variant} className="col-span-3 sm:col-span-2" id={id('zip')} label="CEP" inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" value={value.zipCode} onChange={set('zipCode')} onBlur={(e) => lookup(e.target.value)} disabled={disabled} />
      <div className={cn('col-span-3 sm:col-span-4 flex items-end pb-2 text-xs', muted)}>{lookingUp ? 'Buscando endereço…' : ''}</div>
      <Field variant={variant} className="col-span-6 sm:col-span-4" id={id('street')} label="Rua" autoComplete="address-line1" value={value.street} onChange={set('street')} disabled={disabled} />
      <Field variant={variant} className="col-span-2" id={id('number')} label="Número" value={value.number} onChange={set('number')} disabled={disabled} />
      <Field variant={variant} className="col-span-4 sm:col-span-3" id={id('complement')} label={<>Complemento <span className={cn('font-normal', muted)}>(opcional)</span></>} autoComplete="address-line2" value={value.complement} onChange={set('complement')} disabled={disabled} />
      <Field variant={variant} className="col-span-6 sm:col-span-3" id={id('neighborhood')} label="Bairro" value={value.neighborhood} onChange={set('neighborhood')} disabled={disabled} />
      <Field variant={variant} className="col-span-4" id={id('city')} label="Cidade" autoComplete="address-level2" value={value.city} onChange={set('city')} disabled={disabled} />
      <div className={cn('col-span-2', conta ? 'campo' : 'space-y-1.5')}>
        {conta ? <label htmlFor={id('state')}>UF</label> : <Label htmlFor={id('state')}>UF</Label>}
        <Select value={value.state} onValueChange={(v) => onChange({ ...value, state: v })} disabled={disabled}>
          <SelectTrigger id={id('state')} className={cn('w-full', conta && 'h-[42px] rounded-[10px]')} aria-label="UF"><SelectValue placeholder="UF" /></SelectTrigger>
          <SelectContent>
            {UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
