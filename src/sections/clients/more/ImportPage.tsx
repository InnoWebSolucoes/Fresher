import clsx from 'clsx'
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, FileUp, Loader2, X, XCircle } from 'lucide-react'
import { useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useDb } from '@/store/db'
import { downloadBlob } from '@/lib/export'
import { Button, EmptyState, IconButton, LearnMore, Select, UnderlineTabs, toast } from '@/components/ui'
import { buildPreview, IMPORT_FIELDS, importTemplate, templateFileName, type ImportField, type Mapping, type PreviewRow } from '../lib/csv'
import { fileSize } from '../lib/helpers'
import { useImportWizard } from './importStore'

const STEPS = ['upload', 'mapping', 'preview', 'progress'] as const
type Step = (typeof STEPS)[number]
const base = '/clients/client-import'

export function ClientImportPage() {
  const { step: raw } = useParams()
  const step = (STEPS as readonly string[]).includes(raw ?? '') ? (raw as Step) : null
  const file = useImportWizard((s) => s.file)
  const status = useImportWizard((s) => s.status)
  if (!step) return <Navigate to={`${base}/upload`} replace />
  if ((step === 'mapping' || step === 'preview') && !file) return <Navigate to={`${base}/upload`} replace />
  if (step === 'progress' && status === 'idle') return <Navigate to={`${base}/${file ? 'preview' : 'upload'}`} replace />
  if (step === 'upload') return <UploadStep />
  if (step === 'mapping') return <MappingStep />
  if (step === 'preview') return <PreviewStep />
  return <ProgressStep />
}

/* ─── Frame ──────────────────────────────────────────────────────────────── */

function Frame({ step, onBack, primary, children, wide }: { step: number; onBack?: () => void; primary?: ReactNode; children: ReactNode; wide?: 'md' | 'lg' | 'xl' }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const reset = useImportWizard((s) => s.reset)
  const status = useImportWizard((s) => s.status)
  const close = () => {
    navigate('/clients/list')
    // Reset after leaving, so the step guards don't redirect back to the upload step first.
    if (status !== 'running') setTimeout(reset, 0)
  }
  return (
    <div className="flex h-full flex-col bg-canvas">
      <div className="mx-auto grid w-full max-w-[1400px] grid-cols-4 gap-2 px-4 pt-3 md:px-6" role="progressbar" aria-label={t('clients.more.import.stepOf', { step })} aria-valuenow={step} aria-valuemin={1} aria-valuemax={4}>
        {STEPS.map((s, i) => (
          <span key={s} className={clsx('h-1 rounded-full transition-colors duration-base', i < step ? 'bg-primary' : 'bg-sunken')} />
        ))}
      </div>
      <header className="mx-auto flex w-full max-w-[1400px] shrink-0 items-center justify-between gap-3 px-4 py-3 md:gap-4 md:px-6 md:py-4">
        <div>
          {onBack && (
            <IconButton label={t('clients.more.common.back')} onClick={onBack} className="h-11 w-11 border border-line-strong md:h-12 md:w-12">
              <ArrowLeft size={20} aria-hidden />
            </IconButton>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status !== 'running' && step < 4 && (
            <Button size="lg" onClick={close}>
              {t('clients.more.common.close')}
            </Button>
          )}
          {primary}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={clsx('mx-auto w-full px-4 pb-16 md:px-6', wide === 'xl' ? 'max-w-[1500px]' : wide === 'lg' ? 'max-w-[1220px]' : 'max-w-[900px]')}>{children}</div>
      </div>
    </div>
  )
}

function Heading({ title, subtitle }: { title: string; subtitle: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="mb-6 md:mb-8">
      <p className="text-body text-muted">{t('clients.more.import.eyebrow')}</p>
      <h1 className="mt-1 font-display text-title-1 text-ink md:mt-2 md:text-display">{title}</h1>
      <p className="mt-2 text-body text-muted md:mt-3 md:text-body-lg">{subtitle}</p>
    </div>
  )
}

function Consent() {
  const { t } = useTranslation()
  return <div className="mb-6 rounded-lg border border-primary/20 bg-primary-subtle px-4 py-4 text-body text-ink md:px-6 md:py-5">{t('clients.more.import.consent')}</div>
}

function FileCard({ onRemove }: { onRemove?: () => void }) {
  const { t } = useTranslation()
  const file = useImportWizard((s) => s.file)
  if (!file) return null
  return (
    <div className="relative mb-8 flex items-center gap-4 rounded-lg border border-line bg-surface px-4 py-3">
      <span className="flex h-12 w-11 shrink-0 items-center justify-center rounded-sm bg-success text-caption font-bold text-white">CSV</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-strong text-ink">{file.name}</p>
        <p className="text-small text-muted">
          {t('clients.more.import.upload.fileMeta', { size: fileSize(file.size) })} · {t('clients.more.import.upload.rows', { count: file.rows.length })}
        </p>
      </div>
      {onRemove && (
        <IconButton label={t('clients.more.import.upload.removeFile')} onClick={onRemove} className="absolute -right-3 -top-3 h-8 w-8 border border-line-strong bg-surface">
          <X size={16} aria-hidden />
        </IconButton>
      )}
    </div>
  )
}

function ReadyBanner() {
  const { t } = useTranslation()
  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-success/30 bg-success-subtle px-5 py-4 text-body text-ink">
      <CheckCircle2 size={20} className="shrink-0 text-success" aria-hidden />
      {t('clients.more.import.upload.ready')}
    </div>
  )
}

