// Versões em vigor dos Termos de Uso e da Política de Privacidade (a data da última atualização de cada página).
// Fonte única: as páginas /termos e /privacidade mostram estas datas e o cadastro/aceite de convite grava estas versões.
// Ao mudar o texto de uma das páginas, atualize a versão aqui.
export const TERMS_VERSION = '2026-10-12'
export const PRIVACY_VERSION = '2026-10-15'

export const TERMS_REQUIRED_MESSAGE = 'Para continuar, aceite os Termos de Uso e a Política de Privacidade.'

/** O que gravar no membro quando ele aceita os termos agora. */
export function termsAcceptance(now = new Date()) {
  return { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, termsAcceptedAt: now }
}
