import clsx from 'clsx'
import { format, parseISO } from 'date-fns'
import { CalendarDays, NotebookPen, Tag } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { Appointment, Sale } from '@/types'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { money } from '@/lib/format'
import { durationLong } from '@/lib/time'
import { computeTotals, lineTotal } from '@/api/sales'
import { Button, StatusChip } from '@/components/ui'
import { appointmentValue, htmlToText } from '../lib/helpers'

/** Timeline row: icon bubble on a vertical line, card on the right. */
export function TimelineItem({ icon, children, last, tone = 'primary' }: { icon: ReactNode; children: ReactNode; last?: boolean; tone?: 'primary' | 'ink' | 'muted' }) {
  const tones = { primary: 'bg-primary text-on-primary', ink: 'bg-ink text-canvas', muted: 'bg-sunken text-muted' }
  return (
    <div className="relative flex gap-3 pb-4">
      {!last && <span aria-hidden className="absolute bottom-0 left-[15px] top-8 w-0.5 bg-primary/30" />}
      <span className={clsx('relative z-[1] mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', tones[tone])}>{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/** Appointment card used in Overview and Appointments (clients.md §4). */
export function AppointmentCard({ appointment, last }: { appointment: Appointment; last?: boolean }) {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const navigate = useNavigate()
  const location = useDb((s) => s.locations.find((l) => l.id === appointment.locationId))
  const members = useDb((s) => s.teamMembers)
  const note = useDb((s) => s.clientNotes.find((n) => n.kind === 'appointment' && n.appointmentId === appointment.id))
  const first = appointment.items[0]
  const memberName = (id: string) => {
    const m = members.find((x) => x.id === id)
    return m ? `${m.firstName} ${m.lastName}` : ''
  }
  const open = () => drawer.open('appointment', { id: appointment.id })
  const canCheckout = !appointment.saleId && !['cancelled', 'no_show', 'completed'].includes(appointment.status)
  return (
    <TimelineItem icon={<CalendarDays size={16} aria-hidden />} last={last}>
      <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
        <div role="button" tabIndex={0} onClick={open} onKeyDown={(e) => e.key === 'Enter' && open()} className="cursor-pointer p-4 hover:bg-sunken/40">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-title-3 text-ink">{appointment.groupId ? t('clients.appt.group') : t('clients.appt.title')}</p>
              <p className="text-small text-muted">
                {format(parseISO(appointment.date), 'EEE, MMM d')}, {first?.start} · {location?.name}
              </p>
            </div>
            <StatusChip status={appointment.status} />
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {appointment.items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-body text-ink">{item.name}</p>
                  <p className="text-small text-muted">
                    {item.start} · {durationLong(item.durationMin + item.extraTime.reduce((s, e) => s + e.durationMin, 0))} · {memberName(item.teamMemberId)}
                  </p>
                </div>
                <span className="shrink-0 text-body text-ink tabular">{money(item.price + item.addOns.reduce((s, a) => s + a.price, 0))}</span>
              </div>
            ))}
          </div>
          {appointment.items.length > 1 && (
            <p className="mt-2 flex justify-between border-t border-line pt-2 text-body-strong text-ink">
              <span>{t('clients.appt.total')}</span>
              <span className="tabular">{money(appointmentValue(appointment))}</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          {appointment.saleId && (
            <Button size="sm" className="rounded-full" onClick={() => drawer.open('sale', { id: appointment.saleId })}>
              {t('clients.appt.viewSale')}
            </Button>
          )}
          {canCheckout && (
            <Button size="sm" className="rounded-full" onClick={() => drawer.open('checkout', { d_appointment: appointment.id })}>
              {t('clients.appt.checkout')}
            </Button>
          )}
          <Button size="sm" className="rounded-full" onClick={() => navigate(`/calendar/rebook-appointment/${appointment.id}`)}>
            {t('clients.appt.rebook')}
          </Button>
        </div>
        {note && (
          <div className="flex items-start justify-between gap-3 bg-primary-subtle/50 px-4 py-3 text-small text-ink">
            <p className="line-clamp-2">
              <strong>{t('clients.appt.note')}</strong> {htmlToText(note.html)}
            </p>
            <NotebookPen size={16} className="shrink-0 text-muted" aria-hidden />
          </div>
        )}
      </div>
    </TimelineItem>
  )
}

const SALE_STATUS_TONE: Record<Sale['status'], string> = {
  completed: 'text-success',
  part_paid: 'text-warning',
  unpaid: 'text-warning',
  draft: 'text-muted',
  refunded: 'text-danger',
  voided: 'text-danger',
}

export function SaleCard({ sale, last }: { sale: Sale; last?: boolean }) {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const totals = computeTotals(sale)
  const open = () => drawer.open('sale', { id: sale.id })
  return (
    <TimelineItem icon={<Tag size={15} aria-hidden />} tone="ink" last={last}>
      <div role="button" tabIndex={0} onClick={open} onKeyDown={(e) => e.key === 'Enter' && open()} className="cursor-pointer rounded-lg border border-line bg-surface p-4 shadow-xs hover:bg-sunken/40">
        <p className="font-display text-title-3 text-ink">{sale.kind === 'refund' ? t('clients.sales.refund') : t('clients.sales.sale')}</p>
        <p className="text-small text-muted">
          {format(parseISO(sale.createdAt), 'dd MMM yyyy')} · <span className={SALE_STATUS_TONE[sale.status]}>{t(`clients.sales.status.${sale.status}`)}</span>
        </p>
        <div className="mt-3 flex flex-col gap-2 border-b border-line pb-3">
          {sale.items.map((item) => (
            <p key={item.id} className="flex justify-between gap-3 text-body text-ink">
              <span className="min-w-0 truncate">
                {item.quantity > 1 ? `${item.quantity} × ` : ''}
                {item.name}
              </span>
              <span className="shrink-0 tabular">{money(lineTotal(item))}</span>
            </p>
          ))}
        </div>
        {totals.tips > 0 && (
          <p className="mt-2 flex justify-between text-body text-muted">
            <span>{t('clients.sales.tip')}</span>
            <span className="tabular">{money(totals.tips)}</span>
          </p>
        )}
        <p className="mt-1 flex justify-between text-body-strong text-ink">
          <span>{t('clients.sales.total')}</span>
          <span className="tabular">{money(totals.total)}</span>
        </p>
      </div>
    </TimelineItem>
  )
}
