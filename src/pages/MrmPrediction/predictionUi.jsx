import { useCallback, useMemo } from 'react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export const DEFAULT_HEAD = 'https://mc-heads.net/avatar/0385/48'

export const DEFAULT_LOCK_STATE = {
  global: { locked: false, lockAt: null },
  group1: { locked: false, lockAt: null },
  group2: { locked: false, lockAt: null },
  playoffs: { locked: false, lockAt: null },
  round16: { locked: false, lockAt: null },
  quarter: { locked: false, lockAt: null },
  semi1: { locked: false, lockAt: null },
  semi2: { locked: false, lockAt: null },
  thirdPlace: { locked: false, lockAt: null },
  final: { locked: false, lockAt: null },
  serverNow: null,
}

export const DEFAULT_FINISHED_STATE = {
  group1: false,
  group2: false,
  round16: false,
  quarter: false,
  semi1: false,
  semi2: false,
  thirdPlace: false,
  final: false,
}

export function isoLockAtString(value) {
  if (value == null) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed !== '' ? trimmed : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString()
  }
  if (typeof value === 'object' && value.$date != null) {
    return isoLockAtString(value.$date)
  }
  return null
}

export function isLockAtActive(lockAt, serverNowIso) {
  if (!lockAt) return false
  const lockMs = Date.parse(lockAt)
  if (Number.isNaN(lockMs)) return false
  const serverMs = serverNowIso ? Date.parse(serverNowIso) : Date.now()
  return !Number.isNaN(serverMs) && serverMs >= lockMs
}

export function normalizeLockEntry(rawLock, fallbackLocked = false, fallbackLockAt = null, serverNowIso = null) {
  if (rawLock != null && typeof rawLock === 'object' && !Array.isArray(rawLock)) {
    if (typeof rawLock.locked === 'boolean') {
      const lockAt = isoLockAtString(rawLock.lockAt) ?? isoLockAtString(fallbackLockAt)
      return {
        locked: rawLock.locked === true || fallbackLocked === true,
        lockAt,
      }
    }
    const lockAt = isoLockAtString(rawLock.$date) ?? isoLockAtString(fallbackLockAt)
    return {
      locked: isLockAtActive(lockAt, serverNowIso) || fallbackLocked === true,
      lockAt,
    }
  }
  const lockAt = isoLockAtString(rawLock) ?? isoLockAtString(fallbackLockAt)
  return {
    locked: isLockAtActive(lockAt, serverNowIso) || fallbackLocked === true,
    lockAt,
  }
}

export function normalizeFinishedState(rawFinished) {
  const data = rawFinished && typeof rawFinished === 'object' ? rawFinished : {}
  return {
    group1: data.group1 === true || data.group1Finished === true,
    group2: data.group2 === true || data.group2Finished === true,
    round16: data.round16 === true || data.round16Finished === true,
    quarter: data.quarter === true || data.quarterFinished === true,
    semi1: data.semi1 === true || data.semi1Finished === true,
    semi2: data.semi2 === true || data.semi2Finished === true,
    thirdPlace: data.thirdPlace === true || data.thirdPlaceFinished === true,
    final: data.final === true || data.finalFinished === true,
  }
}

export function applyPredictionMetaFromApi(data, setFinishedInfo, setOfficialInfo, setLockInfo) {
  const finished = normalizeFinishedState(data?.finished ?? data?.scoringPhases)
  const official = data?.official && typeof data.official === 'object' ? data.official : null
  const rawLocks = data?.locks && typeof data.locks === 'object' ? data.locks : {}
  const serverNowIso = typeof data?.serverNow === 'string' ? data.serverNow : null
  setFinishedInfo(finished)
  setOfficialInfo(official)
  setLockInfo({
    global: normalizeLockEntry(rawLocks.global, data?.locked === true, data?.lockAt, serverNowIso),
    group1: normalizeLockEntry(
      rawLocks.group1,
      data?.lockedGroup1 === true || data?.group1Locked === true || finished.group1,
      data?.lockAtGroup1 ?? data?.group1LockAt,
      serverNowIso,
    ),
    group2: normalizeLockEntry(
      rawLocks.group2,
      data?.lockedGroup2 === true || data?.group2Locked === true || finished.group2,
      data?.lockAtGroup2 ?? data?.group2LockAt,
      serverNowIso,
    ),
    playoffs: normalizeLockEntry(
      rawLocks.playoffs,
      data?.lockedPlayoffs === true || data?.playoffsLocked === true,
      data?.lockAtPlayoffs ?? data?.playoffsLockAt,
      serverNowIso,
    ),
    round16: normalizeLockEntry(rawLocks.round16, finished.round16, null, serverNowIso),
    quarter: normalizeLockEntry(rawLocks.quarter, finished.quarter, null, serverNowIso),
    semi1: normalizeLockEntry(rawLocks.semi1, finished.semi1, null, serverNowIso),
    semi2: normalizeLockEntry(rawLocks.semi2, finished.semi2, null, serverNowIso),
    thirdPlace: normalizeLockEntry(rawLocks.thirdPlace, finished.thirdPlace, null, serverNowIso),
    final: normalizeLockEntry(rawLocks.final ?? rawLocks.finalPhase, finished.final, null, serverNowIso),
    serverNow: serverNowIso,
  })
  return { finished, official }
}

