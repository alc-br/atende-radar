/** Minúsculas, sem acentos e com espaços normalizados — para casar palavras do português sem se preocupar com digitação. */
export function norm(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
