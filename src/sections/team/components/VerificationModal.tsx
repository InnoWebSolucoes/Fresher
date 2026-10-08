import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Button, toast } from '@/components/ui'
import { ApiError } from '@/api/client'
import { requestPayRunCode } from '@/api/team'

/** "i**************@gmail.com": first letter, then one * per hidden character. */
export const maskEmail = (email: string) => {
  const [user = '', domain = ''] = email.split('@')
  return `${user.slice(0, 1)}${'*'.repeat(Math.max(1, user.length - 1))}@${domain}`
}

const SECONDS = 300

/** Full-screen "Enter verification code" before completing a pay run (sales.md §2.1, sales-24f). */
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
  const [sending, setSending] = useState(false)
  const [seconds, setSeconds] = useState(SECONDS)
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const panel = useRef<HTMLDivElement>(null)
  const sent = useRef(false)
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  const send = async () => {
    setSending(true)
    const { to: email } = await requestPayRunCode()
    setSending(false)
    setTo(email)
    setSeconds(SECONDS)
    setDigits(['', '', '', ''])
    setError(null)
    setTimeout(() => inputs.current[0]?.focus(), 0)
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const dialogs = document.querySelectorAll('[aria-modal="true"]')
      if (dialogs[dialogs.length - 1] !== panel.current) return
      e.stopPropagation()
      onCancelRef.current()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [])

  const submit = async (code: string) => {
    setBusy(true)
    setError(null)
    try {
      await onSubmit(code)
    } catch (e) {
      setError(e instanceof ApiError ? t(e.message) : String(e))
      setDigits(['', '', '', ''])
      setBusy(false)
      setTimeout(() => inputs.current[0]?.focus(), 0)
    }
  }
  const setDigit = (i: number, raw: string) => {
    const value = raw.replace(/\D/g, '')
    if (value.length > 1) {
      const all = value.slice(0, 4).split('')
      const next = [0, 1, 2, 3].map((k) => all[k] ?? digits[k] ?? '')
      setDigits(next)
      if (next.every(Boolean)) void submit(next.join(''))
      else inputs.current[Math.min(3, all.length)]?.focus()
      return
    }
    const next = digits.map((d, k) => (k === i ? value : d))
    setDigits(next)
    if (value && i < 3) inputs.current[i + 1]?.focus()
    if (next.every(Boolean)) void submit(next.join(''))
  }

  const expired = seconds === 0
  const progress = seconds / SECONDS
  const r = 88
  const circumference = 2 * Math.PI * r
  return createPortal(
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="verify-title" className="fixed inset-0 z-[85] overflow-y-auto bg-surface">
      <div className="flex justify-end p-6">
        <Button onClick={onCancel}>{t('team.common.cancel')}</Button>
      </div>
      <div className="mx-auto flex max-w-xl flex-col items-center px-6 pb-16 text-center">
        <div className="relative h-[200px] w-[200px]" aria-hidden>
          <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
            <circle cx="100" cy="100" r={r} fill="none" strokeWidth="8" className="stroke-sunken" />
            <circle cx="100" cy="100" r={r} fill="none" strokeWidth="8" strokeLinecap="round" className="stroke-primary transition-[stroke-dashoffset] duration-1000 ease-linear" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-display text-title-1 tabular text-ink">{`${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`}</span>
        </div>
        <h1 id="verify-title" className="mt-8 font-display text-title-1 text-ink">
          {t('team.payRunNew.code.title')}
        </h1>
        <p className="mt-2 text-body-lg text-ink">{t('team.payRunNew.code.subtitle')}</p>
        <p className="text-body-lg text-ink" aria-live="polite">
          {to ? (
            <>
              {t('team.payRunNew.code.sentTo')} <strong>{maskEmail(to)}</strong>
            </>
          ) : (
            t('team.payRunNew.code.sending')
          )}
        </p>
        <div className="mt-8 flex gap-4" role="group" aria-label={t('team.payRunNew.code.title')}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                inputs.current[i] = el
              }}
              value={d}
              disabled={busy || !to || expired}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={4}
              aria-label={t('team.payRunNew.code.digit', { n: i + 1 })}
              aria-invalid={Boolean(error)}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Backspace' && !d && i > 0) inputs.current[i - 1]?.focus()
              }}
              className="input h-[72px] w-[60px] text-center font-display text-title-2 aria-[invalid=true]:border-danger"
            />
          ))}
        </div>
        {error && (
          <p className="mt-4 text-body text-danger" role="alert">
            {error}
          </p>
        )}
        {expired && !error && (
          <p className="mt-4 text-body text-danger" role="alert">
            {t('team.payRunNew.code.expired')}
          </p>
        )}
        <p className="mt-8 text-body text-muted">
          {t('team.payRunNew.code.trouble')}{' '}
          <button
            type="button"
            disabled={sending}
            className="font-semibold text-primary hover:underline disabled:opacity-50"
            onClick={async () => {
              await send()
              toast(t('team.payRunNew.code.resent'))
            }}
          >
            {t('team.payRunNew.code.resend')}
          </button>
        </p>
        <p className="mt-6 rounded-md bg-info-subtle px-4 py-2.5 text-small text-info">{t('team.payRunNew.code.demoHint')}</p>
      </div>
    </div>,
    document.body,
  )
}
