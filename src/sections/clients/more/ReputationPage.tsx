import clsx from 'clsx'
import { Captions, Maximize, Pause, Play, Star } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import type { Review } from '@/types'
import { useDb } from '@/store/db'
import { disconnectGoogle, googleConnected } from '@/api/clients'
import { useExt, writeExt } from '@/api/ext'
import { Button, Card, IconButton, LearnMore, Menu, Modal, Page, PageHeader, PageSkeleton, PillTabs, confirm, toast, usePageLoading } from '@/components/ui'
import { StarBars, Stars } from '../components/common'
import { GoogleConnectModal, GoogleMark } from './GoogleConnectModal'
import { AllReviewsTab } from './ReviewsTab'
import { average, ratingCounts } from './reviews'

export function OnlineReputationPage() {
  const { t } = useTranslation()
  const loading = usePageLoading()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'all' ? 'all' : 'overview'
  const reviews = useDb((s) => s.reviews)
  const addOns = useDb((s) => s.addOns)
  const connected = googleConnected(addOns)
  const visible = useMemo(() => (connected ? reviews : reviews.filter((r) => r.platform === 'marketplace')), [connected, reviews])
  const [connectOpen, setConnectOpen] = useState(false)
  const tipHidden = useExt<boolean>('clients', 'reputationTipDismissed', false)
  const [video, setVideo] = useState(false)

  const setTab = (v: 'overview' | 'all') => {
    const next = new URLSearchParams(params)
    if (v === 'all') next.set('tab', 'all')
    else next.delete('tab')
    setParams(next, { replace: true })
  }

  return (
    <Page>
      <PageHeader
        title={t('clients.more.reputation.title')}
        subtitle={
          <>
            {t('clients.more.reputation.subtitle')} <LearnMore topic="Online reputation">{t('clients.more.common.learnMore')}</LearnMore>
          </>
        }
      />
      {loading ? (
        <PageSkeleton rows={5} />
      ) : (
        <>
          {!tipHidden && (
            <div className="mb-8 flex flex-col gap-5 rounded-lg border border-primary/20 bg-primary-subtle p-3 pl-7 md:flex-row md:items-center">
              <div className="flex-1 py-3">
                <p className="text-body-lg text-ink">{t('clients.more.reputation.tip')}</p>
                <div className="mt-4 flex items-center gap-4">
                  <Button icon={<Play size={16} />} onClick={() => setVideo(true)}>
                    {t('clients.more.reputation.watchNow')}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => writeExt('clients', 'reputationTipDismissed', true)}
                  >
                    {t('clients.more.common.dismiss')}
                  </Button>
                </div>
              </div>
              <button type="button" onClick={() => setVideo(true)} aria-label={t('clients.more.reputation.videoTitle')} className="group relative h-40 w-full shrink-0 overflow-hidden rounded-md md:w-72">
                <VideoArt />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink/70 text-white transition-transform group-hover:scale-105">
                    <Play size={24} className="ml-1 fill-current" aria-hidden />
                  </span>
                </span>
                <span className="absolute bottom-2 right-2 rounded-full bg-ink/70 px-2.5 py-0.5 text-caption font-semibold text-white">{t('clients.more.reputation.oneVideo')}</span>
              </button>
            </div>
          )}

          <PillTabs
            className="mb-6"
            value={tab}
            onChange={setTab}
            items={[
              { value: 'overview', label: t('clients.more.reputation.tabs.overview') },
              { value: 'all', label: t('clients.more.reputation.tabs.all') },
            ]}
          />

          {tab === 'overview' ? <Overview reviews={visible} connected={connected} onConnect={() => setConnectOpen(true)} onView={() => setTab('all')} /> : <AllReviewsTab reviews={visible} connected={connected} onConnect={() => setConnectOpen(true)} />}
        </>
      )}
      <GoogleConnectModal open={connectOpen} onClose={() => setConnectOpen(false)} />
      {video && <VideoModal onClose={() => setVideo(false)} />}
    </Page>
  )
}

/* ─── Overview ───────────────────────────────────────────────────────────── */

