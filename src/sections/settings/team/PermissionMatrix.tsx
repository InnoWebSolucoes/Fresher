import clsx from 'clsx'
import { ArrowRight } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Checkbox, EmptyState, LearnMore, SearchInput, Switch } from '@/components/ui'
import { Banner } from '../components/ui'
import { PERMISSION_AREAS, isAreaActive, itemChecked, toggleArea, toggleItem, type AreaKey, type PermArea, type PermItem, type PermissionSet } from './catalogue'
import { Highlight, StateChip } from './parts'

/**
 * The permission matrix editor (settings-team.md §1 "Edit permissions", §8):
 * title + "Search permissions…", the "Permission area" card on the left and
 * the selected area's Active switch and grouped checkboxes on the right.
 * Used by the Edit role page and step 2 of the Add role wizard.
 */
export function PermissionMatrix({
  value,
  onChange,
  title,
  subtitle,
  above,
  note,
  onGoToInsights,
}: {
  value: PermissionSet
  /** Omit for a read-only view (Workspace owner, No access). */
  onChange?: (next: PermissionSet) => void
  title: ReactNode
  subtitle?: ReactNode
  above?: ReactNode
  note?: ReactNode
  onGoToInsights?: () => void
}) {
  const { t } = useTranslation()
  const [area, setArea] = useState<AreaKey>('calendar')
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const label = (a: AreaKey, key: string) => t(`settings.tm.perm.${a}.items.${key}`)
  const hint = (a: AreaKey, key: string) => t(`settings.tm.perm.${a}.hints.${key}`)

  /** Visible items per area while searching (all items when the area title matches). */
  const matches = useMemo(() => {
    const result = new Map<AreaKey, Set<string>>()
    if (!q) return result
    PERMISSION_AREAS.forEach((a) => {
      const titleHit = t(`settings.tm.perm.${a.key}.title`).toLowerCase().includes(q)
      const keys = new Set<string>()
      const visit = (item: PermItem): boolean => {
        const self = titleHit || label(a.key, item.key).toLowerCase().includes(q) || (item.hint === true && hint(a.key, item.key).toLowerCase().includes(q))
        const child = (item.children ?? []).map(visit).some(Boolean)
        if (self || child) keys.add(item.key)
        return self || child
      }
      a.groups.forEach((group) => group.items.forEach(visit))
      if (keys.size) result.set(a.key, keys)
    })
    return result
    // label/hint only depend on t
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, t])

  const shownAreas = q ? PERMISSION_AREAS.filter((a) => matches.has(a.key)) : PERMISSION_AREAS.filter((a) => a.key === area)

  const selectArea = (key: AreaKey) => {
    if (q) {
      document.getElementById(`perm-area-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    setArea(key)
  }

  return (
    <div>
      {above}
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[34px] font-bold leading-[42px] text-ink">{title}</h1>
          {subtitle && <p className="mt-2 text-body-lg text-muted">{subtitle}</p>}
        </div>
        <div className="w-full sm:w-[360px]">
          <SearchInput value={query} onChange={setQuery} placeholder={t('settings.tm.matrix.search')} />
        </div>
      </div>
      {note && <div className="mt-6">{note}</div>}

      <div className="mt-8 grid items-start gap-8 md:grid-cols-[280px_minmax(0,1fr)]">
        <nav aria-label={t('settings.tm.matrix.areas')} className="card p-3 md:sticky md:top-0">
          <h2 className="px-3 pb-3 pt-2 font-display text-title-3 text-ink">{t('settings.tm.matrix.areas')}</h2>
          <ul className="flex flex-col gap-0.5">
            {PERMISSION_AREAS.map((a) => {
              const Icon = a.icon
              const on = isAreaActive(value, a.key)
              const count = matches.get(a.key)?.size ?? 0
              const dim = Boolean(q) && !count
              const current = !q && a.key === area
              return (
                <li key={a.key}>
                  <button
                    type="button"
                    onClick={() => selectArea(a.key)}
                    disabled={dim}
                    aria-current={current ? 'true' : undefined}
                    data-testid={`perm-area-${a.key}`}
                    className={clsx('flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-body text-ink transition-colors', current ? 'bg-primary-subtle' : 'hover:bg-sunken', dim && 'cursor-default opacity-40 hover:bg-transparent')}
                  >
                    <Icon size={18} className="shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{t(`settings.tm.perm.${a.key}.title`)}</span>
                    {q && count > 0 && <span className="rounded-full bg-accent-subtle px-2 text-caption font-semibold text-ink">{count}</span>}
                    <span className={clsx('h-2 w-2 shrink-0 rounded-full', on ? 'bg-success' : 'bg-line-strong')} aria-hidden />
                    <span className="sr-only">{on ? t('settings.tm.matrix.active') : t('settings.tm.matrix.off')}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="min-w-0">
          {q && !shownAreas.length ? (
            <div className="card">
              <EmptyState title={t('settings.tm.matrix.noResults')} body={t('settings.tm.matrix.noResultsBody', { query: query.trim() })} action={<Button onClick={() => setQuery('')}>{t('settings.tm.matrix.clearSearch')}</Button>} />
            </div>
          ) : (
            <div className="flex flex-col gap-12">
              {shownAreas.map((a) => (
                <AreaPanel
                  key={a.key}
                  area={a}
                  value={value}
                  onChange={onChange}
                  query={q}
                  visible={q ? matches.get(a.key) : undefined}
                  label={label}
                  hint={hint}
                  onGoToInsights={onGoToInsights}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AreaPanel({
  area,
  value,
  onChange,
  query,
  visible,
  label,
  hint,
  onGoToInsights,
}: {
  area: PermArea
  value: PermissionSet
  onChange?: (next: PermissionSet) => void
  query: string
  visible?: Set<string>
  label: (a: AreaKey, key: string) => string
  hint: (a: AreaKey, key: string) => string
  onGoToInsights?: () => void
}) {
  const { t } = useTranslation()
  const active = isAreaActive(value, area.key)
  const readOnly = !onChange
  const title = t(`settings.tm.perm.${area.key}.title`)
  const show = (item: PermItem) => !visible || visible.has(item.key)

  const renderItems = (items: PermItem[], parentChecked: boolean, depth: number): ReactNode => {
    const list = items.filter(show)
    if (!list.length) return null
    return (
      <ul className={clsx('flex flex-col gap-4', depth > 0 && 'mt-4 pl-8')}>
        {list.map((item) => {
          const checked = itemChecked(value, area.key, item, parentChecked)
          const disabled = readOnly || !active || Boolean(item.locked) || !parentChecked
          return (
            <li key={item.key} data-testid={`perm-${area.key}-${item.key}`}>
              <Checkbox
                label={<Highlight text={label(area.key, item.key)} query={query} />}
                hint={item.hint ? <Highlight text={hint(area.key, item.key)} query={query} /> : undefined}
                checked={checked}
                disabled={disabled}
                onChange={(on) => onChange?.(toggleItem(value, area.key, item, on))}
              />
              {item.children && renderItems(item.children, checked, depth + 1)}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <section id={`perm-area-${area.key}`} aria-label={title} className="scroll-mt-4" data-testid="perm-area-panel">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-title-2 text-ink">
              <Highlight text={title} query={query} />
            </h2>
            <StateChip on={active} onLabel={t('settings.tm.matrix.active')} offLabel={t('settings.tm.matrix.off')} />
          </div>
          <p className="mt-1 text-body-lg text-muted">
            {t(`settings.tm.perm.${area.key}.description`)}
            {area.learnMore && (
              <>
                {' '}
                <LearnMore topic={t('settings.tm.matrix.learnTopic', { area: title })}>{t('settings.common.learnMore')}</LearnMore>
              </>
            )}
          </p>
        </div>
        <div className="shrink-0 pt-1" data-testid={`perm-area-switch-${area.key}`}>
          <Switch checked={active} disabled={readOnly} onChange={(on) => onChange?.(toggleArea(value, area.key, on))} label={<span className="sr-only">{t('settings.tm.matrix.activeSwitch', { area: title })}</span>} />
        </div>
      </div>

      <div className="mt-2">
        {area.groups.map((group) => {
          const items = renderItems(group.items, true, 0)
          if (!items) return null
          return (
            <div key={group.key} className="mt-6">
              {group.heading && <h3 className="mb-4 text-body-strong text-ink">{t(`settings.tm.perm.${area.key}.groups.${group.key}`)}</h3>}
              {items}
            </div>
          )
        })}
      </div>

      {area.insightsNote && !query && (
        <Banner tone="neutral" className="mt-8 items-center" action={onGoToInsights && <Button className="rounded-full" size="sm" iconRight={<ArrowRight size={16} aria-hidden />} onClick={onGoToInsights}>{t('settings.tm.matrix.goToInsights')}</Button>}>
          {t('settings.tm.matrix.insightsNote')}
        </Banner>
      )}
    </section>
  )
}
