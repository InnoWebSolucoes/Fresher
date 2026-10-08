import clsx from 'clsx'
import {
  Ban,
  Cake,
  ChevronDown,
  ChevronUp,
  Flag,
  Gift,
  MessagesSquare,
  NotebookPen,
  Plus,
  ShoppingBag,
  Sparkles,
  Sun,
  Tag,
  TestTube,
  TriangleAlert,
  UserPlus,
  UserRound,
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import type { DrawerProps } from '@/app/sectionRegistry'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { fmtDate } from '@/lib/format'
import { Button, confirm, EmptyState, Menu, MenuButton, Select, Skeleton, toast, usePageLoading } from '@/components/ui'
import { addClientNote, deleteClient, unblockClient, updateClientNote } from '@/api/clients'
import { ClientAvatar, BadgeChip } from '../components/common'
import { TagChip } from '../components/TagPicker'
import { ManageTagsModal, BlockClientModal } from '../components/ClientDialogs'
import { NoteEditorModal } from '../components/NoteEditorModal'
import { badgeKey, blockReasonLabel, DRAWER_TABS, pronounLabel, RECORD_TABS, type DrawerTab } from '../lib/constants'
import { clientName, fmtBirthday } from '../lib/helpers'
import { useSegmentEvaluator } from '../lib/hooks'
import { ClientDrawerContext, type ClientDrawerCtx, type DrawerAction } from './context'
import { AllergyModal, allergyName, FormResponseModal, MessagesIntroModal, PatchIcon, PatchTestModal, SendFormModal, SeverityIcon, StaffAlertModal } from './dialogs'
import { RewardFlow } from './RewardFlow'
import { AppointmentsTab, DetailsTab, ItemsTab, OverviewTab, SalesTab } from './tabs'
import { AllergiesTab, FilesTab, FormsTab, NotesTab, PatchTestsTab } from './records'
import { LoyaltyTab, RewardActivityModal, ReviewsTab, WalletTab } from './wallet'

/** Client profile drawer, 1027px, three columns (clients.md §4, calendar.md §8). */
export function ClientDrawer({ id, params, close }: DrawerProps) {
  const { t } = useTranslation()
  const loading = usePageLoading(250)
  const client = useDb((s) => s.clients.find((c) => c.id === id))
  if (loading) {
    return (
      <div className="flex h-full gap-6 p-8" aria-busy="true">
        <div className="flex w-[300px] flex-col items-center gap-3">
          <Skeleton className="h-24 w-24 rounded-full" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-52" />
          <Skeleton className="mt-4 h-10 w-full" />
        </div>
        <div className="flex flex-1 flex-col gap-3">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </div>
    )
  }
  if (!client || client.deletedAt) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState icon={<UserRound size={26} aria-hidden />} title={t('clients.drawer.notFound')} body={t('clients.drawer.notFoundBody')} action={<Button onClick={close}>{t('clients.common.close')}</Button>} />
      </div>
    )
  }
  const tab = (DRAWER_TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as DrawerTab) : 'overview'
  return <DrawerBody key={client.id} clientId={client.id} tab={tab} close={close} />
}

