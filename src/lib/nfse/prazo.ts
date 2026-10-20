// Prazo de cancelamento da NFS-e (orientação da contabilidade, 20/10/2026): só dentro do mês de competência, de 1 a 31.
// Depois disso o imposto já foi apurado e a nota não pode mais ser cancelada. O mês é o de Brasília (UTC-3, sem horário de verão).
const BRT_MS = 3 * 3600_000

/** Primeiro instante do mês seguinte ao da competência, no horário de Brasília: a partir daí não cancela mais. */
export function fimPrazoCancelamento(competencia: Date): Date {
  const local = new Date(competencia.getTime() - BRT_MS)
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) + BRT_MS)
}

export function cancelavel(competencia: Date, now = new Date()): boolean {
  return now.getTime() < fimPrazoCancelamento(competencia).getTime()
}

/** "outubro/2026": o mês de competência, para as mensagens. */
export function mesCompetencia(competencia: Date): string {
  const local = new Date(competencia.getTime() - BRT_MS)
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  return `${meses[local.getUTCMonth()]}/${local.getUTCFullYear()}`
}

export const foraDoPrazo = (competencia: Date) =>
  `Fora do prazo: a nota é da competência de ${mesCompetencia(competencia)} e só podia ser cancelada dentro desse mês. Fale com a contabilidade.`
