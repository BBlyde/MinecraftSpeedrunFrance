const SPREADSHEET_ID = '1c4a1fcF8UeHPTzM3_U9HlFP5_FefrdVB'

export const leaderboardCategories = [
  {
    slug: '1-8',
    title: 'CLASSEMENT PRE 1.8',
    description: 'Catégorie RSG Any% pre 1.8',
    spreadsheetId: SPREADSHEET_ID,
    gid: '1912566008',
    timeField: 'temps',
    timeLabel: 'Temps',
  },
  {
    slug: '1-15',
    title: 'CLASSEMENT 1.15',
    description: 'Catégorie RSG Any% 1.15',
    spreadsheetId: SPREADSHEET_ID,
    gid: '30396876',
    timeField: 'temps',
    timeLabel: 'Temps',
  },
  {
    slug: '1-16',
    title: 'CLASSEMENT 1.16',
    description: 'Catégorie RSG Any% 1.16',
  },
  {
    slug: 'aa',
    title: 'CLASSEMENT AA',
    description: 'Catégorie All Advancements 1.16',
    spreadsheetId: SPREADSHEET_ID,
    gid: '1126482347',
    timeField: 'temps',
    timeLabel: 'Temps',
  },
  {
    slug: 'icarus',
    title: 'CLASSEMENT ICARUS',
    description: 'Catégorie RSG Icarus 1.16',
    spreadsheetId: SPREADSHEET_ID,
    gid: '1387138319',
    timeField: 'temps',
    timeLabel: 'Temps',
  },
]

export const leaderboardPath = (slug) => `/leaderboard/${slug}`

export function getLeaderboardCategory(slug) {
  return leaderboardCategories.find((category) => category.slug === slug)
}

export function getAdjacentLeaderboardPath(slug, direction) {
  const currentIndex = leaderboardCategories.findIndex((category) => category.slug === slug)
  const adjacentCategory = leaderboardCategories[currentIndex + direction]
  return adjacentCategory ? leaderboardPath(adjacentCategory.slug) : null
}