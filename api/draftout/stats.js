import { DRAFTOUT_WHITELIST } from './_whitelist.js'

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

    const CONCURRENCY = 25
    const results = []
    for (let i = 0; i < allQueries.length; i += CONCURRENCY) {
      const batch = allQueries.slice(i, i + CONCURRENCY)
      const batchResults = await Promise.allSettled(
        batch.map(({ key }) =>
          fetch(`https://draftoutmc.com/api/stats/${key}?era=${era}`, {
            signal: AbortSignal.timeout(5000),
          }).then(r => r.ok ? r.json() : null)
        )
      )
      results.push(...batchResults)
    }

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
