import clsx from 'clsx'
import { ArrowLeft, Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import type { Client, ID } from '@/types'
import { useDb } from '@/store/db'
import { duplicatesOf, mergeClients } from '@/api/clients'
import { Button, Checkbox, EmptyState, Field, IconButton, LearnMore, Modal, PageSkeleton, Select, toast, usePageLoading } from '@/components/ui'
import { ClientAvatar } from '../components/common'
import { ClientSearchModal } from '../components/ClientSearchModal'
import { clientName } from '../lib/helpers'

export function ClientMergePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const loading = usePageLoading()
  const clients = useDb((s) => s.clients)
  const client = useMemo(() => clients.find((c) => c.id === id && !c.deletedAt), [clients, id])
  const leave = () => (window.history.length > 1 ? navigate(-1) : navigate('/clients/list'))

  return (
    <div className="flex h-full flex-col bg-canvas">
      <header className="mx-auto flex w-full max-w-[1400px] shrink-0 items-center justify-between px-6 py-4">
        <IconButton label={t('clients.more.common.back')} onClick={leave} className="h-12 w-12 border border-line-strong">
          <ArrowLeft size={20} aria-hidden />
        </IconButton>
        <Button size="lg" onClick={leave}>
          {t('clients.more.common.cancel')}
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1220px] px-6 pb-16 pt-4">
          {loading ? (
            <PageSkeleton rows={4} />
          ) : !client ? (
            <EmptyState
              className="py-20"
              title={t('clients.more.merge.notFoundTitle')}
              body={t('clients.more.merge.notFoundBody')}
              action={
                <Button variant="primary" onClick={() => navigate('/clients/list')}>
                  {t('clients.more.merge.backToList')}
                </Button>
              }
            />
          ) : (
            <MergeBody key={client.id} client={client} clients={clients} />
          )}
        </div>
      </div>
    </div>
  )
}

function MergeBody({ client, clients }: { client: Client; clients: Client[] }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  // The duplicates list is fixed when the page opens so rows don't jump while merging.
  const [found] = useState(() => duplicatesOf(client, clients).map((c) => c.id))
  const [manual, setManual] = useState<ID[]>([])
  const [selected, setSelected] = useState<Set<ID>>(() => new Set(found))
  const [searching, setSearching] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState(false)

  const byId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients])
  const live = (ids: ID[]) => ids.map((i) => byId.get(i)).filter((c): c is Client => !!c && !c.deletedAt)
  const foundClients = live(found)
  const manualClients = live(manual)
  const candidates = [...foundClients, ...manualClients]
  const picked = candidates.filter((c) => selected.has(c.id))
  const allSelected = candidates.length > 0 && picked.length === candidates.length

  const toggle = (cid: ID, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(cid)
    else next.delete(cid)
    setSelected(next)
    if (next.size) setError(false)
  }
  const openConfirm = () => {
    if (!picked.length) {
      setError(true)
      return
    }
    setConfirming(true)
  }

  const row = (c: Client, opts: { locked?: boolean; removable?: boolean }) => (
    <li key={c.id} className="flex items-center gap-4 border-b border-line py-4 pl-11 last:border-0">
      <span className="-ml-11 w-7">
        <Checkbox label={<span className="sr-only">{clientName(c)}</span>} checked={opts.locked || selected.has(c.id)} disabled={opts.locked} onChange={(v) => toggle(c.id, v)} />
      </span>
      <ClientAvatar client={c} size={56} />
      <div className={clsx('grid min-w-0 flex-1 grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.6fr)] items-center gap-4', opts.locked && 'text-muted')}>
        <span className="truncate text-body-strong text-ink">
          {clientName(c)}
          {opts.locked && <span className="ml-2 chip bg-sunken text-caption text-muted">{t('clients.more.merge.primary')}</span>}
        </span>
        <span className="truncate text-body text-muted">{c.phone || t('clients.more.common.dash')}</span>
        <span className="truncate text-body text-muted">{c.email || t('clients.more.common.dash')}</span>
      </div>
      {opts.removable && (
        <IconButton
          label={t('clients.more.merge.remove')}
          onClick={() => {
            setManual((m) => m.filter((x) => x !== c.id))
            toggle(c.id, false)
          }}
          className="h-9 w-9"
        >
          <X size={16} aria-hidden />
        </IconButton>
      )}
    </li>
  )

  return (
    <>
      <h1 className="font-display text-display text-ink">{t('clients.more.merge.title', { count: candidates.length })}</h1>
      <p className="mt-3 max-w-4xl text-body-lg text-muted">
        {t('clients.more.merge.subtitle')} <LearnMore topic={t('clients.list.mergeClients')}>{t('clients.more.merge.subtitleLink')}</LearnMore> {t('clients.more.merge.subtitleTail')}
      </p>

      <div className="mt-8 rounded-lg border border-line bg-sunken px-6 py-5">
        <p className="text-body-strong text-ink">{foundClients.length ? t('clients.more.merge.found', { count: foundClients.length }) : t('clients.more.merge.foundNone')}</p>
        <p className="mt-1 text-body text-muted">{foundClients.length ? t('clients.more.merge.foundBody') : t('clients.more.merge.foundNoneBody')}</p>
      </div>

      <div className="mt-6 flex items-center justify-between gap-4 border-b border-line pb-4">
        <Checkbox
          label={<span className="text-body-strong">{t('clients.more.merge.selectAll')}</span>}
          checked={allSelected}
          disabled={!candidates.length}
          onChange={(v) => {
            setSelected(v ? new Set(candidates.map((c) => c.id)) : new Set())
            if (v) setError(false)
          }}
        />
        <Button onClick={openConfirm}>{t('clients.more.merge.mergeSelected')}</Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-small text-danger">
          {t('clients.more.merge.selectOne')}
        </p>
      )}

      <ul>
        {row(client, { locked: true })}
        {foundClients.map((c) => row(c, {}))}
      </ul>

      {manualClients.length > 0 && (
        <>
          <h2 className="mt-8 text-title-3 font-semibold text-ink">{t('clients.more.merge.manual', { count: manualClients.length })}</h2>
          <ul className="mt-2">{manualClients.map((c) => row(c, { removable: true }))}</ul>
        </>
      )}

      <div className="mt-6 flex justify-end">
        <Button variant="link" icon={<Plus size={16} />} onClick={() => setSearching(true)}>
          {t('clients.more.merge.addAnother')}
        </Button>
      </div>

      <ClientSearchModal
        open={searching}
        onClose={() => setSearching(false)}
        title={t('clients.more.merge.searchTitle')}
        exclude={[client.id, ...found, ...manual]}
        onPick={(c) => {
          setManual((m) => [...m, c.id])
          toggle(c.id, true)
        }}
      />

      {confirming && (
        <ConfirmMerge
          keep={client}
          others={picked}
          onClose={() => setConfirming(false)}
          onDone={() => {
            toast(t('clients.more.merge.toast'))
            navigate('/clients/list')
          }}
        />
      )}
    </>
  )
}

