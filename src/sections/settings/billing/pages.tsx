import { Landmark, MessageSquareText, Plus, Receipt } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { addMonths, format, parseISO, startOfMonth } from 'date-fns'
import { Button, Chip, DataTable, EmptyState, Field, RadioGroup, TextInput, confirm } from '@/components/ui'
import {
  BANK_ACCOUNTS_KEY,
  CREDIT_PACKS,
  DEFAULT_BANK_ACCOUNTS,
  IVA_RATE,
  PLAN_CANCEL_KEY,
  PLANS,
  addBankAccount,
  cancelPlan,
  changePlan,
  invoiceTotals,
  planMonthly,
  quotePlanChange,
  removeBankAccount,
  removeCard,
  resumePlan,
  setPrimaryBankAccount,
  topUpCredits,
  updateBillingDetails,
  type BankAccount,
  type PlanCancellation,
} from '@/api/billing'
import { bookableMembers, useSettingsExtra } from '@/api/settings'
import { useDb } from '@/store/db'
import { now } from '@/lib/time'
import { money2, round2 } from '@/lib/format'
import type { BillingDetails, Invoice, PlanType } from '@/types'
import { ActionsPill, Banner, EditCard, InfoGrid, ListCard, ListRow, SettingsPage } from '../components/ui'
import { FullModal } from '../components/FullModal'
import { SettingsModal } from '../components/SettingsModal'
import { useAction } from '../components/useAction'
import { useWorkspace } from '../hooks'
import { CardLine, InvoicePreviewModal, UpdateCardModal, downloadInvoice, planName } from './shared'

const useBookable = () => {
  const members = useDb((s) => s.teamMembers)
  return useMemo(() => bookableMembers({ teamMembers: members }).length, [members])
}

// ─── Billing details ──────────────────────────────────────────────────────

export function BillingDetailsPage() {
  const { t } = useTranslation()
  const workspace = useWorkspace()
  const details = workspace.plan.billingDetails
  const [open, setOpen] = useState(false)
  return (
    <SettingsPage title={t('settings.bill.details.title')} description={t('settings.bill.details.description')} learnMore="Billing details">
      {details ? (
        <EditCard title={t('settings.bill.details.card')} onEdit={() => setOpen(true)}>
          <InfoGrid
            rows={[
              { label: t('settings.bill.details.accountType'), value: details.accountType },
              { label: t('settings.bill.details.name'), value: `${details.firstName} ${details.lastName}` },
              { label: t('settings.bill.details.businessName'), value: details.businessName },
              { label: t('settings.bill.details.vat'), value: details.vatNumber },
              { label: t('settings.bill.details.address'), value: details.address },
            ]}
          />
        </EditCard>
      ) : (
        <div className="card">
          <EmptyState icon={<Receipt size={26} />} title={t('settings.bill.details.emptyTitle')} body={t('settings.bill.details.emptyBody')} action={<Button variant="primary" onClick={() => setOpen(true)}>{t('settings.bill.setUpNow')}</Button>} />
        </div>
      )}
      <BillingDetailsModal open={open} onClose={() => setOpen(false)} />
    </SettingsPage>
  )
}

function BillingDetailsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const current = useWorkspace().plan.billingDetails
  const blank: BillingDetails = { accountType: 'Company', firstName: '', lastName: '', businessName: '', address: '', vatNumber: '' }
  const [form, setForm] = useState<BillingDetails>(current ?? blank)
  const [submitted, setSubmitted] = useState(false)
  const [lastOpen, setLastOpen] = useState(open)
  const [saving, run] = useAction()
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setForm(current ?? blank)
      setSubmitted(false)
    }
  }
  const errors: Partial<Record<keyof BillingDetails, string>> = {
    firstName: form.firstName.trim() ? undefined : t('settings.common.required'),
    lastName: form.lastName.trim() ? undefined : t('settings.common.required'),
    businessName: form.accountType === 'Company' && !form.businessName.trim() ? t('settings.common.required') : undefined,
    address: form.address.trim() ? undefined : t('settings.common.required'),
    vatNumber: form.vatNumber && !/^[A-Z]{2}[A-Z0-9]{8,12}$/.test(form.vatNumber.replace(/\s/g, '').toUpperCase()) ? t('settings.bill.details.vatInvalid') : undefined,
  }
  const e: Partial<Record<keyof BillingDetails, string>> = submitted ? errors : {}
  const save = () => {
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) return
    void run(() => updateBillingDetails({ ...form, vatNumber: form.vatNumber?.replace(/\s/g, '').toUpperCase() || undefined }), t('settings.bill.details.saved'), onClose)
  }
  const text = (key: 'firstName' | 'lastName' | 'businessName' | 'address' | 'vatNumber') => (
    <Field label={t(`settings.bill.details.${key}`)} error={e[key]}>
      {(id) => <TextInput id={id} value={form[key] ?? ''} invalid={Boolean(e[key])} onChange={(ev) => setForm({ ...form, [key]: ev.target.value })} />}
    </Field>
  )
  return (
    <SettingsModal open={open} onClose={onClose} title={t('settings.bill.details.card')} footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" loading={saving} onClick={save}>{t('common.save')}</Button></>}>
      <div className="flex flex-col gap-4">
        <RadioGroup value={form.accountType === 'Individual' ? 'Individual' : 'Company'} onChange={(accountType) => setForm({ ...form, accountType })} options={[{ value: 'Company', label: t('settings.bill.details.company') }, { value: 'Individual', label: t('settings.bill.details.individual') }]} />
        <div className="grid grid-cols-2 gap-4">
          {text('firstName')}
          {text('lastName')}
        </div>
        {text('businessName')}
        {text('address')}
        {text('vatNumber')}
      </div>
    </SettingsModal>
  )
}

// ─── Bank accounts ────────────────────────────────────────────────────────

export function BankAccountsPage() {
  const { t } = useTranslation()
  const accounts = useSettingsExtra<BankAccount[]>(BANK_ACCOUNTS_KEY, DEFAULT_BANK_ACCOUNTS)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ holder: '', bankName: '', iban: '' })
  const [saving, run] = useAction()
  const add = () => void run(() => addBankAccount(form), t('settings.bill.bank.added'), () => setOpen(false))
  return (
    <SettingsPage
      title={t('settings.bill.bank.title')}
      description={t('settings.bill.bank.description')}
      learnMore="Bank accounts"
      actions={<Button variant="primary" icon={<Plus size={16} />} onClick={() => { setForm({ holder: '', bankName: '', iban: '' }); setOpen(true) }}>{t('settings.bill.bank.add')}</Button>}
    >
      <ListCard>
        {accounts.map((a) => (
          <ListRow
            key={a.id}
            leading={<Landmark size={20} aria-hidden />}
            title={<>{a.bankName} {a.primary && <Chip tone="primary" className="ml-2">{t('settings.bill.bank.primary')}</Chip>}</>}
            subtitle={t('settings.bill.bank.ending', { holder: a.holder, last4: a.last4 })}
            trailing={
              <ActionsPill
                groups={[{ items: [
                  { label: t('settings.bill.bank.setPrimary'), disabled: a.primary, onSelect: () => void run(() => setPrimaryBankAccount(a.id), t('settings.bill.bank.primarySaved')) },
                  { label: t('settings.common.remove'), danger: true, disabled: a.primary, onSelect: async () => { if (await confirm({ title: t('settings.bill.bank.removeTitle'), confirmLabel: t('settings.common.remove'), tone: 'danger' })) await run(() => removeBankAccount(a.id), t('settings.bill.bank.removed')) } },
                ] }]}
              />
            }
          />
        ))}
      </ListCard>
      <SettingsModal open={open} onClose={() => setOpen(false)} title={t('settings.bill.bank.add')} footer={<><Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button variant="primary" loading={saving} disabled={!form.holder.trim() || !form.bankName.trim() || !form.iban.trim()} onClick={add}>{t('settings.common.add')}</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label={t('settings.bill.bank.holder')}>{(id) => <TextInput id={id} value={form.holder} onChange={(e) => setForm({ ...form, holder: e.target.value })} />}</Field>
          <Field label={t('settings.bill.bank.bankName')}>{(id) => <TextInput id={id} value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />}</Field>
          <Field label="IBAN" hint={t('settings.bill.bank.ibanHint')}>{(id) => <TextInput id={id} value={form.iban} placeholder="PT50 0000 0000 0000 0000 0000 0" onChange={(e) => setForm({ ...form, iban: e.target.value })} />}</Field>
        </div>
      </SettingsModal>
    </SettingsPage>
  )
}

