import { useEffect, useState } from 'react'
import './MrmS11.css'
import { Link } from 'react-router-dom'

const BRACKET_PLACEHOLDER_UUID = '0385'
const LCQ_SEED_COUNT = 8
const LCQ_QUALIFY = 4

function formatLcqDelta(value) {
  if (typeof value === 'string' && value.trim().startsWith('+')) {
    return value.trim()
  }
  const n = Number(value)
  const totalSeconds = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `+${minutes}:${String(seconds).padStart(2, '0')}`
}

function normalizeLcqPlayer(row) {
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
  for (let i = 1; i <= LCQ_SEED_COUNT; i += 1) {
    player[`s${i}`] = num(`s${i}`)
  }
  if (!player.total) {
    player.total = Array.from({ length: LCQ_SEED_COUNT }, (_, i) => player[`s${i + 1}`] ?? 0)
      .reduce((sum, value) => sum + value, 0)
  }
  return player
}

function normalizeLcqFromApi(apiRows) {
  if (!Array.isArray(apiRows)) return []
  return apiRows.map(normalizeLcqPlayer).filter(Boolean)
}

function applyLcqFromTournament(data, setLcqPlayers) {
  const fromApi = normalizeLcqFromApi(data?.lcq ?? data?.group1)
  if (fromApi.length > 0) {
    setLcqPlayers([...fromApi].sort((a, b) => Number(a.total) - Number(b.total)))
  }
}

function BracketSlot({ player }) {
  const uuid = player?.id || BRACKET_PLACEHOLDER_UUID
  const name = player?.name || ''
  const score = player?.score ?? '0'
  return (
    <div className="player">
      <div className="player-info">
        <img src={`https://mc-heads.net/avatar/${uuid}/48`} className="player-head" width={24} height={24} />
        <span className='player-name'>{name ? name : 'TBD'}</span>
      </div>
      <span className="player-score">{score}</span>
    </div>
  )
}

