export const LCQ_SEED_COUNT = 8

export function lcqSeedValues(player, seedCount = LCQ_SEED_COUNT) {
  return Array.from({ length: seedCount }, (_, i) => {
    const n = Number(player?.[`s${i + 1}`])
    return Number.isFinite(n) ? n : 0
  })
}

export function lcqEightSeedsEntered(players, seedCount = LCQ_SEED_COUNT) {
  if (!Array.isArray(players) || players.length === 0) return false
  for (let i = 0; i < seedCount; i += 1) {
    const played = players.some((player) => {
      const n = Number(player?.[`s${i + 1}`])
      return Number.isFinite(n) && n > 0
    })
    if (!played) return false
  }
  return true
}

export function lcqWorstSeedIndex(player, seedCount = LCQ_SEED_COUNT) {
  const seeds = lcqSeedValues(player, seedCount)
  let worst = 0
  for (let i = 1; i < seeds.length; i += 1) {
    if (seeds[i] > seeds[worst]) worst = i
  }
  return worst
}

export function lcqTotalFromSeeds(player, { dropWorst = false, seedCount = LCQ_SEED_COUNT } = {}) {
  const seeds = lcqSeedValues(player, seedCount)
  const sum = seeds.reduce((acc, value) => acc + value, 0)
  if (!dropWorst || seeds.length < 2) return sum
  return sum - Math.max(...seeds)
}

export function withLcqDropWorst(players, seedCount = LCQ_SEED_COUNT) {
  if (!Array.isArray(players)) return []
  const dropWorst = seedCount === LCQ_SEED_COUNT && lcqEightSeedsEntered(players, seedCount)
  return players.map((player) => ({
    ...player,
    total: lcqTotalFromSeeds(player, { dropWorst, seedCount }),
    droppedSeed: dropWorst ? lcqWorstSeedIndex(player, seedCount) : null,
  }))
}