// ─── Payment methods ──────────────────────────────────────────────────────

export function BillingPaymentMethodsPage() {
  const { t } = useTranslation()
  const card = useWorkspace().plan.card
  const [open, setOpen] = useState(false)
  const [, run] = useAction()
  return (
    <SettingsPage title={t('settings.bill.methods.title')} description={t('settings.bill.methods.description')} learnMore="Payment methods">
      {card ? (
        <ListCard>
          <ListRow
            title={<CardLine />}
            subtitle={t('settings.bill.methods.default')}
            trailing={<ActionsPill groups={[{ items: [
              { label: t('settings.bill.card.updateTitle'), onSelect: () => setOpen(true) },
              { label: t('settings.bill.methods.remove'), danger: true, onSelect: async () => { if (await confirm({ title: t('settings.bill.methods.removeTitle'), body: t('settings.bill.methods.removeBody'), confirmLabel: t('settings.common.remove'), tone: 'danger' })) await run(removeCard, t('settings.bill.methods.removed')) } },
            ] }]} />}
          />
        </ListCard>
      ) : (
        <div className="card">
          <EmptyState title={t('settings.bill.methods.emptyTitle')} body={t('settings.bill.methods.emptyBody')} action={<Button variant="primary" onClick={() => setOpen(true)}>{t('settings.bill.setUpNow')}</Button>} />
        </div>
      )}
      <UpdateCardModal open={open} onClose={() => setOpen(false)} />
    </SettingsPage>
  )
}

// ─── Communication balance ────────────────────────────────────────────────

export function CommunicationPage() {
  const { t } = useTranslation()
  const credits = useWorkspace().messageCredits
  const [open, setOpen] = useState(false)
  const [pack, setPack] = useState(CREDIT_PACKS[1].id)
  const [saving, run] = useAction()
  const chosen = CREDIT_PACKS.find((p) => p.id === pack)!
  const totals = invoiceTotals([{ description: '', quantity: 1, unitPrice: chosen.price }])
  return (
    <SettingsPage title={t('settings.bill.comm.title')} description={t('settings.bill.comm.description')} learnMore="Communication balance">
      <EditCard title={t('settings.bill.comm.credits')} action={<Button variant="primary" onClick={() => setOpen(true)}>{t('settings.bill.comm.topUp')}</Button>}>
        <p className="flex items-center gap-3 font-display text-display text-ink"><MessageSquareText size={32} className="text-primary" aria-hidden />{credits}</p>
        <p className="mt-1 text-body text-muted">{t('settings.bill.comm.hint')}</p>
        {credits < 50 && <Banner tone="warning" className="mt-4">{t('settings.bill.comm.low')}</Banner>}
      </EditCard>
      <SettingsModal open={open} onClose={() => setOpen(false)} title={t('settings.bill.comm.topUp')} footer={<><Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button variant="primary" loading={saving} onClick={() => void run(() => topUpCredits(pack), t('settings.bill.comm.added', { count: chosen.credits }), () => setOpen(false))}>{t('settings.bill.comm.buy', { total: money2(totals.total) })}</Button></>}>
        <RadioGroup variant="cards" value={pack} onChange={setPack} options={CREDIT_PACKS.map((p) => ({ value: p.id, label: t('settings.bill.comm.pack', { count: p.credits }), hint: t('settings.bill.comm.packPrice', { price: money2(p.price) }) }))} />
        <dl className="mt-4 text-body">
          <div className="flex justify-between py-1"><dt>{t('settings.bill.invoices.subtotal')}</dt><dd>{money2(totals.subtotal)}</dd></div>
          <div className="flex justify-between py-1"><dt>{t('settings.bill.invoices.iva', { rate: 23 })}</dt><dd>{money2(totals.tax)}</dd></div>
          <div className="flex justify-between border-t border-line py-2 font-semibold"><dt>{t('settings.bill.invoices.total')}</dt><dd>{money2(totals.total)}</dd></div>
        </dl>
        <div className="mt-2"><CardLine compact /></div>
      </SettingsModal>
    </SettingsPage>
  )
}

