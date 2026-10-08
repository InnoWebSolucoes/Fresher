import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { requestPasswordReset } from '@/api/auth'
import { AuthLayout } from './AuthLayout'

const schema = z.object({ email: z.string().min(1, 'auth.errors.emailRequired').email('auth.errors.emailInvalid') })
type FormValues = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [sent, setSent] = useState<{ email: string; token: string | null } | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const onSubmit = async ({ email }: FormValues) => {
    const { token } = await requestPasswordReset(email)
    setSent({ email, token })
  }

  return (
    <AuthLayout>
      <Link to="/login" className="mb-8 inline-flex items-center gap-2 text-body-strong text-primary hover:underline">
        <ArrowLeft size={16} aria-hidden />
        {t('auth.backToLogin')}
      </Link>
      {sent ? (
        <div role="status">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-subtle text-success">
            <MailCheck size={22} aria-hidden />
          </span>
          <h1 className="font-display text-title-1">{t('auth.checkInbox')}</h1>
          <p className="mt-2 text-body-lg text-muted">{t('auth.checkInboxBody', { email: sent.email })}</p>
          <button type="button" className="btn-secondary mt-6" onClick={() => window.dispatchEvent(new CustomEvent('ib-open-demo', { detail: 'outbox' }))}>
            {t('auth.openOutbox')}
          </button>
        </div>
      ) : (
        <>
          <h1 className="font-display text-title-1">{t('auth.forgotTitle')}</h1>
          <p className="mt-2 text-body-lg text-muted">{t('auth.forgotSubtitle')}</p>
          <form className="mt-8 flex flex-col gap-5" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div>
              <label htmlFor="email" className="label">
                {t('auth.email')}
              </label>
              <input id="email" type="email" autoComplete="username" className="input" aria-invalid={!!errors.email} {...register('email')} />
              {errors.email?.message && <p className="mt-1.5 text-small text-danger">{t(errors.email.message)}</p>}
            </div>
            <button type="submit" className="btn-primary h-11" disabled={isSubmitting}>
              {isSubmitting && <Loader2 size={18} className="animate-spin" aria-hidden />}
              {t(isSubmitting ? 'auth.sending' : 'auth.sendResetLink')}
            </button>
          </form>
        </>
      )}
    </AuthLayout>
  )
}
