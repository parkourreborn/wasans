export function formatPlayerScore(score: number | string | null | undefined) {
  const parsedScore = Number(score ?? 0)
  return Number.isFinite(parsedScore) ? parsedScore.toFixed(3) : "0.000"
}

export function formatPlayerNameWithScore(
  playerName: string,
  score: number | string | null | undefined
) {
  return `${playerName} ${formatPlayerScore(score)}`
}
