import clsx from 'clsx'
import { ArrowLeft, CalendarCheck, Coins, Percent, ShoppingBag } from 'lucide-react'
import { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { Client, ClientReward, ID } from '@/types'
import { useDb } from '@/store/db'
import { money } from '@/lib/format'
import { Button, Checkbox, Field, FullscreenFrame, Modal, SearchInput, Select, TextInput, toast } from '@/components/ui'
import { addReward, type RewardInput } from '@/api/clients'
import { useEscape } from './context'

type RewardType = ClientReward['type']
type Scope = 'services' | 'products' | 'packages' | 'memberships'
type Unit = NonNullable<RewardInput['expires']>['unit']

const TYPES: { type: RewardType; icon: typeof Coins }[] = [
  { type: 'amount', icon: Coins },
  { type: 'percent', icon: Percent },
  { type: 'free_service', icon: CalendarCheck },
  { type: 'free_product', icon: ShoppingBag },
]

/** Full-screen "Add reward" flow (clients.md §4): choose a type, then configure it. */
export function RewardFlow({ client, onClose }: { client: Client; onClose: () => void }) {
  const { t } = useTranslation()
  const services = useDb((s) => s.services)
  const products = useDb((s) => s.products)
  const packages = useDb((s) => s.packages)
  const memberships = useDb((s) => s.memberships)
  const [type, setType] = useState<RewardType | null>(null)
  const [value, setValue] = useState('')
  const [itemId, setItemId] = useState('')
  const [customName, setCustomName] = useState(false)
  const [name, setName] = useState('')
  const [scope, setScope] = useState<Record<Scope, 'all' | ID[]>>({ services: 'all', products: [], packages: [], memberships: [] })
  const [giftCards, setGiftCards] = useState(true)
  const [minPurchase, setMinPurchase] = useState(false)
  const [minAmount, setMinAmount] = useState('')
  const [withDeals, setWithDeals] = useState(true)
  const [expires, setExpires] = useState(false)
  const [expiryValue, setExpiryValue] = useState('6')
  const [expiryUnit, setExpiryUnit] = useState<Unit>('month')
  const [inStore, setInStore] = useState(false)
  const [editScope, setEditScope] = useState<Scope | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const stableClose = useCallback(() => onClose(), [onClose])
  useEscape(editScope ? () => setEditScope(null) : stableClose)

  const liveServices = services.filter((s) => !s.archived)
  const liveProducts = products.filter((p) => !p.archived && p.retailSales)
  const lists: Record<Scope, { id: ID; name: string }[]> = {
    services: liveServices,
    products: liveProducts,
    packages: packages.filter((p) => !p.archived),
    memberships: memberships.filter((m) => !m.archived),
  }
  const num = Number(value)
  const item = type === 'free_service' ? services.find((s) => s.id === itemId) : type === 'free_product' ? products.find((p) => p.id === itemId) : undefined
  const suggested =
    type === 'percent' ? t('clients.reward.percentName', { value: value || 0 }) : type === 'amount' ? t('clients.reward.amountName', { value: money(num || 0) }) : item ? t('clients.reward.freeName', { name: item.name }) : t(`clients.reward.types.${type ?? 'amount'}`)

  const scopeLabel = (s: Scope) => {
    const v = scope[s]
    if (v === 'all') return t(`clients.reward.scope.all_${s}`)
    if (v.length === 0) return t(`clients.reward.scope.none_${s}`)
    return t(`clients.reward.scope.some_${s}`, { count: v.length })
  }

  const submit = async () => {
    const next: Record<string, string> = {}
    if (type === 'percent' && (!num || num <= 0 || num > 100)) next.value = t('clients.reward.errors.percent')
    if (type === 'amount' && (!num || num <= 0)) next.value = t('clients.reward.errors.amount')
    if ((type === 'free_service' || type === 'free_product') && !itemId) next.item = t('clients.reward.errors.item')
    if (customName && !name.trim()) next.name = t('clients.reward.errors.name')
    if (minPurchase && !(Number(minAmount) > 0)) next.min = t('clients.reward.errors.amount')
    if (expires && !(Number(expiryValue) > 0)) next.expiry = t('clients.reward.errors.expiry')
    setErrors(next)
    if (Object.keys(next).length || !type) return
    setBusy(true)
    try {
      await addReward(client.id, {
        type,
        name: customName ? name.trim() : suggested,
        value: type === 'percent' || type === 'amount' ? num : (item && 'price' in item ? item.price : item && 'retailPrice' in item ? item.retailPrice : 0),
        inStoreOnly: inStore,
        expires: expires ? { value: Number(expiryValue), unit: expiryUnit } : undefined,
        extra: { itemId: itemId || undefined, appliesTo: type === 'percent' || type === 'amount' ? { ...scope, giftCards } : undefined, minPurchase: minPurchase ? Number(minAmount) : undefined, withDeals },
      })
      toast(t('clients.reward.toast'))
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const discount = type === 'percent' || type === 'amount'

  return createPortal(
    <div className="fixed inset-0 z-[85] bg-canvas" role="dialog" aria-modal="true" aria-label={t('clients.reward.chooseTitle')}>
      <FullscreenFrame
        onClose={onClose}
        maxWidth="max-w-3xl"
        actions={
          type ? (
            <>
              <Button icon={<ArrowLeft size={16} aria-hidden />} onClick={() => setType(null)}>
                {t('clients.common.back')}
              </Button>
              <Button variant="primary" loading={busy} onClick={() => void submit()}>
                {t('clients.common.add')}
              </Button>
            </>
          ) : undefined
        }
      >
        {!type ? (
          <>
            <h1 className="font-display text-display text-ink">{t('clients.reward.chooseTitle')}</h1>
            <div className="mt-8 flex flex-col gap-4">
              {TYPES.map(({ type: ty, icon: Icon }) => (
                <button key={ty} type="button" onClick={() => setType(ty)} className="flex items-center gap-4 rounded-lg border border-line bg-surface p-5 text-left transition-colors hover:border-primary hover:bg-primary-subtle/30">
                  <span className="flex h-12 w-12 items-center justify-center rounded-md bg-success-subtle text-success">
                    <Icon size={22} aria-hidden />
                  </span>
                  <span className="text-body-lg font-semibold text-ink">{t(`clients.reward.types.${ty}`)}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <h1 className="font-display text-display text-ink">{t(`clients.reward.addTitle.${type}`)}</h1>
            <div className="mt-8 flex flex-col gap-6">
              {discount ? (
                <Field label={t('clients.reward.value')} error={errors.value}>
                  {(id) => <TextInput id={id} autoFocus type="number" min={0} step={type === 'percent' ? 1 : 0.01} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={type === 'percent' ? '10' : '10.00'} prefix={type === 'amount' ? '€' : undefined} suffix={type === 'percent' ? '%' : undefined} invalid={Boolean(errors.value)} />}
                </Field>
              ) : (
                <Field label={type === 'free_service' ? t('clients.reward.service') : t('clients.reward.product')} error={errors.item}>
                  {(id) => (
                    <Select
                      id={id}
                      value={itemId}
                      onChange={(e) => setItemId(e.target.value)}
                      placeholder={t('clients.form.selectOption')}
                      options={(type === 'free_service' ? liveServices.map((s) => ({ value: s.id, label: `${s.name} · ${money(s.price)}` })) : liveProducts.map((p) => ({ value: p.id, label: `${p.name} · ${money(p.retailPrice)}` })))}
                    />
                  )}
                </Field>
              )}
              <div>
                <Checkbox
                  checked={customName}
                  onChange={setCustomName}
                  label={t('clients.reward.customName')}
                  hint={
                    <>
                      {t('clients.reward.customNameHint1')} <strong>{suggested}</strong> {t('clients.reward.customNameHint2')}
                    </>
                  }
                />
                {customName && (
                  <Field label={t('clients.reward.name')} error={errors.name} className="ml-8 mt-3" counter={{ value: name.length, max: 50 }}>
                    {(id) => <TextInput id={id} maxLength={50} value={name} onChange={(e) => setName(e.target.value)} placeholder={suggested} invalid={Boolean(errors.name)} />}
                  </Field>
                )}
              </div>

              {discount && (
                <section>
                  <h2 className="font-display text-title-3 text-ink">{t('clients.reward.applyTo')}</h2>
                  <div className="mt-4 flex flex-col gap-3">
                    {(['services', 'products', 'packages', 'memberships'] as const).map((s) => (
                      <div key={s} className="flex h-14 items-center justify-between rounded-md border border-line bg-surface px-5">
                        <span className="text-body-lg text-ink">{scopeLabel(s)}</span>
                        <Button variant="link" onClick={() => setEditScope(s)}>
                          {t('clients.common.edit')}
                        </Button>
                      </div>
                    ))}
                    <Checkbox checked={giftCards} onChange={setGiftCards} label={t('clients.reward.giftCards')} className="mt-2" />
                  </div>
                </section>
              )}

              <section>
                <h2 className="font-display text-title-3 text-ink">{t('clients.reward.limits')}</h2>
                <div className="mt-4 flex flex-col gap-4">
                  <Checkbox checked={minPurchase} onChange={setMinPurchase} label={t('clients.reward.minPurchase')} />
                  {minPurchase && (
                    <Field label={t('clients.reward.minAmount')} error={errors.min} className="ml-8 max-w-xs">
                      {(id) => <TextInput id={id} type="number" min={0} step={0.01} prefix="€" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} invalid={Boolean(errors.min)} />}
                    </Field>
                  )}
                  <Checkbox checked={withDeals} onChange={setWithDeals} label={t('clients.reward.withDeals')} />
                  <Checkbox checked={expires} onChange={setExpires} label={t('clients.reward.expires')} />
                  {expires && (
                    <div className="ml-8 grid max-w-md grid-cols-2 gap-3">
                      <Field label={t('clients.reward.expiresAfter')} error={errors.expiry}>
                        {(id) => <TextInput id={id} type="number" min={1} value={expiryValue} onChange={(e) => setExpiryValue(e.target.value)} invalid={Boolean(errors.expiry)} />}
                      </Field>
                      <Field label={t('clients.reward.unit')}>
                        {(id) => <Select id={id} value={expiryUnit} onChange={(e) => setExpiryUnit(e.target.value as Unit)} options={(['day', 'week', 'month', 'year'] as const).map((u) => ({ value: u, label: t(`clients.reward.units.${u}`) }))} />}
                      </Field>
                    </div>
                  )}
                  <Checkbox checked={inStore} onChange={setInStore} label={t('clients.reward.inStore')} />
                </div>
              </section>
            </div>
          </>
        )}
      </FullscreenFrame>
      {editScope && (
        <ScopeModal
          title={t(`clients.reward.scopeTitle.${editScope}`)}
          items={lists[editScope]}
          value={scope[editScope] === 'all' ? lists[editScope].map((i) => i.id) : (scope[editScope] as ID[])}
          onClose={() => setEditScope(null)}
          onApply={(ids) => {
            setScope({ ...scope, [editScope]: ids.length === lists[editScope].length && ids.length > 0 ? 'all' : ids })
            setEditScope(null)
          }}
        />
      )}
    </div>,
    document.body,
  )
}

function ScopeModal({ title, items, value, onClose, onApply }: { title: string; items: { id: ID; name: string }[]; value: ID[]; onClose: () => void; onApply: (ids: ID[]) => void }) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<ID[]>(value)
  const [query, setQuery] = useState('')
  const visible = items.filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase()))
  const all = items.length > 0 && selected.length === items.length
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="text-body text-muted">{t('clients.reward.selectedItems', { count: selected.length })}</span>
          <Button variant="primary" onClick={() => onApply(selected)}>
            {t('clients.common.apply')}
          </Button>
        </div>
      }
    >
      <SearchInput value={query} onChange={setQuery} placeholder={t('clients.common.search')} className="mb-3" />
      <label className="flex cursor-pointer items-center gap-3 border-b border-line py-3">
        <input type="checkbox" checked={all} onChange={(e) => setSelected(e.target.checked ? items.map((i) => i.id) : [])} className="h-5 w-5 accent-[rgb(var(--primary))]" />
        <span className="text-body-strong text-ink">{t('clients.reward.selectAll')}</span>
        <span className="chip h-5 bg-sunken px-1.5 text-caption text-muted">{items.length}</span>
      </label>
      <ul className="max-h-[45vh] overflow-y-auto">
        {visible.map((i) => (
          <li key={i.id}>
            <label className={clsx('flex cursor-pointer items-center gap-3 border-b border-line py-3')}>
              <input type="checkbox" checked={selected.includes(i.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, i.id] : selected.filter((x) => x !== i.id))} className="h-5 w-5 accent-[rgb(var(--primary))]" />
              <span className="text-body text-ink">{i.name}</span>
            </label>
          </li>
        ))}
        {items.length === 0 && <li className="py-6 text-center text-body text-muted">{t('clients.common.noResults')}</li>}
      </ul>
    </Modal>
  )
}
