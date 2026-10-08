import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, EmptyState, Field, FullscreenFrame, Select, TextArea, TextInput, toast } from '@/components/ui'
import { useDb } from '@/store/db'
import type { Supplier } from '@/types'
import { saveSupplier, type SupplierInput } from '@/api/catalog'
import { EditorFrame, SectionCard } from '../ui'
import { confirmDeleteSupplier } from './SuppliersPage'

type SectionId = 'basic' | 'contact' | 'address'

const COUNTRIES = ['Portugal', 'Spain', 'France', 'Germany', 'Italy', 'Netherlands', 'Belgium', 'Ireland', 'United Kingdom', 'United States', 'Brazil']

const EMPTY: SupplierInput = { name: '', description: '', firstName: '', lastName: '', mobile: '', telephone: '', email: '', website: '', address: { country: 'Portugal' } }
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

/** Add / Edit supplier full-screen form (catalog.md §7). */
export function SupplierEditorPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const supplier = useDb((s) => (id ? s.suppliers.find((x) => x.id === id) : undefined))
  if (id && !supplier)
    return (
      <FullscreenFrame closeLabel={t('catalog.common.close')} title={t('catalog.inventory.supplierEditor.editTitle')}>
        <EmptyState title={t('catalog.common.notFoundTitle')} body={t('catalog.common.notFoundBody')} />
      </FullscreenFrame>
    )
  return <SupplierForm key={id ?? 'new'} supplier={supplier} />
}

