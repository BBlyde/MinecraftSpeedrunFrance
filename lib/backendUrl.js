const DEFAULT = 'https://back.mcsr-game.com'

/** Construit l’URL absolue du backend pour un chemin navigateur `/api/...` (+ query). Utilise `BACKEND_API_BASE_URL`. */
export function backendTargetUrl(pathWithQuery) {
  const raw = (process.env.BACKEND_API_BASE_URL || DEFAULT).replace(/\/$/, '')
  const origin = raw.endsWith('/api') ? raw.slice(0, -4) : raw
  let path = pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`
  if (
    path === '/api/tournament' ||
    path.startsWith('/api/tournament/') ||
    path.startsWith('/api/tournament?')
  ) {
    path = `/tournament${path.slice('/api/tournament'.length)}`
  } else if (
    path === '/api/lcq-mrm' ||
    path.startsWith('/api/lcq-mrm/') ||
    path.startsWith('/api/lcq-mrm?')
  ) {
    path = `/msf-lcq-mrm${path.slice('/api/lcq-mrm'.length)}`
  }
  return `${origin}${path}`
}
