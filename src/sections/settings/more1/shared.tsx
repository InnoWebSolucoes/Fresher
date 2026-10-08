import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'

/** Root key for the strings in ../en.more1.json. */
export const M = 'settings.more1'

/** Cancel + primary footer for settings dialogs. */
export function ModalFooter({ onCancel, onSave, saving, disabled, saveLabel, testId }: { onCancel: () => void; onSave: () => void; saving?: boolean; disabled?: boolean; saveLabel?: string; testId?: string }) {
  const { t } = useTranslation()
  return (
    <>
      <Button className="rounded-full" onClick={onCancel}>
        {t('settings.common.cancel')}
      </Button>
      <Button variant="primary" className="rounded-full px-6" loading={saving} disabled={disabled} onClick={onSave} data-testid={testId}>
        {saveLabel ?? t('settings.common.save')}
      </Button>
    </>
  )
}

/** Form wrapper that saves on Enter. */
export function ModalForm({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }) {
  return (
    <form
      className="flex flex-col gap-5 pb-2"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      {children}
      <button type="submit" hidden aria-hidden tabIndex={-1} />
    </form>
  )
}

/** Swap two entries of a list of ids (Move up / Move down). */
export function moved<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (target < 0 || target >= list.length) return list
  const next = [...list]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/** Bold value inside a summary sentence. */
export const B = ({ children }: { children?: ReactNode }) => <strong className="font-semibold text-ink">{children}</strong>
