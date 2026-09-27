export function discordAvatarUrl(id, avatarHash) {
  if (avatarHash) {
    const ext = String(avatarHash).startsWith('a_') ? 'gif' : 'png'
    return `https://cdn.discordapp.com/avatars/${id}/${avatarHash}.${ext}?size=64`
  }
  const snowflake = typeof id === 'string' && /^[0-9]+$/.test(id) ? id : null
  const n = snowflake ? Number((BigInt(snowflake) >> 22n) % 6n) : 0
  return `https://cdn.discordapp.com/embed/avatars/${n}.png`
}

export function discordDisplayName(user) {
  if (!user) return ''
  return user.globalName || user.username || ''
}
