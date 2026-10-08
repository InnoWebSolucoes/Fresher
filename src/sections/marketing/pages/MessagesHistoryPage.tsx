import { Inbox } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import type { MessageLog } from '@/types'
import { Chip, DataTable, EmptyState, LearnMore, Modal, Page, PageHeader, PageSkeleton, SearchInput, Select, Toolbar, usePageLoading, type Column } from '@/components/ui'
import { fmtDateTimeUS } from '@/lib/format'
import { EmailMock, MessageBubblePreview } from '../components/kit'

const STAFF_TYPES = new Set(['invite', 'password_reset', 'stock_order', 'pay_run'])
const STATUS_TONE = { sent: 'neutral', delivered: 'success', opened: 'info', error: 'danger' } as const

export function MessagesHistoryPage() {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const loading = usePageLoading()
  const messages = useDb((s) => s.messages)
  const appointments = useDb((s) => s.appointments)
  const locations = useDb((s) => s.locations)
  const workspace = useDb((s) => s.workspace)
  const [q, setQ] = useState('')
  const [channel, setChannel] = useState('all')
  const [type, setType] = useState('all')
  const [open, setOpen] = useState<MessageLog | null>(null)

  const refs = useMemo(() => new Map(appointments.map((a) => [a.id, a.ref])), [appointments])
  const clientMessages = useMemo(() => messages.filter((m) => !STAFF_TYPES.has(m.type)), [messages])
  const types = useMemo(() => [...new Set(clientMessages.map((m) => m.type))].sort(), [clientMessages])
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^#/, '')
    return clientMessages.filter((m) => {
      if (channel !== 'all' && m.channel !== channel) return false
      if (type !== 'all' && m.type !== type) return false
      if (!needle) return true
      const ref = m.appointmentId ? refs.get(m.appointmentId)?.toLowerCase() : ''
      return m.toName.toLowerCase().includes(needle) || m.to.toLowerCase().includes(needle) || Boolean(ref?.includes(needle))
    })
  }, [clientMessages, channel, type, q, refs])

  const columns: Column<MessageLog>[] = [
    { key: 'at', header: t('marketing.history.col.time'), sortValue: (m) => m.at, cell: (m) => <span className="whitespace-nowrap">{fmtDateTimeUS(m.at)}</span> },
    {
      key: 'client',
      header: t('marketing.history.col.client'),
      sortValue: (m) => m.toName.toLowerCase(),
      cell: (m) =>
        m.clientId ? (
          <button type="button" className="text-primary hover:underline" onClick={() => drawer.open('client', { id: m.clientId! })}>
            {m.toName}
          </button>
        ) : (
          <span className="text-ink">{m.toName}</span>
        ),
    },
    {
      key: 'appointment',
      header: t('marketing.history.col.appointment'),
      cell: (m) => {
        const ref = m.appointmentId ? refs.get(m.appointmentId) : undefined
        return ref ? (
          <button type="button" className="text-primary hover:underline" onClick={() => drawer.open('appointment', { id: m.appointmentId! })}>
            #{ref}
          </button>
        ) : m.campaignId ? (
          <Link to={`/marketing/blast-campaigns/${m.campaignId}`} className="text-primary hover:underline">
            {t('marketing.history.campaign')}
          </Link>
        ) : (
          <span className="text-muted">-</span>
        )
      },
    },
    { key: 'channel', header: t('marketing.history.col.channel'), cell: (m) => t(`marketing.history.channel.${m.channel}`) },
    {
      key: 'type',
      header: t('marketing.history.col.type'),
      cell: (m) => (
        <button type="button" className="text-primary hover:underline" onClick={() => setOpen(m)}>
          {t(`marketing.history.type.${m.type}`)}
        </button>
      ),
    },
    { key: 'status', header: t('marketing.history.col.status'), cell: (m) => <Chip tone={STATUS_TONE[m.status]}>{t(`marketing.history.status.${m.status}`)}</Chip> },
  ]

  if (loading) {
    return (
      <Page wide>
        <PageSkeleton />
      </Page>
    )
  }

  const location = locations[0]

  return (
    <Page wide>
      <PageHeader
        title={t('marketing.history.title')}
        subtitle={
          <>
            {t('marketing.history.subtitle')}{' '}
            <Link to="/marketing/automated-messages" className="text-primary hover:underline">
              {t('marketing.history.settings')}
            </Link>{' '}
            {t('marketing.history.or')} <LearnMore topic="messages history">{t('marketing.history.learnMore')}</LearnMore>
          </>
        }
      />
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder={t('marketing.history.search')} className="max-w-md" />
        <Select
          aria-label={t('marketing.history.col.channel')}
          className="h-10 w-44 rounded-full"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          options={[{ value: 'all', label: t('marketing.history.allChannels') }, ...(['email', 'sms', 'whatsapp'] as const).map((c) => ({ value: c, label: t(`marketing.history.channel.${c}`) }))]}
        />
        <Select
          aria-label={t('marketing.history.col.type')}
          className="h-10 w-48 rounded-full"
          value={type}
          onChange={(e) => setType(e.target.value)}
          options={[{ value: 'all', label: t('marketing.history.allTypes') }, ...types.map((x) => ({ value: x, label: t(`marketing.history.type.${x}`) }))]}
        />
      </Toolbar>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(m) => m.id}
        initialSort={{ key: 'at', dir: 'desc' }}
        empty={<EmptyState icon={<Inbox size={24} />} title={t('marketing.history.empty')} body={t('marketing.history.emptyBody')} />}
      />

      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={t('marketing.history.view')} size="xl">
        {open && (
          <div className="flex flex-col gap-4 pb-3">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg bg-sunken p-4 text-body sm:grid-cols-4">
              <div>
                <dt className="text-small text-muted">{t('marketing.history.col.client')}</dt>
                <dd className="text-ink">{open.toName}</dd>
              </div>
              <div>
                <dt className="text-small text-muted">{t('marketing.history.sentTo')}</dt>
                <dd className="truncate text-ink">{open.to}</dd>
              </div>
              <div>
                <dt className="text-small text-muted">{t('marketing.history.col.time')}</dt>
                <dd className="text-ink">{fmtDateTimeUS(open.at)}</dd>
              </div>
              <div>
                <dt className="text-small text-muted">{t('marketing.history.col.status')}</dt>
                <dd>
                  <Chip tone={STATUS_TONE[open.status]}>{t(`marketing.history.status.${open.status}`)}</Chip>
                </dd>
              </div>
            </dl>
            {open.channel === 'email' ? (
              <EmailMock subject={open.subject} fromName={workspace.name} fromEmail={location?.email ?? ''}>
                <p className="whitespace-pre-wrap text-body-lg text-ink">{open.body}</p>
                {open.link && <span className="mt-6 inline-flex h-10 items-center rounded-full bg-ink px-6 text-body-strong text-canvas">{open.link.label}</span>}
              </EmailMock>
            ) : (
              <MessageBubblePreview kind={open.channel} sender={workspace.name} text={open.body} />
            )}
            {open.status === 'error' && <p className="rounded-md bg-danger-subtle px-4 py-3 text-body text-danger">{t('marketing.history.errorNote')}</p>}
          </div>
        )}
      </Modal>
    </Page>
  )
}
