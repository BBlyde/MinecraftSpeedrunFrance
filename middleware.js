import { next, rewrite } from '@vercel/functions'
import { backendTargetUrl } from './lib/backendUrl.js'

const NODE_ONLY = new Set(['/api/predictions/mrm', '/api/prediction/mrm', '/api/draftout/stats'])

export const config = { matcher: '/api/:path*' }

function isWriteMethod(method) {
  const m = (method || 'GET').toUpperCase()
  return m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS'
}

function isAdminWritePath(pathname) {
  return (
    pathname === '/api/tournament' ||
    pathname.startsWith('/api/tournament/') ||
    pathname === '/api/lcq-mrm' ||
    pathname.startsWith('/api/lcq-mrm/')
  )
}

export default async function middleware(request) {
  const url = new URL(request.url)
  const method = request.method

  // next() ne joint pas les routes catch-all dès qu’il y a plusieurs segments
  // (POST /api/lcq-mrm/event/.../matches/... → 404 Vercel). On réécrit vers une fonction à un segment.
  if (url.pathname === '/api/backend-write' || url.pathname === '/api/mcsr-live') {
    return next()
  }
  if (isAdminWritePath(url.pathname) && isWriteMethod(method)) {
    const dest = new URL('/api/backend-write', request.url)
    dest.searchParams.set('path', url.pathname + url.search)
    return rewrite(dest)
  }
  if (url.pathname === '/api/mcsr' || url.pathname.startsWith('/api/mcsr/')) {
    const dest = new URL('/api/mcsr-live', request.url)
    const rest = url.pathname.slice('/api/mcsr/'.length)
    if (rest) dest.searchParams.set('path', rest)
    return rewrite(dest)
  }

  if (url.pathname.startsWith('/api/auth') || NODE_ONLY.has(url.pathname)) {
    return next()
  }

  const targetUrl = backendTargetUrl(url.pathname + url.search)
  const headers = new Headers()
  for (const k of ['accept', 'accept-language', 'content-type', 'authorization', 'cookie', 'x-requested-with']) {
    const v = request.headers.get(k)
    if (v) headers.set(k, v)
  }

  const hasBody = method !== 'GET' && method !== 'HEAD'
  if (hasBody && !headers.has('content-type')) headers.set('content-type', 'application/octet-stream')

  let upstream
  try {
    upstream = await fetch(targetUrl, {
      method,
      headers,
      body: hasBody ? request.body : undefined,
      duplex: hasBody ? 'half' : undefined,
    })
  } catch (e) {
    console.error('[middleware]', targetUrl, e)
    return new Response(JSON.stringify({ error: 'upstream_unreachable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  })
}
