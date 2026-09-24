import { norm } from './text'

const NAME = '[A-Za-zÀ-ÿ]+(?: [A-Za-zÀ-ÿ]+){0,2}'
const AT_START = new RegExp(`^\\s*[*_~]*(${NAME})[*_~]*\\s*[:\\-–]\\s*\\S`)
const AT_END = new RegExp(`(?:—|–|-|att[.,]?|atenciosamente[.,]?|abs[.,]?|abracos?[.,]?|abraços?[.,]?)\\s*[*_~]*(${NAME})[*_~]*\\s*$`, 'i')

/**
 * O WhatsApp só diz que a empresa falou, não QUEM falou. Muitas equipes assinam ("*Carlos*: ..." ou "— Carlos").
 * Devolve o id do atendente cadastrado cujo nome bate com a assinatura, ou null se não houver assinatura
 * ou se o primeiro nome for ambíguo (duas "Ana").
 */
export function attributeAgent(text: string | null | undefined, agents: Array<{ id: string; name: string }>): string | null {
  if (!text) return null
  const candidate = text.match(AT_START)?.[1] ?? text.trim().match(AT_END)?.[1]
  if (!candidate) return null
  const c = norm(candidate)

  const full = agents.filter((a) => norm(a.name) === c)
  if (full.length === 1) return full[0].id

  const first = agents.filter((a) => norm(a.name).split(' ')[0] === c.split(' ')[0] && !c.includes(' '))
  return first.length === 1 ? first[0].id : null
}
