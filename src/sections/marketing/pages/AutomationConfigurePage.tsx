import clsx from 'clsx'
import { Mail, MessageCircle, MessageSquare, Send, Zap } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useDb } from '@/store/db'
import type { Automation } from '@/types'
import { Button, Chip, EmptyState, Field, LearnMore, Menu, MenuButton, Modal, Select, confirm, toast } from '@/components/ui'
import { RATES, updateAutomation } from '@/api/marketing'
import { money2 } from '@/lib/format'
import { WizardFrame } from '../components/kit'
import { AutomationPreview } from './AutomationDetailPage'
import { triggerLabel, triggerOptions, triggerValue, useTriggerText } from './automationTriggers'

type Channel = 'email' | 'sms' | 'whatsapp'

function Step({ icon, title, children, last }: { icon: ReactNode; title: ReactNode; children: ReactNode; last?: boolean }) {
  return (
    <div className="relative flex gap-4 pb-8">
      {!last && <span className="absolute bottom-0 left-[19px] top-11 w-px bg-line-strong" aria-hidden />}
      <span className="relative z-[1] flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary">{icon}</span>
      <div className="min-w-0 flex-1 pt-1.5">
        <h2 className="font-display text-title-3 text-ink">{title}</h2>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  )
}

export function AutomationConfigurePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const automations = useDb((s) => s.automations)
  const automation = automations.find((a) => a.id === id)
  const triggerText = useTriggerText()
  const [channels, setChannels] = useState<Automation['channels'] | null>(automation ? { ...automation.channels } : null)
  const [trigger, setTrigger] = useState(automation ? triggerValue(automation) : '')
  const [operator, setOperator] = useState<Automation['smsOperator']>(automation?.smsOperator ?? 'and')
  const [triggerOpen, setTriggerOpen] = useState(false)
  const [triggerDraft, setTriggerDraft] = useState(trigger)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  if (!automation || !channels) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState title={t('marketing.automationDetail.notFound')} action={<Button onClick={() => navigate('/marketing/automated-messages')}>{t('marketing.automationDetail.backToList')}</Button>} />
      </div>
    )
  }

  const options = triggerOptions(automation)
  const dirty = JSON.stringify(channels) !== JSON.stringify(automation.channels) || trigger !== triggerValue(automation) || operator !== automation.smsOperator
  const back = `/marketing/automated-messages/overview/${automation.id}`

  const close = async () => {
    if (dirty && !(await confirm({ title: t('marketing.configure.discard.title'), body: t('marketing.configure.discard.body'), confirmLabel: t('marketing.configure.discard.confirm'), tone: 'danger' }))) return
    navigate(back)
  }
  const save = async () => {
    if (!channels.email && !channels.sms && !channels.whatsapp) {
      toast(t('marketing.configure.oneChannel'), 'error')
      return
    }
    setSaving(true)
    try {
      await updateAutomation(automation.id, { channels, trigger: options ? trigger : automation.trigger, smsOperator: operator })
      toast(t('marketing.configure.saved'))
      navigate(back)
    } finally {
      setSaving(false)
    }
  }

  /** The email editor is its own page: keep the changes made here before leaving. */
  const editContent = async () => {
    if (dirty) {
      if (!channels.email && !channels.sms && !channels.whatsapp) {
        toast(t('marketing.configure.oneChannel'), 'error')
        return
      }
      await updateAutomation(automation.id, { channels, trigger: options ? trigger : automation.trigger, smsOperator: operator })
      toast(t('marketing.configure.saved'))
    }
    navigate(`/marketing/automated-messages/configure/${automation.id}/email`)
  }

  const channelCard = (ch: Channel, icon: ReactNode, extra?: { label: string; onSelect: () => void }) => (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-surface px-5 py-4">
      <span className="text-primary">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-body-strong text-ink">{t(`marketing.automations.channel.${ch}`)}</p>
        <p className="text-body text-muted">{ch === 'email' ? t('marketing.configure.free') : t(`marketing.configure.rate.${ch}`, { value: money2(RATES[ch]) })}</p>
      </div>
      <Chip tone={channels[ch] ? 'success' : 'neutral'}>{channels[ch] ? t('marketing.common.enabled') : t('marketing.common.disabled')}</Chip>
      <Menu
        width={200}
        trigger={({ open, toggle }) => (
          <MenuButton open={open} toggle={toggle}>
            {t('marketing.configure.actions')}
          </MenuButton>
        )}
        groups={[
          {
            items: [
              ...(extra ? [extra] : []),
              { label: t('marketing.configure.preview'), onSelect: () => setPreviewOpen(true) },
              { label: channels[ch] ? t('marketing.automationDetail.disable') : t('marketing.common.enable'), onSelect: () => setChannels({ ...channels, [ch]: !channels[ch] }) },
            ],
          },
        ]}
      />
    </div>
  )

  return (
    <WizardFrame
      actions={
        <>
          <Button variant="ghost" onClick={() => setPreviewOpen(true)}>
            {t('marketing.configure.preview')}
          </Button>
          <Button onClick={() => void close()}>{t('marketing.common.close')}</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()} data-testid="automation-save">
            {t('marketing.common.save')}
          </Button>
        </>
      }
    >
      <h1 className="mb-8 font-display text-[34px] font-bold leading-[42px] text-ink">{automation.name}</h1>
      <Step icon={<Zap size={18} />} title={t('marketing.configure.trigger')}>
        <p className="text-body-lg text-muted">{triggerText(automation, trigger)}</p>
        {options && (
          <Button
            size="sm"
            className="mt-3 rounded-full"
            onClick={() => {
              setTriggerDraft(trigger)
              setTriggerOpen(true)
            }}
          >
            {t('marketing.common.edit')}
          </Button>
        )}
      </Step>
      <Step icon={<Send size={18} />} title={t('marketing.configure.sendEmail')}>
        {channelCard('email', <Mail size={22} />, { label: t('marketing.configure.editContent'), onSelect: () => void editContent() })}
      </Step>
      <Step icon={<MessageCircle size={18} />} title={t('marketing.configure.sendMessage')} last>
        <div className="flex flex-col gap-3">
          {channelCard('whatsapp', <MessageCircle size={22} className="text-success" />)}
          <div className="flex flex-wrap items-center gap-3">
            <Menu
              width={160}
              align="left"
              trigger={({ open, toggle }) => (
                <MenuButton open={open} toggle={toggle}>
                  {t(`marketing.configure.operator.${operator}`)}
                </MenuButton>
              )}
              groups={[{ items: (['and', 'or'] as const).map((op) => ({ label: t(`marketing.configure.operator.${op}`), checked: operator === op, onSelect: () => setOperator(op) })) }]}
            />
            <p className="text-body text-muted">
              {t(`marketing.configure.operatorHint.${operator}`)} <LearnMore topic={t('marketing.common.topics.whatsappSms')}>{t('marketing.common.learnMore')}</LearnMore>
            </p>
          </div>
          {channelCard('sms', <MessageSquare size={22} />)}
        </div>
      </Step>

      <Modal
        open={triggerOpen}
        onClose={() => setTriggerOpen(false)}
        title={t('marketing.configure.triggerModal')}
        size="sm"
        footer={
          <>
            <Button onClick={() => setTriggerOpen(false)}>{t('marketing.common.cancel')}</Button>
            <Button
              variant="primary"
              onClick={() => {
                setTrigger(triggerDraft)
                setTriggerOpen(false)
              }}
            >
              {t('marketing.common.apply')}
            </Button>
          </>
        }
      >
        <Field label={t(automation.key.startsWith('reminder-') ? 'marketing.configure.advanceNotice' : 'marketing.configure.whenToSend')}>
          {(fid) => <Select id={fid} value={triggerDraft} onChange={(e) => setTriggerDraft(e.target.value)} options={(options ?? []).map((o) => ({ value: o, label: triggerLabel(t, o) }))}
 />}
        </Field>
        <p className={clsx('mt-3 text-small text-muted')}>{triggerText(automation, triggerDraft)}</p>
      </Modal>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title={t('marketing.configure.previewTitle')} size="xl">
        <AutomationPreview automation={{ ...automation, channels }} />
      </Modal>
    </WizardFrame>
  )
}
