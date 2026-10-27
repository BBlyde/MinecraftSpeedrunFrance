import { DRAFTOUT_WHITELIST } from './_whitelist.js'

const BARE_UUID = /^[0-9a-f]{32}$/i
const DASHED_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Draftout répond 404 sans tirets. MCSR Ranked renvoie l'UUID sans tirets.
function dashedUuid(uuid) {
  const value = String(uuid ?? '').trim().toLowerCase()
  if (DASHED_UUID.test(value)) return value
  if (!BARE_UUID.test(value)) return null
  return value.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')
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

    // Récupère les stats de chaque runner (ranked + whitelist).
    // Les UUID du classement sont sans tirets : on les met au format 8-4-4-4-12
    // avant l'appel Draftout, et pour reconnaître ceux déjà présents dans la whitelist.
    const rankedKeys = runners.map(runner => dashedUuid(runner.uuid) ?? runner.username)
    const rankedUuids = new Set(rankedKeys.filter(key => DASHED_UUID.test(key)))
    const whitelistExtra = DRAFTOUT_WHITELIST
      .map(uuid => dashedUuid(uuid))
      .filter(uuid => uuid && !rankedUuids.has(uuid))

    const allQueries = [...new Set([...rankedKeys, ...whitelistExtra])]

    const CONCURRENCY = 25
    const results = []
    for (let i = 0; i < allQueries.length; i += CONCURRENCY) {
      const batch = allQueries.slice(i, i + CONCURRENCY)
      const batchResults = await Promise.allSettled(
        batch.map((key) =>
          fetch(`https://draftoutmc.com/api/stats/${encodeURIComponent(key)}?era=${era}`, {
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
