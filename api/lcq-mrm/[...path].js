import { proxyBrowserApiToBackendAdapter } from '../lib/backendApiProxy.js'
import { denyUnlessAdmin, tournamentWriteRequiresAdmin } from '../lib/adminAuth.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

function lcqPathWithQuery(req) {
  const segments = req.query?.path
  const sub = Array.isArray(segments) ? segments.join('/') : String(segments || '')
  const rawUrl = req.url || ''
  const qIdx = rawUrl.indexOf('?')
  const qs = qIdx >= 0 ? rawUrl.slice(qIdx) : ''
  return `/api/lcq-mrm/${sub}${qs}`
}

export default async function handler(req, res) {
  if (tournamentWriteRequiresAdmin(req.method)) {
    if (denyUnlessAdmin(req, res)) return
  }

  const pathWithQuery = lcqPathWithQuery(req)
  await proxyBrowserApiToBackendAdapter(req, pathWithQuery, res)
}
