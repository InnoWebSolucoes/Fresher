import type { SocialPlatform } from '@/api/panels'

/** Interest chips (profile-and-personal-settings.md §3.1): id → emoji, labels in en.json `interestItems`. */
export const INTEREST_GROUPS: { key: 'values' | 'selfCare' | 'sports'; items: [string, string][] }[] = [
  {
    key: 'values',
    items: [
      ['empathy', '💙'],
      ['ambition', '🚀'],
      ['family', '❤️'],
      ['confidence', '😎'],
      ['intelligence', '🎓'],
      ['creativity', '🖋️'],
      ['positivity', '☀️'],
      ['active', '🏆'],
      ['sustainability', '🌳'],
    ],
  },
  {
    key: 'selfCare',
    items: [
      ['therapy', '💜'],
      ['mindfulness', '🧠'],
      ['sleep', '💤'],
      ['nutrition', '🥦'],
      ['skincare', '🧖🏻‍♀️'],
      ['deepChats', '💬'],
      ['spiritualist', '🌀'],
      ['offline', '🌳'],
    ],
  },
  {
    key: 'sports',
    items: [
      ['volleyball', '🏐'],
      ['tableTennis', '🏓'],
      ['skiing', '⛷️'],
      ['hiit', '🥵'],
      ['athletics', '🎽'],
      ['surfing', '🏄'],
      ['chess', '♟️'],
      ['meditation', '😌'],
      ['cycling', '🚴‍♂️'],
      ['baseball', '⚾️'],
      ['hockey', '🏒'],
      ['scuba', '🤿'],
      ['running', '👟'],
      ['functional', '🙌'],
      ['martialArts', '🥋'],
      ['rollerskating', '🛼'],
      ['cricket', '🏏'],
      ['horseRiding', '🏇'],
      ['gymnastics', '🤸‍♀️'],
    ],
  },
]

export const INTEREST_EMOJI: Record<string, string> = Object.fromEntries(INTEREST_GROUPS.flatMap((g) => g.items))

export const LANGUAGE_CODES = ['en', 'pt', 'es', 'fr', 'de', 'it', 'nl', 'ro', 'uk', 'ru', 'zh', 'ar', 'hi', 'ja']

export const DEFAULT_PLATFORMS: SocialPlatform[] = ['instagram', 'tiktok', 'facebook']
export const EXTRA_PLATFORMS: SocialPlatform[] = ['x', 'youtube', 'pinterest', 'linkedin', 'website']

export const socialUrl = (platform: SocialPlatform, handle: string): string => {
  const h = handle.trim().replace(/^@/, '')
  if (/^https?:\/\//.test(h)) return h
  switch (platform) {
    case 'instagram':
      return `https://instagram.com/${h}`
    case 'tiktok':
      return `https://tiktok.com/@${h}`
    case 'facebook':
      return `https://facebook.com/${h}`
    case 'x':
      return `https://x.com/${h}`
    case 'youtube':
      return `https://youtube.com/@${h}`
    case 'pinterest':
      return `https://pinterest.com/${h}`
    case 'linkedin':
      return `https://linkedin.com/in/${h}`
    default:
      return `https://${h}`
  }
}

export const profileSlug = (name: string, userId: string) =>
  `${name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}-${userId.replace(/[^a-z0-9]/gi, '').slice(-4)}`
