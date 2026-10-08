import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Checkbox, Field, SearchInput, TextInput } from '@/components/ui'
import { updateLocation, updateSettings } from '@/api/settings'
import type { ID, Settings } from '@/types'
import { AddLink, CardButton, EditCard, FormCard, InfoGrid, Rule, SettingsPage } from '../components/ui'
import { FullModal } from '../components/FullModal'
import { useAction, useDraft } from '../components/useAction'
import { useLocations, useSettings } from '../hooks'

type Receipts = Settings['receipts']

const LIMITS = { title: 20, line1: 100, line2: 100, footer: 225 } as const

/** Settings › Sales › Receipts (settings-sales.md §3). */
export function ReceiptsPage() {
  const { t } = useTranslation()
  const receipts = useSettings().receipts
  const [editOpen, setEditOpen] = useState(false)
  const [seqOpen, setSeqOpen] = useState(false)
  const shown = (on: boolean) => (on ? t('settings.sale.receipts.shown') : t('settings.sale.receipts.hidden'))
  const text = (value: string) => (value ? <span className="text-muted">{value}</span> : <AddLink onClick={() => setEditOpen(true)} />)

  return (
    <SettingsPage title={t('settings.sale.receipts.title')} description={t('settings.sale.receipts.description')} learnMore={t('settings.sale.receipts.title')}>
      <EditCard title={t('settings.sale.receipts.designTitle')} description={t('settings.sale.receipts.designDescription')} onEdit={() => setEditOpen(true)} testId="receipt-design-card">
        <InfoGrid
          rows={[
            { key: 'contact', label: t('settings.sale.receipts.clientContact'), value: shown(receipts.showContact) },
            { key: 'address', label: t('settings.sale.receipts.clientAddress'), value: shown(receipts.showAddress) },
            { key: 'title', label: t('settings.sale.receipts.receiptTitle'), value: text(receipts.title) },
            { key: 'line1', label: t('settings.sale.receipts.line1'), value: text(receipts.line1) },
            { key: 'line2', label: t('settings.sale.receipts.line2'), value: text(receipts.line2) },
            { key: 'footer', label: t('settings.sale.receipts.footer'), value: text(receipts.footer) },
          ]}
        />
      </EditCard>
      <EditCard
        title={t('settings.sale.receipts.sequencingTitle')}
        description={t('settings.sale.receipts.sequencingDescription')}
        action={
          <CardButton onClick={() => setSeqOpen(true)} testId="receipt-sequencing-manage">
            {t('settings.common.manage')}
          </CardButton>
        }
      />
      <ReceiptSettingsModal open={editOpen} onClose={() => setEditOpen(false)} value={receipts} />
      <SequencingModal open={seqOpen} onClose={() => setSeqOpen(false)} />
    </SettingsPage>
  )
}

