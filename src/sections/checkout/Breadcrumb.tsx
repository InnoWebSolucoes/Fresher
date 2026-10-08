import clsx from 'clsx'
import { ChevronRight } from 'lucide-react'
import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { useCheckout } from './context'
import type { Step } from './model'

/** "Cart › Tip › Payment" (calendar.md §10). Earlier steps are links. */
export function Breadcrumb() {
  const { t } = useTranslation()
  const c = useCheckout()
  const steps: Step[] = c.tippingEnabled && !c.feeOnly ? ['cart', 'tip', 'payment'] : ['cart', 'payment']
  const current = steps.indexOf(c.step)
  return (
    <nav aria-label={t('checkout.steps.label')} className="flex items-center gap-2 text-body-lg">
      {steps.map((s, i) => (
        <Fragment key={s}>
          {i > 0 && <ChevronRight size={16} className="text-subtle" aria-hidden />}
          <button
            type="button"
            onClick={() => c.goto(s)}
            disabled={s !== 'cart' && !c.lines.length}
            aria-current={s === c.step ? 'step' : undefined}
            className={clsx('rounded-xs disabled:cursor-not-allowed', s === c.step ? 'font-semibold text-ink' : i < current ? 'text-muted hover:text-ink' : 'text-subtle hover:text-muted')}
          >
            {t(`checkout.steps.${s}`)}
          </button>
        </Fragment>
      ))}
    </nav>
  )
}
