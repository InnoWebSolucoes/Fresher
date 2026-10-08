import { useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { Check, Copy, ExternalLink, Globe, ImagePlus, Images, Link2, MapPin, Plus, Share2, Smile, Trash2, Upload, X } from 'lucide-react'
import { Avatar, Button, Chip, EmptyState, Field, FullscreenFrame, IconButton, LearnMore, Menu, MenuButton, Modal, PageHeader, PageSkeleton, SectionNav, Select, TextArea, TextInput, confirm, toast, usePageLoading } from '@/components/ui'
import { useDb } from '@/store/db'
import { useCurrentUser } from '@/store/session'
import { useDrawer } from '@/lib/drawer'
import { addPortfolioImages, imageToDataUrl, PORTFOLIO_LIMIT, removePortfolioImage, saveOnlineProfile, startPortfolio, type OnlineProfile, type SocialPlatform } from '@/api/panels'
import { num } from '@/lib/format'
import type { User } from '@/types'
import { DEFAULT_PLATFORMS, EXTRA_PLATFORMS, INTEREST_EMOJI, INTEREST_GROUPS, LANGUAGE_CODES, profileSlug, socialUrl } from './catalog'
import { CollageArt, errorText, Stars, useMyTeamMember, useOnlineProfile, usePanelsHydrated } from './shared'

// ─── Helpers ──────────────────────────────────────────────────────────────

function ProfileAvatar({ profile, size }: { profile: OnlineProfile; size: number }) {
  if (profile.avatar) return <img src={profile.avatar} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  return <Avatar name={profile.displayName || '?'} size={size} />
}

/** Rating and place line shared by the profile card and the marketplace preview. */
function useProfileStats() {
  const member = useMyTeamMember()
  const reviews = useDb((s) => s.reviews)
  const locations = useDb((s) => s.locations)
  return useMemo(() => {
    const mine = member ? reviews.filter((r) => r.teamMemberId === member.id) : []
    const avg = mine.length ? mine.reduce((sum, r) => sum + r.rating, 0) / mine.length : 0
    const memberLocs = member ? locations.filter((l) => member.locationIds.includes(l.id)) : []
    const place = Array.from(new Set(memberLocs.map((l) => l.address.city).filter(Boolean))).join(', ')
    return { count: mine.length, avg, place, locationNames: memberLocs.map((l) => l.name) }
  }, [member, reviews, locations])
}

function RatingLine({ count, avg }: { count: number; avg: number }) {
  const { t } = useTranslation()
  if (!count) return <p className="text-body text-muted">{t('account.profile.noReviews')}</p>
  return (
    <p className="flex items-center justify-center gap-2 text-body text-muted">
      <Stars value={avg} size={14} />
      {t('account.profile.rating', { rating: num(avg, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), count })}
    </p>
  )
}

function SetupCard({ title, icon, emptyTitle, emptyBody, onSetup, children, action }: { title: string; icon: ReactNode; emptyTitle: string; emptyBody: string; onSetup: () => void; children?: ReactNode; action?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <section className="card p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-title-2 text-ink">{title}</h2>
        {children ? action : null}
      </div>
      {children ?? (
        <EmptyState
          icon={icon}
          title={emptyTitle}
          body={emptyBody}
          action={
            <Button variant="primary" onClick={onSetup}>
              {t('account.common.setUpNow')}
            </Button>
          }
        />
      )}
    </section>
  )
}

function InterestChips({ ids }: { ids: string[] }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap gap-2">
      {ids.map((id) => (
        <span key={id} className="chip h-9 bg-sunken px-3 text-body text-ink">
          <span aria-hidden>{INTEREST_EMOJI[id]}</span> {t(`account.interestItems.${id}`)}
        </span>
      ))}
    </div>
  )
}

function SocialList({ profile }: { profile: OnlineProfile }) {
  const { t } = useTranslation()
  return (
    <ul className="flex flex-col divide-y divide-line">
      {profile.socials.map((s) => (
        <li key={s.platform} className="flex items-center justify-between gap-3 py-3">
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-subtle text-primary">{s.platform === 'website' ? <Globe size={16} aria-hidden /> : <Link2 size={16} aria-hidden />}</span>
            <span className="min-w-0">
              <span className="block text-body-strong text-ink">{t(`account.platforms.${s.platform}`)}</span>
              <span className="block truncate text-small text-muted">{s.handle}</span>
            </span>
          </span>
          <a href={socialUrl(s.platform, s.handle)} target="_blank" rel="noreferrer" className="icon-btn" aria-label={t(`account.platforms.${s.platform}`)}>
            <ExternalLink size={16} aria-hidden />
          </a>
        </li>
      ))}
    </ul>
  )
}

