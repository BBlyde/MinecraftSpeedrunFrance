import { useEffect, useState } from 'react'
import axios from 'axios'
import './Tournament.css'
import { minecraftHeadIdentifier, minecraftHeadUrl } from '../../utils/minecraftHead'
import { tournamentArchives } from './tournamentArchives'

function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index++) {
    const character = line[index]
    const nextCharacter = line[index + 1]

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        current += '"'
        index++
      } else {
        inQuotes = !inQuotes
      }
    } else if (character === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += character
    }
  }

  result.push(current)
  return result.map((value) => value.trim())
}

function parseTournamentCSV(csv, archive) {
  const rows = csv
    .trim()
    .split(/\r?\n/)
    .map((line) => parseCSVLine(line))
    .filter((row) => row.some((value) => value.length > 0))

  const title = archive.hasHeader ? rows[0]?.[0] : archive.title
  const date = archive.hasHeader ? rows[1]?.[0] : archive.date
  const playerRows = archive.hasHeader ? rows.slice(2) : rows
  const players = playerRows
    .map(([name = '', firstPlayerId = '', secondPlayerId = '']) => ({ name, firstPlayerId, secondPlayerId }))
    .filter(({ name }) => name && name.toLowerCase() !== 'aucune donnée...')

  return {
    title: title || archive.title || 'Tournoi',
    date: date || archive.date || '',
    players,
  }
}

function Tournament() {
  const [tournaments, setTournaments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [openSlug, setOpenSlug] = useState(null)

  useEffect(() => {
    const controller = new AbortController()

    const fetchArchives = async () => {
      try {
        setLoading(true)
        setError(null)
        const results = await Promise.all(
          tournamentArchives.map(async (archive) => {
            const url = `https://docs.google.com/spreadsheets/d/${archive.spreadsheetId}/export?format=csv&gid=${archive.gid}`
            const response = await axios.get(url, { signal: controller.signal })
            return { gid: archive.gid, ...parseTournamentCSV(response.data, archive) }
          }),
        )
        setTournaments(results)
      } catch (fetchError) {
        if (!axios.isCancel(fetchError)) {
          console.error('Erreur de récupération des archives de tournois :', fetchError)
          setError('Erreur de récupération des archives de tournois')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void fetchArchives()
    return () => controller.abort()
  }, [])

  return (
    <div className="d-flex flex-column align-items-center text-white tournament-container">
      <div className="tournament-header">
        <div className="tournament-title-row">
          <span className="tournament-title">ARCHIVES TOURNOIS</span>
        </div>
        <span className="tournament-subtitle">Résultats des tournois communautaires MSF</span>
      </div>

      <div className="section-divider" />

      {loading && <div className="loading">Chargement des archives...</div>}
      {error && <div className="error">{error}</div>}

      {!loading && !error && (
        <div className="tournament-archive-list">
          {tournaments.map((tournament) => {
            const isOpen = openSlug === tournament.gid
            return (
              <div className={`tournament-card${isOpen ? ' open' : ''}`} key={tournament.gid}>
                <button
                  className="tournament-card-header"
                  onClick={() => setOpenSlug(isOpen ? null : tournament.gid)}
                  aria-expanded={isOpen}
                >
                  <span className="tournament-card-title">{tournament.title}</span>
                  {tournament.date && <span className="tournament-card-date">{tournament.date}</span>}
                  <span className={`tournament-card-chevron${isOpen ? ' expanded' : ''}`} />
                </button>

                {isOpen && (
                  <div className="tournament-card-body">
                    {tournament.players.length === 0 ? (
                      <p className="no-data">Aucune donnée disponible</p>
                    ) : (
                      <table className="leaderboard-table">
                        <thead>
                          <tr>
                            <th className="rank">#</th>
                            <th className="player-name">Joueur(s)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tournament.players.map(({ name, firstPlayerId, secondPlayerId }, index) => {
                            const runnerNames = name.split(/\s*&\s*/)
                            return (
                            <tr className="rank-row" key={`${tournament.gid}-${index}`}>
                              <td className="rank"><span className={`rank-number rank-${index + 1}`}>{index + 1}</span></td>
                              <td className="player-name">
                                <span className="player-name-inner">
                                  <img src={minecraftHeadUrl(minecraftHeadIdentifier(firstPlayerId, runnerNames[0]), 24)} alt="" className="player-head" />
                                  {secondPlayerId && <img src={minecraftHeadUrl(minecraftHeadIdentifier(secondPlayerId, runnerNames[1]), 24)} alt="" className="player-head" />}
                                  <span className="player-username">{name}</span>
                                </span>
                              </td>
                            </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default Tournament