// ─── Invoices ─────────────────────────────────────────────────────────────

export function InvoicesPage() {
  const { t } = useTranslation()
  const invoices = useDb((s) => s.invoices)
  const [preview, setPreview] = useState<Invoice | null>(null)
  const rows = useMemo(() => [...invoices].sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number)), [invoices])
  return (
    <SettingsPage title={t('settings.bill.invoices.title')} description={t('settings.bill.invoices.pageDescription')} learnMore="Invoices and fees">
      {rows.length ? (
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={setPreview}
          columns={[
            { key: 'number', header: t('settings.bill.invoices.invoice'), cell: (r) => <span className="font-semibold">{r.number}</span> },
            { key: 'date', header: t('settings.bill.invoices.date'), cell: (r) => format(parseISO(r.date), 'd MMM yyyy'), sortValue: (r) => r.date },
            { key: 'desc', header: t('settings.bill.invoices.description'), cell: (r) => <span className="block max-w-[260px] truncate">{r.lines[0]?.description}{r.lines.length > 1 ? ` +${r.lines.length - 1}` : ''}</span> },
            { key: 'status', header: t('settings.bill.invoices.statusLabel'), cell: (r) => <Chip tone={r.status === 'paid' ? 'success' : 'warning'}>{t(`settings.bill.invoices.status.${r.status}`)}</Chip> },
            { key: 'total', header: t('settings.bill.invoices.total'), align: 'right', cell: (r) => money2(r.total), sortValue: (r) => r.total },
            { key: 'actions', header: '', align: 'right', cell: (r) => <ActionsPill groups={[{ items: [{ label: t('settings.common.view'), onSelect: () => setPreview(r) }, { label: t('settings.bill.invoices.downloadPdf'), onSelect: () => void downloadInvoice(r) }] }]} /> },
          ]}
        />
      ) : (
        <div className="card"><EmptyState icon={<Receipt size={26} />} title={t('settings.bill.invoices.emptyTitle')} body={t('settings.bill.invoices.emptyBody')} /></div>
      )}
      <InvoicePreviewModal invoice={preview} onClose={() => setPreview(null)} />
    </SettingsPage>
  )
}

// ─── Subscriptions ────────────────────────────────────────────────────────

const ADDON_NAMES: Record<string, string> = {
  payments: 'Payments',
  'premium-support': 'Premium Support',
  insights: 'Insights',
  'google-rating-boost': 'Google Rating Boost',
  loyalty: 'Client Loyalty',
  'data-connector': 'Data Connector',
  'client-connect': 'Client Connect',
  'smart-website': 'Smart Website',
  'team-chat': 'Team Connect',
  'bookable-resources': 'Bookable Resources',
  xero: 'Xero Accounting',
  quickbooks: 'QuickBooks Accounting',
}

