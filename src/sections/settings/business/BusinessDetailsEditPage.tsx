import { Facebook, Globe, Instagram, Twitter } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Field, LearnMore, Modal, RadioGroup, SearchInput, TextInput, confirm } from '@/components/ui'
import { updateWorkspace } from '@/api/settings'
import type { Workspace } from '@/types'
import { useWorkspace } from '../hooks'
import { FullModal } from '../components/FullModal'
import { FormCard, FormStack } from '../components/ui'
import { useAction } from '../components/useAction'
import { LANGUAGES, languageFlag } from './languages'

type Draft = Pick<Workspace, 'name' | 'taxCalculation' | 'teamLanguage' | 'clientLanguage' | 'externalLinks'>

const LINK_PATTERN = /^[^\s]+\.[^\s]{2,}$/

/** Edit business details (settings-business-setup.md §1.1). */
export function BusinessDetailsEditPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const workspace = useWorkspace()
  const initial: Draft = useMemo(
    () => ({ name: workspace.name, taxCalculation: workspace.taxCalculation, teamLanguage: workspace.teamLanguage, clientLanguage: workspace.clientLanguage, externalLinks: { ...workspace.externalLinks } }),
    // Only on mount: the form owns the draft afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [draft, setDraft] = useState<Draft>(initial)
  const [picker, setPicker] = useState<'teamLanguage' | 'clientLanguage' | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [saving, run] = useAction()
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)

  const errors = {
    name: !draft.name.trim() ? t('settings.biz.edit.nameRequired') : draft.name.length > 100 ? t('settings.biz.edit.nameTooLong') : undefined,
    links: Object.fromEntries(Object.entries(draft.externalLinks).map(([k, v]) => [k, v.trim() && !LINK_PATTERN.test(v.trim()) ? t('settings.biz.edit.linkInvalid') : undefined])) as Record<string, string | undefined>,
  }
  const hasErrors = Boolean(errors.name) || Object.values(errors.links).some(Boolean)

  const back = () => navigate('/setup/business-setup/business-details')
  const close = async () => {
    if (dirty && !(await confirm({ title: t('settings.biz.edit.discardTitle'), body: t('settings.biz.edit.discardBody'), confirmLabel: t('settings.biz.edit.discard') }))) return
    back()
  }
  const save = () => {
    setSubmitted(true)
    if (hasErrors) return
    void run(
      () =>
        updateWorkspace((w) => {
          w.name = draft.name.trim()
          w.taxCalculation = draft.taxCalculation
          w.teamLanguage = draft.teamLanguage
          w.clientLanguage = draft.clientLanguage
          w.externalLinks = { facebook: draft.externalLinks.facebook.trim(), instagram: draft.externalLinks.instagram.trim(), x: draft.externalLinks.x.trim(), website: draft.externalLinks.website.trim() }
        }),
      t('settings.biz.edit.saved'),
      back,
    )
  }

  const linkField = (key: keyof Workspace['externalLinks'], icon: ReactNode, placeholder: string) => (
    <Field label={t(`settings.biz.links.${key}`)} error={submitted ? errors.links[key] : undefined}>
      {(id) => <TextInput id={id} prefix={icon} value={draft.externalLinks[key]} placeholder={placeholder} invalid={submitted && Boolean(errors.links[key])} onChange={(e) => setDraft({ ...draft, externalLinks: { ...draft.externalLinks, [key]: e.target.value } })} />}
    </Field>
  )

  return (
    <FullModal open inline onClose={close} onSave={save} saving={saving} title={t('settings.biz.edit.title')} testId="business-details-edit">
      <FormStack>
        <FormCard title={t('settings.biz.edit.businessInfo')} description={t('settings.biz.edit.businessInfoHint')}>
          <Field label={t('settings.biz.details.businessName')} error={submitted ? errors.name : undefined}>
            {(id) => <TextInput id={id} data-autofocus value={draft.name} placeholder={t('settings.biz.edit.namePlaceholder')} invalid={submitted && Boolean(errors.name)} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}
          </Field>
          <p className="rounded-md bg-sunken px-4 py-3 text-body text-ink">
            {t('settings.biz.edit.countryNote1')} <strong>{workspace.country}</strong> {t('settings.biz.edit.countryNote2')} <strong>{workspace.currency}</strong> {t('settings.biz.edit.countryNote3')}
          </p>
        </FormCard>

        <FormCard
          title={t('settings.biz.details.taxCalculation')}
          description={
            <>
              {t('settings.biz.edit.taxHint')} <LearnMore topic={t('settings.biz.details.taxCalculation')}>{t('common.learnMore')}</LearnMore>
            </>
          }
        >
          <RadioGroup
            value={draft.taxCalculation}
            onChange={(v) => setDraft({ ...draft, taxCalculation: v })}
            options={[
              { value: 'exclusive', label: t('settings.biz.details.taxExclusive'), hint: <span className="whitespace-pre-line">{t('settings.biz.edit.taxExclusiveHint')}</span> },
              { value: 'inclusive', label: t('settings.biz.details.taxInclusive'), hint: <span className="whitespace-pre-line">{t('settings.biz.edit.taxInclusiveHint')}</span> },
            ]}
          />
        </FormCard>

        <FormCard title={t('settings.biz.edit.languageSettings')} description={t('settings.biz.edit.languageHint')}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(['teamLanguage', 'clientLanguage'] as const).map((key) => (
              <div key={key}>
                <p className="label">{t(`settings.biz.details.${key}`)}</p>
                <div className="flex h-11 items-center justify-between rounded-sm border border-line-strong bg-surface px-3">
                  <span className="truncate text-body text-ink">
                    {languageFlag(draft[key])} {draft[key]}
                  </span>
                  <button type="button" className="text-body-strong text-primary hover:underline" onClick={() => setPicker(key)} aria-label={`${t('settings.common.edit')} ${t(`settings.biz.details.${key}`)}`}>
                    {t('settings.common.edit')}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="rounded-md bg-sunken px-4 py-3 text-body text-ink">{t('settings.biz.edit.languageNote')}</p>
        </FormCard>

        <FormCard title={t('settings.biz.details.externalLinks')} description={t('settings.biz.edit.linksHint')}>
          <div className="flex flex-col gap-4">
            {linkField('facebook', <Facebook size={16} aria-hidden />, t('settings.biz.links.placeholders.facebook'))}
            {linkField('instagram', <Instagram size={16} aria-hidden />, t('settings.biz.links.placeholders.instagram'))}
            {linkField('x', <Twitter size={16} aria-hidden />, t('settings.biz.links.placeholders.x'))}
            {linkField('website', <Globe size={16} aria-hidden />, t('settings.biz.links.placeholders.website'))}

          </div>
        </FormCard>
      </FormStack>

      <LanguagePicker
        open={picker !== null}
        title={picker ? t(`settings.biz.details.${picker}`) : ''}
        value={picker ? draft[picker] : ''}
        onClose={() => setPicker(null)}
        onSelect={(name) => {
          if (picker) setDraft({ ...draft, [picker]: name })
          setPicker(null)
        }}
      />
    </FullModal>
  )
}

/** Searchable list of languages with flags. */
export function LanguagePicker({ open, title, value, onClose, onSelect }: { open: boolean; title: string; value: string; onClose: () => void; onSelect: (name: string) => void }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(value)
  const [lastOpen, setLastOpen] = useState(open)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setSelected(value)
      setQuery('')
    }
  }
  const list = LANGUAGES.filter((l) => l.name.toLowerCase().includes(query.trim().toLowerCase()))
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={t('settings.biz.edit.languagePickerHint')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => onSelect(selected)} data-testid="language-select">
            {t('settings.biz.edit.select')}
          </Button>
        </>
      }
    >
      <SearchInput value={query} onChange={setQuery} placeholder={t('settings.biz.edit.searchLanguages')} />
      <ul className="mt-3 flex max-h-[360px] flex-col overflow-y-auto" role="listbox" aria-label={title}>
        {list.map((l) => (
          <li key={l.name}>
            <button
              type="button"
              role="option"
              aria-selected={selected === l.name}
              onClick={() => setSelected(l.name)}
              onDoubleClick={() => onSelect(l.name)}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-body ${selected === l.name ? 'bg-primary-subtle font-semibold text-primary' : 'text-ink hover:bg-sunken'}`}
            >
              <span className="text-title-3" aria-hidden>
                {l.flag}
              </span>
              <span className="flex-1">{l.name}</span>
              {selected === l.name && <span aria-hidden>✓</span>}
            </button>
          </li>
        ))}
        {!list.length && <li className="px-3 py-6 text-center text-body text-muted">{t('settings.common.noResults')}</li>}
      </ul>
    </Modal>
  )
}
