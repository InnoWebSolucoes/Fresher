import clsx from 'clsx'
import { ArrowLeft, ArrowRight, NotebookPen } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import type { ID, PayRun } from '@/types'
import { useDb } from '@/store/db'
import { todayISO } from '@/lib/time'
import { fmtDate, money, round2 } from '@/lib/format'
import { Button, Checkbox, EmptyState, FullscreenFrame, Menu, SearchInput, Select, confirm, toast } from '@/components/ui'
import { ApiError } from '@/api/client'
import { completePayRun, readPayRunMeta, savePayRunDraft, type PayRunInput, type ReviewStatus } from '@/api/team'
import { expectedCash } from '@/api/register'
import { ActionsPill, MemberAvatar, PortalMenu, StatCard } from '../components/common'
import { AdjustmentModal } from '../components/AdjustmentModal'
import { BreakdownModal } from '../components/BreakdownModal'
import { EditPaymentMethodModal, InfoTip, NoteModal, ReviewStatusMenu, TriCheckbox, type PayMethod } from '../components/PayRunParts'
import { VerificationModal } from '../components/VerificationModal'
import { computeEarnings, PAY_KINDS, payMembers, payRowFor, periodsList, salesInPeriod, tipsLine, unpaidTips, usePayData, type PayKind, type PayPeriod } from '../lib/pay'
import { memberName } from '../lib/members'
import { rangeLabel } from '../lib/shifts'

interface WizardSeed {
  draftId?: ID
  period: PayPeriod
  registerId: ID | null
  includes: PayKind[]
  selected: ID[] | null
  methods: Record<ID, PayMethod>
  note: string
  review: ReviewStatus
  step: number
}

/**
 * Pay team wizard (team.md §6.4) and "Pay team member tips" from a register
 * (sales.md §2.1, `?cashRegisterId=`). `?draft=<id>` resumes a saved pay run.
 */
export function PayRunWizardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const cfg = useDb((s) => s.settings.payRuns)
  const draftId = params.get('draft')
  const seed = useMemo<WizardSeed | null>(() => {
    const periods = periodsList(todayISO(), cfg, 12)
    if (draftId) {
      const run = useDb.getState().payRuns.find((p) => p.id === draftId)
      if (!run || run.status === 'completed') return null
      const meta = readPayRunMeta()[run.id]
      const tips = run.source === 'register_tips'
      return {
        draftId: run.id,
        period: { start: run.periodStart, end: run.periodEnd },
        registerId: meta?.registerId ?? null,
        includes: tips ? ['tips'] : (meta?.includes ?? PAY_KINDS),
        selected: run.lines.map((l) => l.teamMemberId),
        methods: meta?.memberMethods ?? {},
        note: run.note ?? '',
        review: meta?.review ?? (run.status === 'needs_review' ? 'needs_review' : 'skip'),
        step: meta?.step ?? (tips ? 2 : 3),
      }
    }
    const registerId = params.get('cashRegisterId')
    const only = params.get('member')
    return {
      period: periods.find((p) => p.start === params.get('period')) ?? periods[0],
      registerId,
      includes: registerId ? ['tips'] : PAY_KINDS,
      selected: only ? [only] : null,
      methods: {},
      note: '',
      review: 'needs_review',
      step: 1,
    }
    // The wizard seeds itself once; later store changes don't reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (seed) return
    toast(t('team.payRunNew.draftMissing'))
    navigate('/team/payrun/overview', { replace: true })
  }, [seed, navigate, t])

  if (!seed) return null
  return <Wizard seed={seed} />
}

