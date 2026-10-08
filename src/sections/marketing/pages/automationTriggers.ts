import { useTranslation } from 'react-i18next'
import type { Automation } from '@/types'
import { CUSTOM_TRIGGERS } from './AutomationsPage'

/** Editable trigger values per automation key (None = event based, not editable). */
export function triggerOptions(a: Automation): string[] | null {
  if (a.key.startsWith('reminder-')) return ['1 hour', '2 hours', '3 hours', '12 hours', '24 hours', '2 days', '3 days', '4 days', '5 days', '1 week', '2 weeks', '1 month']
  if (a.key === 'rebook') return ['2 weeks', '3 weeks', '4 weeks', '6 weeks', '8 weeks']
  if (a.key === 'birthday') return ['On the day', '3 days', '7 days', '14 days']
  if (a.key === 'win-back') return ['30 days', '45 days', '60 days', '90 days']
  if (a.key === 'reward-loyal') return ['€250', '€500', '€1000']
  if (a.key === 'welcome') return ['1 day', '3 days', '7 days']
  if (a.key.startsWith('custom-')) return CUSTOM_TRIGGERS
  return null
}

const DEFAULT_TRIGGER: Record<string, string> = { rebook: '4 weeks', birthday: '7 days', 'win-back': '60 days', 'reward-loyal': '€500', welcome: '1 day' }

export const triggerValue = (a: Automation) => a.trigger ?? DEFAULT_TRIGGER[a.key] ?? ''

/** "24 hours before a client's appointment" style sentence. */
export function useTriggerText() {
  const { t } = useTranslation()
  return (a: Automation, value = triggerValue(a)): string => {
    if (a.key.startsWith('custom-')) return value
    if (a.key.startsWith('reminder-')) return t('marketing.triggers.reminder', { value })
    if (a.key === 'birthday' && value === 'On the day') return t('marketing.triggers.birthdayOnDay')
    const known = ['rebook', 'birthday', 'win-back', 'reward-loyal', 'welcome', 'new-appointment', 'rescheduled', 'cancelled', 'no-show', 'thank-you', 'thank-tip', 'waitlist-joined', 'waitlist-slot', 'chat-message', 'message-received', 'points-summary', 'tier', 'rewards-summary', 'referrer']
    return known.includes(a.key) ? t(`marketing.triggers.${a.key}`, { value }) : a.description
  }
}
