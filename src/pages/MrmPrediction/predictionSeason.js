export const PREDICTION_MIN_SEASON = 10
export const PREDICTION_MAX_SEASON = 11

const EVENT_BY_SEASON = {
  10: 'mrm',
  11: 'mrm11',
}

export function predictionEventForSeason(season) {
  return EVENT_BY_SEASON[season] ?? EVENT_BY_SEASON[PREDICTION_MAX_SEASON]
}

export function predictionPagePath(season, discordId = null) {
  const query = `?season=${season}`
  if (discordId) {
    return `/prediction/mrm/${encodeURIComponent(discordId)}${query}`
  }
  return `/prediction/mrm${query}`
}
