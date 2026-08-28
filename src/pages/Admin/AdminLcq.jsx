import { useState } from 'react'

const SEED_COUNT = 8
const SEED_SLOTS = Array.from({ length: SEED_COUNT }, (_, i) => i + 1)

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

function AdminLcq() {
  const [eventId, setEventId] = useState('lcq-mrm-1')
  const [matchId, setMatchId] = useState('')
  const [scoreboard, setScoreboard] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const eventPath = `/api/lcq-mrm/event/${encodeURIComponent(eventId.trim())}`

  const setFeedback = (nextMessage, nextError = null) => {
    setMessage(nextMessage)
    setError(nextError)
  }

  const handleLoad = async (event) => {
    event.preventDefault()
    if (!eventId.trim()) {
      setFeedback(null, 'Renseigne un eventId.')
      return
    }

    setBusy(true)
    setFeedback(null)
    try {
      const { ok, status, body } = await requestJson(eventPath)
      if (!ok) {
        setScoreboard(null)
        setFeedback(null, `GET échoué (${status}) : ${typeof body === 'string' ? body : body?.error || 'inconnu'}`)
        return
      }
      setScoreboard(body)
      setFeedback('Scoreboard chargé.')
    } catch (err) {
      console.error(err)
      setFeedback(null, 'Erreur réseau au GET.')
    } finally {
      setBusy(false)
    }
  }

  const handleAddMatch = async (event) => {
    event.preventDefault()
    const trimmedEvent = eventId.trim()
    const trimmedMatch = matchId.trim()
    if (!trimmedEvent || !trimmedMatch) {
      setFeedback(null, 'Renseigne eventId et matchId.')
      return
    }
    if (!/^\d+$/.test(trimmedMatch)) {
      setFeedback(null, 'matchId doit être un nombre.')
      return
    }
    if (!window.confirm(`Ajouter le match ${trimmedMatch} à l'event ${trimmedEvent} ?`)) return

    setBusy(true)
    setFeedback(null)
    try {
      const { ok, status, body } = await requestJson(
        `${eventPath}/matches/${trimmedMatch}`,
        { method: 'POST' },
      )
      if (!ok) {
        setFeedback(null, `POST échoué (${status}) : ${typeof body === 'string' ? body : body?.error || 'inconnu'}`)
        return
      }
      setScoreboard(body)
      setMatchId('')
      setFeedback(`Match ${trimmedMatch} ajouté.`)
    } catch (err) {
      console.error(err)
      setFeedback(null, 'Erreur réseau au POST.')
    } finally {
      setBusy(false)
    }
  }

  const handleRemoveMatch = async (id) => {
    if (!window.confirm(`Retirer le match ${id} ?`)) return
    setBusy(true)
    setFeedback(null)
    try {
      const { ok, status, body } = await requestJson(`${eventPath}/matches/${id}`, {
        method: 'DELETE',
      })
      if (!ok) {
        setFeedback(null, `DELETE match échoué (${status})`)
        return
      }
      setScoreboard(body)
      setFeedback(`Match ${id} retiré.`)
    } catch (err) {
      console.error(err)
      setFeedback(null, 'Erreur réseau au DELETE match.')
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteEvent = async () => {
    if (!eventId.trim()) return
    if (!window.confirm(`Supprimer entièrement l'event ${eventId.trim()} ?`)) return
    setBusy(true)
    setFeedback(null)
    try {
      const { ok, status } = await requestJson(eventPath, { method: 'DELETE' })
      if (!ok) {
        setFeedback(null, `DELETE event échoué (${status})`)
        return
      }
      setScoreboard(null)
      setFeedback(`Event ${eventId.trim()} supprimé.`)
    } catch (err) {
      console.error(err)
      setFeedback(null, 'Erreur réseau au DELETE event.')
    } finally {
      setBusy(false)
    }
  }

  const matchIds = scoreboard?.matchIds ?? []
  const players = scoreboard?.players ?? []
  // 8 seeds fixes : seed N = matchIds[N-1] s'il existe
  const seedColumns = SEED_SLOTS.map((seed) => ({
    seed,
    matchId: matchIds[seed - 1] ?? null,
  }))

  return (
    <div className="admin-lcq">
      <form className="admin-lcq-form" onSubmit={handleLoad}>
        <label className="admin-lcq-field">
          <span>Event ID</span>
          <input
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            placeholder="lcq-mrm-1"
            disabled={busy}
          />
        </label>
        <button type="submit" disabled={busy}>
          Charger (GET)
        </button>
        <button type="button" disabled={busy || !eventId.trim()} onClick={handleDeleteEvent}>
          Supprimer event
        </button>
      </form>

      <form className="admin-lcq-form" onSubmit={handleAddMatch}>
        <label className="admin-lcq-field">
          <span>Match ID (MCSRranked)</span>
          <input
            value={matchId}
            onChange={(e) => setMatchId(e.target.value)}
            placeholder="12040843"
            disabled={busy}
          />
        </label>
        <button type="submit" disabled={busy || matchIds.length >= SEED_COUNT}>
          Ajouter match (POST)
        </button>
      </form>

      {message && <p className="admin-lcq-message">{message}</p>}
      {error && <p className="admin-lcq-error">{error}</p>}

      {scoreboard && (
        <div className="admin-lcq-scoreboard">
          <div className="admin-lcq-title">
            <span>Event {scoreboard.eventId}</span>
            <span className="admin-lcq-title-info">
              {matchIds.length}/{SEED_COUNT} seed(s)
            </span>
          </div>

          <div className="admin-lcq-table-wrap">
            <table className="admin-lcq-table">
              <thead>
                <tr>
                  <th className="col-rank">#</th>
                  <th className="col-player">Runner</th>
                  {seedColumns.map(({ seed, matchId: mid }) => (
                    <th key={seed}>
                      <div className="admin-lcq-match-col">
                        <span className="admin-lcq-seed-label">Seed {seed}</span>
                        {mid != null ? (
                          <>
                            <span className="admin-lcq-match-id">{mid}</span>
                            <button
                              type="button"
                              className="admin-lcq-remove"
                              disabled={busy}
                              onClick={() => handleRemoveMatch(mid)}
                              title={`Retirer le match ${mid}`}
                            >
                              ×
                            </button>
                          </>
                        ) : (
                          <span className="admin-lcq-match-empty">—</span>
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="col-pts">Total</th>
                </tr>
              </thead>
              <tbody>
                {players.length === 0 ? (
                  <tr>
                    <td colSpan={SEED_COUNT + 3} className="admin-lcq-empty-row">
                      Aucun joueur pour le moment. Ajoute un match pour remplir les seeds.
                    </td>
                  </tr>
                ) : (
                  players.map((player, i) => (
                    <tr key={player.uuid}>
                      <td className="col-rank">{i + 1}</td>
                      <td className="col-player">
                        <img src={`https://mc-heads.net/avatar/${player.uuid}/48`} className="player-head" />
                        &nbsp;&nbsp;
                        {player.nickname || player.uuid}
                      </td>
                      {seedColumns.map(({ seed, matchId: mid }) => {
                        const cell = mid != null ? player.matches?.[String(mid)] : null
                        return (
                          <td key={seed} title={cell?.status || ''}>
                            {cell?.diff ?? '—'}
                          </td>
                        )
                      })}
                      <td className="col-pts">{player.total ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminLcq
