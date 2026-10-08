import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { create } from 'zustand'
import { Checkbox, Field, TextInput, confirm } from '@/components/ui'
import { createLocation, defaultOpeningHours } from '@/api/settings'
import type { OpeningHours } from '@/types'
import { FullModal } from '../components/FullModal'
import { useAction } from '../components/useAction'
import { AddressFields, BusinessTypeTiles, DEFAULT_MAP, MapPlaceholder, OpeningHoursEditor, PhoneInput, addressErrors, openingHoursErrors, phoneWithPrefix, validEmail, validPhone, type AddressDraft, type MapView } from './shared'
import { saveLocationExtras } from './locationExtras'

const STEPS = ['basic-info', 'business-type', 'location', 'opening-hours'] as const
type Step = (typeof STEPS)[number]

interface WizardDraft {
  name: string
  internalName: string
  phone: string
  email: string
  businessTypes: string[]
  noAddress: boolean
  address: AddressDraft
  map: MapView
  hours: OpeningHours
}

const blank = (): WizardDraft => ({
  name: '',
  internalName: '',
  phone: '',
  email: '',
  businessTypes: [],
  noAddress: false,
  address: { line1: '', line2: '', district: 'Porto', city: 'Porto', region: 'Porto', postcode: '', country: 'Portugal', directions: '' },
  map: DEFAULT_MAP,
  hours: defaultOpeningHours(),
})

/** Wizard state survives moving between the step URLs (not persisted). */
const useWizard = create<{ draft: WizardDraft; dirty: boolean; completed: boolean; set: (patch: Partial<WizardDraft>) => void; reset: () => void; complete: () => void }>((set) => ({
  draft: blank(),
  dirty: false,
  /** The draft was turned into a location; it is cleared the next time the wizard opens. */
  completed: false,
  set: (patch) => set((s) => ({ draft: { ...s.draft, ...patch }, dirty: true })),
  reset: () => set({ draft: blank(), dirty: false, completed: false }),
  complete: () => set({ completed: true, dirty: false }),
}))

/** Add new location wizard, 4 steps (settings-business-setup.md §2.1). */
export function LocationNewPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { step = 'basic-info' } = useParams()
  const { draft, dirty, completed, set, reset, complete } = useWizard()
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({})
  const [saving, run] = useAction()
  const index = STEPS.indexOf(step as Step)

  const errors = {
    'basic-info': {
      name: !draft.name.trim() ? t('settings.biz.new.nameRequired') : undefined,
      phone: !draft.phone.trim() ? t('settings.common.required') : !validPhone(draft.phone) ? t('settings.biz.new.phoneInvalid') : undefined,
      email: !draft.email.trim() ? t('settings.common.required') : !validEmail(draft.email) ? t('settings.biz.new.emailInvalid') : undefined,
    },
    'business-type': { types: draft.businessTypes.length ? undefined : t('settings.biz.types.required') },
    location: draft.noAddress ? {} : addressErrors(draft.address, t),
    'opening-hours': openingHoursErrors(draft.hours, t),
  } as Record<Step, Record<string, string | undefined>>
  const stepValid = (s: Step) => !Object.values(errors[s]).some(Boolean)

  useEffect(() => {
    document.title = t('settings.biz.new.title')
  }, [t])

  // A finished draft from the previous run: start again from scratch.
  useEffect(() => {
    if (completed) reset()
    // Only when the wizard opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (index === -1) return <Navigate to="/setup/location/new/basic-info" replace />
  // Deep link to a later step with earlier steps incomplete: go back to the first incomplete one.
  const firstInvalid = STEPS.slice(0, index).find((s) => !stepValid(s))
  if (firstInvalid) return <Navigate to={`/setup/location/new/${firstInvalid}`} replace />

  const current = STEPS[index]
  const show = submitted[current]
  const goto = (s: Step) => navigate(`/setup/location/new/${s}`)
  const close = async () => {
    if (dirty && !(await confirm({ title: t('settings.biz.new.exitTitle'), body: t('settings.biz.new.exitBody'), confirmLabel: t('settings.biz.new.exit') }))) return
    reset()
    navigate('/setup/business-setup/location-details')
  }
  const next = () => {
    setSubmitted((s) => ({ ...s, [current]: true }))
    if (!stepValid(current)) return
    if (index < STEPS.length - 1) {
      goto(STEPS[index + 1])
      return
    }
    void run(
      async () => {
        const { directions, ...address } = draft.address
        const location = await createLocation({
          name: draft.name,
          internalName: draft.internalName,
          phone: phoneWithPrefix(draft.phone),
          email: draft.email.trim(),
          address: draft.noAddress ? { line1: '', city: '', postcode: '', country: address.country } : address,
          directions: draft.noAddress ? undefined : directions?.trim() || undefined,
          businessTypes: draft.businessTypes,
          openingHours: draft.hours,
        })
        await saveLocationExtras(location.id, { noAddress: draft.noAddress, map: draft.map })
        // Keep the draft until the page has left (clearing it now would bounce the wizard back to step 1).
        complete()
        navigate(`/setup/location/${location.id}/business-details`)
      },
      t('settings.biz.new.created'),
    )
  }

  const e = show ? errors[current] : {}
  return (
    <FullModal
      open
      inline
      onClose={close}
      onBack={index > 0 ? () => goto(STEPS[index - 1]) : undefined}
      progress={(index + 1) / STEPS.length}
      onSave={next}
      saving={saving}
      saveLabel={index === STEPS.length - 1 ? t('settings.biz.new.create') : t('settings.common.continue')}
      title={t(`settings.biz.new.steps.${current}.title`)}
      subtitle={
        <>
          <span className="block text-small text-muted">{t('settings.biz.new.progress', { step: index + 1, total: STEPS.length, pct: Math.round(((index + 1) / STEPS.length) * 100) })}</span>
          {t(`settings.biz.new.steps.${current}.subtitle`)}
        </>
      }
      width={current === 'business-type' ? 'max-w-[1040px]' : 'max-w-[760px]'}
      testId="location-wizard"
    >
      {current === 'basic-info' && (
        <div className="flex flex-col gap-5">
          <Field label={t('settings.biz.new.name')} counter={{ value: draft.name.length, max: 60 }} hint={t('settings.biz.new.nameHint')} error={e.name}>
            {(id) => <TextInput id={id} data-autofocus maxLength={60} value={draft.name} invalid={Boolean(e.name)} onChange={(ev) => set({ name: ev.target.value })} />}
          </Field>
          <Field label={t('settings.biz.new.internalName')} optional counter={{ value: draft.internalName.length, max: 60 }} hint={t('settings.biz.new.internalNameHint')}>
            {(id) => <TextInput id={id} maxLength={60} value={draft.internalName} onChange={(ev) => set({ internalName: ev.target.value })} />}
          </Field>
          <Field label={t('settings.biz.new.phone')} error={e.phone}>
            {(id) => <PhoneInput id={id} value={draft.phone} invalid={Boolean(e.phone)} onChange={(phone) => set({ phone })} />}
          </Field>
          <Field label={t('settings.biz.new.email')} error={e.email}>
            {(id) => <TextInput id={id} type="email" value={draft.email} invalid={Boolean(e.email)} onChange={(ev) => set({ email: ev.target.value })} />}
          </Field>
        </div>
      )}
      {current === 'business-type' && (
        <>
          <BusinessTypeTiles value={draft.businessTypes} onChange={(businessTypes) => set({ businessTypes })} />
          {e.types && <p className="mt-3 text-small text-danger">{e.types}</p>}
        </>
      )}
      {current === 'location' && (
        <div className="flex flex-col gap-6">
          <Checkbox checked={draft.noAddress} onChange={(noAddress) => set({ noAddress })} label={t('settings.biz.location.noAddressLabel')} />
          {!draft.noAddress && (
            <>
              <AddressFields value={draft.address} onChange={(address) => set({ address })} errors={e} />
              <div>
                <h3 className="font-display text-title-3 text-ink">{t('settings.biz.location.mapTitle')}</h3>
                <p className="mb-3 mt-1 text-body text-muted">{t('settings.biz.location.mapHint')}</p>
                <MapPlaceholder label={draft.name || t('settings.biz.new.title')} view={draft.map} onChange={(map) => set({ map })} />
              </div>
            </>
          )}
        </div>
      )}
      {current === 'opening-hours' && <OpeningHoursEditor value={draft.hours} onChange={(hours) => set({ hours })} errors={e} />}
    </FullModal>
  )
}