export function SubscriptionsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const workspace = useWorkspace()
  const addOns = useDb((s) => s.addOns)
  const bookable = useBookable()
  const cancellation = useSettingsExtra<PlanCancellation | null>(PLAN_CANCEL_KEY, null)
  const [details, setDetails] = useState(false)
  const [, run] = useAction()
  const type = workspace.plan.type
  const monthly = planMonthly(type, bookable)
  const nextPayment = format(startOfMonth(addMonths(now(), 1)), 'MMM d, yyyy')
  const cancel = async () => {
    if (await confirm({ title: t('settings.bill.subs.cancelTitle'), body: t('settings.bill.subs.cancelBody', { date: format(startOfMonth(addMonths(now(), 1)), 'MMM d, yyyy') }), confirmLabel: t('settings.bill.subs.cancelPlan'), tone: 'danger' })) await run(cancelPlan, t('settings.bill.subs.cancelled'))
  }
  return (
    <SettingsPage title={t('settings.bill.subs.title')} description={t('settings.bill.subs.description')} learnMore="Subscriptions">
      <div className="card flex items-center justify-between gap-4 p-6">
        <p className="font-display text-title-3 text-ink">{t('settings.bill.subs.discover')}</p>
        <Button onClick={() => navigate('/add-ons')}>{t('settings.bill.subs.viewAddons')}</Button>
      </div>
      <h2 className="text-body-strong text-ink">{t('settings.bill.subs.plan')}</h2>
      {cancellation && <Banner tone="warning" action={<Button size="sm" onClick={() => void run(resumePlan, t('settings.bill.subs.resumed'))}>{t('settings.bill.subs.keepPlan')}</Button>}>{t('settings.bill.subs.cancelBanner', { date: format(parseISO(cancellation.endsOn), 'MMM d, yyyy') })}</Banner>}
      <ListCard>
        <ListRow
          leading={<Receipt size={20} aria-hidden />}
          title={planName(t, type)}
          subtitle={<>{t(`settings.bill.plans.${type}.price`)} · {t('settings.bill.subs.monthly', { total: money2(monthly), count: bookable })}<br />{t('settings.bill.subs.nextPayment', { date: nextPayment, total: money2(round2(monthly * (1 + IVA_RATE))) })}</>}
          trailing={<ActionsPill groups={[{ items: [
            { label: t('settings.bill.subs.viewDetails'), onSelect: () => setDetails(true) },
            { label: t('settings.bill.subs.changePlan'), onSelect: () => navigate('/setup/billing/change-plan') },
            cancellation ? { label: t('settings.bill.subs.keepPlan'), onSelect: () => void run(resumePlan, t('settings.bill.subs.resumed')) } : { label: t('settings.bill.subs.cancelPlan'), danger: true, onSelect: () => void cancel() },
          ] }]} />}
        />
      </ListCard>
      <h2 className="text-body-strong text-ink">{t('settings.bill.subs.addons')}</h2>
      <ListCard>
        {addOns.filter((a) => a.status !== 'inactive').map((a) => (
          <ListRow key={a.slug} title={ADDON_NAMES[a.slug] ?? a.slug} subtitle={a.status === 'trial' && a.trialEndsAt ? t('settings.bill.subs.trialEnds', { date: format(parseISO(a.trialEndsAt), 'MMM d, yyyy') }) : t('settings.common.active')} trailing={<Button size="sm" onClick={() => navigate(`/add-ons/manage/${a.slug}`)}>{t('settings.common.manage')}</Button>} />
        ))}
      </ListCard>
      <SettingsModal open={details} onClose={() => setDetails(false)} title={planName(t, type)} footer={<Button variant="primary" onClick={() => setDetails(false)}>{t('settings.common.done')}</Button>}>
        <InfoGrid cols={1} rows={[
          { label: t('settings.bill.subs.price'), value: t(`settings.bill.plans.${type}.price`) },
          { label: t('settings.bill.subs.bookable'), value: String(bookable) },
          { label: t('settings.bill.subs.monthlyTotal'), value: `${money2(monthly)} + IVA = ${money2(round2(monthly * (1 + IVA_RATE)))}` },
          { label: t('settings.bill.subs.paymentMethod'), value: <CardLine /> },
        ]} />
      </SettingsModal>
    </SettingsPage>
  )
}

// ─── Change plan ──────────────────────────────────────────────────────────

