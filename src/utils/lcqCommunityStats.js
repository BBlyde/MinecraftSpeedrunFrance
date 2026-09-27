import { reconcileLcqOrder } from '../pages/Mrm/mrmPredictionStorage'
import { predictionApiUrl } from './predictionApi'

/**
 * Compte, pour chaque joueur LCQ (index baseline), combien de pronos le placent à chaque rang.
 * @param {string} eventId
 * @param {{ name?: string }[]} players
 * @returns {Promise<{ total: number, counts: number[][] }>}
 */
export async function fetchCommunityPredictions(eventId) {
  const lbRes = await fetch(predictionApiUrl(`/prediction/${eventId}/leaderboard`))
  const lbData = lbRes.ok ? await lbRes.json().catch(() => ({})) : {}
  const users = Array.isArray(lbData.leaderboard) ? lbData.leaderboard : []
  const predictions = await Promise.all(
    users.map(async (row) => {
      const discordId = row?.discordId
      if (!discordId) return null
      try {
        const res = await fetch(
          predictionApiUrl(`/prediction/${eventId}/users/${encodeURIComponent(discordId)}`),
        )
        if (!res.ok) return null
        const data = await res.json().catch(() => ({}))
        return data?.prediction && typeof data.prediction === 'object'
          ? { discordId, prediction: data.prediction }
          : null
      } catch {
        return null
      }
    }),
  )
  return predictions.filter((row) => row?.prediction)
}

export function lcqRankCountsFromPredictions(players, predictions) {
  const roster = Array.isArray(players) ? players : []
  const n = roster.length
  const counts = Array.from({ length: n }, () => Array(n).fill(0))
  let total = 0
  if (n <= 0) return { total, counts }
  for (const row of predictions ?? []) {
    const prediction = row?.prediction && typeof row.prediction === 'object' ? row.prediction : row
    const order1 = prediction?.order1
    const order1Names = prediction?.order1Names
    const saved = Array.isArray(order1) && order1.some((value) => typeof value === 'string')
      ? order1
      : Array.isArray(order1Names) && order1Names.length > 0
        ? order1Names
        : order1
    if (!Array.isArray(saved)) continue
    const reconciled = reconcileLcqOrder(roster, saved)
    total += 1
    reconciled.forEach((baselineIdx, rank) => {
      if (baselineIdx >= 0 && baselineIdx < n && rank >= 0 && rank < n) {
        counts[baselineIdx][rank] += 1
      }
    })
  }
  return { total, counts }
}

export async function fetchLcqCommunityRankCounts(eventId, players) {
  const roster = Array.isArray(players) ? players : []
  if (roster.length <= 0) {
    return { total: 0, counts: [] }
  }
  const predictions = await fetchCommunityPredictions(eventId)
  return lcqRankCountsFromPredictions(roster, predictions)
}

/** Varié pour le rendu local (évite 100% sur chaque ligne quand il n’y a qu’un prono). */
export function localDemoCommunityStats(size) {
  const n = Number(size) || 0
  const total = 12
  const counts = Array.from({ length: n }, () => Array(n).fill(0))
  for (let i = 0; i < n; i += 1) {
    const peakRank = i % n
    const peak = 3 + ((i * 5) % 7)
    counts[i][peakRank] = peak
    let rest = total - peak
    for (let rank = 0; rank < n && rest > 0; rank += 1) {
      if (rank === peakRank) continue
      const take = Math.min(rest, 1 + ((i + rank) % 2))
      counts[i][rank] += take
      rest -= take
    }
    if (rest > 0 && n > 0) counts[i][peakRank] += rest
  }
  return { total, counts }
}

export function communityShareForRank(stats, baselineIdx, rank) {
  if (!stats?.total) return null
  const count = stats.counts?.[baselineIdx]?.[rank]
  if (typeof count !== 'number') return null
  return count / stats.total
}

/** 0 → rouge, 100 → vert. */
export function communityShareColor(share) {
  const t = Math.min(1, Math.max(0, Number(share) || 0))
  return `hsl(${Math.round(t * 120)} 86% 52%)`
}

export function formatCommunityShareLabel(share) {
  if (share == null || !Number.isFinite(share)) return null
  return `${Math.round(share * 100)}%`
}
