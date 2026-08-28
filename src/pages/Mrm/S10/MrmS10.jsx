import { useEffect, useState } from 'react'
import './MrmS10.css'
import { Link } from 'react-router-dom'

const BRACKET_PLACEHOLDER_UUID = '0385'

function BracketSlot({ player, winner = false }) {
  const uuid = player?.id || BRACKET_PLACEHOLDER_UUID
  const name = player?.name || ''
  const score = player?.score ?? '0'
  return (
    <div className="player">
      <div className="player-info">
        <img src={`https://mc-heads.net/avatar/${uuid}/48`} className="player-head" width={24} height={24} />
        <span className='player-name'>{name ? name : 'TBD'}</span>
      </div>
      <span className={`player-score${winner ? ' player-score-winner' : ''}`}>{score}</span>
    </div>
  )
}

function getMatchWinner(match, requiredScore) {
  if (!match?.[0] || !match?.[1]) return null
  const s0 = Number(match[0].score), s1 = Number(match[1].score)
  if (s0 < requiredScore && s1 < requiredScore) return null
  return s0 > s1 ? match[0] : match[1]
}

function getMatchLoser(match, requiredScore) {
  if (!match?.[0] || !match?.[1]) return null
  const s0 = Number(match[0].score), s1 = Number(match[1].score)
  if (s0 < requiredScore && s1 < requiredScore) return null
  return s0 < s1 ? match[0] : match[1]
}

function isMatchWinner(match, index) {
  if (!match?.[0] || !match?.[1]) return false
  return Number(match[index].score) > Number(match[index === 0 ? 1 : 0].score)
}

