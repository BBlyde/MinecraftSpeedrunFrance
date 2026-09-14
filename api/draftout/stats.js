// UUIDs de runners draftout non présents dans le classement ranked MSF
const DRAFTOUT_WHITELIST = [
  '6f98b3f3-38ea-43a7-b113-93395fbaee3f', // Eallyos
  'e028c32f-b714-4ac6-ba9b-f9ffb0acc2e7', // Fxllenn__
  '0f6ad204-09c1-469e-9c7f-8831164e0ff2', // vJaap
  '374f200d-6689-498f-8199-225a7632afc1', // Diamouxx
  '713b3afb-4167-4010-937b-a0e985312507', // _Luzord 
  '0654a538-d4e2-4664-9bdf-50c4f5134061', // Omeega_ 
  '220e895c-036c-4486-9e43-3b47f7cc072e', // MartinPonk
  'cd17d2ea-6c7d-406a-b928-66281eed4013', // SKMimilox
  'd4af7bd3-1406-447d-9d34-5cebed6d2dea', // SKMatteo
  '25cb2956-f786-4b78-aa9d-c7c738745e3b', // MaloxMC
  '6af3ba29-9e68-4505-afe3-6024dc97c5c5', // mohamany13 
  '26efa306-796d-4de5-b3c6-aca83f22d7ab', // Nol760
  '67cd2e22-29c4-488e-86d3-23b9de7aba4c', // yeltx
  'e1f3ec98-a4ec-45f3-9552-8fcf27cad4db', // Tircis
  'f17d73af-a0f5-4e88-8205-250543919a01', // KennyShield_
  'afc3be63-ba39-491b-9c3c-32a832ecc905', // vavou45
  'a436cc1c-bad7-4d7d-bfee-a84a853d0b7c', // Wooolfh
  '6a6887fe-dd7c-4f04-98b1-e358ce75c377', // TheGuill84
  'b4979676-ebe3-427e-9149-97678e2f8b94', // Nagatow_
  'a6a7bd14-5ee3-4008-9598-c5869fef76a3', // Klnoko_
  '06bccd79-07c9-41dd-b19d-c9f1e7b123a0', // REMY_SCRATPATATE
  '85ffd88e-93c3-442e-b086-edd1da20cb02', // Shidauw
  '0a1b99c9-4c42-4d5a-9ba2-226b5517bd69', // lucalurus_
  '70051f01-76ff-41bf-89d4-41551814a7fa', // LeMecDeFrance 
  '21d8bd62-b644-47eb-b32a-bafc59390c10', // So_Stoopid
  'ed8071e1-0d4c-4b59-9be0-222f93cae55b', // feynoox_
  '09a6081c-bafb-4686-ba7c-a968c3d76003', // BadClem
  'aa94d2e7-b998-4765-ac40-f5cace0eedd9', // ByPhantom
  'd80dd226-1adf-4d22-9314-763ea512c540', // aquilo__
  '30a83701-c763-4fcf-aaa5-e9c0ce0fa46e', // Scranox
  '658de3c4-4bae-4743-ba8c-2ea36fadc183', // Nyhru
  'a3f61384-2986-4aef-b9ec-5fc799a0fa88', // SuneeToo
]

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
