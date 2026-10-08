import { Folder, FolderPlus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { REPORTS } from '@/app/reportCatalog'
import { ApiError } from '@/api/client'
import { Button, Field, Modal, Select, TextArea, TextInput, toast } from '@/components/ui'
import { useCurrentUser } from '@/store/session'
import {
  addToFolder,
  createCustomReport,
  createFolder,
  customSlug,
  renameFolder,
  updateCustomReport,
  useFolders,
  type CustomReport,
  type ReportConfig,
  type ReportFolder,
  type ReportView,
} from '../data'

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : String(e))

/** Add folder / Rename folder (reports.md §1.1 "+ Add folder", Insights only). */
export function FolderModal({ open, folder, onClose, onSaved }: { open: boolean; folder?: ReportFolder; onClose: () => void; onSaved?: (folder: ReportFolder) => void }) {
  return open ? <FolderModalBody folder={folder} onClose={onClose} onSaved={onSaved} /> : null
}

function FolderModalBody({ folder, onClose, onSaved }: { folder?: ReportFolder; onClose: () => void; onSaved?: (folder: ReportFolder) => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState(folder?.name ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!name.trim()) return setError(t('reports.folder.nameRequired'))
    setBusy(true)
    try {
      if (folder) {
        await renameFolder(folder.id, name)
        toast(t('reports.folder.renamed'))
        onSaved?.({ ...folder, name: name.trim() })
      } else {
        const created = await createFolder(name)
        toast(t('reports.folder.created'))
        onSaved?.(created)
      }
      onClose()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={folder ? t('reports.folder.renameTitle') : t('reports.folder.addTitle')}
      subtitle={folder ? undefined : t('reports.folder.addBody')}
      footer={
        <>
          <Button onClick={onClose}>{t('reports.common.cancel')}</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {t('reports.common.save')}
          </Button>
        </>
      }
    >
      <form noValidate onSubmit={(e) => { e.preventDefault(); void save() }}>
        <Field label={t('reports.folder.name')} error={error}>
          {(id) => <TextInput id={id} value={name} maxLength={60} invalid={Boolean(error)} placeholder={t('reports.folder.namePlaceholder')} onChange={(e) => { setName(e.target.value); setError('') }} />}
        </Field>
      </form>
    </Modal>
  )
}

interface ReportModalProps {
  open: boolean
  onClose: () => void
  /** Edit the details of an existing custom report. */
  report?: CustomReport
  /** Create: prefilled base report, name and the view/config to copy (Duplicate). */
  base?: string
  name?: string
  config?: ReportConfig
  view?: ReportView
  folderId?: string
}

/** Create a custom report (Add, Duplicate) or edit its name and description. */
export function CustomReportModal(props: ReportModalProps) {
  return props.open ? <CustomReportModalBody {...props} /> : null
}

function CustomReportModalBody({ onClose, report, base, name: initialName, config, view, folderId: initialFolder }: ReportModalProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useCurrentUser()
  const folders = useFolders()
  const [name, setName] = useState(report?.name ?? initialName ?? '')
  const [description, setDescription] = useState(report?.description ?? '')
  const [baseSlug, setBaseSlug] = useState(report?.base ?? base ?? 'sales-summary')
  const [folderId, setFolderId] = useState(initialFolder ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const options = REPORTS.filter((r) => r.group !== 'dashboards').map((r) => ({ value: r.slug, label: r.name }))

  const save = async () => {
    if (!name.trim()) return setError(t('reports.custom.nameRequired'))
    setBusy(true)
    try {
      if (report) {
        await updateCustomReport(report.id, { name, description })
        toast(t('reports.custom.updated'))
        onClose()
      } else {
        const created = await createCustomReport({ name, description, base: baseSlug, config, view, folderId: folderId || undefined }, { id: user?.id ?? null, name: user ? `${user.firstName} ${user.lastName}` : '' })
        toast(t('reports.custom.created'))
        onClose()
        navigate(`/reports/table/${customSlug(created.id)}`)
      }
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={report ? t('reports.custom.editTitle') : t('reports.custom.createTitle')}
      subtitle={report ? undefined : t('reports.custom.createBody')}
      footer={
        <>
          <Button onClick={onClose}>{t('reports.common.cancel')}</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {report ? t('reports.common.save') : t('reports.custom.create')}
          </Button>
        </>
      }
    >
      <form noValidate className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <Field label={t('reports.custom.name')} error={error}>
          {(id) => <TextInput id={id} value={name} maxLength={80} invalid={Boolean(error)} placeholder={t('reports.custom.namePlaceholder')} onChange={(e) => { setName(e.target.value); setError('') }} />}
        </Field>
        <Field label={t('reports.custom.description')} optional>
          {(id) => <TextArea id={id} value={description} maxLength={200} rows={3} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        {!report && (
          <Field label={t('reports.custom.basedOn')} hint={view || config ? t('reports.custom.copyHint') : undefined}>
            {(id) => <Select id={id} value={baseSlug} disabled={Boolean(view || config)} onChange={(e) => setBaseSlug(e.target.value)} options={options} />}
          </Field>
        )}
        {!report && folders.length > 0 && (
          <Field label={t('reports.custom.folder')} optional>
            {(id) => <Select id={id} value={folderId} placeholder={t('reports.custom.noFolder')} onChange={(e) => setFolderId(e.target.value)} options={folders.map((f) => ({ value: f.id, label: f.name }))} />}
          </Field>
        )}
      </form>
    </Modal>
  )
}

/** Add a report to one of the folders, or to a new one. */
export function AddToFolderModal({ slug, name, onClose }: { slug: string | null; name: string; onClose: () => void }) {
  return slug ? <AddToFolderBody slug={slug} name={name} onClose={onClose} /> : null
}

function AddToFolderBody({ slug, name, onClose }: { slug: string; name: string; onClose: () => void }) {
  const { t } = useTranslation()
  const folders = useFolders()
  const [choice, setChoice] = useState(folders.find((f) => !f.items.includes(slug))?.id ?? '')
  const [newOpen, setNewOpen] = useState(folders.length === 0)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    const folder = folders.find((f) => f.id === choice)
    if (!folder) return
    setBusy(true)
    await addToFolder(folder.id, slug)
    setBusy(false)
    toast(t('reports.folder.added', { folder: folder.name }))
    onClose()
  }
  if (newOpen)
    return (
      <FolderModal
        open
        onClose={folders.length ? () => setNewOpen(false) : onClose}
        onSaved={(f) => {
          void addToFolder(f.id, slug).then(() => toast(t('reports.folder.added', { folder: f.name })))
          onClose()
        }}
      />
    )
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('reports.folder.addToTitle')}
      subtitle={name}
      footer={
        <>
          <Button onClick={onClose}>{t('reports.common.cancel')}</Button>
          <Button variant="primary" loading={busy} disabled={!choice} onClick={() => void save()}>
            {t('reports.folder.addTo')}
          </Button>
        </>
      }
    >
      <div role="radiogroup" aria-label={t('reports.folder.addToTitle')} className="flex flex-col gap-1">
        {folders.map((f) => {
          const inside = f.items.includes(slug)
          return (
            <label key={f.id} className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 hover:bg-sunken ${inside ? 'cursor-not-allowed opacity-60' : ''}`}>
              <input type="radio" name="folder" className="h-5 w-5 accent-[rgb(var(--primary))]" checked={choice === f.id} disabled={inside} onChange={() => setChoice(f.id)} />
              <Folder size={18} className="text-muted" aria-hidden />
              <span className="flex-1 text-body text-ink">{f.name}</span>
              {inside && <span className="text-small text-muted">{t('reports.folder.alreadyIn')}</span>}
            </label>
          )
        })}
      </div>
      <Button variant="link" className="mt-3" icon={<FolderPlus size={16} />} onClick={() => setNewOpen(true)}>
        {t('reports.folder.new')}
      </Button>
    </Modal>
  )
}