function MrmS10() {
  const [mrmData, setMrmData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/tournament/mrm')
      .then((res) => res.json())
      .then((data) => setMrmData(data))
      .catch((err) => console.error('Erreur chargement données MRM', err))
      .finally(() => setLoading(false))

    const ws = new WebSocket('wss://back.mcsr-game.com/ws/tournament')

    ws.onopen = () => console.log('WebSocket connectée')

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      setMrmData(data)
    }

    ws.onerror = (err) => console.error('WebSocket erreur MRM', err)

    return () => {
      ws.close()
    }
  }, [])

  const group1 = [...(mrmData?.group1 ?? [])].sort((a, b) => Number(b.total) - Number(a.total))
  const group2 = [...(mrmData?.group2 ?? [])].sort((a, b) => Number(b.total) - Number(a.total))

  const bracket = mrmData?.bracket
  const finalWinner = getMatchWinner(bracket?.final, 3)
  const finalLoser = getMatchLoser(bracket?.final, 3)
  const lowerWinner = getMatchWinner(bracket?.lower, 2)

  return (
    <div className="mrm-prediction-content-wrap">
      <div className="container">
        <div className="container-first">
          <div className="mrm-playoffs">
            <h2 className="playoffs-title">PHASE FINALE</h2>
            <div className="bracket">
              <div className="bracket-labels">
                <div className="round-label">DEMI-FINALE 1</div>
                <div className="round-label-spacer" />
                <div className="round-label round-label-finale">FINALE</div>
                <div className="round-label-spacer" />
                <div className="round-label">DEMI-FINALE 2</div>
              </div>
              <div className="bracket-matches">
                <div className="match">
                  <BracketSlot player={bracket?.semi?.[0]} winner={isMatchWinner(bracket?.semi, 0)} />
                  <BracketSlot player={bracket?.semi?.[1]} winner={isMatchWinner(bracket?.semi, 1)} />
                </div>
                <div className="connector connector-left" />
                <div className="match match-final">
                  <BracketSlot player={bracket?.final?.[0]} winner={isMatchWinner(bracket?.final, 0)} />
                  <BracketSlot player={bracket?.final?.[1]} winner={isMatchWinner(bracket?.final, 1)} />
                </div>
                <div className="connector connector-right" />
                <div className="match">
                  <BracketSlot player={bracket?.semi?.[2]} winner={isMatchWinner(bracket?.semi?.slice(2), 0)} />
                  <BracketSlot player={bracket?.semi?.[3]} winner={isMatchWinner(bracket?.semi?.slice(2), 1)} />
                </div>
              </div>
              <div className="third-place-wrapper">
                <svg className="third-place-connectors" width="546" height="95" viewBox="0 0 546 95" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M 173 0 L 174 88 L 198 88" stroke="#3a3a3a" strokeWidth="2" strokeDasharray="5 3" fill="none" />
                  <path d="M 373 0 L 372 88 L 348 88" stroke="#3a3a3a" strokeWidth="2" strokeDasharray="5 3" fill="none" />
                </svg>
                <div className="bracket-third-place">
                  <div className="round-label round-label-third">PETITE FINALE</div>
                  <div className="match match-third-place">
                    <BracketSlot player={bracket?.lower?.[0]} winner={isMatchWinner(bracket?.lower, 0)} />
                    <BracketSlot player={bracket?.lower?.[1]} winner={isMatchWinner(bracket?.lower, 1)} />
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
                  <img src={`https://mc-heads.net/avatar/${finalLoser?.id ?? BRACKET_PLACEHOLDER_UUID}/48`} className="player-head" />
                </div>
                <div className="podium-name">{finalLoser?.name ?? 'TBD'}</div>
                <div className="podium-block podium-block-second">
                  <span className="podium-rank">2</span>
                </div>
              </div>
              <div className="podium-player podium-first">
                <div className="podium-head">
                  <img src={`https://mc-heads.net/avatar/${finalWinner?.id ?? BRACKET_PLACEHOLDER_UUID}/48`} className="player-head" />
                </div>
                <div className="podium-name">{finalWinner?.name ?? 'TBD'}</div>
                <div className="podium-block podium-block-first">
                  <span className="podium-rank">1</span>
                </div>
              </div>
              <div className="podium-player podium-third">
                <div className="podium-head">
                  <img src={`https://mc-heads.net/avatar/${lowerWinner?.id ?? BRACKET_PLACEHOLDER_UUID}/48`} className="player-head" />
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
            <h2 className="playoffs-title">PHASE DE GROUPES</h2>
            <div className="groups-wrapper">
              <div className="group-table group-table-1">
                <div className="group-table-scroll">
                  <div className="group-title group-title-1">GROUPE 1</div>
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
                      {group1.map((player, i) => (
                        <tr key={i} className={i < 2 ? 'row-qualify' : ''}>
                          <td className="col-rank">{i + 1}</td>
                          <td className="col-player">
                            <img src={`https://mc-heads.net/avatar/${player.uuid}/48`} className="player-head" />
                            &nbsp;
                            &nbsp;
                            {player.name}
                          </td>
                          <td>{player.s1}</td>
                          <td>{player.s2}</td>
                          <td>{player.s3}</td>
                          <td>{player.s4}</td>
                          <td>{player.s5}</td>
                          <td>{player.s6}</td>
                          <td className="col-pts">{player.total}</td>
                        </tr>
                      ))}
                      {!loading && group1.length === 0 && (
                        <tr>
                          <td colSpan="9" className="col-player">Aucune donnée</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="group-table group-table-2">
                <div className="group-table-scroll">
                  <div className="group-title group-title-2">GROUPE 2</div>
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
                      {group2.map((player, i) => (
                        <tr key={i} className={i < 2 ? 'row-qualify' : ''}>
                          <td className="col-rank">{i + 1}</td>
                          <td className="col-player">
                            <img src={`https://mc-heads.net/avatar/${player.uuid}/48`} className="player-head" />
                            &nbsp;
                            &nbsp;
                            {player.name}
                          </td>
                          <td>{player.s1}</td>
                          <td>{player.s2}</td>
                          <td>{player.s3}</td>
                          <td>{player.s4}</td>
                          <td>{player.s5}</td>
                          <td>{player.s6}</td>
                          <td className="col-pts">{player.total}</td>
                        </tr>
                      ))}
                      {!loading && group2.length === 0 && (
                        <tr>
                          <td colSpan="9" className="col-player">Aucune donnée</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
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
                <span>La qualification aux MRM s'effectue en finissant parmi les 16 plus hauts élos au <Link to="/ranked" className="rules-link">classement Ranked MSF</Link> à la toute fin de la saison de MCSR Ranked</span>
              </div>
              <div className="rules-row">
                <i className="bi bi-people-fill rules-icon" />
                <span>Les 16 participant·e·s sont alors placé·e·s dans deux groupes de 8 de manière aléatoire, à la suite d'un <span className="rules-highlight">tirage au sort</span> effectué en stream la semaine suivante</span>
              </div>
              <div className="rules-row">
                <i className="bi bi-calendar-event rules-icon" />
                <span>La phase de groupes se déroulera le samedi <span className="rules-highlight">23/05/2026</span> à la suite des playoffs internationaux, afin de permettre à chacun de pouvoir suivre les deux tournois</span>
              </div>
            </div>
          </div>

          <div className="rules-panel">
            <div className="rules-panel-header">PHASE DE GROUPES</div>
            <div className="rules-panel-body">
              <div className="rules-row">
                <i className="bi bi-calendar-check rules-icon" />
                <span>Le <span className="rules-highlight">groupe 1</span> commence à jouer le samedi à <span className="rules-highlight">14h</span> (fuseau horaire de Paris) et le <span className="rules-highlight">groupe 2</span> enchaine à <span className="rules-highlight">16h</span> le même jour</span>
              </div>
              <div className="rules-row">
                <i className="bi bi-stopwatch rules-icon" />
                <span>Chaque groupe consiste en <span className="rules-highlight">6 seeds</span> qui s'enchainent et une limite de temps de <span className="rules-highlight">15 minutes par seed</span>, avec une pause de 5 minutes entre les seeds 3 et 4</span>
              </div>
              <div className="rules-row">
                <i className="bi bi-database rules-icon" />
                <span>Chaque joueur·se accumule des points en fonction de son placement sur chaque seed : <span className="rules-highlight">10-8-6-5-4-3-2-1</span>, et 0 points pour ceux·celles n'étant pas en mesure de finir</span>
              </div>
              <div className="rules-row">
                <i className="bi bi-check-circle-fill rules-icon" />
                <span>Les deux participant·e·s restant·e·s de chaque groupe se qualifient pour la phase finale des MRM qui se déroulera le lendemain soit le <span className="rules-highlight">24/05/2026</span></span>
              </div>
            </div>
          </div>

          <div className="rules-panel">
            <div className="rules-panel-header">PHASE FINALE</div>
            <div className="rules-panel-body">
              <div className="rules-row">
                <i className="bi bi-intersect rules-icon" />
                <span>Le premier de chaque groupe affronte le second du groupe suivant en demi-finale lors d'un <span className="rules-highlight">BO3</span> (pas de seed type en double par match) à partir de <span className="rules-highlight">15h</span></span>
              </div>
              <div className="rules-row">
                <i className="bi bi-people-fill rules-icon" />
                <span>Les perdants de chaque demi-finale s'affrontent en <span className='rules-highlight'>BO3</span> après une pause de 10 minutes suivant la deuxième demi-finale pour déterminer qui monte sur le podium</span>
              </div>
              <div className="rules-row">
                <i className="bi bi-trophy-fill rules-icon" />
                <span>Les finalistes s'affrontent dans la foulée lors d'un <span className='rules-highlight'>BO5</span> comprenant une seed de chaque type </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MrmS10
