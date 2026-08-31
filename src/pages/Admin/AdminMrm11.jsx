import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AdminPredictionRecompute, { S11_RECOMPUTE_PHASES } from './AdminPredictionRecompute'

export const MRM11_EVENT_ID = 'mrm11'
const LCQ_SIZE = 16
const POLL_MS = 2500
const IN_MATCH_STATUSES = new Set(['counting', 'generate', 'ready', 'running'])

const MATCH_DEFS = [
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `round16-${i}`,
    kind: 'nested',
    round: 'round16',
    matchIndex: i,
    baseLabel: `8e ${i + 1}`,
  })),
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `quarter-${i}`,
    kind: 'nested',
    round: 'quarter',
    matchIndex: i,
    baseLabel: `Quart ${i + 1}`,
  })),
  { id: 'semi1', kind: 'nested', round: 'semi', matchIndex: 0, baseLabel: 'Demi 1' },
  { id: 'semi2', kind: 'nested', round: 'semi', matchIndex: 1, baseLabel: 'Demi 2' },
  { id: 'final', kind: 'flat', round: 'final', slots: [0, 1], baseLabel: 'Finale' },
  { id: 'lower', kind: 'flat', round: 'lower', slots: [0, 1], baseLabel: 'Petite finale' },
]

function parseIdentifier(raw) {
  return (
    raw
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? ''
  )
}

function normalizeUuid(uuid) {
  return String(uuid ?? '')
    .replace(/-/g, '')
    .toLowerCase()
}

function normalizeName(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function playerHeadUrl(uuid) {
  return `https://mc-heads.net/avatar/${uuid || '0385'}/48`
}

function playerMatches(player, winner) {
  if (!player || !winner) return false
  const playerUuid = normalizeUuid(player.uuid || player.id)
  const winnerUuid = normalizeUuid(winner.uuid)
  if (playerUuid && winnerUuid && playerUuid === winnerUuid) return true
  const playerName = normalizeName(player.name || player.nickname)
  const winnerName = normalizeName(winner.nickname || winner.name)
  return Boolean(playerName && winnerName && playerName === winnerName)
}

function getLiveWinner(match) {
  const completions = [...(match?.completions ?? [])].sort((a, b) => (a.time ?? 0) - (b.time ?? 0))
  const winnerUuid = completions[0]?.uuid || match?.result?.uuid
  if (!winnerUuid) return null
  const player = (match?.players ?? []).find((p) => normalizeUuid(p.uuid) === normalizeUuid(winnerUuid))
  return {
    uuid: winnerUuid,
    nickname: player?.nickname || player?.name || '',
  }
}

function slotName(slot) {
  const name = String(slot?.name || '').trim()
  return name || 'TBD'
}

function emptySlot() {
  return { name: '', id: '', score: '0' }
}

function padSlots(list, size) {
  const out = [...(list ?? [])].map((slot) => ({
    name: slot?.name ?? '',
    id: slot?.id ?? '',
    score: String(slot?.score ?? '0'),
  }))
  while (out.length < size) out.push(emptySlot())
  return out.slice(0, size)
}

function padMatches(list, count) {
  const out = []
  for (let i = 0; i < count; i += 1) {
    out.push(padSlots(list?.[i], 2))
  }
  return out
}

function nestedMatches(semi, matchCount = 2) {
  if (Array.isArray(semi?.[0])) return padMatches(semi, matchCount)
  const matches = []
  for (let i = 0; i < matchCount; i += 1) {
    matches.push([semi?.[i * 2], semi?.[i * 2 + 1]])
  }
  return padMatches(matches, matchCount)
}

function normalizeBracket(bracket) {
  return {
    round16: padMatches(bracket?.round16, 8),
    quarter: padMatches(bracket?.quarter, 4),
    semi: nestedMatches(bracket?.semi, 2),
    lower: padSlots(bracket?.lower, 2),
    final: padSlots(bracket?.final, 2),
  }
}

function matchPlayers(def, data) {
  const bracket = normalizeBracket(data?.bracket)
  if (def.kind === 'nested') return bracket[def.round][def.matchIndex]
  return [bracket[def.round][def.slots[0]], bracket[def.round][def.slots[1]]]
}

function matchLabel(def, data) {
  if (!def) return ''
  const [a, b] = matchPlayers(def, data)
  const left = slotName(a)
  const right = slotName(b)
  if (left === 'TBD' && right === 'TBD') return def.baseLabel
  return `${def.baseLabel} — ${left} vs ${right}`
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    ...options,
  })
  const text = await res.text()
  let body = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }
  return { ok: res.ok, status: res.status, body }
}