/** "Edit receipt settings" full-screen form. */
function ReceiptSettingsModal({ open, onClose, value }: { open: boolean; onClose: () => void; value: Receipts }) {
  const { t } = useTranslation()
  const [draft, patch, reset] = useDraft<Receipts>(value)
  const [wasOpen, setWasOpen] = useState(false)
  const [error, setError] = useState('')
  const [saving, run] = useAction()
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      reset(value)
      setError('')
    }
  }
  const save = () => {
    if (!draft.title.trim()) {
      setError(t('settings.sale.receipts.titleRequired'))
      return
    }
    const next: Receipts = { ...draft, title: draft.title.trim(), line1: draft.line1.trim(), line2: draft.line2.trim(), footer: draft.footer.trim() }
    void run(
      () =>
        updateSettings((s) => {
          s.receipts = next
        }),
      t('settings.sale.receipts.saved'),
      onClose,
    )
  }
  const textField = (key: 'title' | 'line1' | 'line2' | 'footer', label: string) => (
    <Field label={label} counter={{ value: draft[key].length, max: LIMITS[key] }} error={key === 'title' ? error : undefined}>
      {(id) => (
        <TextInput
          id={id}
          value={draft[key]}
          maxLength={LIMITS[key]}
          invalid={key === 'title' && Boolean(error)}
          onChange={(e) => {
            if (key === 'title') setError('')
            patch({ [key]: e.target.value } as Partial<Receipts>)
          }}
        />
      )}
    </Field>
  )
  return (
    <FullModal open={open} onClose={onClose} title={t('settings.sale.receipts.editTitle')} subtitle={t('settings.sale.receipts.editSubtitle')} onSave={save} saving={saving} testId="receipt-settings-modal">
      <FormCard>
        <div className="flex flex-col gap-4">
          <Checkbox label={t('settings.sale.receipts.showContact')} checked={draft.showContact} onChange={(showContact) => patch({ showContact })} />
          <Checkbox label={t('settings.sale.receipts.showAddress')} checked={draft.showAddress} onChange={(showAddress) => patch({ showAddress })} />
          <Checkbox label={t('settings.sale.receipts.showTeam')} checked={draft.showTeam} onChange={(showTeam) => patch({ showTeam })} />
        </div>
        <div className="flex flex-col gap-5">
          {textField('title', t('settings.sale.receipts.receiptTitle'))}
          {textField('line1', t('settings.sale.receipts.line1'))}
          {textField('line2', t('settings.sale.receipts.line2'))}
          {textField('footer', t('settings.sale.receipts.footer'))}
        </div>
        <Rule />
        <Checkbox label={t('settings.sale.receipts.autoPrint')} checked={draft.autoPrint} onChange={(autoPrint) => patch({ autoPrint })} />
      </FormCard>
    </FullModal>
  )
}

interface SeqRow {
  prefix: string
  next: string
}

