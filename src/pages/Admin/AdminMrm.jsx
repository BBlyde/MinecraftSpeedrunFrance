import { useEffect, useState } from 'react'
import PlayerForm from './components/PlayerForm'

function buildPlayersPayload(formDataObj) {
  const players = {}
  for (const [key, value] of Object.entries(formDataObj)) {
    const match = key.match(/^(player\d+)-(.+)$/)
    if (!match) continue
    const [, playerKey, field] = match
    if (!players[playerKey]) players[playerKey] = {}
    players[playerKey][field] = value
  }
  return Object.values(players)
}

function buildBracketPayload(formDataObj) {
  const matches = {}
  for (const [key, value] of Object.entries(formDataObj)) {
    const match = key.match(/^(player\d+)-(semi|lower|final)-(name|id|score)$/)
    if (!match) continue
    const [, playerKey, matchType, field] = match
    if (!matches[matchType]) matches[matchType] = {}
    if (!matches[matchType][playerKey]) matches[matchType][playerKey] = {}
    matches[matchType][playerKey][field] = value
  }
  return Object.fromEntries(
    Object.entries(matches).map(([matchType, players]) => [matchType, Object.values(players)]),
  )
}

async function postJson(url, payload, errorLabel) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    console.error(errorLabel, await res.text())
    return false
  }

  return true
}

const playerFields = [1, 2, 3, 4, 5, 6, 7, 8]

const RECOMPUTE_PHASES = [
  { key: 'group1', label: 'Groupe 1' },
  { key: 'group2', label: 'Groupe 2' },
  { key: 'semi1', label: 'Demi 1' },
  { key: 'semi2', label: 'Demi 2' },
  { key: 'thirdPlace', label: '3e place' },
  { key: 'final', label: 'Finale' },
]

const DEFAULT_RECOMPUTE_PHASES = {
  group1: false,
  group2: false,
  semi1: false,
  semi2: false,
  thirdPlace: false,
  final: false,
}