export function ChangePlanPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const workspace = useWorkspace()
  const bookable = useBookable()
  const current = workspace.plan.type
  const reason = params.get('reason')
  const [selected, setSelected] = useState<PlanType>(reason === 'bookable' ? 'team' : current === 'team' ? 'independent' : 'team')
  const [cardOpen, setCardOpen] = useState(false)
  const [saving, run] = useAction()
  const monthly = planMonthly(selected, bookable)
  const tax = round2(monthly * IVA_RATE)
  const quote = selected !== current ? quotePlanChange(current, selected, bookable) : null
  const independentBlocked = bookable > 1
  const blocked = selected === current || (selected === 'independent' && independentBlocked) || !workspace.plan.card
  const back = () => navigate(params.get('next') ?? '/setup/billing/subscriptions')
  const confirmChange = () => void run(() => changePlan(selected), t('settings.bill.change.done', { plan: planName(t, selected) }), back)
  return (
    <FullModal open inline onClose={() => navigate('/setup/billing/subscriptions')} onSave={confirmChange} saving={saving} saveDisabled={blocked} saveLabel={t('settings.bill.change.confirm')} title={t('settings.bill.change.title')} subtitle={t('settings.bill.change.subtitle')} width="max-w-[960px]" testId="change-plan">
      {reason === 'bookable' && <Banner tone="warning" className="mb-6" title={t('settings.bill.change.bookableTitle')}>{t('settings.bill.change.bookableBody')}</Banner>}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-4 sm:grid-cols-2">
          {(['independent', 'team'] as PlanType[]).map((type) => {
            const disabled = type === 'independent' && independentBlocked
            return (
              <button key={type} type="button" disabled={disabled} aria-pressed={selected === type} onClick={() => setSelected(type)} className={`card flex flex-col gap-2 p-5 text-left ${selected === type ? 'border-primary ring-1 ring-primary' : ''} ${disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-line-strong'}`} data-testid={`plan-${type}`}>
                <span className="flex items-center justify-between gap-2"><span className="font-display text-title-3 text-ink">{planName(t, type)}</span>{current === type && <Chip tone="primary">{t('settings.bill.change.current')}</Chip>}</span>
                <span className="text-body-strong text-ink">{t(`settings.bill.plans.${type}.price`)}</span>
                <span className="text-body text-muted">{t(`settings.bill.plans.${type}.description`)}</span>
                <span className="mt-2 text-body text-ink">{t('settings.bill.change.forYou', { total: money2(planMonthly(type, bookable)), count: PLANS[type].perMember ? bookable : 1 })}</span>
                {disabled && <span className="text-small text-danger">{t('settings.bill.change.independentBlocked', { count: bookable })}</span>}
              </button>
            )
          })}
        </div>
        <aside className="card p-5 text-body">
          <h2 className="font-display text-title-3 text-ink">{t('settings.bill.change.summary')}</h2>
          <p className="mt-2 text-muted">{t('settings.bill.change.bookableCount', { count: bookable })}</p>
          <dl className="mt-3">
            <div className="flex justify-between py-1"><dt>{planName(t, selected)}</dt><dd>{money2(monthly)}</dd></div>
            <div className="flex justify-between py-1"><dt>{t('settings.bill.invoices.iva', { rate: 23 })}</dt><dd>{money2(tax)}</dd></div>
            <div className="flex justify-between border-t border-line py-2 font-semibold"><dt>{t('settings.bill.change.totalMonthly')}</dt><dd>{money2(round2(monthly + tax))}</dd></div>
            {quote && <div className="flex justify-between py-1 text-muted"><dt>{t('settings.bill.change.dueToday')}</dt><dd>{money2(quote.total)}</dd></div>}
          </dl>
          <div className="mt-4 flex items-center justify-between gap-2"><CardLine compact /><Button variant="link" onClick={() => setCardOpen(true)}>{workspace.plan.card ? t('settings.bill.change.changeCard') : t('settings.bill.change.addCard')}</Button></div>
        </aside>
      </div>
      <UpdateCardModal open={cardOpen} onClose={() => setCardOpen(false)} />
    </FullModal>
  )
}