// ─── My profile ───────────────────────────────────────────────────────────

export function MyProfilePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useCurrentUser()
  const profile = useOnlineProfile(user?.id)
  const stats = useProfileStats()
  const loading = usePageLoading()
  const [shareOpen, setShareOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  if (loading || !user) return <PageSkeleton rows={4} />

  const edit = (section: string) => navigate(`/user-account/profile/edit/${section}`)

  return (
    <div className="mx-auto max-w-[1120px]">
      <PageHeader
        title={
          <>
            {t('account.profile.title')}
            <Chip tone={profile.hidden ? 'neutral' : 'success'}>{profile.hidden ? t('account.profile.hidden') : t('account.profile.online')}</Chip>
          </>
        }
        subtitle={t('account.profile.subtitle')}
        actions={
          <>
            <IconButton label={t('account.profile.shareProfile')} onClick={() => setShareOpen(true)}>
              <Share2 size={18} aria-hidden />
            </IconButton>
            <Button onClick={() => setPreviewOpen(true)}>{t('account.profile.viewOnMarketplace')}</Button>
          </>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        <section className="card relative flex flex-col items-center p-8 text-center">
          <Button size="sm" className="absolute right-6 top-6" onClick={() => edit('personal-details')}>
            {t('account.profile.edit')}
          </Button>
          <ProfileAvatar profile={profile} size={120} />
          <h2 className="mt-5 font-display text-title-1 text-ink">{profile.displayName}</h2>
          {profile.headline && <p className="mt-1 text-body text-ink">{profile.headline}</p>}
          <div className="mt-2">
            <RatingLine count={stats.count} avg={stats.avg} />
          </div>
          {stats.place && <p className="mt-1 text-body text-ink">{stats.place}</p>}
          {profile.about && <p className="mt-4 whitespace-pre-line text-left text-body text-muted">{profile.about}</p>}
          {profile.languages.length > 0 && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {profile.languages.map((code) => (
                <Chip key={code}>{t(`account.languageNames.${code}`)}</Chip>
              ))}
            </div>
          )}
        </section>

        <div className="flex flex-col gap-6">
          <SetupCard
            title={t('account.profile.portfolio')}
            icon={<Images size={24} aria-hidden />}
            emptyTitle={t('account.profile.noImages')}
            emptyBody={t('account.profile.noImagesBody')}
            onSetup={() => navigate('/user-account/portfolio')}
            action={<Button size="sm" onClick={() => navigate('/user-account/portfolio')}>{t('account.profile.manage')}</Button>}
          >
            {profile.portfolio.length > 0 ? (
              <div className="mt-4 grid grid-cols-3 gap-3">
                {profile.portfolio.slice(0, 6).map((img, i) => (
                  <div key={img.id} className="relative aspect-square overflow-hidden rounded-md bg-sunken">
                    <img src={img.src} alt={img.name} className="h-full w-full object-cover" />
                    {i === 5 && profile.portfolio.length > 6 && <span className="absolute inset-0 flex items-center justify-center bg-ink/50 font-display text-title-3 text-white">{t('account.profile.moreImages', { count: profile.portfolio.length - 6 })}</span>}
                  </div>
                ))}
              </div>
            ) : undefined}
          </SetupCard>
          <SetupCard
            title={t('account.profile.interests')}
            icon={<Smile size={24} aria-hidden />}
            emptyTitle={t('account.profile.noInterests')}
            emptyBody={t('account.profile.noInterestsBody')}
            onSetup={() => edit('interests')}
            action={<Button size="sm" onClick={() => edit('interests')}>{t('account.common.edit')}</Button>}
          >
            {profile.interests.length > 0 ? (
              <div className="mt-4">
                <InterestChips ids={profile.interests} />
              </div>
            ) : undefined}
          </SetupCard>
          <SetupCard
            title={t('account.profile.socials')}
            icon={<Link2 size={24} aria-hidden />}
            emptyTitle={t('account.profile.noSocials')}
            emptyBody={t('account.profile.noSocialsBody')}
            onSetup={() => edit('socials')}
            action={<Button size="sm" onClick={() => edit('socials')}>{t('account.common.edit')}</Button>}
          >
            {profile.socials.length > 0 ? (
              <div className="mt-2">
                <SocialList profile={profile} />
              </div>
            ) : undefined}
          </SetupCard>
        </div>
      </div>

      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} user={user} profile={profile} />
      <PreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} profile={profile} stats={stats} />
    </div>
  )
}

