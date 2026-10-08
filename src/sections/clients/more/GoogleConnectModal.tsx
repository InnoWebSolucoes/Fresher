import { Check } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDb } from '@/store/db'
import { connectGoogle } from '@/api/clients'
import { Button, Checkbox, Field, LearnMore, Modal, TextInput, toast } from '@/components/ui'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Google Business Profile connect flow, simulated past the Google sign-in. */
export function GoogleConnectModal({ open, onClose, onConnected }: { open: boolean; onClose: () => void; onConnected?: () => void }) {
  if (!open) return null
  return <Body onClose={onClose} onConnected={onConnected} />
}

function Body({ onClose, onConnected }: { onClose: () => void; onConnected?: () => void }) {
  const { t } = useTranslation()
  const locations = useDb((s) => s.locations)
  const workspace = useDb((s) => s.workspace)
  const [step, setStep] = useState<'intro' | 'account' | 'locations'>('intro')
  const [email, setEmail] = useState(() => locations[0]?.email ?? '')
  const [emailError, setEmailError] = useState(false)
  const [picked, setPicked] = useState<string[]>(() => locations.map((l) => l.id))
  const [pickError, setPickError] = useState(false)
  const [saving, setSaving] = useState(false)

  const connect = async () => {
    if (!picked.length) {
      setPickError(true)
      return
    }
    setSaving(true)
    try {
      await connectGoogle(picked)
      toast(t('clients.more.reputation.connectModal.toast'))
      onConnected?.()
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error')
      setSaving(false)
    }
  }

  if (step === 'intro') {
    return (
      <Modal
        open
        onClose={onClose}
        size="lg"
        footer={
          <>
            <span className="mr-auto">
              <LearnMore topic={t('clients.more.reputation.googleTopic')}>{t('clients.more.common.learnMore')}</LearnMore>
            </span>
            <Button variant="primary" onClick={() => setStep('account')}>
              {t('clients.more.common.continue')}
            </Button>
          </>
        }
      >
        <div className="mb-6 flex h-36 items-center justify-center rounded-lg bg-gradient-to-br from-accent-subtle via-primary-subtle to-info-subtle">
          <GoogleMark size={56} />
        </div>
        <h2 className="font-display text-title-1 text-ink">{t('clients.more.reputation.connectModal.title')}</h2>
        <p className="mt-3 text-body-lg text-muted">{t('clients.more.reputation.connectModal.body')}</p>
        <ul className="mt-5 flex flex-col gap-3">
          {(['b1', 'b2', 'b3'] as const).map((k) => (
            <li key={k} className="flex items-start gap-3 text-body text-ink">
              <Check size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
              {t(`clients.more.reputation.connectModal.${k}`)}
            </li>
          ))}
        </ul>
      </Modal>
    )
  }

  if (step === 'account') {
    const next = () => {
      if (!EMAIL.test(email.trim())) {
        setEmailError(true)
        return
      }
      setStep('locations')
    }
    return (
      <Modal
        open
        onClose={onClose}
        title={t('clients.more.reputation.connectModal.accountTitle')}
        subtitle={t('clients.more.reputation.connectModal.accountBody')}
        footer={
          <>
            <Button onClick={() => setStep('intro')}>{t('clients.more.common.back')}</Button>
            <Button variant="primary" onClick={next}>
              {t('clients.more.common.continue')}
            </Button>
          </>
        }
      >
        <div className="mb-5 flex items-center gap-3 rounded-lg bg-sunken px-4 py-3">
          <GoogleMark size={28} />
          <span className="text-body-strong text-ink">{workspace.name}</span>
        </div>
        <Field label={t('clients.more.reputation.connectModal.accountEmail')} error={emailError ? t('clients.more.reputation.connectModal.accountError') : undefined}>
          {(id) => (
            <TextInput
              id={id}
              type="email"
              autoFocus
              value={email}
              invalid={emailError}
              onChange={(e) => {
                setEmail(e.target.value)
                setEmailError(false)
              }}
              onKeyDown={(e) => e.key === 'Enter' && next()}
            />
          )}
        </Field>
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={saving ? () => undefined : onClose}
      title={t('clients.more.reputation.connectModal.locationsTitle')}
      subtitle={t('clients.more.reputation.connectModal.locationsBody')}
      footer={
        <>
          <Button onClick={() => setStep('account')} disabled={saving}>
            {t('clients.more.common.back')}
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void connect()}>
            {saving ? t('clients.more.reputation.connectModal.connecting') : t('clients.more.reputation.connect')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1">
        {locations.map((l) => (
          <div key={l.id} className="rounded-md border border-line px-4 py-3">
            <Checkbox
              label={<span className="text-body-strong">{l.name}</span>}
              hint={[l.address.line1, l.address.city].filter(Boolean).join(', ')}
              checked={picked.includes(l.id)}
              onChange={(v) => {
                setPicked((p) => (v ? [...p, l.id] : p.filter((x) => x !== l.id)))
                setPickError(false)
              }}
            />
          </div>
        ))}
      </div>
      {pickError && (
        <p role="alert" className="mt-2 text-small text-danger">
          {t('clients.more.reputation.connectModal.locationsError')}
        </p>
      )}
    </Modal>
  )
}

/** Four-colour "G" mark drawn with simple shapes. */
export function GoogleMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#4285F4" d="M43.6 24.5c0-1.6-.1-2.8-.4-4H24v7.5h11.1c-.2 1.9-1.5 4.7-4.3 6.6l6.6 5.1c4-3.7 6.2-9.1 6.2-15.2z" />
      <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.4-4.9l-6.6-5.1c-1.8 1.2-4.1 2.1-6.8 2.1-5.3 0-9.7-3.5-11.3-8.2l-6.8 5.3C9.2 39.6 16 44 24 44z" />
      <path fill="#FBBC05" d="M12.7 27.9c-.4-1.2-.7-2.5-.7-3.9s.3-2.7.6-3.9l-6.8-5.3C4.6 17.6 4 20.7 4 24s.6 6.4 1.8 9.2l6.9-5.3z" />
      <path fill="#EA4335" d="M24 11.9c3.8 0 6.3 1.6 7.8 3l5.7-5.6C34.1 6.1 29.5 4 24 4 16 4 9.2 8.4 5.8 14.8l6.8 5.3c1.7-4.7 6.1-8.2 11.4-8.2z" />
    </svg>
  )
}
