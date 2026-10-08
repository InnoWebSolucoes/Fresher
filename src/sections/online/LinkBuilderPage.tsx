import { CalendarCheck, Gift, Link2, Package, Scissors, Trash2, Users } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, Checkbox, confirm, DataTable, EmptyState, Field, LearnMore, Menu, Modal, Page, PageHeader, PageSkeleton, SearchInput, Select, TextInput, toast, usePageLoading, type Column } from '@/components/ui'
import { useDb } from '@/store/db'
import { bookingLinkUrl, createBookingLink, deleteBookingLink, useOnlineState, type BookingLink } from '@/api/online'
import { fmtDate } from '@/lib/format'
import { copyText, LinkWithQr, ProfileGateModal } from './shared'

type Kind = BookingLink['kind']
const KINDS: { kind: Kind; icon: ReactNode }[] = [
  { kind: 'everything', icon: <Link2 size={22} aria-hidden /> },
  { kind: 'services', icon: <Scissors size={22} aria-hidden /> },
  { kind: 'packages', icon: <Package size={22} aria-hidden /> },
  { kind: 'memberships', icon: <Users size={22} aria-hidden /> },
  { kind: 'gift_cards', icon: <Gift size={22} aria-hidden /> },
]

/** Link builder (online-booking.md §4): shareable booking links with QR codes. */
export function LinkBuilderPage() {
  const { t } = useTranslation()
  const loading = usePageLoading()
  const locations = useDb((s) => s.locations)
  const { links } = useOnlineState()
  const [gate, setGate] = useState<Kind | null>(null)
  const [creating, setCreating] = useState<Kind | null>(null)
  const [result, setResult] = useState<BookingLink | null>(null)
  const listed = locations.some((l) => l.marketplace.listed)
  if (loading) return <Page><PageSkeleton /></Page>

  const open = (kind: Kind) => (listed ? setCreating(kind) : setGate(kind))
  const remove = async (l: BookingLink) => {
    if (!(await confirm({ title: t('online.links.deleteTitle'), body: t('online.links.deleteBody', { name: l.name }), confirmLabel: t('online.common.delete'), tone: 'danger' }))) return
    await deleteBookingLink(l.id)
    toast(t('online.links.deletedToast'))
  }
  const columns: Column<BookingLink>[] = [
    { key: 'name', header: t('online.links.cols.name'), cell: (r) => <span className="text-body-strong text-ink">{r.name}</span>, sortValue: (r) => r.name },
    { key: 'type', header: t('online.links.cols.type'), cell: (r) => t(`online.links.kinds.${r.kind}.short`) },
    { key: 'url', header: t('online.links.cols.link'), cell: (r) => <span className="block max-w-[340px] truncate text-small text-muted">{r.url}</span> },
    { key: 'created', header: t('online.links.cols.created'), cell: (r) => fmtDate(r.createdAt), sortValue: (r) => r.createdAt },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (r) => (
        <Menu
          groups={[
            { items: [{ label: t('online.links.viewQr'), onSelect: () => setResult(r) }, { label: t('online.common.copyLink'), onSelect: () => copyText(r.url, t('online.common.linkCopied')) }] },
            { items: [{ label: t('online.common.delete'), danger: true, icon: <Trash2 size={16} aria-hidden />, onSelect: () => void remove(r) }] },
          ]}
        />
      ),
    },
  ]

  return (
    <Page>
      <PageHeader
        title={t('online.links.title')}
        subtitle={
          <>
            {t('online.links.subtitle')} <LearnMore topic="Link builder" />
          </>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {KINDS.map(({ kind, icon }) => (
          <div key={kind} className="card flex flex-col p-5">
            <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-primary-subtle text-primary">{icon}</span>
            <h2 className="text-title-3 text-ink">{t(`online.links.kinds.${kind}.title`)}</h2>
            <p className="mt-1 flex-1 text-body text-muted">{t(`online.links.kinds.${kind}.body`)}</p>
            <Button className="mt-4 self-start" onClick={() => open(kind)}>
              {t('online.links.create')}
            </Button>
          </div>
        ))}
      </div>
      <Card title={t('online.links.yours')} className="mt-8">
        {links.length ? (
          <DataTable columns={columns} rows={links} rowKey={(r) => r.id} onRowClick={setResult} />
        ) : (
          <EmptyState icon={<CalendarCheck size={32} aria-hidden />} title={t('online.links.emptyTitle')} body={t('online.links.emptyBody')} action={<Button variant="primary" onClick={() => open('everything')}>{t('online.links.create')}</Button>} />
        )}
      </Card>
      <ProfileGateModal open={gate !== null} onClose={() => setGate(null)} title={gate === 'everything' ? t('online.links.gateEverything') : t('online.links.gateServices')} locations={locations} />
      {creating && (
        <CreateLinkModal
          kind={creating}
          onClose={() => setCreating(null)}
          onCreated={(l) => {
            setCreating(null)
            setResult(l)
          }}
        />
      )}
      <Modal open={!!result} onClose={() => setResult(null)} title={result?.name} subtitle={t('online.links.readySubtitle')} footer={<Button variant="primary" onClick={() => setResult(null)}>{t('online.common.done')}</Button>}>
        {result && <LinkWithQr url={result.url} fileName={`qr-${result.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} />}
      </Modal>
    </Page>
  )
}

function CreateLinkModal({ kind, onClose, onCreated }: { kind: Kind; onClose: () => void; onCreated: (l: BookingLink) => void }) {
  const { t } = useTranslation()
  const workspace = useDb((s) => s.workspace)
  const locations = useDb((s) => s.locations)
  const services = useDb((s) => s.services)
  const team = useDb((s) => s.teamMembers)
  const packages = useDb((s) => s.packages)
  const memberships = useDb((s) => s.memberships)
  const [name, setName] = useState(t(`online.links.kinds.${kind}.title`))
  const [locationId, setLocationId] = useState('all')
  const [serviceIds, setServiceIds] = useState<string[]>([])
  const [teamMemberId, setTeamMemberId] = useState('')
  const [itemId, setItemId] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const bookable = useMemo(() => services.filter((s) => !s.archived && s.onlineBooking && (locationId === 'all' || s.locationIds.includes(locationId))), [services, locationId])
  const shown = bookable.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()))
  const members = team.filter((m) => !m.archived && m.bookable && (locationId === 'all' || m.locationIds.includes(locationId)))
  const items: { id: string; name: string }[] = kind === 'packages' ? packages.map((p) => ({ id: p.id, name: p.name })) : kind === 'memberships' ? memberships.filter((m) => !m.archived).map((m) => ({ id: m.id, name: m.name })) : []
  const input = { kind, locationId, serviceIds, teamMemberId, itemId }
  const preview = bookingLinkUrl(input, workspace.name)

  const submit = async () => {
    if (!name.trim()) return setError(t('online.links.nameRequired'))
    setBusy(true)
    try {
      const link = await createBookingLink({ ...input, name: name.trim() })
      toast(t('online.links.createdToast'))
      onCreated(link)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('online.links.createTitle', { kind: t(`online.links.kinds.${kind}.short`).toLowerCase() })}
      subtitle={t(`online.links.kinds.${kind}.body`)}
      footer={
        <>
          <Button onClick={onClose}>{t('online.common.cancel')}</Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            {t('online.links.create')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label={t('online.links.name')} hint={t('online.links.nameHint')} error={error || undefined}>
          {(id) => (
            <TextInput
              id={id}
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError('')
              }}
              invalid={!!error}
            />
          )}
        </Field>
        {kind !== 'gift_cards' && (
          <Field label={t('online.links.location')}>
            {(id) => <Select id={id} value={locationId} onChange={(e) => setLocationId(e.target.value)} options={[{ value: 'all', label: t('online.links.allLocations') }, ...locations.map((l) => ({ value: l.id, label: l.name }))]} />}
          </Field>
        )}
        {kind === 'services' && (
          <>
            <Field label={t('online.links.teamMember')}>
              {(id) => <Select id={id} value={teamMemberId} onChange={(e) => setTeamMemberId(e.target.value)} options={[{ value: '', label: t('online.links.anyMember') }, ...members.map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}`.trim() }))]} />}
            </Field>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="label">{t('online.links.services', { count: serviceIds.length })}</p>
                <Button variant="link" onClick={() => setServiceIds(serviceIds.length ? [] : bookable.map((s) => s.id))}>
                  {serviceIds.length ? t('online.links.clear') : t('online.links.selectAll')}
                </Button>
              </div>
              <SearchInput value={q} onChange={setQ} placeholder={t('online.links.searchServices')} className="mb-2" />
              <div className="max-h-56 overflow-y-auto rounded-md border border-line p-2">
                {shown.map((s) => (
                  <Checkbox key={s.id} label={s.name} checked={serviceIds.includes(s.id)} onChange={(on) => setServiceIds(on ? [...serviceIds, s.id] : serviceIds.filter((x) => x !== s.id))} className="px-2 py-1.5" />
                ))}
              </div>
              <p className="mt-1 text-small text-muted">{t('online.links.servicesHint')}</p>
            </div>
          </>
        )}
        {(kind === 'packages' || kind === 'memberships') && (
          <Field label={t(`online.links.kinds.${kind}.short`)}>
            {(id) => <Select id={id} value={itemId} onChange={(e) => setItemId(e.target.value)} options={[{ value: '', label: t(`online.links.all_${kind}`) }, ...items.map((p) => ({ value: p.id, label: p.name }))]} />}
          </Field>
        )}
        <div>
          <p className="label mb-1">{t('online.links.preview')}</p>
          <p className="break-all rounded-md bg-sunken px-3 py-2 text-small text-muted">{preview}</p>
        </div>
      </div>
    </Modal>
  )
}
