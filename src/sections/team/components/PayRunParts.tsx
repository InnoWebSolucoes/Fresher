import clsx from 'clsx'
import { Banknote, Check, ChevronDown, ChevronLeft, Info, Landmark, Wallet } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ID, PayRun, TeamMember } from '@/types'
import { money } from '@/lib/format'
import { Button, Field, Menu, Modal, TextArea } from '@/components/ui'
import type { ReviewStatus } from '@/api/team'
import { MemberAvatar } from './common'
import { memberName } from '../lib/members'

export type PayMethod = PayRun['method']

/** Checkbox with a mixed state ("Include all team members"). */
export function TriCheckbox({ checked, mixed, disabled, onChange, label }: { checked: boolean; mixed?: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(mixed)
  }, [mixed])
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      aria-checked={mixed ? 'mixed' : checked}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="h-5 w-5 shrink-0 cursor-pointer rounded-xs accent-[rgb(var(--primary))] disabled:cursor-not-allowed disabled:opacity-40"
    />
  )
}

const METHOD_ICONS: Record<PayMethod, ReactNode> = {
  manual: <Banknote size={22} aria-hidden />,
  cash_register: <Landmark size={22} aria-hidden />,
  wallet: <Wallet size={22} aria-hidden />,
}

/** Small ⓘ with a native tooltip. */
export function InfoTip({ text }: { text: string }) {
  return (
    <span title={text} aria-label={text} role="img" className="inline-flex text-muted">
      <Info size={16} aria-hidden />
    </span>
  )
}

export interface MethodRow {
  member: TeamMember
  amount: number
  method: PayMethod
}

/**
 * "Edit payment method" (team.md §6.4, team-124/125): a table of members with
 * their total to pay and method; each method opens "Payment method".
 */
export function EditPaymentMethodModal({
  open,
  subtitle,
  rows,
  options,
  available,
  onClose,
  onApply,
}: {
  open: boolean
  subtitle: string
  rows: MethodRow[]
  options: PayMethod[]
  /** Wallet balance available, to disable the wallet when it can't cover a member. */
  available: number
  onClose: () => void
  onApply: (methods: Record<ID, PayMethod>) => void
}) {
  if (!open) return null
  return <EditPaymentMethod subtitle={subtitle} rows={rows} options={options} available={available} onClose={onClose} onApply={onApply} />
}

