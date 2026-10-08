import { Coins, Percent, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal, MoneyInput, Segmented, Select } from '@/components/ui'
import { fullName, money, round2 } from '@/lib/format'
import { useCheckout } from './context'
import { keypadPress, parseAmount } from './model'
import { Keypad } from './ui'

/** "Add a tip" with keypad and Amount / Percentage toggle (calendar.md §10 step 1). */
export function CustomTipModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const c = useCheckout()
  const [mode, setMode] = useState<'amount' | 'percent'>('amount')
  const [text, setText] = useState('')
  const value = parseAmount(text)
  const amount = mode === 'amount' ? value : round2((c.tipBase * value) / 100)
  const percent = mode === 'percent' ? value : c.tipBase ? round2((value / c.tipBase) * 100) : 0
  const memberId = c.tips[0]?.teamMemberId ?? c.lines.find((l) => l.teamMemberId)?.teamMemberId ?? c.defaultMemberId
  const add = () => {
    if (memberId && amount > 0) {
      c.setTips([{ teamMemberId: memberId, amount }])
      c.setTipChoice({ kind: 'custom' })
    } else {
      c.setTips([])
      c.setTipChoice({ kind: 'none' })
    }
    onClose()
  }
  return (
    <Modal open onClose={onClose} size="sm" title={t('checkout.tip.addTip')}>
      <div className="flex flex-col items-center pb-2">
        <p className="border-b-2 border-line px-4 pb-1 pt-4 font-display text-[40px] font-bold leading-[48px] text-ink tabular" aria-live="polite">
          {mode === 'amount' ? `€ ${text || '0'}` : `${text || '0'} %`}
        </p>
        <Segmented
          className="mt-4"
          value={mode}
          onChange={(m) => {
            setMode(m)
            setText('')
          }}
          items={[
            { value: 'amount', label: <span className="flex items-center gap-1.5"><Coins size={16} aria-hidden />{t('checkout.tip.amount')}</span> },
            { value: 'percent', label: <span className="flex items-center gap-1.5"><Percent size={16} aria-hidden />{t('checkout.tip.percentage')}</span> },
          ]}
        />
        <div className="mt-6 w-full">
          <Keypad onPress={(k) => setText((s) => keypadPress(s, k, mode === 'percent' ? 1 : 2))} />
        </div>
        <div className="mt-6 flex w-full items-center justify-between">
          <p className="text-body-lg font-semibold text-ink">{mode === 'amount' ? t('checkout.tip.percentTip', { percent }) : t('checkout.tip.amountTip', { amount: money(amount) })}</p>
          <Button variant="primary" size="lg" className="rounded-full" onClick={add} data-testid="custom-tip-add">
            {t('checkout.common.add')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** "Edit or split tip": member + amount rows, Add team member, Remove tip, Apply. */
export function SplitTipModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const c = useCheckout()
  const firstMember = c.lines.find((l) => l.teamMemberId)?.teamMemberId ?? c.defaultMemberId ?? c.members[0]?.id ?? ''
  const [rows, setRows] = useState<{ teamMemberId: string; amount: number | '' }[]>(c.tips.length ? c.tips.map((x) => ({ ...x })) : [{ teamMemberId: firstMember, amount: '' }])
  const total = round2(rows.reduce((s, r) => s + (r.amount === '' ? 0 : r.amount), 0))
  const duplicate = new Set(rows.map((r) => r.teamMemberId)).size !== rows.length
  const negative = rows.some((r) => r.amount !== '' && r.amount < 0)
  const apply = () => {
    const tips = rows.filter((r) => r.amount !== '' && r.amount > 0).map((r) => ({ teamMemberId: r.teamMemberId, amount: round2(Number(r.amount)) }))
    c.setTips(tips)
    c.setTipChoice(tips.length ? { kind: 'custom' } : { kind: 'none' })
    onClose()
  }
  const remove = () => {
    c.setTips([])
    c.setTipChoice({ kind: 'none' })
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('checkout.tip.editSplit')}
      footer={
        <div className="flex w-full items-center justify-between">
          <div>
            <p className="text-body text-ink">{t('checkout.tip.totalTip')}</p>
            <p className="font-display text-title-3 text-ink tabular">{money(total)}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={remove} aria-label={t('checkout.tip.removeTip')} title={t('checkout.tip.removeTip')} className="flex h-12 w-12 items-center justify-center rounded-full border border-line-strong text-danger hover:bg-danger-subtle">
              <Trash2 size={20} aria-hidden />
            </button>
            <Button variant="primary" size="lg" className="rounded-full" disabled={duplicate || negative} onClick={apply}>
              {t('checkout.common.apply')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3 pb-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-3">
            <Select
              aria-label={t('checkout.editItem.teamMember')}
              className="flex-1"
              value={row.teamMemberId}
              onChange={(e) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, teamMemberId: e.target.value } : r)))}
              options={c.members.map((m) => ({ value: m.id, label: fullName(m) }))}
            />
            <MoneyInput aria-label={t('checkout.tip.tipAmount')} className="w-40" value={row.amount} onChange={(v) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, amount: v } : r)))} />
            {rows.length > 1 && (
              <button type="button" className="icon-btn" aria-label={t('checkout.tip.removeRow')} onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}>
                <X size={18} aria-hidden />
              </button>
            )}
          </div>
        ))}
        {duplicate && <p className="text-small text-danger">{t('checkout.tip.duplicate')}</p>}
        <div className="flex flex-wrap gap-2">
          <Button
            className="rounded-full"
            icon={<Plus size={16} aria-hidden />}
            onClick={() => setRows((prev) => [...prev, { teamMemberId: c.members.find((m) => !prev.some((r) => r.teamMemberId === m.id))?.id ?? firstMember, amount: '' }])}
            disabled={rows.length >= c.members.length}
          >
            {t('checkout.tip.addMember')}
          </Button>
          {rows.length > 1 && total > 0 && (
            <Button
              variant="ghost"
              className="rounded-full"
              onClick={() => {
                const each = Math.floor((total / rows.length) * 100) / 100
                const rest = round2(total - each * rows.length)
                setRows((prev) => prev.map((r, j) => ({ ...r, amount: round2(each + (j === 0 ? rest : 0)) })))
              }}
            >
              {t('checkout.tip.splitEqually')}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