function Wizard({ seed }: { seed: WizardSeed }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const data = usePayData()
  const { teamMembers, workspace, wallet, registers, registerSessions, locations } = useDb(useShallow((s) => ({ teamMembers: s.teamMembers, workspace: s.workspace, wallet: s.wallet, registers: s.registers, registerSessions: s.registerSessions, locations: s.locations })))
  const { period, registerId, draftId } = seed
  const tipsMode = Boolean(registerId)
  const steps = tipsMode ? 2 : 3
  const [step, setStep] = useState(seed.step)
  const [includes, setIncludes] = useState<PayKind[]>(seed.includes)
  const [selection, setSelection] = useState<ID[] | null>(seed.selected)
  const [methods, setMethods] = useState<Record<ID, PayMethod>>(seed.methods)
  const [note, setNote] = useState(seed.note)
  const [review, setReview] = useState<ReviewStatus>(seed.review)
  const [q, setQ] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const [methodsOpen, setMethodsOpen] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [busy, setBusy] = useState(false)
  const [breakdown, setBreakdown] = useState<{ id: ID; kind?: PayKind } | null>(null)
  const [adjustment, setAdjustment] = useState<{ id: ID; kind: PayKind } | null>(null)

  const register = registers.find((r) => r.id === registerId)
  const registerLocation = locations.find((l) => l.id === register?.locationId)
  // Review card and payment method modal title: the register's location, else the business.
  const payerName = register ? `${registerLocation?.name ?? workspace.name} · ${register.name}` : workspace.name
  const session = registerId ? registerSessions.find((x) => x.registerId === registerId && !x.closedAt) : undefined
  const cashInRegister = session ? expectedCash(session) : 0

  const earnings = useMemo(() => {
    const sales = salesInPeriod(data.sales, period)
    return payMembers(teamMembers).map((m) => computeEarnings(data, m, period, sales))
  }, [data, teamMembers, period])
  const rows = useMemo(() => earnings.map((e) => ({ e, row: payRowFor(e, includes), tips: unpaidTips(e) })), [earnings, includes])
  // Tips mode lists members of the register's location with unpaid tips; pay team lists everyone in pay runs.
  const listed = tipsMode ? rows.filter((r) => r.tips > 0 && (!register || r.e.member.locationIds.includes(register.locationId))) : rows
  const amountOf = (r: (typeof rows)[number]) => (tipsMode ? r.tips : r.row.toPay)
  const includable = listed.filter((r) => amountOf(r) > 0).map((r) => r.e.member.id)
  // Before anyone ticks a box, everyone who can be paid is included.
  const included = (selection ?? includable).filter((id) => includable.includes(id))
  const includedRows = listed.filter((r) => included.includes(r.e.member.id))
  const defaultMethod: PayMethod = tipsMode ? 'cash_register' : 'manual'
  const methodOf = (id: ID): PayMethod => methods[id] ?? defaultMethod
  const lines = includedRows.map((r) => (tipsMode ? tipsLine(r.e) : r.row.line))
  const total = round2(lines.reduce((s, l) => s + l.paid, 0))
  const cashTotal = round2(lines.filter((l) => methodOf(l.teamMemberId) === 'cash_register').reduce((s, l) => s + l.paid, 0))
  const walletTotal = round2(lines.filter((l) => methodOf(l.teamMemberId) === 'wallet').reduce((s, l) => s + l.paid, 0))
  const cashShort = cashTotal > 0 && (!session || cashTotal > cashInRegister + 0.004)
  const walletShort = walletTotal > wallet.available + 0.004
  const visible = listed.filter((r) => memberName(r.e.member).toLowerCase().includes(q.trim().toLowerCase()))

  const toggle = (id: ID, on: boolean) => setSelection(on ? [...new Set([...included, id])] : included.filter((x) => x !== id))
  const allIncluded = includable.length > 0 && included.length === includable.length

  const input = (): PayRunInput => ({
    periodStart: period.start,
    periodEnd: period.end,
    lines,
    method: defaultMethod,
    note: note || undefined,
    source: tipsMode ? 'register_tips' : 'pay_team',
    meta: { includes, memberMethods: Object.fromEntries(included.map((id) => [id, methodOf(id)])), registerId: registerId ?? undefined, locationId: register?.locationId, step, review },
  })
  const exit = (to?: string) => navigate(to ?? (tipsMode ? '/sales/register' : '/team/payrun/overview'))

  const close = async () => {
    if (await confirm({ title: t('team.payRunNew.leaveTitle'), body: t('team.payRunNew.leaveBody'), confirmLabel: t('team.payRunNew.leave'), tone: 'danger' })) exit()
  }
  const saveDraft = async (status: Exclude<PayRun['status'], 'completed'>) => {
    setBusy(true)
    try {
      await savePayRunDraft(input(), status, draftId)
      toast(t(status === 'needs_review' ? 'team.payRunNew.toastNeedsReview' : 'team.payRunNew.toastSaved'))
      exit(tipsMode ? '/sales/register' : '/team/payrun/overview')
    } catch (e) {
      toast(e instanceof ApiError ? t(e.message) : String(e))
      setBusy(false)
    }
  }
  const complete = () => {
    if (review === 'approved') setVerifying(true)
    else void saveDraft(review === 'skip' ? 'draft' : 'needs_review')
  }

  const reviewedCount = review === 'approved' ? 1 : 0
  const last = step === steps
  const typesStep = !tipsMode && step === 1
  const membersStep = (!tipsMode && step === 2) || (tipsMode && step === 1)
  const continueDisabled = (typesStep && includes.length === 0) || (membersStep && (included.length === 0 || (tipsMode && (cashShort || walletShort))))

  const header = (
    <>
      {step > 1 && (
        <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={() => setStep(step - 1)} aria-label={t('team.common.goBack')} className="max-md:w-10 max-md:px-0">
          <span className="hidden md:inline">{t('team.common.goBack')}</span>
        </Button>
      )}
      {!tipsMode && step === 2 && (
        <Button variant="ghost" loading={busy} disabled={included.length === 0} onClick={() => void saveDraft('draft')} className="max-md:px-2">
          {t('team.payRunNew.saveExit')}
        </Button>
      )}
      {last ? (
        <>
          <span className="px-0 text-body text-muted md:px-2" aria-live="polite">
            {t('team.payRunNew.reviewed', { n: reviewedCount, total: 1 })}
          </span>
          <Button variant="primary" loading={busy} disabled={lines.length === 0 || (review === 'approved' && (cashShort || walletShort))} onClick={complete}>
            {t('team.common.complete')}
          </Button>
        </>
      ) : (
        <Button variant="primary" disabled={continueDisabled} onClick={() => setStep(step + 1)}>
          {t('team.common.continue')}
          <ArrowRight size={16} className="max-md:hidden" aria-hidden />
        </Button>
      )}
    </>
  )

  let body: JSX.Element
  if (typesStep) {
    body = (
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-title-2 text-ink md:text-title-1">{t('team.payRunNew.typesTitle')}</h1>
        <p className="mb-6 mt-2 text-body-lg text-muted">{t('team.payRunNew.typesBody')}</p>
        <div className="card flex flex-col gap-5 p-5 md:p-8">
          {PAY_KINDS.map((k) => (
            <Checkbox key={k} label={t(`team.pay.kinds.${k}`)} hint={t(`team.payRunNew.typeHints.${k}`)} checked={includes.includes(k)} onChange={(v) => setIncludes(v ? PAY_KINDS.filter((x) => x === k || includes.includes(x)) : includes.filter((x) => x !== k))} />
          ))}
        </div>
        {includes.length === 0 && <p className="mt-3 text-small text-danger">{t('team.payRunNew.errors.noTypes')}</p>}
      </div>
    )
  } else if (membersStep && tipsMode) {
    const cashLeft = round2(cashInRegister - cashTotal)
    const walletLeft = round2(wallet.available - walletTotal)
    body = (
      <>
        <h1 className="font-display text-title-2 text-ink md:text-title-1">{t('team.payRunNew.tipsTitle')}</h1>
        <p className="mb-6 mt-2 text-body-lg text-muted">{t('team.payRunNew.tipsBody')}</p>
        <SearchInput value={q} onChange={setQ} placeholder={t('team.payRunNew.searchMembers')} className="mb-5 md:max-w-[320px]" />
        {!session && <p className="mb-4 rounded-md bg-warning-subtle px-4 py-3 text-body text-warning">{t('team.payRunNew.registerClosed')}</p>}
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <StatCard label={<LabelWithTip label={t('team.payRunNew.totalTips')} tip={t('team.payRunNew.info.totalTip')} />} value={money(total)} />
          <StatCard label={<LabelWithTip label={t('team.payRunNew.cashInRegisterLabel')} tip={t('team.payRunNew.info.cashTip', { name: register?.name ?? '' })} />} value={money(cashInRegister)} sub={<Remaining value={cashLeft} />} />
          <StatCard label={<LabelWithTip label={t('team.payRunNew.walletBalance')} tip={t('team.payRunNew.info.walletTip')} />} value={money(wallet.available)} sub={<Remaining value={walletLeft} />} />
        </div>
        {listed.length === 0 ? (
          <div className="card">
            <EmptyState title={t('team.payRunNew.noTipsTitle')} body={t('team.payRunNew.noTipsBody', { period: rangeLabel(period.start, period.end) })} />
          </div>
        ) : (
          <div role="table" aria-label={t('team.payRunNew.tipsTitle')}>
            <div role="row" className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 px-4 pb-3 md:grid-cols-[40px_minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(200px,1fr)] md:gap-4 md:px-5">
              <span role="columnheader">
                <TriCheckbox label={t('team.payRunNew.includeAll')} checked={allIncluded} mixed={included.length > 0 && !allIncluded} disabled={includable.length === 0} onChange={(v) => setSelection(v ? includable : [])} />
              </span>
              <span role="columnheader" className="text-body-strong text-ink">{t('team.pay.cols.member')}</span>
              <span role="columnheader" className="text-right text-body-strong text-ink md:text-left">{t('team.payRunNew.unpaidTips')}</span>
              <span role="columnheader" className="hidden text-body-strong text-ink md:block">{t('team.payRunNew.payWith')}</span>
            </div>
            <div className="flex flex-col gap-3">
              {visible.map(({ e, tips }) => (
                <div role="row" key={e.member.id} className="card grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 md:grid-cols-[40px_minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(200px,1fr)] md:gap-4 md:px-5">
                  <span role="cell">
                    <TriCheckbox label={t('team.payRunNew.includeMember', { name: memberName(e.member) })} checked={included.includes(e.member.id)} onChange={(v) => toggle(e.member.id, v)} />
                  </span>
                  <span role="cell" className="flex min-w-0 items-center gap-3">
                    <MemberAvatar member={e.member} size={40} className="md:hidden" />
                    <MemberAvatar member={e.member} size={48} className="hidden md:inline-flex" />
                    <span className="min-w-0">
                      <span className="block break-words text-body-strong text-ink md:truncate">{memberName(e.member)}</span>
                      <span className="block truncate text-small text-muted">{e.member.email}</span>
                    </span>
                  </span>
                  <span role="cell" className="text-right tabular text-body-lg text-ink md:text-left">{money(tips)}</span>
                  {/* Phones: the pay-with select drops onto its own line under the member. */}
                  <span role="cell" className="col-span-2 col-start-2 md:col-span-1 md:col-start-auto">
                    <Select
                      aria-label={t('team.payRunNew.payWithFor', { name: memberName(e.member) })}
                      value={methodOf(e.member.id)}
                      onChange={(ev) => setMethods({ ...methods, [e.member.id]: ev.target.value as PayMethod })}
                      options={(['cash_register', 'wallet'] as const).map((m) => ({ value: m, label: t(`team.pay.methods.${m}`) }))}
                    />
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {(cashShort || walletShort) && included.length > 0 && <p className="mt-4 text-body text-danger">{t(cashShort ? (session ? 'team.payRunNew.errors.notEnoughCash' : 'team.payRunNew.errors.registerClosed') : 'team.payRunNew.errors.notEnoughWallet')}</p>}
      </>
    )
  } else if (membersStep) {
    const kinds = PAY_KINDS.filter((k) => includes.includes(k))
    const cols = `40px minmax(var(--member-col),1.8fr) ${kinds.map(() => 'minmax(84px,1fr)').join(' ')} minmax(84px,1fr) minmax(72px,0.9fr) minmax(84px,1fr)`
    const sum = (f: (r: (typeof includedRows)[number]) => number) => round2(includedRows.reduce((s, r) => s + f(r), 0))
    const otherSum = sum((r) => r.row.earned.other)
    body = (
      <>
        <h1 className="font-display text-title-2 text-ink md:text-title-1">{t('team.payRunNew.summaryTitle')}</h1>
        <p className="mb-6 mt-2 text-body-lg text-muted">{t('team.payRunNew.summaryBody')}</p>
        <div className="card mb-5 flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="text-body text-ink">
            <p>{t('team.payRunNew.periodLabel', { period: rangeLabel(period.start, period.end) })}</p>
            <p>{t('team.payRunNew.membersLabel', { count: included.length })}</p>
          </div>
          <SearchInput value={q} onChange={setQ} placeholder={t('team.pay.searchName')} className="max-w-[460px]" />
        </div>
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-5">
          <StatCard label={<LabelWithTip label={t('team.pay.earnings')} tip={t('team.payRunNew.info.earnings')} />} value={money(round2(sum((r) => r.row.total) - otherSum))} />
          <StatCard label={<LabelWithTip label={t('team.pay.kinds.other')} tip={t('team.payRunNew.info.other')} />} value={money(otherSum)} />
          <StatCard label={<LabelWithTip label={t('team.pay.total')} tip={t('team.payRunNew.info.total')} />} value={money(sum((r) => r.row.total))} />
          <StatCard label={<LabelWithTip label={t('team.pay.paid')} tip={t('team.payRunNew.info.paid')} />} value={money(sum((r) => r.row.paid))} />
          <StatCard label={<LabelWithTip label={t('team.pay.toPay')} tip={t('team.payRunNew.info.toPay')} />} value={money(total)} className="col-span-2 sm:col-span-1" />
        </div>
        {/* Phones: the summary scrolls sideways inside this strip with the member column pinned on the left. */}
        <div className="overflow-x-auto pb-2">
          <div role="table" aria-label={t('team.payRunNew.summaryTitle')} className="min-w-[760px] [--member-col:150px] md:min-w-[860px] md:[--member-col:220px]">
            <div role="row" className="grid items-center gap-3 px-5 pb-3" style={{ gridTemplateColumns: cols }}>
              <span role="columnheader">
                <TriCheckbox label={t('team.payRunNew.includeAll')} checked={allIncluded} mixed={included.length > 0 && !allIncluded} disabled={includable.length === 0} onChange={(v) => setSelection(v ? includable : [])} />
              </span>
              <span role="columnheader" className="text-body-strong text-ink max-md:sticky max-md:left-0 max-md:z-[1] max-md:self-stretch max-md:bg-canvas max-md:py-1">{t('team.pay.cols.member')}</span>
              {kinds.map((k) => (
                <span key={k} role="columnheader" className="text-right text-body-strong text-ink">{t(`team.pay.kinds.${k}`)}</span>
              ))}
              <span role="columnheader" className="text-right text-body-strong text-ink">{t('team.pay.total')}</span>
              <span role="columnheader" className="text-right text-body-strong text-ink">{t('team.pay.paid')}</span>
              <span role="columnheader" className="text-right text-body-strong text-ink">{t('team.pay.toPay')}</span>
            </div>
            <div className="flex flex-col gap-3">
              {visible.length === 0 && <p className="card px-5 py-10 text-center text-body text-muted">{t('team.payRunNew.noMatches')}</p>}
              {visible.map(({ e, row }) => {
                const canInclude = row.toPay > 0
                const name = memberName(e.member)
                return (
                  <div role="row" key={e.member.id} className={clsx('card grid items-center gap-3 px-5 py-4', !canInclude && 'opacity-90')} style={{ gridTemplateColumns: cols }}>
                    <span role="cell" title={canInclude ? undefined : t('team.payRunNew.nothingToPay')}>
                      <TriCheckbox label={t('team.payRunNew.includeMember', { name })} checked={included.includes(e.member.id)} disabled={!canInclude} onChange={(v) => toggle(e.member.id, v)} />
                    </span>
                    <span role="cell" className="flex min-w-0 items-center gap-2 border-r border-line pr-3 max-md:sticky max-md:left-0 max-md:z-[1] max-md:self-stretch max-md:bg-surface md:gap-3">
                      <MemberAvatar member={e.member} size={36} className="md:hidden" />
                      <MemberAvatar member={e.member} size={52} className="hidden md:inline-flex" />
                      <span className="min-w-0">
                        <span className="block break-words text-body-strong text-ink md:truncate">{name}</span>
                        <PortalMenu
                          align="left"
                          groups={[
                            {
                              items: [
                                { label: t('team.pay.viewBreakdown'), onSelect: () => setBreakdown({ id: e.member.id }) },
                                { label: t('team.pay.addAdjustment'), onSelect: () => setAdjustment({ id: e.member.id, kind: kinds[0] ?? 'wages' }) },
                              ],
                            },
                          ]}
                          trigger={({ open, toggle: tog }) => <ActionsPill variant="link" open={open} toggle={tog} label={t('team.common.actions')} />}
                        />
                      </span>
                    </span>
                    {kinds.map((k) => (
                      <span key={k} role="cell" className="text-right">
                        <button type="button" className="tabular text-body text-primary hover:underline" onClick={() => setBreakdown({ id: e.member.id, kind: k })} aria-label={t('team.payRunNew.amountLink', { kind: t(`team.pay.kinds.${k}`), name, amount: money(row.earned[k]) })}>
                          {money(row.earned[k])}
                        </button>
                        {row.original[k] !== row.earned[k] && <span className="block text-small text-muted line-through tabular">{money(row.original[k])}</span>}
                      </span>
                    ))}
                    <span role="cell" className="border-l border-line text-right tabular text-body text-ink">{money(row.total)}</span>
                    <span role="cell" className="text-right tabular text-body text-ink">{money(row.paid)}</span>
                    <span role="cell" className="text-right tabular text-body-strong text-ink">{money(row.toPay)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </>
    )
  } else {
    const groups = (['manual', 'cash_register', 'wallet'] as const).map((m) => ({ m, ls: lines.filter((l) => methodOf(l.teamMemberId) === m) })).filter((g) => g.ls.length)
    body = (
      <div className="mx-auto max-w-5xl">
        <h1 className="font-display text-title-2 text-ink md:text-title-1">{t('team.payRunNew.reviewTitle')}</h1>
        <p className="mb-6 mt-2 text-body-lg text-muted">{t('team.payRunNew.reviewBody')}</p>
        <div className="card p-5 md:p-8">
          <div className="grid gap-8 md:grid-cols-2 md:divide-x md:divide-line">
            <div>
              <div className="flex items-center gap-4">
                <span aria-hidden className="h-16 w-16 shrink-0 rounded-md bg-gradient-to-br from-primary to-accent" />
                <div>
                  <p className="text-body-lg font-semibold text-ink">{payerName}</p>
                  <p className="text-body text-muted">{t('team.payRunNew.available', { amount: money(wallet.available) })}</p>
                </div>
              </div>
              <p className="mt-6 flex justify-between text-body-strong text-ink">
                <span>{t('team.payRunNew.totalLabel')}</span>
                <span className="tabular">{money(total)}</span>
              </p>
              <p className="mt-5 flex justify-between text-body text-ink">
                <span>{t('team.pay.period')}</span>
                <span>{rangeLabel(period.start, period.end)}</span>
              </p>
              <p className="mt-2 flex justify-between text-body text-ink">
                <span>{t('team.pay.cols.date')}</span>
                <span>{fmtDate(todayISO())}</span>
              </p>
            </div>
            <div className="md:pl-8">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-title-3 text-ink">{t('team.payRunNew.method')}</h2>
                <button type="button" className="text-body-strong text-primary hover:underline" onClick={() => setMethodsOpen(true)}>
                  {t('team.common.edit')}
                </button>
              </div>
              {groups.map(({ m, ls }) => (
                <div key={m} className="mt-4 flex justify-between gap-4">
                  <div>
                    <p className="inline-flex items-center gap-1.5 text-body-strong text-ink">
                      {t(`team.payRunNew.methodSummary.${m}`)} <InfoTip text={t(`team.payRunNew.methodModal.${m}Hint`, { amount: money(wallet.available) })} />
                    </p>
                    <p className="text-body text-muted">{t('team.payRunNew.members', { count: ls.length })}</p>
                  </div>
                  <p className="text-body-strong tabular text-ink">{money(round2(ls.reduce((s, l) => s + l.paid, 0)))}</p>
                </div>
              ))}
              {(cashShort || walletShort) && <p className="mt-4 text-small text-danger">{t(cashShort ? (session ? 'team.payRunNew.errors.notEnoughCash' : 'team.payRunNew.errors.registerClosed') : 'team.payRunNew.errors.notEnoughWallet')}</p>}
            </div>
          </div>
          <div className="mt-6 grid items-center gap-6 border-t border-line pt-6 md:mt-8 md:grid-cols-2 md:pt-8">
            <div>
              {note ? (
                <div className="inline-flex max-w-full items-start gap-3 rounded-lg border border-line p-4">
                  <div className="min-w-0">
                    <p className="text-body-strong text-ink">{t('team.pay.note')}</p>
                    <p className="whitespace-pre-wrap break-words text-body text-ink">{note}</p>
                  </div>
                  <Menu align="left" width={160} label={t('team.payRunNew.noteActions')} groups={[{ items: [{ label: t('team.common.edit'), onSelect: () => setNoteOpen(true) }, { label: t('team.common.remove'), danger: true, onSelect: () => setNote('') }] }]} />
                </div>
              ) : (
                <Button className="rounded-full" icon={<NotebookPen size={16} />} onClick={() => setNoteOpen(true)}>
                  {t('team.pay.addNote')}
                </Button>
              )}
            </div>
            <ReviewStatusMenu value={review} onChange={setReview} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <FullscreenFrame progress={step / (steps + 1)} onClose={() => void close()} maxWidth="max-w-6xl" actions={header}>
      {body}
      <NoteModal
        open={noteOpen}
        initial={note}
        onClose={() => setNoteOpen(false)}
        onSave={(v) => {
          setNote(v)
          setNoteOpen(false)
        }}
      />
      <EditPaymentMethodModal
        open={methodsOpen}
        subtitle={payerName}
        rows={includedRows.map((r) => ({ member: r.e.member, amount: tipsMode ? r.tips : r.row.toPay, method: methodOf(r.e.member.id) }))}
        options={tipsMode ? ['cash_register', 'wallet'] : ['manual', 'wallet']}
        available={wallet.available}
        onClose={() => setMethodsOpen(false)}
        onApply={(next) => {
          setMethods({ ...methods, ...next })
          setMethodsOpen(false)
          toast(t('team.payRunNew.toastMethods'))
        }}
      />
      <BreakdownModal memberId={breakdown?.id ?? null} period={period} initialTab={breakdown?.kind ? 'activity' : 'overview'} initialKind={breakdown?.kind} onClose={() => setBreakdown(null)} onAdjust={(id) => { setBreakdown(null); setAdjustment({ id, kind: breakdown?.kind ?? 'wages' }) }} />
      <AdjustmentModal memberId={adjustment?.id ?? null} period={period} initialKind={adjustment?.kind} onClose={() => setAdjustment(null)} />
      <VerificationModal
        open={verifying}
        onCancel={() => setVerifying(false)}
        onSubmit={async (code) => {
          await completePayRun({ ...input(), code }, draftId)
          setVerifying(false)
          toast(t('team.payRunNew.toastCompleted'))
          navigate(tipsMode ? '/sales/register' : '/team/payrun/settlements')
        }}
      />
    </FullscreenFrame>
  )
}

function LabelWithTip({ label, tip }: { label: string; tip: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-ink">
      {label} <InfoTip text={tip} />
    </span>
  )
}

function Remaining({ value }: { value: number }) {
  const { t } = useTranslation()
  return <p className={clsx('mt-2 text-body', value < 0 ? 'text-danger' : 'text-muted')}>{t('team.payRunNew.remaining', { amount: money(value) })}</p>
}