function incrementSlot(slot) {
  return { ...slot, score: String(Number(slot.score ?? 0) + 1) }
}

async function applyWinToTournament(matchDef, winner) {
  const { ok, status, body } = await requestJson(`/api/tournament/${MRM11_EVENT_ID}`)
  if (!ok) {
    throw new Error(
      status === 404
        ? 'Tournoi mrm11 introuvable. Renseigne et valide d’abord les joueurs du bracket.'
        : `GET tournoi échoué (${status})`,
    )
  }

  const bracket = normalizeBracket(body?.bracket)

  if (matchDef.kind === 'nested') {
    const size = matchDef.round === 'round16' ? 8 : matchDef.round === 'quarter' ? 4 : 2
    const round = padMatches(bracket[matchDef.round], size)
    const pair = [...round[matchDef.matchIndex]]
    const slotIndex = pair.findIndex((slot) => playerMatches(slot, winner))
    if (slotIndex < 0) {
      throw new Error(
        `${winner.nickname || winner.uuid} n’est pas dans ${matchDef.baseLabel}. Vérifie le nom/UUID.`,
      )
    }
    pair[slotIndex] = incrementSlot(pair[slotIndex])
    round[matchDef.matchIndex] = pair
    bracket[matchDef.round] = round
  } else {
    const round = [...bracket[matchDef.round]]
    const slotIndex = matchDef.slots.find((i) => playerMatches(round[i], winner))
    if (slotIndex == null) {
      throw new Error(
        `${winner.nickname || winner.uuid} n’est pas dans ${matchDef.baseLabel}. Vérifie le nom/UUID.`,
      )
    }
    round[slotIndex] = incrementSlot(round[slotIndex])
    bracket[matchDef.round] = round
  }

  const posted = await requestJson(`/api/tournament/${MRM11_EVENT_ID}/bracket`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bracket),
  })
  if (!posted.ok) throw new Error(`POST bracket échoué (${posted.status})`)
  return `${winner.nickname || winner.uuid} : +1 sur ${matchDef.baseLabel}`
}

function MatchAdminRow({ label, prefix, slots, maxScore }) {
  const [a, b] = slots
  return (
    <div className="admin-match">
      <span className="match-label">{label}</span>
      <div className="player-name">
        <input name={`${prefix}-0-name`} className="player-field" placeholder="Name" defaultValue={a?.name ?? ''} />
      </div>
      <div className="player-id">
        <input name={`${prefix}-0-id`} className="player-field" placeholder="ID" defaultValue={a?.id ?? ''} />
      </div>
      <input type="number" min="0" max={maxScore} name={`${prefix}-0-score`} placeholder="0" defaultValue={a?.score ?? '0'} />
      VS
      <div className="player-name">
        <input name={`${prefix}-1-name`} className="player-field" placeholder="Name" defaultValue={b?.name ?? ''} />
      </div>
      <div className="player-id">
        <input name={`${prefix}-1-id`} className="player-field" placeholder="ID" defaultValue={b?.id ?? ''} />
      </div>
      <input type="number" min="0" max={maxScore} name={`${prefix}-1-score`} placeholder="0" defaultValue={b?.score ?? '0'} />
    </div>
  )
}

function applyPair(target, formDataObj, prefix) {
  for (const side of [0, 1]) {
    const name = formDataObj[`${prefix}-${side}-name`]
    const id = formDataObj[`${prefix}-${side}-id`]
    const score = formDataObj[`${prefix}-${side}-score`]
    if (name != null) target[side].name = name
    if (id != null) target[side].id = id
    if (score != null) target[side].score = String(score || '0')
  }
}

