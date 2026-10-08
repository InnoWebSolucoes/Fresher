import clsx from 'clsx'
import { Briefcase, CircleEllipsis, Home, MapPin } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import i18n from 'i18next'
import { useTranslation } from 'react-i18next'
import type { Client } from '@/types'
import { uid } from '@/lib/ids'
import { useDismiss } from '@/lib/useDismiss'
import { Button, Field, Modal, Select, TextInput } from '@/components/ui'
import { countryLabel, countryOptions } from '../lib/constants'

export type AddressDraft = Client['addresses'][number] & { county?: string; state?: string }

type AddressType = AddressDraft['type']

/** Simulated address lookup (no external geocoder in the demo). */
const KNOWN: Omit<AddressDraft, 'id' | 'type' | 'name'>[] = [
  { line1: 'Rua Augusta 100', city: 'Lisboa', district: 'Baixa', postcode: '1100-053', country: 'Portugal', region: 'Lisboa' },
  { line1: 'Avenida dos Aliados 120', city: 'Porto', district: 'Santo Ildefonso', postcode: '4000-065', country: 'Portugal', region: 'Porto' },
  { line1: 'Rua de Santa Catarina 312', city: 'Porto', district: 'Bonfim', postcode: '4000-443', country: 'Portugal', region: 'Porto' },
  { line1: 'Avenida da Boavista 1277', city: 'Porto', district: 'Lordelo do Ouro', postcode: '4100-130', country: 'Portugal', region: 'Porto' },
  { line1: 'Rua de Cedofeita 450', city: 'Porto', district: 'Cedofeita', postcode: '4050-180', country: 'Portugal', region: 'Porto' },
  { line1: 'Avenida Brasil 88', city: 'Porto', district: 'Foz do Douro', postcode: '4150-153', country: 'Portugal', region: 'Porto' },
  { line1: 'Rua Mouzinho da Silveira 25', city: 'Porto', district: 'Ribeira', postcode: '4050-416', country: 'Portugal', region: 'Porto' },
  { line1: 'Avenida da República 1500', city: 'Vila Nova de Gaia', district: 'Mafamude', postcode: '4430-205', country: 'Portugal', region: 'Porto' },
  { line1: 'Rua Brito Capelo 210', city: 'Matosinhos', district: 'Matosinhos', postcode: '4450-068', country: 'Portugal', region: 'Porto' },
  { line1: 'Avenida da Liberdade 180', city: 'Lisboa', district: 'Santo António', postcode: '1250-146', country: 'Portugal', region: 'Lisboa' },
]

export const addressLines = (a: Partial<AddressDraft>) =>
  [[a.line1, a.line2].filter(Boolean).join(', '), [a.city, a.postcode].filter(Boolean).join(' '), countryLabel(a.country)].filter((l): l is string => Boolean(l && l.trim()))

/** Default names ('Home', 'Work', 'Other', or their Portuguese text) are shown in the current language. */
const isDefaultName = (name: string, type: AddressType) => (['en', 'pt-PT'] as const).some((lng) => name === i18n.t(`clients.address.types.${type}`, { lng })) || name === i18n.t(`clients.address.types.${type}`)
export const addressName = (a: Pick<AddressDraft, 'name' | 'type'>) => (isDefaultName(a.name, a.type) ? i18n.t(`clients.address.types.${a.type}`) : a.name)

const blank = (): AddressDraft => ({ id: uid('addr'), type: 'home', name: i18n.t('clients.address.types.home'), line1: '', city: '', postcode: '', country: 'Portugal' })

/** "New address" / "Edit address" with the "Edit address details" sub-form (clients.md §2 Addresses). */
export function AddressModal({ open, value, onClose, onSave }: { open: boolean; value?: AddressDraft; onClose: () => void; onSave: (a: AddressDraft) => void }) {
  if (!open) return null
  return <Body value={value} onClose={onClose} onSave={onSave} />
}

