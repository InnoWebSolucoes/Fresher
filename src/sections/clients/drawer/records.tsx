import clsx from 'clsx'
import { parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import { ArrowDownUp, CalendarDays, ChevronDown, ClipboardList, FileText, FlaskConical, LayoutGrid, List, Loader2, NotebookPen, Plus, Sun, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ClientNote } from '@/types'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { fmtDateTimeUS } from '@/lib/format'
import { Button, confirm, Menu, PillTabs, SearchInput, toast } from '@/components/ui'
import { addClientFiles, deleteClientNote, removeAllergy, removeClientFile, removePatchTest } from '@/api/clients'
import { useClientDrawer } from './context'
import { PanelEmpty, TabHeader } from './tabs'
import { allergyName, PatchIcon, SeverityIcon } from './dialogs'
import { NoteHtml } from '../components/NoteEditorModal'
import { fileSize, fmtLongDate, htmlToText } from '../lib/helpers'
import { reactionLabel } from '../lib/constants'

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

// ─── Notes ─────────────────────────────────────────────────────────────────

type NoteFilter = 'all' | 'client' | 'appointment'

export function NotesTab() {
  const { t } = useTranslation()
  const { client, act } = useClientDrawer()
  const drawer = useDrawer()
  const notes = useDb((s) => s.clientNotes)
  const appointments = useDb((s) => s.appointments)
  const [filter, setFilter] = useState<NoteFilter>('all')
  const [newestFirst, setNewestFirst] = useState(true)
  const mine = useMemo(() => notes.filter((n) => n.clientId === client.id), [notes, client.id])
  const list = useMemo(() => mine.filter((n) => filter === 'all' || n.kind === filter).sort((a, b) => (newestFirst ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt))), [mine, filter, newestFirst])
  const groups = useMemo(() => {
    const map = new Map<string, ClientNote[]>()
    for (const n of list) {
      const key = format(parseISO(n.createdAt), 'MMMM yyyy')
      map.set(key, [...(map.get(key) ?? []), n])
    }
    return [...map.entries()]
  }, [list])

  const remove = async (note: ClientNote) => {
    const ok = await confirm({ title: t('clients.notes.deleteTitle'), body: t('clients.notes.deleteBody'), confirmLabel: t('clients.common.delete'), tone: 'danger' })
    if (!ok) return
    await deleteClientNote(note.id)
    toast(t('clients.notes.deleted'))
  }
  const copy = async (note: ClientNote) => {
    try {
      await navigator.clipboard.writeText(htmlToText(note.html))
    } catch {
      /* clipboard may be blocked; still confirm */
    }
    toast(t('clients.notes.copied'))
  }

  return (
    <>
      <TabHeader
        title={t('clients.drawer.tabs.notes')}
        action={
          <div className="flex gap-2">
            <Button size="sm" className="rounded-full" icon={<Plus size={14} aria-hidden />} onClick={() => act({ kind: 'note' })}>
              {t('clients.common.add')}
            </Button>
            <button type="button" onClick={() => setNewestFirst((v) => !v)} title={t('clients.notes.sort')} aria-label={t('clients.notes.sort')} className="icon-btn h-8 w-8 rounded-full border border-line-strong">
              <ArrowDownUp size={15} aria-hidden />
            </button>
          </div>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <PillTabs<NoteFilter>
          value={filter === 'appointment' ? ('none' as NoteFilter) : filter}
          onChange={setFilter}
          items={[
            { value: 'all', label: t('clients.notes.all'), count: mine.length },
            { value: 'client', label: t('clients.notes.client'), count: mine.filter((n) => n.kind === 'client').length || undefined },
          ]}
        />
        <Menu
          width={220}
          trigger={({ toggle, open }) => (
            <button type="button" onClick={toggle} aria-expanded={open} className={clsx('inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-body-strong', filter === 'appointment' ? 'bg-ink text-canvas' : 'bg-surface text-ink ring-1 ring-line hover:bg-sunken')}>
              {filter === 'appointment' ? t('clients.notes.appointment') : t('clients.common.more')}
              <ChevronDown size={14} aria-hidden />
            </button>
          )}
          groups={[{ items: [{ label: t('clients.notes.appointment'), hint: String(mine.filter((n) => n.kind === 'appointment').length), checked: filter === 'appointment', onSelect: () => setFilter('appointment') }] }]}
        />
      </div>
      {groups.length === 0 ? (
        <PanelEmpty
          icon={<NotebookPen size={24} aria-hidden />}
          title={t('clients.notes.emptyTitle')}
          body={t('clients.notes.emptyBody')}
          action={
            <Button variant="primary" onClick={() => act({ kind: 'note' })}>
              {t('clients.notes.add')}
            </Button>
          }
        />
      ) : (
        groups.map(([month, items]) => (
          <div key={month} className="mb-5">
            <p className="mb-3 text-body-strong text-muted">{month}</p>
            <div className="flex flex-col gap-3 border-l-2 border-line pl-4">
              {items.map((note) => {
                const appt = note.appointmentId ? appointments.find((a) => a.id === note.appointmentId) : undefined
                return (
                  <article key={note.id} className="rounded-lg border border-line bg-surface p-4">
                    <div className="flex items-start justify-between gap-3">
                      {appt ? (
                        <button type="button" onClick={() => drawer.open('appointment', { id: appt.id })} className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-3 py-1 text-small text-ink hover:bg-sunken">
                          <CalendarDays size={14} aria-hidden />
                          {format(parseISO(appt.date), 'MMM d, yyyy')}, {appt.items[0]?.start}
                        </button>
                      ) : (
                        <span className="chip bg-primary-subtle text-primary">{t('clients.notes.clientNote')}</span>
                      )}
                      <Menu
                        width={180}
                        groups={[
                          {
                            items: [
                              { label: t('clients.notes.view'), onSelect: () => act({ kind: 'note', noteId: note.id }) },
                              { label: t('clients.common.edit'), onSelect: () => act({ kind: 'note', noteId: note.id }) },
                              { label: t('clients.notes.copy'), onSelect: () => void copy(note) },
                              { label: t('clients.common.delete'), danger: true, onSelect: () => void remove(note) },
                            ],
                          },
                        ]}
                      />
                    </div>
                    <NoteHtml html={note.html} className="mt-3" />
                    <div className="mt-4 flex items-center gap-3 border-t border-line pt-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-subtle text-caption font-semibold text-primary">{initialsOf(note.by)}</span>
                      <div>
                        <p className="text-small text-ink">{note.by}</p>
                        <p className="text-caption text-muted">{t('clients.notes.added', { date: fmtDateTimeUS(note.createdAt) })}</p>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        ))
      )}
    </>
  )
}

// ─── Allergies ─────────────────────────────────────────────────────────────

export function AllergiesTab() {
  const { t } = useTranslation()
  const { client, act } = useClientDrawer()
  const remove = async (id: string) => {
    const ok = await confirm({ title: t('clients.allergy.deleteTitle'), body: t('clients.allergy.deleteBody'), confirmLabel: t('clients.common.delete'), tone: 'danger' })
    if (!ok) return
    await removeAllergy(client.id, id)
    toast(t('clients.allergy.deleted'))
  }
  return (
    <>
      <TabHeader
        title={t('clients.drawer.tabs.allergies')}
        action={
          <Button size="sm" className="rounded-full" icon={<Plus size={14} aria-hidden />} onClick={() => act({ kind: 'allergy' })}>
            {t('clients.common.add')}
          </Button>
        }
      />
      {client.allergies.length === 0 ? (
        <PanelEmpty icon={<Sun size={24} aria-hidden />} title={t('clients.allergy.emptyTitle')} body={t('clients.allergy.emptyBody')} action={<Button variant="primary" onClick={() => act({ kind: 'allergy' })}>{t('clients.drawer.actions.addAllergy')}</Button>} />
      ) : (
        <div className="flex flex-col gap-3">
          {client.allergies.map((a) => (
            <div key={a.id} className="flex items-start gap-4 rounded-lg border border-line bg-surface p-4">
              <SeverityIcon severity={a.severity} size={44} />
              <div className="min-w-0 flex-1">
                <p className="text-body-lg font-semibold text-ink">{allergyName(a)}</p>
                <p className="text-body text-muted">
                  {[t(`clients.allergy.kinds.${a.kind}`), a.severity ? t(`clients.allergy.severityLabel.${a.severity}`) : null, reactionLabel(a.reaction)].filter(Boolean).join(' • ')}
                </p>
                {a.note && <p className="mt-2 text-body text-ink">{a.note}</p>}
                <p className="mt-2 text-caption text-muted">{t('clients.notes.added', { date: fmtDateTimeUS(a.createdAt) })}</p>
              </div>
              <Menu
                width={160}
                groups={[
                  {
                    items: [
                      { label: t('clients.common.edit'), onSelect: () => act({ kind: 'allergy', allergyId: a.id }) },
                      { label: t('clients.common.delete'), danger: true, onSelect: () => void remove(a.id) },
                    ],
                  },
                ]}
              />
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ─── Patch tests ───────────────────────────────────────────────────────────

export function PatchTestsTab() {
  const { t } = useTranslation()
  const { client, act } = useClientDrawer()
  const members = useDb((s) => s.teamMembers)
  const remove = async (id: string) => {
    const ok = await confirm({ title: t('clients.patch.deleteTitle'), body: t('clients.patch.deleteBody'), confirmLabel: t('clients.common.delete'), tone: 'danger' })
    if (!ok) return
    await removePatchTest(client.id, id)
    toast(t('clients.patch.deleted'))
  }
  return (
    <>
      <TabHeader
        title={t('clients.drawer.tabs.patch-tests')}
        action={
          <Button size="sm" className="rounded-full" icon={<Plus size={14} aria-hidden />} onClick={() => act({ kind: 'patchTest' })}>
            {t('clients.common.add')}
          </Button>
        }
      />
      {client.patchTests.length === 0 ? (
        <PanelEmpty icon={<FlaskConical size={24} aria-hidden />} title={t('clients.patch.emptyTitle')} body={t('clients.patch.emptyBody')} action={<Button variant="primary" onClick={() => act({ kind: 'patchTest' })}>{t('clients.drawer.actions.addPatchTest')}</Button>} />
      ) : (
        <div className="flex flex-col gap-3">
          {client.patchTests.map((p) => {
            const m = members.find((x) => x.id === p.testedBy)
            return (
              <div key={p.id} className="flex items-start gap-4 rounded-lg border border-line bg-surface p-4">
                <PatchIcon status={p.status} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="text-body-lg font-semibold text-ink">{p.title}</p>
                  <p className="text-body text-muted">
                    {t(`clients.patch.statuses.${p.status}`)} · {t('clients.patch.expires', { date: fmtLongDate(p.expiresAt) })}
                  </p>
                  <p className="text-small text-muted">
                    {t('clients.patch.testedOn', { date: fmtLongDate(p.testedAt) })}
                    {m ? ` · ${t('clients.patch.by', { name: `${m.firstName} ${m.lastName}` })}` : ''}
                  </p>
                  {p.description && <p className="mt-2 text-body text-ink">{p.description}</p>}
                </div>
                <Menu
                  width={160}
                  groups={[
                    {
                      items: [
                        { label: t('clients.common.edit'), onSelect: () => act({ kind: 'patchTest', testId: p.id }) },
                        { label: t('clients.common.delete'), danger: true, onSelect: () => void remove(p.id) },
                      ],
                    },
                  ]}
                />
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

// ─── Client forms ──────────────────────────────────────────────────────────

export function FormsTab() {
  const { t } = useTranslation()
  const { client, act } = useClientDrawer()
  const responses = useDb((s) => s.formResponses)
  const templates = useDb((s) => s.formTemplates)
  const mine = responses.filter((r) => r.clientId === client.id).sort((a, b) => b.sentAt.localeCompare(a.sentAt))
  const tone = { completed: 'bg-success-subtle text-success', sent: 'bg-info-subtle text-info', not_completed: 'bg-warning-subtle text-warning' } as const
  return (
    <>
      <TabHeader
        title={t('clients.drawer.tabs.forms')}
        action={
          <Button size="sm" className="rounded-full" icon={<Plus size={14} aria-hidden />} onClick={() => act({ kind: 'sendForm' })}>
            {t('clients.forms.send')}
          </Button>
        }
      />
      {mine.length === 0 ? (
        <PanelEmpty icon={<ClipboardList size={24} aria-hidden />} title={t('clients.forms.emptyTitle')} body={t('clients.forms.emptyBody')} action={<Button variant="primary" onClick={() => act({ kind: 'sendForm' })}>{t('clients.forms.send')}</Button>} />
      ) : (
        <div className="flex flex-col gap-3">
          {mine.map((r) => (
            <button key={r.id} type="button" onClick={() => act({ kind: 'formResponse', id: r.id })} className="flex items-center gap-4 rounded-lg border border-line bg-surface p-4 text-left hover:bg-sunken/40">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary">
                <FileText size={18} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body-lg font-semibold text-ink">{templates.find((f) => f.id === r.templateId)?.name ?? t('clients.forms.form')}</span>
                <span className="block text-small text-muted">{t('clients.forms.sentOn', { date: format(parseISO(r.sentAt), 'MMM d, yyyy') })}</span>
              </span>
              <span className={clsx('chip', tone[r.status])}>{t(`clients.forms.status.${r.status}`)}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

// ─── Files ─────────────────────────────────────────────────────────────────

export function FilesTab() {
  const { t } = useTranslation()
  const { client } = useClientDrawer()
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [uploading, setUploading] = useState<string[]>([])
  const input = useRef<HTMLInputElement>(null)
  const files = client.files.filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => b.at.localeCompare(a.at))

  const upload = async (list: File[]) => {
    if (!list.length) return
    const tooBig = list.filter((f) => f.size > 20 * 1024 * 1024)
    if (tooBig.length) toast(t('clients.files.tooBig'), 'error')
    const ok = list.filter((f) => f.size <= 20 * 1024 * 1024)
    if (!ok.length) return
    setUploading(ok.map((f) => f.name))
    try {
      await addClientFiles(client.id, ok.map((f) => ({ name: f.name, size: f.size })))
      toast(ok.length === 1 ? t('clients.files.uploaded') : t('clients.files.uploadedMany', { count: ok.length }))
    } finally {
      setUploading([])
    }
  }
  const remove = async (id: string) => {
    const ok = await confirm({ title: t('clients.files.deleteTitle'), body: t('clients.files.deleteBody'), confirmLabel: t('clients.common.delete'), tone: 'danger' })
    if (!ok) return
    await removeClientFile(client.id, id)
    toast(t('clients.files.deleted'))
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        void upload([...e.dataTransfer.files])
      }}
    >
      <TabHeader
        title={t('clients.drawer.tabs.files')}
        action={
          <Button size="sm" className="rounded-full" icon={<Upload size={14} aria-hidden />} onClick={() => input.current?.click()}>
            {t('clients.common.add')}
          </Button>
        }
      />
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const list = [...(e.target.files ?? [])]
          e.target.value = ''
          void upload(list)
        }}
      />
      <div className="mb-5 flex items-center gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder={t('clients.common.search')} className="min-w-0" />
        <div className="inline-flex rounded-md bg-sunken p-1">
          <button type="button" aria-label={t('clients.files.list')} aria-pressed={view === 'list'} onClick={() => setView('list')} className={clsx('rounded-sm p-2 md:p-1.5', view === 'list' ? 'bg-surface shadow-xs' : 'text-muted')}>
            <List size={18} aria-hidden />
          </button>
          <button type="button" aria-label={t('clients.files.grid')} aria-pressed={view === 'grid'} onClick={() => setView('grid')} className={clsx('rounded-sm p-2 md:p-1.5', view === 'grid' ? 'bg-surface shadow-xs' : 'text-muted')}>
            <LayoutGrid size={18} aria-hidden />
          </button>
        </div>
      </div>
      {uploading.length > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-line bg-surface p-4 text-body text-ink">
          <Loader2 size={18} className="animate-spin text-primary" aria-hidden />
          {t('clients.files.uploading', { names: uploading.join(', ') })}
        </div>
      )}
      {files.length === 0 && uploading.length === 0 ? (
        <PanelEmpty
          icon={<FileText size={24} aria-hidden />}
          title={t('clients.files.emptyTitle')}
          body={query ? t('clients.common.noResults') : t('clients.files.emptyBody')}
          action={
            <Button variant="primary" onClick={() => input.current?.click()}>
              {t('clients.files.upload')}
            </Button>
          }
        />
      ) : (
        <div className={clsx(view === 'grid' ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-2')}>
          {files.map((f) => (
            <div key={f.id} className={clsx('flex items-center gap-3 rounded-lg border border-line bg-surface p-3', view === 'grid' && 'flex-col items-start')}>
              <span className={clsx('flex shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary', view === 'grid' ? 'h-20 w-full' : 'h-10 w-10')}>
                <FileText size={view === 'grid' ? 28 : 18} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-strong text-ink">{f.name}</span>
                <span className="block text-caption text-muted">
                  {fileSize(f.size)} · {format(parseISO(f.at), 'MMM d, yyyy')}
                </span>
              </span>
              <Menu width={160} groups={[{ items: [{ label: t('clients.common.delete'), danger: true, onSelect: () => void remove(f.id) }] }]} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
