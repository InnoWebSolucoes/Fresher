import { ArrowLeft, Check, Copy, Mail } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useDrawer } from '@/lib/drawer'
import { useCurrentUser } from '@/store/session'
import { Button, Field, Menu, Modal, TextArea, TextInput, toast } from '@/components/ui'
import { referralLink, sendReferralInvite, usePanels } from '@/api/panels'
import { ApiError } from '@/api/client'
import { fmtDate, money } from '@/lib/format'

/** "Earn up to €130" referral drawer (profile-and-personal-settings.md §7). */
export function ReferralDrawer() {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const user = useCurrentUser()
  const referrals = usePanels((s) => s.referrals)
  const [view, setView] = useState<'home' | 'list'>('home')
  const [share, setShare] = useState<'closed' | 'link' | 'email'>('closed')
  const [copied, setCopied] = useState(false)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const link = user ? referralLink(user.id) : ''

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(link)
    } catch {
      // Clipboard can be blocked; the link is still shown for manual copy.
    }
    setCopied(true)
    toast(t('panels.referral.copied'))
    window.setTimeout(() => setCopied(false), 2000)
  }

  const send = async (e: FormEvent) => {
    e.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t('panels.referral.errors.email'))
      return
    }
    setBusy(true)
    setError('')
    try {
      await sendReferralInvite(email, message)
      toast(t('panels.referral.sentToast', { email: email.trim() }))
      setEmail('')
      setMessage('')
      setShare('closed')
      setView('list')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('panels.common.error'))
    } finally {
      setBusy(false)
    }
  }

  const steps = ['signUp', 'paidPlan', 'bothGet'] as const

  return (
    <div className="flex h-full flex-col" aria-label={t('drawers.referral')}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="relative bg-gradient-to-br from-[#0B3B37] via-primary-active to-primary px-5 pb-8 pt-5 text-white md:px-8 md:pb-10 md:pt-6">
          <div className="flex justify-end">
            <Menu
              trigger={({ open, toggle }) => (
                <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={toggle} className="inline-flex h-10 items-center rounded-full border border-white/70 px-4 text-body-strong hover:bg-white/10">
                  {t('panels.referral.menu')}
                </button>
              )}
              groups={[
                {
                  items: [
                    { label: t('panels.referral.menuReferrals'), checked: view === 'list', onSelect: () => setView('list') },
                    { label: t('panels.referral.menuLearn'), onSelect: () => drawer.open('resources', { tab: 'help', d_view: 'article', d_article: 'referrals' }) },
                    { label: t('panels.referral.menuSupport'), onSelect: () => drawer.open('resources', { tab: 'help' }) },
                  ],
                },
              ]}
            />
          </div>
          <h2 className="mt-6 font-display text-[30px] font-bold leading-[36px] md:mt-8 md:text-[40px] md:leading-[46px]">{t('panels.referral.title')}</h2>
          <div className="mt-6 flex flex-wrap gap-2" aria-hidden>
            {[money(13), money(13), money(13), '…'].map((x, i) => (
              <span key={i} className="rounded-full bg-white/15 px-3 py-1 text-small">
                {x}
              </span>
            ))}
          </div>
        </div>

        {view === 'home' ? (
          <div className="px-5 py-6 md:px-8">
            <h3 className="font-display text-title-3 text-ink">{t('panels.referral.howItWorks')}</h3>
            <ol className="mt-4 flex flex-col gap-5">
              {steps.map((s, i) => (
                <li key={s} className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sunken text-body-strong text-ink">{i + 1}</span>
                  <span>
                    <span className="block text-body-lg font-semibold text-ink">{t(`panels.referral.steps.${s}.title`)}</span>
                    <span className="block text-body text-muted">{t(`panels.referral.steps.${s}.body`)}</span>
                  </span>
                </li>
              ))}
            </ol>
            {referrals.length > 0 && (
              <Button variant="link" className="mt-6" onClick={() => setView('list')}>
                {t('panels.referral.viewInvites', { count: referrals.length })}
              </Button>
            )}
          </div>
        ) : (
          <div className="px-5 py-6 md:px-8">
            <button type="button" onClick={() => setView('home')} className="btn-secondary mb-4 h-9 rounded-full px-3">
              <ArrowLeft size={16} aria-hidden />
              {t('common.back')}
            </button>
            <h3 className="font-display text-title-3 text-ink">{t('panels.referral.yourReferrals')}</h3>
            {referrals.length === 0 ? (
              <p className="mt-3 rounded-md bg-sunken p-4 text-body text-muted">{t('panels.referral.noReferrals')}</p>
            ) : (
              <ul className="card mt-3 divide-y divide-line">
                {referrals.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <Mail size={16} className="text-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-strong text-ink">{r.email}</span>
                      <span className="block text-small text-muted">{t('panels.referral.invitedOn', { date: fmtDate(r.at) })}</span>
                    </span>
                    <span className="chip bg-info-subtle text-info">{t('panels.referral.invited')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      <div className="border-t border-line p-4 md:p-5">
        <Button variant="primary" size="lg" className="w-full rounded-full" onClick={() => setShare('link')}>
          {t('panels.referral.share')}
        </Button>
      </div>

      <Modal open={share === 'link'} onClose={() => setShare('closed')} title={t('panels.referral.shareTitle')} subtitle={t('panels.referral.shareSubtitle')} size="sm">
        <div className="flex flex-col gap-4 pb-3">
          <div className="flex items-center gap-2 rounded-md border border-line-strong bg-sunken px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-body text-ink">{link}</span>
          </div>
          <Button variant="primary" icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={copy}>
            {copied ? t('panels.referral.copiedShort') : t('panels.referral.copyLink')}
          </Button>
          <Button icon={<Mail size={16} />} onClick={() => setShare('email')}>
            {t('panels.referral.shareEmail')}
          </Button>
        </div>
      </Modal>

      <Modal
        open={share === 'email'}
        onClose={() => setShare('closed')}
        title={t('panels.referral.emailTitle')}
        subtitle={t('panels.referral.emailSubtitle')}
        footer={
          <>
            <Button onClick={() => setShare('link')}>{t('common.back')}</Button>
            <Button variant="primary" type="submit" form="referral-email" loading={busy}>
              {t('panels.referral.sendInvite')}
            </Button>
          </>
        }
      >
        <form id="referral-email" onSubmit={send} className="flex flex-col gap-4 pb-3" noValidate>
          <Field label={t('panels.referral.businessEmail')} error={error}>
            {(id) => <TextInput id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('panels.referral.emailPlaceholder')} invalid={!!error} />}
          </Field>
          <Field label={t('panels.referral.message')} optional counter={{ value: message.length, max: 500 }}>
            {(id) => <TextArea id={id} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('panels.referral.messagePlaceholder')} />}
          </Field>
        </form>
      </Modal>
    </div>
  )
}