function buildS11BracketPayload(formDataObj, current) {
  const bracket = normalizeBracket(current)
  for (let i = 0; i < 8; i += 1) applyPair(bracket.round16[i], formDataObj, `round16-${i}`)
  for (let i = 0; i < 4; i += 1) applyPair(bracket.quarter[i], formDataObj, `quarter-${i}`)
  applyPair(bracket.semi[0], formDataObj, 'semi-0')
  applyPair(bracket.semi[1], formDataObj, 'semi-1')
  applyPair(bracket.final, formDataObj, 'final')
  applyPair(bracket.lower, formDataObj, 'lower')
  return bracket
}

function buildLcqPayload(formDataObj) {
  return Array.from({ length: LCQ_SIZE }, (_, i) => ({
    name: String(formDataObj[`lcq-${i}-name`] ?? '').trim(),
    uuid: String(formDataObj[`lcq-${i}-uuid`] ?? '').trim(),
  }))
}

function LcqPlayerRow({ index, player }) {
  return (
    <div className="admin-match">
      <span className="match-label">#{index + 1}</span>
      <div className="player-name">
        <input
          name={`lcq-${index}-name`}
          className="player-field"
          placeholder="Name"
          defaultValue={player?.name ?? ''}
        />
      </div>
      <div className="player-id">
        <input
          name={`lcq-${index}-uuid`}
          className="player-field"
          placeholder="UUID"
          defaultValue={player?.uuid ?? ''}
        />
      </div>
    </div>
  )
}