function Overview({ reviews, connected, onConnect, onView }: { reviews: Review[]; connected: boolean; onConnect: () => void; onView: () => void }) {
  const { t } = useTranslation()
  const ours = reviews.filter((r) => r.platform === 'marketplace')
  const google = reviews.filter((r) => r.platform === 'google')
  const replied = reviews.filter((r) => r.reply).length
  const avg = average(reviews)

  const disconnect = async () => {
    const ok = await confirm({ title: t('clients.more.reputation.disconnectTitle'), body: t('clients.more.reputation.disconnectBody'), confirmLabel: t('clients.more.reputation.disconnect'), tone: 'danger' })
    if (!ok) return
    await disconnectGoogle()
    toast(t('clients.more.reputation.disconnected'))
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 md:grid-cols-3">
        <Card>
          <p className="text-body-strong text-ink">{t('clients.more.reputation.overall')}</p>
          <p className="mt-2 flex items-center gap-2 font-display text-title-1 text-ink tabular">
            {avg.toFixed(1)} <Star size={24} className="fill-accent text-accent" aria-hidden />
          </p>
          <p className="mt-1 text-small text-muted">{t('clients.more.reputation.ratings', { count: reviews.length })}</p>
        </Card>
        <Card>
          <p className="text-body-strong text-ink">{t('clients.more.reputation.total')}</p>
          <p className="mt-2 font-display text-title-1 text-ink tabular">{reviews.length}</p>
          <Button variant="link" className="mt-1 text-small" onClick={onView}>
            {t('clients.more.reputation.viewReviews')}
          </Button>
        </Card>
        <Card>
          <p className="text-body-strong text-ink">{t('clients.more.reputation.responseRate')}</p>
          <p className="mt-2 font-display text-title-1 text-ink tabular">{reviews.length ? `${Math.round((replied / reviews.length) * 100)}%` : t('clients.more.common.dash')}</p>
          {reviews.length > 0 && <p className="mt-1 text-small text-muted">{t('clients.more.reputation.replied', { count: replied })}</p>}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <PlatformCard name={<span className="font-display text-title-2 text-ink">{t('clients.more.reputation.platformInnoweb')}</span>} list={ours} />
        {connected ? (
          <PlatformCard
            name={
              <span className="flex items-center gap-2 font-display text-title-2 text-ink">
                <GoogleMark size={24} />
                {t('clients.more.reputation.platformGoogle')}
                <span className="chip bg-success-subtle text-caption text-success">{t('clients.more.reputation.connected')}</span>
              </span>
            }
            action={<Menu groups={[{ items: [{ label: t('clients.more.reputation.viewReviews'), onSelect: onView }, { label: t('clients.more.reputation.disconnect'), danger: true, onSelect: () => void disconnect() }] }]} />}
            list={google}
          />
        ) : (
          <div className="card relative flex flex-col items-center justify-center overflow-hidden p-8 text-center">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent-subtle via-surface to-info-subtle" aria-hidden />
            <div className="relative flex flex-col items-center">
              <GoogleMark size={40} />
              <p className="mt-3 text-title-3 font-semibold text-ink">{t('clients.more.reputation.googleLinkTitle')}</p>
              <p className="mt-1 text-body text-muted">{t('clients.more.reputation.googleLinkBody')}</p>
              <Button className="mt-5" onClick={onConnect}>
                {t('clients.more.reputation.connect')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PlatformCard({ name, list, action }: { name: ReactNode; list: { rating: 1 | 2 | 3 | 4 | 5 }[]; action?: ReactNode }) {
  const { t } = useTranslation()
  const avg = average(list)
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-2">
        {name}
        {action}
      </div>
      <div className="grid items-center gap-6 sm:grid-cols-[160px_minmax(0,1fr)]">
        <div>
          <p className="font-display text-[48px] font-bold leading-none text-ink tabular">{avg.toFixed(1)}</p>
          <p className="mt-2 flex items-center gap-1.5 text-small text-ink">
            <Stars value={avg} size={14} /> ({list.length})
          </p>
          {list.length === 0 && <p className="mt-1 text-small text-muted">{t('clients.more.reputation.noReviewsYet')}</p>}
        </div>
        <StarBars counts={ratingCounts(list)} />
      </div>
    </Card>
  )
}

/* ─── Video guide ────────────────────────────────────────────────────────── */

function VideoArt({ className }: { className?: string }) {
  return (
    <div className={clsx('absolute inset-0 bg-gradient-to-br from-primary via-primary/80 to-accent', className)} aria-hidden>
      <div className="absolute left-5 top-5 h-16 w-24 rounded-md bg-surface/90 p-2 shadow-md">
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} size={10} className="fill-accent text-accent" />
          ))}
        </div>
        <div className="mt-2 h-1.5 w-16 rounded-full bg-sunken" />
        <div className="mt-1 h-1.5 w-12 rounded-full bg-sunken" />
      </div>
      <div className="absolute bottom-5 right-6 h-20 w-20 rounded-full bg-surface/25" />
      <div className="absolute -bottom-6 left-16 h-24 w-24 rounded-full bg-accent/60" />
    </div>
  )
}

