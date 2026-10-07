import { useEffect, useState } from 'react'
import './MrmS11.css'
import { Link } from 'react-router-dom'
import { TOURNAMENT_WS_URL, usePersistentWebSocket } from '../../../utils/usePersistentWebSocket'
import { lcqEightSeedsEntered, lcqTotalFromSeeds, lcqWorstSeedIndex, LCQ_SEED_COUNT } from '../../../utils/lcqScoring'
import { minecraftHeadIdentifier, minecraftHeadUrl } from '../../../utils/minecraftHead'
const LCQ_QUALIFY = 4

function formatLcqDelta(value) {
  if (typeof value === 'string' && value.trim().startsWith('+')) {
    const delta = value.trim()
    return delta === '+5:00' ? '+5' : delta
  }
  const n = Number(value)
  const ms = Number.isFinite(n) ? Math.max(0, n) : 0
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const delta = `+${minutes}:${String(seconds).padStart(2, '0')}`
  return delta === '+5:00' ? '+5' : delta
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
  const players = apiRows.map(normalizeLcqPlayer).filter(Boolean)
  const dropWorst = lcqEightSeedsEntered(players)
  return players.map((player) => ({
    ...player,
    total: lcqTotalFromSeeds(player, { dropWorst }),
    droppedSeed: dropWorst ? lcqWorstSeedIndex(player) : null,
  }))
}

function applyLcqFromTournament(data, setLcqPlayers) {
  const fromApi = normalizeLcqFromApi(data?.lcq ?? data?.group1)
  if (fromApi.length > 0) {
    setLcqPlayers([...fromApi].sort((a, b) => Number(a.total) - Number(b.total)))
  }
}

function BracketSlot({ player, winner = false, loser = false }) {
  const name = player?.name || ''
  const score = player?.score ?? '0'
  return (
    <div className={`player${loser ? ' player-loser' : ''}`}>
      <div className="player-info">
        <img src={minecraftHeadUrl(minecraftHeadIdentifier(player?.id, name), 64)} className="player-head" width={24} height={24} />
        <span className={`player-name${winner ? ' player-name-winner' : ''}`}>{name ? name : 'TBD'}</span>
      </div>
      <span className={`player-score${winner ? ' player-score-winner' : ''}`}>{score}</span>
    </div>
  )
}

/** Match `index` d'un round. Le backend envoie soit des matchs `[[a, b], ...]`, soit une liste plate de joueurs. */
function matchAt(round, index) {
  if (!Array.isArray(round)) return [null, null]
  if (Array.isArray(round[0])) {
    const match = round[index]
    return Array.isArray(match) ? [match[0] ?? null, match[1] ?? null] : [null, null]
  }
  return [round[index * 2] ?? null, round[index * 2 + 1] ?? null]
}

const FINAL_WINS = 3

function namedPlayer(player) {
  const name = typeof player?.name === 'string' ? player.name.trim() : ''
  return name ? player : null
}

function matchWinner(match, winsNeeded) {
  const left = namedPlayer(match?.[0])
  const right = namedPlayer(match?.[1])
  if (!left || !right) return null
  const leftScore = Number(left.score)
  const rightScore = Number(right.score)
  if (!Number.isFinite(leftScore) || !Number.isFinite(rightScore)) return null
  if (leftScore >= winsNeeded && leftScore > rightScore) return left
  if (rightScore >= winsNeeded && rightScore > leftScore) return right
  return null
}

function isMatchWinner(match, index) {
  if (!match?.[0] || !match?.[1]) return false
  const opponentIndex = index === 0 ? 1 : 0
  return Number(match[index].score) > Number(match[opponentIndex].score)
}

function isMatchLoser(match, index) {
  if (!match?.[0] || !match?.[1]) return false
  const opponentIndex = index === 0 ? 1 : 0
  const score = Number(match[index].score)
  const opponentScore = Number(match[opponentIndex].score)
  return Number.isFinite(score) && Number.isFinite(opponentScore) && score < opponentScore
}

