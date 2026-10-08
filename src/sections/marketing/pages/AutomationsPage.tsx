import clsx from 'clsx'
import { Bell, CalendarCheck, ChevronLeft, ChevronRight, Gift, ListTodo, Mail, MessageCircle, MessageSquare, PartyPopper, Plus, Sparkles, TrendingUp, Zap, type LucideIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useDb } from '@/store/db'
import type { Automation } from '@/types'
import { Button, Checkbox, Chip, Field, LearnMore, Menu, Modal, Page, PageSkeleton, Select, TextArea, TextInput, toast, usePageLoading } from '@/components/ui'
import { addOnActive, createAutomation, setAutomationEnabled, useMarketingSettings } from '@/api/marketing'
import { money, money2 } from '@/lib/format'
import { ProfileGateModal } from '@/sections/online/shared'
import { AdvancedOptionsModal, AutoTopUpModal, TopUpModal } from '../components/BalanceModals'
import { CUSTOM_TRIGGERS, triggerLabel } from './automationTriggers'

export const AUTOMATION_SECTIONS: Automation['section'][] = ['reminders', 'appointment_updates', 'waitlist_updates', 'increase_bookings', 'celebrate_milestones', 'client_messages', 'client_loyalty']

export const SECTION_ICONS: Record<Automation['section'], LucideIcon> = {
  reminders: Bell,
  appointment_updates: CalendarCheck,
  waitlist_updates: ListTodo,
  increase_bookings: TrendingUp,
  celebrate_milestones: PartyPopper,
  client_messages: MessageCircle,
  client_loyalty: Gift,
}

export function ChannelIcons({ channels, className }: { channels: Automation['channels']; className?: string }) {
  const { t } = useTranslation()
  return (
    <span className={clsx('flex items-center gap-2.5 text-muted', className)}>
      {channels.email && <Mail size={16} aria-label={t('marketing.automations.channel.email')} />}
      {channels.sms && <MessageSquare size={16} aria-label={t('marketing.automations.channel.sms')} />}
      {channels.whatsapp && <MessageCircle size={16} className="text-success" aria-label={t('marketing.automations.channel.whatsapp')} />}
    </span>
  )
}

function CreateAutomationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [section, setSection] = useState<Automation['section']>('celebrate_milestones')
  const [trigger, setTrigger] = useState(CUSTOM_TRIGGERS[0])
  const [channels, setChannels] = useState({ email: true, sms: false, whatsapp: false })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const create = async () => {
    if (!name.trim()) {
      setError(t('marketing.kit.required'))
      return
    }
    setBusy(true)
    try {
      const a = await createAutomation({ name: name.trim(), description: description.trim() || t('marketing.automations.create.defaultDescription'), section, trigger, channels: channels.email || channels.sms || channels.whatsapp ? channels : { email: true, sms: false, whatsapp: false } })
      toast(t('marketing.automations.create.created'))
      onClose()
      navigate(`/marketing/automated-messages/configure/${a.id}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('marketing.automations.create.title')}
      subtitle={t('marketing.automations.create.subtitle')}
      footer={
        <>
          <Button onClick={onClose}>{t('marketing.common.cancel')}</Button>
          <Button variant="primary" loading={busy} onClick={() => void create()} data-testid="automation-create">
            {t('marketing.automations.create.submit')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('marketing.automations.create.name')} error={error}>
          {(id) => <TextInput id={id} value={name} invalid={Boolean(error)} placeholder={t('marketing.automations.create.namePlaceholder')} onChange={(e) => (setName(e.target.value), setError(''))} />}
        </Field>
        <Field label={t('marketing.automations.create.description')} optional>
          {(id) => <TextArea id={id} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        <Field label={t('marketing.automations.create.section')}>
          {(id) => (
            <Select
              id={id}
              value={section}
              onChange={(e) => setSection(e.target.value as Automation['section'])}
              options={(['increase_bookings', 'celebrate_milestones'] as const).map((s) => ({ value: s, label: t(`marketing.automations.sections.${s}`) }))}
            />
          )}
        </Field>
        <Field label={t('marketing.automations.create.trigger')}>{(id) => <Select id={id} value={trigger} onChange={(e) => setTrigger(e.target.value)} options={CUSTOM_TRIGGERS.map((value) => ({ value, label: triggerLabel(t, value) }))} />
}</Field>
        <div>
          <p className="mb-2 text-body-strong text-ink">{t('marketing.automations.create.channels')}</p>
          <div className="flex flex-col gap-2">
            {(['email', 'sms', 'whatsapp'] as const).map((ch) => (
              <Checkbox key={ch} label={t(`marketing.automations.channel.${ch}`)} hint={t(`marketing.automations.channelCost.${ch}`)} checked={channels[ch]} onChange={(v) => setChannels({ ...channels, [ch]: v })} />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function LoyaltyGate({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('marketing.automations.loyaltyGate.title')}
      footer={
        <>
          <Button onClick={onClose}>{t('marketing.common.close')}</Button>
          <Button variant="primary" onClick={() => navigate('/add-ons/add-on/loyalty/intro')}>
            {t('marketing.automations.loyaltyGate.action')}
          </Button>
        </>
      }
    >
      <p className="text-body text-muted">{t('marketing.automations.loyaltyGate.body')}</p>
    </Modal>
  )
}

function AutomationCard({ a, onEnable, enabling }: { a: Automation; onEnable: (a: Automation) => void; enabling: boolean }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const Icon = a.key.startsWith('custom-') ? Sparkles : SECTION_ICONS[a.section]
  const canEnable = a.marketing || a.section === 'client_loyalty'
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate(`/marketing/automated-messages/overview/${a.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/marketing/automated-messages/overview/${a.id}`)}
      className="flex min-h-[230px] cursor-pointer flex-col rounded-lg border border-line bg-surface p-6 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      data-testid={`automation-${a.key}`}
    >
      <Icon size={26} className="text-warning" aria-hidden />
      <h3 className="mt-5 text-[17px] font-semibold leading-6 text-ink">{a.name}</h3>
      <p className="mt-2 flex-1 text-body text-muted">{a.description}</p>
      <div className="mt-5 flex items-center justify-between gap-2">
        {a.enabled ? (
          <Chip tone="success">{t('marketing.common.enabled')}</Chip>
        ) : canEnable ? (
          <Button
            size="sm"
            loading={enabling}
            onClick={(e) => {
              e.stopPropagation()
              onEnable(a)
            }}
          >
            {t('marketing.common.enable')}
          </Button>
        ) : (
          <Chip>{t('marketing.common.disabled')}</Chip>
        )}
        <ChannelIcons channels={a.channels} />
      </div>
    </div>
  )
}

export function AutomationsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const automations = useDb((s) => s.automations)
  const workspace = useDb((s) => s.workspace)
  const addOns = useDb((s) => s.addOns)
  const locations = useDb((s) => s.locations)
  const settings = useMarketingSettings()
  const [tab, setTab] = useState<Automation['section']>('reminders')
  const [modal, setModal] = useState<'topup' | 'auto' | 'advanced' | 'create' | 'loyalty' | 'profile' | null>(null)
  // Marketing automations go out with links to the booking profile, so one must be listed.
  const profileListed = locations.some((l) => l.marketplace.listed)
  const [enabling, setEnabling] = useState<string | null>(null)
  const sectionRefs = useRef<Partial<Record<Automation['section'], HTMLElement | null>>>({})
  const tabsRef = useRef<HTMLDivElement>(null)
  const autoOn = settings.autoTopUpEnabled

  const jump = (section: Automation['section']) => {
    setTab(section)
    sectionRefs.current[section]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const enable = async (a: Automation) => {
    if (a.section === 'client_loyalty' && !addOnActive(addOns, 'loyalty')) {
      setModal('loyalty')
      return
    }
    if (a.marketing && !profileListed) {
      setModal('profile')
      return
    }
    setEnabling(a.id)
    try {
      await setAutomationEnabled(a.id, true)
      toast(t('marketing.automations.toast.enabled', { name: a.name }))
    } finally {
      setEnabling(null)
    }
  }

  if (loading) {
    return (
      <Page wide>
        <PageSkeleton />
      </Page>
    )
  }

  return (
    <Page wide>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-title-1 text-ink">{t('marketing.automations.title')}</h1>
          <p className="mt-1 text-body-lg text-muted">
            {t('marketing.automations.subtitle')} <LearnMore topic={t('marketing.common.topics.automations')}>{t('marketing.common.learnMore')}</LearnMore>
          </p>
        </div>
        <div className="flex min-w-[280px] items-start justify-between gap-4 rounded-lg border border-line bg-surface px-5 py-4" data-testid="communication-balance">
          <div>
            <p className="text-body text-ink">{t('marketing.automations.balance')}</p>
            <p className="mt-1 font-display text-title-2 text-ink">{money2(workspace.messageCredits)}</p>
            {autoOn && <p className="text-small text-success">{t('marketing.automations.autoOnShort')}</p>}
          </div>
          <Menu
            label={t('marketing.automations.balanceActions')}
            groups={[
              {
                items: [
                  { label: t('marketing.automations.menu.manage'), onSelect: () => navigate('/setup/billing/communication-balance') },
                  { label: autoOn ? t('marketing.automations.menu.manageAuto') : t('marketing.automations.menu.enableAuto'), onSelect: () => setModal('auto') },
                  { label: t('marketing.automations.menu.topUp'), onSelect: () => setModal('topup') },
                  { label: t('marketing.automations.menu.advanced'), onSelect: () => setModal('advanced') },
                ],
              },
            ]}
          />
        </div>
      </header>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-lg bg-gradient-to-r from-primary to-[#2BA59C] px-6 py-5 text-on-primary">
        <div className="flex items-start gap-3">
          <Zap size={20} className="mt-0.5 shrink-0" aria-hidden />
          <div>
            <p className="text-body-lg font-semibold">{autoOn ? t('marketing.automations.banner.onTitle') : t('marketing.automations.banner.title')}</p>
            <p className="text-body opacity-90">
              {autoOn ? t('marketing.automations.banner.onBody', { amount: money(settings.autoTopUp.amount), threshold: money(settings.autoTopUp.threshold) }) : t('marketing.automations.banner.body')}
            </p>
          </div>
        </div>
        <button type="button" onClick={() => setModal('auto')} className="h-10 rounded-full bg-white px-5 text-body-strong text-[#10201F] hover:bg-white/90">
          {autoOn ? t('marketing.automations.banner.manage') : t('marketing.automations.banner.setUp')}
        </button>
      </div>

      <div className="sticky top-0 z-10 -mx-2 mb-6 flex items-center gap-2 bg-canvas/95 px-2 py-2 backdrop-blur">
        <div ref={tabsRef} role="tablist" className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]">
          {AUTOMATION_SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={tab === s}
              onClick={() => jump(s)}
              className={clsx('h-10 shrink-0 whitespace-nowrap rounded-full px-4 text-body-strong transition-colors', tab === s ? 'bg-ink text-canvas' : 'text-ink hover:bg-sunken')}
            >
              {t(`marketing.automations.sections.${s}`)}
            </button>
          ))}
        </div>
        <button type="button" aria-label={t('marketing.automations.scrollLeft')} className="icon-btn h-9 w-9" onClick={() => tabsRef.current?.scrollBy({ left: -240, behavior: 'smooth' })}>
          <ChevronLeft size={18} />
        </button>
        <button type="button" aria-label={t('marketing.automations.scrollRight')} className="icon-btn h-9 w-9" onClick={() => tabsRef.current?.scrollBy({ left: 240, behavior: 'smooth' })}>
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="flex flex-col gap-10">
        {AUTOMATION_SECTIONS.map((section) => {
          const items = automations.filter((a) => a.section === section)
          return (
            <section
              key={section}
              ref={(el) => {
                sectionRefs.current[section] = el
              }}
              className="scroll-mt-20"
              aria-labelledby={`auto-${section}`}
            >
              <h2 id={`auto-${section}`} className="mb-4 font-display text-title-2 text-ink">
                {t(`marketing.automations.sections.${section}`)}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((a) => (
                  <AutomationCard key={a.id} a={a} onEnable={(x) => void enable(x)} enabling={enabling === a.id} />
                ))}
                {section === 'celebrate_milestones' && (
                  <button
                    type="button"
                    onClick={() => setModal(profileListed ? 'create' : 'profile')}
                    className="flex min-h-[230px] flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-line-strong bg-transparent p-6 text-ink hover:border-primary hover:text-primary"
                    data-testid="automation-create-new"
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-subtle text-primary">
                      <Plus size={22} aria-hidden />
                    </span>
                    <span className="text-[17px] font-semibold">{t('marketing.automations.createNew')}</span>
                    <span className="text-body text-muted">{t('marketing.automations.createNewHint')}</span>
                  </button>
                )}
              </div>
            </section>
          )
        })}
      </div>

      <TopUpModal open={modal === 'topup'} onClose={() => setModal(null)} />
      <AutoTopUpModal open={modal === 'auto'} onClose={() => setModal(null)} />
      <AdvancedOptionsModal open={modal === 'advanced'} onClose={() => setModal(null)} />
      <CreateAutomationModal open={modal === 'create'} onClose={() => setModal(null)} />
      <LoyaltyGate open={modal === 'loyalty'} onClose={() => setModal(null)} />
      <ProfileGateModal open={modal === 'profile'} onClose={() => setModal(null)} title={t('marketing.automations.profileGate')} locations={locations} />
    </Page>
  )
}
