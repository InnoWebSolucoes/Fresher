import { CreditCard, Landmark, Plus, Receipt, Wallet } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { addMonths, differenceInCalendarDays, parseISO, startOfMonth } from 'date-fns'
import { format } from '@/lib/dates'
import { Button, Checkbox, Chip, DataTable, EmptyState, Field, Modal, RadioGroup, Select, TextInput, confirm } from '@/components/ui'
import {
  BANK_ACCOUNTS_KEY,
  DEFAULT_BANK_ACCOUNTS,
  IVA_RATE,
  PLAN_CANCEL_KEY,
  PLANS,
  TOP_UP_AMOUNTS,
  activatePlan,
  addBankAccount,
  cancelPlan,
  changePlan,
  ibanValid,
  invoiceTotals,
  planMonthly,
  quotePlanChange,
  removeBankAccount,
  removeCard,
  resumePlan,
  setPrimaryBankAccount,
  topUpCommunicationBalance,
  updateBillingDetails,
  type BankAccount,
  type PlanCancellation,
} from '@/api/billing'
import { setAutoTopUp, useMarketingSettings } from '@/api/marketing'
import { bookableMembers, useSettingsExtra } from '@/api/settings'
import { useDb } from '@/store/db'
import { now } from '@/lib/time'
import { fullName, money, money2, round2 } from '@/lib/format'
import type { BillingDetails, ID, Invoice, PlanType } from '@/types'
import { ActionsPill, Banner, EditCard, FormCard, FormStack, InfoGrid, ListCard, ListRow, ModalForm, SettingsPage, SummaryList } from '../components/ui'
import { FullModal } from '../components/FullModal'
import { useAction } from '../components/useAction'
import { useWorkspace } from '../hooks'
import { CardLine, InvoicePreviewModal, UpdateCardModal, downloadInvoice, planName } from './shared'

const B = ({ children }: { children?: ReactNode }) => <strong className="font-semibold text-ink">{children}</strong>
const b = { b: <B /> }

/** Bookable, not archived team members (what the plan price counts). */
const useBookableMembers = () => {
  const members = useDb((s) => s.teamMembers)
  return useMemo(() => bookableMembers({ teamMembers: members }), [members])
}

// ─── Billing details ──────────────────────────────────────────────────────