function matchLoser(match, winsNeeded) {
  const winner = matchWinner(match, winsNeeded)
  if (!winner) return null
  const left = namedPlayer(match?.[0])
  const right = namedPlayer(match?.[1])
  return left === winner ? right : left
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
  }, [])

  usePersistentWebSocket(TOURNAMENT_WS_URL, (data) => {
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
  })

  const bracket = mrmData?.bracket
  const round16 = Array.from({ length: 8 }, (_, i) => matchAt(bracket?.round16, i))
  const quarterFinal = Array.from({ length: 4 }, (_, i) => matchAt(bracket?.quarter, i))
  const semiFinal = Array.from({ length: 2 }, (_, i) => matchAt(bracket?.semi, i))
  const finalMatch = matchAt(bracket?.final, 0)
  const lowerMatch = matchAt(bracket?.lower, 0)
  const finalWinner = matchWinner(finalMatch, FINAL_WINS)
  const finalLoser = matchLoser(finalMatch, FINAL_WINS)
  const lowerWinner = matchWinner(lowerMatch, FINAL_WINS)
  const lcqSeedRankings = Array.from({ length: LCQ_SEED_COUNT }, (_, seed) => {
    const rankedPlayers = lcqPlayers
      .map((player, index) => ({ index, time: Number(player[`s${seed + 1}`]) || 0 }))
      .sort((left, right) => left.time - right.time || left.index - right.index)
    return new Map(rankedPlayers.map(({ index }, rank) => [index, rank + 1]))
  })

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
                          <BracketSlot player={round16[i]?.[0]} winner={isMatchWinner(round16[i], 0)} loser={isMatchLoser(round16[i], 0)} />
                          <BracketSlot player={round16[i]?.[1]} winner={isMatchWinner(round16[i], 1)} loser={isMatchLoser(round16[i], 1)} />
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
                          <BracketSlot player={quarterFinal[i]?.[0]} winner={isMatchWinner(quarterFinal[i], 0)} loser={isMatchLoser(quarterFinal[i], 0)} />
                          <BracketSlot player={quarterFinal[i]?.[1]} winner={isMatchWinner(quarterFinal[i], 1)} loser={isMatchLoser(quarterFinal[i], 1)} />
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
                          <BracketSlot player={semiFinal[i]?.[0]} winner={isMatchWinner(semiFinal[i], 0)} loser={isMatchLoser(semiFinal[i], 0)} />
                          <BracketSlot player={semiFinal[i]?.[1]} winner={isMatchWinner(semiFinal[i], 1)} loser={isMatchLoser(semiFinal[i], 1)} />
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
                        <BracketSlot player={finalMatch[0]} winner={isMatchWinner(finalMatch, 0)} loser={isMatchLoser(finalMatch, 0)} />
                        <BracketSlot player={finalMatch[1]} winner={isMatchWinner(finalMatch, 1)} loser={isMatchLoser(finalMatch, 1)} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bracket-third-place">
                  <svg className="third-place-connector" width="2" height="32" viewBox="0 0 2 32" aria-hidden="true">
                    <line x1="1" y1="0" x2="1" y2="32" stroke="#3a3a3a" strokeWidth="2" strokeDasharray="5 3" />
                  </svg>
                  <div className="match match-third-place">
                    <BracketSlot player={lowerMatch[0]} winner={isMatchWinner(lowerMatch, 0)} loser={isMatchLoser(lowerMatch, 0)} />
                    <BracketSlot player={lowerMatch[1]} winner={isMatchWinner(lowerMatch, 1)} loser={isMatchLoser(lowerMatch, 1)} />
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
                  <img src={minecraftHeadUrl(minecraftHeadIdentifier(finalLoser?.id, finalLoser?.name), 64)} className="player-head" alt="" />
                </div>
                <div className="podium-name">{finalLoser?.name ?? 'TBD'}</div>
                <div className="podium-block podium-block-second">
                  <span className="podium-rank">2</span>
                </div>
              </div>
              <div className="podium-player podium-first">
                <div className="podium-head podium-head-winner">
                  {finalWinner && (
                    <svg className="podium-crown" viewBox="1.5 0 48 20" role="img" aria-label="Couronne du champion" shapeRendering="crispEdges">
                      <path d="M3 14V6H6V9H9V11H12V12H14V5H17V8H19V9H22V5H24V2H26V5H29V9H31V8H34V5H36V12H39V11H42V9H45V6H48V14H45V18H6V14Z" fill="#F5B91B" />
                      <path d="M3 14H48V18H3Z" fill="#C78313" />
                      <path d="M7 14H41V16H7Z" fill="#FFE58A" />
                      <path d="M10 12H12V14H10ZM23 7H25V9H23ZM36 12H38V14H36Z" fill="#E85D5D" />
                    </svg>
                  )}
                  <img src={minecraftHeadUrl(minecraftHeadIdentifier(finalWinner?.id, finalWinner?.name), 64)} className="player-head" alt="" />
                </div>
                <div className="podium-name">{finalWinner?.name ?? 'TBD'}</div>
                <div className="podium-block podium-block-first">
                  <span className="podium-rank">1</span>
                </div>
              </div>
              <div className="podium-player podium-third">
                <div className="podium-head">
                  <img src={minecraftHeadUrl(minecraftHeadIdentifier(lowerWinner?.id, lowerWinner?.name), 64)} className="player-head" alt="" />
                </div>
                <div className="podium-name">{lowerWinner?.name ?? 'TBD'}</div>
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
              <div className="group-title">&nbsp;</div>
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
                            src={minecraftHeadUrl(minecraftHeadIdentifier(player.uuid, player.name), 64)}
                            className="player-head"
                            alt=""
                          />
                          &nbsp;
                          &nbsp;
                          {player.name}
                        </td>
                        {Array.from({ length: LCQ_SEED_COUNT }, (_, seed) => {
                          const seedRank = lcqSeedRankings[seed].get(i)
                          const delta = formatLcqDelta(player[`s${seed + 1}`])
                          const placeClass = seedRank <= 3 ? `lcq-place-${seedRank}` : ''
                          const isDropped = player.droppedSeed === seed

                          return (
                            <td
                              key={seed}
                              className={placeClass || undefined}
                              title={isDropped ? 'Pire seed ignorée' : undefined}
                            >
                              <span className={isDropped ? 'is-dropped' : undefined}>
                                {seedRank === 1 && delta === '+0:00' ? '+0' : delta}
                              </span>
                            </td>
                          )
                        })}
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
                <span>La qualification aux MRM s'effectue en finissant parmi les 12 plus hauts élos au <Link to="/leaderboard/ranked" className="rules-link">classement Ranked MSF</Link> à la toute fin de la saison de MCSR Ranked</span>
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
                <span>Dans un format de <span className="rules-highlight">8 seeds</span>, le <span className="rules-highlight">delta</span> du temps final de chacun sera accumulé à partir du premier à terminer la seed, avec un délai maximum de <span className="rules-highlight">5 minutes</span> pour compléter la seed. Une fois les 8 seeds jouées, la <span className="rules-highlight">pire seed</span> de chaque runner est retirée du total</span>
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
