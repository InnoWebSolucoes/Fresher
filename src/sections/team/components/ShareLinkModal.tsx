import { Check, Copy, Download } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useDb } from '@/store/db'
import { Button, Field, Modal, Select, TextInput, toast } from '@/components/ui'

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

/** Options › Create share link: booking link + QR code, or the publish gate (team.md §1.1). */
export function ShareLinkModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const locations = useDb((s) => s.locations)
  const listed = useMemo(() => locations.filter((l) => l.marketplace.listed), [locations])
  const [locationId, setLocationId] = useState('')
  const location = listed.find((l) => l.id === locationId) ?? listed[0]
  const link = location ? `https://book.innoweb.app/${slug(location.name)}?team=all` : ''
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open || !link) return
    let alive = true
    void QRCode.toDataURL(link, { width: 220, margin: 1, color: { dark: '#0B2F2D', light: '#FFFFFF' } }).then((url) => alive && setQr(url))
    return () => {
      alive = false
    }
  }, [open, link])

  if (!open) return null

  if (!location) {
    return (
      <Modal
        open
        onClose={onClose}
        title={t('team.share.gateTitle')}
        subtitle={t('team.share.gateSubtitle')}
        footer={
          <>
            <Button onClick={onClose}>{t('team.common.close')}</Button>
            <Button variant="primary" onClick={() => navigate('/online-presence/locations')}>
              {t('team.common.startNow')}
            </Button>
          </>
        }
      >
        <ul className="flex flex-col gap-2 pb-2">
          {(['gate1', 'gate2', 'gate3'] as const).map((k) => (
            <li key={k} className="flex items-start gap-2 text-body text-ink">
              <Check size={18} className="mt-0.5 text-primary" aria-hidden />
              {t(`team.share.${k}`)}
            </li>
          ))}
        </ul>
      </Modal>
    )
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      /* clipboard may be blocked; the link is still visible */
    }
    setCopied(true)
    toast(t('team.share.copied'))
    setTimeout(() => setCopied(false), 1500)
  }
  const download = () => {
    const a = document.createElement('a')
    a.href = qr
    a.download = `${slug(location.name)}-booking-qr.png`
    a.click()
    toast(t('team.share.downloaded'))
  }

  return (
    <Modal open onClose={onClose} title={t('team.share.title')} subtitle={t('team.share.subtitle')} footer={<Button onClick={onClose}>{t('team.common.done')}</Button>}>
      <div className="flex flex-col gap-4 pb-2">
        {listed.length > 1 && (
          <Field label={t('team.share.location')}>{(id) => <Select id={id} value={location.id} onChange={(e) => setLocationId(e.target.value)} options={listed.map((l) => ({ value: l.id, label: l.name }))} />}</Field>
        )}
        <Field label={t('team.share.link')}>
          {(id) => (
            <div className="flex gap-2">
              <TextInput id={id} readOnly value={link} onFocus={(e) => e.target.select()} />
              <Button icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={copy}>
                {t('team.share.copy')}
              </Button>
            </div>
          )}
        </Field>
        <div className="flex items-center gap-5 rounded-lg bg-sunken p-4">
          {qr ? <img src={qr} alt={t('team.share.qrAlt')} className="h-36 w-36 rounded-md bg-white p-1" /> : <div className="h-36 w-36 animate-pulse rounded-md bg-surface" />}
          <div>
            <p className="text-body-strong text-ink">{t('team.share.qrTitle')}</p>
            <p className="mt-1 text-small text-muted">{t('team.share.qrBody')}</p>
            <Button className="mt-3" size="sm" icon={<Download size={14} />} onClick={download} disabled={!qr}>
              {t('team.share.download')}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