function AdminMrm() {
  const [mrmData, setMrmData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recomputePhases, setRecomputePhases] = useState(DEFAULT_RECOMPUTE_PHASES)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    fetch('/api/tournament/mrm')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setMrmData(data)
      })
      .catch((err) => console.error('Erreur chargement données MRM', err))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const formKey = mrmData ? 'loaded' : 'loading'
  const bracket = mrmData?.bracket

  const handleGroup1Submit = async (event) => {
    event.preventDefault()
    if (!window.confirm('Confirmer la mise à jour du Groupe 1 ?')) return

    const formDataObj = Object.fromEntries(new FormData(event.currentTarget).entries())
    const payload = buildPlayersPayload(formDataObj)
    await postJson('/api/tournament/mrm/group1', payload, 'Erreur envoi groupe 1')
  }

  const handleGroup2Submit = async (event) => {
    event.preventDefault()
    if (!window.confirm('Confirmer la mise à jour du Groupe 2 ?')) return

    const formDataObj = Object.fromEntries(new FormData(event.currentTarget).entries())
    const payload = buildPlayersPayload(formDataObj)
    await postJson('/api/tournament/mrm/group2', payload, 'Erreur envoi groupe 2')
  }

  const handleBracketSubmit = async (event) => {
    event.preventDefault()
    if (!window.confirm('Confirmer la mise à jour du Bracket ?')) return

    const formDataObj = Object.fromEntries(new FormData(event.currentTarget).entries())
    const payload = buildBracketPayload(formDataObj)
    await postJson('/api/tournament/mrm/bracket', payload, 'Erreur envoi bracket')
  }

  const handleRecomputeSubmit = async (event) => {
    event.preventDefault()
    if (!window.confirm('Lancer le recompute des scores ?')) return
    await postJson('/api/tournament/mrm/score/recompute', recomputePhases, 'Erreur recompute scores')
  }

  const toggleRecomputePhase = (key) => {
    setRecomputePhases((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  if (loading) {
    return <span className="info">Chargement...</span>
  }

  return (
    <>
      <div className="group-section">
        <div className="group-header">
          <span>Groupe 1</span>
          <span>Nom</span>
          <span>Id</span>
          <span>Seed 1</span>
          <span>Seed 2</span>
          <span>Seed 3</span>
          <span>Seed 4</span>
          <span>Seed 5</span>
          <span>Seed 6</span>
          <span>Total</span>
        </div>
        <form onSubmit={handleGroup1Submit} className="form-mrm-1" key={formKey + '-g1'}>
          {playerFields.map((playerNumber) => (
            <PlayerForm
              key={playerNumber}
              playerNumber={playerNumber}
              player={mrmData?.group1[playerNumber - 1]}
            />
          ))}
          <button type="submit">Valider</button>
        </form>
      </div>

      <div className="group-section">
        <div className="group-header">
          <span>Groupe 2</span>
          <span>Nom</span>
          <span>Id</span>
          <span>Seed 1</span>
          <span>Seed 2</span>
          <span>Seed 3</span>
          <span>Seed 4</span>
          <span>Seed 5</span>
          <span>Seed 6</span>
          <span>Total</span>
        </div>
        <form onSubmit={handleGroup2Submit} className="form-mrm-2" key={formKey + '-g2'}>
          {playerFields.map((playerNumber) => (
            <PlayerForm
              key={playerNumber}
              playerNumber={playerNumber}
              player={mrmData?.group2[playerNumber - 1]}
            />
          ))}
          <button type="submit">Valider</button>
        </form>
      </div>

      <div className="bracket-section">
        <form onSubmit={handleBracketSubmit} className="form-bracket" key={formKey + '-bracket'}>
          <div className="admin-match">
            <span className="match-label">DEMIE 1</span>
            <div className="player-name">
              <input
                id="player1-semi-name"
                name="player1-semi-name"
                className="player-field"
                placeholder="Name"
                defaultValue={bracket?.semi[0]?.name ?? ''}
              />
            </div>
            <div className="player-id">
              <input
                id="player1-semi-id"
                name="player1-semi-id"
                className="player-field"
                placeholder="ID"
                defaultValue={bracket?.semi[0]?.id ?? ''}
              />
            </div>
            <input
              type="number"
              min="0"
              max="2"
              id="player1-semi-score"
              name="player1-semi-score"
              placeholder="0"
              defaultValue={bracket?.semi[0]?.score ?? '0'}
            />
            VS
            <div className="player-name">
              <input
                id="player2-semi-name"
                name="player2-semi-name"
                className="player-field"
                placeholder="Name"
                defaultValue={bracket?.semi[1]?.name ?? ''}
              />
            </div>
            <div className="player-id">
              <input
                id="player2-semi-id"
                name="player2-semi-id"
                className="player-field"
                placeholder="ID"
                defaultValue={bracket?.semi[1]?.id ?? ''}
              />
            </div>
            <input
              type="number"
              min="0"
              max="2"
              id="player2-semi-score"
              name="player2-semi-score"
              placeholder="0"
              defaultValue={bracket?.semi[1]?.score ?? '0'}
            />
          </div>

          <div className="admin-match">
            <span className="match-label">DEMIE 2</span>
            <div className="player-name">
              <input
                id="player3-semi-name"
                name="player3-semi-name"
                className="player-field"
                placeholder="Name"
                defaultValue={bracket?.semi[2]?.name ?? ''}
              />
            </div>
            <div className="player-id">
              <input
                id="player3-semi-id"
                name="player3-semi-id"
                className="player-field"
                placeholder="ID"
                defaultValue={bracket?.semi[2]?.id ?? ''}
              />
            </div>
            <input
              type="number"
              min="0"
              max="2"
              id="player3-semi-score"
              name="player3-semi-score"
              placeholder="0"
              defaultValue={bracket?.semi[2]?.score ?? '0'}
            />
            VS
            <div className="player-name">
              <input
                id="player4-semi-name"
                name="player4-semi-name"
                className="player-field"
                placeholder="Name"
                defaultValue={bracket?.semi[3]?.name ?? ''}
              />
            </div>
            <div className="player-id">
              <input
                id="player4-semi-id"
                name="player4-semi-id"
                className="player-field"
                placeholder="ID"
                defaultValue={bracket?.semi[3]?.id ?? ''}
              />
            </div>
            <input
              type="number"
              min="0"
              max="2"
              id="player4-semi-score"
              name="player4-semi-score"
              placeholder="0"
              defaultValue={bracket?.semi[3]?.score ?? '0'}
            />
          </div>

          <div className="admin-match">
            <span className="match-label">LOWER</span>
            <div className="player-name">
              <input
                id="player1-lower-name"
                name="player1-lower-name"
                className="player-field"
                placeholder="Name"
                defaultValue={bracket?.lower[0]?.name ?? ''}
              />
            </div>
            <div className="player-id">
              <input
                id="player1-lower-id"
                name="player1-lower-id"
                className="player-field"
                placeholder="ID"
                defaultValue={bracket?.lower[0]?.id ?? ''}
              />
            </div>
            <input
              type="number"
              min="0"
              max="2"
              id="player1-lower-score"
              name="player1-lower-score"
              placeholder="0"
              defaultValue={bracket?.lower[0]?.score ?? '0'}
            />
            VS
            <div className="player-name">
              <input
                id="player2-lower-name"
                name="player2-lower-name"
                className="player-field"
                placeholder="Name"
                defaultValue={bracket?.lower[1]?.name ?? ''}
              />
            </div>
            <div className="player-id">
              <input
                id="player2-lower-id"
                name="player2-lower-id"
                className="player-field"
                placeholder="ID"
                defaultValue={bracket?.lower[1]?.id ?? ''}
              />
            </div>
            <input
              type="number"
              min="0"
              max="2"
              id="player2-lower-score"
              name="player2-lower-score"
              placeholder="0"
              defaultValue={bracket?.lower[1]?.score ?? '0'}
            />
          </div>

          <div className="admin-match">
            <span className="match-label">FINALE</span>
            <div className="player-name">
              <input
                id="player1-final-name"
                name="player1-final-name"
                className="player-field"
                placeholder="Name"
                defaultValue={bracket?.final[0]?.name ?? ''}
              />
            </div>
            <div className="player-id">
              <input
                id="player1-final-id"
                name="player1-final-id"
                className="player-field"
                placeholder="ID"
                defaultValue={bracket?.final[0]?.id ?? ''}
              />
            </div>
            <input
              type="number"
              min="0"
              max="3"
              id="player1-final-score"
              name="player1-final-score"
              placeholder="0"
              defaultValue={bracket?.final[0]?.score ?? '0'}
            />
            VS
            <div className="player-name">
              <input
                id="player2-final-name"
                name="player2-final-name"
                className="player-field"
                placeholder="Name"
                defaultValue={bracket?.final[1]?.name ?? ''}
              />
            </div>
            <div className="player-id">
              <input
                id="player2-final-id"
                name="player2-final-id"
                className="player-field"
                placeholder="ID"
                defaultValue={bracket?.final[1]?.id ?? ''}
              />
            </div>
            <input
              type="number"
              min="0"
              max="3"
              id="player2-final-score"
              name="player2-final-score"
              placeholder="0"
              defaultValue={bracket?.final[1]?.score ?? '0'}
            />
          </div>
          <button type="submit">Valider</button>
        </form>
      </div>

      <div className="admin-recompute-section">
        <form onSubmit={handleRecomputeSubmit} className="admin-recompute-form">
          {RECOMPUTE_PHASES.map(({ key, label }) => (
            <label key={key} className="admin-recompute-label">
              <input
                type="checkbox"
                checked={recomputePhases[key]}
                onChange={() => toggleRecomputePhase(key)}
              />
              {label}
            </label>
          ))}
          <button type="submit">Valider</button>
        </form>
      </div>
    </>
  )
}

export default AdminMrm
