import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Checkbox, EmptyState, Field, FullscreenFrame, SectionNav, Select, TextArea, TextInput, confirm } from '@/components/ui'
import { deleteResource, saveResource, type ResourceRecord } from '@/api/settings'
import { useDb } from '@/store/db'
import type { PaletteColor, ResourceType, Weekday } from '@/types'
import { useLocations, useSettings } from '../hooks'
import { ColorSwatches } from '../components/pickers'
import { useAction } from '../components/useAction'
import { ResourceTypeModal } from '../scheduling/ResourceTypeModal'
import { FieldError, FormHeading, MultiSelect, OverlayOptions, RadioRow, deleteItem } from '../scheduling/shared'
import { FormCard, FormStack } from '../components/ui'
import { CLOCK_TIMES, RESOURCE_SUGGESTIONS, formatClock, orderedWeek, resourceSuggestionLabel, weekdayName } from '../scheduling/options'
import { M } from './shared'

const R = `${M}.resource`
const ADD_TYPE = '__add'
type Section = 'basic' | 'availability'
type Weekly = NonNullable<ResourceRecord['weekly']>

const defaultWeekly = (): Weekly => Object.fromEntries(([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((d) => [d, { open: d < 6, start: '10:00', end: '19:00' }])) as Weekly

/** Settings › Scheduling › Resources › New / edit resource (settings-scheduling.md §4), full screen. */
export function ResourceEditPage() {
  const { id = 'new' } = useParams()
  const resources = useDb((s) => s.resources) as ResourceRecord[]
  const existing = id === 'new' ? null : (resources.find((r) => r.id === id) ?? null)
  const { t } = useTranslation()
  const navigate = useNavigate()
  if (id !== 'new' && !existing)
    return (
      <FullscreenFrame onClose={() => navigate('/setup/scheduling/resources')} closeLabel={t('settings.common.close')}>
        <EmptyState title={t(`${R}.notFound`)} action={<Button onClick={() => navigate('/setup/scheduling/resources')}>{t(`${R}.backToList`)}</Button>} />
      </FullscreenFrame>
    )
  return <ResourceForm key={id} resource={existing} />
}

function ResourceForm({ resource }: { resource: ResourceRecord | null }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const section: Section = params.get('section') === 'availability' ? 'availability' : 'basic'
  const locations = useLocations()
  const settings = useSettings()
  const types = useDb((s) => s.resourceTypes)
  const resources = useDb((s) => s.resources) as ResourceRecord[]
  const [name, setName] = useState(resource?.name ?? '')
  const [typeValue, setTypeValue] = useState(resource?.typeId ?? '')
  const [description, setDescription] = useState(resource?.description ?? '')
  const [capacity, setCapacity] = useState(resource?.capacity ?? 1)
  const [color, setColor] = useState<PaletteColor>(resource?.color ?? 'orange')
  const [code, setCode] = useState(resource?.code ?? '')
  const [locationId, setLocationId] = useState(resource?.locationId ?? params.get('location') ?? locations[0]?.id ?? '')
  const [mode, setMode] = useState<ResourceRecord['availability']>(resource?.availability ?? 'always')
  const [weekly, setWeekly] = useState<Weekly>(resource?.weekly ?? defaultWeekly())
  const [limitDates, setLimitDates] = useState(resource?.limitDates ?? false)
  const [from, setFrom] = useState(resource?.availableFrom ?? '')
  const [to, setTo] = useState(resource?.availableTo ?? '')
  const [link, setLink] = useState(resource?.linkResources ?? false)
  const [linked, setLinked] = useState<string[]>(resource?.linkedIds ?? [])
  const [typeModal, setTypeModal] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [saving, run] = useAction()

  const back = () => navigate('/setup/scheduling/resources')
  const missingSuggestions = RESOURCE_SUGGESTIONS.filter((s) => !types.some((x) => [s.name.toLowerCase(), resourceSuggestionLabel(t, s).toLowerCase()].includes(x.name.trim().toLowerCase())))
  const typeOptions = [
    ...types.map((x) => ({ value: x.id, label: x.name })),
    ...missingSuggestions.map((s) => ({ value: `new:${s.name}`, label: resourceSuggestionLabel(t, s) })),
    { value: ADD_TYPE, label: t(`${R}.addNewType`) },
  ]
  const others = useMemo(() => resources.filter((r) => r.id !== resource?.id && r.locationId === locationId).map((r) => ({ value: r.id, label: r.name })), [resources, resource, locationId])

  const errors = {
    name: !name.trim() ? t(`${R}.nameRequired`) : undefined,
    type: !typeValue ? t(`${R}.typeRequired`) : undefined,
    capacity: capacity < 1 || capacity > 99 || !Number.isInteger(capacity) ? t(`${R}.capacityInvalid`) : undefined,
    dates: limitDates && (!from || !to || to < from) ? t(`${R}.datesInvalid`) : undefined,
    linked: link && linked.length === 0 ? t(`${R}.linkedRequired`) : undefined,
    weekly: mode === 'specific' && Object.values(weekly).some((d) => d && d.open && d.end <= d.start) ? t(`${R}.hoursInvalid`) : undefined,
  }
  const show = (key: keyof typeof errors) => (submitted ? errors[key] : undefined)

  const save = () => {
    setSubmitted(true)
    const firstError = (Object.keys(errors) as (keyof typeof errors)[]).find((k) => errors[k])
    if (firstError) {
      const inAvailability = firstError === 'dates' || firstError === 'linked' || firstError === 'weekly'
      setParams(inAvailability ? { section: 'availability' } : {}, { replace: true })
      return
    }
    const suggestion = typeValue.startsWith('new:') ? RESOURCE_SUGGESTIONS.find((s) => `new:${s.name}` === typeValue) : undefined
    const input: Omit<ResourceRecord, 'id'> = {
      name: name.trim(),
      typeId: suggestion ? '' : typeValue,
      description: description.trim(),
      capacity,
      color,
      locationId,
      availability: mode,
      code: code.trim() || undefined,
      weekly: mode === 'specific' ? weekly : resource?.weekly,
      limitDates,
      availableFrom: limitDates ? from : undefined,
      availableTo: limitDates ? to : undefined,
      linkResources: link,
      linkedIds: link ? linked : [],
    }
    void run(() => saveResource(resource?.id ?? null, input, suggestion ? { name: resourceSuggestionLabel(t, suggestion), icon: suggestion.icon, description: '' } : undefined
), t(resource ? `${R}.updated` : `${R}.created`), back)
  }

  const remove = async () => {
    if (!resource) return
    const ok = await confirm({ title: t(`${R}.deleteTitle`), body: t(`${R}.deleteBody`, { name: resource.name }), confirmLabel: t('settings.common.delete'), tone: 'danger' })
    if (ok) await run(() => deleteResource(resource.id), t(`${R}.deleted`), back)
  }

  const onTypeChange = (value: string) => {
    if (value === ADD_TYPE) setTypeModal(true)
    else setTypeValue(value)
  }

  return (
    <FullscreenFrame
      onClose={back}
      closeLabel={t('settings.common.close')}
      title={resource ? resource.name : t(`${R}.newTitle`)}
      maxWidth="max-w-[760px]"
      nav={
        <SectionNav<Section>
          groups={[
            {
              items: [
                { value: 'basic', label: t(`${R}.basic`) },
                { value: 'availability', label: t(`${R}.availability`) },
              ],
            },
          ]}
          value={section}
          onChange={(v) => setParams(v === 'basic' ? {} : { section: v }, { replace: true })}
        />
      }
      actions={
        <>
          {resource && <OverlayOptions groups={[{ items: [deleteItem(t('settings.common.delete'), () => void remove())] }]} />}
          <Button variant="primary" className="px-6" loading={saving} onClick={save} data-testid="resource-save">
            {t('settings.common.save')}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex gap-2 md:hidden">
        {(['basic', 'availability'] as const).map((s) => (
          <Button key={s} size="sm" variant={section === s ? 'primary' : 'secondary'} onClick={() => setParams(s === 'basic' ? {} : { section: s }, { replace: true })}>
            {t(`${R}.${s}`)}
          </Button>
        ))}
      </div>
      {section === 'basic' ? (
        <FormStack>
          <FormCard testId="resource-basic">
            <FormHeading title={t(`${R}.basic`)} />
            <Field label={t(`${R}.name`)} counter={{ value: name.length, max: 255 }} error={show('name')}>
              {(id) => <TextInput id={id} value={name} maxLength={255} invalid={!!show('name')} placeholder={t(`${R}.namePlaceholder`)} onChange={(e) => setName(e.target.value)} data-testid="resource-name" />}
            </Field>
            <Field label={t(`${R}.type`)} error={show('type')}>
              {(id) => <Select id={id} value={typeValue} onChange={(e) => onTypeChange(e.target.value)} placeholder={t(`${R}.typePlaceholder`)} options={typeOptions} aria-invalid={!!show('type')} data-testid="resource-type" />}
            </Field>
            {locations.length > 1 && (
              <Field label={t(`${R}.location`)}>
                {(id) => (
                  <Select
                    id={id}
                    value={locationId}
                    onChange={(e) => {
                      setLocationId(e.target.value)
                      setLinked([])
                    }}
                    options={locations.map((l) => ({ value: l.id, label: l.name }))}
                  />
                )}
              </Field>
            )}
            <Field label={t(`${R}.description`)} optional counter={{ value: description.length, max: 1000 }}>
              {(id) => <TextArea id={id} value={description} maxLength={1000} placeholder={t(`${R}.descriptionPlaceholder`)} onChange={(e) => setDescription(e.target.value)} />}
            </Field>
          </FormCard>
          <FormCard>
            <FormHeading title={t(`${R}.capacity`)} description={t(`${R}.capacityHint`)} />
            <RadioRow name="capacity" checked={capacity === 1} onSelect={() => setCapacity(1)} label={t(`${R}.capacityOne`)} hint={t(`${R}.capacityOneHint`)} testId="capacity-one" />
            <RadioRow name="capacity" checked={capacity !== 1} onSelect={() => setCapacity(2)} label={t(`${R}.capacityMany`)} hint={t(`${R}.capacityManyHint`)} testId="capacity-many">
              <Field label={t(`${R}.capacityNumber`)} error={show('capacity')} className="max-w-[200px]">
                {(id) => <TextInput id={id} type="number" min={2} max={99} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} data-testid="capacity-number" />}
              </Field>
            </RadioRow>
          </FormCard>
          <FormCard>
            <FormHeading title={t(`${R}.color`)} description={t(`${R}.colorHint`)} />
            <ColorSwatches value={color} onChange={setColor} label={t(`${R}.color`)} />
          </FormCard>
          <FormCard>
            <FormHeading title={t(`${M}.advanced`)} />
            <Field label={t(`${R}.code`)} optional counter={{ value: code.length, max: 100 }} hint={t(`${R}.codeHint`)}>
              {(id) => <TextInput id={id} value={code} maxLength={100} onChange={(e) => setCode(e.target.value)} />}
            </Field>
          </FormCard>
        </FormStack>
      ) : (
        <FormStack>
          <FormCard testId="resource-availability">
            <FormHeading title={t(`${R}.availability`)} description={t(`${R}.availabilityHint`)} />
            <p className="text-body-strong text-ink">{t(`${R}.mode`)}</p>
            <RadioRow name="mode" checked={mode === 'always'} onSelect={() => setMode('always')} label={t(`${R}.always`)} hint={t(`${R}.alwaysHint`)} testId="mode-always" />
            <RadioRow name="mode" checked={mode === 'specific'} onSelect={() => setMode('specific')} label={t(`${R}.specific`)} hint={t(`${R}.specificHint`)} testId="mode-specific">
              <div className="flex flex-col gap-2">
                {orderedWeek(settings.firstDayOfWeek).map((day) => {
                  const value = weekly[day] ?? { open: false, start: '10:00', end: '19:00' }
                  const set = (patch: Partial<typeof value>) => setWeekly((w) => ({ ...w, [day]: { ...value, ...patch } }))
                  const times = CLOCK_TIMES.map((c) => ({ value: c, label: formatClock(c, settings.timeFormat) }))
                  return (
                    <div key={day} className="flex flex-wrap items-center gap-3">
                      <Checkbox className="w-36" checked={value.open} onChange={(open) => set({ open })} label={weekdayName(t, day)} />
                      {value.open ? (
                        <>
                          <Select aria-label={t(`${R}.startTime`)} className="w-32" value={value.start} onChange={(e) => set({ start: e.target.value })} options={times} />
                          <span className="text-muted">–</span>
                          <Select aria-label={t(`${R}.endTime`)} className="w-32" value={value.end} onChange={(e) => set({ end: e.target.value })} options={times} />
                        </>
                      ) : (
                        <span className="text-body text-muted">{t(`${R}.unavailable`)}</span>
                      )}
                    </div>
                  )
                })}
                <FieldError>{show('weekly')}</FieldError>
              </div>
            </RadioRow>
          </FormCard>
          <FormCard>
            <FormHeading title={t(`${R}.limit`)} />
            <Checkbox checked={limitDates} onChange={setLimitDates} label={t(`${R}.limitDates`)} hint={t(`${R}.limitDatesHint`)} />
            {limitDates && (
              <div className="ml-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t(`${R}.from`)}>{(id) => <TextInput id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="resource-from" />}</Field>
                <Field label={t(`${R}.to`)}>{(id) => <TextInput id={id} type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} data-testid="resource-to" />}</Field>
                <div className="sm:col-span-2">
                  <FieldError>{show('dates')}</FieldError>
                </div>
              </div>
            )}
            <Checkbox checked={link} onChange={setLink} label={t(`${R}.link`)} hint={t(`${R}.linkHint`)} />
            {link && (
              <div className="ml-8">
                <MultiSelect options={others} value={linked} onChange={setLinked} placeholder={t(`${R}.selectResources`)} ariaLabel={t(`${R}.relatedResources`)} invalid={!!show('linked')} testId="resource-linked" />
                <FieldError>{show('linked')}</FieldError>
              </div>
            )}
          </FormCard>
        </FormStack>
      )}
      {typeModal && <ResourceTypeModal type={null} onClose={() => setTypeModal(false)} onSaved={(created: ResourceType) => setTypeValue(created.id)} />}
    </FullscreenFrame>
  )
}
