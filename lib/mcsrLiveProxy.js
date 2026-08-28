import { denyUnlessAdmin } from './adminAuth.js'

const MCSR_API = 'https://api.mcsrranked.com'

function mcsrSegments(req) {
  const fromQuery = req.query?.path
  if (Array.isArray(fromQuery) && fromQuery.length) return fromQuery.map(String)
  if (typeof fromQuery === 'string' && fromQuery) return fromQuery.split('/').filter(Boolean)

  const pathOnly = String(req.url || '').split('?')[0]
  const prefix = '/api/mcsr/'
  const idx = pathOnly.indexOf(prefix)
  if (idx >= 0) return pathOnly.slice(idx + prefix.length).split('/').filter(Boolean)
  return []
}

function headerValue(req, name) {
  const raw = req.headers?.[name]
  if (Array.isArray(raw)) return raw[0]
  return raw || ''
}

export default async function mcsrLiveProxy(req, res) {
  if (denyUnlessAdmin(req, res)) return

  if ((req.method || 'GET').toUpperCase() !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const segments = mcsrSegments(req)
  if (segments.length !== 3 || segments[0] !== 'users' || segments[2] !== 'live') {
    res.status(400).json({ error: 'invalid_path' })
    return
  }

  const userId = decodeURIComponent(segments[1] || '')
  if (!userId) {
    res.status(400).json({ error: 'missing_user' })
    return
  }

  const privateKey = headerValue(req, 'private-key')
  if (!privateKey) {
    res.status(400).json({ error: 'missing_private_key' })
    return
  }

  const targetUrl = `${MCSR_API}/users/${encodeURIComponent(userId)}/live`
  try {
    const upstream = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Private-Key': privateKey,
      },
    })
    const payload = await upstream.json().catch(() => null)
    res.status(upstream.status).json(payload ?? {})
  } catch (err) {
    console.error('[mcsr proxy]', err)
    res.status(502).json({ error: 'upstream_unreachable' })
  }
}
