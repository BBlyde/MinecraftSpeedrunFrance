import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import axios from 'axios'
import '../LeaderboardRsg/LeaderboardRsg.css'
import { minecraftHeadUrl } from '../../utils/minecraftHead'
import { getAdjacentLeaderboardPath, getLeaderboardCategory } from '../leaderboardCategories'

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

function parseCSV(csv) {
    const lines = csv.trim().split(/\r?\n/)
    if (lines.length < 2) return []

    const headers = parseCSVLine(lines[0]).map((header) => header.toLowerCase())
    return lines.slice(1).flatMap((line, index) => {
        const values = parseCSVLine(line)
        if (values.length !== headers.length) return []

        const row = { classement: index + 1 }
        headers.forEach((header, valueIndex) => {
            row[header] = values[valueIndex]
        })
        return row.pseudo ? [row] : []
    })
}

function LeaderboardSheet() {
    const { sheetName } = useParams()
    const navigate = useNavigate()
    const leaderboard = getLeaderboardCategory(sheetName)
    const [players, setPlayers] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')

    useEffect(() => {
        if (!leaderboard) return undefined

        const controller = new AbortController()
        const fetchLeaderboard = async () => {
            try {
            setLoading(true)
            setError(null)
            setPlayers([])
            const url = `https://docs.google.com/spreadsheets/d/${leaderboard.spreadsheetId}/export?format=csv&gid=${leaderboard.gid}`
            const response = await axios.get(url, { signal: controller.signal })
            setPlayers(parseCSV(response.data))
            } catch (fetchError) {
                if (!axios.isCancel(fetchError)) {
                    console.error('Erreur de récupération du classement :', fetchError)
                    setError('Erreur de récupération du classement')
                }
            } finally {
                if (!controller.signal.aborted) setLoading(false)
            }
        }

        void fetchLeaderboard()
        return () => controller.abort()
    }, [leaderboard])

    const filteredPlayers = useMemo(
        () => players.filter((player) => player.pseudo.toLowerCase().includes(searchTerm.toLowerCase())),
        [players, searchTerm],
    )
    const previousLeaderboardPath = getAdjacentLeaderboardPath(sheetName, -1)
    const nextLeaderboardPath = getAdjacentLeaderboardPath(sheetName, 1)

    if (!leaderboard) return <Navigate to="/leaderboard/1-16" replace />

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
                        <h1>{leaderboard.title}</h1>
                        <button
                            className="season-arrow"
                            onClick={() => nextLeaderboardPath && navigate(nextLeaderboardPath)}
                            disabled={!nextLeaderboardPath}
                            aria-label="Catégorie suivante"
                        >&gt;</button>
                    </div>
                    <span className="info">{leaderboard.description}</span>
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
                                    onChange={(event) => setSearchTerm(event.target.value)}
                                    className="search-input"
                                />
                            </div>
                        </div>

                        <div className="leaderboard-list">
                            <table className="leaderboard-table">
                                <thead>
                                    <tr>
                                        <th className="rank">#</th>
                                        <th className="player-name">Runner</th>
                                        <th className="wins">{leaderboard.timeLabel}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredPlayers.map((player, index) => (
                                        <tr className="rank-row" key={`${player.pseudo}-${player.classement}`} style={{ animationDelay: `${index * 30}ms` }}>
                                            <td className="rank"><span className={`rank-number rank-${player.classement}`}>{player.classement}</span></td>
                                            <td className="player-name">
                                                <span className="player-name-inner">
                                                    <img src={minecraftHeadUrl(player.uuid || player.pseudo, 24)} alt={player.pseudo} className="player-head" />
                                                    <span className="player-username">{player.pseudo}</span>
                                                </span>
                                            </td>
                                            <td className="time">{player[leaderboard.timeField] || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <a className="sheet-source" href={`https://docs.google.com/spreadsheets/d/${leaderboard.spreadsheetId}/edit?gid=${leaderboard.gid}#gid=${leaderboard.gid}`} target="_blank" rel="noopener noreferrer"><svg className="sheet-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                            <path fill="#0F9D58" d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z" />
                            <path fill="#fff" d="M7 7h4v2H7zm0 4h4v2H7zm0 4h4v2H7zm6-8h4v2h-4zm0 4h4v2h-4zm0 4h4v2h-4z" />
                        </svg>Basé sur la Google Sheet MSF des temps communautaires</a>
                    </>
                )}
            </div>
        </div>
    )
}

export default LeaderboardSheet