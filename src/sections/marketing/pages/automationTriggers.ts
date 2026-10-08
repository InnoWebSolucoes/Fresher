import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { getLang } from '@/i18n/language'
import { money } from '@/lib/format'
import type { Automation } from '@/types'

/**
 * Trigger values are stored in English ("24 hours", "On the day", "€500", the
 * custom trigger sentences); `triggerLabel` turns one into display text.
 */
export const CUSTOM_TRIGGERS = [
  "7 days after a client's last appointment",
  "30 days after a client's last appointment",
  "90 days after a client's last appointment",
  'On the day a client is added',
  "7 days before a client's birthday",
  "On a client's first visit anniversary",
]
const CUSTOM_TRIGGER_KEYS = ['after7', 'after30', 'after90', 'clientAdded', 'beforeBirthday', 'anniversary']

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

/** Display text of a stored trigger value ("24 hours" → "24 horas", "€500" → "500 €"); unknown values are shown as stored. */
export function triggerLabel(t: TFunction, value: string): string {
  if (value === 'On the day') return t('marketing.triggers.values.onTheDay')
  const custom = CUSTOM_TRIGGERS.indexOf(value)
  if (custom >= 0) return t(`marketing.triggers.custom.${CUSTOM_TRIGGER_KEYS[custom]}`)
  const amount = /^€(\d+(?:\.\d+)?)$/.exec(value)
  if (amount) return getLang() === 'en' ? value : money(Number(amount[1]))
  const period = /^(\d+) (hour|day|week|month)s?$/.exec(value)
  if (period) return t(`marketing.triggers.values.${period[2]}`, { count: Number(period[1]) })
  return value
}

/** "24 hours before a client's appointment" style sentence. */
export function useTriggerText() {
  const { t } = useTranslation()
  return (a: Automation, stored = triggerValue(a)): string => {
    const value = triggerLabel(t, stored)
    if (a.key.startsWith('custom-')) return value
    if (a.key.startsWith('reminder-')) return t('marketing.triggers.reminder', { value })
    if (a.key === 'birthday' && stored === 'On the day') return t('marketing.triggers.birthdayOnDay')
    const known = ['rebook', 'birthday', 'win-back', 'reward-loyal', 'welcome', 'new-appointment', 'rescheduled', 'cancelled', 'no-show', 'thank-you', 'thank-tip', 'waitlist-joined', 'waitlist-slot', 'chat-message', 'message-received', 'points-summary', 'tier', 'rewards-summary', 'referrer']
    return known.includes(a.key) ? t(`marketing.triggers.${a.key}`, { value }) : a.description
  }
}
