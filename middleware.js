import { next } from '@vercel/functions'
import { backendTargetUrl } from './lib/backendUrl.js'

const NODE_ONLY = new Set(['/api/predictions/mrm', '/api/prediction/mrm', '/api/draftout/stats'])

export const config = { matcher: '/api/:path*' }

export default async function middleware(request) {
  const url = new URL(request.url)
  if (
    url.pathname.startsWith('/api/auth') ||
    url.pathname.startsWith('/api/lcq-mrm') ||
    url.pathname.startsWith('/api/tournament') ||
    url.pathname.startsWith('/api/mcsr') ||
    NODE_ONLY.has(url.pathname)
  ) {
    return next()
  }

  const targetUrl = backendTargetUrl(url.pathname + url.search)
  const method = request.method
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
