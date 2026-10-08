import clsx from 'clsx'
import { ArrowLeft, ChevronDown, ChevronRight, Heart, MoreVertical, Plus, Search, Trash2, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Avatar, Button, Field, Select } from '@/components/ui'
import { isOffMenu } from '@/api/catalog'
import { useDb } from '@/store/db'
import { PALETTE } from '@/styles/palette'
import { money } from '@/lib/format'
import { durationLabel, durationLong, todayISO } from '@/lib/time'
import type { ExtraTimeType, ID, Service, TeamMember } from '@/types'
import type { DraftItem } from '../store'
import { durationChoices, memberName } from '../lib'
import { DropMenu } from '../ui'
import { dealsForService, discounted, itemMinutes, itemPrice } from './editor'

export function useCategoryEdge() {
  const services = useDb((s) => s.services)
  const categories = useDb((s) => s.serviceCategories)
  return useMemo(() => {
    const color = new Map(categories.map((c) => [c.id, c.color]))
    const byService = new Map(services.map((s) => [s.id, PALETTE[color.get(s.categoryId) ?? 'blue'].edge]))
    return (serviceId: ID) => byService.get(serviceId) ?? PALETTE.blue.edge
  }, [services, categories])
}

const priceText = (service: Pick<Service, 'priceType' | 'price'>, t: TFunction) =>
  service.priceType === 'free' ? t('calendar.service.free') : service.priceType === 'from' ? t('calendar.service.from', { price: money(service.price) }) : money(service.price)

