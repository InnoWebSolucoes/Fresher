import { parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import { CalendarDays, MapPin, Store } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { useDb } from '@/store/db'
import type { Automation } from '@/types'
import { durationLabel, todayISO } from '@/lib/time'
import { money } from '@/lib/format'
import { getLang } from '@/i18n/language'

/** Dates sit mid-sentence in the message copy: Portuguese keeps day and month names lowercase there. */
const inSentence = (text: string) => (getLang() === 'pt' ? text.charAt(0).toLowerCase() + text.slice(1) : text)

/** Which message template an automation uses. */
export type ContentKind =
  | 'reminder'
  | 'confirmation'
  | 'reschedule'
  | 'cancellation'
  | 'no_show'
  | 'thank_you'
  | 'tip'
  | 'waitlist_joined'
  | 'waitlist_slot'
  | 'rebook'
  | 'birthday'
  | 'win_back'
  | 'reward'
  | 'welcome'
  | 'chat'
  | 'message_received'
  | 'loyalty'
  | 'custom'

export function contentKind(key: string): ContentKind {
  if (key.startsWith('reminder-')) return 'reminder'
  const map: Record<string, ContentKind> = {
    'new-appointment': 'confirmation',
    rescheduled: 'reschedule',
    cancelled: 'cancellation',
    'no-show': 'no_show',
    'thank-you': 'thank_you',
    'thank-tip': 'tip',
    'waitlist-joined': 'waitlist_joined',
    'waitlist-slot': 'waitlist_slot',
    rebook: 'rebook',
    birthday: 'birthday',
    'win-back': 'win_back',
    'reward-loyal': 'reward',
    welcome: 'welcome',
    'chat-message': 'chat',
    'message-received': 'message_received',
    'points-summary': 'loyalty',
    tier: 'loyalty',
    'rewards-summary': 'loyalty',
    referrer: 'loyalty',
  }
  return map[key] ?? 'custom'
}

const APPOINTMENT_KINDS: ContentKind[] = ['reminder', 'confirmation', 'reschedule', 'cancellation', 'no_show', 'waitlist_slot']

export interface AutomationSample {
  firstName: string
  business: string
  businessEmail: string
  address: string
  whenShort: string
  whenLong: string
  day: string
  service: string
  member: string
  price: number
  durationMin: number
  ref: string
}

/** A real upcoming appointment to preview messages with (falls back to a sample). */
export function useAutomationSample(): AutomationSample {
  const { t } = useTranslation()
  const { appointments, clients, teamMembers, locations, workspace } = useDb(
    useShallow((s) => ({ appointments: s.appointments, clients: s.clients, teamMembers: s.teamMembers, locations: s.locations, workspace: s.workspace })),
  )
  return useMemo(() => {
    const today = todayISO()
    const appt = appointments.find((a) => a.date > today && a.clientId && (a.status === 'booked' || a.status === 'confirmed'))
    const client = clients.find((c) => c.id === appt?.clientId)
    const item = appt?.items[0]
    const member = teamMembers.find((m) => m.id === item?.teamMemberId)
    const location = locations.find((l) => l.id === appt?.locationId) ?? locations[0]
    // The sample falls back to Sunday 11 October.
    const date = appt ? parseISO(appt.date) : new Date(2026, 9, 11)
    const start = item?.start ?? '11:00'
    return {
      firstName: client?.firstName ?? 'Ana',
      business: location?.name ?? workspace.name,
      businessEmail: location?.email ?? '',
      address: location ? `${location.address.line1}, ${location.address.postcode} ${location.address.city}` : '',
      whenShort: t('marketing.content.when', { date: inSentence(format(date, 'EEE, MMM d')), time: start }),
      whenLong: t('marketing.content.when', { date: inSentence(format(date, 'EEEE, MMMM d')), time: start }),

      day: format(date, 'd'),
      service: item?.name ?? t('marketing.content.sampleService'),
      member: member?.firstName ?? 'Inês',
      price: item?.price ?? 35,
      durationMin: item?.durationMin ?? 45,
      ref: appt?.ref ?? '0000FFFF',
    }
  }, [appointments, clients, teamMembers, locations, workspace, t])

}

export function useAutomationCopy() {
  const { t } = useTranslation()
  return {
    subject: (a: Automation, s: AutomationSample) => (contentKind(a.key) === 'custom' ? a.name : t(`marketing.content.${contentKind(a.key)}.subject`, { ...s })),
    heading: (a: Automation, s: AutomationSample) => (contentKind(a.key) === 'custom' ? t('marketing.content.custom.heading', { ...s, name: a.name }) : t(`marketing.content.${contentKind(a.key)}.heading`, { ...s })),
    intro: (a: Automation, s: AutomationSample) => (contentKind(a.key) === 'custom' ? a.description : t(`marketing.content.${contentKind(a.key)}.intro`, { ...s })),
    text: (a: Automation, s: AutomationSample) => t(`marketing.content.${contentKind(a.key)}.sms`, { ...s, name: a.name }),
  }
}

/** Email body for an automation (used in Preview, Edit email content and the configure preview). */
export function AutomationEmailBody({ automation, sample, content }: { automation: Automation; sample: AutomationSample; content?: Automation['content'] }) {
  const { t } = useTranslation()
  const copy = useAutomationCopy()
  const kind = contentKind(automation.key)
  const c = content ?? automation.content
  const showAppointment = APPOINTMENT_KINDS.includes(kind)
  return (
    <div className="text-ink">
      <p className="font-display text-[26px] font-bold leading-[32px]">{copy.heading(automation, sample)}</p>
      <p className="mt-3 text-body-lg">{copy.intro(automation, sample)}</p>
      {showAppointment && (
        <div className="mt-6 divide-y divide-line">
          <div className="flex items-start gap-3 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary">
              <Store size={18} aria-hidden />
            </span>
            <div className="text-body">
              <p>{sample.business}</p>
              <p className="text-muted">{sample.address}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 py-3">
            <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-md bg-ink text-canvas">
              <CalendarDays size={12} aria-hidden />
              <span className="text-small font-bold leading-none">{sample.day}</span>
            </span>
            <div className="text-body">
              <p>{sample.whenLong}</p>
              <p className="text-muted">{sample.service}</p>
            </div>
          </div>
          <div className="flex gap-2 py-3">
            <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong px-4 text-small font-semibold">
              <MapPin size={14} aria-hidden />
              {t('marketing.content.getDirections')}
            </span>
            <span className="inline-flex h-9 items-center rounded-full border border-line-strong px-4 text-small font-semibold">{t('marketing.content.manage')}</span>
          </div>
          <div className="py-4">
            <p className="mb-2 text-body-strong">{t('marketing.content.details')}</p>
            <div className="flex justify-between text-body">
              <span>
                {sample.service}
                <span className="block text-small text-muted">{t('marketing.content.with', { duration: durationLabel(sample.durationMin), member: sample.member })}</span>
              </span>
              {c.displayPrice && <span>{money(sample.price)}</span>}
            </div>
            {c.displayPrice && (
              <div className="mt-3 flex justify-between border-t border-line pt-3 text-body-strong">
                <span>{t('marketing.content.total')}</span>
                <span>{money(sample.price)}</span>
              </div>
            )}
            <p className="mt-3 text-small text-muted">{t('marketing.content.ref', { ref: sample.ref })}</p>
          </div>
          {c.importantInfo.trim() && (
            <div className="py-4">
              <p className="mb-1 text-body-strong">{t('marketing.content.importantInfo')}</p>
              <p className="whitespace-pre-wrap text-body">{c.importantInfo}</p>
            </div>
          )}
          <div className="py-4">
            <p className="mb-1 text-body-strong">{t('marketing.content.policy')}</p>
            <p className="text-body text-muted">{t('marketing.content.policyText')}</p>
          </div>
        </div>
      )}
      {!showAppointment && (
        <>
          {c.importantInfo.trim() && <p className="mt-4 whitespace-pre-wrap rounded-md bg-sunken p-3 text-body">{c.importantInfo}</p>}
          <span className="mt-6 inline-flex h-10 items-center rounded-full bg-ink px-6 text-body-strong text-canvas">{t(`marketing.content.cta.${kind === 'chat' || kind === 'message_received' ? 'reply' : 'book'}`)}</span>
        </>
      )}
      <p className="mt-8 border-t border-line pt-4 text-caption text-muted">{t('marketing.content.footer', { business: sample.business })}</p>
    </div>
  )
}
