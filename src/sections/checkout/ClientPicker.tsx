import { ArrowLeft, Footprints, UserPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Avatar, Button, Field, Modal, SearchInput, TextInput, toast } from '@/components/ui'
import { useDb } from '@/store/db'
import { quickCreateClient } from '@/api/checkout'
import { fullName } from '@/lib/format'
import { useCheckout } from './context'

/** Client picker in the checkout main area: search, Add new client, Walk-In. */
export function ClientPicker() {
  const { t } = useTranslation()
  const c = useCheckout()
  const clients = useDb((s) => s.clients)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return clients
      .filter((x) => !x.deletedAt && !x.blocked)
      .filter((x) => !q || `${x.firstName} ${x.lastName} ${x.email} ${x.phone.replace(/\s/g, '')}`.toLowerCase().includes(q.replace(/\s/g, q.includes('@') ? '' : ' ')))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 40)
  }, [clients, query])

  const choose = (id: string | null) => {
    c.setClientId(id)
    c.setView('step')
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => c.setView('step')} aria-label={t('checkout.common.goBack')} className="icon-btn -ml-2">
          <ArrowLeft size={22} aria-hidden />
        </button>
        <h1 className="font-display text-title-2 text-ink">{t('checkout.client.selectClient')}</h1>
      </div>
      <SearchInput className="mt-4 md:mt-6" value={query} onChange={setQuery} placeholder={t('checkout.client.search')} />
      <div className="mt-4 flex flex-col">
        <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-4 rounded-md px-3 py-3 text-left hover:bg-sunken/60">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-subtle text-primary">
            <UserPlus size={22} aria-hidden />
          </span>
          <span className="text-body-lg font-semibold text-ink">{t('checkout.client.addNew')}</span>
        </button>
        <button type="button" onClick={() => choose(null)} className="flex items-center gap-4 rounded-md px-3 py-3 text-left hover:bg-sunken/60">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-subtle text-primary">
            <Footprints size={22} aria-hidden />
          </span>
          <span className="text-body-lg font-semibold text-ink">{t('checkout.client.walkIn')}</span>
        </button>
        <div className="my-2 border-t border-line" />
        {list.map((x) => (
          <button key={x.id} type="button" onClick={() => choose(x.id)} className="flex items-center gap-4 rounded-md px-3 py-3 text-left hover:bg-sunken/60" data-testid="client-option">
            <Avatar name={fullName(x)} photo={x.photo} size={48} />
            <span className="min-w-0">
              <span className="block truncate text-body-lg text-ink">{fullName(x)}</span>
              <span className="block truncate text-body text-muted">{x.email || x.phone}</span>
            </span>
          </button>
        ))}
        {list.length === 0 && <p className="px-3 py-8 text-center text-body text-muted">{t('checkout.client.noMatches')}</p>}
      </div>
      {adding && <NewClientModal onClose={() => setAdding(false)} onCreated={(id) => choose(id)} initial={query} />}
    </div>
  )
}

const schema = z.object({
  firstName: z.string().trim().min(1, 'required'),
  lastName: z.string().trim(),
  email: z.union([z.literal(''), z.string().trim().email('email')]),
  phone: z.string().trim(),
})

function NewClientModal({ onClose, onCreated, initial }: { onClose: () => void; onCreated: (id: string) => void; initial: string }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(() => {
    const email = initial.includes('@')
    const parts = initial.trim().split(/\s+/)
    return { firstName: email ? '' : (parts[0] ?? ''), lastName: email ? '' : parts.slice(1).join(' '), email: email ? initial.trim() : '', phone: '' }
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const save = async () => {
    const parsed = schema.safeParse(form)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      parsed.error.issues.forEach((i) => (next[String(i.path[0])] = i.message === 'email' ? t('checkout.client.invalidEmail') : t('checkout.client.firstNameRequired')))
      setErrors(next)
      return
    }
    setBusy(true)
    try {
      const client = await quickCreateClient(form)
      toast(t('checkout.toasts.clientCreated'))
      onCreated(client.id)
      onClose()
    } catch (e) {
      setErrors({ email: e instanceof Error ? e.message : t('checkout.errors.generic') })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={t('checkout.client.addNew')}
      footer={
        <>
          <Button onClick={onClose}>{t('checkout.common.cancel')}</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {t('checkout.common.save')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('checkout.client.firstName')} error={errors.firstName}>
          {(id) => <TextInput id={id} value={form.firstName} onChange={set('firstName')} invalid={Boolean(errors.firstName)} />}
        </Field>
        <Field label={t('checkout.client.lastName')}>{(id) => <TextInput id={id} value={form.lastName} onChange={set('lastName')} />}</Field>
        <Field className="col-span-2" label={t('checkout.client.email')} error={errors.email}>
          {(id) => <TextInput id={id} type="email" value={form.email} onChange={set('email')} invalid={Boolean(errors.email)} />}
        </Field>
        <Field className="col-span-2" label={t('checkout.client.phone')}>
          {(id) => <TextInput id={id} type="tel" value={form.phone} onChange={set('phone')} placeholder="+351 912 345 678" />}
        </Field>
      </div>
    </Modal>
  )
}
