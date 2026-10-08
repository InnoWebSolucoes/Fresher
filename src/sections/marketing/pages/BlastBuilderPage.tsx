import clsx from 'clsx'
import { addDays } from 'date-fns'
import { format } from '@/lib/dates'
import { Mail, MessageSquare, Search, Tag, Users, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useDb } from '@/store/db'
import type { ID } from '@/types'
import { Button, EmptyState, Field, Modal, RadioGroup, Select, TextArea, TextInput, toast } from '@/components/ui'
import { ApiError } from '@/api/client'
import { RATES, addOnActive, campaignAudience, campaignCost, saveCampaign, submitCampaign, useMarketingSettings, type CampaignDraft } from '@/api/marketing'
import { clientsInSegment } from '@/lib/segments'
import { fmtDateTimeUS, money2 } from '@/lib/format'
import { now } from '@/lib/time'
import { EmailMock, MessageBubblePreview } from '../components/kit'
import { discountLabel, useAudienceData } from '../helpers'

interface FormState extends CampaignDraft {
  scheduleMode: 'now' | 'later'
  date: string
  time: string
}

type Errors = Partial<Record<'name' | 'subject' | 'body' | 'audience' | 'schedule', string>>

function Section({ n, title, subtitle, children }: { n: number; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="card p-4 md:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-small font-semibold text-primary">{n}</span>
        <div>
          <h2 className="font-display text-title-3 text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-body text-muted">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

export function BlastBuilderPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const campaigns = useDb((s) => s.campaigns)
  const deals = useDb((s) => s.deals)
  const workspace = useDb((s) => s.workspace)
  const locations = useDb((s) => s.locations)
  const addOns = useDb((s) => s.addOns)
  const settings = useMarketingSettings()
  const { data, stats } = useAudienceData()
  const existing = id ? campaigns.find((c) => c.id === id) : undefined

  const [form, setForm] = useState<FormState>(() => {
    const later = addDays(now(), 1)
    const base: FormState = {
      name: '',
      channel: 'email',
      audience: { type: 'all', segmentIds: [], clientIds: [] },
      subject: '',
      heading: '',
      body: '',
      buttonLabel: t('marketing.builder.defaultButton'),
      dealId: undefined,
      scheduledAt: undefined,
      scheduleMode: 'now',
      date: format(later, 'yyyy-MM-dd'),
      time: '10:00',
    }
    if (existing) {
      const at = existing.scheduledAt ? new Date(existing.scheduledAt) : null
      return {
        ...base,
        name: existing.name,
        channel: existing.channel,
        audience: existing.audience,
        subject: existing.subject,
        heading: existing.heading,
        body: existing.body,
        buttonLabel: existing.buttonLabel ?? '',
        dealId: existing.dealId,
        scheduleMode: at ? 'later' : 'now',
        date: at ? format(at, 'yyyy-MM-dd') : base.date,
        time: at ? format(at, 'HH:mm') : base.time,
      }
    }
    const segment = params.get('segment')
    const deal = params.get('deal')
    const dealRecord = deal ? deals.find((d) => d.id === deal) : undefined
    return {
      ...base,
      audience: segment ? { type: 'segments', segmentIds: [segment], clientIds: [] } : base.audience,
      dealId: dealRecord?.id,
      name: dealRecord ? dealRecord.name : '',
      subject: dealRecord ? t('marketing.builder.dealSubject', { name: dealRecord.name }) : '',
      heading: dealRecord ? t('marketing.builder.dealHeading', { value: discountLabel(dealRecord) }) : '',
      body: dealRecord?.description ?? '',
    }
  })
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState<'draft' | 'send' | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [clientQuery, setClientQuery] = useState('')
  const set = (patch: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...patch }))
    // Editing a field clears its error.
    const touched = Object.keys(patch).map((k) => (k === 'channel' ? 'audience' : k === 'scheduleMode' || k === 'date' || k === 'time' ? 'schedule' : k))
    setErrors((e) => {
      if (!touched.some((k) => k in e)) return e
      const next = { ...e }
      touched.forEach((k) => delete next[k as keyof Errors])
      return next
    })
  }

  const audience = useMemo(() => campaignAudience(data, form.audience, form.channel, stats), [data, form.audience, form.channel, stats])
  const recipients = audience.eligible.length
  const excluded = audience.matched.length - recipients
  const cost = campaignCost(recipients, form.channel)
  const segmentCounts = useMemo(() => {
    const map = new Map<ID, number>()
    for (const seg of data.segments) {
      const members = clientsInSegment(data, seg, stats)
      map.set(seg.id, members.filter((c) => !c.blocked && (form.channel === 'email' ? c.marketing.email && c.email : c.marketing.sms && c.phone)).length)
    }
    return map
  }, [data, stats, form.channel])
  const activeDeals = deals.filter((d) => d.status === 'active')
  const deal = deals.find((d) => d.id === form.dealId)
  const clientMatches = useMemo(() => {
    const needle = clientQuery.trim().toLowerCase()
    if (!needle) return []
    return data.clients.filter((c) => !c.deletedAt && !form.audience.clientIds.includes(c.id) && `${c.firstName} ${c.lastName} ${c.email} ${c.phone}`.toLowerCase().includes(needle)).slice(0, 6)
  }, [clientQuery, data.clients, form.audience.clientIds])

  // Back from the billing wizard: open the send confirmation.
  useEffect(() => {
    if (params.get('confirm') === '1' && existing && addOnActive(addOns, 'blast-marketing')) {
      setConfirmOpen(true)
      setParams((p) => {
        const next = new URLSearchParams(p)
        next.delete('confirm')
        return next
      }, { replace: true })
    }
  }, [params, existing, addOns, setParams])

  if (id && !existing) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState title={t('marketing.builder.notFound')} action={<Button onClick={() => navigate('/marketing/blast-campaigns/home')}>{t('marketing.builder.backToCampaigns')}</Button>} />
      </div>
    )
  }
  if (existing && existing.status !== 'draft') {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState title={t('marketing.builder.locked')} body={t('marketing.builder.lockedBody')} action={<Button onClick={() => navigate(`/marketing/blast-campaigns/${existing.id}`)}>{t('marketing.builder.viewCampaign')}</Button>} />
      </div>
    )
  }

  const scheduledAt = form.scheduleMode === 'later' ? new Date(`${form.date}T${form.time}`).toISOString() : undefined
  const draft = (): CampaignDraft => ({
    name: form.name.trim() || t('marketing.builder.untitled'),
    channel: form.channel,
    audience: form.audience,
    subject: form.subject.trim(),
    heading: form.heading.trim(),
    body: form.body.trim(),
    buttonLabel: (form.buttonLabel ?? '').trim() || undefined,
    dealId: form.dealId,
    scheduledAt,
  })

  const validate = (): boolean => {
    const e: Errors = {}
    if (!form.name.trim()) e.name = t('marketing.kit.required')
    if (form.channel === 'email' && !form.subject.trim()) e.subject = t('marketing.kit.required')
    if (!form.body.trim()) e.body = t('marketing.kit.required')
    if (form.audience.type === 'segments' && !form.audience.segmentIds.length) e.audience = t('marketing.builder.errors.segments')
    else if (form.audience.type === 'clients' && !form.audience.clientIds.length) e.audience = t('marketing.builder.errors.clients')
    else if (!recipients) e.audience = t('marketing.builder.errors.noRecipients')
    if (form.scheduleMode === 'later' && (!form.date || !form.time || new Date(`${form.date}T${form.time}`) <= now())) e.schedule = t('marketing.builder.errors.schedule')
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const saveDraft = async () => {
    if (!form.name.trim()) {
      setErrors({ name: t('marketing.kit.required') })
      return
    }
    setBusy('draft')
    try {
      const saved = await saveCampaign(draft(), existing?.id)
      toast(t('marketing.builder.toast.draftSaved'))
      navigate(`/marketing/blast-campaigns/${saved.id}`)
    } finally {
      setBusy(null)
    }
  }

  const send = async () => {
    if (!validate()) {
      toast(t('marketing.builder.toast.fixErrors'), 'error')
      return
    }
    setBusy('send')
    try {
      const saved = await saveCampaign(draft(), existing?.id)
      if (!addOnActive(addOns, 'blast-marketing')) {
        toast(t('marketing.builder.toast.billingFirst'))
        navigate(`/legal-wizard/blast-marketing/fees-overview?campaign=${saved.id}`)
        return
      }
      if (!existing) {
        navigate(`/marketing/blast-campaigns/${saved.id}/edit?confirm=1`, { replace: true })
        return
      }
      setConfirmOpen(true)
    } finally {
      setBusy(null)
    }
  }

  const confirmSend = async () => {
    const target = existing?.id
    if (!target) return
    setBusy('send')
    try {
      await saveCampaign(draft(), target)
      await submitCampaign(target)
      toast(t('marketing.builder.toast.submitted'))
      navigate(`/marketing/blast-campaigns/${target}`)
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('marketing.builder.toast.failed'), 'error')
    } finally {
      setBusy(null)
      setConfirmOpen(false)
    }
  }

  const location = locations[0]
  const sender = settings.advanced.senderName || workspace.name
  const bodyParagraphs = (form.body || t('marketing.builder.previewBody')).split(/\n+/)

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      {/* Phones: Close shrinks to an icon and the title gets its own row under the buttons. */}
      <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line bg-surface px-3 py-3 md:h-16 md:flex-nowrap md:gap-4 md:px-6 md:py-0">
        <Button
          icon={<X size={16} />}
          aria-label={t('marketing.common.close')}
          className="max-md:w-10 max-md:px-0"
          onClick={() => navigate(existing ? `/marketing/blast-campaigns/${existing.id}` : '/marketing/blast-campaigns/home')}
        >
          <span className="hidden md:inline">{t('marketing.common.close')}</span>
        </Button>
        <h1 className="order-last w-full break-words font-display text-title-3 text-ink md:order-none md:w-auto md:truncate">{existing ? t('marketing.builder.editTitle') : t('marketing.builder.title')}</h1>
        <div className="flex items-center gap-2">
          <Button onClick={() => void saveDraft()} loading={busy === 'draft'}>
            {t('marketing.builder.saveDraft')}
          </Button>
          <Button variant="primary" onClick={() => void send()} loading={busy === 'send'} data-testid="campaign-send">
            {form.scheduleMode === 'later' ? t('marketing.builder.schedule') : t('marketing.builder.send')}
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-[1280px] gap-5 px-4 py-5 md:gap-6 md:px-6 md:py-8 lg:grid-cols-[minmax(0,1fr)_460px]">
          <div className="flex min-w-0 flex-col gap-5">
            <Section n={1} title={t('marketing.builder.details')} subtitle={t('marketing.builder.detailsHint')}>
              <Field label={t('marketing.builder.name')} error={errors.name}>
                {(fid) => <TextInput id={fid} value={form.name} invalid={Boolean(errors.name)} placeholder={t('marketing.builder.namePlaceholder')} onChange={(e) => set({ name: e.target.value })} />}
              </Field>
            </Section>

            <Section n={2} title={t('marketing.builder.channel')} subtitle={t('marketing.builder.channelHint')}>
              <div className="grid gap-3 sm:grid-cols-2">
                {(['email', 'sms'] as const).map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    aria-pressed={form.channel === ch}
                    onClick={() => set({ channel: ch })}
                    className={clsx('flex items-start gap-3 rounded-lg border p-4 text-left transition-colors', form.channel === ch ? 'border-primary bg-primary-subtle/40 ring-1 ring-primary' : 'border-line hover:border-line-strong')}
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-subtle text-primary">{ch === 'email' ? <Mail size={18} /> : <MessageSquare size={18} />}</span>
                    <span>
                      <span className="block text-body-strong text-ink">{t(`marketing.campaigns.channel.${ch}`)}</span>
                      <span className="block text-small text-muted">{t(`marketing.builder.rate.${ch}`, { value: money2(RATES[ch]) })}</span>
                    </span>
                  </button>
                ))}
              </div>
            </Section>

            <Section n={3} title={t('marketing.builder.audience')} subtitle={t('marketing.builder.audienceHint')}>
              <RadioGroup
                value={form.audience.type}
                onChange={(type) => set({ audience: { ...form.audience, type } })}
                options={[
                  { value: 'all', label: t('marketing.builder.audienceAll'), hint: t('marketing.builder.audienceAllHint') },
                  { value: 'segments', label: t('marketing.builder.audienceSegments'), hint: t('marketing.builder.audienceSegmentsHint') },
                  { value: 'clients', label: t('marketing.builder.audienceClients'), hint: t('marketing.builder.audienceClientsHint') },
                ]}
              />
              {form.audience.type === 'segments' && (
                <div className="mt-4 grid gap-2 rounded-lg bg-sunken p-3 sm:grid-cols-2">
                  {data.segments.map((seg) => (
                    <label key={seg.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-md bg-surface px-3 py-2.5">
                      <span className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[rgb(var(--primary))]"
                          checked={form.audience.segmentIds.includes(seg.id)}
                          onChange={(e) =>
                            set({ audience: { ...form.audience, segmentIds: e.target.checked ? [...form.audience.segmentIds, seg.id] : form.audience.segmentIds.filter((x) => x !== seg.id) } })
                          }
                        />
                        <span className="text-body text-ink">{seg.name}</span>
                      </span>
                      <span className="chip bg-sunken text-muted">{segmentCounts.get(seg.id) ?? 0}</span>
                    </label>
                  ))}
                </div>
              )}
              {form.audience.type === 'clients' && (
                <div className="mt-4 rounded-lg bg-sunken p-3">
                  <label className="relative block">
                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
                    <input
                      value={clientQuery}
                      onChange={(e) => setClientQuery(e.target.value)}
                      placeholder={t('marketing.builder.searchClients')}
                      aria-label={t('marketing.builder.searchClients')}
                      className="h-10 w-full rounded-md border border-line-strong bg-surface pl-9 pr-3 text-body text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </label>
                  {clientMatches.length > 0 && (
                    <ul className="mt-2 divide-y divide-line overflow-hidden rounded-md bg-surface">
                      {clientMatches.map((c) => {
                        const consent = form.channel === 'email' ? c.marketing.email : c.marketing.sms
                        return (
                          <li key={c.id}>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-sunken max-md:flex-wrap max-md:gap-y-1"
                              onClick={() => {
                                set({ audience: { ...form.audience, clientIds: [...form.audience.clientIds, c.id] } })
                                setClientQuery('')
                              }}
                            >
                              <span>
                                <span className="block text-body text-ink">
                                  {c.firstName} {c.lastName}
                                </span>
                                <span className="block text-small text-muted max-md:[overflow-wrap:anywhere]">{form.channel === 'email' ? c.email : c.phone}</span>
                              </span>
                              {!consent && <span className="chip bg-warning-subtle text-warning max-md:whitespace-nowrap">{t('marketing.builder.noConsent')}</span>}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  {form.audience.clientIds.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {form.audience.clientIds.map((cid) => {
                        const c = data.clients.find((x) => x.id === cid)
                        if (!c) return null
                        return (
                          <span key={cid} className="inline-flex items-center gap-1.5 rounded-full bg-surface py-1 pl-3 pr-1.5 text-small text-ink ring-1 ring-line">
                            {c.firstName} {c.lastName}
                            <button
                              type="button"
                              aria-label={t('marketing.builder.removeClient', { name: c.firstName })}
                              className="rounded-full p-0.5 hover:bg-sunken max-md:p-1.5"
                              onClick={() => set({ audience: { ...form.audience, clientIds: form.audience.clientIds.filter((x) => x !== cid) } })}
                            >
                              <X size={14} />
                            </button>
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
              <div className={clsx('mt-4 flex items-start gap-3 rounded-lg px-4 py-3', errors.audience ? 'bg-danger-subtle text-danger' : 'bg-primary-subtle/50 text-ink')}>
                <Users size={18} className="mt-0.5 shrink-0" aria-hidden />
                <div className="text-body">
                  <p className="font-semibold">{t('marketing.builder.recipients', { count: recipients })}</p>
                  {excluded > 0 && <p className="text-small text-muted">{t('marketing.builder.excluded', { count: excluded })}</p>}
                  {errors.audience && <p className="text-small">{errors.audience}</p>}
                </div>
              </div>
            </Section>

            <Section n={4} title={t('marketing.builder.message')} subtitle={t(form.channel === 'email' ? 'marketing.builder.messageEmailHint' : 'marketing.builder.messageSmsHint')}>
              <div className="flex flex-col gap-4">
                {form.channel === 'email' && (
                  <>
                    <Field label={t('marketing.builder.subject')} error={errors.subject}>
                      {(fid) => <TextInput id={fid} value={form.subject} invalid={Boolean(errors.subject)} maxLength={120} placeholder={t('marketing.builder.subjectPlaceholder')} onChange={(e) => set({ subject: e.target.value })} />}
                    </Field>
                    <Field label={t('marketing.builder.heading')} optional>
                      {(fid) => <TextInput id={fid} value={form.heading} maxLength={100} placeholder={t('marketing.builder.headingPlaceholder')} onChange={(e) => set({ heading: e.target.value })} />}
                    </Field>
                  </>
                )}
                <Field label={t('marketing.builder.body')} error={errors.body} counter={{ value: form.body.length, max: form.channel === 'email' ? 2000 : 320 }} hint={form.channel === 'sms' ? t('marketing.builder.smsParts', { count: Math.max(1, Math.ceil(form.body.length / 160)) }) : undefined}>
                  {(fid) => <TextArea id={fid} value={form.body} invalid={Boolean(errors.body)} rows={form.channel === 'email' ? 6 : 4} maxLength={form.channel === 'email' ? 2000 : 320} placeholder={t('marketing.builder.bodyPlaceholder')} onChange={(e) => set({ body: e.target.value })} />}
                </Field>
                {form.channel === 'email' && (
                  <Field label={t('marketing.builder.button')} optional hint={t('marketing.builder.buttonHint')}>
                    {(fid) => <TextInput id={fid} value={form.buttonLabel ?? ''} maxLength={30} onChange={(e) => set({ buttonLabel: e.target.value })} />}
                  </Field>
                )}
                <Field label={t('marketing.builder.deal')} optional hint={activeDeals.length ? t('marketing.builder.dealHint') : t('marketing.builder.noDeals')}>
                  {(fid) => (
                    <Select
                      id={fid}
                      value={form.dealId ?? ''}
                      onChange={(e) => set({ dealId: e.target.value || undefined })}
                      options={[{ value: '', label: t('marketing.builder.noDeal') }, ...activeDeals.map((d) => ({ value: d.id, label: `${d.name} · ${discountLabel(d)}${d.code ? ` · ${d.code}` : ''}` }))]}
                    />
                  )}
                </Field>
              </div>
            </Section>

            <Section n={5} title={t('marketing.builder.scheduleTitle')} subtitle={t('marketing.builder.scheduleHint')}>
              <RadioGroup
                value={form.scheduleMode}
                onChange={(scheduleMode) => set({ scheduleMode })}
                options={[
                  { value: 'now', label: t('marketing.builder.sendNow'), hint: t('marketing.builder.sendNowHint') },
                  { value: 'later', label: t('marketing.builder.sendLater'), hint: t('marketing.builder.sendLaterHint') },
                ]}
              />
              {form.scheduleMode === 'later' && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label={t('marketing.builder.date')} error={errors.schedule}>
                    {(fid) => <TextInput id={fid} type="date" value={form.date} min={format(now(), 'yyyy-MM-dd')} invalid={Boolean(errors.schedule)} onChange={(e) => set({ date: e.target.value })} />}
                  </Field>
                  <Field label={t('marketing.builder.time')}>
                    {(fid) => <TextInput id={fid} type="time" step={300} value={form.time} onChange={(e) => set({ time: e.target.value })} />}
                  </Field>
                </div>
              )}
            </Section>
          </div>

          <aside className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-0 lg:self-start">
            <div className="card p-4 md:p-5">
              <h2 className="mb-3 font-display text-title-3 text-ink">{t('marketing.builder.cost')}</h2>

              <dl className="flex flex-col gap-2 text-body">
                <div className="flex justify-between">
                  <dt className="text-muted">{t('marketing.builder.costRecipients')}</dt>
                  <dd className="tabular text-ink">{recipients}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">{t('marketing.builder.costRate')}</dt>
                  <dd className="tabular text-ink">{money2(RATES[form.channel])}</dd>
                </div>
                <div className="flex justify-between border-t border-line pt-2 text-body-strong">
                  <dt className="text-ink">{t('marketing.builder.costTotal')}</dt>
                  <dd className="tabular text-ink">{money2(cost)}</dd>
                </div>
              </dl>
              <p className="mt-2 text-small text-muted">{t('marketing.builder.costNote')}</p>
            </div>
            <div>
              <p className="mb-2 text-body-strong text-ink">{t('marketing.builder.preview')}</p>
              {form.channel === 'email' ? (
                <EmailMock subject={form.subject || t('marketing.builder.previewSubject')} fromName={workspace.name} fromEmail={location?.email ?? ''}>
                  <p className="font-display text-title-2 text-ink">{form.heading || form.name || t('marketing.builder.previewHeading')}</p>
                  {bodyParagraphs.map((p, i) => (
                    <p key={i} className="mt-3 whitespace-pre-wrap text-body text-ink">
                      {p}
                    </p>
                  ))}
                  {deal && (
                    <div className="mt-5 flex items-center gap-3 rounded-lg border border-dashed border-primary/40 bg-primary-subtle/40 p-4">
                      <Tag size={18} className="text-primary" aria-hidden />
                      <div className="text-body">
                        <p className="font-semibold text-ink">
                          {deal.name} · {t('marketing.builder.off', { value: discountLabel(deal) })}
                        </p>
                        {deal.code && <p className="text-muted">{t('marketing.builder.useCode', { code: deal.code })}</p>}
                      </div>
                    </div>
                  )}
                  {form.buttonLabel && <span className="mt-6 inline-flex h-10 items-center rounded-full bg-ink px-6 text-body-strong text-canvas">{form.buttonLabel}</span>}
                  <p className="mt-8 border-t border-line pt-4 text-caption text-muted">{t('marketing.builder.footer', { name: workspace.name })}</p>
                </EmailMock>
              ) : (
                <MessageBubblePreview kind="sms" sender={sender} text={`${form.body || t('marketing.builder.previewBody')}${deal?.code ? ` ${t('marketing.builder.smsCode', { code: deal.code })}` : ''} ${t('marketing.builder.stop')}`} />
              )}
            </div>
          </aside>
        </div>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={form.scheduleMode === 'later' ? t('marketing.builder.confirm.titleSchedule') : t('marketing.builder.confirm.title')}
        footer={
          <>
            <Button onClick={() => setConfirmOpen(false)}>{t('marketing.common.cancel')}</Button>
            <Button variant="primary" loading={busy === 'send'} onClick={() => void confirmSend()} data-testid="campaign-confirm-send">
              {form.scheduleMode === 'later' ? t('marketing.builder.schedule') : t('marketing.builder.confirm.send')}
            </Button>
          </>
        }
      >
        {(
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-sunken p-4 text-body">
              <dt className="text-muted">{t('marketing.builder.confirm.channel')}</dt>
              <dd className="text-right text-ink">{t(`marketing.campaigns.channel.${form.channel}`)}</dd>
              <dt className="text-muted">{t('marketing.builder.confirm.recipients')}</dt>
              <dd className="text-right text-ink">{recipients}</dd>
              <dt className="text-muted">{t('marketing.builder.confirm.when')}</dt>
              <dd className="text-right text-ink">{scheduledAt ? fmtDateTimeUS(scheduledAt) : t('marketing.builder.confirm.afterReview')}</dd>
              <dt className="font-semibold text-ink">{t('marketing.builder.costTotal')}</dt>
              <dd className="text-right font-semibold text-ink">{money2(cost)}</dd>
            </dl>
            <p className="text-body text-muted">{t('marketing.builder.confirm.review')}</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
