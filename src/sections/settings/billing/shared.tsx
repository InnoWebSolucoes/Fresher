import { CreditCard, Download } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import { Button, Chip, Field, Modal, TextInput, toast } from '@/components/ui'
import { ApiError } from '@/api/client'
import { IVA_RATE, expiryValid, invoicePdf, luhnValid, updateCard } from '@/api/billing'
import { downloadBlob } from '@/lib/export'
import { money2, round2 } from '@/lib/format'
import type { Invoice, PlanType } from '@/types'
import { ModalForm } from '../components/ui'
import { useWorkspace } from '../hooks'

export const planName = (t: (k: string) => string, type: PlanType) => t(`settings.bill.plans.${type}.name`)

/** Pretty "4242 4242 4242 4242" while typing. */
const groupDigits = (v: string) =>
  v
    .replace(/\D/g, '')
    .slice(0, 19)
    .replace(/(.{4})/g, '$1 ')
    .trim()

/** "MM/YY" while typing. */
const formatExpiry = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 4)
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d
}

/** Card on file summary line ("Visa ending in 4417 · Expires 08/28"). */
export function CardLine({ compact }: { compact?: boolean }) {
  const { t } = useTranslation()
  const card = useWorkspace().plan.card
  if (!card) return <span className="text-body text-muted">{t('settings.bill.card.none')}</span>
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-ink md:flex-nowrap md:gap-2">
      <span className="flex h-7 w-10 shrink-0 items-center justify-center rounded-xs bg-ink text-[10px] font-bold uppercase tracking-wide text-canvas" aria-hidden>
        {card.brand === 'American Express' ? 'AMEX' : card.brand.slice(0, 4)}
      </span>
      {t('settings.bill.card.ending', { brand: card.brand, last4: card.last4 })}
      {!compact && (
        <span className="basis-full text-muted md:basis-auto">
          <span className="hidden md:inline">· </span>
          {t('settings.bill.card.expires', { expiry: card.expiry })}
        </span>
      )}
    </span>
  )
}

/** Update card form with inline validation; the API simulates declines (cards ending 0002). */
export function UpdateCardModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: () => void }) {
  const { t } = useTranslation()
  const [form, setForm] = useState({ name: '', number: '', expiry: '', cvc: '' })
  const [submitted, setSubmitted] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [lastOpen, setLastOpen] = useState(open)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setForm({ name: '', number: '', expiry: '', cvc: '' })
      setSubmitted(false)
      setApiError(null)
    }
  }
  const errors = {
    name: form.name.trim().length < 2 ? t('settings.bill.card.nameRequired') : undefined,
    number: !luhnValid(form.number) ? t('settings.bill.card.numberInvalid') : undefined,
    expiry: !expiryValid(form.expiry) ? t('settings.bill.card.expiryInvalid') : undefined,
    cvc: !/^\d{3,4}$/.test(form.cvc) ? t('settings.bill.card.cvcInvalid') : undefined,
  }
  const e = submitted ? errors : { name: undefined, number: undefined, expiry: undefined, cvc: undefined }
  const save = async () => {
    setSubmitted(true)
    setApiError(null)
    if (Object.values(errors).some(Boolean)) return
    setSaving(true)
    try {
      await updateCard(form)
      toast(t('settings.bill.card.saved'))
      onSaved?.()
      onClose()
    } catch (err) {
      setApiError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('settings.bill.card.updateTitle')}
      subtitle={t('settings.bill.card.updateHint')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()} data-testid="save-card">
            {t('settings.bill.card.save')}
          </Button>
        </>
      }
    >
      <ModalForm onSubmit={() => void save()} className="pb-2">
        {apiError && (
          <p className="rounded-md bg-danger-subtle px-4 py-3 text-body text-danger" role="alert">
            {apiError}
          </p>
        )}
        <Field label={t('settings.bill.card.name')} error={e.name}>
          {(id) => <TextInput id={id} autoComplete="cc-name" value={form.name} invalid={Boolean(e.name)} onChange={(ev) => setForm({ ...form, name: ev.target.value })} data-testid="card-name" />}
        </Field>
        <Field label={t('settings.bill.card.number')} error={e.number} hint={t('settings.bill.card.demoHint')}>
          {(id) => <TextInput id={id} inputMode="numeric" autoComplete="cc-number" prefix={<CreditCard size={16} aria-hidden />} placeholder="1234 1234 1234 1234" value={form.number} invalid={Boolean(e.number)} onChange={(ev) => setForm({ ...form, number: groupDigits(ev.target.value) })} data-testid="card-number" />}
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('settings.bill.card.expiry')} error={e.expiry}>
            {(id) => <TextInput id={id} inputMode="numeric" autoComplete="cc-exp" placeholder={t('settings.common.expiryPlaceholder')}
 value={form.expiry} invalid={Boolean(e.expiry)} onChange={(ev) => setForm({ ...form, expiry: formatExpiry(ev.target.value) })} data-testid="card-expiry" />}
          </Field>
          <Field label={t('settings.bill.card.cvc')} error={e.cvc}>
            {(id) => <TextInput id={id} inputMode="numeric" autoComplete="cc-csc" placeholder="123" maxLength={4} value={form.cvc} invalid={Boolean(e.cvc)} onChange={(ev) => setForm({ ...form, cvc: ev.target.value.replace(/\D/g, '') })} data-testid="card-cvc" />}
          </Field>
        </div>
      </ModalForm>
    </Modal>
  )
}