export function pidFromPlayerIdentity(playerMap, idOrUuid, name) {
  const needleUuid = typeof idOrUuid === 'string' ? idOrUuid.trim().toLowerCase() : ''
  const needleName = typeof name === 'string' ? name.trim().toLowerCase() : ''
  if (!needleUuid && !needleName) return null
  for (const [pid, player] of playerMap.entries()) {
    const u = typeof player?.uuid === 'string' ? player.uuid.trim().toLowerCase() : ''
    const n = typeof player?.name === 'string' ? player.name.trim().toLowerCase() : ''
    if (needleUuid && u === needleUuid) return pid
    if (needleName && n === needleName) return pid
  }
  return null
}

export function winnerIdFromBracketSlots(slots, index0, index1, maxWins) {
  if (!Array.isArray(slots)) return null
  const left = slots[index0]
  const right = slots[index1]
  if (!left || !right) return null
  const a = Number(left.score)
  const b = Number(right.score)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  if (a >= maxWins && a > b) return typeof left.id === 'string' ? left.id.trim() : null
  if (b >= maxWins && b > a) return typeof right.id === 'string' ? right.id.trim() : null
  return null
}

export function hasNamedSlot(slot) {
  if (!slot || typeof slot !== 'object') return false
  const name = typeof slot.name === 'string' ? slot.name.trim() : ''
  const id = typeof slot.id === 'string' ? slot.id.trim() : ''
  return name !== '' || id !== ''
}

export function hasRoundMatches(matches) {
  if (!Array.isArray(matches)) return false
  return matches.some((match) => {
    if (Array.isArray(match)) return match.some(hasNamedSlot)
    return hasNamedSlot(match)
  })
}

