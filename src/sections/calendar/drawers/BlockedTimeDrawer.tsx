import clsx from 'clsx'
import { format, parseISO } from 'date-fns'
import { Apple, ArrowLeft, ArrowRight, Car, Clock, Dog, Flag, Hash, Lightbulb, Pencil, Plus, Search, Smile, Trash2, Volleyball } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Avatar, Button, Checkbox, EmptyState, Field, Select, TextArea, TextInput, confirm, toast } from '@/components/ui'
import type { DrawerProps } from '@/app/sectionRegistry'
import { deleteBlockedTime, saveBlockedTime } from '@/api/appointments'
import { createBlockedTimeType, setBlockedTimeRepeat } from '@/api/calendar'
import { updateExt, useExt } from '@/api/ext'
import { useDb } from '@/store/db'
import { useDismiss } from '@/lib/useDismiss'
import { durationLabel, todayISO, toClock, toMinutes } from '@/lib/time'
import type { BlockedTimeType, ID, ISODate, RepeatRule } from '@/types'
import { useCalendarParams, useLocationMembers } from '../hooks'
import { addDaysISO, clockOptions, durationChoices, durationWords, memberName } from '../lib'
import { NO_REPEAT, useCalendarUi } from '../store'
import { Dropdown, DropMenu, FullScreen, MonthsPicker, useEscapeFirst } from '../ui'
import { DEFAULT_FREQUENT, EMOJI, EMOJI_CATEGORIES, emojiName, type EmojiCategory } from './emoji'
import { DrawerShell, RoundButton, SelectButton } from './Shell'

interface Form {
  typeId: string
  title: string
  date: ISODate
  start: string
  end: string
  member: ID
  repeat: RepeatRule
  description: string
  online: boolean
}

const TIMES = clockOptions(5)
const END_TIMES = [...clockOptions(5, 5), '23:59']
const ENDS_AFTER = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 25, 30]

/** "Add blocked time" / "Edit Blocked time" (calendar.md §13). */
export function BlockedTimeDrawer({ id, params, close }: DrawerProps) {
  const { t } = useTranslation()
  const existing = useDb((s) => (id ? s.blockedTimes.find((b) => b.id === id) : undefined))
  if (id && !existing) {
    return (
      <DrawerShell title={t('calendar.blocked.editTitle')}>
        <EmptyState title={t('calendar.drawer.notFound')} body={t('calendar.blocked.notFound')} />
      </DrawerShell>
    )
  }
  return <BlockedTimeForm key={id ?? 'new'} params={params} close={close} />
}

