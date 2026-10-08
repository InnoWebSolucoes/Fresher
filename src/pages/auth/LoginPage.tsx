import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2, UserRound } from 'lucide-react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { login } from '@/api/auth'
import { ApiError } from '@/api/client'
import { landingPath } from '@/lib/permissions'
import { useCurrentUser } from '@/store/session'
import { toast } from '@/store/toast'
import { AuthLayout } from './AuthLayout'

const schema = z.object({
  email: z.string().min(1, 'auth.errors.emailRequired').email('auth.errors.emailInvalid'),
  password: z.string().min(1, 'auth.errors.passwordRequired'),
})
type FormValues = z.infer<typeof schema>

const DEMO_ACCOUNTS = [
  { email: 'owner@demo.app', label: 'auth.demoOwner', sub: 'auth.demoOwnerSub' },
  { email: 'staff@demo.app', label: 'auth.demoStaff', sub: 'auth.demoStaffSub' },
]

export function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const user = useCurrentUser()
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })

  const next = params.get('next')
  if (user && !isSubmitting) return <Navigate to={next ?? landingPath(user.role)} replace />

  const onSubmit = async (values: FormValues) => {
    setFormError(null)
    try {
      const signedIn = await login(values.email, values.password)
      toast(t('auth.welcomeBack', { name: signedIn.firstName }))
      navigate(next && next.startsWith('/') ? next : landingPath(signedIn.role), { replace: true })
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'auth.errors.invalidCredentials')
    }
  }

  return (
    <AuthLayout>
      <h1 className="font-display text-title-1 text-ink">{t('auth.loginTitle')}</h1>
      <p className="mt-2 text-body-lg text-muted">{t('auth.loginSubtitle')}</p>

      <form className="mt-8 flex flex-col gap-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        {formError && (
          <p role="alert" className="rounded-md bg-danger-subtle px-4 py-3 text-body text-danger">
            {t(formError)}
          </p>
        )}
        <div>
          <label htmlFor="email" className="label">
            {t('auth.email')}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            placeholder={t('auth.emailPlaceholder')}
            className="input"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
            {...register('email')}
          />
          {errors.email?.message && (
            <p id="email-error" className="mt-1.5 text-small text-danger">
              {t(errors.email.message)}
            </p>
          )}
        </div>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-x-3">
            <label htmlFor="password" className="label">
              {t('auth.password')}
            </label>
            <Link to="/forgot-password" className="mb-1.5 text-small text-primary hover:underline">
              {t('auth.forgotPassword')}
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder={t('auth.passwordPlaceholder')}
              className="input pr-12"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={t(showPassword ? 'auth.hidePassword' : 'auth.showPassword')}
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-sm text-muted hover:text-ink"
            >
              {showPassword ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
            </button>
          </div>
          {errors.password?.message && (
            <p id="password-error" className="mt-1.5 text-small text-danger">
              {t(errors.password.message)}
            </p>
          )}
        </div>
        <button type="submit" className="btn-primary h-11 w-full" disabled={isSubmitting} data-testid="login-submit">
          {isSubmitting && <Loader2 size={18} className="animate-spin" aria-hidden />}
          {t(isSubmitting ? 'auth.loggingIn' : 'auth.logIn')}
        </button>
      </form>

      <section className="mt-10 rounded-lg border border-dashed border-line-strong p-4">
        <h2 className="text-body-strong text-ink">{t('auth.demoAccounts')}</h2>
        <p className="mb-3 text-small text-muted">
          {t('auth.demoAccountsHint')} {t('demo.loginHint')}.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              title={t('auth.useAccount')}
              onClick={() => {
                setValue('email', account.email, { shouldValidate: true })
                setValue('password', 'demo1234', { shouldValidate: true })
              }}
              className="flex items-center gap-2.5 rounded-md border border-line bg-surface px-3 py-2.5 text-left hover:border-primary hover:bg-primary-subtle"
            >
              <UserRound size={18} className="shrink-0 text-primary" aria-hidden />
              <span className="min-w-0">
                <span className="block text-body-strong text-ink">{t(account.label)}</span>
                <span className="block truncate text-caption text-muted">{account.email}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </AuthLayout>
  )
}
