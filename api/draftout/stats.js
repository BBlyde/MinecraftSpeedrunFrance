import { DRAFTOUT_WHITELIST } from './_whitelist.js'

const DRAFTOUT_CONCURRENCY = 80
const DRAFTOUT_TIMEOUT_MS = 5000
const RATE_LIMIT_RETRIES = 2

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchDraftoutStats(key, era) {
  const url = `https://draftoutmc.com/api/stats/${key}?era=${era}`

  for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt++) {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(DRAFTOUT_TIMEOUT_MS),
    })

    if (response.status === 429 || response.status === 503) {
      await response.body?.cancel?.()
      if (attempt === RATE_LIMIT_RETRIES) return null
      const retryAfter = Number(response.headers.get('retry-after'))
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 1000)
        : 200 * (attempt + 1)
      await wait(waitMs)
      continue
    }

    if (!response.ok) {
      await response.body?.cancel?.()
      return null
    }

    return response.json()
  }

  return null
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length)
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      try {
        results[index] = { status: 'fulfilled', value: await fn(items[index]) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  const workers = Math.min(limit, items.length)
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).end('Method Not Allowed')
    return
  }

  const era = req.query?.era ?? '2'

  try {
    // Récupére la liste des runners MSF
    const leaderboardRes = await fetch('https://back.mcsr-game.com/leaderboard?season=10', {
      signal: AbortSignal.timeout(5000),
    })
    if (!leaderboardRes.ok) {
      res.status(leaderboardRes.status).end('Failed to fetch MSF leaderboard')
      return
    }
    const runners = await leaderboardRes.json()

    // Récupère les stats de chaque runner (ranked + whitelist)
    const rankedUuids = new Set(runners.map(r => r.uuid))
    const whitelistExtra = DRAFTOUT_WHITELIST.filter(uuid => !rankedUuids.has(uuid))

    const allQueries = [
      ...runners.map(runner => ({ key: runner.username })),
      ...whitelistExtra.map(uuid => ({ key: uuid })),
    ]

    const results = await mapPool(allQueries, DRAFTOUT_CONCURRENCY, ({ key }) =>
      fetchDraftoutStats(key, era)
    )

    // Ajout liste drafout ssi compte draftout (player non null) et au moins une partie jouée (matches != 0)
    const players = []
    for (const result of results) {
      if (result.status !== 'fulfilled' || !result.value) continue
      const { player, record, aggregate } = result.value
      if (!player) continue
      if ((record?.matches ?? 0) === 0) continue

      players.push({
        uuid: player.uuid,
        username: player.username,
        elo: player.elo,
        draftoutRank: player.rank ?? null,
        rankName: player.rankName ?? 'Unranked',
        rankColor: player.rankColor,
        wins: record?.wins ?? 0,
        draws: record?.draws ?? 0,
        losses: record?.losses ?? 0,
        matches: record?.matches ?? 0,
        winRate: record?.winRate ?? 0,
        averageFinishTime: record?.averageFinishTime ?? null,
        averageGoals: record?.averageGoals ?? null,
        forfeitCount: aggregate?.forfeitCount ?? 0,
        bestStreak: aggregate?.bestStreak ?? 0,
        peakElo: aggregate?.peakElo ?? null,
      })
    }

    // Trie par elo décroissant et ajout du rang
    players.sort((a, b) => b.elo - a.elo)
    players.forEach((p, i) => { p.rank = i + 1 })

    res.status(200).json({ rows: players })
  } catch (err) {
    console.error('[draftout/stats]', err)
    res.status(502).json({ error: err?.message ?? String(err) })
  }
}
