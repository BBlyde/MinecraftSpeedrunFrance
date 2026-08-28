import { useSearchParams, useNavigate } from 'react-router-dom'
import './Mrm.css'
import MrmS10 from './S10/MrmS10'
import MrmS11 from './S11/MrmS11'

const MIN_SEASON = 10
const MAX_SEASON = 11

const SEASON_COMPONENTS = {
  10: MrmS10,
  11: MrmS11,
}

function Mrm() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const season = parseInt(searchParams.get('season') || MAX_SEASON, 10)
  const SeasonComponent = SEASON_COMPONENTS[season] ?? MrmS11

  return (
    <div className="d-flex flex-column align-items-center text-white mrm-container">
      <div className="mrm-header">
        <div className="mrm-title-row">
          <button
            className="mrm-season-arrow"
            onClick={() => season > MIN_SEASON && navigate(`/mrm?season=${season - 1}`)}
            disabled={season <= MIN_SEASON}
            aria-label="Saison précédente"
          >&lt;</button>
          <span className="mrm-title">MSF RANKED MASTERS </span><span className='mrm-season'>S{season}</span>
          <button
            className="mrm-season-arrow"
            onClick={() => season < MAX_SEASON && navigate(`/mrm?season=${season + 1}`)}
            disabled={season >= MAX_SEASON}
            aria-label="Saison suivante"
          >&gt;</button>
        </div>
        <span className="mrm-subtitle">Résultats & explication du format</span>
      </div>

      <div className="section-divider" />

      <SeasonComponent />
    </div>
  )
}

export default Mrm
