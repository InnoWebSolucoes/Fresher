import { Check, Copy, Download, Globe } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, Modal, TextInput, toast } from '@/components/ui'
import { useDb } from '@/store/db'
import { downloadBlob } from '@/lib/export'
import { slugify } from '../lib'

export interface QuickLinkTarget {
  kind: 'menu' | 'service' | 'bundle'
  id?: string
  name?: string
}

/**
 * Quick booking link (catalog.md §1): with a listed marketplace profile it
 * shows a copyable link and a QR code; otherwise it asks to publish the profile.
 */
export function QuickLinkModal({ target, onClose }: { target: QuickLinkTarget | null; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const workspace = useDb((s) => s.workspace)
  const locations = useDb((s) => s.locations)
  const listed = locations.some((l) => l.marketplace.listed)
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)

  const link = useMemo(() => {
    if (!target) return ''
    const base = `https://book.innoweb.agency/${slugify(workspace.name)}`
    if (target.kind === 'menu') return base
    return `${base}?${target.kind === 'bundle' ? 'bundle' : 'service'}=${encodeURIComponent(target.id ?? '')}`
  }, [target, workspace.name])

  useEffect(() => {
    setCopied(false)
    if (!link || !listed) return
    let alive = true
    void QRCode.toDataURL(link, { width: 240, margin: 1, color: { dark: '#0B2524', light: '#FFFFFF' } }).then((url) => alive && setQr(url))
    return () => {
      alive = false
    }
  }, [link, listed])

  if (!target) return null

  if (!listed) {
    return (
      <Modal open onClose={onClose} size="lg">
        <div className="grid gap-8 pb-6 md:grid-cols-[1fr_220px]">
          <div>
            <h2 className="font-display text-title-1 text-ink">{t('catalog.quickLink.publishTitle')}</h2>
            <p className="mt-4 text-body-lg text-ink">{t('catalog.quickLink.publishBody')}</p>
            <ul className="mt-4 flex flex-col gap-2">
              {(['b1', 'b2', 'b3'] as const).map((k) => (
                <li key={k} className="flex items-start gap-3 text-body-lg text-ink">
                  <Check size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                  {t(`catalog.quickLink.${k}`)}
                </li>
              ))}
            </ul>
            <Button
              className="mt-8"
              variant="primary"
              size="lg"
              onClick={() => {
                onClose()
                navigate('/online-presence/locations')
              }}
            >
              {t('catalog.common.startNow')}
            </Button>
          </div>
          <div className="hidden items-center justify-center rounded-xl bg-primary-subtle md:flex">
            <Globe size={72} className="text-primary" aria-hidden />
          </div>
        </div>
      </Modal>
    )
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      /* clipboard may be blocked; the link stays selectable */
    }
    setCopied(true)
    toast(t('catalog.toasts.linkCopied'))
  }
  const downloadQr = async () => {
    const blob = await (await fetch(qr)).blob()
    downloadBlob(blob, `booking-qr-${slugify(target.name ?? workspace.name)}.png`)
    toast(t('catalog.toasts.qrDownloaded'))
  }

  return (
    <Modal open onClose={onClose} title={t('catalog.quickLink.title')} subtitle={target.kind === 'menu' ? t('catalog.quickLink.menuSubtitle') : t('catalog.quickLink.itemSubtitle', { name: target.name })}>
      <div className="flex flex-col items-center gap-5 pb-4">
        <div className="rounded-lg border border-line bg-white p-3">{qr ? <img src={qr} alt={t('catalog.quickLink.qrAlt')} width={200} height={200} /> : <div className="h-[200px] w-[200px] animate-pulse rounded bg-sunken" />}</div>
        <div className="flex w-full gap-2">
          <TextInput readOnly value={link} aria-label={t('catalog.quickLink.title')} onFocus={(e) => e.target.select()} className="flex-1" />
          <Button variant="primary" icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={() => void copy()}>
            {copied ? t('catalog.quickLink.copied') : t('catalog.quickLink.copy')}
          </Button>
        </div>
        <Button icon={<Download size={16} />} disabled={!qr} onClick={() => void downloadQr()}>
          {t('catalog.quickLink.downloadQr')}
        </Button>
        <p className="text-center text-small text-muted">{t('catalog.quickLink.hint')}</p>
      </div>
    </Modal>
  )
}
