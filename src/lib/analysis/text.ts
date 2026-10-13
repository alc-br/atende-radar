/** Minúsculas, sem acentos e com espaços normalizados — para casar palavras do português sem se preocupar com digitação. */
export function norm(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Abreviações comuns no WhatsApp → palavra inteira, para as regras não precisarem conhecer cada grafia.
const ABREV: Array<[RegExp, string]> = [
  [/\bq\b/g, 'que'], [/\bvcs\b/g, 'voces'], [/\bvc\b/g, 'voce'], [/\bn\b/g, 'nao'], [/\bnum\b/g, 'nao'], [/\bhj\b/g, 'hoje'],
  [/\bmto\b/g, 'muito'], [/\bmta\b/g, 'muita'], [/\btb\b/g, 'tambem'], [/\bpq\b/g, 'porque'], [/\bmsg\b/g, 'mensagem'],
  [/\bqdo\b/g, 'quando'], [/\bqnd\b/g, 'quando'], [/\bq(n)?to\b/g, 'quanto'], [/\btd\b/g, 'tudo'], [/\bobg\b/g, 'obrigado'],
  [/\bblz\b/g, 'beleza'], [/\bcmg\b/g, 'comigo'], [/\bpfv\b/g, 'por favor'], [/\bpf\b/g, 'por favor'], [/\bto\b/g, 'estou'],
  [/\bta\b/g, 'esta'], [/\bpra\b/g, 'para'], [/\bpro\b/g, 'para o'], [/\bngm\b/g, 'ninguem'], [/\bagr\b/g, 'agora'],
]

/** `norm` + abreviações de conversa expandidas ("vc n respondeu hj" → "voce nao respondeu hoje"). */
export function normChat(s: string | null | undefined): string {
  let t = norm(s)
  for (const [re, by] of ABREV) t = t.replace(re, by)
  return t
}
