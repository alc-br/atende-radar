'use client'

import { useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cardBrand, formatCardNumber, formatCep, formatExpiry, luhnValid, onlyDigits, parseExpiry, UFS } from '@/lib/billing/format'

// Campos de cartão e endereço do checkout (padrão visual do sistema). O cartão é trocado por um token DIRETO no
// Pagar.me, pelo navegador, com a chave pública: número e CVV nunca chegam ao nosso servidor.

export interface CardValue { number: string; holder: string; expiry: string; cvv: string }
export interface AddressValue { zipCode: string; street: string; number: string; complement: string; neighborhood: string; city: string; state: string }

export const EMPTY_CARD: CardValue = { number: '', holder: '', expiry: '', cvv: '' }
export const EMPTY_ADDRESS: AddressValue = { zipCode: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' }

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

export function CardFields({ value, onChange, disabled }: { value: CardValue; onChange: (v: CardValue) => void; disabled?: boolean }) {
  const brand = cardBrand(value.number)
  const set = (k: keyof CardValue) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const v = k === 'number' ? formatCardNumber(raw) : k === 'expiry' ? formatExpiry(raw) : k === 'cvv' ? onlyDigits(raw).slice(0, 4) : raw.toUpperCase().replace(/[^A-ZÀ-Ú ]/g, '')
    onChange({ ...value, [k]: v })
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
      <div className="col-span-2 space-y-1.5">
        <Label htmlFor="card-holder">Nome impresso no cartão</Label>
        <Input id="card-holder" autoComplete="cc-name" placeholder="COMO ESTÁ NO CARTÃO" value={value.holder} onChange={set('holder')} disabled={disabled} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="card-expiry">Validade</Label>
        <Input id="card-expiry" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/AA" value={value.expiry} onChange={set('expiry')} disabled={disabled} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="card-cvv">CVV</Label>
        <Input id="card-cvv" inputMode="numeric" autoComplete="cc-csc" placeholder={brand === 'American Express' ? '4 dígitos' : '3 dígitos'} value={value.cvv} onChange={set('cvv')} disabled={disabled} />
      </div>
    </div>
  )
}

export function AddressFields({ value, onChange, disabled, idPrefix = 'addr' }: { value: AddressValue; onChange: (v: AddressValue) => void; disabled?: boolean; idPrefix?: string }) {
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
  return (
    <div className="grid grid-cols-6 gap-3">
      <div className="col-span-3 sm:col-span-2 space-y-1.5">
        <Label htmlFor={id('zip')}>CEP</Label>
        <Input id={id('zip')} inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" value={value.zipCode} onChange={set('zipCode')} onBlur={(e) => lookup(e.target.value)} disabled={disabled} />
      </div>
      <div className="col-span-3 sm:col-span-4 flex items-end pb-2 text-xs text-muted-foreground">{lookingUp ? 'Buscando endereço…' : ''}</div>
      <div className="col-span-6 sm:col-span-4 space-y-1.5">
        <Label htmlFor={id('street')}>Rua</Label>
        <Input id={id('street')} autoComplete="address-line1" value={value.street} onChange={set('street')} disabled={disabled} />
      </div>
      <div className="col-span-2 space-y-1.5">
        <Label htmlFor={id('number')}>Número</Label>
        <Input id={id('number')} value={value.number} onChange={set('number')} disabled={disabled} />
      </div>
      <div className="col-span-4 sm:col-span-3 space-y-1.5">
        <Label htmlFor={id('complement')}>Complemento <span className="text-muted-foreground font-normal">(opcional)</span></Label>
        <Input id={id('complement')} autoComplete="address-line2" value={value.complement} onChange={set('complement')} disabled={disabled} />
      </div>
      <div className="col-span-6 sm:col-span-3 space-y-1.5">
        <Label htmlFor={id('neighborhood')}>Bairro</Label>
        <Input id={id('neighborhood')} value={value.neighborhood} onChange={set('neighborhood')} disabled={disabled} />
      </div>
      <div className="col-span-4 space-y-1.5">
        <Label htmlFor={id('city')}>Cidade</Label>
        <Input id={id('city')} autoComplete="address-level2" value={value.city} onChange={set('city')} disabled={disabled} />
      </div>
      <div className="col-span-2 space-y-1.5">
        <Label htmlFor={id('state')}>UF</Label>
        <Select value={value.state} onValueChange={(v) => onChange({ ...value, state: v })} disabled={disabled}>
          <SelectTrigger id={id('state')} className="w-full" aria-label="UF"><SelectValue placeholder="UF" /></SelectTrigger>
          <SelectContent>
            {UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