export function BillingDetailsPage() {
  const { t } = useTranslation()
  const workspace = useWorkspace()
  const details = workspace.plan.billingDetails
  const [open, setOpen] = useState(false)
  return (
    <SettingsPage title={t('settings.bill.details.title')} description={t('settings.bill.details.description')} learnMore={t('settings.bill.details.card')}>
      {details ? (
        <EditCard title={t('settings.bill.details.card')} onEdit={() => setOpen(true)} testId="billing-details-card">
          <InfoGrid
            rows={[
              { label: t('settings.bill.details.accountType'), value: t(details.accountType === 'Individual' ? 'settings.bill.details.individual' : 'settings.bill.details.company') },
              { label: t('settings.bill.details.name'), value: `${details.firstName} ${details.lastName}` },
              { label: t('settings.bill.details.businessName'), value: details.businessName },
              { label: t('settings.bill.details.vat'), value: details.vatNumber },
              { label: t('settings.bill.details.address'), value: details.address },
            ]}
          />
        </EditCard>
      ) : (
        <div className="card">
          <EmptyState
            icon={<Receipt size={26} />}
            title={t('settings.bill.details.emptyTitle')}
            body={t('settings.bill.details.emptyBody')}
            action={
              <Button variant="primary" onClick={() => setOpen(true)}>
                {t('settings.bill.setUpNow')}
              </Button>
            }
          />
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
      {(id) => <TextInput id={id} value={form[key] ?? ''} invalid={Boolean(e[key])} onChange={(ev) => setForm({ ...form, [key]: ev.target.value })} data-testid={`billing-${key}`} />}
    </Field>
  )
  return (
    <FullModal open={open} onClose={onClose} title={t('settings.bill.details.card')} subtitle={t('settings.bill.details.description')} onSave={save} saving={saving} testId="billing-details-modal">
      <FormCard>
        <ModalForm onSubmit={save}>
          <RadioGroup
            value={form.accountType === 'Individual' ? 'Individual' : 'Company'}
            onChange={(accountType) => setForm({ ...form, accountType })}
            options={[
              { value: 'Company', label: t('settings.bill.details.company') },
              { value: 'Individual', label: t('settings.bill.details.individual') },
            ]}
          />
          <div className="grid grid-cols-2 gap-4">
            {text('firstName')}
            {text('lastName')}
          </div>
          {text('businessName')}
          {text('address')}
          {text('vatNumber')}
        </ModalForm>
      </FormCard>
    </FullModal>
  )
}

// ─── Bank accounts ────────────────────────────────────────────────────────

export function BankAccountsPage() {
  const { t } = useTranslation()
  const accounts = useSettingsExtra<BankAccount[]>(BANK_ACCOUNTS_KEY, DEFAULT_BANK_ACCOUNTS)
  const [open, setOpen] = useState(false)
  const [, run] = useAction()
  const remove = async (a: BankAccount) => {
    if (await confirm({ title: t('settings.bill.bank.removeTitle'), body: t('settings.bill.bank.removeBody', { bank: a.bankName, last4: a.last4 }), confirmLabel: t('settings.common.remove'), tone: 'danger' })) await run(() => removeBankAccount(a.id), t('settings.bill.bank.removed'))
  }
  return (
    <SettingsPage
      title={t('settings.bill.bank.title')}
      description={t('settings.bill.bank.description')}
      learnMore={t('settings.bill.bank.title')}
      actions={
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)} data-testid="bank-add">
          {t('settings.bill.bank.add')}
        </Button>
      }
    >
      {accounts.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Landmark size={26} aria-hidden />}
            title={t('settings.bill.bank.emptyTitle')}
            body={t('settings.bill.bank.emptyBody')}
            action={
              <Button variant="primary" onClick={() => setOpen(true)}>
                {t('settings.bill.bank.add')}
              </Button>
            }
          />
        </div>
      ) : (
        <ListCard testId="bank-accounts">
          {accounts.map((a) => (
            <ListRow
              key={a.id}
              testId={`bank-${a.id}`}
              leading={<Landmark size={20} aria-hidden />}
              title={
                <span className="flex items-center gap-2">
                  {a.bankName}
                  {a.primary && <Chip tone="primary">{t('settings.bill.bank.primary')}</Chip>}
                </span>
              }
              subtitle={t('settings.bill.bank.ending', { holder: a.holder, last4: a.last4 })}
              trailing={
                <ActionsPill
                  groups={[
                    {
                      items: [
                        { label: t('settings.bill.bank.setPrimary'), disabled: a.primary, onSelect: () => void run(() => setPrimaryBankAccount(a.id), t('settings.bill.bank.primarySaved')) },
                        { label: t('settings.common.remove'), danger: true, disabled: a.primary, hint: a.primary ? t('settings.bill.bank.primaryHint') : undefined, onSelect: () => void remove(a) },
                      ],
                    },
                  ]}
                />
              }
            />
          ))}
        </ListCard>
      )}
      {open && <AddBankAccountModal onClose={() => setOpen(false)} />}
    </SettingsPage>
  )
}

function AddBankAccountModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [form, setForm] = useState({ holder: '', bankName: '', iban: '' })
  const [submitted, setSubmitted] = useState(false)
  const [saving, run] = useAction()
  const errors = {
    holder: form.holder.trim() ? undefined : t('settings.common.required'),
    bankName: form.bankName.trim() ? undefined : t('settings.common.required'),
    iban: !form.iban.trim() ? t('settings.common.required') : !ibanValid(form.iban) ? t('settings.bill.bank.ibanInvalid') : undefined,
  }
  const e = submitted ? errors : { holder: undefined, bankName: undefined, iban: undefined }
  const save = () => {
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) return
    void run(() => addBankAccount(form), t('settings.bill.bank.added'), onClose)
  }
  return (
    <FullModal open onClose={onClose} title={t('settings.bill.bank.addTitle')} subtitle={t('settings.bill.bank.addSubtitle')} onSave={save} saving={saving} saveLabel={t('settings.common.add')} testId="bank-modal">
      <FormCard>
        <ModalForm onSubmit={save}>
          <Field label={t('settings.bill.bank.holder')} error={e.holder}>
            {(id) => <TextInput id={id} value={form.holder} invalid={Boolean(e.holder)} onChange={(ev) => setForm({ ...form, holder: ev.target.value })} data-testid="bank-holder" />}
          </Field>
          <Field label={t('settings.bill.bank.bankName')} error={e.bankName}>
            {(id) => <TextInput id={id} value={form.bankName} invalid={Boolean(e.bankName)} onChange={(ev) => setForm({ ...form, bankName: ev.target.value })} data-testid="bank-name" />}
          </Field>
          <Field label={t('settings.bill.bank.iban')} hint={t('settings.bill.bank.ibanHint')} error={e.iban}>
            {(id) => <TextInput id={id} value={form.iban} invalid={Boolean(e.iban)} placeholder="PT50 0000 0000 0000 0000 0000 0" onChange={(ev) => setForm({ ...form, iban: ev.target.value.toUpperCase() })} data-testid="bank-iban" />}
          </Field>
        </ModalForm>
      </FormCard>
    </FullModal>
  )
}

// ─── Payment methods ──────────────────────────────────────────────────────

export function BillingPaymentMethodsPage() {
  const { t } = useTranslation()
  const card = useWorkspace().plan.card
  const [open, setOpen] = useState(false)
  const [, run] = useAction()
  const remove = async () => {
    if (await confirm({ title: t('settings.bill.methods.removeTitle'), body: t('settings.bill.methods.removeBody'), confirmLabel: t('settings.common.remove'), tone: 'danger' })) await run(removeCard, t('settings.bill.methods.removed'))
  }
  return (
    <SettingsPage
      title={t('settings.bill.methods.title')}
      description={t('settings.bill.methods.description')}
      learnMore={t('settings.bill.methods.title')}
      actions={
        card ? (
          <Button variant="primary" onClick={() => setOpen(true)} data-testid="card-update">
            {t('settings.bill.card.updateTitle')}
          </Button>
        ) : undefined
      }
    >
      {card ? (
        <ListCard>
          <ListRow
            testId="card-on-file"
            leading={<CreditCard size={20} aria-hidden />}
            title={<CardLine />}
            subtitle={t('settings.bill.methods.default')}
            trailing={
              <ActionsPill
                groups={[
                  {
                    items: [
                      { label: t('settings.bill.card.updateTitle'), onSelect: () => setOpen(true) },
                      { label: t('settings.bill.methods.remove'), danger: true, onSelect: () => void remove() },
                    ],
                  },
                ]}
              />
            }
          />
        </ListCard>
      ) : (
        <div className="card">
          <EmptyState
            icon={<CreditCard size={26} aria-hidden />}
            title={t('settings.bill.methods.emptyTitle')}
            body={t('settings.bill.methods.emptyBody')}
            action={
              <Button variant="primary" onClick={() => setOpen(true)}>
                {t('settings.bill.setUpNow')}
              </Button>
            }
          />
        </div>
      )}
      <UpdateCardModal open={open} onClose={() => setOpen(false)} />
    </SettingsPage>
  )
}

// ─── Communication balance ────────────────────────────────────────────────

const THRESHOLDS = [5, 10, 20, 50]
const AUTO_AMOUNTS = [25, 50, 100, 200]