/* ─── Step 1: upload ─────────────────────────────────────────────────────── */

function UploadStep() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const file = useImportWizard((s) => s.file)
  const setFile = useImportWizard((s) => s.setFile)
  const clearFile = useImportWizard((s) => s.clearFile)
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const accept = async (f: File | undefined) => {
    if (!f) return
    if (!/\.csv$/i.test(f.name) && f.type !== 'text/csv') {
      setError(t('clients.more.import.upload.errorType'))
      return
    }
    try {
      const text = await f.text()
      const result = setFile(f.name, f.size, text)
      setError(result === 'ok' ? null : t('clients.more.import.upload.errorEmpty'))
    } catch {
      setError(t('clients.more.import.upload.errorRead'))
    }
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void accept(e.dataTransfer.files[0])
  }
  const next = () => {
    if (!file) {
      setError(t('clients.more.import.upload.errorRequired'))
      return
    }
    navigate(`${base}/mapping`)
  }
  const download = () => {
    downloadBlob(new Blob([importTemplate()], { type: 'text/csv' }), templateFileName())
    toast(t('clients.more.import.upload.downloaded'))
  }

  return (
    <Frame
      step={1}
      primary={
        <Button variant="primary" size="lg" onClick={next}>
          {t('clients.more.import.nextStep')}
        </Button>
      }
    >
      <Heading
        title={t('clients.more.import.upload.title')}
        subtitle={
          <>
            {t('clients.more.import.upload.subtitle')} <LearnMore topic={t('clients.list.importClients')}>{t('clients.more.common.learnMore')}</LearnMore>
          </>
        }
      />
      <Consent />
      {file && <ReadyBanner />}
      {file && <FileCard onRemove={clearFile} />}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={clsx('rounded-lg border-2 border-dashed p-2 transition-colors', dragging ? 'border-primary' : error ? 'border-danger' : 'border-line-strong')}
      >
        <div className={clsx('flex flex-col items-center justify-center gap-4 rounded-md px-4 text-center md:px-6', file ? 'py-10' : 'py-12 md:py-24', dragging ? 'bg-primary-subtle' : 'bg-sunken')}>
          <FileUp size={32} className="text-ink" aria-hidden />
          <div>
            <p className="font-display text-title-3 text-ink">{t('clients.more.import.upload.dropTitle')}</p>
            <p className="mt-1 text-small text-muted">{t('clients.more.import.upload.dropHint')}</p>
          </div>
          <Button onClick={() => input.current?.click()}>{file ? t('clients.more.import.upload.replace') : t('clients.more.import.upload.choose')}</Button>
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              void accept(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 flex items-center gap-1.5 text-small text-danger">
          <XCircle size={16} aria-hidden />
          {error}
        </p>
      )}
      <p className="mt-3 text-body text-muted">
        {t('clients.more.import.upload.noFile')}{' '}
        <button type="button" onClick={download} className="text-primary underline-offset-2 hover:underline">
          {t('clients.more.import.upload.download')}
        </button>
      </p>
    </Frame>
  )
}

/* ─── Step 2: mapping ────────────────────────────────────────────────────── */

