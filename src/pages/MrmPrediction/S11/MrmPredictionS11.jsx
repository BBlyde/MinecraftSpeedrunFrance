import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import '../MrmPrediction.css'
import '../../Mrm/S11/MrmS11.css'
import { reconcileOrder } from '../../Mrm/mrmPredictionStorage'
import MrmPronosLeaderboard from '../../Mrm/MrmPronosLeaderboard'
import { discordAvatarUrl, discordDisplayName } from '../../../utils/discordUser'
import { predictionApiUrl } from '../../../utils/predictionApi'
import { predictionEventForSeason, predictionPagePath } from '../predictionSeason'
import PredictionAuthBanner from '../PredictionAuthBanner'
import {
  DEFAULT_FINISHED_STATE,
  DEFAULT_HEAD,
  DEFAULT_LOCK_STATE,
  ScoredMatch,
  SortableGroupTable,
  applyPredictionMetaFromApi,
  buildRankBandsForBaseline,
  distanceToRankBand,
  emptyScorePairs,
  formatLockDateLabel,
  hasRoundMatches,
  matchLoserId,
  mcHeadUrl,
  normalizeGroupFromApi,
  parseSavedPairScore,
  parseSavedScorePairs,
  pidFromPlayerIdentity,
  placeholderPlayers,
  playerFromSlot,
  playerId,
  resolveWinnerPid,
  winnerIdFromBracketSlots,
  winnerPidFromBoNScores,
} from '../predictionUi'

const LCQ_SIZE = 16
const LCQ_SEED_COUNT = 8
const LCQ_QUALIFY = 4
const R16_COUNT = 8
const QF_COUNT = 4
const BO3 = 2
const BO5 = 3

function homePath(season) {
  return predictionPagePath(season)
}

function r16Match(bracket, index) {
  const match = bracket?.round16?.[index]
  return Array.isArray(match) ? match : [null, null]
}

function qfMatch(bracket, index) {
  const match = bracket?.quarter?.[index]
  return Array.isArray(match) ? match : [null, null]
}

function sfMatch(bracket, index) {
  const semi = bracket?.semi
  if (Array.isArray(semi?.[0])) {
    const match = semi?.[index]
    return Array.isArray(match) ? match : [null, null]
  }
  return [semi?.[index * 2] ?? null, semi?.[index * 2 + 1] ?? null]
}

function ingestSlot(map, slot, fallbackPid) {
  const player = playerFromSlot(slot)
  if (!player) return
  const pid = player.uuid || fallbackPid
  if (pid && !map.has(pid)) map.set(pid, player)
}

function pairFromSlots(slots, fallbackPid0, fallbackPid1, playerMap) {
  const slot0 = slots?.[0]
  const slot1 = slots?.[1]
  const pid0 =
    playerFromSlot(slot0)
      ? pidFromPlayerIdentity(playerMap, slot0.id, slot0.name) ?? fallbackPid0
      : fallbackPid0 ?? null
  const pid1 =
    playerFromSlot(slot1)
      ? pidFromPlayerIdentity(playerMap, slot1.id, slot1.name) ?? fallbackPid1
      : fallbackPid1 ?? null
  return {
    pid0: pid0 ?? null,
    pid1: pid1 ?? null,
    player0: pid0 != null ? playerMap.get(pid0) ?? playerFromSlot(slot0) : null,
    player1: pid1 != null ? playerMap.get(pid1) ?? playerFromSlot(slot1) : null,
  }
}

function officialWinnerFromMatch(rawWinner, pairIds, playerMap, slots, maxWins) {
  const fromField = resolveWinnerPid(rawWinner, pairIds, playerMap)
  if (fromField) return fromField
  const winnerKey = winnerIdFromBracketSlots(slots, 0, 1, maxWins)
  if (!winnerKey) return null
  return pidFromPlayerIdentity(playerMap, winnerKey, null) ?? resolveWinnerPid(winnerKey, pairIds, playerMap)
}

function updatePairAt(list, index, nextPair) {
  return list.map((pair, i) => (i === index ? nextPair : pair))
}

