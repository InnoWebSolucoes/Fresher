import clsx from 'clsx'
import { Check, ChevronDown, Plus } from 'lucide-react'
import { forwardRef, useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useDb } from '@/store/db'
import { useDismiss } from '@/lib/useDismiss'
import type { PermissionRole } from '@/lib/permissions'

/** Permission role listbox with descriptions and "+ Add new permission role" (team.md §2.6, team-67). */
export const RoleSelect = forwardRef<HTMLButtonElement, { value: string; onChange: (role: PermissionRole) => void; disabled?: boolean; id?: string; inline?: boolean }>(function RoleSelect({ value, onChange, disabled, id, inline }, ref) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const roles = useDb((s) => s.settings.permissionRoles)
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss([wrap], open, close)
  const options = [...roles].filter((r) => r.id !== 'owner').sort((a, b) => (a.id === 'none' ? -1 : b.id === 'none' ? 1 : a.order - b.order))
  const current = roles.find((r) => r.id === value)
  return (
    <div ref={wrap} className="relative">
      <button
        ref={ref}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="input flex items-center justify-between text-left disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={clsx(!current && 'text-subtle')}>{current?.name ?? t('team.form.selectOption')}</span>
        <ChevronDown size={16} className="text-muted" aria-hidden />
      </button>
      {open && (
        <div className={clsx('mt-1 max-h-[360px] overflow-y-auto rounded-lg border border-line bg-raised p-1.5 shadow-md', inline ? 'relative' : 'absolute left-0 right-0 top-full z-[60]')}>
          <ul role="listbox" aria-label={t('team.form.settings.roleTitle')}>
            {options.map((r) => (
              <li key={r.id} role="option" aria-selected={r.id === value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(r.id as PermissionRole)
                    setOpen(false)
                  }}
                  className={clsx('flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left hover:bg-sunken', r.id === value && 'bg-primary-subtle/50')}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-strong text-ink">{r.name}</span>
                    <span className="block text-small text-muted">{r.description}</span>
                  </span>
                  {r.id === value && <Check size={16} className="mt-1 text-primary" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => navigate('/setup/team/permissions/add/1')} className="mt-1 flex w-full items-center gap-2 border-t border-line px-3 py-2.5 text-body-strong text-primary hover:bg-sunken">
            <Plus size={16} aria-hidden />
            {t('team.form.settings.addRole')}
          </button>
        </div>
      )}
    </div>
  )
})
