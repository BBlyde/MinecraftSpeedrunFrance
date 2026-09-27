import { proxyBrowserApiToBackendAdapter } from '../../lib/backendApiProxy.js'
import { denyUnlessAdmin, tournamentWriteRequiresAdmin } from '../../lib/adminAuth.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

function lcqPathWithQuery(req) {
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

  if (pathname.startsWith('/api/lcq-mrm/') && pathname.length > '/api/lcq-mrm/'.length) {
    return `${pathname}${qs}`
  }

  const segments = req.query?.path
  const sub = Array.isArray(segments)
    ? segments.filter(Boolean).join('/')
    : String(segments || '').replace(/^\/+/, '')
  if (sub) {
    return `/api/lcq-mrm/${sub}${qs}`
  }

  const stripped = pathname.replace(/^\/+/, '')
  if (stripped && stripped !== 'api/lcq-mrm' && !stripped.startsWith('api/lcq-mrm/')) {
    return `/api/lcq-mrm/${stripped}${qs}`
  }

  return `/api/lcq-mrm/${qs}`
}

export default async function handler(req, res) {
  if (tournamentWriteRequiresAdmin(req.method)) {
    if (denyUnlessAdmin(req, res)) return
  }

  const pathWithQuery = lcqPathWithQuery(req)
  await proxyBrowserApiToBackendAdapter(req, pathWithQuery, res)
}