/** "Receipt sequencing": prefix and next receipt number per location. */
function SequencingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const locations = useLocations()
  const [rows, setRows] = useState<Record<ID, SeqRow>>({})
  const [selected, setSelected] = useState<Set<ID>>(new Set())
  const [query, setQuery] = useState('')
  const [wasOpen, setWasOpen] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, run] = useAction()
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setRows(Object.fromEntries(locations.map((l) => [l.id, { prefix: l.receiptPrefix, next: String(l.nextReceiptNumber) }])))
      setSelected(new Set())
      setQuery('')
      setErrors({})
    }
  }
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? locations.filter((l) => l.name.toLowerCase().includes(q)) : locations
  }, [locations, query])
  const allSelected = visible.length > 0 && visible.every((l) => selected.has(l.id))

  const setRow = (id: ID, patch: Partial<SeqRow>) => {
    setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }))
    setErrors((e) => {
      const next = { ...e }
      delete next[`${id}.prefix`]
      delete next[`${id}.next`]
      return next
    })
  }

  const restartSelected = () => {
    setRows((r) => {
      const next = { ...r }
      selected.forEach((id) => {
        if (next[id]) next[id] = { ...next[id], next: '1' }
      })
      return next
    })
  }

  const save = () => {
    const errs: Record<string, string> = {}
    for (const l of locations) {
      const row = rows[l.id]
      if (!row) continue
      if (!/^[A-Za-z0-9\-/]*$/.test(row.prefix)) errs[`${l.id}.prefix`] = t('settings.sale.receipts.prefixInvalid')
      const n = Number(row.next)
      if (!row.next.trim() || !Number.isInteger(n) || n < 1) errs[`${l.id}.next`] = t('settings.sale.receipts.nextInvalid')
    }
    setErrors(errs)
    if (Object.keys(errs).length) {
      if (Object.keys(errs).some((k) => !visible.some((l) => k.startsWith(`${l.id}.`)))) setQuery('')
      return
    }
    const changed = locations.filter((l) => rows[l.id] && (rows[l.id].prefix.trim().toUpperCase() !== l.receiptPrefix || Number(rows[l.id].next) !== l.nextReceiptNumber))
    void run(
      () =>
        Promise.all(
          changed.map((l) =>
            updateLocation(l.id, (loc) => {
              loc.receiptPrefix = rows[l.id].prefix.trim().toUpperCase()
              loc.nextReceiptNumber = Number(rows[l.id].next)
            }),
          ),
        ),
      t('settings.sale.receipts.sequencingSaved'),
      onClose,
    )
  }

  return (
    <FullModal open={open} onClose={onClose} title={t('settings.sale.receipts.sequencingTitle')} subtitle={t('settings.sale.receipts.sequencingDescription')} onSave={save} saving={saving} width="max-w-[1040px]" testId="receipt-sequencing-modal">
      <div className="rounded-lg bg-sunken p-4">
        <SearchInput value={query} onChange={setQuery} placeholder={t('settings.sale.receipts.searchLocations')} className="max-w-[380px]" />
      </div>
      {selected.size > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3">
          <span className="text-body-strong text-ink">{t('settings.sale.receipts.selected', { count: selected.size })}</span>
          <Button size="sm" onClick={restartSelected} data-testid="restart-numbering">
            {t('settings.sale.receipts.restartNumbering')}
          </Button>
        </div>
      )}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-body">
          <thead>
            <tr className="border-b border-line">
              <th className="w-12 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label={t('settings.sale.receipts.selectAll')}
                  checked={allSelected}
                  onChange={(e) => setSelected(e.target.checked ? new Set(visible.map((l) => l.id)) : new Set())}
                  className="h-5 w-5 accent-[rgb(var(--primary))]"
                />
              </th>
              <th className="px-4 py-3 text-body-strong text-ink">{t('settings.sale.receipts.location')}</th>
              <th className="px-4 py-3 text-body-strong text-ink">{t('settings.sale.receipts.prefix')}</th>
              <th className="px-4 py-3 text-body-strong text-ink">{t('settings.sale.receipts.nextNumber')}</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-body text-muted">
                  {t('settings.common.noResults')}
                </td>
              </tr>
            )}
            {visible.map((l) => {
              const row = rows[l.id] ?? { prefix: l.receiptPrefix, next: String(l.nextReceiptNumber) }
              const prefixError = errors[`${l.id}.prefix`]
              const nextError = errors[`${l.id}.next`]
              return (
                <tr key={l.id} className="border-b border-line last:border-0 align-top" data-testid={`seq-row-${l.id}`}>
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      aria-label={l.name}
                      checked={selected.has(l.id)}
                      onChange={(e) =>
                        setSelected((s) => {
                          const next = new Set(s)
                          if (e.target.checked) next.add(l.id)
                          else next.delete(l.id)
                          return next
                        })
                      }
                      className="mt-3 h-5 w-5 accent-[rgb(var(--primary))]"
                    />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary-subtle font-display text-body-strong text-primary" aria-hidden>
                        {l.name.slice(0, 1)}
                      </span>
                      <span className="text-body-strong text-ink">{l.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <TextInput value={row.prefix} maxLength={8} aria-label={`${t('settings.sale.receipts.prefix')} – ${l.name}`} invalid={Boolean(prefixError)} onChange={(e) => setRow(l.id, { prefix: e.target.value })} />
                    {prefixError && <p className="mt-1.5 text-small text-danger">{prefixError}</p>}
                  </td>
                  <td className="px-4 py-4">
                    <TextInput type="number" min={1} step={1} inputMode="numeric" value={row.next} aria-label={`${t('settings.sale.receipts.nextNumber')} – ${l.name}`} invalid={Boolean(nextError)} onChange={(e) => setRow(l.id, { next: e.target.value })} />
                    {nextError && <p className="mt-1.5 text-small text-danger">{nextError}</p>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-small text-muted">{t('settings.sale.receipts.sequencingHelp')}</p>
    </FullModal>
  )
}
