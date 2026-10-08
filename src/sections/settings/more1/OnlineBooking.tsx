import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { Checkbox, Field, Select, TextArea } from '@/components/ui'
import { saveDynamicAssignment, updateSettings } from '@/api/settings'
import type { Settings } from '@/types'
import { useSettings, useTeamMembers } from '../hooks'
import { EditCard, FormCard, FormStack, SettingsPage, SummaryList } from '../components/ui'
import { FullModal } from '../components/FullModal'
import { useAction, useDraft } from '../components/useAction'
import { MultiSelect, RadioRow, FieldError } from '../scheduling/shared'
import { ADVANCE_DAYS, CANCEL_MINUTES, NOTICE_MINUTES, REASSIGN_CUTOFFS, SLOT_INTERVALS, EMAIL_RE, minutesLabel, periodLabel, withValue } from '../scheduling/options'
import { B, M } from './shared'

const b = { b: <B /> }

// ─── Dynamic assignment (§8) ─────────────────────────────────────────────

const DA = `${M}.dynamic`
type Dynamic = Settings['dynamicAssignment']

/**
 * Members excluded from "Any professional": TeamMember.excludeAutoAssign is
 * what online booking reads (and what the team member form edits), so it is
 * the source of truth for the "Exclude team member" field.
 */
function useExcluded(): string[] {
  const members = useTeamMembers()
  return useMemo(() => members.filter((m) => m.excludeAutoAssign && !m.archived).map((m) => m.id), [members])
}

export function DynamicAssignmentPage() {
  const { t } = useTranslation()
  const da = useSettings().dynamicAssignment
  const excluded = useExcluded()
  const [modal, setModal] = useState<'assign' | 'reassign' | null>(null)
  const assignLine = da.strategy === 'fill' ? t(`${DA}.summary.fill_${da.period}`) : t(`${DA}.summary.${da.strategy}`)
  const reassignItems = [] as { text: ReactNode; key: string }[]
  if (da.reassignOnline) reassignItems.push({ key: 'online', text: t(`${DA}.summary.reassignOnline`) })
  if (da.reassignTeam) reassignItems.push({ key: 'team', text: t(`${DA}.summary.reassignTeam`) })
  if (!da.reassignOnline && !da.reassignTeam) reassignItems.push({ key: 'off', text: t(`${DA}.summary.reassignOff`) })
  else reassignItems.push({ key: 'cutoff', text: <Trans i18nKey={`${DA}.summary.cutoff`} values={{ value: minutesLabel(t, da.cutoffMin) }} components={b} /> })

  return (
    <SettingsPage title={t(`${DA}.title`)} description={t(`${DA}.description`)} learnMore={t('settings.more1.dynamic.title')}>
      <EditCard title={t(`${DA}.assignTitle`)} description={t(`${DA}.assignDescription`)} onEdit={() => setModal('assign')} testId="assign-card">
        <SummaryList
          items={[
            { key: 'strategy', text: assignLine },
            ...(da.prioritizeLast ? [{ key: 'last', text: t(`${DA}.summary.prioritizeLast`) }] : []),
            ...(da.split ? [{ key: 'split', text: t(`${DA}.summary.split`) }] : []),
            ...(excluded.length ? [{ key: 'excluded', text: t(`${DA}.summary.excluded`, { count: excluded.length }) }] : []),
          ]}
        />
      </EditCard>
      <EditCard title={t(`${DA}.reassignTitle`)} description={t(`${DA}.reassignDescription`)} learnMore={t('settings.common.topics.reassignment')} onEdit={() => setModal('reassign')} testId="reassign-card">
        <SummaryList items={reassignItems} />
      </EditCard>
      {modal === 'assign' && <AssignModal onClose={() => setModal(null)} />}
      {modal === 'reassign' && <ReassignModal onClose={() => setModal(null)} />}
    </SettingsPage>
  )
}

function useSaveSettings<T>(apply: (s: Settings, value: T) => void, toastKey: string, onClose: () => void) {
  const { t } = useTranslation()
  const [saving, run] = useAction()
  const save = (value: T) => run(() => updateSettings((s) => apply(s as Settings, value)), t(toastKey), onClose)
  return [saving, save] as const
}

function AssignModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const settings = useSettings()
  const members = useTeamMembers()
  const excluded = useExcluded()
  const [draft, patch] = useDraft<Dynamic>({ ...settings.dynamicAssignment, excluded })
  const [saving, run] = useAction()
  const options = useMemo(() => members.filter((m) => m.bookable && !m.archived).map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}`.trim() })), [members])
  const save = () => void run(() => saveDynamicAssignment(draft), t(`${DA}.saved`), onClose)
  return (
    <FullModal open onClose={onClose} title={t(`${DA}.assignTitle`)} subtitle={t(`${DA}.assignModalText`)} onSave={save} saving={saving} testId="assign-modal">
      <FormStack>
        <FormCard title={t(`${DA}.strategy`)}>
          {(['fill', 'turns', 'ratings', 'priority'] as const).map((v) => (
            <RadioRow key={v} name="assign-strategy" checked={draft.strategy === v} onSelect={() => patch({ strategy: v })} label={<strong>{t(`${DA}.strategies.${v}.label`)}</strong>} hint={t(`${DA}.strategies.${v}.hint`)} testId={`strategy-${v}`}>
              {v === 'fill' && (
                <>
                  <p className="text-body-strong text-ink">{t(`${DA}.period`)}</p>
                  {(['day', '7d', '14d'] as const).map((p) => (
                    <RadioRow key={p} name="assign-period" checked={draft.period === p} onSelect={() => patch({ period: p })} label={t(`${DA}.periods.${p}`)} />
                  ))}
                </>
              )}
            </RadioRow>
          ))}
          <Checkbox checked={draft.prioritizeLast} onChange={(prioritizeLast) => patch({ prioritizeLast })} label={t(`${DA}.prioritizeLast`)} hint={t(`${DA}.prioritizeLastHint`)} />
        </FormCard>
        <FormCard title={t(`${M}.advanced`)}>
          <div>
            <p className="text-body-strong text-ink">{t(`${DA}.exclude`)}</p>
            <p className="mb-2 text-small text-muted">{t(`${DA}.excludeHint`)}</p>
            <MultiSelect options={options} value={draft.excluded} onChange={(next) => patch({ excluded: next })} placeholder={t(`${DA}.selectMembers`)} ariaLabel={t(`${DA}.exclude`)} testId="assign-exclude" />
          </div>
          <Checkbox checked={draft.split} onChange={(split) => patch({ split })} label={t(`${DA}.split`)} hint={t(`${DA}.splitHint`)} />
        </FormCard>
      </FormStack>
    </FullModal>
  )
}

function ReassignModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const settings = useSettings()
  const [draft, patch] = useDraft<Dynamic>(settings.dynamicAssignment)
  const [saving, save] = useSaveSettings<Dynamic>((s, v) => {
    s.dynamicAssignment = { ...v, excluded: s.dynamicAssignment.excluded }
  }, `${DA}.saved`, onClose)
  return (
    <FullModal open onClose={onClose} title={t(`${DA}.reassignTitle`)} subtitle={t(`${DA}.reassignModalText`)} onSave={() => void save(draft)} saving={saving} testId="reassign-modal">
      <FormCard title={t(`${DA}.maximize`)} description={t(`${DA}.maximizeHint`)}>
        <div className="flex flex-col gap-3">
          <p className="text-body-strong text-ink">{t(`${DA}.reassignTypes`)}</p>
          <Checkbox checked={draft.reassignOnline} onChange={(reassignOnline) => patch({ reassignOnline })} label={t(`${DA}.reassignOnline`)} />
          <Checkbox checked={draft.reassignTeam} onChange={(reassignTeam) => patch({ reassignTeam })} label={t(`${DA}.reassignTeam`)} />
        </div>
        <Field label={t(`${DA}.cutoff`)} hint={t(`${DA}.cutoffHint`)}>
          {(id) => (
            <Select
              id={id}
              value={String(draft.cutoffMin)}
              onChange={(e) => patch({ cutoffMin: Number(e.target.value) })}
              options={withValue(REASSIGN_CUTOFFS, draft.cutoffMin).map((m) => ({ value: String(m), label: t(`${DA}.cutoffOption`, { value: minutesLabel(t, m) }) }))}
            />
          )}
        </Field>
      </FormCard>
    </FullModal>
  )
}

// ─── Availability (§9) ───────────────────────────────────────────────────

const AV = `${M}.availability`
type Avail = Settings['availability']
type Optim = Settings['scheduleOptimization']

export function AvailabilityPage() {
  const { t } = useTranslation()
  const settings = useSettings()
  const a = settings.availability
  const o = settings.scheduleOptimization
  const [modal, setModal] = useState<'window' | 'optim' | null>(null)
  const notice = a.minNoticeMin === 0 ? t(`${AV}.immediately`) : t(`${AV}.beforeValue`, { value: minutesLabel(t, a.minNoticeMin) })
  const cancel = a.cancelWindowMin === 0 ? t(`${AV}.anytime`) : t(`${AV}.upToBefore`, { value: minutesLabel(t, a.cancelWindowMin) })
  return (
    <SettingsPage title={t(`${AV}.title`)} description={t(`${AV}.description`)} learnMore={t('settings.more1.availability.online')}>
      <EditCard title={t(`${AV}.windowTitle`)} description={t(`${AV}.windowDescription`)} onEdit={() => setModal('window')} testId="window-card">
        <SummaryList
          items={[
            { key: 'book', text: <Trans i18nKey={`${AV}.summaryBook`} values={{ advance: periodLabel(t, a.advanceDays), notice }} components={b} /> },
            { key: 'cancel', text: <Trans i18nKey={`${AV}.summaryCancel`} values={{ value: cancel }} components={b} /> },
          ]}
        />
      </EditCard>
      <EditCard title={t(`${AV}.optimTitle`)} description={t(`${AV}.optimDescription`)} onEdit={() => setModal('optim')} testId="optim-card">
        <SummaryList
          items={[
            { key: 'interval', text: <Trans i18nKey={`${AV}.summaryInterval`} values={{ value: minutesLabel(t, o.intervalMin) }} components={b} /> },
            { key: 'mode', text: t(`${AV}.summaryMode.${o.mode}`) },
          ]}
        />
      </EditCard>
      {modal === 'window' && <WindowModal onClose={() => setModal(null)} />}
      {modal === 'optim' && <OptimModal onClose={() => setModal(null)} />}
    </SettingsPage>
  )
}

function WindowModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const settings = useSettings()
  const [draft, patch] = useDraft<Avail>(settings.availability)
  const [saving, save] = useSaveSettings<Avail>((s, v) => {
    s.availability = v
  }, `${AV}.saved`, onClose)
  return (
    <FullModal open onClose={onClose} title={t(`${AV}.windowTitle`)} onSave={() => void save(draft)} saving={saving} testId="window-modal">
      <FormStack>
        <FormCard title={t(`${AV}.online`)} description={t(`${AV}.onlineHint`)}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t(`${AV}.canBook`)}>
              {(id) => (
                <Select id={id} value={String(draft.advanceDays)} onChange={(e) => patch({ advanceDays: Number(e.target.value) })} options={withValue(ADVANCE_DAYS, draft.advanceDays).map((d) => ({ value: String(d), label: t(`${AV}.upToAdvance`, { value: periodLabel(t, d) }) }))} data-testid="window-advance" />
              )}
            </Field>
            <Field label={t(`${AV}.noLater`)}>
              {(id) => (
                <Select
                  id={id}
                  value={String(draft.minNoticeMin)}
                  onChange={(e) => patch({ minNoticeMin: Number(e.target.value) })}
                  options={withValue(NOTICE_MINUTES, draft.minNoticeMin).map((m) => ({ value: String(m), label: m === 0 ? t(`${AV}.immediatelyOption`) : t(`${AV}.beforeStart`, { value: minutesLabel(t, m) }) }))}
                  data-testid="window-notice"
                />
              )}
            </Field>
          </div>
        </FormCard>
        <FormCard title={t(`${AV}.cancelTitle`)} description={t(`${AV}.cancelHint`)}>
          <Field label={t(`${AV}.canCancel`)}>
            {(id) => (
              <Select
                id={id}
                value={String(draft.cancelWindowMin)}
                onChange={(e) => patch({ cancelWindowMin: Number(e.target.value) })}
                options={withValue(CANCEL_MINUTES, draft.cancelWindowMin).map((m) => ({ value: String(m), label: m === 0 ? t(`${AV}.anytimeOption`) : t(`${AV}.upToBefore`, { value: minutesLabel(t, m) }) }))}
                data-testid="window-cancel"
              />
            )}
          </Field>
          <Checkbox checked={draft.showContact} onChange={(showContact) => patch({ showContact })} label={t(`${AV}.showContact`)} hint={t(`${AV}.showContactHint`)} />
        </FormCard>
      </FormStack>
    </FullModal>
  )
}

function OptimModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const settings = useSettings()
  const [draft, patch] = useDraft<Optim>(settings.scheduleOptimization)
  const [saving, save] = useSaveSettings<Optim>((s, v) => {
    s.scheduleOptimization = v
  }, `${AV}.optimSaved`, onClose)
  return (
    <FullModal open onClose={onClose} title={t(`${AV}.optimTitle`)} subtitle={t(`${AV}.optimDescription`)} onSave={() => void save(draft)} saving={saving} testId="optim-modal">
      <FormStack>
        <FormCard>
          <Field label={t(`${AV}.interval`)}>
            {(id) => (
              <Select
                id={id}
                value={String(draft.intervalMin)}
                onChange={(e) => patch({ intervalMin: Number(e.target.value) })}
                options={withValue(SLOT_INTERVALS, draft.intervalMin).map((m) => ({ value: String(m), label: m === 5 ? t(`${AV}.intervalMax`, { value: minutesLabel(t, m) }) : minutesLabel(t, m) }))}
                data-testid="optim-interval"
              />
            )}
          </Field>
        </FormCard>
        <FormCard title={t(`${AV}.intelligent`)} description={t(`${AV}.intelligentHint`)}>
          {(['regular', 'reduce', 'eliminate'] as const).map((v) => (
            <RadioRow
              key={v}
              name="optim-mode"
              checked={draft.mode === v}
              onSelect={() => patch({ mode: v })}
              label={<strong>{t(`${AV}.modes.${v}.label`)}</strong>}
              badge={v === 'regular' ? <span className="chip bg-success-subtle text-success">{t(`${AV}.maxAvailability`)}</span> : undefined}
              hint={t(`${AV}.modes.${v}.hint`)}
              testId={`optim-${v}`}
            />
          ))}
        </FormCard>
      </FormStack>
    </FullModal>
  )
}

// ─── Booking options (§10) ───────────────────────────────────────────────

const BO = `${M}.booking`
type Booking = Settings['bookingOptions']
type BookingModal = 'team' | 'menu' | 'group' | 'info' | 'email'

export function BookingOptionsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const settings = useSettings()
  const o = settings.bookingOptions
  const [modal, setModal] = useState<BookingModal | null>(null)
  const line = (key: string, on: boolean) => ({ key, on, text: t(`${BO}.summary.${key}_${on ? 'on' : 'off'}`) })
  return (
    <SettingsPage title={t(`${BO}.title`)} description={t(`${BO}.description`)} learnMore={t('settings.more1.booking.title')}>
      <EditCard title={t(`${BO}.teamTitle`)} description={t(`${BO}.teamDescription`)} onEdit={() => setModal('team')} testId="booking-team">
        <SummaryList items={[line('bookSpecific', o.bookSpecific), line('profiles', o.showProfiles), line('portfolio', o.showPortfolio), line('ratings', o.showRatings), line('gender', o.bookByGender)]} />
      </EditCard>
      <EditCard title={t(`${BO}.menuTitle`)} description={t(`${BO}.menuDescription`)} onEdit={() => setModal('menu')} testId="booking-menu">
        <SummaryList items={[line('images', o.serviceImages), line('featured', o.featured), line('reviews', o.serviceNamesInReviews)]} />
      </EditCard>
      <EditCard title={t(`${BO}.groupTitle`)} description={t(`${BO}.groupDescription`)} onEdit={() => setModal('group')} testId="booking-group">
        <SummaryList items={[line('group', o.groupBooking)]} />
      </EditCard>
      <EditCard title={t(`${BO}.upsellTitle`)} description={t(`${BO}.upsellDescription`)} testId="booking-upsell">
        {settings.onlineBookingsEnabled ? (
          <SummaryList items={[{ key: 'upsell', text: t(`${BO}.upsellOn`) }]} />
        ) : (
          <p className="text-body text-muted">
            {t(`${BO}.upsellOff`)}{' '}
            <button type="button" className="text-body-strong text-primary hover:underline" onClick={() => navigate('/online-presence/locations')}>
              {t(`${BO}.setUp`)}
            </button>
          </p>
        )}
      </EditCard>
      <EditCard title={t(`${BO}.infoTitle`)} description={t(`${BO}.infoDescription`)} onEdit={() => setModal('info')} editLabel={o.importantInfo ? undefined : t('settings.common.add')} testId="booking-info">
        {o.importantInfo ? <p className="whitespace-pre-line text-body text-ink">{o.importantInfo}</p> : null}
      </EditCard>
      <EditCard title={t(`${BO}.emailTitle`)} description={t(`${BO}.emailDescription`)} onEdit={() => setModal('email')} testId="booking-email">
        <SummaryList
          items={[
            ...(o.emailBooked ? [{ key: 'booked', text: t(`${BO}.summary.emailBooked`) }] : []),
            ...(o.emailAddresses ? [{ key: 'addr', text: <Trans i18nKey={`${BO}.summary.emailAddresses`} values={{ value: o.emailAddresses }} components={b} /> }] : []),
            ...(!o.emailBooked && !o.emailAddresses ? [{ key: 'none', text: t(`${BO}.summary.emailNone`) }] : []),
          ]}
        />
      </EditCard>
      {modal && <BookingOptionsModal kind={modal} onClose={() => setModal(null)} />}
    </SettingsPage>
  )
}

function BookingOptionsModal({ kind, onClose }: { kind: BookingModal; onClose: () => void }) {
  const { t } = useTranslation()
  const settings = useSettings()
  const [draft, patch] = useDraft<Booking>(settings.bookingOptions)
  const [emailsOn, setEmailsOn] = useState(!!settings.bookingOptions.emailAddresses)
  const [saving, save] = useSaveSettings<Booking>((s, v) => {
    s.bookingOptions = v
  }, `${BO}.saved`, onClose)
  const emails = draft.emailAddresses
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
  const emailError = kind === 'email' && emailsOn && (emails.length === 0 || emails.some((e) => !EMAIL_RE.test(e))) ? t(`${BO}.emailInvalid`) : undefined
  const submit = () => {
    if (emailError) return
    void save(kind === 'email' ? { ...draft, emailAddresses: emailsOn ? emails.join(', ') : '' } : { ...draft, importantInfo: draft.importantInfo.trim() })
  }
  const titles: Record<BookingModal, string> = { team: `${BO}.teamTitle`, menu: `${BO}.menuTitle`, group: `${BO}.groupTitle`, info: `${BO}.infoTitle`, email: `${BO}.emailTitle` }
  const descriptions: Record<BookingModal, string> = { team: `${BO}.teamDescription`, menu: `${BO}.menuDescription`, group: `${BO}.groupDescription`, info: `${BO}.infoDescription`, email: `${BO}.emailDescription` }
  const box = (key: keyof Booking, label: string) => (
    <Checkbox checked={draft[key] as boolean} onChange={(v) => patch({ [key]: v } as Partial<Booking>)} label={t(`${BO}.opts.${label}.label`)} hint={t(`${BO}.opts.${label}.hint`)} />
  )
  return (
    <FullModal open onClose={onClose} title={t(titles[kind])} subtitle={t(descriptions[kind])} onSave={submit} saving={saving} saveDisabled={!!emailError} testId="booking-modal">
      <FormCard>
        {kind === 'team' && (
          <>
            {box('bookSpecific', 'bookSpecific')}
            {box('showProfiles', 'profiles')}
            {box('showPortfolio', 'portfolio')}
            {draft.showPortfolio && <p className="ml-8 text-small text-muted">{t(`${BO}.portfolioOf`)}</p>}
            {box('showRatings', 'ratings')}
            {box('bookByGender', 'gender')}
          </>
        )}
        {kind === 'menu' && (
          <>
            {box('serviceImages', 'images')}
            {box('featured', 'featured')}
            {box('serviceNamesInReviews', 'reviews')}
          </>
        )}
        {kind === 'group' && box('groupBooking', 'group')}
        {kind === 'info' && (
          <Field label={t(`${BO}.infoTitle`)} counter={{ value: draft.importantInfo.length, max: 1000 }}>
            {(id) => <TextArea id={id} value={draft.importantInfo} maxLength={1000} placeholder={t(`${BO}.infoPlaceholder`)} onChange={(e) => patch({ importantInfo: e.target.value })} data-testid="booking-info-text" />}
          </Field>
        )}
        {kind === 'email' && (
          <>
            <Checkbox checked={draft.emailBooked} onChange={(emailBooked) => patch({ emailBooked })} label={t(`${BO}.emailBooked`)} />
            <Checkbox checked={emailsOn} onChange={setEmailsOn} label={t(`${BO}.emailSpecific`)} />
            {emailsOn && (
              <div className="ml-8">
                <Field label={t(`${BO}.customEmails`)} hint={t(`${BO}.customEmailsHint`)}>
                  {(id) => <TextArea id={id} className="min-h-[72px]" value={draft.emailAddresses} invalid={!!emailError} placeholder={t(`${BO}.customEmailsPlaceholder`)} onChange={(e) => patch({ emailAddresses: e.target.value })} data-testid="booking-emails" />}
                </Field>
                <FieldError>{emailError}</FieldError>
              </div>
            )}
          </>
        )}
      </FormCard>
    </FullModal>
  )
}
