import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
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
import '../MrmPrediction.css'
import { reconcileOrder } from '../../Mrm/mrmPredictionStorage'
import MrmPronosLeaderboard from '../../Mrm/MrmPronosLeaderboard'
import { discordAvatarUrl, discordDisplayName } from '../../../utils/discordUser'
import { predictionApiUrl } from '../../../utils/predictionApi'
import { predictionPagePath } from '../predictionSeason'
import PredictionAuthBanner from '../PredictionAuthBanner'

const mrmPredictionApiUrl = predictionApiUrl('/prediction/mrm')

const DEFAULT_HEAD = 'https://mc-heads.net/avatar/0385/48'
const DEFAULT_LOCK_STATE = {
  global: { locked: false, lockAt: null },
  group1: { locked: false, lockAt: null },
  group2: { locked: false, lockAt: null },
  playoffs: { locked: false, lockAt: null },
  semi1: { locked: false, lockAt: null },
  semi2: { locked: false, lockAt: null },
  thirdPlace: { locked: false, lockAt: null },
  final: { locked: false, lockAt: null },
  serverNow: null,
}
const DEFAULT_FINISHED_STATE = {
  group1: false,
  group2: false,
  semi1: false,
  semi2: false,
  thirdPlace: false,
  final: false,
}

function isoLockAtString(value) {
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

function isLockAtActive(lockAt, serverNowIso) {
  if (!lockAt) return false
  const lockMs = Date.parse(lockAt)
  if (Number.isNaN(lockMs)) return false
  const serverMs = serverNowIso ? Date.parse(serverNowIso) : Date.now()
  return !Number.isNaN(serverMs) && serverMs >= lockMs
}

function normalizeLockEntry(rawLock, fallbackLocked = false, fallbackLockAt = null, serverNowIso = null) {
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

function normalizeFinishedState(rawFinished) {
  const data = rawFinished && typeof rawFinished === 'object' ? rawFinished : {}
  return {
    group1: data.group1 === true || data.group1Finished === true,
    group2: data.group2 === true || data.group2Finished === true,
    semi1: data.semi1 === true || data.semi1Finished === true,
    semi2: data.semi2 === true || data.semi2Finished === true,
    thirdPlace: data.thirdPlace === true || data.thirdPlaceFinished === true,
    final: data.final === true || data.finalFinished === true,
  }
}

function normalizeOfficialState(rawOfficial) {
  const data = rawOfficial && typeof rawOfficial === 'object' ? rawOfficial : null
  if (!data) return null
  return {
    group1: Array.isArray(data.group1) ? data.group1 : null,
    group2: Array.isArray(data.group2) ? data.group2 : null,
    semi1Winner: data.semi1Winner ?? null,
    semi2Winner: data.semi2Winner ?? null,
    thirdPlaceWinner: data.thirdPlaceWinner ?? null,
    finalWinner: data.finalWinner ?? null,
  }
}

function applyPredictionMetaFromApi(data, setFinishedInfo, setOfficialInfo, setLockInfo) {
  const finished = normalizeFinishedState(data?.finished ?? data?.scoringPhases)
  const official = normalizeOfficialState(data?.official)
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
    semi1: normalizeLockEntry(rawLocks.semi1, finished.semi1, null, serverNowIso),
    semi2: normalizeLockEntry(rawLocks.semi2, finished.semi2, null, serverNowIso),
    thirdPlace: normalizeLockEntry(rawLocks.thirdPlace, finished.thirdPlace, null, serverNowIso),
    final: normalizeLockEntry(rawLocks.final ?? rawLocks.finalPhase, finished.final, null, serverNowIso),
    serverNow: serverNowIso,
  })
  return { finished, official }
}

