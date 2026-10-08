/** Languages offered for team and client defaults (names are shown in their own language). */
export const LANGUAGES: { name: string; flag: string }[] = [
  { name: 'English (US)', flag: '🇺🇸' },
  { name: 'English (UK)', flag: '🇬🇧' },
  { name: 'Português (Portugal)', flag: '🇵🇹' },
  { name: 'Português (Brasil)', flag: '🇧🇷' },
  { name: 'Español', flag: '🇪🇸' },
  { name: 'Français', flag: '🇫🇷' },
  { name: 'Deutsch', flag: '🇩🇪' },
  { name: 'Italiano', flag: '🇮🇹' },
  { name: 'Nederlands', flag: '🇳🇱' },
  { name: 'Polski', flag: '🇵🇱' },
  { name: 'Svenska', flag: '🇸🇪' },
  { name: 'Dansk', flag: '🇩🇰' },
  { name: 'Norsk', flag: '🇳🇴' },
  { name: 'Suomi', flag: '🇫🇮' },
  { name: 'Čeština', flag: '🇨🇿' },
  { name: 'Ελληνικά', flag: '🇬🇷' },
  { name: 'Română', flag: '🇷🇴' },
  { name: 'Magyar', flag: '🇭🇺' },
  { name: 'Українська', flag: '🇺🇦' },
  { name: 'Türkçe', flag: '🇹🇷' },
  { name: 'العربية', flag: '🇸🇦' },
  { name: '日本語', flag: '🇯🇵' },
  { name: '中文 (简体)', flag: '🇨🇳' },
]

export function languageFlag(name: string): string {
  return LANGUAGES.find((l) => l.name === name)?.flag ?? '🌐'
}

export function languageLabel(name: string): string {
  return `${languageFlag(name)} ${name}`
}
