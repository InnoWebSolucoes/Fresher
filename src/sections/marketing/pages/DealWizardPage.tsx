import clsx from 'clsx'
import { CalendarDays, Lightbulb, Tag, Ticket, Timer, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useDb } from '@/store/db'
import type { Deal, ID } from '@/types'
import { Button, Checkbox, EmptyState, Field, Modal, MoneyInput, Select, Switch, TextArea, TextInput, toast } from '@/components/ui'
import { ApiError } from '@/api/client'
import { saveDeal, type DealDraft } from '@/api/marketing'
import { todayISO } from '@/lib/time'
import { fmtDate } from '@/lib/format'
import { SuccessBadge, UnitToggle, WizardFrame, WizardTitle } from '../components/kit'
import { discountLabel, useDealScope } from '../helpers'

const STEPS = ['type', 'details', 'limits', 'team'] as const
type Step = (typeof STEPS)[number] | 'done'
type ScopeKey = 'services' | 'products' | 'packages' | 'memberships'

function defaultsFor(type: Deal['type']): Pick<DealDraft, 'appliesTo' | 'pos'> {
  if (type === 'last_minute') return { appliesTo: { services: 'all', products: [], packages: [], memberships: [], giftCards: false }, pos: false }
  if (type === 'flash_sale') return { appliesTo: { services: 'all', products: 'all', packages: [], memberships: [], giftCards: false }, pos: true }
  return { appliesTo: { services: 'all', products: 'all', packages: 'all', memberships: 'all', giftCards: true }, pos: true }
}

const blank = (): DealDraft => ({
  type: 'promotion',
  name: '',
  description: '',
  discountType: 'percent',
  value: 10,
  code: '',
  startsAt: todayISO(),
  endsAt: undefined,
  lastMinuteHours: 4,
  limits: { onePerClient: false },
  teamMemberIds: 'all',
  ...defaultsFor('promotion'),
})

type Errors = Partial<Record<'name' | 'value' | 'code' | 'endsAt' | 'team' | 'totalUses' | 'minPurchase', string>>

export function ScopeModal({ open, scopeKey, value, onClose, onApply }: { open: boolean; scopeKey: ScopeKey; value: 'all' | ID[]; onClose: () => void; onApply: (v: 'all' | ID[]) => void }) {
  const { t } = useTranslation()
  const services = useDb((s) => s.services)
  const products = useDb((s) => s.products)
  const packages = useDb((s) => s.packages)
  const memberships = useDb((s) => s.memberships)
  const items = useMemo(() => {
    const list = { services, products, packages, memberships }[scopeKey] as { id: ID; name: string; archived: boolean }[]
    return list.filter((x) => !x.archived)
  }, [scopeKey, services, products, packages, memberships])
  const [selected, setSelected] = useState<Set<ID>>(() => new Set(value === 'all' ? items.map((i) => i.id) : value))
  const all = selected.size === items.length
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t(`marketing.dealWizard.scopeTitle.${scopeKey}`)}
      footer={
        <>
          <Button onClick={onClose}>{t('marketing.common.cancel')}</Button>
          <Button variant="primary" onClick={() => onApply(all ? 'all' : [...selected])}>
            {t('marketing.common.apply')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <Checkbox label={<span className="font-semibold">{t(`marketing.deals.scope.all_${scopeKey}`)}</span>} checked={all} onChange={(v) => setSelected(new Set(v ? items.map((i) => i.id) : []))} />
        <div className="ml-2 flex max-h-[50vh] flex-col gap-2 overflow-y-auto border-l border-line pl-4">
          {items.map((i) => (
            <Checkbox
              key={i.id}
              label={i.name}
              checked={selected.has(i.id)}
              onChange={(v) => {
                const next = new Set(selected)
                if (v) next.add(i.id)
                else next.delete(i.id)
                setSelected(next)
              }}
            />
          ))}
          {!items.length && <p className="text-body text-muted">{t('marketing.dealWizard.noItems')}</p>}
        </div>
      </div>
    </Modal>
  )
}