export function CommunicationPage() {
  const { t } = useTranslation()
  const balance = useWorkspace().messageCredits
  const marketing = useMarketingSettings()
  const [modal, setModal] = useState<'topUp' | 'auto' | null>(null)
  const low = balance < (marketing.autoTopUpEnabled ? marketing.autoTopUp.threshold : 10)
  return (
    <SettingsPage title={t('settings.bill.comm.title')} description={t('settings.bill.comm.description')} learnMore={t('settings.bill.comm.title')}>
      <EditCard
        title={t('settings.bill.comm.balance')}
        description={t('settings.bill.comm.hint')}
        action={
          <Button variant="primary" size="sm" onClick={() => setModal('topUp')} data-testid="top-up">
            {t('settings.bill.comm.topUp')}
          </Button>
        }
        testId="communication-balance"
      >
        <p className="flex items-center gap-3 font-display text-display text-ink" data-testid="balance-amount">
          <Wallet size={32} className="text-primary" aria-hidden />
          {money2(balance)}
        </p>
        {low && (
          <Banner tone="warning" className="mt-4">
            {t('settings.bill.comm.low')}
          </Banner>
        )}
      </EditCard>
      <EditCard title={t('settings.bill.comm.auto.title')} description={t('settings.bill.comm.auto.description')} onEdit={() => setModal('auto')} testId="auto-top-up">
        <SummaryList
          items={[
            marketing.autoTopUpEnabled
              ? { key: 'on', text: <Trans i18nKey="settings.bill.comm.auto.on" values={{ amount: money(marketing.autoTopUp.amount), threshold: money(marketing.autoTopUp.threshold) }} components={b} /> }
              : { key: 'off', text: t('settings.bill.comm.auto.off') },
          ]}
        />
      </EditCard>
      {modal === 'topUp' && <TopUpModal onClose={() => setModal(null)} />}
      {modal === 'auto' && <AutoTopUpModal onClose={() => setModal(null)} />}
    </SettingsPage>
  )
}

function TopUpModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const card = useWorkspace().plan.card
  const [amount, setAmount] = useState(String(TOP_UP_AMOUNTS[1]))
  const [saving, run] = useAction()
  const value = Number(amount)
  const totals = invoiceTotals([{ description: '', quantity: 1, unitPrice: value }])
  const pay = () => void run(() => topUpCommunicationBalance(value), t('settings.bill.comm.added', { amount: money2(value) }), onClose)
  return (
    <Modal
      open
      onClose={onClose}
      title={t('settings.bill.comm.topUpTitle')}
      subtitle={t('settings.bill.comm.topUpSubtitle')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={saving} disabled={!card} onClick={pay} data-testid="top-up-pay">
            {t('settings.bill.comm.buy', { total: money2(totals.total) })}
          </Button>
        </>
      }
    >
      <RadioGroup variant="cards" value={amount} onChange={setAmount} options={TOP_UP_AMOUNTS.map((a) => ({ value: String(a), label: money2(a), hint: t('settings.bill.comm.exclIva') }))} />
      <dl className="mt-4 text-body">
        <div className="flex justify-between py-1">
          <dt>{t('settings.bill.invoices.subtotal')}</dt>
          <dd>{money2(totals.subtotal)}</dd>
        </div>
        <div className="flex justify-between py-1">
          <dt>{t('settings.bill.invoices.iva', { rate: Math.round(IVA_RATE * 100) })}</dt>
          <dd>{money2(totals.tax)}</dd>
        </div>
        <div className="flex justify-between border-t border-line py-2 font-semibold">
          <dt>{t('settings.bill.invoices.total')}</dt>
          <dd>{money2(totals.total)}</dd>
        </div>
      </dl>
      <div className="mt-2 pb-2">{card ? <CardLine compact /> : <Banner tone="warning">{t('settings.bill.comm.noCard')}</Banner>}</div>
    </Modal>
  )
}

function AutoTopUpModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const marketing = useMarketingSettings()
  const [enabled, setEnabled] = useState(marketing.autoTopUpEnabled)
  const [threshold, setThreshold] = useState(String(marketing.autoTopUp.threshold))
  const [amount, setAmount] = useState(String(marketing.autoTopUp.amount))
  const [saving, run] = useAction()
  const options = (list: number[], current: string) => Array.from(new Set([...list, Number(current)])).sort((x, y) => x - y).map((v) => ({ value: String(v), label: money(v) }))
  const save = () => void run(() => setAutoTopUp(enabled, { threshold: Number(threshold), amount: Number(amount) }), t('settings.bill.comm.auto.saved'), onClose)
  return (
    <FullModal open onClose={onClose} title={t('settings.bill.comm.auto.title')} subtitle={t('settings.bill.comm.auto.description')} onSave={save} saving={saving} testId="auto-top-up-modal">
      <FormCard>
        <Checkbox checked={enabled} onChange={setEnabled} label={t('settings.bill.comm.auto.toggle')} hint={t('settings.bill.comm.auto.toggleHint')} />
        {enabled && (
          <div className="grid grid-cols-1 gap-4 pl-8 sm:grid-cols-2">
            <Field label={t('settings.bill.comm.auto.threshold')}>{(id) => <Select id={id} value={threshold} onChange={(e) => setThreshold(e.target.value)} options={options(THRESHOLDS, threshold)} />}</Field>
            <Field label={t('settings.bill.comm.auto.amount')}>{(id) => <Select id={id} value={amount} onChange={(e) => setAmount(e.target.value)} options={options(AUTO_AMOUNTS, amount)} />}</Field>
          </div>
        )}
        <div>
          <CardLine compact />
        </div>
      </FormCard>
    </FullModal>
  )
}

// ─── Invoices ─────────────────────────────────────────────────────────────

