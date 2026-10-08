import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Checkbox, EmptyState, Field, Modal, MoneyInput, SearchInput, Segmented, Switch, TextArea, TextInput, confirm, toast, usePageLoading } from '@/components/ui'
import { useDb } from '@/store/db'
import { money } from '@/lib/format'
import type { ID, Membership, MembershipBenefit, PaletteColor } from '@/types'
import { saveMembership, type MembershipInput } from '@/api/catalog'
import { isPalette } from '../lib'
import { ColorSelect, EditorFrame, SectionCard, Stepper } from '../ui'
import { membershipColor, useBenefitLines } from './MembershipsPage'

const P = 'catalog.products2.memberships'
type SectionId = 'basic' | 'benefits' | 'pricing' | 'settings'

interface Form {
  name: string
  description: string
  color: PaletteColor
  benefits: MembershipBenefit[]
  price: number | ''
  interval: Membership['interval']
  hasFirstPeriod: boolean
  firstPeriodPrice: number | ''
  onlineSale: boolean
}

const toForm = (m?: Membership): Form => ({
  name: m?.name ?? '',
  description: m?.description ?? '',
  color: m && isPalette(m.color) ? m.color : 'blue',
  benefits: m?.benefits.map((b) => ({ ...b, serviceIds: [...b.serviceIds] })) ?? [],
  price: m?.price ?? '',
  interval: m?.interval ?? 'month',
  hasFirstPeriod: m?.firstPeriodPrice !== undefined,
  firstPeriodPrice: m?.firstPeriodPrice ?? '',
  onlineSale: m?.onlineSale ?? true,
})