function ShareModal({ open, onClose, user, profile }: { open: boolean; onClose: () => void; user: User; profile: OnlineProfile }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const link = `https://innoweb.app/pro/${profileSlug(profile.displayName || `${user.firstName} ${user.lastName}`, user.id)}`
  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(link)
    } catch {
      // Clipboard can be blocked; the link is still selectable in the field.
    }
    setCopied(true)
    toast(t('account.profile.share.copied'))
    window.setTimeout(() => setCopied(false), 2000)
  }
  return (
    <Modal open={open} onClose={onClose} title={t('account.profile.share.title')} subtitle={t('account.profile.share.body')} size="sm" footer={<Button onClick={onClose}>{t('account.common.close')}</Button>}>
      <Field label={t('account.profile.share.link')}>
        {(id) => (
          <div className="flex gap-2">
            <TextInput id={id} readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="flex-1" />
            <Button variant="primary" icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={copy}>
              {copied ? t('account.common.copied') : t('account.common.copy')}
            </Button>
          </div>
        )}
      </Field>
      {profile.hidden && <p className="mt-4 rounded-md bg-warning-subtle p-3 text-small text-warning">{t('account.profile.share.hiddenNote')}</p>}
    </Modal>
  )
}

function PreviewModal({ open, onClose, profile, stats }: { open: boolean; onClose: () => void; profile: OnlineProfile; stats: ReturnType<typeof useProfileStats> }) {
  const { t } = useTranslation()
  const workspace = useDb((s) => s.workspace)
  const empty = !profile.headline && !profile.about && !profile.interests.length && !profile.portfolio.length
  return (
    <Modal open={open} onClose={onClose} title={t('account.profile.preview.title')} subtitle={t('account.profile.preview.subtitle')} size="lg">
      <div className="overflow-hidden rounded-lg border border-line">
        <div className="h-24 bg-gradient-to-r from-primary/30 to-accent/40" />
        <div className="-mt-12 flex flex-col items-center px-6 pb-6 text-center">
          <div className="rounded-full ring-4 ring-surface">
            <ProfileAvatar profile={profile} size={96} />
          </div>
          <h3 className="mt-3 font-display text-title-1 text-ink">{profile.displayName}</h3>
          {profile.headline && <p className="mt-1 text-body text-ink">{profile.headline}</p>}
          <div className="mt-2">
            <RatingLine count={stats.count} avg={stats.avg} />
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-small text-muted">
            <MapPin size={14} aria-hidden />
            {t('account.profile.preview.worksAt', { name: workspace.name })}
            {stats.locationNames.length > 0 && ` · ${stats.locationNames.join(', ')}`}
          </p>
          <Button variant="primary" className="mt-4" onClick={() => toast(t('account.profile.preview.bookToast'))}>
            {t('account.profile.preview.bookWith', { name: profile.displayName.split(' ')[0] })}
          </Button>
        </div>
        <div className="flex flex-col gap-5 border-t border-line px-6 py-5">
          {empty && <p className="text-center text-body text-muted">{t('account.profile.preview.nothing')}</p>}
          {profile.about && (
            <div>
              <h4 className="text-body-strong text-ink">{t('account.profile.about')}</h4>
              <p className="mt-1 whitespace-pre-line text-body text-muted">{profile.about}</p>
            </div>
          )}
          {profile.portfolio.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {profile.portfolio.slice(0, 8).map((img) => (
                <img key={img.id} src={img.src} alt={img.name} className="aspect-square w-full rounded-md object-cover" />
              ))}
            </div>
          )}
          {profile.languages.length > 0 && (
            <div>
              <h4 className="mb-2 text-body-strong text-ink">{t('account.profile.languages')}</h4>
              <div className="flex flex-wrap gap-2">
                {profile.languages.map((code) => (
                  <Chip key={code}>{t(`account.languageNames.${code}`)}</Chip>
                ))}
              </div>
            </div>
          )}
          {profile.interests.length > 0 && (
            <div>
              <h4 className="mb-2 text-body-strong text-ink">{t('account.profile.interests')}</h4>
              <InterestChips ids={profile.interests} />
            </div>
          )}
          {profile.socials.length > 0 && (
            <div>
              <h4 className="text-body-strong text-ink">{t('account.profile.socials')}</h4>
              <SocialList profile={profile} />
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ─── Edit your online profile (full screen) ───────────────────────────────

const EDIT_SECTIONS = ['personal-details', 'languages', 'interests', 'socials'] as const
type EditSection = (typeof EDIT_SECTIONS)[number]

export function MyProfileEditPage() {
  const user = useCurrentUser()
  const hydrated = usePanelsHydrated()
  const profile = useOnlineProfile(user?.id)
  const loading = usePageLoading()
  if (!user || !hydrated || loading)
    return (
      <div className="mx-auto max-w-3xl p-8">
        <PageSkeleton rows={4} />
      </div>
    )
  return <ProfileEditor user={user} profile={profile} />
}

interface SocialRow {
  platform: SocialPlatform
  handle: string
}

function ProfileEditor({ user, profile }: { user: User; profile: OnlineProfile }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const params = useParams<{ section: string }>()
  const section: EditSection = (EDIT_SECTIONS as readonly string[]).includes(params.section ?? '') ? (params.section as EditSection) : 'personal-details'
  const fileInput = useRef<HTMLInputElement>(null)

  const [displayName, setDisplayName] = useState(profile.displayName)
  const [headline, setHeadline] = useState(profile.headline)
  const [about, setAbout] = useState(profile.about)
  const [avatar, setAvatar] = useState(profile.avatar)
  const [languages, setLanguages] = useState(profile.languages)
  const [langPick, setLangPick] = useState('')
  const [interests, setInterests] = useState(profile.interests)
  const [socials, setSocials] = useState<SocialRow[]>(() => [
    ...DEFAULT_PLATFORMS.map((p) => ({ platform: p, handle: profile.socials.find((s) => s.platform === p)?.handle ?? '' })),
    ...profile.socials.filter((s) => !DEFAULT_PLATFORMS.includes(s.platform)),
  ])
  const [nameError, setNameError] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const go = (s: EditSection) => navigate(`/user-account/profile/edit/${s}`, { replace: true })
  const close = () => navigate('/user-account/profile')

  const save = async () => {
    if (!displayName.trim()) {
      setNameError(t('account.edit.details.displayNameRequired'))
      go('personal-details')
      return
    }
    setSaving(true)
    try {
      await saveOnlineProfile(user.id, {
        displayName: displayName.trim(),
        headline: headline.trim(),
        about: about.trim(),
        avatar,
        languages,
        interests,
        socials: socials.filter((s) => s.handle.trim()).map((s) => ({ platform: s.platform, handle: s.handle.trim() })),
      })
      toast(t('account.edit.saved'))
      close()
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  const onAvatar = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      setAvatar(await imageToDataUrl(file, 400, 0.85))
      toast(t('account.edit.avatar.uploaded'))
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const toggleInterest = (id: string) => setInterests((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 10 ? cur : [...cur, id]))
  const missingPlatforms = EXTRA_PLATFORMS.filter((p) => !socials.some((s) => s.platform === p))

  const heading = (title: string, body: ReactNode) => (
    <div className="mb-6">
      <h2 className="font-display text-title-1 text-ink">{title}</h2>
      <p className="mt-1 text-body-lg text-muted">{body}</p>
    </div>
  )

  return (
    <FullscreenFrame
      title={t('account.edit.title')}
      onClose={close}
      closeLabel={t('account.common.close')}
      actions={
        <Button variant="primary" loading={saving} onClick={save}>
          {t('account.common.save')}
        </Button>
      }
      nav={<SectionNav groups={[{ items: EDIT_SECTIONS.map((s) => ({ value: s, label: t(`account.edit.sections.${s}`) })) }]} value={section} onChange={go} />}
    >
      <div className="mb-6 md:hidden">
        <Select aria-label={t('account.edit.title')} value={section} onChange={(e) => go(e.target.value as EditSection)} options={EDIT_SECTIONS.map((s) => ({ value: s, label: t(`account.edit.sections.${s}`) }))} />
      </div>

      {section === 'personal-details' && (
        <div className="flex flex-col gap-8">
          <section className="card p-6">
            <h2 className="font-display text-title-2 text-ink">{t('account.edit.avatar.title')}</h2>
            <p className="mt-1 text-body text-muted">
              {t('account.edit.avatar.body')} <LearnMore topic={t('account.common.topics.photoTips')}>{t('account.edit.avatar.tips')}</LearnMore>
            </p>
            <div className="mt-5 flex items-center gap-5">
              <ProfileAvatar profile={{ ...profile, displayName: displayName || profile.displayName, avatar }} size={96} />
              <div className="flex flex-wrap gap-2">
                <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => onAvatar(e.target.files?.[0])} />
                <Button icon={<Upload size={16} />} loading={uploading} onClick={() => fileInput.current?.click()}>
                  {avatar ? t('account.edit.avatar.change') : t('account.edit.avatar.upload')}
                </Button>
                {avatar && (
                  <Button variant="ghost" icon={<Trash2 size={16} />} onClick={() => setAvatar(undefined)}>
                    {t('account.edit.avatar.remove')}
                  </Button>
                )}
              </div>
            </div>
          </section>
          <section className="card flex flex-col gap-5 p-6">
            <div>
              <h2 className="font-display text-title-2 text-ink">{t('account.edit.details.title')}</h2>
              <p className="mt-1 text-body text-muted">{t('account.edit.details.body')}</p>
            </div>
            <Field label={t('account.edit.details.displayName')} error={nameError}>
              {(id) => (
                <TextInput
                  id={id}
                  value={displayName}
                  invalid={!!nameError}
                  onChange={(e) => {
                    setDisplayName(e.target.value)
                    setNameError('')
                  }}
                />
              )}
            </Field>
            <Field label={t('account.edit.details.headline')} counter={{ value: headline.length, max: 64 }}>
              {(id) => <TextInput id={id} value={headline} maxLength={64} placeholder={t('account.edit.details.headlinePlaceholder')} onChange={(e) => setHeadline(e.target.value)} />}
            </Field>
            <Field label={t('account.edit.details.about')} counter={{ value: about.length, max: 400 }}>
              {(id) => <TextArea id={id} value={about} maxLength={400} rows={5} placeholder={t('account.edit.details.aboutPlaceholder')} onChange={(e) => setAbout(e.target.value)} />}
            </Field>
          </section>
        </div>
      )}

      {section === 'languages' && (
        <section>
          {heading(t('account.edit.sections.languages'), t('account.edit.languages.body'))}
          <div className="card p-6">
            {languages.length === 0 ? (
              <p className="text-body text-muted">{t('account.edit.languages.empty')}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {languages.map((code) => (
                  <span key={code} className="chip h-9 gap-1 bg-sunken pl-3 pr-1 text-body text-ink">
                    {t(`account.languageNames.${code}`)}
                    <button type="button" className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-line" aria-label={`${t('account.common.remove')} ${t(`account.languageNames.${code}`)}`} onClick={() => setLanguages((cur) => cur.filter((c) => c !== code))}>
                      <X size={14} aria-hidden />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="mt-5 flex gap-2">
              <Select
                aria-label={t('account.edit.languages.pick')}
                value={langPick}
                onChange={(e) => setLangPick(e.target.value)}
                placeholder={t('account.edit.languages.pick')}
                options={LANGUAGE_CODES.filter((c) => !languages.includes(c)).map((c) => ({ value: c, label: t(`account.languageNames.${c}`) }))}
                className="max-w-xs"
              />
              <Button
                icon={<Plus size={16} />}
                disabled={!langPick}
                onClick={() => {
                  setLanguages((cur) => [...cur, langPick])
                  toast(t('account.edit.languages.added', { name: t(`account.languageNames.${langPick}`) }))
                  setLangPick('')
                }}
              >
                {t('account.common.add')}
              </Button>
            </div>
          </div>
        </section>
      )}

      {section === 'interests' && (
        <section>
          {heading(t('account.edit.sections.interests'), t('account.edit.interests.body'))}
          <p className={clsx('mb-4 text-body-strong', interests.length >= 10 ? 'text-warning' : 'text-muted')}>
            {t('account.edit.interests.count', { count: interests.length })}
            {interests.length >= 10 && ` · ${t('account.edit.interests.limit')}`}
          </p>
          <div className="flex flex-col gap-6">
            {INTEREST_GROUPS.map((g) => (
              <div key={g.key}>
                <h3 className="mb-3 font-display text-title-3 text-ink">{t(`account.interestGroups.${g.key}`)}</h3>
                <div className="flex flex-wrap gap-2">
                  {g.items.map(([id, emoji]) => {
                    const on = interests.includes(id)
                    const disabled = !on && interests.length >= 10
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={on}
                        disabled={disabled}
                        onClick={() => toggleInterest(id)}
                        className={clsx('inline-flex h-10 items-center gap-2 rounded-full border px-4 text-body transition-colors disabled:cursor-not-allowed disabled:opacity-40', on ? 'border-primary bg-primary-subtle font-semibold text-primary' : 'border-line-strong bg-surface text-ink hover:bg-sunken')}
                      >
                        <span aria-hidden>{emoji}</span>
                        {t(`account.interestItems.${id}`)}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {section === 'socials' && (
        <section>
          {heading(t('account.edit.sections.socials'), t('account.edit.socials.body'))}
          <div className="card flex flex-col gap-4 p-6">
            {socials.map((row, i) => (
              <Field key={row.platform} label={t(`account.platforms.${row.platform}`)}>
                {(id) => (
                  <div className="flex gap-2">
                    <TextInput
                      id={id}
                      className="flex-1"
                      value={row.handle}
                      placeholder={row.platform === 'website' ? 'www.example.com' : `@${row.platform}`}
                      onChange={(e) => setSocials((cur) => cur.map((s, j) => (j === i ? { ...s, handle: e.target.value } : s)))}
                    />
                    {!DEFAULT_PLATFORMS.includes(row.platform) && (
                      <IconButton label={t('account.edit.socials.remove', { name: t(`account.platforms.${row.platform}`) })} onClick={() => setSocials((cur) => cur.filter((_, j) => j !== i))}>
                        <Trash2 size={16} aria-hidden />
                      </IconButton>
                    )}
                  </div>
                )}
              </Field>
            ))}
            {missingPlatforms.length > 0 && (
              <div>
                <Menu
                  align="left"
                  trigger={({ open, toggle }) => (
                    <MenuButton open={open} toggle={toggle}>
                      <Plus size={16} aria-hidden />
                      {t('account.edit.socials.add')}
                    </MenuButton>
                  )}
                  groups={[{ items: missingPlatforms.map((p) => ({ label: t(`account.platforms.${p}`), onSelect: () => setSocials((cur) => [...cur, { platform: p, handle: '' }]) })) }]}
                />
              </div>
            )}
          </div>
        </section>
      )}
      <div className="h-8" />
    </FullscreenFrame>
  )
}

// ─── Portfolio ────────────────────────────────────────────────────────────

export function PortfolioPage() {
  const { t } = useTranslation()
  const user = useCurrentUser()
  const hydrated = usePanelsHydrated()
  const profile = useOnlineProfile(user?.id)
  const loading = usePageLoading()
  const drawer = useDrawer()
  const [starting, setStarting] = useState(false)
  if (!user || !hydrated || loading) return <PageSkeleton rows={4} />

  if (!profile.portfolioStarted && profile.portfolio.length === 0) {
    const start = async () => {
      setStarting(true)
      try {
        await startPortfolio(user.id)
      } finally {
        setStarting(false)
      }
    }
    return (
      <div className="mx-auto grid max-w-[1120px] items-center gap-10 py-6 lg:grid-cols-[1fr_minmax(0,440px)]">
        <div>
          <h1 className="font-display text-[36px] font-bold leading-[44px] text-ink">{t('account.portfolio.introTitle')}</h1>
          <ul className="mt-6 flex flex-col gap-3">
            {(['bullet1', 'bullet2', 'bullet3'] as const).map((k) => (
              <li key={k} className="flex items-start gap-3 text-body-lg text-ink">
                <Check size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                {t(`account.portfolio.${k}`)}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex gap-3">
            <Button variant="primary" size="lg" loading={starting} onClick={start}>
              {t('account.portfolio.continue')}
            </Button>
            <Button size="lg" onClick={() => drawer.open('resources', { tab: 'help', d_view: 'help-center', d_q: 'portfolio' })}>
              {t('account.common.learnMore')}
            </Button>
          </div>
        </div>
        <div className="hidden lg:block">
          <CollageArt />
        </div>
      </div>
    )
  }
  return <PortfolioManager user={user} profile={profile} />
}

function PortfolioManager({ user, profile }: { user: User; profile: OnlineProfile }) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)
  const full = profile.portfolio.length >= PORTFOLIO_LIMIT

  const upload = async (list: FileList | File[] | null | undefined) => {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    setUploading(true)
    try {
      const count = await addPortfolioImages(user.id, files)
      toast(t('account.portfolio.added', { count }))
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setUploading(false)
      if (input.current) input.current.value = ''
    }
  }

  const remove = async (id: string) => {
    const ok = await confirm({ title: t('account.portfolio.deleteTitle'), body: t('account.portfolio.deleteBody'), confirmLabel: t('account.common.remove'), tone: 'danger' })
    if (!ok) return
    await removePortfolioImage(user.id, id)
    toast(t('account.portfolio.deleted'))
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (!full) void upload(e.dataTransfer.files)
  }

  const viewed = profile.portfolio.find((i) => i.id === viewing)

  return (
    <div
      className="relative mx-auto max-w-[1120px]"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <PageHeader
        title={t('account.portfolio.title')}
        subtitle={t('account.portfolio.subtitle', { max: PORTFOLIO_LIMIT })}
        count={profile.portfolio.length}
        actions={
          <>
            <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
            <Button variant="primary" icon={<ImagePlus size={16} />} loading={uploading} disabled={full} onClick={() => input.current?.click()}>
              {uploading ? t('account.portfolio.uploading') : t('account.portfolio.upload')}
            </Button>
          </>
        }
      />
      {dragging && !full && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary-subtle/80 font-display text-title-2 text-primary">{t('account.portfolio.dropHere')}</div>
      )}
      {profile.portfolio.length === 0 ? (
        <div className="card border-2 border-dashed border-line-strong">
          <EmptyState
            icon={<Images size={24} aria-hidden />}
            title={t('account.portfolio.emptyTitle')}
            body={t('account.portfolio.emptyBody')}
            action={
              <Button variant="primary" icon={<Upload size={16} />} loading={uploading} onClick={() => input.current?.click()}>
                {t('account.portfolio.upload')}
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <p className="mb-3 text-small text-muted">{t('account.portfolio.count', { count: profile.portfolio.length, max: PORTFOLIO_LIMIT })}</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {profile.portfolio.map((img) => (
              <div key={img.id} className="group relative aspect-square overflow-hidden rounded-lg bg-sunken">
                <button type="button" className="h-full w-full" onClick={() => setViewing(img.id)} aria-label={`${t('account.portfolio.view')}: ${img.name}`}>
                  <img src={img.src} alt={img.name} className="h-full w-full object-cover transition-transform duration-base group-hover:scale-[1.03]" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(img.id)}
                  aria-label={`${t('account.portfolio.delete')}: ${img.name}`}
                  className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-surface text-danger opacity-0 shadow-md transition-opacity focus:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      <Modal
        open={!!viewed}
        onClose={() => setViewing(null)}
        title={viewed?.name}
        size="lg"
        footer={
          viewed && (
            <Button
              variant="danger"
              icon={<Trash2 size={16} />}
              onClick={() => {
                const id = viewed.id
                setViewing(null)
                void remove(id)
              }}
            >
              {t('account.portfolio.delete')}
            </Button>
          )
        }
      >
        {viewed && <img src={viewed.src} alt={viewed.name} className="max-h-[70vh] w-full rounded-md object-contain" />}
      </Modal>
    </div>
  )
}