export function normalizeGroupPlayer(row, seedCount = 6) {
  if (!row || typeof row !== 'object') return null
  const name = typeof row.name === 'string' ? row.name : ''
  const uuid = typeof row.uuid === 'string' ? row.uuid : typeof row.id === 'string' ? row.id : ''
  const num = (key) => {
    const v = row[key]
    if (v == null) return 0
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  const player = { name, uuid, total: num('total') }
  for (let i = 1; i <= seedCount; i += 1) {
    player[`s${i}`] = num(`s${i}`)
  }
  return player
}

export function normalizeGroupFromApi(apiRows, seedCount = 6) {
  if (!Array.isArray(apiRows)) return []
  return apiRows.map((row) => normalizeGroupPlayer(row, seedCount)).filter(Boolean)
}

export function placeholderPlayers(count, seedCount = 8) {
  return Array.from({ length: count }, () => {
    const player = { name: 'TBD', uuid: '', total: 0 }
    for (let i = 1; i <= seedCount; i += 1) player[`s${i}`] = 0
    return player
  })
}

export function buildRankBandsForBaseline(baseline) {
  if (!Array.isArray(baseline) || baseline.length === 0) return {}
  const indices = baseline.map((_, i) => i)
  indices.sort((a, b) => Number(baseline[b].total) - Number(baseline[a].total))
  const bands = {}
  for (let pos = 0; pos < indices.length; pos += 1) {
    const baselineIdx = indices[pos]
    const total = Number(baseline[baselineIdx].total)
    let min = pos
    let max = pos
    for (let p = 0; p < indices.length; p += 1) {
      if (Number(baseline[indices[p]].total) === total) {
        min = Math.min(min, p)
        max = Math.max(max, p)
      }
    }
    bands[baselineIdx] = { min, max }
  }
  return bands
}

export function distanceToRankBand(predictedRank, band) {
  if (!band || typeof band.min !== 'number' || typeof band.max !== 'number') return null
  if (predictedRank >= band.min && predictedRank <= band.max) return 0
  if (predictedRank < band.min) return band.min - predictedRank
  return predictedRank - band.max
}

export function resolveWinnerPid(rawWinner, pairIds, playerMap) {
  if (rawWinner == null) return null
  const candidate = String(rawWinner).trim()
  if (candidate === '') return null
  if (pairIds.includes(candidate)) return candidate
  const needle = candidate.toLowerCase()
  const byPair = pairIds.find((pid) => {
    const p = playerMap.get(pid)
    if (!p) return false
    const uuid = typeof p.uuid === 'string' ? p.uuid.trim().toLowerCase() : ''
    const name = typeof p.name === 'string' ? p.name.trim().toLowerCase() : ''
    return (uuid && uuid === needle) || (name && name === needle)
  })
  return byPair ?? null
}

export function winnerPidFromBoNScores(scores, max, pid0, pid1) {
  if (pid0 == null || pid1 == null) return null
  const [a, b] = scores
  if (a >= max && a > b) return pid0
  if (b >= max && b > a) return pid1
  return null
}

export function tryIncrementBoN(scores, side, max) {
  const [a, b] = scores
  const decidedA = a >= max && a > b
  const decidedB = b >= max && b > a

  if (decidedA) {
    if (side === 0) return scores
    const nb = b + 1
    if (nb > max) return scores
    if (a >= max && nb >= max) return scores
    return [a, nb]
  }
  if (decidedB) {
    if (side === 1) return scores
    const na = a + 1
    if (na > max) return scores
    if (na >= max && b >= max) return scores
    return [na, b]
  }

  const na = side === 0 ? a + 1 : a
  const nb = side === 1 ? b + 1 : b
  if (na >= max && nb >= max) return scores
  return [na, nb]
}

export function applyScoreDigitClick(score, side, max) {
  const [a, b] = score
  if (a === max && a > b) {
    if (side === 0) return [0, 0]
    if (side === 1 && b === max - 1) return [max - 1, max]
  }
  if (b === max && b > a) {
    if (side === 1) return [0, 0]
    if (side === 0 && a === max - 1) return [max, max - 1]
  }
  return score
}

export function parseSavedPairScore(raw, max) {
  if (!Array.isArray(raw) || raw.length !== 2) return null
  const a = Number(raw[0])
  const b = Number(raw[1])
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > max || b > max) return null
  if (a >= max && b >= max) return null
  return [a, b]
}

export function minimalScoreFromWinnerPid(winnerPid, pid0, pid1, max) {
  if (winnerPid == null || pid0 == null || pid1 == null) return [0, 0]
  if (winnerPid === pid0) return [max, 0]
  if (winnerPid === pid1) return [0, max]
  return [0, 0]
}

export function reorderPairScoreForSlots(score, from0, from1, slot0, slot1) {
  if (!Array.isArray(score) || score.length !== 2) return [0, 0]
  if (slot0 == null || slot1 == null) return score
  if (from0 === slot0 && from1 === slot1) return score
  if (from0 === slot1 && from1 === slot0) return [score[1], score[0]]
  return score
}

export function mcHeadUrl(uuid) {
  if (uuid != null && String(uuid).trim() !== '') {
    return `https://mc-heads.net/avatar/${uuid}/48`
  }
  return DEFAULT_HEAD
}

export function playerId(group, baselineIndex) {
  return `g${group}:${baselineIndex}`
}

export function matchLoserId([a, b], winner) {
  if (!winner || !a || !b) return null
  if (winner === a) return b
  if (winner === b) return a
  return null
}

export function formatLockDateLabel(lockAt) {
  if (typeof lockAt !== 'string' || lockAt.trim() === '') return null
  try {
    const isoLocalMatch = lockAt.match(
      /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/,
    )
    const date = isoLocalMatch
      ? new Date(
        Number(isoLocalMatch[1]),
        Number(isoLocalMatch[2]) - 1,
        Number(isoLocalMatch[3]),
        Number(isoLocalMatch[4]),
        Number(isoLocalMatch[5]),
        Number(isoLocalMatch[6] ?? '0'),
      )
      : new Date(lockAt)

    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'full',
      timeStyle: 'medium',
    }).format(date)
  } catch {
    return null
  }
}