export async function downloadInvoice(invoice: Invoice): Promise<void> {
  const blob = await invoicePdf(invoice)
  downloadBlob(blob, `invoice-${invoice.number}.pdf`)
}

/** Rendered invoice (PDF preview) with lines, Subtotal, IVA 23% and Total. */
export function InvoicePreviewModal({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  const { t } = useTranslation()
  const workspace = useWorkspace()
  const [downloading, setDownloading] = useState(false)
  const details = workspace.plan.billingDetails
  const download = async () => {
    if (!invoice) return
    setDownloading(true)
    try {
      await downloadInvoice(invoice)
      toast(t('settings.bill.invoices.downloaded'))
    } finally {
      setDownloading(false)
    }
  }
  return (
    <Modal
      open={Boolean(invoice)}
      onClose={onClose}
      size="lg"
      title={invoice ? t('settings.bill.invoices.previewTitle', { number: invoice.number }) : ''}
      footer={
        <>
          <Button onClick={onClose}>{t('common.close')}</Button>
          <Button variant="primary" icon={<Download size={16} />} loading={downloading} onClick={() => void download()} data-testid="download-invoice">
            {t('settings.bill.invoices.downloadPdf')}
          </Button>
        </>
      }
    >
      {invoice && (
        <article className="my-2 rounded-md border border-line bg-white p-4 text-[13px] md:p-8 leading-5 text-[#1B2423] shadow-sm" data-testid="invoice-preview">
          <div className="-mx-4 -mt-4 mb-6 h-1.5 rounded-t-md bg-primary md:-mx-8 md:-mt-8" />
          <header className="flex items-start justify-between gap-3 md:gap-6">
            <div className="min-w-0">
              <p className="font-display text-[20px] font-bold">Innoweb Bookings</p>
              <p className="mt-1 text-[11px] text-[#5B6B69]">
                Innoweb Solutions, Lda
                <br />
                Rua de Santa Catarina 100, 4000-442 Porto, Portugal
                <br />
                NIF PT516000000
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-[24px] font-bold">{t('settings.bill.invoices.invoice')}</p>
              <p className="mt-1">{t('settings.bill.invoices.number', { number: invoice.number })}</p>
              <p>{t('settings.bill.invoices.dateLine', { date: format(parseISO(invoice.date), 'd MMM yyyy') })}</p>
              <Chip tone={invoice.status === 'paid' ? 'success' : 'warning'} className="mt-1">
                {t(`settings.bill.invoices.status.${invoice.status}`)}
              </Chip>
            </div>
          </header>
          <section className="mt-6">
            <p className="font-semibold">{t('settings.bill.invoices.billedTo')}</p>
            {details ? (
              <p className="text-[#3D4A48]">
                {details.businessName || `${details.firstName} ${details.lastName}`}
                <br />
                {details.firstName} {details.lastName}
                <br />
                {details.address}
                {details.vatNumber && (
                  <>
                    <br />
                    {t('settings.bill.invoices.vat', { vat: details.vatNumber })}
                  </>
                )}
              </p>
            ) : (
              <p className="text-[#3D4A48]">{workspace.name}</p>
            )}
          </section>
          <table className="mt-6 w-full border-collapse">
            <thead>
              <tr className="bg-primary text-left text-[12px] text-white">
                <th className="px-2 py-2 md:px-3 font-semibold">{t('settings.bill.invoices.description')}</th>
                <th className="px-2 py-2 md:px-3 text-right font-semibold">{t('settings.bill.invoices.qty')}</th>
                <th className="px-2 py-2 md:px-3 text-right font-semibold">{t('settings.bill.invoices.unitPrice')}</th>
                <th className="px-2 py-2 md:px-3 text-right font-semibold">{t('settings.bill.invoices.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((l, i) => (
                <tr key={i} className="border-b border-[#E3E9E8]">
                  <td className="px-2 py-2 md:px-3">{l.description}</td>
                  <td className="px-2 py-2 md:px-3 text-right">{l.quantity}</td>
                  <td className="px-2 py-2 md:px-3 text-right">{money2(l.unitPrice)}</td>
                  <td className="px-2 py-2 md:px-3 text-right">{money2(round2(l.quantity * l.unitPrice))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="ml-auto mt-4 w-full sm:w-64">
            <div className="flex justify-between py-1">
              <dt>{t('settings.bill.invoices.subtotal')}</dt>
              <dd>{money2(invoice.subtotal)}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt>{t('settings.bill.invoices.iva', { rate: Math.round(IVA_RATE * 100) })}</dt>
              <dd>{money2(invoice.tax)}</dd>
            </div>
            <div className="mt-1 flex justify-between border-t border-[#1B2423] py-2 text-[15px] font-bold">
              <dt>{t('settings.bill.invoices.total')}</dt>
              <dd>{money2(invoice.total)}</dd>
            </div>
          </dl>
          <p className="mt-6 text-[11px] text-[#5B6B69]">{workspace.plan.card ? t('settings.bill.invoices.paidWith', { brand: workspace.plan.card.brand, last4: workspace.plan.card.last4 }) : t('settings.bill.invoices.paidWithCard')}</p>
        </article>
      )}
    </Modal>
  )
}