/** Add / edit membership (SPEC; catalog.md §3 only captured the gate). */
export function MembershipEditorPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const loading = usePageLoading()
  const memberships = useDb((s) => s.memberships)
  const services = useDb((s) => s.services)
  const membership = id ? memberships.find((m) => m.id === id) : undefined
  const [form, setForm] = useState<Form>(() => toForm(membership))
  const [initial] = useState(() => JSON.stringify(toForm(membership)))
  const [errors, setErrors] = useState<Partial<Record<'name' | 'price' | 'benefits' | 'firstPeriodPrice', string>>>({})
  const [saving, setSaving] = useState(false)
  const [picker, setPicker] = useState<number | null>(null)
  const benefitLines = useBenefitLines()
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }))
  const setBenefit = (i: number, patch: Partial<MembershipBenefit>) => set({ benefits: form.benefits.map((b, j) => (j === i ? { ...b, ...patch } : b)) })

  const close = async () => {
    if (JSON.stringify(form) !== initial && !(await confirm({ title: t('catalog.products2.form.discardTitle'), body: t('catalog.products2.form.discardBody'), confirmLabel: t('catalog.products2.form.discard'), tone: 'danger' }))) return
    navigate('/catalogue/memberships')
  }

  const save = async () => {
    const next: typeof errors = {}
    if (!form.name.trim()) next.name = t(`${P}.nameRequired`)
    if (form.price === '' || form.price <= 0) next.price = t(`${P}.priceRequired`)
    if (!form.benefits.length || form.benefits.some((b) => !b.serviceIds.length)) next.benefits = t(`${P}.benefitsRequired`)
    if (form.hasFirstPeriod && (form.firstPeriodPrice === '' || form.firstPeriodPrice < 0)) next.firstPeriodPrice = t(`${P}.priceRequired`)
    setErrors(next)
    if (Object.keys(next).length) {
      toast(t('catalog.products2.form.fixErrors'), 'error')
      return
    }
    const input: MembershipInput = {
      name: form.name.trim(),
      description: form.description.trim(),
      color: form.color,
      benefits: form.benefits,
      price: Number(form.price),
      interval: form.interval,
      firstPeriodPrice: form.hasFirstPeriod && form.firstPeriodPrice !== '' ? form.firstPeriodPrice : undefined,
      onlineSale: form.onlineSale,
      archived: membership?.archived ?? false,
    }
    setSaving(true)
    await saveMembership(membership?.id ?? null, input)
    setSaving(false)
    toast(membership ? t(`${P}.toasts.updated`) : t(`${P}.toasts.created`))
    navigate('/catalogue/memberships')
  }

  const title = membership ? t(`${P}.editTitle`) : t(`${P}.addTitle`)
  if (id && !membership && !loading) {
    return (
      <EditorFrame title={title} onClose={() => navigate('/catalogue/memberships')} actions={null}>
        <EmptyState title={t('catalog.common.notFoundTitle')} body={t('catalog.common.notFoundBody')} action={<Button onClick={() => navigate('/catalogue/memberships')}>{t(`${P}.title`)}</Button>} />
      </EditorFrame>
    )
  }

  const interval = t(`${P}.interval.${form.interval}`)
  return (
    <EditorFrame<SectionId>
      title={title}
      loading={loading}
      onClose={() => void close()}
      actions={
        <Button variant="primary" loading={saving} onClick={() => void save()}>
          {t('catalog.common.save')}
        </Button>
      }
      nav={{
        groups: [
          {
            items: [
              { value: 'basic', label: t(`${P}.secBasic`) },
              { value: 'benefits', label: t(`${P}.secBenefits`), count: form.benefits.length },
              { value: 'pricing', label: t(`${P}.secPricing`) },
              { value: 'settings', label: t(`${P}.secSettings`) },
            ],
          },
        ],
      }}
    >
      <div className="rounded-xl p-5 text-white shadow-md md:p-6" style={{ background: membershipColor(form.color) }}>
        <p className="font-display text-title-2">{form.name || t(`${P}.previewName`)}</p>
        <p className="mt-1 text-body opacity-90">{benefitLines(form, services).join(' • ') || t(`${P}.previewBenefits`)}</p>
        <p className="mt-6 text-right font-display text-title-1">
          {money(Number(form.price) || 0)} / {interval}
        </p>
        {form.hasFirstPeriod && form.firstPeriodPrice !== '' && <p className="text-right text-body-strong opacity-90">{t(`${P}.firstPeriod`, { price: money(form.firstPeriodPrice), interval })}</p>}
      </div>

      <SectionCard id="basic" title={t(`${P}.secBasic`)}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t(`${P}.name`)} error={errors.name}>
            {(fid) => <TextInput id={fid} value={form.name} maxLength={100} invalid={Boolean(errors.name)} placeholder={t(`${P}.namePlaceholder`)} onChange={(e) => set({ name: e.target.value })} />}
          </Field>
          <Field label={t(`${P}.color`)}>{(fid) => <ColorSelect id={fid} value={form.color} onChange={(color) => set({ color })} />}</Field>
          <Field className="sm:col-span-2" label={t(`${P}.description`)} counter={{ value: form.description.length, max: 500 }}>
            {(fid) => <TextArea id={fid} value={form.description} maxLength={500} onChange={(e) => set({ description: e.target.value })} />}
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        id="benefits"
        title={t(`${P}.secBenefits`)}
        subtitle={t(`${P}.benefitsSubtitle`)}
        action={
          <Button size="sm" icon={<Plus size={16} aria-hidden />} aria-label={t(`${P}.addBenefit`)} className="max-md:h-10 max-md:w-10 max-md:px-0" onClick={() => set({ benefits: [...form.benefits, { serviceIds: [], sessions: 1 }] })}>
            <span className="hidden md:inline">{t(`${P}.addBenefit`)}</span>
          </Button>
        }
      >
        {errors.benefits && (
          <p role="alert" className="mb-3 text-small text-danger">
            {errors.benefits}
          </p>
        )}
        {form.benefits.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong px-4 py-8 text-center text-body text-muted">{t(`${P}.noBenefits`)}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {form.benefits.map((b, i) => (
              <li key={i} className="rounded-lg border border-line p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-body-strong text-ink">{t(`${P}.benefitN`, { n: i + 1 })}</p>
                    <p className="text-small text-muted">{b.serviceIds.length ? b.serviceIds.map((sid) => services.find((s) => s.id === sid)?.name).filter(Boolean).join(', ') : t(`${P}.noServices`)}</p>
                  </div>
                  <button type="button" className="icon-btn h-9 w-9 text-danger" aria-label={t('catalog.common.remove')} onClick={() => set({ benefits: form.benefits.filter((_, j) => j !== i) })}>
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 md:gap-4">
                  <Button size="sm" onClick={() => setPicker(i)}>
                    {t(`${P}.chooseServices`)}
                  </Button>
                  <Segmented<'limited' | 'unlimited'>
                    value={b.sessions === 'unlimited' ? 'unlimited' : 'limited'}
                    onChange={(v) => setBenefit(i, { sessions: v === 'unlimited' ? 'unlimited' : 1 })}
                    items={[
                      { value: 'limited', label: t(`${P}.limited`) },
                      { value: 'unlimited', label: t(`${P}.unlimited`) },
                    ]}
                  />
                  {b.sessions !== 'unlimited' && (
                    <span className="inline-flex items-center gap-2 text-body text-muted">
                      <Stepper value={b.sessions} min={1} max={99} label={t(`${P}.sessionsPer`, { interval })} onChange={(sessions) => setBenefit(i, { sessions })} />
                      {t(`${P}.sessionsPer`, { interval })}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard id="pricing" title={t(`${P}.secPricing`)}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t(`${P}.price`)} error={errors.price}>
            {(fid) => <MoneyInput id={fid} value={form.price} aria-invalid={Boolean(errors.price)} onChange={(price) => set({ price })} />}
          </Field>
          <Field label={t(`${P}.billing`)}>
            {() => (
              <Segmented<Membership['interval']>
                value={form.interval}
                onChange={(v) => set({ interval: v })}
                items={[
                  { value: 'week', label: t(`${P}.weekly`) },
                  { value: 'month', label: t(`${P}.monthly`) },
                ]}
              />
            )}
          </Field>
          <div className="sm:col-span-2">
            <Switch checked={form.hasFirstPeriod} onChange={(hasFirstPeriod) => set({ hasFirstPeriod })} label={t(`${P}.firstPeriodToggle`, { interval })} hint={t(`${P}.firstPeriodHint`)} />
          </div>
          {form.hasFirstPeriod && (
            <Field label={t(`${P}.firstPeriodPrice`, { interval })} error={errors.firstPeriodPrice}>
              {(fid) => <MoneyInput id={fid} value={form.firstPeriodPrice} aria-invalid={Boolean(errors.firstPeriodPrice)} onChange={(firstPeriodPrice) => set({ firstPeriodPrice })} />}
            </Field>
          )}
        </div>
      </SectionCard>

      <SectionCard id="settings" title={t(`${P}.secSettings`)}>
        <Switch checked={form.onlineSale} onChange={(onlineSale) => set({ onlineSale })} label={t(`${P}.onlineSale`)} hint={t(`${P}.onlineSaleHint`)} />
      </SectionCard>

      <ServicePickerModal
        open={picker !== null}
        value={picker !== null ? (form.benefits[picker]?.serviceIds ?? []) : []}
        onClose={() => setPicker(null)}
        onApply={(serviceIds) => {
          if (picker !== null) setBenefit(picker, { serviceIds })
          setPicker(null)
        }}
      />
    </EditorFrame>
  )
}

