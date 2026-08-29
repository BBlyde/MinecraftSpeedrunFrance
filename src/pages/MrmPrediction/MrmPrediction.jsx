import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import '../Mrm/Mrm.css'
import './MrmPrediction.css'
import MrmPredictionS10 from './S10/MrmPredictionS10'
import MrmPredictionS11 from './S11/MrmPredictionS11'
import {
  PREDICTION_MAX_SEASON,
  PREDICTION_MIN_SEASON,
  predictionPagePath,
} from './predictionSeason'

const SEASON_COMPONENTS = {
  10: MrmPredictionS10,
  11: MrmPredictionS11,
}

function MrmPrediction() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { discordId: viewDiscordIdParam } = useParams()
  const viewDiscordId = viewDiscordIdParam?.trim() || null
  const season = parseInt(searchParams.get('season') || PREDICTION_MAX_SEASON, 10)
  const SeasonComponent = SEASON_COMPONENTS[season] ?? MrmPredictionS11

  const goToSeason = (nextSeason) => {
    navigate(predictionPagePath(nextSeason, viewDiscordId))
  }

  return (
    <div className="d-flex flex-column align-items-center text-white mrm-container mrm-prediction">
      <div className="mrm-header">
        <div className="mrm-title-row">
          <button
            className="mrm-season-arrow"
            onClick={() => season > PREDICTION_MIN_SEASON && goToSeason(season - 1)}
            disabled={season <= PREDICTION_MIN_SEASON}
            aria-label="Saison précédente"
          >
            &lt;
          </button>
          <span className="mrm-title">PRONOSTIQUES MRM </span>
          <span className="mrm-season">S{season}</span>
          <button
            className="mrm-season-arrow"
            onClick={() => season < PREDICTION_MAX_SEASON && goToSeason(season + 1)}
            disabled={season >= PREDICTION_MAX_SEASON}
            aria-label="Saison suivante"
          >
            &gt;
          </button>
        </div>
        <span className="mrm-subtitle">Prédis les résultats et gagne des points dans le classement</span>
      </div>

      <div className="section-divider" />

      <SeasonComponent season={season} />
    </div>
  )
}

export default MrmPrediction