const DURATION = 107 // 1:47
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function VideoModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [playing, setPlaying] = useState(true)
  const [time, setTime] = useState(0)
  const [cc, setCc] = useState(true)
  const frame = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => {
      setTime((s) => {
        if (s + 1 >= DURATION) {
          setPlaying(false)
          return DURATION
        }
        return s + 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [playing])

  const lines = ['line1', 'line2', 'line3', 'line4'] as const
  const caption = time >= DURATION ? t('clients.more.reputation.player.ended') : t(`clients.more.reputation.player.${lines[Math.min(lines.length - 1, Math.floor(time / (DURATION / lines.length)))]}`)
  const toggle = () => {
    if (time >= DURATION) setTime(0)
    setPlaying((p) => !p)
  }

  return (
    <Modal open onClose={onClose} title={t('clients.more.reputation.videoTitle')} size="xl">
      <div ref={frame} className="relative aspect-video w-full overflow-hidden rounded-md bg-ink">
        <VideoArt className="opacity-90" />
        <button type="button" onClick={toggle} aria-label={playing ? t('clients.more.reputation.player.pause') : t('clients.more.reputation.player.play')} className="absolute inset-0 flex items-center justify-center">
          {!playing && (
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-ink/70 text-white">
              <Play size={28} className="ml-1 fill-current" aria-hidden />
            </span>
          )}
        </button>
        {cc && <p className="pointer-events-none absolute bottom-16 left-1/2 max-w-[80%] -translate-x-1/2 rounded-sm bg-ink/80 px-3 py-1.5 text-center text-body text-white">{caption}</p>}
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-ink/80 to-transparent px-4 pb-3 pt-6 text-white">
          <IconButton label={playing ? t('clients.more.reputation.player.pause') : t('clients.more.reputation.player.play')} onClick={toggle} className="h-9 w-9 text-white hover:bg-white/10">
            {playing ? <Pause size={18} aria-hidden /> : <Play size={18} aria-hidden />}
          </IconButton>
          <input
            type="range"
            min={0}
            max={DURATION}
            value={time}
            onChange={(e) => setTime(Number(e.target.value))}
            aria-label={t('clients.more.reputation.videoTitle')}
            className="h-1 flex-1 cursor-pointer accent-white"
          />
          <span className="text-small tabular">
            {clock(time)} / {clock(DURATION)}
          </span>
          <IconButton label={t('clients.more.reputation.player.captions')} aria-pressed={cc} onClick={() => setCc((c) => !c)} className={clsx('h-9 w-9 text-white hover:bg-white/10', cc && 'bg-white/20')}>
            <Captions size={18} aria-hidden />
          </IconButton>
          <IconButton label={t('clients.more.reputation.player.fullscreen')} onClick={() => void frame.current?.requestFullscreen?.().catch(() => undefined)} className="h-9 w-9 text-white hover:bg-white/10">
            <Maximize size={18} aria-hidden />
          </IconButton>
        </div>
      </div>
    </Modal>
  )
}