function ServicePickerModal({ open, value, onClose, onApply }: { open: boolean; value: ID[]; onClose: () => void; onApply: (ids: ID[]) => void }) {
  const { t } = useTranslation()
  const services = useDb((s) => s.services)
  const categories = useDb((s) => s.serviceCategories)
  const [selected, setSelected] = useState<ID[]>(value)
  const [query, setQuery] = useState('')
  const [lastOpen, setLastOpen] = useState(false)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setSelected(value)
      setQuery('')
    }
  }
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...categories]
      .sort((a, b) => a.order - b.order)
      .map((c) => ({ category: c, items: services.filter((s) => !s.archived && s.categoryId === c.id && (!q || s.name.toLowerCase().includes(q))) }))
      .filter((g) => g.items.length)
  }, [categories, services, query])
  const toggle = (sid: ID) => setSelected((s) => (s.includes(sid) ? s.filter((x) => x !== sid) : [...s, sid]))
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t(`${P}.chooseServices`)}
      footer={
        <>
          <Button onClick={onClose}>{t('catalog.common.cancel')}</Button>
          <Button variant="primary" onClick={() => onApply(selected)}>
            {t(`${P}.selectCount`, { count: selected.length })}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <SearchInput value={query} onChange={setQuery} placeholder={t('catalog.common.search')} />
        <div className="flex max-h-[50vh] flex-col gap-5 overflow-y-auto pr-1">
          {groups.length === 0 && <p className="py-6 text-center text-body text-muted">{t('catalog.common.noResults')}</p>}
          {groups.map((g) => (
            <fieldset key={g.category.id}>
              <legend className="mb-2 text-body-strong text-ink">{g.category.name}</legend>
              <div className="flex flex-col gap-2">
                {g.items.map((s) => (
                  <Checkbox key={s.id} label={s.name} hint={money(s.price)} checked={selected.includes(s.id)} onChange={() => toggle(s.id)} />
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </div>
    </Modal>
  )
}