function MrmS11() {
  const [mrmData, setMrmData] = useState(null)
  const [lcqPlayers, setLcqPlayers] = useState([])

  useEffect(() => {
    fetch('/api/tournament/mrm11')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return
        setMrmData(data)
        applyLcqFromTournament(data, setLcqPlayers)
      })
      .catch((err) => console.error('Erreur chargement données MRM S11', err))

    const ws = new WebSocket('wss://back.mcsr-game.com/ws/tournament')

    ws.onopen = () => console.log('WebSocket connectée')

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        const hasLcq = Array.isArray(data?.lcq)
        const hasS11Bracket = Boolean(data?.bracket?.round16)
        if (!hasLcq && !hasS11Bracket) return
        setMrmData((prev) => ({
          ...(prev ?? {}),
          ...data,
          lcq: hasLcq ? data.lcq : prev?.lcq,
          bracket: data.bracket ?? prev?.bracket,
        }))
        if (hasLcq) applyLcqFromTournament(data, setLcqPlayers)
      } catch (err) {
        console.error('WebSocket message MRM S11', err)
      }
    }

    ws.onerror = (err) => console.error('WebSocket erreur MRM S11', err)

    return () => {
      ws.close()
    }
  }, [])

  const bracket = mrmData?.bracket
  const round16 = bracket?.round16 ?? []
  const quarterFinal = bracket?.quarter ?? []
  const semiFinal = [
    [bracket?.semi?.[0], bracket?.semi?.[1]],
    [bracket?.semi?.[2], bracket?.semi?.[3]],
  ]
  return (
    <div className="mrm-s11 mrm-prediction-content-wrap">
      <div className="container">
        <div className="container-first">
          <div className="mrm-playoffs">
            <h2 className="playoffs-title">ARBRE PRINCIPAL</h2>
            <div className="main-bracket">
              <div className="bracket-round bracket-round-16">
                <div className="round-label">HUITIÈMES</div>
                <div className="bracket-round-body">
                  <div className="bracket-column">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div className="bracket-slot" key={i}>
                        <div className="match">
                          <BracketSlot player={round16[i]?.[0]} />
                          <BracketSlot player={round16[i]?.[1]} />
                        </div>
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
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div className="bracket-slot" key={i}>
                        <div className="match">
                          <BracketSlot player={quarterFinal[i]?.[0]} />
                          <BracketSlot player={quarterFinal[i]?.[1]} />
                        </div>
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
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div className="bracket-slot" key={i}>
                        <div className="match">
                          <BracketSlot player={semiFinal[i]?.[0]} />
                          <BracketSlot player={semiFinal[i]?.[1]} />
                        </div>
                      </div>
                    ))}
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
                      <div className="match match-final">
                        <BracketSlot player={bracket?.final?.[0]} />
                        <BracketSlot player={bracket?.final?.[1]} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bracket-third-place">
                  <svg className="third-place-connector" width="2" height="32" viewBox="0 0 2 32" aria-hidden="true">
                    <line x1="1" y1="0" x2="1" y2="32" stroke="#3a3a3a" strokeWidth="2" strokeDasharray="5 3" />
                  </svg>
                  <div className="match match-third-place">
                    <BracketSlot player={bracket?.lower?.[0]} />
                    <BracketSlot player={bracket?.lower?.[1]} />
                  </div>
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
                  <img src={`https://mc-heads.net/avatar/${BRACKET_PLACEHOLDER_UUID}/48`} className="player-head" />
                </div>
                <div className="podium-name">TBD</div>
                <div className="podium-block podium-block-second">
                  <span className="podium-rank">2</span>
                </div>
              </div>
              <div className="podium-player podium-first">
                <div className="podium-head">
                  <img src={`https://mc-heads.net/avatar/${BRACKET_PLACEHOLDER_UUID}/48`} className="player-head" />
                </div>
                <div className="podium-name">TBD</div>
                <div className="podium-block podium-block-first">
                  <span className="podium-rank">1</span>
                </div>
              </div>
              <div className="podium-player podium-third">
                <div className="podium-head">
                  <img src={`https://mc-heads.net/avatar/${BRACKET_PLACEHOLDER_UUID}/48`} className="player-head" />
                </div>
                <div className="podium-name">TBD</div>
                <div className="podium-block podium-block-third">
                  <span className="podium-rank">3</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="container-second">
          <div className="mrm-groups">
            <h2 className="playoffs-title">LAST CHANCE QUALIFIER</h2>
            <div className="group-table group-table-lcq">
              <div className="group-title">LCQ</div>
              <div className="group-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th className="col-rank">#</th>
                      <th className="col-player">Runner</th>
                      {Array.from({ length: LCQ_SEED_COUNT }, (_, i) => <th key={i}>S{i + 1}</th>)}
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lcqPlayers.map((player, i) => (
                      <tr key={player.uuid || player.name || i} className={i < LCQ_QUALIFY ? 'row-qualify' : ''}>
                        <td className="col-rank">{i + 1}</td>
                        <td className="col-player">
                          <img
                            src={`https://mc-heads.net/avatar/${player.uuid || BRACKET_PLACEHOLDER_UUID}/48`}
                            className="player-head"
                            alt=""
                          />
                          &nbsp;
                          &nbsp;
                          {player.name}
                        </td>
                        {Array.from({ length: LCQ_SEED_COUNT }, (_, seed) => (
                          <td key={seed}>{formatLcqDelta(player[`s${seed + 1}`])}</td>
                        ))}
                        <td className="col-pts">{formatLcqDelta(player.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="section-divider" />

        <div className="container-third">
          <div className="rules-panel">
            <div className="rules-panel-header">QUALIFICATION</div>
            <div className="rules-panel-body">
              <div className="rules-row">
                <i className="bi bi-bar-chart-fill rules-icon" />
                <span>La qualification aux MRM s'effectue en finissant parmi les 12 plus hauts élos au <Link to="/ranked" className="rules-link">classement Ranked MSF</Link> à la toute fin de la saison de MCSR Ranked</span>
              </div>
              <div className="rules-row">
                <i className="bi bi-calendar-check rules-icon" />
                <span>Un Last Chance Qualifier aura lieu le <span className="rules-highlight">26 Septembre 2026</span> à partir de <span className="rules-highlight">14h</span> (fuseau horaire de Paris), permettant aux <span className="rules-highlight">4</span> meilleurs runners d'être <span className="rules-highlight">repêchés</span> pour intégrer l'arbre principal</span>
              </div>
            </div>
          </div>

          <div className="rules-panel">
            <div className="rules-panel-header">LAST CHANCE QUALIFIER</div>
            <div className="rules-panel-body">
              <div className="rules-row">
                <i className="bi bi-check-circle-fill rules-icon" />
                <span>Le LCQ est accessible à tous les joueurs ranked <span className="rules-highlight">francophones</span> ayant atteint au moins une fois le rank <span className="rules-highlight">diamant</span> (1500 élo), visible avec le badge sur le classement</span>
              </div>
              <div className="rules-row">
                <i className="bi bi-stopwatch rules-icon" />
                <span>Dans un format de <span className="rules-highlight">8 seeds</span>, le <span className="rules-highlight">delta</span> du temps final de chacun sera accumulé à partir du premier à terminer la seed et avec un délai maximum de <span className="rules-highlight">5 minutes</span> pour compléter la seed</span>
              </div>
              <div className="rules-row">
                <i className="bi bi-people-fill rules-icon" />
                <span> Avant de commencer le tournoi principal, un système de <span className="rules-highlight">draft</span> sera mis en place. Les <span className="rules-highlight">8 premiers</span> qualifiés avec l'élo choisiront dans l'ordre leurs adversaires parmi les <span className="rules-highlight">8 joueurs</span> restants</span>
              </div>
            </div>
          </div>

          <div className="rules-panel">
            <div className="rules-panel-header">ARBRE PRINCIPAL</div>
            <div className="rules-panel-body">
              <div className="rules-row">
                <i className="bi bi-intersect rules-icon" />
                <span>La phase de l'arbre se déroulera les <span className="rules-highlight">03 et 04 octobre 2026</span> à partir de <span className="rules-highlight">13h</span> à la suite des playoffs internationaux, afin de permettre à chacun de pouvoir suivre les deux tournois</span>
              </div>
              <div className="rules-row">
                <i className="bi bi-trophy-fill rules-icon" />
                <span>L'arbre est <span className="rules-highlight">à élimination directe</span>, il n'y a pas de lower bracket. Tous les matchs jusqu'aux quarts se joueront en <span className="rules-highlight">BO3</span>. Les demi-finales, petite finale et grande finale se dérouleront eux en <span className="rules-highlight">BO5</span></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MrmS11