/** "Select a service": search, categories with counts and service rows (variants listed under their service). */
export function ServicePicker({ locationId, onPick, onBack, title }: { locationId: ID; onPick: (service: Service, variantId?: ID) => void; onBack?: () => void; title?: string }) {
  const { t } = useTranslation()
  const services = useDb((s) => s.services)
  const categories = useDb((s) => s.serviceCategories)
  const edge = useCategoryEdge()
  const [query, setQuery] = useState('')
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...categories]
      .filter((c) => !c.archived)
      .sort((a, b) => a.order - b.order)
      .map((c) => ({
        category: c,
        services: services
          .filter((s) => s.categoryId === c.id && !isOffMenu(s, categories) && s.locationIds.includes(locationId) && (!q || s.name.toLowerCase().includes(q) || s.variants.some((v) => v.name.toLowerCase().includes(q))))
          .sort((a, b) => a.order - b.order),
      }))
      .filter((g) => g.services.length)
  }, [services, categories, locationId, query])

  return (
    <div className="flex flex-col gap-5 max-md:gap-4">
      {onBack && (
        <Button size="sm" icon={<ArrowLeft size={16} />} onClick={onBack} className="self-start">
          {t('calendar.common.back')}
        </Button>
      )}
      <h2 className="font-display text-title-2 text-ink md:text-title-1">{title ?? t('calendar.service.select')}</h2>
      <label className="relative block">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('calendar.service.search')} aria-label={t('calendar.service.search')} className="input h-12 pl-11" data-testid="service-search" />
      </label>
      {groups.map(({ category, services: list }) => (
        <section key={category.id}>
          <h3 className="mb-2 flex items-center gap-2 text-title-3 font-semibold text-ink">
            {category.name} <span className="chip h-5 bg-sunken px-1.5 text-caption text-muted">{list.length}</span>
          </h3>
          <div className="flex flex-col">
            {list.map((s) => (
              <div key={s.id}>
                <button type="button" onClick={() => onPick(s)} className="flex w-full items-start gap-4 rounded-md py-3 pr-1 text-left hover:bg-sunken" data-testid={`service-option-${s.id}`}>
                  <span className="w-1 self-stretch rounded-full" style={{ background: edge(s.id) }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-lg text-ink">{s.name}</span>
                    <span className="block text-body text-muted">{durationLabel(s.durationMin)}</span>
                  </span>
                  <span className="text-body-lg text-ink">{priceText(s, t)}</span>
                </button>
                {s.variants.map((v) => (
                  <button key={v.id} type="button" onClick={() => onPick(s, v.id)} className="ml-5 flex w-[calc(100%-20px)] items-start gap-4 rounded-md py-2 pr-1 text-left hover:bg-sunken">
                    <span className="w-1 self-stretch rounded-full opacity-50" style={{ background: edge(s.id) }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-body text-ink">{v.name}</span>
                      <span className="block text-small text-muted">{durationLabel(v.durationMin)}</span>
                    </span>
                    <span className="text-body text-ink">{money(v.price)}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}
      {!groups.length && <p className="text-body text-muted">{t('calendar.service.noResults')}</p>}
    </div>
  )
}

/** Team member chip ("Any team member ▾") used before a time is chosen. */
export function MemberChip({ value, members, onChange, short }: { value: ID | null; members: TeamMember[]; onChange: (id: ID | null) => void; short?: boolean }) {
  const { t } = useTranslation()
  const current = members.find((m) => m.id === value)
  return (
    <DropMenu
      width={260}
      trigger={({ open, toggle }) => (
        <button type="button" onClick={toggle} aria-expanded={open} className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong bg-surface pl-1.5 pr-3 text-body text-ink hover:bg-sunken">
          {current ? (
            <Avatar name={memberName(current)} color={current.color} size={28} />
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-subtle text-primary">
              <UserRound size={14} aria-hidden />
            </span>
          )}
          {current ? (short ? current.firstName : memberName(current)) : t('calendar.service.anyMember')}
          <ChevronDown size={14} aria-hidden />
        </button>
      )}
      groups={[
        {
          items: [
            { label: t('calendar.service.anyMember'), checked: !value, onSelect: () => onChange(null) },
            ...members.map((m) => ({ label: memberName(m), icon: <Avatar name={memberName(m)} color={m.color} size={22} />, checked: m.id === value, onSelect: () => onChange(m.id) })),
          ],
        },
      ]}
    />
  )
}

interface LineProps {
  item: DraftItem
  start: string | null
  edgeColor: string
  members: TeamMember[]
  readOnly?: boolean
  showMemberChip?: boolean
  onEdit: () => void
  onRemove: () => void
  onMember?: (id: ID | null) => void
}

/** A service line: name, "14:00 • 1h 30min • ♥ Member", price and extra time pills. */
export function ServiceLine({ item, start, edgeColor, members, readOnly, showMemberChip, onEdit, onRemove, onMember }: LineProps) {
  const { t } = useTranslation()
  const member = members.find((m) => m.id === item.teamMemberId)
  const processing = item.extraTime.filter((e) => e.durationMin > 0)
  return (
    <div className="group relative flex gap-4" data-testid="service-line">
      <span className="w-1 shrink-0 rounded-full" style={{ background: edgeColor }} aria-hidden />
      <div className="min-w-0 flex-1 py-1">
        <button type="button" disabled={readOnly} onClick={onEdit} className="block w-full text-left disabled:cursor-default">
          <span className="flex items-start justify-between gap-3">
            <span className="text-body-lg text-ink">{item.name}</span>
            <span className="shrink-0 text-right text-body-lg text-ink">
              {money(itemPrice(item))}
              {item.originalPrice !== undefined && item.originalPrice !== item.price && <span className="ml-1.5 text-body text-muted line-through">{money(item.originalPrice)}</span>}
            </span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1 text-body text-muted">
            {start && <span className="tabular">{start} •</span>}
            <span>{durationLabel(item.durationMin)}</span>
            {!showMemberChip && (
              <>
                <span>•</span>
                {item.preferred && <Heart size={13} className="fill-danger text-danger" aria-label={t('calendar.service.preferred')} />}
                <span>{member ? memberName(member) : t('calendar.service.anyMember')}</span>
              </>
            )}
          </span>
          {item.priceNote && <span className="mt-1 block text-small text-primary">{item.priceNote}</span>}
        </button>
        {processing.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {processing.map((e, i) => (
              <span key={i} className="chip h-6 border border-line bg-surface text-caption text-muted">
                {t(`calendar.service.extraPill.${e.type}`, { duration: durationLabel(e.durationMin) })}
              </span>
            ))}
          </div>
        )}
        {showMemberChip && onMember && (
          <div className="mt-2">
            <MemberChip value={item.teamMemberId} members={members} onChange={onMember} />
          </div>
        )}
      </div>
      {!readOnly && (
        <div className="absolute -top-1 right-0 hidden gap-1 rounded-md bg-surface p-0.5 shadow-sm group-focus-within:flex group-hover:flex">
          <Button size="sm" variant="ghost" onClick={onEdit}>
            {t('calendar.service.edit')}
          </Button>
          <Button size="sm" variant="ghost" className="!text-danger" onClick={onRemove}>
            {t('calendar.service.remove')}
          </Button>
        </div>
      )}
    </div>
  )
}

const EXTRA_TYPES: ExtraTimeType[] = ['processing', 'blocked', 'servicing']

/** "Edit service" (calendar.md §7.2). */
export function EditServicePanel({ item, members, onBack, onApply, onDelete, onChangeService }: { item: DraftItem; members: TeamMember[]; onBack: () => void; onApply: (item: DraftItem) => void; onDelete: () => void; onChangeService: () => void }) {
  const { t } = useTranslation()
  const deals = useDb((s) => s.deals)
  const service = useDb((s) => s.services.find((x) => x.id === item.serviceId))
  const edge = useCategoryEdge()
  const [draft, setDraft] = useState<DraftItem>(item)
  const basePrice = draft.originalPrice ?? draft.price
  const available = useMemo(() => dealsForService(deals, draft.serviceId, todayISO()), [deals, draft.serviceId])
  const eligible = members.filter((m) => !service || ((m.serviceIds === 'all' || m.serviceIds.includes(service.id)) && (service.teamMemberIds === 'all' || service.teamMemberIds.includes(m.id))))
  const durations = durationChoices()
  const durationOptions = (current: number) => [...new Set([...durations, current])].sort((a, b) => a - b).map((m) => ({ value: String(m), label: durationLong(m) }))

  const setDeal = (dealId: string) => {
    const deal = available.find((d) => d.id === dealId)
    if (!deal) return setDraft((d) => ({ ...d, dealId: undefined, price: basePrice, originalPrice: undefined, priceNote: undefined }))
    setDraft((d) => ({ ...d, dealId: deal.id, originalPrice: basePrice, price: discounted(basePrice, deal), priceNote: deal.name }))
  }

  const moveExtra = (index: number, dir: -1 | 1) =>
    setDraft((d) => {
      const list = [...d.extraTime]
      const target = index + dir
      if (target < 0 || target >= list.length) return d
      ;[list[index], list[target]] = [list[target], list[index]]
      return { ...d, extraTime: list }
    })

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6">
        <Button size="sm" icon={<ArrowLeft size={16} />} onClick={onBack}>
          {t('calendar.common.back')}
        </Button>
        <h2 className="mt-4 font-display text-title-2 text-ink md:text-title-1">{t('calendar.service.editTitle')}</h2>
        <button type="button" onClick={onChangeService} className="mt-6 flex w-full items-center gap-4 rounded-lg border border-line p-4 text-left hover:bg-sunken">
          <span className="w-1 self-stretch rounded-full" style={{ background: edge(draft.serviceId) }} aria-hidden />
          <span className="flex-1 text-body-lg text-ink">
            {draft.name}, {durationLabel(itemMinutes(draft))}
          </span>
          <ChevronRight size={18} className="text-muted" aria-hidden />
        </button>
        <div className="mt-6 grid grid-cols-2 gap-4 max-md:gap-3">
          <Field label={t('calendar.service.price')}>
            {(id) => (
              <div className="flex h-11 items-center rounded-sm border border-line-strong bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
                <span className="pl-3 text-body text-muted">EUR</span>
                <input
                  id={id}
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.price}
                  onChange={(e) => setDraft((d) => ({ ...d, price: Math.max(0, Number(e.target.value) || 0), dealId: undefined, priceNote: undefined, originalPrice: undefined }))}
                  className="h-full min-w-0 flex-1 bg-transparent px-3 text-body text-ink outline-none"
                  data-testid="service-price"
                />
              </div>
            )}
          </Field>
          <Field label={t('calendar.service.discount')}>
            {(id) => (
              <Select
                id={id}
                value={draft.dealId ?? ''}
                disabled={!available.length}
                onChange={(e) => setDeal(e.target.value)}
                options={[{ value: '', label: t('calendar.service.noDiscount') }, ...available.map((d) => ({ value: d.id, label: `${d.name} (${d.discountType === 'percent' ? `${d.value}%` : money(d.value)} ${t('calendar.service.off')})` }))]}
              />
            )}
          </Field>
        </div>
        <div className="mt-5">
          <Field label={t('calendar.service.teamMember')}>
            {(id) => (
              <div className="flex gap-3">
                <Select
                  id={id}
                  value={draft.teamMemberId ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, teamMemberId: e.target.value || null, preferred: e.target.value ? d.preferred : false }))}
                  options={[{ value: '', label: t('calendar.service.anyMember') }, ...eligible.map((m) => ({ value: m.id, label: memberName(m) }))]}
                />
                <button
                  type="button"
                  disabled={!draft.teamMemberId}
                  aria-pressed={draft.preferred}
                  aria-label={t('calendar.service.preferred')}
                  title={t('calendar.service.preferred')}
                  onClick={() => setDraft((d) => ({ ...d, preferred: !d.preferred }))}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-line-strong hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Heart size={18} className={clsx(draft.preferred ? 'fill-danger text-danger' : 'text-muted')} aria-hidden />
                </button>
              </div>
            )}
          </Field>
        </div>
        <div className="mt-5 flex flex-col gap-3">
          {draft.extraTime.length === 0 ? (
            <Field label={t('calendar.service.duration')}>
              {(id) => <Select id={id} value={String(draft.durationMin)} onChange={(e) => setDraft((d) => ({ ...d, durationMin: Number(e.target.value) }))} options={durationOptions(draft.durationMin)} />}
            </Field>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_170px_36px] gap-3 text-body-strong text-ink max-md:grid-cols-[1fr_112px_36px] max-md:gap-2">
                <span>{t('calendar.service.durationType')}</span>
                <span>{t('calendar.service.duration')}</span>
                <span />
              </div>
              <div className="grid grid-cols-[1fr_170px_36px] items-center gap-3 max-md:grid-cols-[1fr_112px_36px] max-md:gap-2">
                <Select aria-label={t('calendar.service.durationType')} value="servicing_main" disabled options={[{ value: 'servicing_main', label: t('calendar.service.servicingTime') }]} />
                <Select aria-label={t('calendar.service.duration')} value={String(draft.durationMin)} onChange={(e) => setDraft((d) => ({ ...d, durationMin: Number(e.target.value) }))} options={durationOptions(draft.durationMin)} />
                <span />
              </div>
              {draft.extraTime.map((extra, index) => (
                <div key={index} className="grid grid-cols-[1fr_170px_36px] items-center gap-3 max-md:grid-cols-[1fr_112px_36px] max-md:gap-2">
                  <Select
                    aria-label={t('calendar.service.durationType')}
                    value={extra.type}
                    onChange={(e) => setDraft((d) => ({ ...d, extraTime: d.extraTime.map((x, i) => (i === index ? { ...x, type: e.target.value as ExtraTimeType } : x)) }))}
                    options={EXTRA_TYPES.map((type) => ({ value: type, label: t(`calendar.service.extra.${type}`) }))}
                  />
                  <Select
                    aria-label={t('calendar.service.duration')}
                    value={String(extra.durationMin)}
                    onChange={(e) => setDraft((d) => ({ ...d, extraTime: d.extraTime.map((x, i) => (i === index ? { ...x, durationMin: Number(e.target.value) } : x)) }))}
                    options={durationOptions(extra.durationMin)}
                  />
                  <DropMenu
                    align="right"
                    width={170}
                    trigger={({ toggle }) => (
                      <button type="button" onClick={toggle} aria-label={t('calendar.service.more')} className="icon-btn h-9 w-9">
                        <MoreVertical size={18} aria-hidden />
                      </button>
                    )}
                    groups={[
                      {
                        items: [
                          { label: t('calendar.service.moveUp'), disabled: index === 0, onSelect: () => moveExtra(index, -1) },
                          { label: t('calendar.service.moveDown'), disabled: index === draft.extraTime.length - 1, onSelect: () => moveExtra(index, 1) },
                          { label: t('calendar.service.remove'), danger: true, onSelect: () => setDraft((d) => ({ ...d, extraTime: d.extraTime.filter((_, i) => i !== index) })) },
                        ],
                      },
                    ]}
                  />
                </div>
              ))}
            </>
          )}
          <DropMenu
            width={340}
            trigger={({ open, toggle }) => (
              <Button onClick={toggle} aria-expanded={open} icon={<Plus size={16} />} className="self-start rounded-full">
                {t('calendar.service.addExtra')}
              </Button>
            )}
            groups={[
              {
                items: EXTRA_TYPES.map((type) => ({
                  label: t(`calendar.service.extra.${type}`),
                  hint: t(`calendar.service.extraHint.${type}`),
                  onSelect: () => setDraft((d) => ({ ...d, extraTime: [...d.extraTime, { type, durationMin: 10 }] })),
                })),
              },
            ]}
          />
        </div>
      </div>
      <div className="border-t border-line px-4 py-3 md:px-8 md:py-5">
        <div className="mb-4 flex items-center justify-between text-body-lg max-md:mb-3">
          <span className="font-semibold text-ink">{t('calendar.totals.total')}</span>
          <span>
            <span className="text-muted">{durationLabel(itemMinutes(draft))}</span> <b className="text-ink">{money(itemPrice(draft))}</b>
          </span>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onDelete} aria-label={t('calendar.service.delete')} title={t('calendar.service.delete')} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line-strong text-danger hover:bg-danger-subtle">
            <Trash2 size={18} aria-hidden />
          </button>
          <Button variant="primary" size="lg" className="flex-1" onClick={() => onApply(draft)} data-testid="service-apply">
            {t('calendar.service.apply')}
          </Button>
        </div>
      </div>
    </div>
  )
}
