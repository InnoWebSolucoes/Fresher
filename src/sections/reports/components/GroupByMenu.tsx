import clsx from 'clsx'
import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { L } from '../engine/labels'
import type { GroupingOpt } from '../engine/types'
import { Pill, Popover } from './Popover'

/** Group by pill and radio list with Premium tags (reports.md §2.2). */
export function GroupByMenu({ value, options, insights, onChange, onGate }: { value: string; options: GroupingOpt[]; insights: boolean; onChange: (key: string) => void; onGate: () => void }) {
  const { t } = useTranslation()
  return (
    <Popover
      label={t('reports.page.groupBy')}
      className="max-h-[70vh] w-[320px] overflow-y-auto py-3"
      trigger={({ open, toggle }) => (
        <Pill open={open} onClick={toggle} aria-label={`${t('reports.page.groupBy')}: ${L(`dim.${value}`)}`}>
          {L(`dim.${value}`)}
          <ChevronDown size={16} className={clsx('transition-transform', open && 'rotate-180')} aria-hidden />
        </Pill>
      )}
    >
      {(close) => (
        <div role="radiogroup" aria-label={t('reports.page.groupBy')}>
          <p className="px-5 pb-2 pt-1 text-body-strong text-ink">{t('reports.page.groupBy')}</p>
          {options.map((o) => {
            const locked = Boolean(o.premium && !insights)
            return (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={value === o.key}
                onClick={() => {
                  close()
                  if (locked) onGate()
                  else onChange(o.key)
                }}
                className="flex w-full items-center gap-3 px-5 py-2.5 text-left text-body text-ink hover:bg-sunken"
              >
                <span className={clsx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2', value === o.key ? 'border-primary' : 'border-line-strong')}>
                  {value === o.key && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                </span>
                <span className="flex-1">{L(`dim.${o.key}`)}</span>
                {o.premium && <span className="chip h-6 bg-primary-subtle px-2 text-caption text-primary">{t('reports.premium')}</span>}
              </button>
            )
          })}
        </div>
      )}
    </Popover>
  )
}
