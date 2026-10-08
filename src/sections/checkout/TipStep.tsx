import { PlusCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useDb } from '@/store/db'
import { fullName, money, round2 } from '@/lib/format'
import { useCheckout } from './context'
import { Breadcrumb } from './Breadcrumb'
import { Tile } from './ui'

/** Tip step: No tip / 10% / 18% / 25% / Custom tip (calendar.md §10 step 1). */
export function TipStep() {
  const { t } = useTranslation()
  const c = useCheckout()
  const values = useDb((s) => s.settings.tipping.values)
  const tipMemberId = c.tips[0]?.teamMemberId ?? c.lines.find((l) => l.teamMemberId)?.teamMemberId ?? c.defaultMemberId
  const member = c.members.find((m) => m.id === tipMemberId)
  const totalTip = round2(c.tips.reduce((s, x) => s + x.amount, 0))

  const choosePercent = (value: number) => {
    if (!tipMemberId) return
    c.setTipChoice({ kind: 'percent', value })
    c.setTips([{ teamMemberId: tipMemberId, amount: round2((c.tipBase * value) / 100) }])
  }

  return (
    <div>
      <Breadcrumb />
      <h1 className="mt-3 font-display text-title-2 text-ink md:text-title-1">{t('checkout.tip.title')}</h1>
      <p className="mt-5 text-body-lg text-ink md:mt-8">{t('checkout.tip.selectFor', { name: member ? fullName(member) : t('checkout.tip.team') })}</p>
      <div className="mt-4 grid grid-cols-3 gap-2 md:mt-6 md:gap-4">
        <Tile
          label={t('checkout.tip.noTip')}
          selected={c.tipChoice.kind === 'none'}
          onClick={() => {
            c.setTipChoice({ kind: 'none' })
            c.setTips([])
          }}
          testId="tip-none"
        />
        {values.map((v) => (
          <Tile key={v} label={`${v}%`} sub={money(round2((c.tipBase * v) / 100))} selected={c.tipChoice.kind === 'percent' && c.tipChoice.value === v} onClick={() => choosePercent(v)} testId={`tip-${v}`} />
        ))}
        <Tile icon={<PlusCircle size={22} className="text-ink" aria-hidden />} label={t('checkout.tip.custom')} sub={c.tipChoice.kind === 'custom' && totalTip > 0 ? money(totalTip) : undefined} selected={c.tipChoice.kind === 'custom'} onClick={() => c.setModal({ kind: 'customTip' })} testId="tip-custom" />
      </div>
      {totalTip > 0 && (
        <p className="mt-6 text-body-lg text-ink">
          {c.tips.length > 1 ? t('checkout.tip.splitBetween', { count: c.tips.length }) : t('checkout.tip.goesTo', { name: member ? fullName(member) : '' })}{' '}
          <button type="button" className="font-semibold text-primary hover:underline" onClick={() => c.setModal({ kind: 'splitTip' })}>
            {t('checkout.tip.edit')}
          </button>
        </p>
      )}
    </div>
  )
}