function ConfirmMerge({ keep, others, onClose, onDone }: { keep: Client; others: Client[]; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation()
  const all = [keep, ...others]
  const names = all.filter((c, i) => all.findIndex((x) => clientName(x).toLowerCase() === clientName(c).toLowerCase()) === i)
  const emails = [...new Set(all.map((c) => c.email.trim()).filter(Boolean))]
  const [nameId, setNameId] = useState(keep.id)
  const [email, setEmail] = useState(keep.email.trim() || emails[0] || '')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const source = all.find((c) => c.id === nameId) ?? keep
    setSaving(true)
    try {
      await mergeClients(
        keep.id,
        others.map((c) => c.id),
        { firstName: source.firstName, lastName: source.lastName, email },
      )
      onDone()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error')
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={saving ? () => undefined : onClose}
      title={t('clients.more.merge.detailsTitle')}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            {t('clients.more.common.cancel')}
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            {t('clients.more.merge.mergeSave')}
          </Button>
        </>
      }
    >
      <p className="mb-5 text-body-lg text-ink">{t('clients.more.merge.detailsIntro')}</p>
      <Field label={t('clients.more.merge.clientName')} className="mb-5">
        {(fid) => <Select id={fid} value={nameId} disabled={names.length < 2} onChange={(e) => setNameId(e.target.value)} options={names.map((c) => ({ value: c.id, label: clientName(c) }))} className="w-full" />}
      </Field>
      <Field label={t('clients.more.merge.email')}>
        {(fid) => (
          <Select
            id={fid}
            value={email}
            disabled={emails.length < 2}
            onChange={(e) => setEmail(e.target.value)}
            options={emails.length ? emails : [{ value: '', label: t('clients.more.merge.noEmail') }]}
            className="w-full"
          />
        )}
      </Field>
      <p className="mt-1.5 text-small text-muted">
        {t('clients.more.merge.detailsHelp')} <LearnMore topic={t('clients.list.mergeClients')}>{t('clients.more.merge.here')}</LearnMore>.
      </p>
      <p className="mt-6 text-body-lg text-ink">{t('clients.more.merge.confirm', { count: all.length })}</p>
    </Modal>
  )
}