function Mrm11Tracker({ tournament, onApplied }) {
  const [matchId, setMatchId] = useState(MATCH_DEFS[0].id)
  const [identifierInput, setIdentifierInput] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [running, setRunning] = useState(false)
  const [activeIdentifier, setActiveIdentifier] = useState('')
  const [activeKey, setActiveKey] = useState('')
  const [match, setMatch] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  const abortRef = useRef(null)
  const inMatchRef = useRef(false)
  const baselineLastIdRef = useRef(null)
  const appliedMatchIdsRef = useRef(new Set())
  const trackedMatchRef = useRef(MATCH_DEFS[0])
  const applyingRef = useRef(false)

  const identifier = parseIdentifier(identifierInput)
  const canStart = identifier.length > 0 && privateKey.trim().length > 0
  const selectedDef = MATCH_DEFS.find((def) => def.id === matchId) ?? MATCH_DEFS[0]

  const fetchLive = useCallback(async (id, key) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)

    try {
      const response = await fetch(`/api/mcsr/users/${encodeURIComponent(id)}/live`, {
        headers: { 'Private-Key': key },
        credentials: 'include',
        signal: controller.signal,
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        const detail =
          payload?.data ??
          payload?.error ??
          (response.status === 401
            ? 'Private-Key invalide ou joueur pas host/co-host de la room.'
            : response.status === 429
              ? 'Trop de requêtes (rate limit).'
              : `Erreur ${response.status}`)
        throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
      }
      if (payload?.status !== 'success') {
        throw new Error(payload?.data || 'Réponse API inattendue')
      }

      setMatch(payload.data ?? null)
      setError(null)
    } catch (err) {
      if (err.name === 'AbortError') return
      setError(err.message || 'Échec du fetch')
    } finally {
      if (abortRef.current === controller) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!running || !activeIdentifier || !activeKey) return
    fetchLive(activeIdentifier, activeKey)
    const intervalId = setInterval(() => fetchLive(activeIdentifier, activeKey), POLL_MS)
    return () => {
      clearInterval(intervalId)
      abortRef.current?.abort()
    }
  }, [running, activeIdentifier, activeKey, fetchLive])

  useEffect(() => {
    if (!running || !match) return
    const { status, lastId } = match

    if (IN_MATCH_STATUSES.has(status)) {
      if (!inMatchRef.current) {
        inMatchRef.current = true
        baselineLastIdRef.current = lastId ?? null
      }
      return
    }

    const tryApply = (id) => {
      if (applyingRef.current) return
      const winner = getLiveWinner(match)
      if (!winner) {
        if (status === 'done') setError('Match terminé mais gagnant introuvable (pas de completion).')
        return
      }

      const matchKey =
        id != null && /^\d+$/.test(String(id))
          ? String(id)
          : `live-${normalizeUuid(winner.uuid)}-${match?.completions?.[0]?.time ?? match?.time ?? 'x'}`
      if (appliedMatchIdsRef.current.has(matchKey)) return
      if (id != null && String(baselineLastIdRef.current ?? '') === String(id)) return

      appliedMatchIdsRef.current.add(matchKey)
      applyingRef.current = true
      setMessage(`Victoire de ${winner.nickname || winner.uuid} — mise à jour du score…`)
      setError(null)

      applyWinToTournament(trackedMatchRef.current, winner)
        .then((okMessage) => {
          setMessage(okMessage)
          onApplied?.()
        })
        .catch((err) => {
          appliedMatchIdsRef.current.delete(matchKey)
          setMessage(null)
          setError(err.message || 'Échec de la mise à jour du score')
        })
        .finally(() => {
          applyingRef.current = false
        })
    }

    if (status === 'done') tryApply(lastId)
    if (inMatchRef.current && status === 'idle') {
      tryApply(lastId)
      inMatchRef.current = false
      baselineLastIdRef.current = lastId ?? null
    }
  }, [match, running, onApplied])

  const startPull = () => {
    if (!canStart) return
    trackedMatchRef.current = selectedDef
    setActiveIdentifier(identifier)
    setActiveKey(privateKey.trim())
    setError(null)
    setMessage(null)
    inMatchRef.current = false
    baselineLastIdRef.current = null
    setRunning(true)
  }

  const stopPull = () => {
    setRunning(false)
    abortRef.current?.abort()
    setLoading(false)
  }

  const livePlayers = match?.players ?? []
  const winnerUuid = normalizeUuid(getLiveWinner(match)?.uuid)
  const matchOptions = useMemo(
    () => MATCH_DEFS.map((def) => ({ def, label: matchLabel(def, tournament) })),
    [tournament],
  )

  return (
    <div className="admin-mrm11">
      <form
        className="admin-lcq-form"
        onSubmit={(event) => {
          event.preventDefault()
          startPull()
        }}
      >
        <label className="admin-lcq-field">
          <span>Match</span>
          <select value={matchId} onChange={(e) => setMatchId(e.target.value)} disabled={running}>
            {matchOptions.map(({ def, label }) => (
              <option key={def.id} value={def.id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-lcq-field">
          <span>Pseudo (host / co-host)</span>
          <input
            value={identifierInput}
            onChange={(e) => setIdentifierInput(e.target.value)}
            placeholder="RED_LIME"
            spellCheck={false}
            disabled={running}
          />
        </label>
        <label className="admin-lcq-field">
          <span>Private-Key</span>
          <input
            type="password"
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            placeholder="Clé in-game (Profile → Settings)"
            autoComplete="off"
            disabled={running}
          />
        </label>
        {running ? (
          <button type="button" onClick={stopPull}>
            Arrêter
          </button>
        ) : (
          <button type="submit" disabled={!canStart}>
            Lancer le tracking
          </button>
        )}
      </form>

      <p className="admin-mrm11-status">
        {running
          ? `${loading ? 'Fetch…' : 'Polling'} ${activeIdentifier} · ${matchLabel(trackedMatchRef.current, tournament)}`
          : 'En pause — le gagnant du match live recevra +1 sur le match choisi (BO3 / BO5).'}
      </p>

      {message && <p className="admin-lcq-message">{message}</p>}
      {error && <p className="admin-lcq-error">{error}</p>}

      {match && (
        <div className="admin-mrm11-live">
          <div className="admin-mrm11-live-meta">
            <span>
              Status <strong>{match.status}</strong>
            </span>
            <span>
              Last ID <strong>{match.lastId ?? '—'}</strong>
            </span>
          </div>
          <div className="admin-mrm11-players">
            {livePlayers.length === 0 ? (
              <span className="admin-mrm11-status">Aucun joueur dans la room.</span>
            ) : (
              livePlayers.map((player) => {
                const finished = Boolean(winnerUuid) && normalizeUuid(player.uuid) === winnerUuid
                return (
                  <div key={player.uuid} className={`admin-mrm11-player${finished ? ' is-winner' : ''}`}>
                    <img src={playerHeadUrl(player.uuid)} alt="" className="player-head" />
                    <span>{player.nickname || player.uuid}</span>
                    {finished ? <span className="admin-mrm11-win-tag">gagnant</span> : null}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function AdminMrm11() {
  const [tournament, setTournament] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshToken, setRefreshToken] = useState(0)

  const reload = useCallback(async () => {
    const { ok, body } = await requestJson(`/api/tournament/${MRM11_EVENT_ID}`)
    setTournament(ok ? body : null)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    reload()
      .catch((err) => console.error('Erreur chargement MRM S11', err))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reload, refreshToken])

  const handleApplied = useCallback(() => {
    setRefreshToken((value) => value + 1)
  }, [])

  const handleLcqSubmit = async (event) => {
    event.preventDefault()
    if (!window.confirm('Confirmer la mise à jour du LCQ S11 ?')) return
    const formDataObj = Object.fromEntries(new FormData(event.currentTarget).entries())
    const payload = buildLcqPayload(formDataObj)
    const posted = await requestJson(`/api/tournament/${MRM11_EVENT_ID}/lcq`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!posted.ok) {
      console.error('Erreur envoi LCQ S11', posted.body)
      return
    }
    setRefreshToken((value) => value + 1)
  }

  const handleBracketSubmit = async (event) => {
    event.preventDefault()
    if (!window.confirm('Confirmer la mise à jour du bracket S11 ?')) return
    const formDataObj = Object.fromEntries(new FormData(event.currentTarget).entries())
    const payload = buildS11BracketPayload(formDataObj, tournament)
    const posted = await requestJson(`/api/tournament/${MRM11_EVENT_ID}/bracket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!posted.ok) {
      console.error('Erreur envoi bracket S11', posted.body)
      return
    }
    setRefreshToken((value) => value + 1)
  }

  const bracket = normalizeBracket(tournament?.bracket)
  const formKey = `${refreshToken}-${tournament ? 'loaded' : 'empty'}`

  return (
    <>
      <Mrm11Tracker tournament={tournament} onApplied={handleApplied} />
      {loading ? (
        <span className="info">Chargement du bracket...</span>
      ) : (
        <>
          <div className="group-section">
            <div className="group-header">
              <span>LCQ</span>
              <span>Nom</span>
              <span>Id</span>
            </div>
            <form onSubmit={handleLcqSubmit} className="form-lcq-roster" key={`${formKey}-lcq`}>
              {Array.from({ length: LCQ_SIZE }, (_, i) => (
                <LcqPlayerRow key={i} index={i} player={tournament?.lcq?.[i]} />
              ))}
              <button type="submit">Valider le LCQ</button>
            </form>
          </div>
          <div className="bracket-section">
          <form onSubmit={handleBracketSubmit} className="form-bracket" key={formKey}>
            {Array.from({ length: 8 }, (_, i) => (
              <MatchAdminRow
                key={`r16-${i}`}
                label={`8e ${i + 1}`}
                prefix={`round16-${i}`}
                slots={bracket.round16[i]}
                maxScore={2}
              />
            ))}
            {Array.from({ length: 4 }, (_, i) => (
              <MatchAdminRow
                key={`qf-${i}`}
                label={`Quart ${i + 1}`}
                prefix={`quarter-${i}`}
                slots={bracket.quarter[i]}
                maxScore={2}
              />
            ))}
            <MatchAdminRow label="Demi 1" prefix="semi-0" slots={bracket.semi[0]} maxScore={3} />
            <MatchAdminRow label="Demi 2" prefix="semi-1" slots={bracket.semi[1]} maxScore={3} />
            <MatchAdminRow label="Finale" prefix="final" slots={bracket.final} maxScore={3} />
            <MatchAdminRow label="Petite finale" prefix="lower" slots={bracket.lower} maxScore={3} />
            <button type="submit">Valider</button>
          </form>
        </div>
        </>
      )}
      <AdminPredictionRecompute event={MRM11_EVENT_ID} phases={S11_RECOMPUTE_PHASES} />
    </>
  )
}

export default AdminMrm11
