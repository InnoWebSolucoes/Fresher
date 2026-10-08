import { ArrowLeft } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import type { PayRun } from '@/types'
import { useDb } from '@/store/db'
import { todayISO } from '@/lib/time'
import { money, round2, fmtDate } from '@/lib/format'
import { Button, Checkbox, Field, FullscreenFrame, Select, Switch, TextArea, confirm, toast } from '@/components/ui'
import { completePayRun, savePayRunDraft } from '@/api/team'
import { currentSession, expectedCash } from '@/api/register'
import { MemberAvatar } from '../components/common'
import { VerificationModal } from '../components/VerificationModal'
import { computeEarnings, lineFor, PAY_KINDS, payMembers, periodsList, type PayKind } from '../lib/pay'
import { memberName } from '../lib/members'
import { rangeLabel } from '../lib/shifts'

type Review = 'needs_review' | 'approved' | 'skip'

/** Pay team wizard (team.md §6.4) and "Pay team member tips" from the register (sales.md §2.1). */
export function PayRunWizardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const registerId = params.get('cashRegisterId')
  const tipsMode = Boolean(registerId)
  const data = useDb(useShallow((s) => ({ cfg: s.settings.payRuns, timesheets: s.timesheets, blockedTimeTypes: s.blockedTimeTypes, sales: s.sales, payments: s.payments, payAdjustments: s.payAdjustments, payRuns: s.payRuns, clients: s.clients, teamMembers: s.teamMembers, workspace: s.workspace, wallet: s.wallet, registers: s.registers, registerSessions: s.registerSessions })))
  const period = useMemo(() => periodsList(todayISO(), data.cfg, 12).find((p) => p.start === params.get('period')) ?? periodsList(todayISO(), data.cfg, 1)[0], [data.cfg, params])
  const earnings = useMemo(() => payMembers(data.teamMembers).map((m) => computeEarnings(data, m, period)), [data, period])
  const steps = tipsMode ? 2 : 3
  const [step, setStep] = useState(1)
  const [includes, setIncludes] = useState<PayKind[]>(PAY_KINDS)
  const only = params.get('member')
  const [selected, setSelected] = useState<Set<string>>(() => new Set(earnings.filter((e) => (!only || e.member.id === only) && (tipsMode ? e.tips.total - e.paidTips > 0 : e.toPay > 0)).map((e) => e.member.id)))
  const [methods, setMethods] = useState<Record<string, PayRun['method']>>({})
  const [note, setNote] = useState('')
  const [review, setReview] = useState<Review>('needs_review')
  const [verifying, setVerifying] = useState(false)
  const [busy, setBusy] = useState(false)
  const session = registerId ? currentSession(registerId) : undefined
  const cash = session ? expectedCash(session) : 0

  const lines = earnings
    .filter((e) => selected.has(e.member.id))
    .map((e) => {
      if (tipsMode) {
        const tips = round2(Math.max(0, e.tips.total - e.paidTips))
        return { teamMemberId: e.member.id, wages: 0, commissions: 0, tips, other: 0, total: tips, paid: tips }
      }
      const l = lineFor(e, includes)
      return { teamMemberId: e.member.id, wages: l.wages, commissions: l.commissions, tips: l.tips, other: l.other, total: l.total, paid: l.toPay }
    })
    .filter((l) => l.paid > 0)
  const total = round2(lines.reduce((s, l) => s + l.paid, 0))
  const defaultMethod: PayRun['method'] = tipsMode ? 'cash_register' : 'manual'
  const methodOf = (id: string) => methods[id] ?? defaultMethod
  const cashTotal = round2(lines.filter((l) => methodOf(l.teamMemberId) === 'cash_register').reduce((s, l) => s + l.paid, 0))
  const base = { periodStart: period.start, periodEnd: period.end, lines, method: defaultMethod, note: note || undefined, source: (tipsMode ? 'register_tips' : 'pay_team') as PayRun['source'], includes: tipsMode ? (['tips'] as PayKind[]) : includes, memberMethods: methods, locationId: data.registers.find((r) => r.id === registerId)?.locationId }
  const exit = () => navigate(tipsMode ? '/sales/register' : '/team/payrun/overview')

  const close = async () => {
    if (await confirm({ title: t('team.payRunNew.leaveTitle'), body: t('team.payRunNew.leaveBody'), confirmLabel: t('team.payRunNew.leave'), tone: 'danger' })) exit()
  }
  const saveDraft = async (status: PayRun['status']) => {
    setBusy(true)
    await savePayRunDraft({ ...base, status })
    setBusy(false)
    toast(t('team.payRunNew.toastSaved'))
    exit()
  }
  const completeClick = () => {
    if (review === 'approved') setVerifying(true)
    else void saveDraft(review === 'skip' ? 'draft' : 'needs_review')
  }

  let body: JSX.Element
  if (step === 1 && !tipsMode) {
    body = (
      <>
        <h1 className="font-display text-title-1 text-ink">{t('team.payRunNew.typesTitle')}</h1>
        <p className="mb-6 mt-2 text-body-lg text-muted">{t('team.payRunNew.typesBody')}</p>
        <div className="card flex flex-col gap-4 p-6">
          {PAY_KINDS.map((k) => (
            <Checkbox key={k} label={t(`team.pay.kinds.${k}`)} hint={t(`team.payRunNew.typeHints.${k}`)} checked={includes.includes(k)} onChange={(v) => setIncludes(v ? [...includes, k] : includes.filter((x) => x !== k))} />
          ))}
        </div>
      </>
    )
  } else if ((step === 2 && !tipsMode) || (step === 1 && tipsMode)) {
    body = (
      <>
        <h1 className="font-display text-title-1 text-ink">{tipsMode ? t('team.payRunNew.tipsTitle') : t('team.payRunNew.summaryTitle')}</h1>
        <p className="mb-6 mt-2 text-body-lg text-muted">{tipsMode ? t('team.payRunNew.tipsBody') : t('team.payRunNew.summaryBody')}</p>
        <p className="mb-4 text-body text-ink">
          {t('team.payRunNew.periodLine', { period: rangeLabel(period.start, period.end), count: selected.size })}
          {tipsMode && ` · ${t('team.payRunNew.cashInRegister', { cash: money(cash), remaining: money(round2(cash - cashTotal)) })}`}
        </p>
        {tipsMode && !session && <p className="mb-4 rounded-md bg-warning-subtle px-4 py-3 text-body text-warning">{t('team.payRunNew.registerClosed')}</p>}
        <div className="card divide-y divide-line">
          {earnings.map((e) => {
            const amount = tipsMode ? round2(Math.max(0, e.tips.total - e.paidTips)) : lineFor(e, includes).toPay
            return (
              <div key={e.member.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <Switch checked={selected.has(e.member.id) && amount > 0} disabled={amount <= 0} onChange={(v) => setSelected((s) => { const n = new Set(s); if (v) n.add(e.member.id); else n.delete(e.member.id); return n })} />
                <MemberAvatar member={e.member} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="text-body-strong text-ink">{memberName(e.member)}</p>
                  <p className="text-small text-muted">{e.member.email}</p>
                </div>
                {!tipsMode && <p className="text-small text-muted">{(['wages', 'commissions', 'tips', 'other'] as const).map((k) => `${t(`team.pay.kinds.${k}`)} ${money(includes.includes(k) ? e[k].total : 0)}`).join(' · ')}</p>}
                {tipsMode && (
                  <Select aria-label={t('team.payRunNew.payWith')} value={methodOf(e.member.id)} onChange={(ev) => setMethods({ ...methods, [e.member.id]: ev.target.value as PayRun['method'] })} className="w-[180px]" options={[{ value: 'cash_register', label: t('team.pay.methods.cash_register') }, { value: 'wallet', label: t('team.pay.methods.wallet') }]} />
                )}
                <p className="w-24 text-right text-body-strong text-ink">{money(amount)}</p>
              </div>
            )
          })}
        </div>
        <p className="mt-4 text-right text-body-lg font-semibold text-ink">{t('team.payRunNew.totalToPay', { total: money(total) })}</p>
      </>
    )
  } else {
    body = (
      <>
        <h1 className="font-display text-title-1 text-ink">{t('team.payRunNew.reviewTitle')}</h1>
        <p className="mb-6 mt-2 text-body-lg text-muted">{t('team.payRunNew.reviewBody')}</p>
        <div className="card grid gap-6 p-6 md:grid-cols-2">
          <div>
            <p className="text-body-strong text-ink">{data.workspace.name}</p>
            <p className="text-small text-muted">{t('team.payRunNew.available', { amount: money(data.wallet.available) })}</p>
            <p className="mt-4 flex justify-between text-body-strong text-ink"><span>{t('team.payRunNew.totalLabel')}</span><span>{money(total)}</span></p>
            <p className="mt-2 flex justify-between text-body text-ink"><span>{t('team.pay.period')}</span><span>{rangeLabel(period.start, period.end)}</span></p>
            <p className="mt-2 flex justify-between text-body text-ink"><span>{t('team.pay.cols.date')}</span><span>{fmtDate(todayISO())}</span></p>
          </div>
          <div>
            <p className="font-display text-title-3 text-ink">{t('team.payRunNew.method')}</p>
            {(['manual', 'cash_register', 'wallet'] as const).map((m) => {
              const ls = lines.filter((l) => methodOf(l.teamMemberId) === m)
              return ls.length ? (
                <p key={m} className="mt-2 flex justify-between text-body text-ink">
                  <span>{t(`team.pay.methods.${m}`)} · {t('team.payRunNew.members', { count: ls.length })}</span>
                  <span>{money(ls.reduce((s, l) => s + l.paid, 0))}</span>
                </p>
              ) : null
            })}
          </div>
          <Field label={t('team.pay.note')} className="md:col-span-2">{(id) => <TextArea id={id} maxLength={185} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[64px]" />}</Field>
          <Field label={t('team.payRunNew.reviewLabel')} hint={t(`team.payRunNew.reviewHints.${review}`)} className="md:col-span-2">
            {(id) => <Select id={id} value={review} onChange={(e) => setReview(e.target.value as Review)} options={(['needs_review', 'approved', 'skip'] as const).map((r) => ({ value: r, label: t(`team.payRunNew.review.${r}`) }))} />}
          </Field>
        </div>
      </>
    )
  }

  const last = step === steps
  return (
    <FullscreenFrame
      progress={step / steps}
      onClose={close}
      maxWidth="max-w-4xl"
      actions={
        <>
          {step > 1 && (
            <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={() => setStep(step - 1)}>
              {t('team.common.goBack')}
            </Button>
          )}
          {!tipsMode && step === 2 && (
            <Button variant="ghost" loading={busy} onClick={() => void saveDraft('draft')}>
              {t('team.payRunNew.saveExit')}
            </Button>
          )}
          {last ? (
            <>
              <span className="text-small text-muted">{t('team.payRunNew.reviewed', { n: review === 'approved' ? 1 : 0 })}</span>
              <Button variant="primary" loading={busy} disabled={lines.length === 0} onClick={completeClick}>
                {t('team.common.complete')}
              </Button>
            </>
          ) : (
            <Button variant="primary" disabled={(step === 1 && !tipsMode && includes.length === 0) || (step === steps - 1 && (lines.length === 0 || (tipsMode && (!session || cashTotal > cash))))} onClick={() => setStep(step + 1)}>
              {t('team.common.continue')}
            </Button>
          )}
        </>
      }
    >
      {body}
      <VerificationModal
        open={verifying}
        onCancel={() => setVerifying(false)}
        onSubmit={async (code) => {
          await completePayRun({ ...base, code, registerSessionId: session?.id })
          setVerifying(false)
          toast(t('team.payRunNew.toastCompleted'))
          navigate(tipsMode ? '/sales/register' : '/team/payrun/settlements')
        }}
      />
    </FullscreenFrame>
  )
}