function DrawerBody({ clientId, tab, close }: { clientId: string; tab: DrawerTab; close: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const drawer = useDrawer()
  const client = useDb((s) => s.clients.find((c) => c.id === clientId))!
  const notes = useDb((s) => s.clientNotes)
  const responses = useDb((s) => s.formResponses)
  const reviews = useDb((s) => s.reviews)
  const segments = useDb((s) => s.segments)
  const evaluator = useSegmentEvaluator()
  const records = useClientRecordsFor(clientId)
  const [action, setAction] = useState<DrawerAction | null>(null)
  const [recordsOpen, setRecordsOpen] = useState(RECORD_TABS.includes(tab))

  const { update } = drawer
  const setTab = useCallback((next: DrawerTab) => update({ tab: next === 'overview' ? undefined : next }), [update])
  const here = `${location.pathname}${location.search}`
  const edit = useCallback(
    (section?: string, focus?: string) => {
      const q = new URLSearchParams()
      if (section && section !== 'profile') q.set('section', section)
      if (focus) q.set('focus', focus)
      q.set('return', here)
      navigate(`/clients/list/${clientId}/edit?${q.toString()}`)
    },
    [clientId, here, navigate],
  )
  const ctx: ClientDrawerCtx = useMemo(() => ({ client, tab, setTab, act: setAction, edit, close }), [client, tab, setTab, edit, close])

  const badges = useMemo(() => segments.filter((s) => s.badge && evaluator.has(s, client.id)), [segments, evaluator, client.id])
  const myNotes = notes.filter((n) => n.clientId === client.id)
  const counts: Partial<Record<DrawerTab, number>> = {
    appointments: records.appts,
    sales: records.sales,
    items: records.items,
    notes: myNotes.length,
    allergies: client.allergies.length,
    'patch-tests': client.patchTests.length,
    forms: responses.filter((r) => r.clientId === client.id).length,
    files: client.files.length,
    reviews: reviews.filter((r) => r.clientId === client.id).length,
  }

  const remove = async () => {
    const ok = await confirm({ title: t('clients.drawer.deleteTitle'), body: t('clients.drawer.deleteBody'), confirmLabel: t('clients.common.delete'), tone: 'danger' })
    if (!ok) return
    await deleteClient(client.id)
    toast(t('clients.drawer.deleteToast'))
    close()
  }
  const unblock = async () => {
    const ok = await confirm({ title: t('clients.unblock.title'), body: t('clients.unblock.body'), confirmLabel: t('clients.unblock.confirm'), tone: 'primary' })
    if (!ok) return
    await unblockClient(client.id)
    toast(t('clients.unblock.toast'))
  }

  const menuItem = (value: DrawerTab, sub = false) => (
    <button
      key={value}
      type="button"
      onClick={() => setTab(value)}
      aria-current={tab === value ? 'page' : undefined}
      className={clsx('flex h-11 w-full items-center justify-between rounded-md text-left text-body transition-colors', sub ? 'pl-6 pr-3' : 'px-3', tab === value ? 'bg-primary-subtle font-semibold text-primary' : 'text-ink hover:bg-sunken')}
    >
      {t(`clients.drawer.tabs.${value}`)}
      {counts[value] ? <span className="chip h-5 bg-sunken px-1.5 text-caption text-muted">{counts[value]}</span> : null}
    </button>
  )

  const editingNote = action?.kind === 'note' && action.noteId ? myNotes.find((n) => n.id === action.noteId) : undefined
  const editingAllergy = action?.kind === 'allergy' && action.allergyId ? client.allergies.find((a) => a.id === action.allergyId) : undefined
  const editingTest = action?.kind === 'patchTest' && action.testId ? client.patchTests.find((p) => p.id === action.testId) : undefined
  const viewingResponse = action?.kind === 'formResponse' ? responses.find((r) => r.id === action.id) : undefined
  const done = () => setAction(null)

  return (
    <ClientDrawerContext.Provider value={ctx}>
      <div className="flex h-full min-h-0">
        {/* Client card */}
        <aside className="flex w-[300px] shrink-0 flex-col overflow-y-auto border-r border-line">
          <div className="flex flex-col items-center px-6 pb-6 pt-10 text-center">
            <ClientAvatar client={client} size={96} />
            <h2 className="mt-4 text-[17px] font-semibold text-ink">{clientName(client)}</h2>
            {client.email ? (
              <a href={`mailto:${client.email}`} className="mt-0.5 max-w-full truncate text-body text-muted hover:text-primary hover:underline">
                {client.email}
              </a>
            ) : (
              <button type="button" onClick={() => edit('profile', 'email')} className="mt-0.5 text-body text-primary hover:underline">
                {t('clients.drawer.addEmail')}
              </button>
            )}
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {badges.map((s) => (
                <BadgeChip key={s.id} name={s.badge!.name} colorKey={badgeKey(s.badge)} />
              ))}
              {client.blocked && <span className="chip bg-danger-subtle font-semibold text-danger ring-1 ring-danger/40">{t('clients.drawer.blocked')}</span>}
              {client.tagIds.map((tagId) => (
                <TagChip key={tagId} tagId={tagId} />
              ))}
              <button type="button" onClick={() => setAction({ kind: 'tags' })} className="chip gap-1 border border-line-strong bg-surface text-ink hover:bg-sunken">
                <Plus size={12} aria-hidden /> {t('clients.drawer.addTag')}
              </button>
            </div>
            <div className="mt-5 flex gap-2">
              <Menu
                align="left"
                width={250}
                trigger={({ open, toggle }) => (
                  <MenuButton open={open} toggle={toggle}>
                    {t('clients.drawer.actionsMenu')}
                  </MenuButton>
                )}
                groups={[
                  { items: [{ label: t('clients.drawer.actions.messages'), icon: <MessagesSquare size={16} />, onSelect: () => setAction({ kind: 'messages' }) }] },
                  {
                    items: [
                      { label: t('clients.drawer.actions.sell'), icon: <ShoppingBag size={16} />, onSelect: () => drawer.open('checkout', { d_client: client.id }) },
                      { label: client.staffAlert ? t('clients.drawer.actions.editStaffAlert') : t('clients.drawer.actions.addStaffAlert'), icon: <Flag size={16} />, onSelect: () => setAction({ kind: 'staffAlert' }) },
                      { label: t('clients.drawer.actions.addNote'), icon: <NotebookPen size={16} />, onSelect: () => setAction({ kind: 'note' }) },
                      { label: t('clients.drawer.actions.addAllergy'), icon: <Sun size={16} />, onSelect: () => setAction({ kind: 'allergy' }) },
                      { label: t('clients.drawer.actions.addPatchTest'), icon: <TestTube size={16} />, onSelect: () => setAction({ kind: 'patchTest' }) },
                      { label: t('clients.drawer.actions.addTag'), icon: <Tag size={16} />, onSelect: () => setAction({ kind: 'tags' }) },
                      { label: t('clients.drawer.actions.addReward'), icon: <Sparkles size={16} />, onSelect: () => setAction({ kind: 'reward' }) },
                    ],
                  },
                  {
                    items: [
                      { label: t('clients.drawer.actions.edit'), onSelect: () => edit() },
                      { label: t('clients.drawer.actions.merge'), onSelect: () => navigate(`/clients/list/merge/${client.id}`) },
                      client.blocked ? { label: t('clients.drawer.actions.unblock'), onSelect: () => void unblock() } : { label: t('clients.drawer.actions.block'), onSelect: () => setAction({ kind: 'block' }) },
                      { label: t('clients.drawer.actions.delete'), danger: true, onSelect: () => void remove() },
                    ],
                  },
                ]}
              />
              <Button variant="primary" onClick={() => navigate(`/calendar?drawer=new-appointment&d_client=${client.id}`)}>
                {t('clients.drawer.bookNow')}
              </Button>
            </div>
          </div>

          {(client.allergies.length > 0 || client.staffAlert || client.patchTests.length > 0 || client.blocked) && (
            <ul className="flex flex-col gap-4 border-t border-line px-6 py-5">
              {client.blocked && (
                <li className="flex gap-3">
                  <Ban size={20} className="mt-0.5 shrink-0 text-danger" aria-hidden />
                  <span>
                    <span className="block text-body-strong text-ink">{t('clients.drawer.blockedAlert')}</span>
                    <span className="block text-body text-muted">{blockReasonLabel(client.blocked.reason)}</span>
                  </span>
                </li>
              )}
              {client.allergies.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => setTab('allergies')} className="flex gap-3 text-left">
                    <SeverityIcon severity={a.severity} size={22} />
                    <span>
                      <span className="block text-body-strong text-ink">{allergyName(a)}</span>
                      <span className="block text-body text-muted">{a.severity ? t(`clients.allergy.severityLabel.${a.severity}`) : t('clients.allergy.unknownSeverity')}</span>
                    </span>
                  </button>
                </li>
              ))}
              {client.staffAlert && (
                <li>
                  <button type="button" onClick={() => setAction({ kind: 'staffAlert' })} className="flex gap-3 text-left">
                    <TriangleAlert size={20} className="mt-0.5 shrink-0 text-ink" aria-hidden />
                    <span>
                      <span className="block text-body-strong text-ink">{t('clients.alert.label')}</span>
                      <span className="block text-body text-muted">{client.staffAlert}</span>
                    </span>
                  </button>
                </li>
              )}
              {client.patchTests.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => setTab('patch-tests')} className="flex gap-3 text-left">
                    <PatchIcon status={p.status} size={22} />
                    <span>
                      <span className="block text-body-strong text-ink">{p.title}</span>
                      <span className="block text-body text-muted">{t(`clients.patch.statuses.${p.status}`)}</span>
                      <span className="block text-body text-muted">{t('clients.patch.expires', { date: fmtDate(p.expiresAt) })}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <ul className="flex flex-col gap-3 border-t border-line px-6 py-5 text-body text-ink">
            <li className="flex items-center gap-3">
              <UserRound size={18} className="shrink-0 text-muted" aria-hidden />
              {client.pronouns ? (
                pronounLabel(client.pronouns)
              ) : (
                <button type="button" onClick={() => edit('profile', 'pronouns')} className="text-primary hover:underline">
                  {t('clients.drawer.addPronouns')}
                </button>
              )}
            </li>
            <li className="flex items-center gap-3">
              <Cake size={18} className="shrink-0 text-muted" aria-hidden />
              {client.birthday ? (
                fmtBirthday(client.birthday)
              ) : (
                <button type="button" onClick={() => edit('profile', 'birthday')} className="text-primary hover:underline">
                  {t('clients.drawer.addBirthday')}
                </button>
              )}
            </li>
            <li className="flex items-center gap-3">
              <UserPlus size={18} className="shrink-0 text-muted" aria-hidden />
              {t('clients.drawer.created', { date: fmtDate(client.createdAt) })}
            </li>
            {client.rewards.some((r) => !r.redeemedAt) && (
              <li className="flex items-center gap-3">
                <Gift size={18} className="shrink-0 text-muted" aria-hidden />
                <button type="button" onClick={() => setTab('wallet')} className="text-primary hover:underline">
                  {t('clients.drawer.rewardsCount', { count: client.rewards.filter((r) => !r.redeemedAt).length })}
                </button>
              </li>
            )}
          </ul>
        </aside>

        {/* Left menu */}
        <nav aria-label={t('clients.drawer.menu')} className="hidden w-[200px] shrink-0 overflow-y-auto border-r border-line px-3 py-8 lg:block">
          {menuItem('overview')}
          {menuItem('appointments')}
          {menuItem('sales')}
          {menuItem('details')}
          {menuItem('items')}
          <button
            type="button"
            onClick={() => setRecordsOpen((o) => !o)}
            aria-expanded={recordsOpen}
            className={clsx('flex h-11 w-full items-center justify-between rounded-md px-3 text-left text-body hover:bg-sunken', RECORD_TABS.includes(tab) ? 'text-primary' : 'text-ink')}
          >
            {t('clients.drawer.records')}
            {recordsOpen ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
          </button>
          {recordsOpen && RECORD_TABS.map((r) => menuItem(r, true))}
          {menuItem('wallet')}
          {menuItem('loyalty')}
          {menuItem('reviews')}
        </nav>

        {/* Content */}
        <main className="min-w-0 flex-1 overflow-y-auto bg-sunken/70 px-6 py-8">
          <div className="mb-4 lg:hidden">
            <Select aria-label={t('clients.drawer.menu')} value={tab} onChange={(e) => setTab(e.target.value as DrawerTab)} options={DRAWER_TABS.map((v) => ({ value: v, label: t(`clients.drawer.tabs.${v}`) }))} />
          </div>
          {tab === 'overview' && <OverviewTab />}
          {tab === 'appointments' && <AppointmentsTab />}
          {tab === 'sales' && <SalesTab />}
          {tab === 'details' && <DetailsTab />}
          {tab === 'items' && <ItemsTab />}
          {tab === 'notes' && <NotesTab />}
          {tab === 'allergies' && <AllergiesTab />}
          {tab === 'patch-tests' && <PatchTestsTab />}
          {tab === 'forms' && <FormsTab />}
          {tab === 'files' && <FilesTab />}
          {tab === 'wallet' && <WalletTab />}
          {tab === 'loyalty' && <LoyaltyTab />}
          {tab === 'reviews' && <ReviewsTab />}
        </main>
      </div>

      {action?.kind === 'staffAlert' && <StaffAlertModal client={client} onClose={done} />}
      <NoteEditorModal
        open={action?.kind === 'note'}
        onClose={done}
        client={client}
        title={editingNote ? t('clients.note.editTitle') : undefined}
        initialHtml={editingNote?.html}
        onSave={async (html) => {
          if (editingNote) {
            await updateClientNote(editingNote.id, html)
            toast(t('clients.note.updated'))
          } else {
            await addClientNote(client.id, html)
            toast(t('clients.note.toast'))
            setTab('notes')
            setRecordsOpen(true)
          }
        }}
      />
      {action?.kind === 'allergy' && <AllergyModal client={client} allergy={editingAllergy} onClose={done} />}
      {action?.kind === 'patchTest' && <PatchTestModal client={client} test={editingTest} onClose={done} />}
      <ManageTagsModal open={action?.kind === 'tags'} onClose={done} clientId={client.id} initial={client.tagIds} />
      {action?.kind === 'reward' && <RewardFlow client={client} onClose={done} />}
      <BlockClientModal open={action?.kind === 'block'} onClose={done} clientIds={[client.id]} />
      {action?.kind === 'messages' && <MessagesIntroModal client={client} onClose={done} />}
      {action?.kind === 'sendForm' && <SendFormModal client={client} onClose={done} />}
      {viewingResponse && <FormResponseModal response={viewingResponse} onClose={done} />}
      {action?.kind === 'rewardActivity' && <RewardActivityModal onClose={done} />}
    </ClientDrawerContext.Provider>
  )
}

/** Menu counts without needing the context (the provider is rendered below). */
function useClientRecordsFor(clientId: string) {
  const appointments = useDb((s) => s.appointments)
  const sales = useDb((s) => s.sales)
  return useMemo(() => {
    const appts = appointments.filter((a) => a.clientId === clientId).length
    const mine = sales.filter((s) => s.clientId === clientId)
    const items = mine.filter((s) => s.kind === 'sale' && s.status !== 'voided' && s.status !== 'draft').reduce((n, s) => n + s.items.filter((i) => i.type === 'service' || i.type === 'product').length, 0)
    return { appts, sales: mine.length, items }
  }, [appointments, sales, clientId])
}
