import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { resetPassword } from '@/api/auth'
import { ApiError } from '@/api/client'
import { toast } from '@/store/toast'
import { AuthLayout } from './AuthLayout'

const schema = z
  .object({
    password: z.string().min(8, 'auth.errors.passwordMin'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'auth.errors.passwordsMatch' })
type FormValues = z.infer<typeof schema>

export function ResetPasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const onSubmit = async ({ password }: FormValues) => {
    setFormError(null)
    try {
      await resetPassword(params.get('token') ?? '', password)
      toast(t('auth.passwordUpdated'))
      navigate('/login', { replace: true })
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'auth.errors.invalidToken')
    }
  }

  return (
    <AuthLayout>
      <h1 className="font-display text-title-1">{t('auth.resetTitle')}</h1>
      <form className="mt-8 flex flex-col gap-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        {formError && (
          <p role="alert" className="rounded-md bg-danger-subtle px-4 py-3 text-body text-danger">
            {t(formError)}{' '}
            <Link to="/forgot-password" className="font-semibold underline">
              {t('auth.forgotPassword')}
            </Link>
          </p>
        )}
        <div>
          <label htmlFor="password" className="label">
            {t('auth.newPassword')}
          </label>
          <input id="password" type="password" autoComplete="new-password" className="input" aria-invalid={!!errors.password} {...register('password')} />
          {errors.password?.message && <p className="mt-1.5 text-small text-danger">{t(errors.password.message)}</p>}
        </div>
        <div>
          <label htmlFor="confirm" className="label">
            {t('auth.confirmPassword')}
          </label>
          <input id="confirm" type="password" autoComplete="new-password" className="input" aria-invalid={!!errors.confirm} {...register('confirm')} />
          {errors.confirm?.message && <p className="mt-1.5 text-small text-danger">{t(errors.confirm.message)}</p>}
        </div>
        <button type="submit" className="btn-primary h-11" disabled={isSubmitting}>
          {isSubmitting && <Loader2 size={18} className="animate-spin" aria-hidden />}
          {t('auth.updatePassword')}
        </button>
      </form>
    </AuthLayout>
  )
}
