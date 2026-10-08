import clsx from 'clsx'
import { Check, Copy, Download } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, Modal, toast } from '@/components/ui'
import { downloadBlob } from '@/lib/export'
import type { Location, OpeningHours, Weekday } from '@/types'

export const WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6]

/** First open time for a weekday, or null when closed. */
export function opensAt(hours: OpeningHours, day: Weekday): string | null {
  const d = hours[day]
  return d?.open && d.ranges.length ? d.ranges[0].start : null
}

export const addressLine = (loc: Pick<Location, 'address'>) =>
  [loc.address.line1, loc.address.district, loc.address.city, loc.address.country].filter(Boolean).join(', ')

/** Generated venue photo (SVG data URI) used for sample images and empty thumbnails. */
export function sampleImage(seed: number): string {
  const palettes = [
    ['#e8d9c7', '#b98b67', '#5b4636'],
    ['#dfe7e2', '#8fb3a1', '#365447'],
    ['#efe3e6', '#c79aa6', '#6b3d4a'],
    ['#e4e3ef', '#9b97c4', '#3e3a6b'],
    ['#f1ead8', '#d0b46b', '#6a5523'],
    ['#dde8ef', '#86aac2', '#2d4b60'],
  ]
  const [a, b, c] = palettes[seed % palettes.length]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="960" height="540" fill="url(#g)"/><rect x="${80 + (seed % 3) * 40}" y="120" width="220" height="300" rx="110" fill="${c}" opacity=".18"/><rect x="560" y="90" width="300" height="360" rx="16" fill="#fff" opacity=".35"/><circle cx="710" cy="220" r="70" fill="${c}" opacity=".25"/><rect x="0" y="440" width="960" height="100" fill="${c}" opacity=".22"/><rect x="380" y="300" width="140" height="140" rx="70" fill="#fff" opacity=".45"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/** Reads a picked file and downsizes it so it fits comfortably in local storage. */
export function readImage(file: File, maxWidth = 720): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('decode'))
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(String(reader.result))
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.72))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

/** ✓ list used on intros and gating modals. */
export function CheckList({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={clsx('flex flex-col gap-3', className)}>
      {items.map((b) => (
        <li key={b} className="flex items-start gap-3 text-body-lg text-ink">
          <Check size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden />
          {b}
        </li>
      ))}
    </ul>
  )
}

/** "Set up your marketplace profile" modal shown when a feature needs a listed profile. */
export function ProfileGateModal({ open, onClose, title, locations }: { open: boolean; onClose: () => void; title: string; locations: Location[] }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const target = locations.find((l) => !l.marketplace.listed) ?? locations[0]
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>{t('online.common.close')}</Button>
          <Button variant="primary" onClick={() => target && navigate(`/online-presence/profile/edit/${target.id}/${target.marketplace.step ?? 'overview'}`)}>
            {t('online.common.startNow')}
          </Button>
        </>
      }
    >
      <CheckList items={[t('online.profile.intro.b1'), t('online.profile.intro.b2'), t('online.profile.intro.b3')]} />
    </Modal>
  )
}

export async function copyText(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    /* clipboard can be blocked in some browsers; the toast still confirms the action */
  }
  toast(message)
}

/** Copyable link row with an optional QR code. */
export function LinkWithQr({ url, fileName, showQr = true }: { url: string; fileName: string; showQr?: boolean }) {
  const { t } = useTranslation()
  const [qr, setQr] = useState('')
  useEffect(() => {
    let alive = true
    if (showQr) void QRCode.toDataURL(url, { width: 220, margin: 1 }).then((d) => alive && setQr(d))
    return () => {
      alive = false
    }
  }, [url, showQr])
  const download = async () => {
    const blob = await (await fetch(qr)).blob()
    downloadBlob(blob, `${fileName}.png`)
    toast(t('online.common.qrDownloaded'))
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <input readOnly value={url} aria-label={t('online.common.link')} className="input h-10 flex-1 truncate text-small" onFocus={(e) => e.currentTarget.select()} />
        <Button icon={<Copy size={16} />} onClick={() => copyText(url, t('online.common.linkCopied'))}>
          {t('online.common.copy')}
        </Button>
      </div>
      {showQr && (
        <div className="flex items-center gap-4 rounded-lg bg-sunken p-4">
          {qr ? <img src={qr} alt={t('online.common.qrAlt')} className="h-32 w-32 rounded-md bg-white p-1" /> : <div className="h-32 w-32 animate-pulse rounded-md bg-surface" />}
          <div className="flex flex-col gap-2">
            <p className="text-body-strong text-ink">{t('online.common.qrTitle')}</p>
            <p className="text-small text-muted">{t('online.common.qrBody')}</p>
            <Button size="sm" icon={<Download size={14} />} onClick={download} disabled={!qr} className="self-start">
              {t('online.common.downloadQr')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Phone mock-up artwork for intro pages (original, no third-party art). */
export function PhoneArt({ name, lines }: { name: string; lines: string[] }) {
  return (
    <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-primary-subtle">
      <div className="absolute -right-12 -top-12 h-56 w-56 rounded-full bg-accent/40" />
      <div className="absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-primary/15" />
      <div className="relative w-56 rounded-[28px] border-4 border-ink/80 bg-surface p-3 shadow-lg">
        <div className="mb-3 h-24 rounded-lg" style={{ backgroundImage: `url("${sampleImage(1)}")`, backgroundSize: 'cover' }} />
        <p className="text-body-strong text-ink">{name}</p>
        <p className="mb-2 text-caption text-muted">★ 4.9 · Porto</p>
        {lines.map((l) => (
          <p key={l} className="flex items-center gap-1.5 text-caption text-ink">
            <Check size={12} className="text-primary" aria-hidden />
            {l}
          </p>
        ))}
        <div className="mt-3 rounded-md bg-ink py-1.5 text-center text-caption font-semibold text-surface">Book now</div>
      </div>
    </div>
  )
}

/** A simple stat tile. */
export function Stat({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-line bg-primary-subtle/50 px-5 py-4" title={hint}>
      <span className="flex items-center gap-3 text-body-lg text-ink">
        {icon}
        {label}
      </span>
      <span className="font-display text-title-2 text-ink">{value}</span>
    </div>
  )
}
