import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import './LeaderboardDraftout.css'
import { minecraftHeadUrl } from '../../utils/minecraftHead'

const API_URL = '/api/draftout/stats'
const CURRENT_ERA = 2

function formatTime(ms) {
  if (!ms) return '-'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function LeaderboardDraftout() {
  const [players, setPlayers] = useState([])
  const [filteredPlayers, setFilteredPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [hoveredPlayer, setHoveredPlayer] = useState(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const era = parseInt(searchParams.get('era') || CURRENT_ERA, 10)

  const handleRowMouseEnter = useCallback((player, e) => {
    setHoveredPlayer(player)
    setTooltipPos({ x: e.clientX, y: e.clientY })
  }, [])

  const handleRowMouseMove = useCallback((e) => {
    setTooltipPos({ x: e.clientX, y: e.clientY })
  }, [])

  const handleRowMouseLeave = useCallback(() => {
    setHoveredPlayer(null)
  }, [])

  useEffect(() => {
    fetchLeaderboard(era)
  }, [era])

  useEffect(() => {
    const filtered = players.filter(player =>
      player.username.toLowerCase().includes(searchTerm.toLowerCase())
    )
    setFilteredPlayers(filtered)
  }, [searchTerm, players])

  const fetchLeaderboard = async (era) => {
    try {
      setLoading(true)
      const response = await axios.get(`${API_URL}?era=${era}`)
      setPlayers(response.data.rows)
      setLoading(false)
    } catch (err) {
      setError('Erreur de récupération du classement')
      setLoading(false)
    }
  }

  return (
    <div className="leaderboard-draftout">
      <div className="leaderboard-container">
        <div className="leaderboard-header">
          <h1 className="draftout-title-row">
            <button
              className="season-arrow"
              onClick={() => era > 1 && navigate(`/leaderboard/draftout?era=${era - 1}`)}
              disabled={era <= 1}
              aria-label="Saison précédente"
            >&lt;</button>
            <span className="draftout-title">CLASSEMENT DRAFTOUT</span><span className="draftout-season"> S{era}</span>
            <button
              className="season-arrow"
              onClick={() => era < CURRENT_ERA && navigate(`/leaderboard/draftout?era=${era + 1}`)}
              disabled={era >= CURRENT_ERA}
              aria-label="Saison suivante"
            >&gt;</button>
          </h1>
          <span className="info">Mode de jeu <a href="https://draftoutmc.com/leaderboard?metric=elo" target="_blank" rel="noopener noreferrer">Draftout</a> 26.1</span>
        </div>

        <div className="section-divider" />

        {loading && <div className="loading">Chargement du classement...</div>}
        {error && <div className="error">{error}</div>}

        {!loading && !error && (
          <>
            <div className="search-container">
              <div className="search-wrapper">
                <input
                  type="text"
                  placeholder="Rechercher un joueur..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
                <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
            </div>

            <div className="leaderboard-list">
              {filteredPlayers.length === 0 ? (
                <p className="no-data">
                  {searchTerm ? `Aucun joueur trouvé pour "${searchTerm}"` : 'Aucune donnée disponible'}
                </p>
              ) : (
                <table className="leaderboard-table">
                  <thead>
                    <tr>
                      <th className="rank">#</th>
                      <th className="player-name">Runner</th>
                      <th className="score">Elo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlayers.map((player, index) => (
                      <tr
                        key={player.uuid}
                        className="rank-row"
                        style={{ animationDelay: `${index * 30}ms`, cursor: 'pointer' }}
                        onClick={() => window.open(`https://draftoutmc.com/leaderboard/${player.username}?metric=elo&filter=competitive`, '_blank')}
                        onMouseEnter={(e) => handleRowMouseEnter(player, e)}
                        onMouseMove={handleRowMouseMove}
                        onMouseLeave={handleRowMouseLeave}
                      >
                        <td className="rank">
                          <span className={`rank-number rank-${player.rank}`}>{player.rank}</span>
                        </td>
                        <td className="player-name">
                          <span className="player-name-inner">
                            <img
                              src={minecraftHeadUrl(player.username, 100)}
                              alt={player.username}
                              className="player-head"
                            />
                            <span className="player-username">{player.username}</span>
                          </span>
                        </td>
                        <td className="score">
                          <div className="score-inner">
                            <span className="rank-badge-tooltip">
                              <span className="elo-value" style={{ color: player.rankColor }}>{player.elo}</span>
                              <span className="rank-tooltip-text">{player.rankName}</span>
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      {hoveredPlayer && (
        <div
          className="row-stats-tooltip rst-draftout"
          style={{ left: tooltipPos.x + 18, top: tooltipPos.y + 18 }}
        >
          <div className="rst-header">
            <span className="rst-rank">#{hoveredPlayer.draftoutRank ?? '-'}</span>
            {hoveredPlayer.username}
          </div>
          <div className="rst-grid">
            <span className="rst-label">W-D-L</span>
            <span className="rst-value">
              <span className="rst-win">{hoveredPlayer.wins}</span>
              {' - '}
              <span className="rst-draw">{hoveredPlayer.draws}</span>
              {' - '}
              <span className="rst-loss">{hoveredPlayer.losses}</span>
              <span className="rst-matches"> / {hoveredPlayer.matches}</span>
            </span>

            <span className="rst-label">Winrate</span>
            <span className="rst-value rst-win">{(hoveredPlayer.winRate * 100).toFixed(1)}%</span>            

            <span className="rst-label">Average</span>
            <span className="rst-value">{formatTime(hoveredPlayer.averageFinishTime)}</span>

            <span className="rst-label">Goal diff</span>
            <span className="rst-value">{hoveredPlayer.averageGoals != null ? hoveredPlayer.averageGoals.toFixed(2) : '-'}</span>

            <span className="rst-label">Peak Elo</span>
            <span className="rst-value">{hoveredPlayer.peakElo ?? '-'}</span>

            <span className="rst-label">Forfeits</span>
            <span className="rst-value">
              {hoveredPlayer.forfeitCount}
              {hoveredPlayer.matches > 0 && (
                <span className="rst-matches"> ({((hoveredPlayer.forfeitCount / hoveredPlayer.matches) * 100).toFixed(1)}%)</span>
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default LeaderboardDraftout