function SupplierForm({ supplier }: { supplier?: Supplier }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [form, setForm] = useState<SupplierInput>(() => {
    if (!supplier) return EMPTY
    const { name, description, firstName, lastName, mobile, telephone, email, website, address } = supplier
    return { name, description, firstName, lastName, mobile, telephone, email, website, address: { country: 'Portugal', ...address } }
  })
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<SupplierInput>) => setForm((f) => ({ ...f, ...patch }))
  const setAddress = (patch: Partial<SupplierInput['address']>) => setForm((f) => ({ ...f, address: { ...f.address, ...patch } }))

  const errors = {
    name: !form.name.trim() ? t('catalog.inventory.supplierEditor.nameRequired') : undefined,
    email: form.email.trim() && !isEmail(form.email.trim()) ? t('catalog.inventory.supplierEditor.emailInvalid') : undefined,
  }
  const shown = (key: keyof typeof errors) => (submitted ? errors[key] : undefined)
  const close = () => navigate(supplier ? `/catalogue/suppliers?drawer=supplier&id=${supplier.id}` : '/catalogue/suppliers')

  const save = async () => {
    setSubmitted(true)
    if (errors.name || errors.email) {
      toast(t('catalog.inventory.supplierEditor.fixErrors'))
      document.getElementById(errors.name ? 'sec-basic' : 'sec-contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    setSaving(true)
    try {
      const saved = await saveSupplier(supplier?.id ?? null, { ...form, name: form.name.trim(), email: form.email.trim() })
      toast(t(supplier ? 'catalog.inventory.supplierEditor.edited' : 'catalog.inventory.supplierEditor.added'))
      navigate(`/catalogue/suppliers?drawer=supplier&id=${saved.id}`)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (supplier && (await confirmDeleteSupplier(supplier, t))) navigate('/catalogue/suppliers')
  }

  const title = supplier ? t('catalog.inventory.supplierEditor.editTitle') : t('catalog.inventory.supplierEditor.addTitle')

  return (
    <EditorFrame<SectionId>
      title={title}
      onClose={close}
      nav={{
        groups: [
          {
            items: [
              { value: 'basic', label: t('catalog.inventory.supplierEditor.nav.basic') },
              { value: 'contact', label: t('catalog.inventory.supplierEditor.nav.contact') },
              { value: 'address', label: t('catalog.inventory.supplierEditor.nav.address') },
            ],
          },
        ],
      }}
      actions={
        <>
          {supplier && (
            <Button className="text-danger" onClick={() => void remove()}>
              {t('catalog.common.delete')}
            </Button>
          )}
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            {t('catalog.common.save')}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <SectionCard id="basic" title={t('catalog.inventory.supplierEditor.nav.basic')} subtitle={t('catalog.inventory.supplierEditor.basicSubtitle')}>
          <div className="flex flex-col gap-5">
            <Field label={t('catalog.inventory.supplierEditor.name')} error={shown('name')}>
              {(fid) => <TextInput id={fid} value={form.name} maxLength={100} invalid={Boolean(shown('name'))} onChange={(e) => set({ name: e.target.value })} placeholder={t('catalog.inventory.supplierEditor.namePlaceholder')} />}
            </Field>
            <Field label={t('catalog.inventory.supplierEditor.description')} optional counter={{ value: form.description.length, max: 100 }}>
              {(fid) => <TextArea id={fid} value={form.description} maxLength={100} onChange={(e) => set({ description: e.target.value })} placeholder={t('catalog.inventory.supplierEditor.descriptionPlaceholder')} />}
            </Field>
          </div>
        </SectionCard>

        <SectionCard id="contact" title={t('catalog.inventory.supplierEditor.nav.contact')} subtitle={t('catalog.inventory.supplierEditor.contactSubtitle')}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('catalog.inventory.supplierEditor.firstName')}>{(fid) => <TextInput id={fid} value={form.firstName} onChange={(e) => set({ firstName: e.target.value })} autoComplete="off" />}</Field>
            <Field label={t('catalog.inventory.supplierEditor.lastName')}>{(fid) => <TextInput id={fid} value={form.lastName} onChange={(e) => set({ lastName: e.target.value })} autoComplete="off" />}</Field>
            <Field label={t('catalog.inventory.supplierEditor.mobile')}>{(fid) => <TextInput id={fid} type="tel" prefix="+351" value={form.mobile} onChange={(e) => set({ mobile: e.target.value })} />}</Field>
            <Field label={t('catalog.inventory.supplierEditor.telephone')}>{(fid) => <TextInput id={fid} type="tel" prefix="+351" value={form.telephone} onChange={(e) => set({ telephone: e.target.value })} />}</Field>
            <Field label={t('catalog.inventory.supplierEditor.email')} error={shown('email')}>
              {(fid) => <TextInput id={fid} type="email" value={form.email} invalid={Boolean(shown('email'))} onChange={(e) => set({ email: e.target.value })} placeholder={t('catalog.inventory.supplierEditor.emailPlaceholder')} />}
            </Field>
            <Field label={t('catalog.inventory.supplierEditor.website')}>{(fid) => <TextInput id={fid} value={form.website} onChange={(e) => set({ website: e.target.value })} placeholder={t('catalog.inventory.supplierEditor.websitePlaceholder')} />}</Field>
          </div>
        </SectionCard>

        <SectionCard id="address" title={t('catalog.inventory.supplierEditor.nav.address')} subtitle={t('catalog.inventory.supplierEditor.addressSubtitle')}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('catalog.inventory.supplierEditor.street')} className="sm:col-span-2">
              {(fid) => <TextInput id={fid} value={form.address.line1 ?? ''} onChange={(e) => setAddress({ line1: e.target.value })} placeholder={t('catalog.inventory.supplierEditor.streetPlaceholder')} />}
            </Field>
            <Field label={t('catalog.inventory.supplierEditor.suburb')}>{(fid) => <TextInput id={fid} value={form.address.suburb ?? ''} onChange={(e) => setAddress({ suburb: e.target.value })} />}</Field>
            <Field label={t('catalog.inventory.supplierEditor.city')}>{(fid) => <TextInput id={fid} value={form.address.city ?? ''} onChange={(e) => setAddress({ city: e.target.value })} />}</Field>
            <Field label={t('catalog.inventory.supplierEditor.state')}>{(fid) => <TextInput id={fid} value={form.address.state ?? ''} onChange={(e) => setAddress({ state: e.target.value })} />}</Field>
            <Field label={t('catalog.inventory.supplierEditor.postcode')}>{(fid) => <TextInput id={fid} value={form.address.postcode ?? ''} onChange={(e) => setAddress({ postcode: e.target.value })} />}</Field>
            <Field label={t('catalog.inventory.supplierEditor.country')}>
              {(fid) => <Select id={fid} value={form.address.country ?? 'Portugal'} onChange={(e) => setAddress({ country: e.target.value })} options={COUNTRIES.includes(form.address.country ?? '') || !form.address.country ? COUNTRIES : [form.address.country, ...COUNTRIES]} />}
            </Field>
          </div>
        </SectionCard>
      </form>
    </EditorFrame>
  )
}