function MrmPredictionS11({ season = 11 }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { discordId: viewDiscordIdParam } = useParams()
  const viewDiscordId = viewDiscordIdParam?.trim() || null
  const readOnly = viewDiscordId != null
  const eventId = predictionEventForSeason(season)
  const predictionUrl = predictionApiUrl(`/prediction/${eventId}`)

  const [lcq, setLcq] = useState(() => placeholderPlayers(LCQ_SIZE, LCQ_SEED_COUNT))
  const [groupsLoaded, setGroupsLoaded] = useState(false)
  const [discordUser, setDiscordUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [viewProfile, setViewProfile] = useState(null)
  const [viewLoadError, setViewLoadError] = useState(null)
  const [viewHasPrediction, setViewHasPrediction] = useState(false)
  const [order1, setOrder1] = useState(() => Array.from({ length: LCQ_SIZE }, (_, i) => i))
  const [round16Scores, setRound16Scores] = useState(() => emptyScorePairs(R16_COUNT))
  const [quarterScores, setQuarterScores] = useState(() => emptyScorePairs(QF_COUNT))
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

  const baselinePredictionPayloadRef = useRef(null)
  const captureBaselineAfterHydrateRef = useRef(false)
  const matchPairKeysRef = useRef({})

  const isGlobalLocked = lockInfo.global.locked === true
  const isLegacyPlayoffsLocked = isGlobalLocked || lockInfo.playoffs.locked === true
  const isLcqLocked = isGlobalLocked || lockInfo.group1.locked === true || finishedInfo.group1
  const isRound16Locked = isLegacyPlayoffsLocked || lockInfo.round16.locked === true || finishedInfo.round16
  const isQuarterLocked = isLegacyPlayoffsLocked || lockInfo.quarter.locked === true || finishedInfo.quarter
  const isSemi1Locked = isLegacyPlayoffsLocked || lockInfo.semi1.locked === true || finishedInfo.semi1
  const isSemi2Locked = isLegacyPlayoffsLocked || lockInfo.semi2.locked === true || finishedInfo.semi2
  const isThirdPlaceLocked = isLegacyPlayoffsLocked || lockInfo.thirdPlace.locked === true || finishedInfo.thirdPlace
  const isFinalLocked = isLegacyPlayoffsLocked || lockInfo.final.locked === true || finishedInfo.final

  const lcqStatusText = readOnly
    ? 'Classement en lecture seule'
    : isLcqLocked
      ? 'Le LCQ est verrouillé : le classement n’est plus modifiable.'
      : 'Fais glisser les lignes pour définir ton classement LCQ'

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

  const canEditLcq = !readOnly && !isLcqLocked && authChecked && discordUser != null && hydrated
  const canEditBracketBase = !readOnly && authChecked && discordUser != null && hydrated
  const canEditRound16 = canEditBracketBase && !isRound16Locked
  const canEditQuarter = canEditBracketBase && !isQuarterLocked
  const canEditSemi1 = canEditBracketBase && !isSemi1Locked
  const canEditSemi2 = canEditBracketBase && !isSemi2Locked
  const canEditThirdPlace = canEditBracketBase && !isThirdPlaceLocked
  const canEditFinal = canEditBracketBase && !isFinalLocked
  const canSyncPrediction = !readOnly && authChecked && discordUser != null && hydrated

  const playerMap = useMemo(() => {
    const m = new Map()
    lcq.forEach((p, i) => m.set(playerId(1, i), p))
    const bracket = tournamentBracket
    for (let i = 0; i < R16_COUNT; i += 1) {
      const match = r16Match(bracket, i)
      ingestSlot(m, match[0], `r16:${i}:0`)
      ingestSlot(m, match[1], `r16:${i}:1`)
    }
    for (let i = 0; i < QF_COUNT; i += 1) {
      const match = qfMatch(bracket, i)
      ingestSlot(m, match[0], `qf:${i}:0`)
      ingestSlot(m, match[1], `qf:${i}:1`)
    }
    const sf1 = sfMatch(bracket, 0)
    const sf2 = sfMatch(bracket, 1)
    ingestSlot(m, sf1[0], 'sf:0:0')
    ingestSlot(m, sf1[1], 'sf:0:1')
    ingestSlot(m, sf2[0], 'sf:1:0')
    ingestSlot(m, sf2[1], 'sf:1:1')
    ingestSlot(m, bracket?.final?.[0], 'final:0')
    ingestSlot(m, bracket?.final?.[1], 'final:1')
    ingestSlot(m, bracket?.lower?.[0], 'third:0')
    ingestSlot(m, bracket?.lower?.[1], 'third:1')
    return m
  }, [lcq, tournamentBracket])

  const showTreeNames = hasRoundMatches(tournamentBracket?.round16) || isRound16Locked || isQuarterLocked

  const r16Pairs = useMemo(
    () =>
      Array.from({ length: R16_COUNT }, (_, i) =>
        pairFromSlots(r16Match(tournamentBracket, i), null, null, playerMap),
      ),
    [tournamentBracket, playerMap],
  )

  const r16Winners = useMemo(
    () =>
      r16Pairs.map((pair, i) =>
        winnerPidFromBoNScores(round16Scores[i] ?? [0, 0], BO3, pair.pid0, pair.pid1),
      ),
    [r16Pairs, round16Scores],
  )

  const qfPairs = useMemo(
    () =>
      Array.from({ length: QF_COUNT }, (_, i) =>
        pairFromSlots(
          qfMatch(tournamentBracket, i),
          showTreeNames ? r16Winners[i * 2] : null,
          showTreeNames ? r16Winners[i * 2 + 1] : null,
          playerMap,
        ),
      ),
    [tournamentBracket, showTreeNames, r16Winners, playerMap],
  )

  const qfWinners = useMemo(
    () =>
      qfPairs.map((pair, i) =>
        winnerPidFromBoNScores(quarterScores[i] ?? [0, 0], BO3, pair.pid0, pair.pid1),
      ),
    [qfPairs, quarterScores],
  )

  const semi1Pair = useMemo(
    () =>
      pairFromSlots(
        sfMatch(tournamentBracket, 0),
        showTreeNames ? qfWinners[0] : null,
        showTreeNames ? qfWinners[1] : null,
        playerMap,
      ),
    [tournamentBracket, showTreeNames, qfWinners, playerMap],
  )
  const semi2Pair = useMemo(
    () =>
      pairFromSlots(
        sfMatch(tournamentBracket, 1),
        showTreeNames ? qfWinners[2] : null,
        showTreeNames ? qfWinners[3] : null,
        playerMap,
      ),
    [tournamentBracket, showTreeNames, qfWinners, playerMap],
  )

  const semi1Winner = useMemo(
    () => winnerPidFromBoNScores(semi1Score, BO5, semi1Pair.pid0, semi1Pair.pid1),
    [semi1Score, semi1Pair],
  )
  const semi2Winner = useMemo(
    () => winnerPidFromBoNScores(semi2Score, BO5, semi2Pair.pid0, semi2Pair.pid1),
    [semi2Score, semi2Pair],
  )

  const finalPair = useMemo(
    () =>
      pairFromSlots(
        tournamentBracket?.final,
        showTreeNames ? semi1Winner : null,
        showTreeNames ? semi2Winner : null,
        playerMap,
      ),
    [tournamentBracket, showTreeNames, semi1Winner, semi2Winner, playerMap],
  )

  const petiteFinalePair = useMemo(
    () =>
      pairFromSlots(
        tournamentBracket?.lower,
        showTreeNames ? matchLoserId([semi1Pair.pid0, semi1Pair.pid1], semi1Winner) : null,
        showTreeNames ? matchLoserId([semi2Pair.pid0, semi2Pair.pid1], semi2Winner) : null,
        playerMap,
      ),
    [tournamentBracket, showTreeNames, semi1Pair, semi2Pair, semi1Winner, semi2Winner, playerMap],
  )

  const finalWinner = useMemo(
    () => winnerPidFromBoNScores(finalScore, BO5, finalPair.pid0, finalPair.pid1),
    [finalScore, finalPair],
  )
  const thirdPlaceWinner = useMemo(
    () => winnerPidFromBoNScores(thirdPlaceScore, BO5, petiteFinalePair.pid0, petiteFinalePair.pid1),
    [thirdPlaceScore, petiteFinalePair],
  )

  const displayPid = (id) => (showTreeNames ? id : null)
  const displayPlayer = (pid, fallback) => (showTreeNames && pid != null ? playerMap.get(pid) ?? fallback : null)

  const predictionStateRef = useRef({})
  predictionStateRef.current = {
    order1,
    round16Scores,
    quarterScores,
    semi1Score,
    semi2Score,
    thirdPlaceScore,
    finalScore,
    round16Winners: r16Winners,
    quarterWinners: qfWinners,
    semi1Winner,
    semi2Winner,
    thirdPlaceWinner,
    finalWinner,
  }

  useEffect(() => {
    let cancelled = false
    fetch('/api/tournament/mrm11')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return
        const fromApi = normalizeGroupFromApi(data?.lcq ?? data?.group1, LCQ_SEED_COUNT)
        setLcq(fromApi.length > 0 ? fromApi : placeholderPlayers(LCQ_SIZE, LCQ_SEED_COUNT))
        if (data?.bracket && typeof data.bracket === 'object') {
          setTournamentBracket(data.bracket)
        }
        setGroupsLoaded(true)
      })
      .catch((err) => {
        console.warn('[MRM S11 prediction] tournament', err)
        if (!cancelled) setGroupsLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
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
      navigate(homePath(season), { replace: true })
    }
  }, [readOnly, authChecked, discordUser, viewDiscordId, navigate, season])

  useEffect(() => {
    if (!groupsLoaded) return
    if (readOnly) {
      if (!viewDiscordId) return
    } else if (!authChecked) {
      return
    }

    if (!readOnly) {
      baselinePredictionPayloadRef.current = null
      captureBaselineAfterHydrateRef.current = false
      matchPairKeysRef.current = {}
      setHydrated(false)
      setViewLoadError(null)
      setViewProfile(null)
      setViewHasPrediction(false)
    }

    let cancelled = false
    ;(async () => {
      const defaultOrder = Array.from({ length: lcq.length }, (_, i) => i)
      try {
        const predictionFetchUrl = readOnly
          ? predictionApiUrl(`prediction/${eventId}/users/${encodeURIComponent(viewDiscordId)}`)
          : predictionUrl
        const res = await fetch(predictionFetchUrl, readOnly ? undefined : { credentials: 'include' })
        const data = await res.json().catch(() => ({}))
        if (readOnly && res.status === 404) {
          if (!cancelled) {
            setViewLoadError('not_found')
            setOrder1(defaultOrder)
            setRound16Scores(emptyScorePairs(R16_COUNT))
            setQuarterScores(emptyScorePairs(QF_COUNT))
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
        applyPredictionMetaFromApi(data, setFinishedInfo, setOfficialInfo, setLockInfo)
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
        if (readOnly) setViewHasPrediction(pred != null)

        if (pred) {
          setOrder1(reconcileOrder(lcq.length, pred.order1))
          setRound16Scores(parseSavedScorePairs(pred.round16Scores, R16_COUNT, BO3))
          setQuarterScores(parseSavedScorePairs(pred.quarterScores, QF_COUNT, BO3))
          setSemi1Score(parseSavedPairScore(pred.semi1Score, BO5) ?? [0, 0])
          setSemi2Score(parseSavedPairScore(pred.semi2Score, BO5) ?? [0, 0])
          setThirdPlaceScore(parseSavedPairScore(pred.thirdPlaceScore, BO5) ?? [0, 0])
          setFinalScore(parseSavedPairScore(pred.finalScore, BO5) ?? [0, 0])
        } else {
          setOrder1(defaultOrder)
          setRound16Scores(emptyScorePairs(R16_COUNT))
          setQuarterScores(emptyScorePairs(QF_COUNT))
          setSemi1Score([0, 0])
          setSemi2Score([0, 0])
          setThirdPlaceScore([0, 0])
          setFinalScore([0, 0])
        }
      } catch {
        if (!cancelled) {
          setFinishedInfo(DEFAULT_FINISHED_STATE)
          setOfficialInfo(null)
          setOrder1(defaultOrder)
          setRound16Scores(emptyScorePairs(R16_COUNT))
          setQuarterScores(emptyScorePairs(QF_COUNT))
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
  }, [authChecked, groupsLoaded, discordUser, lcq, tournamentBracket, readOnly, viewDiscordId, eventId, predictionUrl])

  const resetScoreIfPairChanged = useCallback((key, pairKey, reset) => {
    const prev = matchPairKeysRef.current[key]
    if (prev == null) {
      matchPairKeysRef.current[key] = pairKey
      return
    }
    if (prev !== pairKey) {
      matchPairKeysRef.current[key] = pairKey
      reset()
    }
  }, [])

  useEffect(() => {
    if (!hydrated || readOnly) return
    r16Pairs.forEach((pair, i) => {
      resetScoreIfPairChanged(`r16:${i}`, `${pair.pid0 ?? ''}|${pair.pid1 ?? ''}`, () => {
        setRound16Scores((scores) => updatePairAt(scores, i, [0, 0]))
      })
    })
  }, [hydrated, readOnly, r16Pairs, resetScoreIfPairChanged])

  useEffect(() => {
    if (!hydrated || readOnly) return
    qfPairs.forEach((pair, i) => {
      resetScoreIfPairChanged(`qf:${i}`, `${pair.pid0 ?? ''}|${pair.pid1 ?? ''}`, () => {
        setQuarterScores((scores) => updatePairAt(scores, i, [0, 0]))
      })
    })
  }, [hydrated, readOnly, qfPairs, resetScoreIfPairChanged])

  useEffect(() => {
    if (!hydrated || readOnly) return
    resetScoreIfPairChanged('sf1', `${semi1Pair.pid0 ?? ''}|${semi1Pair.pid1 ?? ''}`, () => setSemi1Score([0, 0]))
    resetScoreIfPairChanged('sf2', `${semi2Pair.pid0 ?? ''}|${semi2Pair.pid1 ?? ''}`, () => setSemi2Score([0, 0]))
    resetScoreIfPairChanged('final', `${finalPair.pid0 ?? ''}|${finalPair.pid1 ?? ''}`, () => setFinalScore([0, 0]))
    resetScoreIfPairChanged(
      'third',
      `${petiteFinalePair.pid0 ?? ''}|${petiteFinalePair.pid1 ?? ''}`,
      () => setThirdPlaceScore([0, 0]),
    )
  }, [
    hydrated,
    readOnly,
    semi1Pair,
    semi2Pair,
    finalPair,
    petiteFinalePair,
    resetScoreIfPairChanged,
  ])

  const buildPayload = useCallback(() => {
    const s = predictionStateRef.current
    return {
      order1: s.order1,
      round16Scores: s.round16Scores,
      quarterScores: s.quarterScores,
      semi1Score: s.semi1Score,
      semi2Score: s.semi2Score,
      thirdPlaceScore: s.thirdPlaceScore,
      finalScore: s.finalScore,
      round16Winners: (s.round16Winners ?? []).map((id) => id ?? null),
      quarterWinners: (s.quarterWinners ?? []).map((id) => id ?? null),
      semi1Winner: s.semi1Winner ?? null,
      semi2Winner: s.semi2Winner ?? null,
      thirdPlaceWinner: s.thirdPlaceWinner ?? null,
      finalWinner: s.finalWinner ?? null,
    }
  }, [])

  useEffect(() => {
    if (!hydrated || !canSyncPrediction || !captureBaselineAfterHydrateRef.current) return
    const t = setTimeout(() => {
      if (!captureBaselineAfterHydrateRef.current) return
      baselinePredictionPayloadRef.current = JSON.stringify(buildPayload())
      captureBaselineAfterHydrateRef.current = false
    }, 0)
    return () => clearTimeout(t)
  }, [
    hydrated,
    canSyncPrediction,
    buildPayload,
    order1,
    round16Scores,
    quarterScores,
    semi1Score,
    semi2Score,
    thirdPlaceScore,
    finalScore,
    r16Winners,
    qfWinners,
    semi1Winner,
    semi2Winner,
    thirdPlaceWinner,
    finalWinner,
  ])

  useEffect(() => {
    if (!hydrated || !canSyncPrediction) return
    if (captureBaselineAfterHydrateRef.current) return
    const payloadStr = JSON.stringify(buildPayload())
    if (baselinePredictionPayloadRef.current !== null && payloadStr === baselinePredictionPayloadRef.current) {
      return
    }
    const syncTimer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(predictionUrl, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: payloadStr,
          })
          if (!res.ok) {
            const errText = await res.text().catch(() => '')
            console.warn('[MRM S11 prediction sync]', res.status, errText)
          } else {
            baselinePredictionPayloadRef.current = payloadStr
          }
        } catch (e) {
          console.warn('[MRM S11 prediction sync]', e)
        }
      })()
    }, 450)
    return () => clearTimeout(syncTimer)
  }, [
    hydrated,
    canSyncPrediction,
    buildPayload,
    predictionUrl,
    order1,
    round16Scores,
    quarterScores,
    semi1Score,
    semi2Score,
    thirdPlaceScore,
    finalScore,
    r16Winners,
    qfWinners,
    semi1Winner,
    semi2Winner,
    thirdPlaceWinner,
    finalWinner,
  ])

  const lcqScored = isLcqLocked && finishedInfo.group1
  const r16Scored = isRound16Locked && finishedInfo.round16
  const qfScored = isQuarterLocked && finishedInfo.quarter
  const playoffsSemi1Scored = isSemi1Locked && finishedInfo.semi1
  const playoffsSemi2Scored = isSemi2Locked && finishedInfo.semi2
  const playoffsThirdScored = isThirdPlaceLocked && finishedInfo.thirdPlace
  const playoffsFinalScored = isFinalLocked && finishedInfo.final

  const officialLcqBands = useMemo(() => {
    if (!lcqScored) return {}
    return buildRankBandsForBaseline(lcq)
  }, [lcqScored, lcq])

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
    if (pid === officialWinner) return 'mrm-match-result-official'
    return ''
  }, [])

  const officialR16Winners = useMemo(
    () =>
      r16Pairs.map((pair, i) =>
        officialWinnerFromMatch(
          officialInfo?.round16Winners?.[i],
          [pair.pid0, pair.pid1].filter(Boolean),
          playerMap,
          r16Match(tournamentBracket, i),
          BO3,
        ),
      ),
    [officialInfo, r16Pairs, playerMap, tournamentBracket],
  )
  const officialQfWinners = useMemo(
    () =>
      qfPairs.map((pair, i) =>
        officialWinnerFromMatch(
          officialInfo?.quarterWinners?.[i],
          [pair.pid0, pair.pid1].filter(Boolean),
          playerMap,
          qfMatch(tournamentBracket, i),
          BO3,
        ),
      ),
    [officialInfo, qfPairs, playerMap, tournamentBracket],
  )
  const officialSemi1WinnerPid = useMemo(
    () =>
      officialWinnerFromMatch(
        officialInfo?.semi1Winner,
        [semi1Pair.pid0, semi1Pair.pid1].filter(Boolean),
        playerMap,
        sfMatch(tournamentBracket, 0),
        BO5,
      ),
    [officialInfo, semi1Pair, playerMap, tournamentBracket],
  )
  const officialSemi2WinnerPid = useMemo(
    () =>
      officialWinnerFromMatch(
        officialInfo?.semi2Winner,
        [semi2Pair.pid0, semi2Pair.pid1].filter(Boolean),
        playerMap,
        sfMatch(tournamentBracket, 1),
        BO5,
      ),
    [officialInfo, semi2Pair, playerMap, tournamentBracket],
  )
  const officialThirdPlaceWinnerPid = useMemo(
    () =>
      officialWinnerFromMatch(
        officialInfo?.thirdPlaceWinner,
        [petiteFinalePair.pid0, petiteFinalePair.pid1].filter(Boolean),
        playerMap,
        tournamentBracket?.lower,
        BO5,
      ),
    [officialInfo, petiteFinalePair, playerMap, tournamentBracket],
  )
  const officialFinalWinnerPid = useMemo(
    () =>
      officialWinnerFromMatch(
        officialInfo?.finalWinner,
        [finalPair.pid0, finalPair.pid1].filter(Boolean),
        playerMap,
        tournamentBracket?.final,
        BO5,
      ),
    [officialInfo, finalPair, playerMap, tournamentBracket],
  )

  const runnerUpId = useMemo(() => {
    if (!finalWinner) return null
    if (finalPair.pid0 === finalWinner) return finalPair.pid1
    if (finalPair.pid1 === finalWinner) return finalPair.pid0
    return null
  }, [finalWinner, finalPair])

  const firstPlayer = showTreeNames && finalWinner ? playerMap.get(finalWinner) : null
  const secondPlayer = showTreeNames && runnerUpId ? playerMap.get(runnerUpId) : null
  const thirdPlayer = showTreeNames && thirdPlaceWinner ? playerMap.get(thirdPlaceWinner) : null

  return (
    <div className="mrm-s11">
      {readOnly && viewLoadError === 'not_found' ? (
        <div className="mrm-prediction-auth-banner mrm-prediction-auth-banner--locks" role="status">
          <span>Ce joueur n&apos;est pas dans le classement ou n&apos;a pas de pronostiques.</span>
          <Link className="mrm-prediction-auth-link mrm-prediction-view-back-link" to={homePath(season)}>
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
                if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback
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
          <Link className="mrm-prediction-view-back-link" to={homePath(season)}>
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
            aria-controls="mrm-prediction-scoring-panel-s11"
            aria-label={isScoringOpen ? 'Masquer le barème pronos' : 'Afficher le barème pronos'}
            onClick={() => setIsScoringOpen((open) => !open)}
          >
            {isScoringOpen ? 'Masquer le barème' : 'Barème pronos'}
          </button>
          <div
            id="mrm-prediction-scoring-panel-s11"
            className={['mrm-prediction-scoring-panel', isScoringOpen ? 'mrm-prediction-scoring-panel--open' : '']
              .filter(Boolean)
              .join(' ')}
          >
            <div className="mrm-prediction-scoring-card">
              <div className="mrm-prediction-scoring-header">BARÈME PRONOS</div>
              <div className="mrm-prediction-scoring-body">
                <p className="mrm-prediction-scoring-section">Last Chance Qualifier</p>
                <ul className="mrm-prediction-scoring-list">
                  <li>Position exacte: +4</li>
                  <li>Écart d&apos;une place: +2</li>
                </ul>
                <p className="mrm-prediction-scoring-section">Arbre principal</p>
                <ul className="mrm-prediction-scoring-list">
                  <li>Huitièmes: +2 (Bonus score +3)</li>
                  <li>Quarts: +3 (Bonus score +4)</li>
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
            aria-controls="mrm-prediction-leaderboard-panel-s11"
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
            id="mrm-prediction-leaderboard-panel-s11"
            className={[
              'mrm-prediction-leaderboard-panel',
              isLeaderboardOpen ? 'mrm-prediction-leaderboard-panel--open' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <MrmPronosLeaderboard
              highlightUserId={readOnly ? viewDiscordId : (discordUser?.id ?? null)}
              event={eventId}
              season={season}
            />
          </div>
        </aside>

        <div className="container">
          <div className="container-first">
            <div className="mrm-playoffs">
              <div className="mrm-prediction-playoffs-head">
                <h2 className="playoffs-title">ARBRE PRINCIPAL</h2>
              </div>
              <div className="main-bracket">
                <div className="bracket-round bracket-round-16">
                  <div className="round-label">HUITIÈMES</div>
                  <div className="bracket-round-body">
                    <div className="bracket-column">
                      {r16Pairs.map((pair, i) => (
                        <div className="bracket-slot" key={`r16-${i}`}>
                          <ScoredMatch
                            className={`match ${isRound16Locked ? 'match--locked' : ''}`}
                            locked={isRound16Locked}
                            pid0={displayPid(pair.pid0)}
                            pid1={displayPid(pair.pid1)}
                            player0={displayPlayer(pair.pid0, pair.player0)}
                            player1={displayPlayer(pair.pid1, pair.player1)}
                            scores={round16Scores[i] ?? [0, 0]}
                            maxScore={BO3}
                            winnerPid={r16Winners[i]}
                            pickable={canEditRound16 && showTreeNames}
                            onScoresChange={(next) => setRound16Scores((scores) => updatePairAt(scores, i, next))}
                            comparisonClass0={bracketResultClass(pair.pid0, r16Winners[i], officialR16Winners[i], r16Scored)}
                            comparisonClass1={bracketResultClass(pair.pid1, r16Winners[i], officialR16Winners[i], r16Scored)}
                            resultsRevealed={r16Scored}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="bracket-connectors">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div className="bracket-connector-line" key={i} />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bracket-round bracket-round-qf">
                  <div className="round-label">QUARTS</div>
                  <div className="bracket-round-body">
                    <div className="bracket-column">
                      {qfPairs.map((pair, i) => (
                        <div className="bracket-slot" key={`qf-${i}`}>
                          <ScoredMatch
                            className={`match ${isQuarterLocked ? 'match--locked' : ''}`}
                            locked={isQuarterLocked}
                            pid0={displayPid(pair.pid0)}
                            pid1={displayPid(pair.pid1)}
                            player0={displayPlayer(pair.pid0, pair.player0)}
                            player1={displayPlayer(pair.pid1, pair.player1)}
                            scores={quarterScores[i] ?? [0, 0]}
                            maxScore={BO3}
                            winnerPid={qfWinners[i]}
                            pickable={canEditQuarter && showTreeNames}
                            onScoresChange={(next) => setQuarterScores((scores) => updatePairAt(scores, i, next))}
                            comparisonClass0={bracketResultClass(pair.pid0, qfWinners[i], officialQfWinners[i], qfScored)}
                            comparisonClass1={bracketResultClass(pair.pid1, qfWinners[i], officialQfWinners[i], qfScored)}
                            resultsRevealed={qfScored}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="bracket-connectors">
                      {Array.from({ length: 2 }).map((_, i) => (
                        <div className="bracket-connector-line" key={i} />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bracket-round bracket-round-sf">
                  <div className="round-label">DEMIS</div>
                  <div className="bracket-round-body">
                    <div className="bracket-column">
                      <div className="bracket-slot">
                        <ScoredMatch
                          className={`match ${isSemi1Locked ? 'match--locked' : ''}`}
                          locked={isSemi1Locked}
                          pid0={displayPid(semi1Pair.pid0)}
                          pid1={displayPid(semi1Pair.pid1)}
                          player0={displayPlayer(semi1Pair.pid0, semi1Pair.player0)}
                          player1={displayPlayer(semi1Pair.pid1, semi1Pair.player1)}
                          scores={semi1Score}
                          maxScore={BO5}
                          winnerPid={semi1Winner}
                          pickable={canEditSemi1 && showTreeNames}
                          onScoresChange={setSemi1Score}
                          comparisonClass0={bracketResultClass(semi1Pair.pid0, semi1Winner, officialSemi1WinnerPid, playoffsSemi1Scored)}
                          comparisonClass1={bracketResultClass(semi1Pair.pid1, semi1Winner, officialSemi1WinnerPid, playoffsSemi1Scored)}
                          resultsRevealed={playoffsSemi1Scored}
                        />
                      </div>
                      <div className="bracket-slot">
                        <ScoredMatch
                          className={`match ${isSemi2Locked ? 'match--locked' : ''}`}
                          locked={isSemi2Locked}
                          pid0={displayPid(semi2Pair.pid0)}
                          pid1={displayPid(semi2Pair.pid1)}
                          player0={displayPlayer(semi2Pair.pid0, semi2Pair.player0)}
                          player1={displayPlayer(semi2Pair.pid1, semi2Pair.player1)}
                          scores={semi2Score}
                          maxScore={BO5}
                          winnerPid={semi2Winner}
                          pickable={canEditSemi2 && showTreeNames}
                          onScoresChange={setSemi2Score}
                          comparisonClass0={bracketResultClass(semi2Pair.pid0, semi2Winner, officialSemi2WinnerPid, playoffsSemi2Scored)}
                          comparisonClass1={bracketResultClass(semi2Pair.pid1, semi2Winner, officialSemi2WinnerPid, playoffsSemi2Scored)}
                          resultsRevealed={playoffsSemi2Scored}
                        />
                      </div>
                    </div>
                    <div className="bracket-connectors">
                      <div className="bracket-connector-line" />
                    </div>
                  </div>
                </div>

                <div className="bracket-round bracket-round-final">
                  <div className="round-label round-label-finale round-label-highlight">FINALE</div>
                  <div className="bracket-round-body">
                    <div className="bracket-column">
                      <div className="bracket-slot">
                        <ScoredMatch
                          className={`match match-final ${isFinalLocked ? 'match-final--locked' : ''}`}
                          locked={isFinalLocked}
                          pid0={displayPid(finalPair.pid0)}
                          pid1={displayPid(finalPair.pid1)}
                          player0={displayPlayer(finalPair.pid0, finalPair.player0)}
                          player1={displayPlayer(finalPair.pid1, finalPair.player1)}
                          scores={finalScore}
                          maxScore={BO5}
                          winnerPid={finalWinner}
                          pickable={canEditFinal && showTreeNames}
                          onScoresChange={setFinalScore}
                          comparisonClass0={bracketResultClass(finalPair.pid0, finalWinner, officialFinalWinnerPid, playoffsFinalScored)}
                          comparisonClass1={bracketResultClass(finalPair.pid1, finalWinner, officialFinalWinnerPid, playoffsFinalScored)}
                          resultsRevealed={playoffsFinalScored}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="bracket-third-place">
                    <svg className="third-place-connector" width="2" height="32" viewBox="0 0 2 32" aria-hidden="true">
                      <line x1="1" y1="0" x2="1" y2="32" stroke="#3a3a3a" strokeWidth="2" strokeDasharray="5 3" />
                    </svg>
                    <ScoredMatch
                      className={`match match-third-place ${isThirdPlaceLocked ? 'match--locked' : ''}`}
                      locked={isThirdPlaceLocked}
                      pid0={displayPid(petiteFinalePair.pid0)}
                      pid1={displayPid(petiteFinalePair.pid1)}
                      player0={displayPlayer(petiteFinalePair.pid0, petiteFinalePair.player0)}
                      player1={displayPlayer(petiteFinalePair.pid1, petiteFinalePair.player1)}
                      scores={thirdPlaceScore}
                      maxScore={BO5}
                      winnerPid={thirdPlaceWinner}
                      pickable={canEditThirdPlace && showTreeNames}
                      onScoresChange={setThirdPlaceScore}
                      comparisonClass0={bracketResultClass(petiteFinalePair.pid0, thirdPlaceWinner, officialThirdPlaceWinnerPid, playoffsThirdScored)}
                      comparisonClass1={bracketResultClass(petiteFinalePair.pid1, thirdPlaceWinner, officialThirdPlaceWinnerPid, playoffsThirdScored)}
                      resultsRevealed={playoffsThirdScored}
                    />
                    <div className="round-label round-label-third">PETITE FINALE</div>
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
                <h2 className="playoffs-title">LAST CHANCE QUALIFIER</h2>
                <div className="mrm-prediction-hint-slot">
                  <p className="mrm-prediction-hint">{lcqStatusText}</p>
                </div>
              </div>
              <SortableGroupTable
                groupNum={1}
                baseline={lcq}
                order={order1}
                onOrderChange={setOrder1}
                titleClassName=""
                groupTitle="LCQ"
                interactionsEnabled={canEditLcq}
                isLocked={isLcqLocked}
                seedCount={LCQ_SEED_COUNT}
                qualifyCount={LCQ_QUALIFY}
                tableClassName="group-table-lcq"
                scoreDisplay="delta"
                getRowResultClass={(baselineIdx, rank) =>
                  groupRowResultClass(baselineIdx, rank, officialLcqBands, lcqScored)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MrmPredictionS11