function MappingStep() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const file = useImportWizard((s) => s.file)!
  const mapping = useImportWizard((s) => s.mapping)!
  const setMapping = useImportWizard((s) => s.setMapping)
  const clearFile = useImportWizard((s) => s.clearFile)
  const [error, setError] = useState(false)

  const set = (field: ImportField, value: string) => {
    const next: Mapping = { ...mapping, [field]: value === '' ? null : Number(value) }
    // A file column feeds one field only.
    if (value !== '') for (const f of IMPORT_FIELDS) if (f !== field && next[f] === Number(value)) next[f] = null
    setMapping(next)
    if (field === 'firstName') setError(value === '')
  }
  const next = () => {
    if (mapping.firstName === null) {
      setError(true)
      return
    }
    navigate(`${base}/preview`)
  }
  const usedBy = (index: number) => IMPORT_FIELDS.find((f) => mapping[f] === index)

  return (
    <Frame
      step={2}
      wide="lg"
      onBack={() => navigate(`${base}/upload`)}
      primary={
        <Button variant="primary" size="lg" onClick={next}>
          {t('clients.more.import.nextStep')}
        </Button>
      }
    >
      <Heading title={t('clients.more.import.mapping.title')} subtitle={t('clients.more.import.mapping.subtitle')} />
      <Consent />
      <ReadyBanner />
      <FileCard
        onRemove={() => {
          clearFile()
          navigate(`${base}/upload`)
        }}
      />
      <div className="grid grid-cols-2 gap-x-3 md:gap-x-5">
        <h2 className="mb-4 font-display text-title-3 text-ink md:mb-5 md:text-title-2">{t('clients.more.import.mapping.ours')}</h2>
        <h2 className="mb-4 font-display text-title-3 text-ink md:mb-5 md:text-title-2">{t('clients.more.import.mapping.theirs')}</h2>
        {IMPORT_FIELDS.map((field) => {
          const id = `map-${field}`
          const invalid = field === 'firstName' && error
          return (
            <div key={field} className="col-span-2 mb-5 grid grid-cols-2 gap-x-3 md:gap-x-5">
              <div>
                <input disabled value={t(`clients.more.import.fields.${field}`)} aria-label={t('clients.more.import.mapping.ours')} className="input w-full cursor-default bg-sunken text-muted" />
                <p className="mt-1.5 text-small text-muted">{t(`clients.more.import.fieldHelp.${field}`)}</p>
              </div>
              <div>
                <label htmlFor={id} className="sr-only">
                  {t(`clients.more.import.fields.${field}`)}
                </label>
                <Select
                  id={id}
                  value={mapping[field] === null ? '' : String(mapping[field])}
                  onChange={(e) => set(field, e.target.value)}
                  aria-invalid={invalid}
                  className={clsx('w-full', invalid && 'border-danger')}
                  options={[
                    { value: '', label: t('clients.more.import.mapping.skip') },
                    ...file.headers.map((h, i) => {
                      const owner = usedBy(i)
                      return { value: String(i), label: owner && owner !== field ? `${h || `#${i + 1}`} ${t('clients.more.import.mapping.mapped')}` : h || `#${i + 1}` }
                    }),
                  ]}
                />
                {invalid && <p className="mt-1.5 text-small text-danger">{t('clients.more.import.mapping.firstNameRequired')}</p>}
              </div>
            </div>
          )
        })}
      </div>
    </Frame>
  )
}

/* ─── Step 3: preview ────────────────────────────────────────────────────── */

const PAGE = 25

