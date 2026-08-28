import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { Analytics } from '@vercel/analytics/react'
import './App.css'
import Header from './components/Header'
import Footer from './components/Footer'
import Home from './pages/Home'
import LeaderboardRsg from './pages/LeaderboardRsg'
import LeaderboardRanked from './pages/LeaderboardRanked'
import LeaderboardDraftout from './pages/LeaderboardDraftout'
import Mrm from './pages/Mrm'
import MrmPrediction from './pages/MrmPrediction'
import Tournament from './pages/Tournament'
import Admin from './pages/Admin/Admin'

function ScrollToTop() {
  const { pathname } = useLocation()
  const previousPathRef = useRef(pathname)
  useEffect(() => {
    const previousPath = previousPathRef.current
    previousPathRef.current = pathname
    const isPlayerProfileSwitch =
      /^\/prediction\/mrm\/[^/]+$/.test(pathname) &&
      /^\/prediction\/mrm\/[^/]+$/.test(previousPath)
    if (!isPlayerProfileSwitch) {
      window.scrollTo(0, 0)
    }
  }, [pathname])
  return null
}

function App() {
  return (
    <div className="app-shell">
      <ScrollToTop />
      <Header />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/rsg" element={<LeaderboardRsg />} />
          <Route path="/ranked" element={<LeaderboardRanked />} />
          <Route path="/draftout" element={<LeaderboardDraftout />} />
          <Route path="/mrm" element={<Mrm />} />
          <Route path="/prediction/mrm/:discordId" element={<MrmPrediction />} />
          <Route path="/prediction/mrm" element={<MrmPrediction />} />
          <Route path="/tournament" element={<Tournament />} />
          <Route path="/admin" element={<Navigate to="/admin/mrm" replace />} />
          <Route path="/admin/:template" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
      <Analytics />
    </div>
  )
}

export default App
