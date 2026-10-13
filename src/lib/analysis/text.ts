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
  [/\bq\b/g, 'que'], [/\bvcs\b/g, 'voces'], [/\bvc\b/g, 'voce'], [/\bn\b/g, 'nao'], [/\bhj\b/g, 'hoje'],
  // "num" só vira "não" antes de verbo ("num sei"); "num instante" é "em um"
  [/\bnum\b(?= (sei|quero|queria|gostei|consigo|consegui|da|deu|vou|vai|tem|tenho|foi|recebi|chegou|chega|funciona|funcionou|respond|atend|precisa|posso|pode))/g, 'nao'],
  [/\bmto\b/g, 'muito'], [/\bmta\b/g, 'muita'], [/\btb\b/g, 'tambem'], [/\bpq\b/g, 'porque'], [/\bmsg\b/g, 'mensagem'],
  [/\bqdo\b/g, 'quando'], [/\bqnd\b/g, 'quando'], [/\bqnto\b/g, 'quanto'], [/\btd\b/g, 'tudo'], [/\bobg\b/g, 'obrigado'],
  // "qto" também é "quarto" (hotel, aluguel): só vira "quanto" sem artigo antes e com cara de pergunta de valor/tempo
  [/(?<!\b(o|um|no|do|meu|seu|esse|este|de|cada|1|2|3) )\bqto\b(?= (custa|e|fica|sai|cobra|cobram|vale|tempo|seria|esta|ta|da|deu|vai|ficaria|sairia|que|r\$|\d)|\s*\?)/g, 'quanto'],
  [/\bblz\b/g, 'beleza'], [/\bcmg\b/g, 'comigo'], [/\bpfv\b/g, 'por favor'], [/\bpf\b/g, 'por favor'], [/\bto\b/g, 'estou'],
  // "plano Pro", "versão pro": nome de produto, não "para o"
  [/\bta\b/g, 'esta'], [/\bpra\b/g, 'para'], [/(?<!\b(plano|versao|conta|modelo|pacote|kit|linha|edicao|iphone|ipad|macbook|airpods|galaxy) )\bpro\b(?! max\b)/g, 'para o'], [/\bngm\b/g, 'ninguem'], [/\bagr\b/g, 'agora'],
]

/** `norm` + abreviações de conversa expandidas ("vc n respondeu hj" → "voce nao respondeu hoje"). */
export function normChat(s: string | null | undefined): string {
  let t = norm(s)
  for (const [re, by] of ABREV) t = t.replace(re, by)
  return t
}