function PreviewStep() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const file = useImportWizard((s) => s.file)!
  const mapping = useImportWizard((s) => s.mapping)!
  const run = useImportWizard((s) => s.run)
  const clients = useDb((s) => s.clients)
  const [tab, setTab] = useState<'ok' | 'errors'>('ok')
  const [page, setPage] = useState(0)
  const scroller = useRef<HTMLDivElement>(null)

  const preview = useMemo(() => {
    const existing = new Set(clients.filter((c) => !c.deletedAt && c.email).map((c) => c.email.trim().toLowerCase()))
    return buildPreview(file.rows, mapping, existing)
  }, [clients, file.rows, mapping])
  const ok = preview.filter((r) => r.errors.length === 0)
  const bad = preview.filter((r) => r.errors.length > 0)
  const rows = tab === 'ok' ? ok : bad
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const visible = rows.slice(page * PAGE, page * PAGE + PAGE)

  const start = () => {
    if (ok.length === 0) {
      toast(t('clients.more.import.preview.nothingToImport'))
      return
    }
    void run(ok.map((r) => r.row))
    navigate(`${base}/progress`)
  }

  const yesNo = (v: boolean) => (v ? t('clients.more.import.preview.yes') : t('clients.more.import.preview.no'))
  const dash = t('clients.more.common.dash')
  const columns: { key: string; label: string; cell: (r: PreviewRow) => ReactNode; width: string }[] = [
    ...(tab === 'errors'
      ? [
          { key: 'line', label: t('clients.more.import.preview.row'), cell: (r: PreviewRow) => r.line, width: 'min-w-[70px]' },
          {
            key: 'errors',
            label: t('clients.more.import.preview.problems'),
            cell: (r: PreviewRow) => (
              <ul className="flex flex-col gap-0.5 text-danger">
                {r.errors.map((e) => (
                  <li key={e}>{t(`clients.more.import.rowErrors.${e}`)}</li>
                ))}
              </ul>
            ),
            width: 'min-w-[240px]',
          },
        ]
      : []),
    { key: 'firstName', label: t('clients.more.import.fields.firstName'), cell: (r) => r.row.firstName || dash, width: 'min-w-[140px]' },
    { key: 'lastName', label: t('clients.more.import.fields.lastName'), cell: (r) => r.row.lastName || dash, width: 'min-w-[140px]' },
    { key: 'email', label: t('clients.more.import.fields.email'), cell: (r) => r.row.email || dash, width: 'min-w-[240px]' },
    { key: 'phone', label: t('clients.more.import.preview.mobile'), cell: (r) => r.row.phone || dash, width: 'min-w-[170px]' },
    { key: 'gender', label: t('clients.more.import.fields.gender'), cell: (r) => (r.row.gender ? t(`clients.more.import.genders.${r.row.gender}`) : dash), width: 'min-w-[140px]' },
    { key: 'birthday', label: t('clients.more.import.fields.birthday'), cell: (r) => r.birthdayLabel || dash, width: 'min-w-[160px]' },
    { key: 'em', label: t('clients.more.import.fields.emailMarketing'), cell: (r) => yesNo(r.row.marketing.email), width: 'min-w-[150px]' },
    { key: 'sm', label: t('clients.more.import.fields.smsMarketing'), cell: (r) => yesNo(r.row.marketing.sms), width: 'min-w-[150px]' },
    { key: 'wm', label: t('clients.more.import.fields.whatsappMarketing'), cell: (r) => yesNo(r.row.marketing.whatsapp), width: 'min-w-[170px]' },
    { key: 'en', label: t('clients.more.import.fields.emailNotifications'), cell: (r) => yesNo(r.row.notifications.email), width: 'min-w-[150px]' },
    { key: 'sn', label: t('clients.more.import.fields.smsNotifications'), cell: (r) => yesNo(r.row.notifications.sms), width: 'min-w-[150px]' },
    { key: 'wn', label: t('clients.more.import.fields.whatsappNotifications'), cell: (r) => yesNo(r.row.notifications.whatsapp), width: 'min-w-[170px]' },
    { key: 'alert', label: t('clients.more.import.fields.staffAlert'), cell: (r) => r.row.staffAlert || dash, width: 'min-w-[200px]' },
    { key: 'tags', label: t('clients.more.import.fields.tags'), cell: (r) => (r.row.tags.length ? r.row.tags.join(', ') : dash), width: 'min-w-[160px]' },
  ]

  return (
    <Frame
      step={3}
      wide="xl"
      onBack={() => navigate(`${base}/mapping`)}
      primary={
        <Button variant="primary" size="lg" onClick={start} disabled={ok.length === 0}>
          {t('clients.more.import.startImport')}
        </Button>
      }
    >
      <Heading title={t('clients.more.import.preview.title')} subtitle={t('clients.more.import.preview.subtitle')} />
      <Consent />
      <UnderlineTabs
        value={tab}
        onChange={(v) => {
          setTab(v)
          setPage(0)
        }}
        items={[
          { value: 'ok', label: t('clients.more.import.preview.toImport', { count: ok.length }) },
          { value: 'errors', label: t('clients.more.import.preview.errors', { count: bad.length }) },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState className="py-16" title={t('clients.more.import.preview.emptyTitle')} body={t('clients.more.import.preview.emptyBody')} />
      ) : (
        <div className="relative">
          <div className="absolute right-0 top-3 z-10 flex gap-1">
            <IconButton label={t('clients.more.import.preview.scrollLeft')} onClick={() => scroller.current?.scrollBy({ left: -480, behavior: 'smooth' })} className="h-9 w-9 border border-line-strong bg-surface shadow-sm">
              <ChevronLeft size={18} aria-hidden />
            </IconButton>
            <IconButton label={t('clients.more.import.preview.scrollRight')} onClick={() => scroller.current?.scrollBy({ left: 480, behavior: 'smooth' })} className="h-9 w-9 border border-line-strong bg-surface shadow-sm">
              <ChevronRight size={18} aria-hidden />
            </IconButton>
          </div>
          <div ref={scroller} className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-body">
              <thead>
                <tr className="h-16 border-b border-line">
                  {columns.map((c) => (
                    <th key={c.key} scope="col" className={clsx('whitespace-nowrap px-4 pr-12 text-body-strong text-ink first:pl-6', c.width)}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.line} className="h-16 border-b border-line">
                    {columns.map((c) => (
                      <td key={c.key} className="px-4 py-3 align-middle text-ink first:pl-6">
                        {c.cell(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <nav className="mt-6 flex flex-wrap items-center justify-center gap-1" aria-label={t('clients.more.import.preview.title')}>
              {Array.from({ length: pages }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={t('clients.more.import.preview.page', { page: i + 1 })}
                  aria-current={page === i ? 'page' : undefined}
                  onClick={() => setPage(i)}
                  className={clsx('h-9 min-w-9 rounded-full px-3 text-body', page === i ? 'bg-primary text-on-primary' : 'text-ink hover:bg-sunken')}
                >
                  {i + 1}
                </button>
              ))}
            </nav>
          )}
        </div>
      )}
    </Frame>
  )
}

/* ─── Step 4: progress / result ──────────────────────────────────────────── */

function ProgressStep() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const status = useImportWizard((s) => s.status)
  const imported = useImportWizard((s) => s.imported)
  const retry = useImportWizard((s) => s.retry)
  const reset = useImportWizard((s) => s.reset)
  const done = () => {
    navigate('/clients/list')
    setTimeout(reset, 0)
  }
  return (
    <Frame step={4}>
      <div className="flex flex-col items-center py-12 text-center md:py-20" aria-live="polite">
        {status === 'running' && (
          <>
            <Loader2 size={48} className="animate-spin text-primary" aria-hidden />
            <h1 className="mt-6 font-display text-title-1 text-ink">{t('clients.more.import.progress.running')}</h1>
            <p className="mt-2 text-body-lg text-muted">{t('clients.more.import.progress.runningBody')}</p>
            <div className="mt-8 h-2 w-full max-w-md overflow-hidden rounded-full bg-sunken">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-primary" />
            </div>
          </>
        )}
        {status === 'done' && (
          <>
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-success-subtle">
              <CheckCircle2 size={44} className="text-success" aria-hidden />
            </span>
            <h1 className="mt-6 font-display text-title-1 text-ink md:text-display">{t('clients.more.import.progress.title')}</h1>
            <p className="mt-3 text-body-lg text-muted">{t('clients.more.import.progress.body', { count: imported })}</p>
            <Button variant="primary" size="lg" className="mt-8" onClick={done}>
              {t('clients.more.import.progress.done')}
            </Button>
          </>
        )}
        {status === 'failed' && (
          <>
            <XCircle size={48} className="text-danger" aria-hidden />
            <h1 className="mt-6 font-display text-title-1 text-ink">{t('clients.more.import.progress.failedTitle')}</h1>
            <p className="mt-2 text-body-lg text-muted">{t('clients.more.import.progress.failedBody')}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              <Button size="lg" onClick={done}>
                {t('clients.more.common.close')}
              </Button>
              <Button variant="primary" size="lg" onClick={() => void retry()}>
                {t('clients.more.import.progress.retry')}
              </Button>
            </div>
          </>
        )}
      </div>
    </Frame>
  )
}