function EditPaymentMethod({ subtitle, rows, options, available, onClose, onApply }: { subtitle: string; rows: MethodRow[]; options: PayMethod[]; available: number; onClose: () => void; onApply: (methods: Record<ID, PayMethod>) => void }) {
  const { t } = useTranslation()
  const [methods, setMethods] = useState<Record<ID, PayMethod>>(() => Object.fromEntries(rows.map((r) => [r.member.id, r.method])))
  const [picking, setPicking] = useState<MethodRow | null>(null)
  const [choice, setChoice] = useState<PayMethod>('manual')

  if (picking) {
    return (
      <Modal
        open
        size="sm"
        onClose={() => setPicking(null)}
        title={
          <span className="inline-flex items-center gap-2">
            <button type="button" className="icon-btn -ml-2 h-8 w-8" aria-label={t('team.common.goBack')} onClick={() => setPicking(null)}>
              <ChevronLeft size={18} aria-hidden />
            </button>
            {t('team.payRunNew.methodModal.title')}
          </span>
        }
        subtitle={memberName(picking.member)}
        footer={
          <>
            <Button onClick={() => setPicking(null)}>{t('team.common.cancel')}</Button>
            <Button
              variant="primary"
              onClick={() => {
                setMethods({ ...methods, [picking.member.id]: choice })
                setPicking(null)
              }}
            >
              {t('team.common.apply')}
            </Button>
          </>
        }
      >
        <div role="radiogroup" aria-label={t('team.payRunNew.methodModal.title')} className="flex flex-col gap-3 pb-2">
          {options.map((m) => {
            const short = m === 'wallet' && available + 0.004 < picking.amount
            return (
              <label key={m} className={clsx('flex cursor-pointer items-center gap-4 rounded-lg border p-3 transition-colors', choice === m ? 'border-primary ring-1 ring-primary' : 'border-line hover:border-line-strong', short && 'cursor-not-allowed opacity-50')}>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-sunken text-ink">{METHOD_ICONS[m]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body-strong text-ink">{t(`team.payRunNew.methodModal.${m}`)}</span>
                  <span className="block text-small text-muted">{short ? t('team.payRunNew.methodModal.walletShort', { amount: money(available) }) : t(`team.payRunNew.methodModal.${m}Hint`, { amount: money(available) })}</span>
                </span>
                <input type="radio" name="pay-method" checked={choice === m} disabled={short} onChange={() => setChoice(m)} className="h-5 w-5 shrink-0 accent-[rgb(var(--primary))]" />
              </label>
            )
          })}
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={t('team.payRunNew.editMethodTitle')}
      subtitle={subtitle}
      footer={
        <>
          <Button onClick={onClose}>{t('team.common.cancel')}</Button>
          <Button variant="primary" onClick={() => onApply(methods)}>
            {t('team.common.apply')}
          </Button>
        </>
      }
    >
      <table className="w-full text-body">
        <thead>
          <tr className="border-b border-line text-left">
            <th scope="col" className="py-3 pr-4 text-body-strong text-ink">{t('team.pay.cols.member')}</th>
            <th scope="col" className="py-3 pr-4 text-body-strong text-ink">{t('team.payRunNew.totalLabel')}</th>
            <th scope="col" className="py-3 text-right text-body-strong text-ink">{t('team.pay.cols.method')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.member.id} className="border-b border-line last:border-0">
              <td className="py-3 pr-4">
                <span className="flex items-center gap-3">
                  <MemberAvatar member={r.member} size={44} />
                  <span className="text-body-strong text-ink">{memberName(r.member)}</span>
                </span>
              </td>
              <td className="py-3 pr-4 tabular text-ink">{money(r.amount)}</td>
              <td className="py-3 text-right">
                <button
                  type="button"
                  onClick={() => {
                    setChoice(methods[r.member.id] ?? r.method)
                    setPicking(r)
                  }}
                  aria-label={t('team.payRunNew.methodFor', { name: memberName(r.member) })}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-body text-ink hover:bg-sunken"
                >
                  {t(`team.pay.methods.${methods[r.member.id] ?? r.method}`)}
                  <ChevronDown size={14} aria-hidden />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  )
}

/** "Review pay run / Mark as ready to send" status dropdown (team-122/123). */
export function ReviewStatusMenu({ value, onChange }: { value: ReviewStatus; onChange: (v: ReviewStatus) => void }) {
  const { t } = useTranslation()
  const approved = value === 'approved'
  return (
    <div className={clsx('flex flex-wrap items-center justify-between gap-3 rounded-lg px-5 py-4', approved ? 'bg-success-subtle' : 'bg-sunken')}>
      <div>
        <p className="text-body-strong text-ink">{t('team.payRunNew.reviewLabel')}</p>
        <p className="text-small text-muted">{t('team.payRunNew.reviewSub')}</p>
      </div>
      <Menu
        align="right"
        width={300}
        groups={[{ items: (['needs_review', 'approved', 'skip'] as const).map((r) => ({ label: t(`team.payRunNew.review.${r}`), hint: t(`team.payRunNew.reviewHints.${r}`), checked: r === value, onSelect: () => onChange(r) })) }]}
        trigger={({ open, toggle }) => (
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={t('team.payRunNew.reviewLabel')}
            onClick={toggle}
            className={clsx('inline-flex h-11 items-center gap-2 rounded-full px-5 text-body-strong', approved ? 'bg-success text-white hover:opacity-90' : 'border border-line-strong bg-surface text-ink hover:bg-sunken')}
          >
            {approved && <Check size={16} aria-hidden />}
            {t(`team.payRunNew.review.${value}`)}
            <ChevronDown size={16} aria-hidden />
          </button>
        )}
      />
    </div>
  )
}

/** "Add a note" modal (Note 0/185). */
export function NoteModal({ open, initial, onClose, onSave }: { open: boolean; initial: string; onClose: () => void; onSave: (note: string) => void }) {
  if (!open) return null
  return <NoteForm initial={initial} onClose={onClose} onSave={onSave} />
}

function NoteForm({ initial, onClose, onSave }: { initial: string; onClose: () => void; onSave: (note: string) => void }) {
  const { t } = useTranslation()
  const [value, setValue] = useState(initial)
  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={t('team.pay.noteTitle')}
      footer={
        <>
          <Button onClick={onClose}>{t('team.common.cancel')}</Button>
          <Button variant="primary" onClick={() => onSave(value.trim())}>
            {t('team.common.save')}
          </Button>
        </>
      }
    >
      <Field label={t('team.pay.note')} counter={{ value: value.length, max: 185 }}>
        {(id) => <TextArea id={id} maxLength={185} value={value} onChange={(e) => setValue(e.target.value)} />}
      </Field>
    </Modal>
  )
}