function Body({ value, onClose, onSave }: { value?: AddressDraft; onClose: () => void; onSave: (a: AddressDraft) => void }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<AddressDraft>(() => (value ? { ...value, name: addressName(value) } : blank()))
  const [query, setQuery] = useState('')
  const [suggest, setSuggest] = useState(false)
  const [details, setDetails] = useState(false)
  const [error, setError] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const refs = useMemo(() => [box], [])
  useDismiss(refs, suggest, () => setSuggest(false))

  const typeLabel = (type: AddressType) => t(`clients.address.types.${type}`)
  const setType = (type: AddressType) => setDraft((d) => ({ ...d, type, name: !d.name || isDefaultName(d.name, d.type) ? typeLabel(type) : d.name }))
  const matches = query.trim().length >= 2 ? KNOWN.filter((k) => `${k.line1} ${k.city} ${k.postcode}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 5) : []

  const pick = (k: Omit<AddressDraft, 'id' | 'type' | 'name'>) => {
    setDraft((d) => ({ ...d, ...k }))
    setQuery('')
    setSuggest(false)
    setError('')
  }

  const rows: { key: keyof AddressDraft; label: string }[] = [
    { key: 'line1', label: t('clients.address.address') },
    { key: 'line2', label: t('clients.address.apt') },
    { key: 'district', label: t('clients.address.district') },
    { key: 'city', label: t('clients.address.city') },
    { key: 'region', label: t('clients.address.region') },
    { key: 'postcode', label: t('clients.address.postcode') },
    { key: 'country', label: t('clients.address.country') },
  ]

  const submit = () => {
    if (!draft.line1.trim()) {
      setError(t('clients.address.required'))
      return
    }
    onSave({ ...draft, name: draft.name.trim() || typeLabel(draft.type), region: [draft.county, draft.state].filter(Boolean).join(', ') || draft.region })
    onClose()
  }

  if (details) return <DetailsModal value={draft} onCancel={() => setDetails(false)} onContinue={(v) => (setDraft(v), setDetails(false), setError(''))} />

  return (
    <Modal
      open
      onClose={onClose}
      title={value ? t('clients.address.editTitle') : t('clients.address.newTitle')}
      footer={
        <div className="flex w-full justify-between">
          <Button onClick={onClose}>{t('clients.common.cancel')}</Button>
          <Button variant="primary" onClick={submit}>
            {t('clients.common.continue')}
          </Button>
        </div>
      }
    >
      <div role="radiogroup" aria-label={t('clients.address.type')} className="flex gap-3">
        {(
          [
            ['home', Home],
            ['work', Briefcase],
            ['other', CircleEllipsis],
          ] as const
        ).map(([type, Icon]) => (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={draft.type === type}
            onClick={() => setType(type)}
            className={clsx('flex h-24 min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-lg border text-body-strong md:h-28 md:w-28 md:flex-none text-ink transition-colors', draft.type === type ? 'border-primary bg-primary-subtle/40 ring-1 ring-primary' : 'border-line hover:border-line-strong')}
          >
            <Icon size={22} aria-hidden />
            {typeLabel(type)}
          </button>
        ))}
      </div>
      <Field label={t('clients.address.name')} className="mt-5">
        {(id) => <TextInput id={id} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}
      </Field>
      <Field label={t('clients.address.address')} className="mt-5" error={error}>
        {(id) => (
          <div ref={box} className="relative">
            <TextInput
              id={id}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setSuggest(true)
              }}
              onFocus={() => setSuggest(true)}
              placeholder={t('clients.address.searchPlaceholder')}
              invalid={Boolean(error)}
            />
            {suggest && query.trim().length >= 2 && (
              <ul className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-line bg-raised p-1 shadow-md">
                {matches.map((k) => (
                  <li key={k.line1}>
                    <button type="button" onClick={() => pick(k)} className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-left hover:bg-sunken">
                      <MapPin size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                      <span>
                        <span className="block text-body text-ink">{k.line1}</span>
                        <span className="block text-small text-muted">
                          {k.city} {k.postcode}, {countryLabel(k.country)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
                <li>
                  <button type="button" onClick={() => pick({ line1: query.trim(), city: draft.city, postcode: draft.postcode, country: draft.country || 'Portugal' })} className="w-full rounded-md px-3 py-2 text-left text-body font-semibold text-primary hover:bg-sunken">
                    {t('clients.address.useTyped', { value: query.trim() })}
                  </button>
                </li>
              </ul>
            )}
          </div>
        )}
      </Field>
      <div className="mt-5 rounded-lg border border-line p-4 md:p-5">
        <div className="flex items-start justify-between gap-4">
          <dl className="flex flex-1 flex-col gap-3">
            {rows.map((r) => (
              <div key={r.key}>
                <dt className="text-body-strong text-ink">{r.label}</dt>
                <dd>
                  {draft[r.key] ? (
                    <span className="text-body text-muted">{r.key === 'country' ? countryLabel(draft.country) : String(draft[r.key])}</span>
                  ) : (
                    <button type="button" onClick={() => setDetails(true)} className="text-body font-semibold text-primary hover:underline">
                      + {t('clients.common.add')}
                    </button>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <Button variant="link" onClick={() => setDetails(true)}>
            {t('clients.common.edit')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function DetailsModal({ value, onCancel, onContinue }: { value: AddressDraft; onCancel: () => void; onContinue: (v: AddressDraft) => void }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<AddressDraft>(value)
  const field = (key: 'line1' | 'line2' | 'district' | 'city' | 'county' | 'state' | 'postcode', label: string) => (
    <Field label={label}>{(id) => <TextInput id={id} value={draft[key] ?? ''} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />}</Field>
  )
  return (
    <Modal
      open
      onClose={onCancel}
      title={t('clients.address.detailsTitle')}
      footer={
        <>
          <Button onClick={onCancel}>{t('clients.common.cancel')}</Button>
          <Button variant="primary" onClick={() => onContinue(draft)}>
            {t('clients.common.continue')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">{field('line1', t('clients.address.address'))}</div>
        {field('line2', t('clients.address.apt'))}
        {field('district', t('clients.address.district'))}
        {field('city', t('clients.address.city'))}
        {field('county', t('clients.address.county'))}
        {field('state', t('clients.address.state'))}
        {field('postcode', t('clients.address.postcode'))}
        <div className="sm:col-span-2">
          <Field label={t('clients.address.country')}>{(id) => <Select id={id} value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })} options={countryOptions()} />}</Field>
        </div>
      </div>
    </Modal>
  )
}
