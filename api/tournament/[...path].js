import { proxyBrowserApiToBackendAdapter } from '../../lib/backendApiProxy.js'
import { denyUnlessAdmin, tournamentWriteRequiresAdmin } from '../../lib/adminAuth.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

function tournamentPathWithQuery(req) {
  const rawUrl = req.url || ''
  let pathname = rawUrl
  let qs = ''
  try {
    const parsed = new URL(rawUrl, 'http://local')
    pathname = parsed.pathname
    qs = parsed.search
  } catch {
    const qIdx = rawUrl.indexOf('?')
    qs = qIdx >= 0 ? rawUrl.slice(qIdx) : ''
    pathname = qIdx >= 0 ? rawUrl.slice(0, qIdx) : rawUrl
  }

  if (pathname.startsWith('/api/tournament/') && pathname.length > '/api/tournament/'.length) {
    return `${pathname}${qs}`
  }

  const segments = req.query?.path
  const sub = Array.isArray(segments)
    ? segments.filter(Boolean).join('/')
    : String(segments || '').replace(/^\/+/, '')
  if (sub) {
    return `/api/tournament/${sub}${qs}`
  }

  const stripped = pathname.replace(/^\/+/, '')
  if (stripped && stripped !== 'api/tournament' && !stripped.startsWith('api/tournament/')) {
    return `/api/tournament/${stripped}${qs}`
  }

  return `/api/tournament/${qs}`
}

export default async function handler(req, res) {
  if (tournamentWriteRequiresAdmin(req.method)) {
    if (denyUnlessAdmin(req, res)) return
  }

  const pathWithQuery = tournamentPathWithQuery(req)
  await proxyBrowserApiToBackendAdapter(req, pathWithQuery, res)
}
