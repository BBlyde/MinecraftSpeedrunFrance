import discordStart from './api/auth/discord/index.js'
import discordCallback from './api/auth/discord/callback.js'
import authMe from './api/auth/me.js'
import authLogout from './api/auth/logout.js'
import { proxyBrowserApiToBackendAdapter } from './lib/backendApiProxy.js'
import { denyUnlessAdmin, tournamentWriteRequiresAdmin } from './lib/adminAuth.js'
import predictionsMrm from './api/predictions/mrm.js'
import draftoutStats from './api/draftout/stats.js'
import mcsrLiveProxy from './lib/mcsrLiveProxy.js'

function vercelResponseAdapter(nodeRes) {
  let statusCode = 200
  const api = {
    status(code) {
      statusCode = code
      return api
    },
    setHeader(name, value) {
      const lower = name.toLowerCase()
      if (lower === 'set-cookie' && Array.isArray(value)) {
        for (const v of value) nodeRes.appendHeader('Set-Cookie', v)
        return api
      }
      nodeRes.setHeader(name, value)
      return api
    },
    send(body) {
      nodeRes.statusCode = statusCode
      nodeRes.end(typeof body === 'string' ? body : String(body))
    },
    json(obj) {
      nodeRes.statusCode = statusCode
      nodeRes.setHeader('Content-Type', 'application/json; charset=utf-8')
      nodeRes.end(JSON.stringify(obj))
    },
    end(chunk) {
      nodeRes.statusCode = statusCode
      nodeRes.end(chunk ?? '')
    },
    redirect(code, location) {
      nodeRes.statusCode = code
      nodeRes.setHeader('Location', location)
      nodeRes.end()
    },
  }
  return api
}

export function devApiPlugin() {
  return {
    name: 'msf-dev-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url || ''
        if (!rawUrl.startsWith('/api')) {
          next()
          return
        }

        const run = async () => {
          const url = new URL(rawUrl, 'http://dev.local')
          const pathname = url.pathname
          const query = Object.fromEntries(url.searchParams)
          /** Handlers lisent le body via le stream Node (`getJsonBody(req)`), il faut passer le vrai `req`. */
          req.query = query

          const vres = vercelResponseAdapter(res)

          try {
            if (pathname === '/api/auth/discord' && req.method === 'GET') {
              discordStart(req, vres)
              return
            }
            if (pathname === '/api/auth/discord/callback' && req.method === 'GET') {
              await discordCallback(req, vres)
              return
            }
            if (pathname === '/api/auth/me' && req.method === 'GET') {
              authMe(req, vres)
              return
            }
            if (pathname === '/api/auth/logout' && (req.method === 'GET' || req.method === 'POST')) {
              authLogout(req, vres)
              return
            }
            if (pathname === '/api/predictions/mrm' || pathname === '/api/prediction/mrm') {
              await predictionsMrm(req, vres)
              return
            }
            if (pathname === '/api/draftout/stats' && req.method === 'GET') {
              await draftoutStats(req, vres)
              return
            }
            if (pathname.startsWith('/api/mcsr/')) {
              req.query = {
                ...query,
                path: pathname.slice('/api/mcsr/'.length).split('/').filter(Boolean),
              }
              await mcsrLiveProxy(req, vres)
              return
            }
            const pathWithQuery = pathname + (url.search || '')
            if (
              (pathname.startsWith('/api/tournament') || pathname.startsWith('/api/lcq-mrm')) &&
              tournamentWriteRequiresAdmin(req.method) &&
              denyUnlessAdmin(req, vres)
            ) {
              return
            }
            await proxyBrowserApiToBackendAdapter(req, pathWithQuery, vres)
          } catch (err) {
            console.error('[msf-dev-api]', err)
            if (!res.headersSent) {
              res.statusCode = 500
              res.end('Internal Server Error')
            }
          }
        }

        void run()
      })
    },
  }
}