export function emptyScorePairs(count) {
  return Array.from({ length: count }, () => [0, 0])
}

export function parseSavedScorePairs(raw, count, max) {
  const fallback = emptyScorePairs(count)
  if (!Array.isArray(raw)) return fallback
  return fallback.map((pair, i) => parseSavedPairScore(raw[i], max) ?? pair)
}

function slotIdentity(slot) {
  if (!hasNamedSlot(slot)) return { uuid: '', name: '' }
  return {
    uuid: typeof slot.id === 'string' ? slot.id.trim() : '',
    name: typeof slot.name === 'string' ? slot.name.trim() : '',
  }
}

export function playerFromSlot(slot) {
  const { uuid, name } = slotIdentity(slot)
  if (!uuid && !name) return null
  return { name: name || 'TBD', uuid }
}

export function pidFromSlot(slot, fallbackPid, playerMap) {
  if (!hasNamedSlot(slot)) return fallbackPid ?? null
  return pidFromPlayerIdentity(playerMap, slot.id, slot.name) ?? fallbackPid ?? null
}

export function resolveOfficialWinnerPid(rawWinner, pairIds, playerMap, bracketSlots, index0, index1, maxWins) {
  const fromField = resolveWinnerPid(rawWinner, pairIds, playerMap)
  if (fromField) return fromField
  const winnerKey = winnerIdFromBracketSlots(bracketSlots, index0, index1, maxWins)
  if (!winnerKey) return null
  return (
    pidFromPlayerIdentity(playerMap, winnerKey, null) ??
    resolveWinnerPid(winnerKey, pairIds, playerMap)
  )
}

