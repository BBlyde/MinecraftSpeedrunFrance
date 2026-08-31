import { useEffect, useState } from 'react'

export const S10_RECOMPUTE_PHASES = [
  { key: 'group1', label: 'Groupe 1' },
  { key: 'group2', label: 'Groupe 2' },
  { key: 'semi1', label: 'Demi 1' },
  { key: 'semi2', label: 'Demi 2' },
  { key: 'thirdPlace', label: '3e place' },
  { key: 'final', label: 'Finale' },
]

export const S11_RECOMPUTE_PHASES = [
  { key: 'group1', label: 'LCQ' },
  { key: 'round16', label: 'Huitièmes' },
  { key: 'quarter', label: 'Quarts' },
  { key: 'semi1', label: 'Demi 1' },
  { key: 'semi2', label: 'Demi 2' },
  { key: 'thirdPlace', label: 'Petite finale' },
  { key: 'final', label: 'Finale' },
]

const EMPTY_PHASES = {
  group1: false,
  group2: false,
  round16: false,
  quarter: false,
  semi1: false,
  semi2: false,
  thirdPlace: false,
  final: false,
}

function phasesFromApi(data) {
  const src = data && typeof data === 'object' ? data : {}
  return {
    group1: src.group1 === true,
    group2: src.group2 === true,
    round16: src.round16 === true,
    quarter: src.quarter === true,
    semi1: src.semi1 === true,
    semi2: src.semi2 === true,
    thirdPlace: src.thirdPlace === true,
    final: src.final === true || src.finalPhase === true,
  }
}

function buildPayload(phases) {
  return {
    group1: phases.group1 === true,
    group2: phases.group2 === true,
    round16: phases.round16 === true,
    quarter: phases.quarter === true,
    semi1: phases.semi1 === true,
    semi2: phases.semi2 === true,
    thirdPlace: phases.thirdPlace === true,
    final: phases.final === true,
  }
}

/**
 * @param {{ event: string, phases: Array<{ key: string, label: string }> }} props
 */
export default function AdminPredictionRecompute({ event, phases }) {
  const [recomputePhases, setRecomputePhases] = useState(EMPTY_PHASES)
  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/prediction/${event}/score/recompute`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setRecomputePhases(phasesFromApi(data))
      })
      .catch((err) => console.error('Erreur chargement phases de score', err))
    return () => {
      cancelled = true
    }
  }, [event])

  const togglePhase = (key) => {
    setRecomputePhases((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSubmit = async (submitEvent) => {
    submitEvent.preventDefault()
    if (!window.confirm('Lancer le recompute des scores ? Les phases cochées seront verrouillées.')) {
      return
    }
    setStatus(null)
    setError(null)
    try {
      const res = await fetch(`/api/tournament/${event}/score/recompute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(buildPayload(recomputePhases)),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : `Erreur recompute (${res.status})`)
        return
      }
      const processed = body?.playersProcessed ?? 0
      const updated = body?.updatedRows ?? 0
      setStatus(`Recalcul OK — ${updated}/${processed} pronos mis à jour.`)
    } catch (err) {
      console.error('Erreur recompute scores', err)
      setError('Recompute impossible pour le moment.')
    }
  }

  return (
    <div className="admin-recompute-section">
      <form onSubmit={handleSubmit} className="admin-recompute-form">
        <p className="admin-recompute-hint">
          Coche les phases à scorer et verrouiller, puis valide.
        </p>
        {phases.map(({ key, label }) => (
          <label key={key} className="admin-recompute-label">
            <input
              type="checkbox"
              checked={recomputePhases[key] === true}
              onChange={() => togglePhase(key)}
            />
            {label}
          </label>
        ))}
        <button type="submit">Valider</button>
      </form>
      {status ? <p className="admin-lcq-message">{status}</p> : null}
      {error ? <p className="admin-lcq-error">{error}</p> : null}
    </div>
  )
}
