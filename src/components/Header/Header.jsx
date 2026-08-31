import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import msfLogo from '../../assets/msf.png'
import { discordAvatarUrl, discordDisplayName } from '../../utils/discordUser'
import './Header.css'

function Header() {
  const location = useLocation()
  const [discordUser, setDiscordUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' })
        const data = res.ok ? await res.json() : { user: null }
        if (!cancelled) setDiscordUser(data.user ?? null)
      } catch {
        if (!cancelled) setDiscordUser(null)
      } finally {
        if (!cancelled) setAuthChecked(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [location.pathname])

  useEffect(() => {
    setUserMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!userMenuOpen) return
    const onDocPointerDown = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false)
      }
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [userMenuOpen])

  let headerClass = 'header header-home'
  let leaderboardClass = 'leaderboard-home'
  let leaderboardLabel = 'HOME'

  const path = location.pathname.startsWith('/prediction/mrm') ? '/mrm' : location.pathname
  switch (path) {
    case '/rsg':
      headerClass = 'header header-rsg'
      leaderboardClass = 'leaderboard-rsg'
      leaderboardLabel = 'LEADERBOARD'
      break
    case '/ranked':
      headerClass = 'header header-ranked'
      leaderboardClass = 'leaderboard-ranked'
      leaderboardLabel = 'LEADERBOARD'
      break
    case '/mrm':
      headerClass = 'header header-mrm'
      leaderboardClass = 'leaderboard-ranked'
      leaderboardLabel = 'TOURNAMENT'
      break
    case '/tournament':
      headerClass = 'header header-tournament'
      leaderboardClass = 'leaderboard-tournament'
      leaderboardLabel = 'TOURNAMENT'
      break
    case '/draftout':
      headerClass = 'header header-draftout'
      leaderboardClass = 'leaderboard-draftout'
      leaderboardLabel = 'LEADERBOARD'
      break
  }

  return (
    <header className={headerClass}>
      <div className="header-container">
        <Link to="/" className="header-logo-link" aria-label="Retour a l'accueil">
          <div className="header-logo">
            <img src={msfLogo} alt="MSF Logo" className="logo-image" />
            <div><span id="msf">MSF</span><span id="leaderboard" className={leaderboardClass}>{leaderboardLabel}</span></div>
          </div>
        </Link>
        <nav className="header-nav">
          <ul>
            <li className='nav-home'><Link to="/">ACCUEIL</Link></li>
            <li className='nav-classement'>
              <span className='nav-classement-label'>CLASSEMENT<span className='nav-classement-arrow'>▾</span></span>
              <ul className='nav-dropdown'>
                <li className='nav-rsg'><Link to="/rsg">ANY%</Link></li>
                <li className='nav-ranked'><Link to="/ranked">RANKED</Link></li>
                <li className='nav-draftout'><Link to="/draftout">DRAFTOUT</Link></li>
              </ul>
            </li>
            <li className='nav-tournois'>
              <span className='nav-tournois-label'>TOURNOIS<span className='nav-tournois-arrow'>▾</span></span>
              <ul className='nav-dropdown'>
                <li className='nav-mrm'><Link to="/mrm">MRM</Link></li>
                <li className='nav-mrm-prediction'><Link to="/prediction/mrm?season=11">PRONOSTIQUES</Link></li>
                <li className='nav-tournament'><Link to="/tournament">ARCHIVES</Link></li>
              </ul>
            </li>
            <li className="header-auth">
              {!authChecked ? (
                <span className="header-auth-placeholder" aria-hidden="true" />
              ) : discordUser ? (
                <div className="header-user-menu" ref={userMenuRef}>
                  <button
                    type="button"
                    className="header-user-trigger"
                    aria-expanded={userMenuOpen}
                    aria-haspopup="true"
                    onClick={() => setUserMenuOpen((open) => !open)}
                  >
                    <img
                      src={discordAvatarUrl(discordUser.id, discordUser.avatar)}
                      alt=""
                      className="header-user-avatar"
                      width={32}
                      height={32}
                    />
                    <span className="header-user-name">{discordDisplayName(discordUser)}</span>
                    <span className='nav-classement-arrow'>▾</span>
                  </button>
                  {userMenuOpen ? (
                    <div className="header-user-dropdown" role="menu">
                      <a
                        className="header-user-logout"
                        href="/api/auth/logout"
                        role="menuitem"
                      >
                        DÉCONNEXION
                      </a>
                    </div>
                  ) : null}
                </div>
              ) : (
                <a className="header-login-btn" href="/api/auth/discord">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 127.14 96.36" fill="currentColor" style={{marginRight: '6px', verticalAlign: 'middle'}}>
                    <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
                  </svg>
                  DISCORD
                </a>
              )}
            </li>
          </ul>
        </nav>
      </div>
    </header>
  )
}

export default Header
