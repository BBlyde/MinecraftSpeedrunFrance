import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import './LeaderboardRsg.css'
import { minecraftHeadUrl } from '../../utils/minecraftHead'
import { getAdjacentLeaderboardPath } from '../leaderboardCategories'

const SHEET_ID = '1Fgn-assiNCTxiGCUALdRX5i3wRrQHbwE7iSisWynj78'
const MAIN_SHEET_NAME = 'Leaderboard (sub 15)'
const STATS_SHEET_NAME = 'Stats'

function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
      continue
    }

    current += char
  }

  result.push(current)
  return result.map((value) => value.trim())
}

function parseCSV(csv) {
  const lines = csv.trim().split(/\r?\n/)
  if (lines.length < 2) return []

  const headers = parseCSVLine(lines[0]).map((header, index) =>
    header || (index === 0 ? 'classement' : header),
  )
  const data = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length === headers.length) {
      const obj = {}
      headers.forEach((header, index) => {
        obj[header.toLowerCase()] = values[index]
      })
      data.push(obj)
    }
  }

  return data
}

function LeaderboardRsg() {
  const navigate = useNavigate()
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [hoveredPlayer, setHoveredPlayer] = useState(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  const normalize = (value) => (value || '').toString().trim().toLowerCase()

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

  const fetchLeaderboard = useCallback(async () => {
    try {
      setLoading(true)
      const mainSheetUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(MAIN_SHEET_NAME)}`
      const statsSheetUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(STATS_SHEET_NAME)}`

      const [mainResponse, statsResponse] = await Promise.all([
        axios.get(mainSheetUrl),
        axios.get(statsSheetUrl),
      ])

      const mainData = parseCSV(mainResponse.data)
      const statsData = parseCSV(statsResponse.data)

      const statsByRunner = []
      for (const row of statsData) {
        const byRunner = normalize(row.runner)
        if (byRunner) statsByRunner.push(row)
      }

      const mergedData = mainData.map((player) => {
        const stats = statsByRunner.find((row) => normalize(row.runner) === normalize(player.runner)) || {}
        return {
          ...player,
          tooltipTypeOw: stats["type d'ow"] || '-',
          tooltipBastion: stats.bastion || '-',
          tooltipRates: stats.rates || '-',
          tooltipTravelMethod: stats['travel method'] || '-',
          tooltipTypeEndfight: stats["type d'endfight"] || '-',
        }
      })

      setPlayers(mergedData)
      setLoading(false)
    } catch (err) {
      console.error('Erreur de récupération du classement :', err)
      setError('Erreur de récupération du classement')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const id = setTimeout(() => {
      void fetchLeaderboard()
    }, 0)
    return () => clearTimeout(id)
  }, [fetchLeaderboard])

  const filteredPlayers = useMemo(
    () =>
      players.filter((player) =>
        (player.runner || '').toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [searchTerm, players],
  )
  const previousLeaderboardPath = getAdjacentLeaderboardPath('1-16', -1)
  const nextLeaderboardPath = getAdjacentLeaderboardPath('1-16', 1)

  return (
    <div className="leaderboard-rsg">
      <div className="leaderboard-container">
      <div className="leaderboard-header">
        <div className="rsg-title-row">
          <button
            className="season-arrow"
            onClick={() => previousLeaderboardPath && navigate(previousLeaderboardPath)}
            disabled={!previousLeaderboardPath}
            aria-label="Catégorie précédente"
          >&lt;</button>
          <h1>CLASSEMENT 1.16</h1>
          <button
            className="season-arrow"
            onClick={() => nextLeaderboardPath && navigate(nextLeaderboardPath)}
            disabled={!nextLeaderboardPath}
            aria-label="Catégorie suivante"
          >&gt;</button>
        </div>
        <span className="info">Catégorie RSG Any% 1.16</span>
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
                placeholder="Rechercher un runner..."
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
                {searchTerm ? `Aucun runner trouvé pour "${searchTerm}"` : 'Aucune donnée disponible'}
              </p>
            ) : (
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th className="rank">#</th>
                    <th className="player-name">Runner</th>
                    <th className="wins">Temps</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlayers.map((player, index) => (
                    <tr
                      className="rank-row"
                      key={`${player.id || player.runner}-${searchTerm}`}
                      onClick={() => window.open(`${player.lien}`, '_blank')}
                      style={{ cursor: 'pointer', animationDelay: `${index * 30}ms` }}
                      onMouseEnter={(e) => handleRowMouseEnter(player, e)}
                      onMouseMove={handleRowMouseMove}
                      onMouseLeave={handleRowMouseLeave}
                    >
                      <td className="rank">
                        <span className={`rank-number rank-${player.classement}`}>{player.classement}</span>
                      </td>
                      <td className="player-name">
                        <span className="player-name-inner">
                          <img
                            src={minecraftHeadUrl(player.pseudomc || player.runner, 24)}
                            alt={player.runner}
                            className="player-head"
                          />
                          <span className="player-username">{player.runner}</span>
                        </span>
                      </td>
                      <td className="time">{player.temps}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <a
            className="sheet-source"
            href="https://docs.google.com/spreadsheets/d/1Fgn-assiNCTxiGCUALdRX5i3wRrQHbwE7iSisWynj78/edit?usp=sharing"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg className="sheet-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path fill="#0F9D58" d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z" />
              <path fill="#fff" d="M7 7h4v2H7zm0 4h4v2H7zm0 4h4v2H7zm6-8h4v2h-4zm0 4h4v2h-4zm0 4h4v2h-4z" />
            </svg>
            Basé sur la Google Sheet des sub 15 MSF d'Avocat & Lunet
          </a>
        </>
      )}

      {hoveredPlayer && (
        <div
          className="row-stats-tooltip rst-rsg"
          style={{ left: tooltipPos.x + 18, top: tooltipPos.y + 18 }}
        >
          <div className="rst-header">
            <div>
              <span className="rst-rank">#{hoveredPlayer.classement || '-'}</span>
              {hoveredPlayer.runner}
            </div>
            <div>{hoveredPlayer['f3/nof3'] || '-'}</div>
          </div>
          <div className="rst-grid">
            <span className="rst-label">Overworld</span>
            <span className="rst-value">{hoveredPlayer.tooltipTypeOw || '-'}</span>

            <span className="rst-label">Bastion</span>
            <span className="rst-value">{hoveredPlayer.tooltipBastion || '-'}</span>

            <span className="rst-label">Blaze rates</span>
            <span className="rst-value">{hoveredPlayer.tooltipRates || '-'}</span>

            <span className="rst-label">Travel Method</span>
            <span className="rst-value">{hoveredPlayer.tooltipTravelMethod || '-'}</span>

            <span className="rst-label">Endfight</span>
            <span className="rst-value">{hoveredPlayer.tooltipTypeEndfight || '-'}</span>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

export default LeaderboardRsg
