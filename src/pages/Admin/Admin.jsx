import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import './Admin.css'
import AdminMrm from './AdminMrm'
import AdminLcq from './AdminLcq'
import AdminMrm11 from './AdminMrm11'

const TEMPLATES = [
  { id: 'mrm', label: 'MRM S10', hint: 'Tournoi Ranked Masters' },
  { id: 'lcq', label: 'LCQ', hint: 'Diffs matchs LCQ' },
  { id: 'mrm11', label: 'MRM S11', hint: 'Tracking live des matchs' },
]

function normalizeTemplate(value) {
  const id = String(value || 'mrm').toLowerCase()
  return TEMPLATES.some((t) => t.id === id) ? id : 'mrm'
}

function Admin() {
  const navigate = useNavigate()
  const { template: templateParam } = useParams()
  const template = normalizeTemplate(templateParam)

  const [authChecked, setAuthChecked] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [discordUser, setDiscordUser] = useState(null)

  useEffect(() => {
    if (!templateParam || templateParam.toLowerCase() !== template) {
      navigate(`/admin/${template}`, { replace: true })
    }
  }, [templateParam, template, navigate])

  useEffect(() => {
    let cancelled = false

    fetch('/api/auth/me', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        setDiscordUser(data.user ?? null)
        setIsAdmin(Boolean(data.isAdmin))
      })
      .catch(() => {
        if (!cancelled) {
          setDiscordUser(null)
          setIsAdmin(false)
        }
      })
      .finally(() => {
        if (!cancelled) setAuthChecked(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const currentIndex = TEMPLATES.findIndex((t) => t.id === template)
  const current = TEMPLATES[currentIndex] ?? TEMPLATES[0]

  const goPrev = () => {
    const next = TEMPLATES[(currentIndex - 1 + TEMPLATES.length) % TEMPLATES.length]
    navigate(`/admin/${next.id}`)
  }

  const goNext = () => {
    const next = TEMPLATES[(currentIndex + 1) % TEMPLATES.length]
    navigate(`/admin/${next.id}`)
  }

  return (
    <div className="d-flex flex-column align-items-center text-white home-container">
      <h1 className="home-title">MSF ADMIN</h1>
      <span className="info">Page d&apos;administration</span>

      <div className="section-divider" />

      <div className="admin-template-nav" aria-label="Choix du template admin">
        <button type="button" className="admin-template-arrow" onClick={goPrev} aria-label="Template précédent">
          &lt;
        </button>
        <div className="admin-template-label">
          <span className="admin-template-name">{current.label}</span>
          <span className="admin-template-hint">{current.hint}</span>
        </div>
        <button type="button" className="admin-template-arrow" onClick={goNext} aria-label="Template suivant">
          &gt;
        </button>
      </div>

      {!authChecked ? (
        <span className="info">Vérification de l&apos;accès...</span>
      ) : !discordUser ? (
        <div className="admin-auth-banner" role="status">
          <span>Connecte-toi avec Discord pour accéder à l&apos;administration.</span>
          <a className="admin-auth-link" href="/api/auth/discord">
            Se connecter avec Discord
          </a>
        </div>
      ) : !isAdmin ? (
        <div className="admin-auth-banner admin-auth-banner--denied" role="status">
          <span>Accès refusé. Ton compte Discord n&apos;est pas autorisé à utiliser cette page.</span>
        </div>
      ) : template === 'lcq' ? (
        <AdminLcq />
      ) : template === 'mrm11' ? (
        <AdminMrm11 />
      ) : (
        <AdminMrm />
      )}
    </div>
  )
}

export default Admin
