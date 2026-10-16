'use client'

import { HelpCircle } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/** (?) que abre uma caixinha explicando um campo ou uma coluna. Clique ou toque (funciona no celular, ao contrário do title). */
export function HelpTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="ajuda-tip" aria-label={`O que é ${label}?`}>
          <HelpCircle className="ic" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 p-3 text-[13px] leading-relaxed font-normal normal-case tracking-normal">
        <strong className="mb-1 block text-[13px]">{label}</strong>
        {children}
      </PopoverContent>
    </Popover>
  )
}
