import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal, toast } from '@/components/ui'
import { ApiError } from '@/api/client'
import { requestPayRunCode } from '@/api/team'

const mask = (email: string) => {
  const [user, domain] = email.split('@')
  return `${user?.[0] ?? ''}***@${domain ?? ''}`
}

/** "Enter verification code" before completing a pay run (sales.md §2.1). */
export function VerificationModal({ open, onCancel, onSubmit }: { open: boolean; onCancel: () => void; onSubmit: (code: string) => Promise<void> }) {
  if (!open) return null
  return <VerificationForm onCancel={onCancel} onSubmit={onSubmit} />
}

function VerificationForm({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (code: string) => Promise<void> }) {
  const { t } = useTranslation()
  const [to, setTo] = useState('')
  const [digits, setDigits] = useState(['', '', '', ''])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [seconds, setSeconds] = useState(300)
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const sent = useRef(false)

  const send = async () => {
    const { to: email } = await requestPayRunCode()
    setTo(email)
    setSeconds(300)
    setDigits(['', '', '', ''])
    setError(null)
    inputs.current[0]?.focus()
  }
  useEffect(() => {
    if (sent.current) return
    sent.current = true
    void send()
  }, [])
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(timer)
  }, [])

  const submit = async (code: string) => {
    setBusy(true)
    setError(null)
    try {
      await onSubmit(code)
    } catch (e) {
      setError(e instanceof ApiError ? t(e.message) : String(e))
      setDigits(['', '', '', ''])
      inputs.current[0]?.focus()
    } finally {
      setBusy(false)
    }
  }
  const setDigit = (i: number, raw: string) => {
    const value = raw.replace(/\D/g, '')
    if (value.length > 1) {
      const all = value.slice(0, 4).split('')
      const next = [0, 1, 2, 3].map((k) => all[k] ?? '')
      setDigits(next)
      if (next.every(Boolean)) void submit(next.join(''))
      return
    }
    const next = digits.map((d, k) => (k === i ? value : d))
    setDigits(next)
    if (value && i < 3) inputs.current[i + 1]?.focus()
    if (next.every(Boolean)) void submit(next.join(''))
  }

  return (
    <Modal open onClose={onCancel} size="sm" title={t('team.payRunNew.code.title')} subtitle={t('team.payRunNew.code.subtitle')} footer={<Button onClick={onCancel}>{t('team.common.cancel')}</Button>}>
      <div className="flex flex-col items-center gap-4 pb-2 text-center">
        <p className="text-body text-muted">{to ? t('team.payRunNew.code.sent', { email: mask(to) }) : t('team.payRunNew.code.sending')}</p>
        <div className="flex gap-3" role="group" aria-label={t('team.payRunNew.code.title')}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                inputs.current[i] = el
              }}
              value={d}
              disabled={busy || !to}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={4}
              aria-label={t('team.payRunNew.code.digit', { n: i + 1 })}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Backspace' && !d && i > 0) inputs.current[i - 1]?.focus()
              }}
              className="input h-14 w-14 text-center font-display text-title-2"
            />
          ))}
        </div>
        {error && <p className="text-small text-danger">{error}</p>}
        <p className="text-small text-muted tabular">{t('team.payRunNew.code.expires', { time: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` })}</p>
        <p className="text-small text-muted">
          {t('team.payRunNew.code.trouble')}{' '}
          <button
            type="button"
            className="font-semibold text-primary hover:underline"
            onClick={async () => {
              await send()
              toast(t('team.payRunNew.code.resent'))
            }}
          >
            {t('team.payRunNew.code.resend')}
          </button>
        </p>
        <p className="rounded-md bg-info-subtle px-3 py-2 text-small text-info">{t('team.payRunNew.code.demoHint')}</p>
      </div>
    </Modal>
  )
}
