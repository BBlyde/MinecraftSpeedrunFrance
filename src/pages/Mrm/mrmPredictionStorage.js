/**
 * @param {number} baselineLen
 * @param {number[] | undefined} saved
 * @returns {number[]}
 */
export function reconcileOrder(baselineLen, saved) {
  const defaultOrder = Array.from({ length: baselineLen }, (_, i) => i)
  if (!Array.isArray(saved) || saved.length === 0) return defaultOrder

  if (saved.length === baselineLen) {
    const set = new Set(saved)
    if (set.size === baselineLen) {
      let ok = true
      for (let i = 0; i < baselineLen; i++) {
        if (!set.has(i)) {
          ok = false
          break
        }
      }
      if (ok) return [...saved]
    }
  }

  const seen = new Set()
  const result = []
  for (const i of saved) {
    if (Number.isInteger(i) && i >= 0 && i < baselineLen && !seen.has(i)) {
      result.push(i)
      seen.add(i)
    }
  }
  for (let i = 0; i < baselineLen; i++) {
    if (!seen.has(i)) result.push(i)
  }
  return result.length === baselineLen ? result : defaultOrder
}

function playerNameKey(name) {
  return typeof name === 'string' ? name.trim().toLowerCase() : ''
}

function orderFromNames(players, savedNames) {
  const byName = new Map()
  players.forEach((player, index) => {
    const key = playerNameKey(player?.name)
    if (key && !byName.has(key)) byName.set(key, index)
  })

  const seen = new Set()
  const result = []
  for (const name of savedNames) {
    const index = byName.get(playerNameKey(name))
    if (index == null || seen.has(index)) continue
    seen.add(index)
    result.push(index)
  }
  for (let index = 0; index < players.length; index += 1) {
    if (!seen.has(index)) result.push(index)
  }
  return result
}

/**
 * Ordre LCQ enregistré par nom. Les anciens tableaux d'indices restent lisibles.
 * Un nom absent du roster est retiré : les joueurs classés derrière lui remontent d'une place.
 * @param {{ name?: string }[]} players
 * @param {Array<string | number> | undefined} savedOrder
 * @returns {number[]}
 */
export function reconcileLcqOrder(players, savedOrder) {
  const roster = Array.isArray(players) ? players : []
  const saved = Array.isArray(savedOrder) ? savedOrder : []
  const names = saved.filter((value) => typeof value === 'string' && value.trim() !== '')
  if (names.length > 0) return orderFromNames(roster, names)

  const indices = saved.filter((value) => Number.isInteger(value))
  return reconcileOrder(roster.length, indices)
}