export function DealWizardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { step: stepParam = 'type', id } = useParams()
  const [params] = useSearchParams()
  const deals = useDb((s) => s.deals)
  const services = useDb((s) => s.services)
  const teamMembers = useDb((s) => s.teamMembers)
  const scope = useDealScope()
  const existing = id ? deals.find((d) => d.id === id) : undefined
  const [draft, setDraft] = useState<DealDraft>(() => (existing ? { ...existing, code: existing.code ?? '' } : blank()))
  const [errors, setErrors] = useState<Errors>({})
  const [scopeModal, setScopeModal] = useState<ScopeKey | null>(null)
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<DealDraft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    // Editing a field clears its error.
    const touched = Object.keys(patch).flatMap((k) => (k === 'limits' ? ['totalUses', 'minPurchase'] : k === 'teamMemberIds' ? ['team'] : [k]))
    setErrors((e) => {
      if (!touched.some((k) => k in e)) return e
      const next = { ...e }
      touched.forEach((k) => delete next[k as keyof Errors])
      return next
    })
  }
  const step = stepParam as Step
  const index = STEPS.indexOf(step as (typeof STEPS)[number])
  const base = existing ? `/marketing/deals/edit/${existing.id}` : '/marketing/deals/new'
  const members = teamMembers.filter((m) => !m.archived && m.bookable)
  const selectedMembers = draft.teamMemberIds === 'all' ? members.map((m) => m.id) : draft.teamMemberIds
  const typeKey = draft.type

  if (id && !existing) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState title={t('marketing.dealWizard.notFound')} action={<Button onClick={() => navigate('/marketing/deals/list')}>{t('marketing.dealWizard.backToDeals')}</Button>} />
      </div>
    )
  }

  if (step === 'done') {
    const created = deals.find((d) => d.id === params.get('id'))
    if (!created) {
      return (
        <div className="flex h-full items-center justify-center">
          <EmptyState title={t('marketing.dealWizard.notFound')} action={<Button onClick={() => navigate('/marketing/deals/list')}>{t('marketing.dealWizard.backToDeals')}</Button>} />
        </div>
      )
    }
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(created.code ?? '')
      } catch {
        /* clipboard may be blocked; the toast still confirms the code */
      }
      toast(t('marketing.dealWizard.codeCopied', { code: created.code }))
    }
    return (
      <WizardFrame
        actions={
          <Button variant="primary" onClick={() => navigate('/marketing/deals/list')} data-testid="deal-done">
            {t('marketing.common.done')}
          </Button>
        }
      >
        <div className="flex flex-col items-center pt-8 text-center">
          <SuccessBadge />
          <h1 className="mt-6 font-display text-[26px] font-bold leading-[32px] text-ink md:text-[30px] md:leading-[inherit]">{t(`marketing.dealWizard.done.title.${created.type}`)}</h1>
        </div>
        <section className="card mt-6 p-5 md:mt-8 md:p-8">
          <h2 className="mb-4 text-body-lg font-semibold text-ink">{t(`marketing.dealWizard.done.details.${created.type}`)}</h2>
          <ul className="flex flex-col gap-3 text-body-lg text-ink">
            <li className="flex items-start gap-3">
              <Tag size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden />
              {t('marketing.dealWizard.done.discount', { value: discountLabel(created), scope: scope(created, services) })}
            </li>
            <li className="flex items-start gap-3">
              <Ticket size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden />
              {created.pos ? t(`marketing.dealWizard.done.pos.${created.type}`) : t(`marketing.dealWizard.done.online.${created.type}`)}
            </li>
            {created.type === 'last_minute' && (
              <li className="flex items-start gap-3">
                <Timer size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                {t('marketing.dealWizard.done.lastMinute', { count: created.lastMinuteHours ?? 4 })}
              </li>
            )}
            <li className="flex items-start gap-3">
              <CalendarDays size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden />
              {created.endsAt ? t('marketing.dealWizard.done.datesUntil', { from: fmtDate(created.startsAt), to: fmtDate(created.endsAt) }) : t('marketing.dealWizard.done.datesOngoing', { from: fmtDate(created.startsAt) })}
            </li>
          </ul>
        </section>
        {created.code && (
          <section className="card mt-4 flex flex-wrap items-center justify-between gap-4 px-5 py-4 md:flex-nowrap md:px-8 md:py-5">
            <span className="flex flex-wrap items-center gap-3 text-body-lg text-ink md:flex-nowrap">
              <Ticket size={20} className="text-primary" aria-hidden />
              {t('marketing.dealWizard.done.code')}
              <span className="rounded-sm bg-sunken px-2 py-0.5 font-mono text-body-strong">{created.code}</span>
            </span>
            <Button className="rounded-full" onClick={() => void copy()}>
              {t('marketing.common.copy')}
            </Button>
          </section>
        )}
        <div className="mt-6 text-center">
          <Button variant="link" onClick={() => navigate(`/marketing/blast-campaigns/new?deal=${created.id}`)}>
            {t('marketing.dealWizard.done.share')}
          </Button>
        </div>
      </WizardFrame>
    )
  }

  const validate = (s: Step): boolean => {
    const e: Errors = {}
    if (s === 'details') {
      if (!draft.name.trim()) e.name = t('marketing.kit.required')
      if (!(draft.value > 0)) e.value = t('marketing.dealWizard.errors.value')
      else if (draft.discountType === 'percent' && draft.value > 100) e.value = t('marketing.dealWizard.errors.percent')
      if (draft.type === 'promotion') {
        const code = (draft.code ?? '').trim()
        if (!code) e.code = t('marketing.kit.required')
        else if (!/^[A-Za-z0-9]{3,20}$/.test(code)) e.code = t('marketing.dealWizard.errors.code')
      }
      if (draft.endsAt && draft.endsAt < draft.startsAt) e.endsAt = t('marketing.dealWizard.errors.endsAt')
    }
    if (s === 'limits') {
      if (draft.limits.totalUses !== undefined && !(draft.limits.totalUses > 0)) e.totalUses = t('marketing.dealWizard.errors.positive')
      if (draft.limits.minPurchase !== undefined && !(draft.limits.minPurchase > 0)) e.minPurchase = t('marketing.dealWizard.errors.positive')
    }
    if (s === 'team' && selectedMembers.length === 0) e.team = t('marketing.dealWizard.errors.team')
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const finish = async () => {
    if (!validate('team') || !validate('details')) return
    setSaving(true)
    try {
      const saved = await saveDeal({ ...draft, name: draft.name.trim(), code: draft.type === 'promotion' ? draft.code?.trim().toUpperCase() : undefined }, existing?.id)
      if (existing) {
        toast(t('marketing.dealWizard.updated'))
        navigate('/marketing/deals/list')
      } else {
        toast(t('marketing.dealWizard.created'))
        navigate(`/marketing/deals/new/done?id=${saved.id}`, { replace: true })
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'code_taken') {
        setErrors({ code: t('marketing.dealWizard.errors.codeTaken') })
        navigate(`${base}/details`)
      } else throw err
    } finally {
      setSaving(false)
    }
  }

  const next = () => {
    if (!validate(step)) return
    if (step === 'team') void finish()
    else navigate(`${base}/${STEPS[index + 1]}`)
  }

  const scopeRow = (key: ScopeKey) => {
    const value = draft.appliesTo[key]
    const raw = value === 'all' ? t(`marketing.deals.scope.all_${key}`) : value.length ? t(`marketing.deals.scope.count_${key}`, { count: value.length }) : t('marketing.dealWizard.none')
    const label = raw.charAt(0).toUpperCase() + raw.slice(1)
    return (
      <div key={key} className="flex items-center justify-between gap-4 py-3">
        <div>
          <p className="text-body-strong text-ink">{t(`marketing.dealWizard.selected.${key}`)}</p>
          <p className="text-body text-muted">{label}</p>
        </div>
        <Button size="sm" className="rounded-full max-md:h-10 max-md:px-4" onClick={() => setScopeModal(key)}>
          {t('marketing.common.edit')}
        </Button>
      </div>
    )
  }

  const typeCards = [
    { value: 'promotion' as const, icon: Ticket },
    { value: 'flash_sale' as const, icon: Zap },
    { value: 'last_minute' as const, icon: Timer },
  ]

  return (
    <WizardFrame
      segments={STEPS.map((_, i) => (i <= index ? 1 : 0))}
      onBack={index > 0 ? () => navigate(`${base}/${STEPS[index - 1]}`) : undefined}
      actions={
        <>
          <Button onClick={() => navigate(existing ? '/marketing/deals/list' : '/marketing/deals')}>{t('marketing.common.close')}</Button>
          <Button variant="primary" loading={saving} onClick={next} data-testid="deal-continue">
            {step === 'team' ? (existing ? t('marketing.common.save') : t('marketing.dealWizard.create')) : t('marketing.common.continue')}
          </Button>
        </>
      }
    >
      {step === 'type' && (
        <>
          <WizardTitle title={t('marketing.dealWizard.type.title')} subtitle={t('marketing.dealWizard.type.subtitle')} />
          <div className="flex flex-col gap-3" role="radiogroup">
            {typeCards.map(({ value, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={draft.type === value}
                disabled={Boolean(existing) && existing?.type !== value}
                onClick={() => set({ type: value, ...defaultsFor(value), code: value === 'promotion' ? draft.code : '' })}
                className={clsx('flex items-center gap-4 rounded-lg border bg-surface p-4 text-left transition-colors md:p-5 disabled:cursor-not-allowed disabled:opacity-50', draft.type === value ? 'border-primary ring-1 ring-primary' : 'border-line hover:border-line-strong')}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-body-lg font-semibold text-ink">{t(`marketing.deals.types.${value}`)}</span>
                  <span className="mt-1 block text-body text-muted">{t(`marketing.dealWizard.type.${value}`)}</span>
                </span>
                <Icon size={28} className="shrink-0 text-ink" aria-hidden />
              </button>
            ))}
          </div>
        </>
      )}

      {step === 'details' && (
        <>
          <WizardTitle title={t(`marketing.dealWizard.details.title.${typeKey}`)} subtitle={t(`marketing.dealWizard.details.subtitle.${typeKey}`)} />
          <div className="flex flex-col gap-6">
            <Field label={t('marketing.dealWizard.details.name')} error={errors.name}>
              {(fid) => <TextInput id={fid} value={draft.name} invalid={Boolean(errors.name)} placeholder={t(`marketing.dealWizard.details.namePlaceholder.${typeKey}`)} onChange={(e) => set({ name: e.target.value })} />}
            </Field>
            <Field label={t('marketing.dealWizard.details.description')} optional counter={{ value: draft.description.length, max: 600 }}>
              {(fid) => <TextArea id={fid} rows={4} maxLength={600} value={draft.description} placeholder={t(`marketing.dealWizard.details.descriptionPlaceholder.${typeKey}`)} onChange={(e) => set({ description: e.target.value })} />}
            </Field>
            <Field label={t('marketing.dealWizard.details.value')} error={errors.value}>
              {(fid) => (
                <div className="flex gap-2">
                  <TextInput
                    id={fid}
                    className="flex-1"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    prefix={draft.discountType === 'percent' ? '%' : '€'}
                    invalid={Boolean(errors.value)}
                    value={Number.isFinite(draft.value) ? draft.value : ''}
                    onChange={(e) => set({ value: Number(e.target.value) })}
                  />
                  <UnitToggle value={draft.discountType} onChange={(discountType) => set({ discountType })} labels={{ percent: t('marketing.dealWizard.percentage'), amount: t('marketing.dealWizard.amount') }} />
                </div>
              )}
            </Field>
            {draft.type === 'promotion' && (
              <>
                <Field label={t('marketing.dealWizard.details.code')} error={errors.code} hint={t('marketing.dealWizard.details.codeHint')}>
                  {(fid) => <TextInput id={fid} value={draft.code ?? ''} invalid={Boolean(errors.code)} maxLength={20} placeholder={t('marketing.dealWizard.details.codePlaceholder')} onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/\s/g, '') })} />}
                </Field>
                <div className="flex gap-3 rounded-lg bg-primary-subtle/50 p-4">
                  <Lightbulb size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                  <div className="text-body">
                    <p className="font-semibold text-ink">{t('marketing.dealWizard.details.codeNoteTitle')}</p>
                    <p className="text-ink">{t('marketing.dealWizard.details.codeNoteBody')}</p>
                  </div>
                </div>
              </>
            )}
            {draft.type === 'last_minute' && (
              <Field label={t('marketing.dealWizard.details.hours')} hint={t('marketing.dealWizard.details.hoursHint')}>
                {(fid) => (
                  <Select
                    id={fid}
                    value={String(draft.lastMinuteHours ?? 4)}
                    onChange={(e) => set({ lastMinuteHours: Number(e.target.value) })}
                    options={[1, 2, 3, 4, 6, 12, 24, 48].map((h) => ({ value: String(h), label: t('marketing.dealWizard.details.hoursOption', { count: h }) }))}
                  />
                )}
              </Field>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t(`marketing.dealWizard.details.starts.${typeKey}`)}>
                {(fid) => <TextInput id={fid} type="date" value={draft.startsAt} onChange={(e) => set({ startsAt: e.target.value || todayISO() })} />}
              </Field>
              <Field label={t(`marketing.dealWizard.details.ends.${typeKey}`)} error={errors.endsAt}>
                {(fid) => (
                  <div className="flex flex-col gap-2">
                    <Select
                      id={fid}
                      value={draft.endsAt ? 'date' : 'never'}
                      onChange={(e) => set({ endsAt: e.target.value === 'date' ? draft.startsAt : undefined })}
                      options={[
                        { value: 'never', label: t('marketing.dealWizard.details.never') },
                        { value: 'date', label: t('marketing.dealWizard.details.onDate') },
                      ]}
                    />
                    {draft.endsAt && <TextInput type="date" aria-label={t(`marketing.dealWizard.details.ends.${typeKey}`)} min={draft.startsAt} value={draft.endsAt} invalid={Boolean(errors.endsAt)} onChange={(e) => set({ endsAt: e.target.value || undefined })} />}
                  </div>
                )}
              </Field>
            </div>
            {draft.type !== 'last_minute' && (
              <div className="card p-4 md:p-5">
                <Switch
 checked={draft.pos} onChange={(pos) => set({ pos })} label={t(`marketing.dealWizard.details.pos.${typeKey}`)} hint={t('marketing.dealWizard.details.posHint')} />
              </div>
            )}
            <div>
              <h2 className="mb-1 text-body-lg font-semibold text-ink">{t(`marketing.dealWizard.details.applyTo.${typeKey}`)}</h2>
              <div className="card divide-y divide-line px-4 md:px-5">
                {(draft.type === 'last_minute' ? (['services'] as ScopeKey[]) : draft.type === 'flash_sale' ? (['services', 'products'] as ScopeKey[]) : (['services', 'products', 'packages', 'memberships'] as ScopeKey[])).map(scopeRow)}
                {draft.type === 'promotion' && (
                  <div className="py-3">
                    <Switch checked={draft.appliesTo.giftCards} onChange={(giftCards) => set({ appliesTo: { ...draft.appliesTo, giftCards } })} label={t('marketing.dealWizard.details.giftCards')} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {step === 'limits' && (
        <>
          <WizardTitle title={t(`marketing.dealWizard.limits.title.${typeKey}`)} subtitle={t(`marketing.dealWizard.limits.subtitle.${typeKey}`)} />
          <div className="card flex flex-col divide-y divide-line px-4 md:px-6">
            <div className="py-5">
              <Switch checked={draft.limits.onePerClient} onChange={(onePerClient) => set({ limits: { ...draft.limits, onePerClient } })} label={t('marketing.dealWizard.limits.onePerClient')} hint={t('marketing.dealWizard.limits.onePerClientHint')} />
            </div>
            <div className="py-5">
              <Switch checked={draft.limits.totalUses !== undefined} onChange={(v) => set({ limits: { ...draft.limits, totalUses: v ? 100 : undefined } })} label={t('marketing.dealWizard.limits.totalUses')} hint={t('marketing.dealWizard.limits.totalUsesHint')} />
              {draft.limits.totalUses !== undefined && (
                <Field className="mt-4 max-w-xs" label={t('marketing.dealWizard.limits.maxUses')} error={errors.totalUses}>
                  {(fid) => <TextInput id={fid} type="number" min={1} value={draft.limits.totalUses ?? ''} invalid={Boolean(errors.totalUses)} onChange={(e) => set({ limits: { ...draft.limits, totalUses: Number(e.target.value) } })} />}
                </Field>
              )}
            </div>
            <div className="py-5">
              <Switch checked={draft.limits.minPurchase !== undefined} onChange={(v) => set({ limits: { ...draft.limits, minPurchase: v ? 30 : undefined } })} label={t('marketing.dealWizard.limits.minPurchase')} hint={t('marketing.dealWizard.limits.minPurchaseHint')} />
              {draft.limits.minPurchase !== undefined && (
                <Field className="mt-4 max-w-xs" label={t('marketing.dealWizard.limits.minAmount')} error={errors.minPurchase}>
                  {(fid) => <MoneyInput id={fid} value={draft.limits.minPurchase ?? ''} onChange={(v) => set({ limits: { ...draft.limits, minPurchase: v === '' ? 0 : v } })} />}
                </Field>
              )}
            </div>
          </div>
        </>
      )}

      {step === 'team' && (
        <>
          <WizardTitle title={t('marketing.dealWizard.team.title')} subtitle={t(`marketing.dealWizard.team.subtitle.${typeKey}`)} />
          <div className="card flex flex-col gap-3 p-4 md:p-6">
            <Checkbox
              label={<span className="font-semibold">{t('marketing.common.selectAll')}</span>}
              checked={selectedMembers.length === members.length}
              onChange={(v) => set({ teamMemberIds: v ? 'all' : [] })}
            />
            <div className="flex flex-col gap-3 border-t border-line pt-3">
              {members.map((m) => (
                <Checkbox
                  key={m.id}
                  label={`${m.firstName} ${m.lastName}`}
                  hint={m.jobTitle}
                  checked={selectedMembers.includes(m.id)}
                  onChange={(v) => {
                    const ids = v ? [...selectedMembers, m.id] : selectedMembers.filter((x) => x !== m.id)
                    set({ teamMemberIds: ids.length === members.length ? 'all' : ids })
                  }}
                />
              ))}
            </div>
            {errors.team && <p className="text-small text-danger">{errors.team}</p>}
          </div>
        </>
      )}

      {scopeModal && (
        <ScopeModal
          open
          scopeKey={scopeModal}
          value={draft.appliesTo[scopeModal]}
          onClose={() => setScopeModal(null)}
          onApply={(v) => {
            set({ appliesTo: { ...draft.appliesTo, [scopeModal]: v } })
            setScopeModal(null)
          }}
        />
      )}
    </WizardFrame>
  )
}
