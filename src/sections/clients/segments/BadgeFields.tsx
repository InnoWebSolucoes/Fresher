import { useTranslation } from 'react-i18next'
import { Checkbox, Field, TextInput } from '@/components/ui'
import { BadgeChip, Swatches } from '../components/common'

export interface BadgeDraft {
  enabled: boolean
  name: string
  color: string
}

/** "Display as badge on client profile" with badge name (0/20), 22 colour swatches and a preview. */
export function BadgeFields({ value, onChange, showErrors, hintKey = 'hint' }: { value: BadgeDraft; onChange: (v: BadgeDraft) => void; showErrors: boolean; hintKey?: 'hint' | 'hintEdit' }) {
  const { t } = useTranslation()
  const nameError = showErrors && value.enabled && !value.name.trim() ? t('clients.segments.badge.nameRequired') : undefined
  return (
    <div className="flex flex-col gap-6">
      <Checkbox label={t('clients.segments.badge.display')} hint={t(`clients.segments.badge.${hintKey}`)} checked={value.enabled} onChange={(enabled) => onChange({ ...value, enabled })} />
      {value.enabled && (
        <>
          <Field label={t('clients.segments.badge.name')} counter={{ value: value.name.length, max: 20 }} error={nameError}>
            {(id) => <TextInput id={id} maxLength={20} value={value.name} invalid={Boolean(nameError)} onChange={(e) => onChange({ ...value, name: e.target.value })} />}
          </Field>
          <div>
            <p className="mb-3 text-body-strong text-ink">{t('clients.segments.badge.color')}</p>
            <Swatches value={value.color} onChange={(color) => onChange({ ...value, color })} label={t('clients.segments.badge.color')} />
          </div>
          <div>
            <p className="mb-2 text-body-strong text-ink">{t('clients.segments.badge.preview')}</p>
            <BadgeChip name={value.name.trim() || t('clients.segments.badge.placeholder')} colorKey={value.color} />
          </div>
        </>
      )}
    </div>
  )
}
