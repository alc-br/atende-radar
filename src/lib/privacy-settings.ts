import { db } from './db'

// Configurações › Privacidade: o que os interruptores ligam de verdade (T17/B9).
//  · privMasking (padrão ligado): CPF, cartão e CVV entram mascarados no banco e aparecem mascarados na conversa.
//    Desligado: mensagens NOVAS ficam como vieram (as já mascaradas continuam). Alertas e achados mascaram sempre.
//  · privExport (padrão ligado): exportação dos dados de um cliente (portabilidade) na tela da conversa.
//  · privLegalBasis / privDPO: registro informativo; saem no arquivo exportado para o titular.
//  · retAttachments: informativo (o AtendeRadar não guarda anexos, só o tipo da mensagem).

export interface PrivacySettings {
  masking: boolean
  exportEnabled: boolean
  legalBasis: string | null
  dpo: string | null
}

export const LEGAL_BASIS_LABELS: Record<string, string> = {
  consentimento: 'Consentimento do titular',
  legitimo_interesse: 'Legítimo interesse',
  obrigacao_legal: 'Obrigação legal',
  contrato: 'Execução de contrato',
}

export function privacySettingsFrom(settingsJson: string | null | undefined): PrivacySettings {
  let s: Record<string, unknown> = {}
  try {
    s = settingsJson ? (JSON.parse(settingsJson) as Record<string, unknown>) : {}
  } catch {
    s = {}
  }
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : null)
  return {
    masking: s.privMasking !== false,
    exportEnabled: s.privExport !== false,
    legalBasis: text(s.privLegalBasis),
    dpo: text(s.privDPO),
  }
}

export async function privacySettings(orgId: string): Promise<PrivacySettings> {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { settingsJson: true } })
  return privacySettingsFrom(org?.settingsJson)
}

export const maskingEnabled = async (orgId: string) => (await privacySettings(orgId)).masking