function BlockedTimeForm({ params, close }: { params: URLSearchParams; close: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { locationId: calendarLocation } = useCalendarParams()
  const id = params.get('id')
  const existing = useDb((s) => (id ? s.blockedTimes.find((b) => b.id === id) : undefined))
  const types = useDb((s) => s.blockedTimeTypes)
  const locationId = existing?.locationId ?? calendarLocation
  const members = useLocationMembers(locationId)
  const setPreview = useCalendarUi((s) => s.setBlockedPreview)

  const initial = useMemo<Form>(() => {
    if (existing)
      return {
        typeId: existing.typeId ?? '',
        title: existing.title,
        date: existing.date,
        start: existing.start,
        end: existing.end,
        member: existing.teamMemberId,
        repeat: existing.repeat ?? NO_REPEAT,
        description: existing.description,
        online: existing.onlineBookingAllowed,
      }
    const start = params.get('d_time') ?? '09:00'
    return {
      typeId: '',
      title: '',
      date: params.get('d_date') ?? todayISO(),
      start,
      end: toClock(Math.min(1439, toMinutes(start) + 15)),
      member: params.get('d_member') ?? members[0]?.id ?? '',
      repeat: NO_REPEAT,
      description: '',
      online: false,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [form, setForm] = useState<Form>(initial)
  const [busy, setBusy] = useState(false)
  const [typeModal, setTypeModal] = useState(false)
  const type = types.find((x) => x.id === form.typeId)
  const minutes = toMinutes(form.end) - toMinutes(form.start)
  const invalidTime = minutes <= 0
  const invalidRepeat = form.repeat.frequency !== 'none' && form.repeat.ends === 'on' && (!form.repeat.until || form.repeat.until <= form.date)
  const changed = JSON.stringify(form) !== JSON.stringify(initial)
  const label = form.title.trim() || (type ? `${type.name} ${type.emoji}` : t('calendar.blocked.title'))

  // Draw the block on the grid while the drawer is open.
  useEffect(() => {
    setPreview(form.member ? { date: form.date, locationId, teamMemberId: form.member, start: form.start, end: invalidTime ? toClock(toMinutes(form.start) + 15) : form.end, label, replaceId: existing?.id } : null)
  }, [form.date, form.member, form.start, form.end, label, locationId, existing?.id, invalidTime, setPreview])
  useEffect(() => () => setPreview(null), [setPreview])

  const patch = (values: Partial<Form>) => setForm((f) => ({ ...f, ...values }))
  const chooseType = (next: BlockedTimeType | null) =>
    setForm((f) => ({ ...f, typeId: next?.id ?? '', title: next ? '' : f.title, end: next ? toClock(Math.min(1439, toMinutes(f.start) + next.durationMin)) : f.end }))
  const setStart = (start: string) => setForm((f) => ({ ...f, start, end: toClock(Math.min(1439, toMinutes(start) + Math.max(5, toMinutes(f.end) - toMinutes(f.start)))) }))

  const save = async () => {
    if (invalidTime || invalidRepeat || !form.member) return
    setBusy(true)
    try {
      const fields = {
        teamMemberId: form.member,
        locationId,
        date: form.date,
        start: form.start,
        end: form.end,
        typeId: form.typeId || undefined,
        title: form.typeId ? '' : form.title.trim(),
        description: form.description.trim(),
        onlineBookingAllowed: form.online,
      }
      if (existing) {
        await saveBlockedTime({ ...fields, id: existing.id, repeat: existing.repeat })
        if (JSON.stringify(form.repeat) !== JSON.stringify(initial.repeat)) await setBlockedTimeRepeat(existing.id, form.repeat)
        toast(t('calendar.toasts.blockedUpdated'))
      } else {
        await saveBlockedTime({ ...fields, repeat: form.repeat.frequency !== 'none' ? form.repeat : undefined })
        toast(t('calendar.toasts.blockedAdded'))
      }
      close()
    } catch (err) {
      toast(err instanceof Error ? err.message : t('calendar.toasts.error'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!existing) return
    if (!(await confirm({ title: t('calendar.blocked.deleteTitle'), body: t('calendar.blocked.deleteBody'), confirmLabel: t('calendar.blocked.delete'), tone: 'danger' }))) return
    setBusy(true)
    try {
      await deleteBlockedTime(existing.id)
      toast(t('calendar.toasts.blockedDeleted'))
      close()
    } finally {
      setBusy(false)
    }
  }

  const member = members.find((m) => m.id === form.member)

  return (
    <DrawerShell
      testId="blocked-time-drawer"
      title={t(existing ? 'calendar.blocked.editTitle' : 'calendar.blocked.addTitle')}
      headerRight={
        <DropMenu
          align="right"
          width={240}
          trigger={({ open, toggle }) => <RoundButton size={44} onClick={toggle} aria-expanded={open} aria-label={t('calendar.blocked.actions')} data-testid="blocked-actions" />}
          groups={[
            {
              items: [
                { label: t('calendar.blocked.addType'), onSelect: () => setTypeModal(true) },
                { label: t('calendar.blocked.settings'), onSelect: () => navigate('/setup/scheduling/blocked-time-types') },
              ],
            },
          ]}
        />
      }
      footer={
        <>
          {existing && (
            <RoundButton onClick={() => void remove()} aria-label={t('calendar.blocked.delete')} title={t('calendar.blocked.delete')} className="!text-danger" disabled={busy} data-testid="blocked-delete">
              <Trash2 size={20} aria-hidden />
            </RoundButton>
          )}
          <Button variant="primary" size="lg" className="flex-1 rounded-full" disabled={invalidTime || invalidRepeat || !form.member || (Boolean(existing) && !changed)} loading={busy} onClick={() => void save()} data-testid="blocked-save">
            {t('calendar.blocked.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <div>
          <p className="mb-3 text-body-strong text-ink">{t('calendar.blocked.type')}</p>
          <TypeCarousel types={types} value={form.typeId} onChoose={chooseType} onNew={() => setTypeModal(true)} />
        </div>
        {!form.typeId && (
          <Field label={t('calendar.blocked.titleField')} optional>
            {(fid) => <TextInput id={fid} value={form.title} maxLength={60} placeholder={t('calendar.blocked.titlePlaceholder')} onChange={(e) => patch({ title: e.target.value })} data-testid="blocked-title" />}
          </Field>
        )}
        <Field label={t('calendar.blocked.date')}>
          {(fid) => (
            <Dropdown
              className="w-full"
              trigger={({ open, toggle }) => (
                <SelectButton id={fid} open={open} onClick={toggle} className="w-full" data-testid="blocked-date">
                  {format(parseISO(form.date), 'EEE, MMM d')}
                </SelectButton>
              )}
              panelClassName="p-5"
            >
              {(closeMenu) => (
                <MonthsPicker
                  months={1}
                  value={form.date}
                  onSelect={(date) => {
                    patch({ date })
                    closeMenu()
                  }}
                />
              )}
            </Dropdown>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('calendar.blocked.start')}>{(fid) => <Select id={fid} value={form.start} onChange={(e) => setStart(e.target.value)} options={TIMES} data-testid="blocked-start" />}</Field>
          <Field label={t('calendar.blocked.end')} error={invalidTime ? t('calendar.blocked.endError') : undefined} hint={t('calendar.blocked.duration', { duration: durationLabel(Math.max(0, minutes)) })}>
            {(fid) => <Select id={fid} value={form.end} onChange={(e) => patch({ end: e.target.value })} options={END_TIMES.map((x) => ({ value: x, label: x === '23:59' ? '24:00' : x }))} data-testid="blocked-end" />}
          </Field>
        </div>
        <Field label={t('calendar.blocked.member')}>
          {(fid) => (
            <Dropdown
              className="w-full"
              trigger={({ open, toggle }) => (
                <SelectButton id={fid} open={open} onClick={toggle} className="h-14 w-full" data-testid="blocked-member">
                  <span className="flex items-center gap-3">
                    {member && <Avatar name={memberName(member)} color={member.color} size={32} />}
                    {memberName(member)}
                  </span>
                </SelectButton>
              )}
              panelClassName="max-h-72 w-full overflow-y-auto p-1.5"
            >
              {(closeMenu) => (
                <div role="listbox" className="w-full">
                  {members.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      role="option"
                      aria-selected={m.id === form.member}
                      onClick={() => {
                        patch({ member: m.id })
                        closeMenu()
                      }}
                      className={clsx('flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-body', m.id === form.member ? 'bg-primary-subtle text-ink' : 'text-ink hover:bg-sunken')}
                    >
                      <Avatar name={memberName(m)} color={m.color} size={28} />
                      {memberName(m)}
                    </button>
                  ))}
                </div>
              )}
            </Dropdown>
          )}
        </Field>
        <FrequencyFields value={form.repeat} date={form.date} onChange={(repeat) => patch({ repeat })} invalidUntil={invalidRepeat} />
        <Field label={t('calendar.blocked.description')} optional counter={{ value: form.description.length, max: 255 }}>
          {(fid) => <TextArea id={fid} maxLength={255} value={form.description} onChange={(e) => patch({ description: e.target.value })} />}
        </Field>
        <Checkbox checked={form.online} onChange={(online) => patch({ online })} label={t('calendar.blocked.online')} />
      </div>
      <BlockedTypeModal
        open={typeModal}
        onClose={() => setTypeModal(false)}
        onCreated={(created) => {
          setTypeModal(false)
          chooseType(created)
        }}
      />
    </DrawerShell>
  )
}

/** Horizontal cards: Custom, each blocked time type, + New type, with ‹ › paging. */
function TypeCarousel({ types, value, onChoose, onNew }: { types: BlockedTimeType[]; value: string; onChoose: (type: BlockedTimeType | null) => void; onNew: () => void }) {
  const { t } = useTranslation()
  const scroller = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: false })
  const update = () => {
    const el = scroller.current
    if (!el) return
    setEdges({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 })
  }
  useEffect(update, [types.length])
  // Keep the chosen card in view (e.g. a type just created).
  useEffect(() => {
    scroller.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [value])
  const page = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * 230, behavior: 'smooth' })
  const card = (key: string, checked: boolean, icon: ReactNode, title: string, hint: string, onClick: () => void, role: 'radio' | 'button' = 'radio') => (
    <button
      key={key}
      type="button"
      role={role}
      aria-checked={role === 'radio' ? checked : undefined}
      onClick={onClick}
      className={clsx('flex h-[150px] w-[200px] shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-xl border bg-surface px-3 text-center transition-colors', checked ? 'border-2 border-primary' : 'border-line hover:bg-sunken')}
      data-testid={`blocked-type-${key}`}
    >
      <span className="mb-1 flex h-9 items-center text-[28px] leading-none text-ink">{icon}</span>
      <span className="text-body-strong text-ink">{title}</span>
      <span className="text-small text-muted">{hint}</span>
    </button>
  )
  return (
    <div className="relative">
      <div ref={scroller} onScroll={update} className="flex snap-x gap-4 overflow-x-auto pb-1 [scrollbar-width:none]" role="radiogroup" aria-label={t('calendar.blocked.type')}>
        {card('custom', !value, <Pencil size={24} aria-hidden />, t('calendar.blocked.custom'), t('calendar.blocked.customHint'), () => onChoose(null))}
        {types.map((type) =>
          card(type.id, value === type.id, <span aria-hidden>{type.emoji}</span>, type.name, `${durationLabel(type.durationMin)} • ${t(type.paid ? 'calendar.blocked.paid' : 'calendar.blocked.unpaid')}`, () => onChoose(type)),
        )}
        {card('new', false, <Plus size={24} aria-hidden />, t('calendar.blocked.newType'), t('calendar.blocked.newTypeHint'), onNew, 'button')}
      </div>
      {!edges.start && (
        <button type="button" onClick={() => page(-1)} aria-label={t('calendar.blocked.prev')} className="absolute -left-5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface shadow-md hover:bg-sunken">
          <ArrowLeft size={20} aria-hidden />
        </button>
      )}
      {!edges.end && (
        <button type="button" onClick={() => page(1)} aria-label={t('calendar.blocked.next')} className="absolute -right-5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface shadow-md hover:bg-sunken">
          <ArrowRight size={20} aria-hidden />
        </button>
      )}
    </div>
  )
}

/** Frequency select (as appointments) with Every [n][unit] for Custom and Ends when repeating. */
function FrequencyFields({ value, date, onChange, invalidUntil }: { value: RepeatRule; date: ISODate; onChange: (rule: RepeatRule) => void; invalidUntil: boolean }) {
  const { t } = useTranslation()
  const endsValue = value.ends === 'after' ? `after_${value.count ?? 2}` : value.ends
  const setEnds = (v: string) => {
    if (v === 'never') onChange({ ...value, ends: 'never', count: undefined, until: undefined })
    else if (v === 'on') onChange({ ...value, ends: 'on', count: undefined, until: value.until ?? addDaysISO(date, 28) })
    else onChange({ ...value, ends: 'after', count: Number(v.split('_')[1]), until: undefined })
  }
  return (
    <div className="flex flex-col gap-4">
      <Field label={t('calendar.blocked.frequency')}>
        {(fid) => (
          <Select
            id={fid}
            value={value.frequency}
            onChange={(e) => onChange({ ...value, frequency: e.target.value as RepeatRule['frequency'], interval: value.interval || 1 })}
            options={(['none', 'daily', 'weekly', 'monthly', 'custom'] as const).map((f) => ({ value: f, label: t(`calendar.repeat.freq.${f}`) }))}
            data-testid="blocked-frequency"
          />
        )}
      </Field>
      {value.frequency === 'custom' && (
        <div>
          <span className="label">{t('calendar.repeat.every')}</span>
          <div className="grid grid-cols-[110px_1fr] gap-3">
            <TextInput type="number" min={1} max={52} aria-label={t('calendar.repeat.interval')} value={value.interval} onChange={(e) => onChange({ ...value, interval: Math.max(1, Math.min(52, Number(e.target.value) || 1)) })} />
            <Select aria-label={t('calendar.repeat.unit')} value={value.unit} onChange={(e) => onChange({ ...value, unit: e.target.value as RepeatRule['unit'] })} options={(['day', 'week', 'month'] as const).map((u) => ({ value: u, label: t(`calendar.repeat.units.${u}`) }))} />
          </div>
        </div>
      )}
      {value.frequency !== 'none' && (
        <Field label={t('calendar.repeat.ends')}>
          {(fid) => (
            <Select
              id={fid}
              value={endsValue}
              onChange={(e) => setEnds(e.target.value)}
              options={[{ value: 'never', label: t('calendar.repeat.never') }, ...ENDS_AFTER.map((n) => ({ value: `after_${n}`, label: t('calendar.repeat.after', { count: n }) })), { value: 'on', label: t('calendar.repeat.specificDate') }]}
            />
          )}
        </Field>
      )}
      {value.frequency !== 'none' && value.ends === 'on' && (
        <Field label={t('calendar.repeat.endDate')} error={invalidUntil ? t('calendar.repeat.endDateError') : undefined}>
          {(fid) => <TextInput id={fid} type="date" min={addDaysISO(date, 1)} value={value.until ?? ''} onChange={(e) => onChange({ ...value, until: e.target.value })} invalid={invalidUntil} />}
        </Field>
      )}
    </div>
  )
}

const TYPE_DURATIONS = durationChoices().filter((m) => m <= 480)

/** "Add a blocked time type": emoji, name, duration and compensation. */
function BlockedTypeModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (type: BlockedTimeType) => void }) {
  const { t } = useTranslation()
  const [emoji, setEmoji] = useState('')
  const [name, setName] = useState('')
  const [duration, setDuration] = useState(60)
  const [paid, setPaid] = useState(true)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [picker, setPicker] = useState(false)
  const [openFor, setOpenFor] = useState(false)
  if (open !== openFor) {
    setOpenFor(open)
    if (open) {
      setEmoji('')
      setName('')
      setDuration(60)
      setPaid(true)
      setTouched(false)
      setPicker(false)
    }
  }
  const nameError = touched && !name.trim() ? t('calendar.blocked.typeModal.nameError') : undefined
  const save = async () => {
    setTouched(true)
    if (!name.trim()) return
    setBusy(true)
    try {
      const created = await createBlockedTimeType({ emoji: emoji || '🕒', name: name.trim(), durationMin: duration, paid })
      toast(t('calendar.toasts.typeAdded'))
      onCreated(created)
    } catch (err) {
      toast(err instanceof Error ? err.message : t('calendar.toasts.error'), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <FullScreen
      open={open}
      onClose={onClose}
      narrow
      label={t('calendar.blocked.typeModal.title')}
      closeLabel={t('calendar.blocked.typeModal.close')}
      actions={
        <Button variant="primary" className="rounded-full" loading={busy} onClick={() => void save()} data-testid="blocked-type-save">
          {t('calendar.blocked.typeModal.save')}
        </Button>
      }
    >
      <h1 className="font-display text-[44px] font-bold leading-[52px] text-ink">{t('calendar.blocked.typeModal.title')}</h1>
      <p className="mt-2 text-body-lg text-muted">{t('calendar.blocked.typeModal.subtitle')}</p>
      <div className="mt-10 flex flex-col gap-6">
        <Field label={t('calendar.blocked.typeModal.type')} error={nameError}>
          {(fid) => (
            <div className="relative flex gap-3">
              <button
                type="button"
                onClick={() => setPicker((p) => !p)}
                aria-label={t('calendar.blocked.typeModal.chooseEmoji')}
                title={t('calendar.blocked.typeModal.chooseEmoji')}
                aria-expanded={picker}
                className="flex h-11 w-12 shrink-0 items-center justify-center rounded-sm border border-line-strong bg-surface text-[22px] hover:bg-sunken"
                data-testid="emoji-button"
              >
                {emoji || <Smile size={20} aria-hidden />}
              </button>
              <TextInput id={fid} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={t('calendar.blocked.typeModal.placeholder')} invalid={Boolean(nameError)} className="flex-1" data-testid="blocked-type-name" />
              {picker && (
                <EmojiPicker
                  onPick={(char) => {
                    setEmoji(char)
                    setPicker(false)
                  }}
                  onClose={() => setPicker(false)}
                />
              )}
            </div>
          )}
        </Field>
        <Field label={t('calendar.blocked.typeModal.duration')}>
          {(fid) => <Select id={fid} value={String(duration)} onChange={(e) => setDuration(Number(e.target.value))} options={TYPE_DURATIONS.map((m) => ({ value: String(m), label: durationWords(m) }))} data-testid="blocked-type-duration" />}
        </Field>
        <Field label={t('calendar.blocked.typeModal.compensation')}>
          {(fid) => (
            <Select
              id={fid}
              value={paid ? 'paid' : 'unpaid'}
              onChange={(e) => setPaid(e.target.value === 'paid')}
              options={[
                { value: 'paid', label: t('calendar.blocked.typeModal.paid') },
                { value: 'unpaid', label: t('calendar.blocked.typeModal.unpaid') },
              ]}
            />
          )}
        </Field>
      </div>
    </FullScreen>
  )
}

const TAB_ICONS: Record<'frequent' | EmojiCategory, ReactNode> = {
  frequent: <Clock size={20} />,
  people: <Smile size={20} />,
  nature: <Dog size={20} />,
  food: <Apple size={20} />,
  activity: <Volleyball size={20} />,
  travel: <Car size={20} />,
  objects: <Lightbulb size={20} />,
  symbols: <Hash size={20} />,
  flags: <Flag size={20} />,
}

/** Emoji picker: category tabs, search, sections and a preview line. */
function EmojiPicker({ onPick, onClose }: { onPick: (char: string) => void; onClose: () => void }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const refs = useMemo(() => [ref], [])
  useDismiss(refs, true, onClose)
  useEscapeFirst(true, onClose)
  const recent = useExt<string[]>('calendar', 'recentEmoji', [])
  const [query, setQuery] = useState('')
  const [hovered, setHovered] = useState<string | null>(null)
  const [active, setActive] = useState<'frequent' | EmojiCategory>('frequent')
  const frequent = [...new Set([...recent, ...DEFAULT_FREQUENT])].slice(0, 9)
  const q = query.trim().toLowerCase()
  const sections: { key: 'frequent' | EmojiCategory; chars: string[] }[] = q
    ? [{ key: 'people', chars: EMOJI_CATEGORIES.flatMap((c) => EMOJI[c].filter((e) => e.name.includes(q)).map((e) => e.char)) }]
    : [{ key: 'frequent', chars: frequent }, ...EMOJI_CATEGORIES.map((c) => ({ key: c, chars: EMOJI[c].map((e) => e.char) }))]
  const pick = (char: string) => {
    updateExt<string[]>('calendar', 'recentEmoji', [], (cur) => [char, ...cur.filter((c) => c !== char)].slice(0, 9))
    onPick(char)
  }
  const jump = (key: 'frequent' | EmojiCategory) => {
    setQuery('')
    setActive(key)
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-section="${key}"]`)?.scrollIntoView({ block: 'start' }))
  }
  return (
    <div ref={ref} data-dropdown-open className="absolute left-0 top-full z-[60] mt-2 w-[620px] max-w-[calc(100vw-48px)] overflow-hidden rounded-xl border border-line bg-raised shadow-lg" role="dialog" aria-label={t('calendar.blocked.typeModal.chooseEmoji')} data-testid="emoji-picker">
      <div className="flex items-center justify-between gap-1 border-b border-line px-3" role="tablist">
        {(['frequent', ...EMOJI_CATEGORIES] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active === key && !q}
            onClick={() => jump(key)}
            aria-label={t(`calendar.blocked.emoji.categories.${key}`)}
            title={t(`calendar.blocked.emoji.categories.${key}`)}
            className={clsx('-mb-px flex h-12 w-12 items-center justify-center border-b-2', active === key && !q ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink')}
          >
            {TAB_ICONS[key]}
          </button>
        ))}
      </div>
      <div className="p-3">
        <label className="relative block">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('calendar.blocked.emoji.search')} aria-label={t('calendar.blocked.emoji.search')} className="input h-10 border-transparent bg-sunken pl-9" data-testid="emoji-search" />
        </label>
      </div>
      <div
        ref={listRef}
        className="h-[300px] overflow-y-auto px-3 pb-3"
        onScroll={(e) => {
          if (q) return
          const top = e.currentTarget.scrollTop
          const found = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-section]')].filter((el) => el.offsetTop - e.currentTarget.offsetTop <= top + 8).pop()
          if (found) setActive(found.dataset.section as 'frequent' | EmojiCategory)
        }}
      >
        {sections.map((section) => (
          <section key={section.key} data-section={section.key}>
            {!q && <h4 className="px-1 pb-1 pt-2 text-body-strong text-ink">{t(`calendar.blocked.emoji.categories.${section.key}`)}</h4>}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(40px,1fr))]">
              {section.chars.map((char) => (
                <button
                  key={`${section.key}-${char}`}
                  type="button"
                  onClick={() => pick(char)}
                  onMouseEnter={() => setHovered(char)}
                  onFocus={() => setHovered(char)}
                  aria-label={emojiName(char) || char}
                  className="flex h-10 w-10 items-center justify-center rounded-md text-[24px] hover:bg-sunken"
                >
                  {char}
                </button>
              ))}
            </div>
            {q && !section.chars.length && <p className="px-1 py-6 text-center text-body text-muted">{t('calendar.blocked.emoji.noResults')}</p>}
          </section>
        ))}
      </div>
      <div className="flex h-16 items-center gap-3 border-t border-line px-4">
        <span className="text-[32px] leading-none">{hovered ?? '☝️'}</span>
        <span className={clsx('text-body-lg', hovered ? 'text-ink' : 'text-muted')}>{hovered ? emojiName(hovered) : t('calendar.blocked.emoji.pick')}</span>
      </div>
    </div>
  )
}
