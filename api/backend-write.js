import { proxyBrowserApiToBackendAdapter } from '../lib/backendApiProxy.js'
import { denyUnlessAdmin, tournamentWriteRequiresAdmin } from '../lib/adminAuth.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

function allowedProxyPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) return false
  const pathOnly = value.split('?')[0]
  if (pathOnly.includes('..') || pathOnly.includes('\\')) return false
  return (
    pathOnly === '/api/tournament' ||
    pathOnly.startsWith('/api/tournament/') ||
    pathOnly === '/api/lcq-mrm' ||
    pathOnly.startsWith('/api/lcq-mrm/')
  )
}

export default async function handler(req, res) {
  if (tournamentWriteRequiresAdmin(req.method)) {
    if (denyUnlessAdmin(req, res)) return
  }

  const raw = req.query?.path
  const pathWithQuery = Array.isArray(raw) ? raw[0] : raw
  if (!allowedProxyPath(pathWithQuery)) {
    res.status(400).json({ error: 'invalid_path' })
    return
  }

  await proxyBrowserApiToBackendAdapter(req, pathWithQuery, res)
}