export function InvoicesPage() {
  const { t } = useTranslation()
  const invoices = useDb((s) => s.invoices)
  const [preview, setPreview] = useState<Invoice | null>(null)
  const rows = useMemo(() => [...invoices].sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number)), [invoices])
  return (
    <SettingsPage title={t('settings.bill.invoices.title')} description={t('settings.bill.invoices.pageDescription')} learnMore={t('settings.bill.invoices.title')}>
      {rows.length ? (
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={setPreview}
          columns={[
            { key: 'number', header: t('settings.bill.invoices.invoice'), cell: (r) => <span className="font-semibold">{r.number}</span> },
            { key: 'date', header: t('settings.bill.invoices.date'), cell: (r) => format(parseISO(r.date), 'd MMM yyyy'), sortValue: (r) => r.date },
            {
              key: 'desc',
              header: t('settings.bill.invoices.description'),
              cell: (r) => (
                <span className="block max-w-[260px] truncate">
                  {r.lines[0]?.description}
                  {r.lines.length > 1 ? ` +${r.lines.length - 1}` : ''}
                </span>
              ),
            },
            { key: 'status', header: t('settings.bill.invoices.statusLabel'), cell: (r) => <Chip tone={r.status === 'paid' ? 'success' : 'warning'}>{t(`settings.bill.invoices.status.${r.status}`)}</Chip> },
            { key: 'total', header: t('settings.bill.invoices.total'), align: 'right', cell: (r) => money2(r.total), sortValue: (r) => r.total },
            {
              key: 'actions',
              header: '',
              align: 'right',
              cell: (r) => (
                <ActionsPill
                  groups={[
                    {
                      items: [
                        { label: t('settings.common.view'), onSelect: () => setPreview(r) },
                        { label: t('settings.bill.invoices.downloadPdf'), onSelect: () => void downloadInvoice(r) },
                      ],
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      ) : (
        <div className="card">
          <EmptyState icon={<Receipt size={26} />} title={t('settings.bill.invoices.emptyTitle')} body={t('settings.bill.invoices.emptyBody')} />
        </div>
      )}
      <InvoicePreviewModal invoice={preview} onClose={() => setPreview(null)} />
    </SettingsPage>
  )
}

// ─── Subscriptions ────────────────────────────────────────────────────────

/** Add-on names (marketplace names live under addons.items.<slug>.name). */
const ADDON_NAME_KEYS: Record<string, string> = {
  'blast-marketing': 'settings.bill.subs.addonNames.blastMarketing',
  'auto-top-up': 'settings.bill.comm.auto.title',
}
const CATALOG_SLUGS = new Set(['payments', 'premium-support', 'insights', 'google-rating-boost', 'loyalty', 'data-connector', 'client-connect', 'smart-website', 'team-chat', 'bookable-resources', 'xero', 'quickbooks'])
const addonName = (t: (key: string) => string, slug: string) => (ADDON_NAME_KEYS[slug] ? t(ADDON_NAME_KEYS[slug]) : CATALOG_SLUGS.has(slug) ? t(`addons.items.${slug}.name`) : slug)

export function SubscriptionsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const workspace = useWorkspace()
  const addOns = useDb((s) => s.addOns)
  const bookable = useBookableMembers().length
  const cancellation = useSettingsExtra<PlanCancellation | null>(PLAN_CANCEL_KEY, null)
  const [details, setDetails] = useState(false)
  const [, run] = useAction()
  const { type, status, trialEndsAt } = workspace.plan
  const monthly = planMonthly(type, bookable)
  const nextPaymentDate = startOfMonth(addMonths(now(), 1))
  const trialDays = Math.max(0, differenceInCalendarDays(parseISO(trialEndsAt), now()))
  const trial = status === 'trial'
  const cancel = async () => {
    if (await confirm({ title: t('settings.bill.subs.cancelTitle'), body: t('settings.bill.subs.cancelBody', { date: format(nextPaymentDate, 'MMM d, yyyy') }), confirmLabel: t('settings.bill.subs.cancelPlan'), tone: 'danger' })) await run(cancelPlan, t('settings.bill.subs.cancelled'))
  }
  const activate = () => {
    if (!workspace.plan.card) {
      navigate('/setup/billing/payment-methods')
      return
    }
    void run(activatePlan, t('settings.bill.subs.activated'))
  }
  const active = addOns.filter((a) => a.status !== 'inactive')
  return (
    <SettingsPage title={t('settings.bill.subs.title')} description={t('settings.bill.subs.description')} learnMore={t('settings.bill.subs.title')}>
      <div className="card flex flex-wrap items-center justify-between gap-4 p-6">
        <p className="font-display text-title-3 text-ink">{t('settings.bill.subs.discover')}</p>
        <Button onClick={() => navigate('/add-ons')}>{t('settings.bill.subs.viewAddons')}</Button>
      </div>
      <h2 className="font-display text-title-3 text-ink">{t('settings.bill.subs.plan')}</h2>
      {trial && (
        <Banner
          tone="info"
          action={
            <Button size="sm" variant="primary" onClick={activate} data-testid="activate-plan">
              {t('settings.bill.subs.activate')}
            </Button>
          }
        >
          <Trans i18nKey="settings.bill.subs.trialBanner" count={trialDays} components={b} />
        </Banner>
      )}
      {cancellation && (
        <Banner
          tone="warning"
          action={
            <Button size="sm" onClick={() => void run(resumePlan, t('settings.bill.subs.resumed'))}>
              {t('settings.bill.subs.keepPlan')}
            </Button>
          }
        >
          {t('settings.bill.subs.cancelBanner', { date: format(parseISO(cancellation.endsOn), 'MMM d, yyyy') })}
        </Banner>
      )}
      <ListCard>
        <ListRow
          testId="plan-row"
          leading={<Receipt size={20} aria-hidden />}
          title={planName(t, type)}
          subtitle={
            <>
              <span className="block">
                {t(`settings.bill.plans.${type}.price`)} · {t('settings.bill.subs.monthly', { total: money2(monthly), count: bookable })}
              </span>
              <span className="block">{trial ? t('settings.bill.subs.trialEnds', { date: format(parseISO(trialEndsAt), 'MMM d, yyyy') }) : t('settings.bill.subs.nextPayment', { date: format(nextPaymentDate, 'MMM d, yyyy'), total: money2(round2(monthly * (1 + IVA_RATE))) })}</span>
            </>
          }
          trailing={
            <ActionsPill
              testId="plan-actions"
              groups={[
                {
                  items: [
                    ...(trial ? [{ label: t('settings.bill.subs.activateShort'), onSelect: activate }] : []),
                    { label: t('settings.bill.subs.viewDetails'), onSelect: () => setDetails(true) },
                    { label: t('settings.bill.subs.changePlan'), onSelect: () => navigate('/setup/billing/change-plan') },
                  ],
                },
                { items: [cancellation ? { label: t('settings.bill.subs.keepPlan'), onSelect: () => void run(resumePlan, t('settings.bill.subs.resumed')) } : { label: t('settings.bill.subs.cancelPlan'), danger: true, onSelect: () => void cancel() }] },
              ]}
            />
          }
        />
      </ListCard>
      <h2 className="font-display text-title-3 text-ink">{t('settings.bill.subs.addons')}</h2>
      {active.length === 0 ? (
        <div className="card">
          <EmptyState title={t('settings.bill.subs.noAddons')} action={<Button onClick={() => navigate('/add-ons')}>{t('settings.bill.subs.viewAddons')}</Button>} />
        </div>
      ) : (
        <ListCard>
          {active.map((a) => (
            <ListRow
              key={a.slug}
              testId={`addon-${a.slug}`}
              title={addonName(t, a.slug)}

              subtitle={a.status === 'trial' && a.trialEndsAt ? t('settings.bill.subs.trialEnds', { date: format(parseISO(a.trialEndsAt), 'MMM d, yyyy') }) : t('settings.common.active')}
              trailing={
                <Button size="sm" onClick={() => navigate(`/add-ons/manage/${a.slug}`)}>
                  {t('settings.common.manage')}
                </Button>
              }
            />
          ))}
        </ListCard>
      )}
      <Modal open={details} onClose={() => setDetails(false)} title={planName(t, type)} footer={<Button variant="primary" onClick={() => setDetails(false)}>{t('settings.common.done')}</Button>}>
        <div className="pb-2">
          <InfoGrid
            cols={1}
            rows={[
              { label: t('settings.bill.subs.price'), value: t(`settings.bill.plans.${type}.price`) },
              { label: t('settings.bill.subs.bookable'), value: String(bookable) },
              { label: t('settings.bill.subs.monthlyTotal'), value: t('settings.bill.subs.monthlyWithIva', { net: money2(monthly), total: money2(round2(monthly * (1 + IVA_RATE))) }) },
              { label: t('settings.bill.subs.paymentMethod'), value: <CardLine /> },
            ]}
          />
        </div>
      </Modal>
    </SettingsPage>
  )
}

// ─── Change plan ──────────────────────────────────────────────────────────

export function ChangePlanPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const workspace = useWorkspace()
  const members = useBookableMembers()
  const bookable = members.length
  const current = workspace.plan.type
  const reason = params.get('reason')
  const [selected, setSelected] = useState<PlanType>(reason === 'bookable' ? 'team' : current === 'team' ? 'independent' : 'team')
  const [keep, setKeep] = useState<ID>(() => members.find((m) => m.role === 'owner')?.id ?? members[0]?.id ?? '')
  const [cardOpen, setCardOpen] = useState(false)
  const [saving, run] = useAction()
  const needsKeep = selected === 'independent' && bookable > 1
  const after = needsKeep ? 1 : bookable
  const monthly = planMonthly(selected, after)
  const tax = round2(monthly * IVA_RATE)
  const quote = selected !== current ? quotePlanChange(current, selected, bookable) : null
  const blocked = selected === current || !workspace.plan.card || (needsKeep && !members.some((m) => m.id === keep))
  const back = () => navigate(params.get('next') ?? '/setup/billing/subscriptions')
  const confirmChange = () => void run(() => changePlan(selected, needsKeep ? keep : undefined), t('settings.bill.change.done', { plan: planName(t, selected) }), back)
  return (
    <FullModal
      open
      inline
      onClose={() => navigate('/setup/billing/subscriptions')}
      onSave={confirmChange}
      saving={saving}
      saveDisabled={blocked}
      saveLabel={t('settings.bill.change.confirm')}
      title={t('settings.bill.change.title')}
      subtitle={t('settings.bill.change.subtitle')}
      width="max-w-[960px]"
      testId="change-plan"
    >
      {reason === 'bookable' && (
        <Banner tone="warning" className="mb-6" title={t('settings.bill.change.bookableTitle')}>
          {t('settings.bill.change.bookableBody')}
        </Banner>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <FormStack>
          <div className="grid gap-4 sm:grid-cols-2">
            {(['independent', 'team'] as PlanType[]).map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={selected === type}
                onClick={() => setSelected(type)}
                className={`card flex flex-col gap-2 p-5 text-left transition-colors ${selected === type ? 'border-primary ring-1 ring-primary' : 'hover:border-line-strong'}`}
                data-testid={`plan-${type}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-display text-title-3 text-ink">{planName(t, type)}</span>
                  {current === type && <Chip tone="primary">{t('settings.bill.change.current')}</Chip>}
                </span>
                <span className="text-body-strong text-ink">{t(`settings.bill.plans.${type}.price`)}</span>
                <span className="text-body text-muted">{t(`settings.bill.plans.${type}.description`)}</span>
                <span className="mt-2 text-body text-ink">{t('settings.bill.change.forYou', { total: money2(planMonthly(type, type === 'independent' ? 1 : bookable)), count: PLANS[type].perMember ? bookable : 1 })}</span>
              </button>
            ))}
          </div>
          {needsKeep && (
            <FormCard title={t('settings.bill.change.keepTitle')} description={t('settings.bill.change.keepBody', { count: bookable - 1 })} testId="keep-bookable">
              <RadioGroup value={keep} onChange={setKeep} options={members.map((m) => ({ value: m.id, label: fullName(m), hint: m.jobTitle }))} />
            </FormCard>
          )}
        </FormStack>
        <aside className="card h-fit p-5 text-body">
          <h2 className="font-display text-title-3 text-ink">{t('settings.bill.change.summary')}</h2>
          <p className="mt-2 text-muted">{t('settings.bill.change.bookableCount', { count: after })}</p>
          <dl className="mt-3">
            <div className="flex justify-between py-1">
              <dt>{planName(t, selected)}</dt>
              <dd>{money2(monthly)}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt>{t('settings.bill.invoices.iva', { rate: Math.round(IVA_RATE * 100) })}</dt>
              <dd>{money2(tax)}</dd>
            </div>
            <div className="flex justify-between border-t border-line py-2 font-semibold">
              <dt>{t('settings.bill.change.totalMonthly')}</dt>
              <dd data-testid="plan-total">{money2(round2(monthly + tax))}</dd>
            </div>
            {quote && (
              <div className="flex justify-between py-1 text-muted">
                <dt>{quote.total < 0 ? t('settings.bill.change.credit') : t('settings.bill.change.dueToday')}</dt>
                <dd data-testid="plan-due">{money2(Math.abs(quote.total))}</dd>
              </div>
            )}
          </dl>
          <div className="mt-4 flex items-center justify-between gap-2">
            <CardLine compact />
            <Button variant="link" onClick={() => setCardOpen(true)}>
              {workspace.plan.card ? t('settings.bill.change.changeCard') : t('settings.bill.change.addCard')}
            </Button>
          </div>
        </aside>
      </div>
      <UpdateCardModal open={cardOpen} onClose={() => setCardOpen(false)} />
    </FullModal>
  )
}
