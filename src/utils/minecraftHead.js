const headBase = (
  import.meta.env.VITE_MINECRAFT_HEAD_BASE
  || (import.meta.env.DEV ? 'http://localhost:8094' : 'https://msf.mcsr-game.com')
).replace(/\/$/, '')

const UUID_RE = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

export function minecraftHeadIdentifier(id, name) {
  const raw = String(id ?? '').trim()
  if (UUID_RE.test(raw)) return raw
  const label = String(name ?? '').trim()
  if (label && label.toUpperCase() !== 'TBD') return label
  return 'steve'
}

export function minecraftHeadUrl(identifier, size = 64) {
  const player = identifier || 'steve'
  return `${headBase}/helm/${encodeURIComponent(player)}/${size}.png`
}