function pidFromPlayerIdentity(playerMap, idOrUuid, name) {
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

function hasBracketSemiData(bracket) {
  if (!bracket || typeof bracket !== 'object' || !Array.isArray(bracket.semi)) return false
  return bracket.semi.some((slot) => {
    if (!slot || typeof slot !== 'object') return false
    const name = typeof slot.name === 'string' ? slot.name.trim() : ''
    const id = typeof slot.id === 'string' ? slot.id.trim() : ''
    return name !== '' || id !== ''
  })
}

function winnerIdFromBracketSlots(slots, index0, index1, maxWins) {
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

function buildBracketSlotPair(slots, index0, index1, fallbackPid0, fallbackPid1, playerMap) {
  const slot0 = slots?.[index0]
  const slot1 = slots?.[index1]
  const pid0 =
    slot0 && (slot0.id || slot0.name)
      ? pidFromPlayerIdentity(playerMap, slot0.id, slot0.name) ?? fallbackPid0
      : fallbackPid0
  const pid1 =
    slot1 && (slot1.id || slot1.name)
      ? pidFromPlayerIdentity(playerMap, slot1.id, slot1.name) ?? fallbackPid1
      : fallbackPid1
  return {
    pid0: pid0 ?? null,
    pid1: pid1 ?? null,
    player0: pid0 != null ? playerMap.get(pid0) ?? null : null,
    player1: pid1 != null ? playerMap.get(pid1) ?? null : null,
  }
}

function buildBracketSemiPair(bracket, index0, index1, fallbackPid0, fallbackPid1, playerMap) {
  return buildBracketSlotPair(bracket?.semi, index0, index1, fallbackPid0, fallbackPid1, playerMap)
}

/** Pids du match : bracket admin (GET tournament) si les deux joueurs sont connus, sinon repli groupes. */
function resolvePlayoffMatchIds(bracketPair, fallbackPid0, fallbackPid1) {
  const a = bracketPair?.pid0 ?? null
  const b = bracketPair?.pid1 ?? null
  if (a != null && b != null) return [a, b]
  return [fallbackPid0 ?? a, fallbackPid1 ?? b]
}

function resolveOfficialWinnerPid(rawWinner, pairIds, playerMap, bracketSlots, index0, index1, maxWins) {
  const fromField = resolveWinnerPid(rawWinner, pairIds, playerMap)
  if (fromField) return fromField
  const winnerKey = winnerIdFromBracketSlots(bracketSlots, index0, index1, maxWins)
  if (!winnerKey) return null
  return (
    pidFromPlayerIdentity(playerMap, winnerKey, null) ??
    resolveWinnerPid(winnerKey, pairIds, playerMap)
  )
}

function normalizeGroupPlayer(row) {
  if (!row || typeof row !== 'object') return null
  const name = typeof row.name === 'string' ? row.name : ''
  const uuid = typeof row.uuid === 'string' ? row.uuid : ''
  const num = (key) => {
    const v = row[key]
    if (v == null) return 0
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return {
    name,
    uuid,
    s1: num('s1'),
    s2: num('s2'),
    s3: num('s3'),
    s4: num('s4'),
    s5: num('s5'),
    s6: num('s6'),
    total: num('total'),
  }
}

/** Roster + scores from GET /api/tournament/mrm (same source as Mrm.jsx). */
function normalizeGroupFromApi(apiRows) {
  if (!Array.isArray(apiRows)) return []
  return apiRows.map(normalizeGroupPlayer).filter(Boolean)
}

/** Positions [min,max] acceptées par joueur selon le classement officiel (ex-aequo = même total). */
function buildRankBandsForBaseline(baseline) {
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

function distanceToRankBand(predictedRank, band) {
  if (!band || typeof band.min !== 'number' || typeof band.max !== 'number') return null
  if (predictedRank >= band.min && predictedRank <= band.max) return 0
  if (predictedRank < band.min) return band.min - predictedRank
  return predictedRank - band.max
}

function resolveWinnerPid(rawWinner, pairIds, playerMap) {
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

/** @param {[number, number]} scores */
function winnerPidFromBoNScores(scores, max, pid0, pid1) {
  if (pid0 == null || pid1 == null) return null
  const [a, b] = scores
  if (a >= max && a > b) return pid0
  if (b >= max && b > a) return pid1
  return null
}

/** @param {[number, number]} scores */
function tryIncrementBoN(scores, side, max) {
  const [a, b] = scores
  const decidedA = a >= max && a > b
  const decidedB = b >= max && b > a

  // Match déjà gagné : le vainqueur ne peut plus prendre de jeu ; le perdant peut
  // monter tant qu’on n’arrive pas à un score impossible (ex. 2-2, 3-3).
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

/**
 * Actions prioritaires pour un clic sur toute la ligne d’un joueur (même logique que l’ancien « clic chiffre »).
 * À 2-1 / 3-2 : ligne du vainqueur → reset 0-0 ; ligne du perdant → inverse (1-2 / 2-3).
 * @param {[number, number]} score
 * @param {0 | 1} side joueur dont la ligne est cliquée
 */
function applyScoreDigitClick(score, side, max) {
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

/** @param {unknown} raw */
function parseSavedPairScore(raw, max) {
  if (!Array.isArray(raw) || raw.length !== 2) return null
  const a = Number(raw[0])
  const b = Number(raw[1])
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > max || b > max) return null
  if (a >= max && b >= max) return null
  return [a, b]
}

function minimalScoreFromWinnerPid(winnerPid, pid0, pid1, max) {
  if (winnerPid == null || pid0 == null || pid1 == null) return [0, 0]
  if (winnerPid === pid0) return [max, 0]
  if (winnerPid === pid1) return [0, max]
  return [0, 0]
}

/** Réordonne [a,b] si les joueurs affichés (slot0, slot1) ne sont pas dans le même ordre que (from0, from1). */
function reorderPairScoreForSlots(score, from0, from1, slot0, slot1) {
  if (!Array.isArray(score) || score.length !== 2) return [0, 0]
  if (slot0 == null || slot1 == null) return score
  if (from0 === slot0 && from1 === slot1) return score
  if (from0 === slot1 && from1 === slot0) return [score[1], score[0]]
  return score
}

function mcHeadUrl(uuid) {
  if (uuid != null && String(uuid).trim() !== '') {
    return `https://mc-heads.net/avatar/${uuid}/48`
  }
  return DEFAULT_HEAD
}

/** @param {1 | 2} group */
function playerId(group, baselineIndex) {
  return `g${group}:${baselineIndex}`
}

function semi1PairIds(order1, order2) {
  return [playerId(1, order1[0]), playerId(2, order2[1])]
}

function semi2PairIds(order1, order2) {
  return [playerId(2, order2[0]), playerId(1, order1[1])]
}

function matchLoserId([a, b], winner) {
  if (!winner || !a || !b) return null
  if (winner === a) return b
  if (winner === b) return a
  return null
}

function formatLockDateLabel(lockAt) {
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

function SortableGroupTable({
  groupNum,
  baseline,
  order,
  onOrderChange,
  titleClassName,
  groupTitle,
  interactionsEnabled,
  isLocked = false,
  getRowResultClass = null,
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
    <div className={`group-table group-table-${groupNum} ${isLocked ? 'mrm-group-table--locked' : ''}`}>
      <div className="group-table-scroll">
        <div className={`group-title ${titleClassName}`}>{groupTitle}</div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <table>
            <thead>
              <tr>
                <th className="col-rank">#</th>
                <th className="col-player">Runner</th>
                <th>S1</th>
                <th>S2</th>
                <th>S3</th>
                <th>S4</th>
                <th>S5</th>
                <th>S6</th>
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
                      qualify={rank < 2}
                      dragDisabled={!interactionsEnabled}
                      resultClass={resultClass}
                    >
                      <td className="col-rank">{rank + 1}</td>
                      <td className="col-player">
                        <img src={mcHeadUrl(p.uuid)} alt="" className="player-head" />
                        &nbsp; &nbsp;
                        {p.name}
                      </td>
                      <td>{p.s1}</td>
                      <td>{p.s2}</td>
                      <td>{p.s3}</td>
                      <td>{p.s4}</td>
                      <td>{p.s5}</td>
                      <td>{p.s6}</td>
                      <td className="col-pts">{p.total}</td>
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

function BracketScoredPlayerRow({
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
  const displayName = isTbd ? 'TBD' : player.name
  const isLoser =
    !isTbd &&
    winnerPid != null &&
    !isWinner &&
    comparisonClass !== 'mrm-match-result-official'
  const showPickedWinnerHighlight =
    !isTbd && isWinner && (!resultsRevealed || comparisonClass === 'mrm-match-result-correct')
  const canPick = pickable && !isTbd
  const rowCls = ['mrm-bracket-scored-row']
  if (comparisonClass) rowCls.push(comparisonClass)
  if (showPickedWinnerHighlight) rowCls.push('mrm-match-winner')
  else if (isLoser) rowCls.push('mrm-match-loser')
  if (!canPick) rowCls.push('mrm-bracket-scored-row--disabled')

  const handleRowClick = () => {
    if (!canPick || !Array.isArray(matchScores) || matchScores.length !== 2) return
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
      disabled={!canPick}
      onClick={handleRowClick}
      aria-label={`${displayName}, ${scoreValue} jeu(x)`}
    >
      <img
        src={isTbd ? DEFAULT_HEAD : mcHeadUrl(player.uuid)}
        alt=""
        className="player-head mrm-bracket-head"
        width={24}
        height={24}
      />
      <span className="mrm-bracket-name">{displayName}</span>
      <span className="mrm-bracket-score-area player-score">{scoreValue}</span>
    </button>
  )
}

function MrmPredictionS10({ season = 10 }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { discordId: viewDiscordIdParam } = useParams()
  const viewDiscordId = viewDiscordIdParam?.trim() || null
  const readOnly = viewDiscordId != null
  const [g1, setG1] = useState([])
  const [g2, setG2] = useState([])
  const [groupsLoaded, setGroupsLoaded] = useState(false)

  const [discordUser, setDiscordUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [viewProfile, setViewProfile] = useState(null)
  const [viewLoadError, setViewLoadError] = useState(null)
  const [viewHasPrediction, setViewHasPrediction] = useState(false)

  const [order1, setOrder1] = useState([])
  const [order2, setOrder2] = useState([])
  const [semi1Score, setSemi1Score] = useState(() => [0, 0])
  const [semi2Score, setSemi2Score] = useState(() => [0, 0])
  const [thirdPlaceScore, setThirdPlaceScore] = useState(() => [0, 0])
  const [finalScore, setFinalScore] = useState(() => [0, 0])
  const [tournamentBracket, setTournamentBracket] = useState(null)
  const [hydrated, setHydrated] = useState(false)
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false)
  const [isScoringOpen, setIsScoringOpen] = useState(false)
  const [lockInfo, setLockInfo] = useState(DEFAULT_LOCK_STATE)
  const [finishedInfo, setFinishedInfo] = useState(DEFAULT_FINISHED_STATE)
  const [officialInfo, setOfficialInfo] = useState(null)

  /** Payload JSON dernier aligné serveur / dernier POST réussi — pas de POST si identique à l’état courant. */
  const baselinePredictionPayloadRef = useRef(null)
  /** Après GET : une capture de baseline depuis l’état React (post-effets de réconciliation), puis false. */
  const captureBaselineAfterHydrateRef = useRef(false)
  const semi1PairKeyRef = useRef('')
  const semi2PairKeyRef = useRef('')
  const thirdPairKeyRef = useRef('')
  const finalPairKeyRef = useRef('')

  const isGlobalLocked = lockInfo.global.locked === true
  const isGroup1Locked = isGlobalLocked || lockInfo.group1.locked === true || finishedInfo.group1
  const isGroup2Locked = isGlobalLocked || lockInfo.group2.locked === true || finishedInfo.group2
  const isLegacyPlayoffsLocked = isGlobalLocked || lockInfo.playoffs.locked === true
  const isSemi1Locked = isLegacyPlayoffsLocked || lockInfo.semi1.locked === true || finishedInfo.semi1
  const isSemi2Locked = isLegacyPlayoffsLocked || lockInfo.semi2.locked === true || finishedInfo.semi2
  const isThirdPlaceLocked = isLegacyPlayoffsLocked || lockInfo.thirdPlace.locked === true || finishedInfo.thirdPlace
  const isFinalLocked = isLegacyPlayoffsLocked || lockInfo.final.locked === true || finishedInfo.final
  const isAnyPlayoffPhaseLocked = isSemi1Locked || isSemi2Locked || isThirdPlaceLocked || isFinalLocked
  const groupsStatusText = readOnly
    ? 'Classement en lecture seule'
    : isGroup1Locked && isGroup2Locked
      ? 'Les groupes sont verrouillés : le classement n’est plus modifiable.'
      : isGroup1Locked
        ? 'Le groupe 1 est verrouillé ; seul le groupe 2 reste modifiable.'
        : isGroup2Locked
          ? 'Le groupe 2 est verrouillé ; seul le groupe 1 reste modifiable.'
          : 'Fais glisser les lignes pour définir ton classement'

  const globalLockAtLabel = useMemo(() => formatLockDateLabel(lockInfo.global.lockAt), [lockInfo.global.lockAt])

  const viewProfileLabel = useMemo(() => {
    if (!viewProfile) return null
    return (
      discordDisplayName({
        username: viewProfile.username,
        globalName: viewProfile.globalName,
      }) ||
      viewProfile.username ||
      viewProfile.discordId
    )
  }, [viewProfile])

  const canEditGroup1 = !readOnly && !isGroup1Locked && authChecked && discordUser != null && hydrated
  const canEditGroup2 = !readOnly && !isGroup2Locked && authChecked && discordUser != null && hydrated
  const canEditBracketBase = !readOnly && authChecked && discordUser != null && hydrated
  const canEditSemi1 = canEditBracketBase && !isSemi1Locked
  const canEditSemi2 = canEditBracketBase && !isSemi2Locked
  const canEditThirdPlace = canEditBracketBase && !isThirdPlaceLocked
  const canEditFinal = canEditBracketBase && !isFinalLocked
  const canSyncPrediction = !readOnly && authChecked && discordUser != null && hydrated

  const playerMap = useMemo(() => {
    const m = new Map()
    g1.forEach((p, i) => m.set(playerId(1, i), p))
    g2.forEach((p, i) => m.set(playerId(2, i), p))
    return m
  }, [g1, g2])

  /** Affiche le bracket si groupes lockés, une phase playoffs lockée, ou données admin bracket (semi). */
  const showPlayoffBracketMatchups =
    (isGroup1Locked && isGroup2Locked) || isAnyPlayoffPhaseLocked || hasBracketSemiData(tournamentBracket)
  const bracketDisplayPid = (id) => (showPlayoffBracketMatchups ? id : null)
  const bracketDisplayPlayer = (id) =>
    showPlayoffBracketMatchups && id != null ? playerMap.get(id) : null

  const s1Ids = useMemo(() => semi1PairIds(order1, order2), [order1, order2])
  const s2Ids = useMemo(() => semi2PairIds(order1, order2), [order1, order2])

  const semi1BracketPair = useMemo(
    () =>
      buildBracketSemiPair(
        tournamentBracket,
        0,
        1,
        showPlayoffBracketMatchups ? s1Ids[0] : null,
        showPlayoffBracketMatchups ? s1Ids[1] : null,
        playerMap,
      ),
    [tournamentBracket, showPlayoffBracketMatchups, s1Ids, playerMap],
  )

  const semi2BracketPair = useMemo(
    () =>
      buildBracketSemiPair(
        tournamentBracket,
        2,
        3,
        showPlayoffBracketMatchups ? s2Ids[0] : null,
        showPlayoffBracketMatchups ? s2Ids[1] : null,
        playerMap,
      ),
    [tournamentBracket, showPlayoffBracketMatchups, s2Ids, playerMap],
  )

  const semi1MatchIds = useMemo(
    () => resolvePlayoffMatchIds(semi1BracketPair, s1Ids[0], s1Ids[1]),
    [semi1BracketPair, s1Ids],
  )
  const semi2MatchIds = useMemo(
    () => resolvePlayoffMatchIds(semi2BracketPair, s2Ids[0], s2Ids[1]),
    [semi2BracketPair, s2Ids],
  )

  const semi1Winner = useMemo(
    () => winnerPidFromBoNScores(semi1Score, 2, semi1MatchIds[0], semi1MatchIds[1]),
    [semi1Score, semi1MatchIds],
  )
  const semi2Winner = useMemo(
    () => winnerPidFromBoNScores(semi2Score, 2, semi2MatchIds[0], semi2MatchIds[1]),
    [semi2Score, semi2MatchIds],
  )

  const tournamentSemi1WinnerPid = useMemo(
    () =>
      resolveOfficialWinnerPid(
        null,
        semi1MatchIds.filter(Boolean),
        playerMap,
        tournamentBracket?.semi,
        0,
        1,
        2,
      ),
    [tournamentBracket, semi1BracketPair, semi1MatchIds, playerMap],
  )

  const tournamentSemi2WinnerPid = useMemo(
    () =>
      resolveOfficialWinnerPid(
        null,
        semi2MatchIds.filter(Boolean),
        playerMap,
        tournamentBracket?.semi,
        2,
        3,
        2,
      ),
    [tournamentBracket, semi2BracketPair, semi2MatchIds, playerMap],
  )

  const semi1ScoredForBracket = isSemi1Locked && finishedInfo.semi1
  const semi2ScoredForBracket = isSemi2Locked && finishedInfo.semi2

  /** Demi scorée → vainqueur officiel (recompute) pilote finale / petite finale, pas le prono verrouillé. */
  const effectiveSemi1WinnerPid = useMemo(() => {
    if (readOnly) return semi1Winner
    if (!semi1ScoredForBracket) return semi1Winner
    return (
      resolveOfficialWinnerPid(
        officialInfo?.semi1Winner,
        semi1MatchIds.filter(Boolean),
        playerMap,
        tournamentBracket?.semi,
        0,
        1,
        2,
      ) ??
      tournamentSemi1WinnerPid ??
      semi1Winner
    )
  }, [
    readOnly,
    semi1ScoredForBracket,
    semi1Winner,
    officialInfo?.semi1Winner,
    semi1MatchIds,
    playerMap,
    tournamentBracket?.semi,
    tournamentSemi1WinnerPid,
  ])

  const effectiveSemi2WinnerPid = useMemo(() => {
    if (readOnly) return semi2Winner
    if (!semi2ScoredForBracket) return semi2Winner
    return (
      resolveOfficialWinnerPid(
        officialInfo?.semi2Winner,
        semi2MatchIds.filter(Boolean),
        playerMap,
        tournamentBracket?.semi,
        2,
        3,
        2,
      ) ??
      tournamentSemi2WinnerPid ??
      semi2Winner
    )
  }, [
    readOnly,
    semi2ScoredForBracket,
    semi2Winner,
    officialInfo?.semi2Winner,
    semi2MatchIds,
    playerMap,
    tournamentBracket?.semi,
    tournamentSemi2WinnerPid,
  ])

  const finalistIds = useMemo(() => {
    const s1 = effectiveSemi1WinnerPid
    const s2 = effectiveSemi2WinnerPid
    if (s1 && s2) return [s1, s2]
    const fromTournament = [tournamentSemi1WinnerPid, tournamentSemi2WinnerPid].filter(Boolean)
    if (fromTournament.length === 2) return fromTournament
    return [s1 ?? null, s2 ?? null]
  }, [
    effectiveSemi1WinnerPid,
    effectiveSemi2WinnerPid,
    tournamentSemi1WinnerPid,
    tournamentSemi2WinnerPid,
  ])

  const finalWinner = useMemo(
    () => winnerPidFromBoNScores(finalScore, 3, finalistIds[0], finalistIds[1]),
    [finalScore, finalistIds[0], finalistIds[1]],
  )

  const petiteFinaleIdsFromSemis = useMemo(() => {
    const loser1 = matchLoserId(semi1MatchIds, effectiveSemi1WinnerPid)
    const loser2 = matchLoserId(semi2MatchIds, effectiveSemi2WinnerPid)
    return loser1 && loser2 ? [loser1, loser2] : [null, null]
  }, [semi1MatchIds, semi2MatchIds, effectiveSemi1WinnerPid, effectiveSemi2WinnerPid])

  const lowerBracketPair = useMemo(
    () =>
      buildBracketSlotPair(
        tournamentBracket?.lower,
        0,
        1,
        showPlayoffBracketMatchups ? petiteFinaleIdsFromSemis[0] : null,
        showPlayoffBracketMatchups ? petiteFinaleIdsFromSemis[1] : null,
        playerMap,
      ),
    [tournamentBracket?.lower, showPlayoffBracketMatchups, petiteFinaleIdsFromSemis, playerMap],
  )

  const petiteFinaleMatchIds = useMemo(
    () =>
      resolvePlayoffMatchIds(
        lowerBracketPair,
        petiteFinaleIdsFromSemis[0],
        petiteFinaleIdsFromSemis[1],
      ),
    [lowerBracketPair, petiteFinaleIdsFromSemis],
  )

  const thirdPlaceWinner = useMemo(
    () => winnerPidFromBoNScores(thirdPlaceScore, 2, petiteFinaleMatchIds[0], petiteFinaleMatchIds[1]),
    [thirdPlaceScore, petiteFinaleMatchIds],
  )

  const predictionStateRef = useRef({
    order1,
    order2,
    semi1Score,
    semi2Score,
    thirdPlaceScore,
    finalScore,
    semi1Winner: null,
    semi2Winner: null,
    thirdPlaceWinner: null,
    finalWinner: null,
  })

  useEffect(() => {
    let cancelled = false
    fetch('/api/tournament/mrm')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return
        if (!data) {
          setGroupsLoaded(true)
          return
        }
        setG1(normalizeGroupFromApi(data.group1))
        setG2(normalizeGroupFromApi(data.group2))
        if (data.bracket && typeof data.bracket === 'object') {
          setTournamentBracket(data.bracket)
        }
        setGroupsLoaded(true)
      })
      .catch((err) => {
        console.warn('[MRM prediction] tournament scores', err)
        if (!cancelled) setGroupsLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
      ; (async () => {
        try {
          const res = await fetch('/api/auth/me', { credentials: 'include' })
          const data = res.ok ? await res.json() : { user: null }
          if (!cancelled) setDiscordUser(data.user ?? null)
        } catch {
          if (!cancelled) setDiscordUser(null)
        } finally {
          if (!cancelled) setAuthChecked(true)
        }
      })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!readOnly || !viewDiscordId) return
    const navProfile = location.state?.viewProfile
    if (navProfile && String(navProfile.discordId) === viewDiscordId) {
      setViewProfile(navProfile)
      setViewLoadError(null)
    }
  }, [readOnly, viewDiscordId, location.state])

  useEffect(() => {
    if (!readOnly || !authChecked || !discordUser?.id || !viewDiscordId) return
    if (discordUser.id === viewDiscordId) {
      navigate(predictionPagePath(season), { replace: true })
    }
  }, [readOnly, authChecked, discordUser, viewDiscordId, navigate, season])

  useEffect(() => {
    if (!groupsLoaded) return
    if (readOnly) {
      if (!viewDiscordId) return
      semi1PairKeyRef.current = ''
      semi2PairKeyRef.current = ''
      thirdPairKeyRef.current = ''
      finalPairKeyRef.current = ''
    } else if (!authChecked) {
      return
    }

    if (!readOnly) {
      baselinePredictionPayloadRef.current = null
      captureBaselineAfterHydrateRef.current = false
      semi1PairKeyRef.current = ''
      semi2PairKeyRef.current = ''
      thirdPairKeyRef.current = ''
      finalPairKeyRef.current = ''
      setHydrated(false)
      setViewLoadError(null)
      setViewProfile(null)
      setViewHasPrediction(false)
    }

    let cancelled = false
      ; (async () => {
        const defaultOrder1 = Array.from({ length: g1.length }, (_, i) => i)
        const defaultOrder2 = Array.from({ length: g2.length }, (_, i) => i)

        try {
          const predictionFetchUrl = readOnly
            ? predictionApiUrl(`prediction/mrm/users/${encodeURIComponent(viewDiscordId)}`)
            : mrmPredictionApiUrl
          const res = await fetch(
            predictionFetchUrl,
            readOnly ? undefined : { credentials: 'include' },
          )
          const data = await res.json().catch(() => ({}))
          if (readOnly && res.status === 404) {
            if (!cancelled) {
              setViewLoadError('not_found')
              setOrder1(defaultOrder1)
              setOrder2(defaultOrder2)
              setSemi1Score([0, 0])
              setSemi2Score([0, 0])
              setThirdPlaceScore([0, 0])
              setFinalScore([0, 0])
              setHydrated(true)
            }
            return
          }
          if (readOnly && !res.ok) {
            if (!cancelled) {
              setViewLoadError('unavailable')
              setHydrated(true)
            }
            return
          }
          const { finished, official } = applyPredictionMetaFromApi(
            data,
            setFinishedInfo,
            setOfficialInfo,
            setLockInfo,
          )
          if (readOnly && data?.user && typeof data.user === 'object') {
            if (!cancelled) setViewProfile(data.user)
          }
          const pred = readOnly
            ? data?.prediction && typeof data.prediction === 'object'
              ? data.prediction
              : null
            : discordUser && data?.prediction && typeof data.prediction === 'object'
              ? data.prediction
              : null
          if (cancelled) return
          if (readOnly) {
            setViewHasPrediction(pred != null)
          }

          if (pred) {
            const o1 = reconcileOrder(g1.length, pred.order1)
            const o2 = reconcileOrder(g2.length, pred.order2)
            setOrder1(o1)
            setOrder2(o2)
            const hydrateMap = new Map()
            g1.forEach((p, i) => hydrateMap.set(playerId(1, i), p))
            g2.forEach((p, i) => hydrateMap.set(playerId(2, i), p))
            const s1Fallback = semi1PairIds(o1, o2)
            const s2Fallback = semi2PairIds(o1, o2)
            const s1 = resolvePlayoffMatchIds(
              buildBracketSemiPair(tournamentBracket, 0, 1, s1Fallback[0], s1Fallback[1], hydrateMap),
              s1Fallback[0],
              s1Fallback[1],
            )
            const s2 = resolvePlayoffMatchIds(
              buildBracketSemiPair(tournamentBracket, 2, 3, s2Fallback[0], s2Fallback[1], hydrateMap),
              s2Fallback[0],
              s2Fallback[1],
            )
            const semi1WinnerSaved = resolveWinnerPid(pred.semi1Winner, s1, hydrateMap)
            const semi2WinnerSaved = resolveWinnerPid(pred.semi2Winner, s2, hydrateMap)
            const sc1 =
              parseSavedPairScore(pred.semi1Score, 2) ??
              minimalScoreFromWinnerPid(semi1WinnerSaved, s1[0], s1[1], 2)
            const sc2 =
              parseSavedPairScore(pred.semi2Score, 2) ??
              minimalScoreFromWinnerPid(semi2WinnerSaved, s2[0], s2[1], 2)
            setSemi1Score(sc1)
            setSemi2Score(sc2)
            const w1Pred = winnerPidFromBoNScores(sc1, 2, s1[0], s1[1])
            const w2Pred = winnerPidFromBoNScores(sc2, 2, s2[0], s2[1])
            const w1 = finished.semi1
              ? resolveOfficialWinnerPid(official?.semi1Winner, s1, hydrateMap, tournamentBracket?.semi, 0, 1, 2) ??
                w1Pred
              : w1Pred
            const w2 = finished.semi2
              ? resolveOfficialWinnerPid(official?.semi2Winner, s2, hydrateMap, tournamentBracket?.semi, 2, 3, 2) ??
                w2Pred
              : w2Pred
            const pfFallback = [matchLoserId(s1, w1), matchLoserId(s2, w2)]
            const pfMatch = resolvePlayoffMatchIds(
              buildBracketSlotPair(
                tournamentBracket?.lower,
                0,
                1,
                pfFallback[0],
                pfFallback[1],
                hydrateMap,
              ),
              pfFallback[0],
              pfFallback[1],
            )
            const thirdPlaceWinnerRaw = pred.thirdPlaceWinner ?? pred.petiteFinaleWinner ?? pred.smallFinalWinner ?? null
            const tpResolved = resolveWinnerPid(thirdPlaceWinnerRaw, pfMatch, hydrateMap)
            const scThirdRaw =
              parseSavedPairScore(pred.thirdPlaceScore ?? pred.petiteFinaleScore, 2) ??
              minimalScoreFromWinnerPid(tpResolved, pfMatch[0], pfMatch[1], 2)
            const pfDisplay = resolvePlayoffMatchIds(
              buildBracketSlotPair(
                tournamentBracket?.lower,
                0,
                1,
                matchLoserId(s1, readOnly ? w1Pred : w1),
                matchLoserId(s2, readOnly ? w2Pred : w2),
                hydrateMap,
              ),
              matchLoserId(s1, readOnly ? w1Pred : w1),
              matchLoserId(s2, readOnly ? w2Pred : w2),
            )
            setThirdPlaceScore(
              reorderPairScoreForSlots(scThirdRaw, pfMatch[0], pfMatch[1], pfDisplay[0], pfDisplay[1]),
            )
            const finalists = readOnly ? [w1Pred, w2Pred].filter(Boolean) : [w1, w2].filter(Boolean)
            const f0 = finalists[0] ?? null
            const f1 = finalists[1] ?? null
            const finalDisplay = readOnly
              ? resolvePlayoffMatchIds(
                  buildBracketSlotPair(tournamentBracket?.final, 0, 1, f0, f1, hydrateMap),
                  f0,
                  f1,
                )
              : [f0, f1]
            const fwResolved =
              pred.finalWinner && finalists.length === 2 && finalists.includes(pred.finalWinner)
                ? pred.finalWinner
                : null
            const scFinalRaw =
              parseSavedPairScore(pred.finalScore, 3) ?? minimalScoreFromWinnerPid(fwResolved, f0, f1, 3)
            setFinalScore(
              reorderPairScoreForSlots(scFinalRaw, f0, f1, finalDisplay[0], finalDisplay[1]),
            )
          } else {
            setOrder1(defaultOrder1)
            setOrder2(defaultOrder2)
            setSemi1Score([0, 0])
            setSemi2Score([0, 0])
            setThirdPlaceScore([0, 0])
            setFinalScore([0, 0])
          }
        } catch {
          if (!cancelled) {
            setFinishedInfo(DEFAULT_FINISHED_STATE)
            setOfficialInfo(null)
            setOrder1(defaultOrder1)
            setOrder2(defaultOrder2)
            setSemi1Score([0, 0])
            setSemi2Score([0, 0])
            setThirdPlaceScore([0, 0])
            setFinalScore([0, 0])
          }
        } finally {
          if (!cancelled) {
            captureBaselineAfterHydrateRef.current = true
            setHydrated(true)
          }
        }
      })()

    return () => {
      cancelled = true
    }
  }, [authChecked, groupsLoaded, discordUser, g1, g2, tournamentBracket, readOnly, viewDiscordId])

  useEffect(() => {
    if (!hydrated || readOnly) return
    const k = `${semi1MatchIds[0] ?? ''}|${semi1MatchIds[1] ?? ''}`
    if (semi1PairKeyRef.current === '') {
      semi1PairKeyRef.current = k
      return
    }
    if (semi1PairKeyRef.current !== k) {
      semi1PairKeyRef.current = k
      setSemi1Score([0, 0])
    }
  }, [hydrated, readOnly, semi1MatchIds[0], semi1MatchIds[1]])

  useEffect(() => {
    if (!hydrated || readOnly) return
    const k = `${semi2MatchIds[0] ?? ''}|${semi2MatchIds[1] ?? ''}`
    if (semi2PairKeyRef.current === '') {
      semi2PairKeyRef.current = k
      return
    }
    if (semi2PairKeyRef.current !== k) {
      semi2PairKeyRef.current = k
      setSemi2Score([0, 0])
    }
  }, [hydrated, readOnly, semi2MatchIds[0], semi2MatchIds[1]])

  useEffect(() => {
    if (!hydrated || readOnly) return
    const k = `${petiteFinaleMatchIds[0] ?? ''}|${petiteFinaleMatchIds[1] ?? ''}`
    if (thirdPairKeyRef.current === '') {
      thirdPairKeyRef.current = k
      return
    }
    if (thirdPairKeyRef.current !== k) {
      thirdPairKeyRef.current = k
      setThirdPlaceScore([0, 0])
    }
  }, [hydrated, readOnly, petiteFinaleMatchIds[0], petiteFinaleMatchIds[1]])

  useEffect(() => {
    if (!hydrated || readOnly) return
    const k = `${finalistIds[0] ?? ''}|${finalistIds[1] ?? ''}`
    if (finalPairKeyRef.current === '') {
      finalPairKeyRef.current = k
      return
    }
    if (finalPairKeyRef.current !== k) {
      finalPairKeyRef.current = k
      setFinalScore([0, 0])
    }
  }, [hydrated, readOnly, finalistIds[0], finalistIds[1]])

  /** Après GET + effets de réconciliation : figer la baseline sans POST (état lu après le prochain tick). */
  useEffect(() => {
    if (!hydrated || !canSyncPrediction || !captureBaselineAfterHydrateRef.current) return
    const t = setTimeout(() => {
      if (!captureBaselineAfterHydrateRef.current) return
      const s = predictionStateRef.current
      baselinePredictionPayloadRef.current = JSON.stringify({
        order1: s.order1,
        order2: s.order2,
        semi1Score: s.semi1Score,
        semi2Score: s.semi2Score,
        thirdPlaceScore: s.thirdPlaceScore,
        finalScore: s.finalScore,
        semi1Winner: s.semi1Winner ?? null,
        semi2Winner: s.semi2Winner ?? null,
        thirdPlaceWinner: s.thirdPlaceWinner ?? null,
        finalWinner: s.finalWinner ?? null,
      })
      captureBaselineAfterHydrateRef.current = false
    }, 0)
    return () => clearTimeout(t)
  }, [
    hydrated,
    canSyncPrediction,
    order1,
    order2,
    semi1Score,
    semi2Score,
    thirdPlaceScore,
    finalScore,
    semi1Winner,
    semi2Winner,
    thirdPlaceWinner,
    finalWinner,
  ])

  useEffect(() => {
    if (!hydrated || !canSyncPrediction) return
    if (captureBaselineAfterHydrateRef.current) return

    const payload = {
      order1,
      order2,
      semi1Score,
      semi2Score,
      thirdPlaceScore,
      finalScore,
      semi1Winner: semi1Winner ?? null,
      semi2Winner: semi2Winner ?? null,
      thirdPlaceWinner: thirdPlaceWinner ?? null,
      finalWinner: finalWinner ?? null,
    }
    const payloadStr = JSON.stringify(payload)
    if (baselinePredictionPayloadRef.current !== null && payloadStr === baselinePredictionPayloadRef.current) {
      return
    }

    const syncTimer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(mrmPredictionApiUrl, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: payloadStr,
          })
          if (!res.ok) {
            const errText = await res.text().catch(() => '')
            console.warn('[MRM prediction sync]', res.status, errText)
          } else {
            baselinePredictionPayloadRef.current = payloadStr
          }
        } catch (e) {
          console.warn('[MRM prediction sync]', e)
        }
      })()
    }, 450)
    return () => clearTimeout(syncTimer)
  }, [
    hydrated,
    canSyncPrediction,
    order1,
    order2,
    semi1Score,
    semi2Score,
    thirdPlaceScore,
    finalScore,
    semi1Winner,
    semi2Winner,
    thirdPlaceWinner,
    finalWinner,
  ])

  const group1Scored = isGroup1Locked && finishedInfo.group1
  const group2Scored = isGroup2Locked && finishedInfo.group2
  const playoffsSemi1Scored = isSemi1Locked && finishedInfo.semi1
  const playoffsSemi2Scored = isSemi2Locked && finishedInfo.semi2
  const playoffsThirdScored = isThirdPlaceLocked && finishedInfo.thirdPlace
  const playoffsFinalScored = isFinalLocked && finishedInfo.final

  const officialGroup1Bands = useMemo(() => {
    if (!group1Scored) return {}
    return buildRankBandsForBaseline(g1)
  }, [group1Scored, g1])

  const officialGroup2Bands = useMemo(() => {
    if (!group2Scored) return {}
    return buildRankBandsForBaseline(g2)
  }, [group2Scored, g2])

  const officialSemi1WinnerPid = useMemo(
    () =>
      resolveOfficialWinnerPid(
        officialInfo?.semi1Winner,
        semi1MatchIds.filter(Boolean),
        playerMap,
        tournamentBracket?.semi,
        0,
        1,
        2,
      ),
    [officialInfo, tournamentBracket, semi1MatchIds, playerMap],
  )
  const officialSemi2WinnerPid = useMemo(
    () =>
      resolveOfficialWinnerPid(
        officialInfo?.semi2Winner,
        semi2MatchIds.filter(Boolean),
        playerMap,
        tournamentBracket?.semi,
        2,
        3,
        2,
      ),
    [officialInfo, tournamentBracket, semi2MatchIds, playerMap],
  )
  const officialThirdPlaceWinnerPid = useMemo(
    () =>
      resolveOfficialWinnerPid(
        officialInfo?.thirdPlaceWinner,
        petiteFinaleMatchIds.filter(Boolean),
        playerMap,
        tournamentBracket?.lower,
        0,
        1,
        2,
      ),
    [officialInfo, tournamentBracket, petiteFinaleMatchIds, playerMap],
  )

  const runnerUpId = useMemo(() => {
    if (!finalWinner || finalistIds[0] == null) return null
    const [x, y] = finalistIds
    if (x === finalWinner) return y
    if (y === finalWinner) return x
    return null
  }, [finalWinner, finalistIds])

  const firstPlayer =
    showPlayoffBracketMatchups && finalWinner ? playerMap.get(finalWinner) : null
  const secondPlayer =
    showPlayoffBracketMatchups && runnerUpId ? playerMap.get(runnerUpId) : null
  const thirdPlayer =
    showPlayoffBracketMatchups && thirdPlaceWinner ? playerMap.get(thirdPlaceWinner) : null
  const officialFinalWinnerPid = useMemo(
    () =>
      resolveOfficialWinnerPid(
        officialInfo?.finalWinner,
        finalistIds.filter(Boolean),
        playerMap,
        tournamentBracket?.final,
        0,
        1,
        3,
      ),
    [officialInfo, tournamentBracket, finalistIds, playerMap],
  )

  const groupRowResultClass = useCallback((baselineIdx, rank, rankBands, enabled) => {
    if (!enabled) return ''
    const band = rankBands?.[baselineIdx]
    if (!band) return 'mrm-group-row-result-neutral'
    const delta = distanceToRankBand(rank, band)
    if (delta === 0) return 'mrm-group-row-result-correct'
    if (delta === 1) return 'mrm-group-row-result-near'
    return 'mrm-group-row-result-wrong'
  }, [])

  const bracketResultClass = useCallback((pid, pickedWinner, officialWinner, enabled) => {
    if (!enabled || pid == null) return ''
    if (!officialWinner) return ''
    if (pickedWinner === officialWinner) {
      return pid === officialWinner ? 'mrm-match-result-correct' : ''
    }
    // Mauvais prono : rouge uniquement sur le vainqueur réel (l'autre case).
    if (pid === officialWinner) return 'mrm-match-result-official'
    return ''
  }, [])

  predictionStateRef.current = {
    order1,
    order2,
    semi1Score,
    semi2Score,
    thirdPlaceScore,
    finalScore,
    semi1Winner,
    semi2Winner,
    thirdPlaceWinner,
    finalWinner,
  }

  return (
    <>
      {readOnly && viewLoadError === 'not_found' ? (
        <div className="mrm-prediction-auth-banner mrm-prediction-auth-banner--locks" role="status">
          <span>Ce joueur n&apos;est pas dans le classement ou n&apos;a pas de pronostiques.</span>
          <Link className="mrm-prediction-auth-link mrm-prediction-view-back-link" to={predictionPagePath(season)}>
            Mes pronostiques
          </Link>
        </div>
      ) : null}
      {readOnly && viewLoadError !== 'not_found' && viewProfile ? (
        <div className="mrm-prediction-view-banner" role="status">
          <div className="mrm-prediction-view-banner-main">
            <img
              className="mrm-prediction-view-banner-avatar"
              src={discordAvatarUrl(viewProfile.discordId, viewProfile.avatar ?? null)}
              alt=""
              width={40}
              height={40}
              onError={(e) => {
                const fallback = discordAvatarUrl(viewProfile.discordId, null)
                if (e.currentTarget.src !== fallback) {
                  e.currentTarget.src = fallback
                }
              }}
            />
            <span>
              Pronostiques de {viewProfileLabel}
              {typeof viewProfile?.points === 'number' ? ` · ${viewProfile.points} pts` : ''}
            </span>
          </div>
          {!viewHasPrediction ? (
            <span className="mrm-prediction-view-empty">Aucun pronostique enregistré pour l&apos;instant.</span>
          ) : null}
        </div>
      ) : null}
      {readOnly && viewLoadError === 'unavailable' ? (
        <div className="mrm-prediction-auth-banner mrm-prediction-auth-banner--locks" role="status">
          <span>Impossible de charger les pronostiques de ce joueur.</span>
          <Link className="mrm-prediction-view-back-link" to={predictionPagePath(season)}>
            Mes pronostiques
          </Link>
        </div>
      ) : null}

      <PredictionAuthBanner visible={authChecked && !discordUser && !readOnly} />
      {isGlobalLocked ? (
        <div className="mrm-prediction-auth-banner mrm-prediction-auth-banner--locks" role="status">
          <span>
            Tous les pronostiques sont verrouillés
            {globalLockAtLabel ? ` depuis le ${globalLockAtLabel}` : ''}. La modification n&apos;est plus possible.
          </span>
        </div>
      ) : null}

      <div className="mrm-prediction-content-wrap">
        <aside className="mrm-prediction-scoring-shell" aria-label="Barème des pronostiques">
          <button
            type="button"
            className="mrm-prediction-scoring-toggle"
            aria-expanded={isScoringOpen}
            aria-controls="mrm-prediction-scoring-panel"
            aria-label={isScoringOpen ? 'Masquer le barème pronos' : 'Afficher le barème pronos'}
            onClick={() => setIsScoringOpen((open) => !open)}
          >
            {isScoringOpen ? 'Masquer le barème' : 'Barème pronos'}
          </button>
          <div
            id="mrm-prediction-scoring-panel"
            className={[
              'mrm-prediction-scoring-panel',
              isScoringOpen ? 'mrm-prediction-scoring-panel--open' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="mrm-prediction-scoring-card">
              <div className="mrm-prediction-scoring-header">BARÈME PRONOS</div>
              <div className="mrm-prediction-scoring-body">
                <p className="mrm-prediction-scoring-section">Phase de groupes</p>
                <ul className="mrm-prediction-scoring-list">
                  <li>Position exacte: +4</li>
                  <li>Écart d'une place: +2</li>
                </ul>
                <p className="mrm-prediction-scoring-section">Phase finale</p>
                <ul className="mrm-prediction-scoring-list">
                  <li>Demi-finale: +4 (Bonus score +6)</li>
                  <li>Petite finale: +6 (Bonus score +8)</li>
                  <li>Finale: +8 (Bonus score +10)</li>
                </ul>
              </div>
            </div>
          </div>
        </aside>
        <aside className="mrm-prediction-leaderboard-shell">
          <button
            type="button"
            className="mrm-prediction-leaderboard-toggle"
            aria-expanded={isLeaderboardOpen}
            aria-controls="mrm-prediction-leaderboard-panel"
            aria-label={
              isLeaderboardOpen
                ? 'Masquer le classement des pronostiques'
                : 'Afficher le classement des pronostiques'
            }
            onClick={() => setIsLeaderboardOpen((open) => !open)}
          >
            {isLeaderboardOpen ? 'Masquer le classement' : 'Classement pronos'}
          </button>
          <div
            id="mrm-prediction-leaderboard-panel"
            className={[
              'mrm-prediction-leaderboard-panel',
              isLeaderboardOpen ? 'mrm-prediction-leaderboard-panel--open' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <MrmPronosLeaderboard
              highlightUserId={readOnly ? viewDiscordId : (discordUser?.id ?? null)}
              event="mrm"
              season={season}
            />
          </div>
        </aside>
        <div className="container">
          <div className="container-first">
            <div className={`mrm-playoffs ${isAnyPlayoffPhaseLocked ? 'mrm-playoffs--locked' : ''}`}>
              <div className="mrm-prediction-playoffs-head">
                <h2 className="playoffs-title">PHASE FINALE</h2>
              </div>
              <div className="bracket">
                <div className="bracket-labels">
                  <div className="round-label">DEMI-FINALE 1</div>
                  <div className="round-label-spacer" />
                  <div className="round-label round-label-finale">FINALE</div>
                  <div className="round-label-spacer" />
                  <div className="round-label">DEMI-FINALE 2</div>
                </div>
                <div className="bracket-matches">
                  <div className={`match ${isSemi1Locked ? 'match--locked' : ''}`}>
                    <BracketScoredPlayerRow
                      pid={bracketDisplayPid(semi1BracketPair.pid0)}
                      player={semi1BracketPair.player0}
                      side={0}
                      scoreValue={semi1Score[0]}
                      matchScores={semi1Score}
                      maxScore={2}
                      winnerPid={semi1Winner}
                      pickable={canEditSemi1 && showPlayoffBracketMatchups}
                      onIncrement={(side) => setSemi1Score((s) => tryIncrementBoN(s, side, 2))}
                      onScoreDigit={(side) => setSemi1Score((s) => applyScoreDigitClick(s, side, 2))}
                      comparisonClass={bracketResultClass(
                        bracketDisplayPid(semi1BracketPair.pid0),
                        semi1Winner,
                        officialSemi1WinnerPid,
                        playoffsSemi1Scored,
                      )}
                      resultsRevealed={playoffsSemi1Scored}
                    />
                    <BracketScoredPlayerRow
                      pid={bracketDisplayPid(semi1BracketPair.pid1)}
                      player={semi1BracketPair.player1}
                      side={1}
                      scoreValue={semi1Score[1]}
                      matchScores={semi1Score}
                      maxScore={2}
                      winnerPid={semi1Winner}
                      pickable={canEditSemi1 && showPlayoffBracketMatchups}
                      onIncrement={(side) => setSemi1Score((s) => tryIncrementBoN(s, side, 2))}
                      onScoreDigit={(side) => setSemi1Score((s) => applyScoreDigitClick(s, side, 2))}
                      comparisonClass={bracketResultClass(
                        bracketDisplayPid(semi1BracketPair.pid1),
                        semi1Winner,
                        officialSemi1WinnerPid,
                        playoffsSemi1Scored,
                      )}
                      resultsRevealed={playoffsSemi1Scored}
                    />
                  </div>
                  <div className="connector connector-left" />
                  <div className={`match match-final ${isFinalLocked ? 'match-final--locked' : ''}`}>
                    <BracketScoredPlayerRow
                      pid={bracketDisplayPid(finalistIds[0])}
                      player={bracketDisplayPlayer(finalistIds[0])}
                      side={0}
                      scoreValue={finalScore[0]}
                      matchScores={finalScore}
                      maxScore={3}
                      winnerPid={finalWinner}
                      pickable={canEditFinal && showPlayoffBracketMatchups && finalistIds[0] != null && finalistIds[1] != null}
                      onIncrement={(side) => setFinalScore((s) => tryIncrementBoN(s, side, 3))}
                      onScoreDigit={(side) => setFinalScore((s) => applyScoreDigitClick(s, side, 3))}
                      comparisonClass={bracketResultClass(
                        bracketDisplayPid(finalistIds[0]),
                        finalWinner,
                        officialFinalWinnerPid,
                        playoffsFinalScored,
                      )}
                      resultsRevealed={playoffsFinalScored}
                    />
                    <BracketScoredPlayerRow
                      pid={bracketDisplayPid(finalistIds[1])}
                      player={bracketDisplayPlayer(finalistIds[1])}
                      side={1}
                      scoreValue={finalScore[1]}
                      matchScores={finalScore}
                      maxScore={3}
                      winnerPid={finalWinner}
                      pickable={canEditFinal && showPlayoffBracketMatchups && finalistIds[0] != null && finalistIds[1] != null}
                      onIncrement={(side) => setFinalScore((s) => tryIncrementBoN(s, side, 3))}
                      onScoreDigit={(side) => setFinalScore((s) => applyScoreDigitClick(s, side, 3))}
                      comparisonClass={bracketResultClass(
                        bracketDisplayPid(finalistIds[1]),
                        finalWinner,
                        officialFinalWinnerPid,
                        playoffsFinalScored,
                      )}
                      resultsRevealed={playoffsFinalScored}
                    />
                  </div>
                  <div className="connector connector-right" />
                  <div className={`match ${isSemi2Locked ? 'match--locked' : ''}`}>
                    <BracketScoredPlayerRow
                      pid={bracketDisplayPid(semi2BracketPair.pid0)}
                      player={semi2BracketPair.player0}
                      side={0}
                      scoreValue={semi2Score[0]}
                      matchScores={semi2Score}
                      maxScore={2}
                      winnerPid={semi2Winner}
                      pickable={canEditSemi2 && showPlayoffBracketMatchups}
                      onIncrement={(side) => setSemi2Score((s) => tryIncrementBoN(s, side, 2))}
                      onScoreDigit={(side) => setSemi2Score((s) => applyScoreDigitClick(s, side, 2))}
                      comparisonClass={bracketResultClass(
                        bracketDisplayPid(semi2BracketPair.pid0),
                        semi2Winner,
                        officialSemi2WinnerPid,
                        playoffsSemi2Scored,
                      )}
                      resultsRevealed={playoffsSemi2Scored}
                    />
                    <BracketScoredPlayerRow
                      pid={bracketDisplayPid(semi2BracketPair.pid1)}
                      player={semi2BracketPair.player1}
                      side={1}
                      scoreValue={semi2Score[1]}
                      matchScores={semi2Score}
                      maxScore={2}
                      winnerPid={semi2Winner}
                      pickable={canEditSemi2 && showPlayoffBracketMatchups}
                      onIncrement={(side) => setSemi2Score((s) => tryIncrementBoN(s, side, 2))}
                      onScoreDigit={(side) => setSemi2Score((s) => applyScoreDigitClick(s, side, 2))}
                      comparisonClass={bracketResultClass(
                        bracketDisplayPid(semi2BracketPair.pid1),
                        semi2Winner,
                        officialSemi2WinnerPid,
                        playoffsSemi2Scored,
                      )}
                      resultsRevealed={playoffsSemi2Scored}
                    />
                  </div>
                </div>
                <div className="third-place-wrapper">
                  <svg className="third-place-connectors" width="546" height="95" viewBox="0 0 546 95" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M 173 0 L 174 88 L 198 88" stroke="#3a3a3a" strokeWidth="2" strokeDasharray="5 3" fill="none" />
                    <path d="M 373 0 L 372 88 L 348 88" stroke="#3a3a3a" strokeWidth="2" strokeDasharray="5 3" fill="none" />
                  </svg>
                  <div className="bracket-third-place">
                    <div className="round-label round-label-third">PETITE FINALE</div>
                    <div className={`match match-third-place ${isThirdPlaceLocked ? 'match--locked' : ''}`}>
                      <BracketScoredPlayerRow
                        pid={bracketDisplayPid(petiteFinaleMatchIds[0])}
                        player={lowerBracketPair.player0 ?? bracketDisplayPlayer(petiteFinaleMatchIds[0])}
                        side={0}
                        scoreValue={thirdPlaceScore[0]}
                        matchScores={thirdPlaceScore}
                        maxScore={2}
                        winnerPid={thirdPlaceWinner}
                        pickable={
                          canEditThirdPlace &&
                          showPlayoffBracketMatchups &&
                          petiteFinaleMatchIds[0] != null &&
                          petiteFinaleMatchIds[1] != null
                        }
                        onIncrement={(side) => setThirdPlaceScore((s) => tryIncrementBoN(s, side, 2))}
                        onScoreDigit={(side) => setThirdPlaceScore((s) => applyScoreDigitClick(s, side, 2))}
                        comparisonClass={bracketResultClass(
                          bracketDisplayPid(petiteFinaleMatchIds[0]),
                          thirdPlaceWinner,
                          officialThirdPlaceWinnerPid,
                          playoffsThirdScored,
                        )}
                        resultsRevealed={playoffsThirdScored}
                      />
                      <BracketScoredPlayerRow
                        pid={bracketDisplayPid(petiteFinaleMatchIds[1])}
                        player={lowerBracketPair.player1 ?? bracketDisplayPlayer(petiteFinaleMatchIds[1])}
                        side={1}
                        scoreValue={thirdPlaceScore[1]}
                        matchScores={thirdPlaceScore}
                        maxScore={2}
                        winnerPid={thirdPlaceWinner}
                        pickable={
                          canEditThirdPlace &&
                          showPlayoffBracketMatchups &&
                          petiteFinaleMatchIds[0] != null &&
                          petiteFinaleMatchIds[1] != null
                        }
                        onIncrement={(side) => setThirdPlaceScore((s) => tryIncrementBoN(s, side, 2))}
                        onScoreDigit={(side) => setThirdPlaceScore((s) => applyScoreDigitClick(s, side, 2))}
                        comparisonClass={bracketResultClass(
                          bracketDisplayPid(petiteFinaleMatchIds[1]),
                          thirdPlaceWinner,
                          officialThirdPlaceWinnerPid,
                          playoffsThirdScored,
                        )}
                        resultsRevealed={playoffsThirdScored}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mrm-podium">
              <h2 className="podium-title">PODIUM</h2>
              <div className="podium-wrapper">
                <div className="podium-player podium-second">
                  <div className="podium-head">
                    <img src={secondPlayer ? mcHeadUrl(secondPlayer.uuid) : DEFAULT_HEAD} className="player-head" alt="" />
                  </div>
                  <div className="podium-name">{secondPlayer?.name ?? 'TBD'}</div>
                  <div className="podium-block podium-block-second">
                    <span className="podium-rank">2</span>
                  </div>
                </div>
                <div className="podium-player podium-first">
                  <div className="podium-head">
                    <img src={firstPlayer ? mcHeadUrl(firstPlayer.uuid) : DEFAULT_HEAD} className="player-head" alt="" />
                  </div>
                  <div className="podium-name">{firstPlayer?.name ?? 'TBD'}</div>
                  <div className="podium-block podium-block-first">
                    <span className="podium-rank">1</span>
                  </div>
                </div>
                <div className="podium-player podium-third">
                  <div className="podium-head">
                    <img src={thirdPlayer ? mcHeadUrl(thirdPlayer.uuid) : DEFAULT_HEAD} className="player-head" alt="" />
                  </div>
                  <div className="podium-name">{thirdPlayer?.name ?? 'TBD'}</div>
                  <div className="podium-block podium-block-third">
                    <span className="podium-rank">3</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="container-second">
            <div className="mrm-groups">
              <div className="mrm-prediction-groups-head">
                <h2 className="playoffs-title">PHASE DE GROUPES</h2>
                <div className="mrm-prediction-hint-slot">
                  <p className="mrm-prediction-hint">
                    {groupsStatusText}
                  </p>
                </div>
              </div>
              <div className="groups-wrapper">
                <SortableGroupTable
                  groupNum={1}
                  baseline={g1}
                  order={order1}
                  onOrderChange={setOrder1}
                  titleClassName="group-title-1"
                  groupTitle="GROUPE 1"
                  interactionsEnabled={canEditGroup1}
                  isLocked={isGroup1Locked}
                  getRowResultClass={(baselineIdx, rank) =>
                    groupRowResultClass(baselineIdx, rank, officialGroup1Bands, group1Scored)}
                />
                <SortableGroupTable
                  groupNum={2}
                  baseline={g2}
                  order={order2}
                  onOrderChange={setOrder2}
                  titleClassName="group-title-2"
                  groupTitle="GROUPE 2"
                  interactionsEnabled={canEditGroup2}
                  isLocked={isGroup2Locked}
                  getRowResultClass={(baselineIdx, rank) =>
                    groupRowResultClass(baselineIdx, rank, officialGroup2Bands, group2Scored)}
                />
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}

export default MrmPredictionS10