function SortableGroupRow({ id, qualify, dragDisabled, resultClass = '', children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: dragDisabled,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  const rowClass = [
    qualify ? 'row-qualify' : '',
    resultClass,
    dragDisabled ? 'mrm-sortable-row--locked' : 'mrm-sortable-row',
    isDragging ? 'mrm-sortable-row--dragging' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={rowClass}
      {...attributes}
      {...(dragDisabled ? {} : listeners)}
    >
      {children}
    </tr>
  )
}

export function SortableGroupTable({
  groupNum,
  baseline,
  order,
  onOrderChange,
  titleClassName,
  groupTitle,
  interactionsEnabled,
  isLocked = false,
  getRowResultClass = null,
  seedCount = 6,
  qualifyCount = 2,
  tableClassName = '',
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const sortableIds = useMemo(() => order.map((idx) => playerId(groupNum, idx)), [order, groupNum])

  const onDragEnd = useCallback(
    (event) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const a = String(active.id)
      const b = String(over.id)
      const oldIndex = sortableIds.indexOf(a)
      const newIndex = sortableIds.indexOf(b)
      if (oldIndex < 0 || newIndex < 0) return
      onOrderChange(arrayMove(order, oldIndex, newIndex))
    },
    [onOrderChange, order, sortableIds],
  )

  return (
    <div className={`group-table group-table-${groupNum} ${tableClassName} ${isLocked ? 'mrm-group-table--locked' : ''}`.trim()}>
      <div className="group-table-scroll">
        {groupTitle ? <div className={`group-title ${titleClassName}`}>{groupTitle}</div> : null}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <table>
            <thead>
              <tr>
                <th className="col-rank">#</th>
                <th className="col-player">Runner</th>
                {Array.from({ length: seedCount }, (_, i) => (
                  <th key={i}>S{i + 1}</th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                {order.map((baselineIdx, rank) => {
                  const p = baseline[baselineIdx]
                  const sid = playerId(groupNum, baselineIdx)
                  const resultClass =
                    typeof getRowResultClass === 'function' ? getRowResultClass(baselineIdx, rank, p) : ''
                  return (
                    <SortableGroupRow
                      key={sid}
                      id={sid}
                      qualify={rank < qualifyCount}
                      dragDisabled={!interactionsEnabled}
                      resultClass={resultClass}
                    >
                      <td className="col-rank">{rank + 1}</td>
                      <td className="col-player">
                        <img src={mcHeadUrl(p?.uuid)} alt="" className="player-head" />
                        &nbsp; &nbsp;
                        {p?.name || 'TBD'}
                      </td>
                      {Array.from({ length: seedCount }, (_, i) => (
                        <td key={i}>{p?.[`s${i + 1}`] ?? 0}</td>
                      ))}
                      <td className="col-pts">{p?.total ?? 0}</td>
                    </SortableGroupRow>
                  )
                })}
              </SortableContext>
            </tbody>
          </table>
        </DndContext>
      </div>
    </div>
  )
}

export function BracketScoredPlayerRow({
  pid,
  player,
  side,
  scoreValue,
  matchScores,
  maxScore,
  winnerPid,
  pickable,
  onIncrement,
  onScoreDigit,
  comparisonClass = '',
  resultsRevealed = false,
}) {
  const isWinner = pid != null && winnerPid === pid
  const isTbd =
    pid == null ||
    !player ||
    !player.name ||
    String(player.name).trim() === '' ||
    player.name === 'TBD'
  if (isTbd) {
    return (
      <div className={['player', 'tbd', comparisonClass].filter(Boolean).join(' ')}>
        <div className="player-info">
          <img src={DEFAULT_HEAD} alt="" className="player-head" width={24} height={24} />
          <span>TBD</span>
        </div>
        <span className="player-score">{scoreValue}</span>
      </div>
    )
  }
  const isLoser =
    winnerPid != null &&
    !isWinner &&
    comparisonClass !== 'mrm-match-result-official'
  const showPickedWinnerHighlight =
    isWinner && (!resultsRevealed || comparisonClass === 'mrm-match-result-correct')
  const rowCls = ['mrm-bracket-scored-row']
  if (comparisonClass) rowCls.push(comparisonClass)
  if (showPickedWinnerHighlight) rowCls.push('mrm-match-winner')
  else if (isLoser) rowCls.push('mrm-match-loser')
  if (!pickable) rowCls.push('mrm-bracket-scored-row--disabled')

  const handleRowClick = () => {
    if (!pickable || !Array.isArray(matchScores) || matchScores.length !== 2) return
    const [a, b] = matchScores
    const next = applyScoreDigitClick(matchScores, side, maxScore)
    if (next[0] !== a || next[1] !== b) {
      onScoreDigit(side)
      return
    }
    onIncrement(side)
  }

  return (
    <button
      type="button"
      className={rowCls.filter(Boolean).join(' ')}
      disabled={!pickable}
      onClick={handleRowClick}
      aria-label={`${player.name}, ${scoreValue} jeu(x)`}
    >
      <img src={mcHeadUrl(player.uuid)} alt="" className="player-head mrm-bracket-head" width={24} height={24} />
      <span className="mrm-bracket-name">{player.name}</span>
      <span className="mrm-bracket-score-area player-score">{scoreValue}</span>
    </button>
  )
}

export function ScoredMatch({
  className = '',
  locked = false,
  pid0,
  pid1,
  player0,
  player1,
  scores,
  maxScore,
  winnerPid,
  pickable,
  onScoresChange,
  comparisonClass0 = '',
  comparisonClass1 = '',
  resultsRevealed = false,
}) {
  return (
    <div className={[className, locked ? 'match--locked' : ''].filter(Boolean).join(' ')}>
      <BracketScoredPlayerRow
        pid={pid0}
        player={player0}
        side={0}
        scoreValue={scores[0]}
        matchScores={scores}
        maxScore={maxScore}
        winnerPid={winnerPid}
        pickable={pickable && pid0 != null && pid1 != null}
        onIncrement={(side) => onScoresChange(tryIncrementBoN(scores, side, maxScore))}
        onScoreDigit={(side) => onScoresChange(applyScoreDigitClick(scores, side, maxScore))}
        comparisonClass={comparisonClass0}
        resultsRevealed={resultsRevealed}
      />
      <BracketScoredPlayerRow
        pid={pid1}
        player={player1}
        side={1}
        scoreValue={scores[1]}
        matchScores={scores}
        maxScore={maxScore}
        winnerPid={winnerPid}
        pickable={pickable && pid0 != null && pid1 != null}
        onIncrement={(side) => onScoresChange(tryIncrementBoN(scores, side, maxScore))}
        onScoreDigit={(side) => onScoresChange(applyScoreDigitClick(scores, side, maxScore))}
        comparisonClass={comparisonClass1}
        resultsRevealed={resultsRevealed}
      />
    </div>
  )
}
