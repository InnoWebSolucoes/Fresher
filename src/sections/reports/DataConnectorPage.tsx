import { Check, Copy, Database, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Chip, LearnMore, Page, PageSkeleton, toast, usePageLoading } from '@/components/ui'
import { findAddOn, isAddOnOn, updateAddOnConfig } from '@/api/addons'
import { fmtDateTime } from '@/lib/format'
import { nowISO } from '@/lib/time'
import { useDb } from '@/store/db'

const LOGOS = ['Adobe', 'Astrato', 'AtScale', 'Carto', 'Chartio', 'Domo', 'Google Data Studio', 'Amplitude', 'Cognos', 'Looker', 'Macheye', 'Metabase', 'MicroStrategy', 'Mode', 'Oracle', 'Pentaho', 'Power BI', 'Pyramid', 'Qlik', 'QuickSight', 'Sigma', 'SAP', 'Sisense', 'Snowflake', 'Tableau', 'ThoughtSpot', 'TIBCO']
const TABLES = ['appointments', 'appointment_items', 'sales', 'sale_items', 'payments', 'clients', 'team_members', 'services', 'products', 'stock_movements', 'gift_cards', 'memberships']

const secret = () => Array.from({ length: 20 }, () => 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 54)]).join('')

/** /reports/data-connector (reports.md §1.7): intro → enable screen → Active state. */
export function DataConnectorPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const record = findAddOn(useDb((s) => s.addOns), 'data-connector')
  const workspace = useDb((s) => s.workspace)
  const [busy, setBusy] = useState<'gen' | 'sync' | null>(null)
  if (loading) return <Page><PageSkeleton /></Page>
  const bullets = t('reports.dc.bullets', { returnObjects: true }) as string[]

  if (!isAddOnOn(record)) {
    return (
      <Page>
        <div className="grid items-center gap-10 py-6 lg:grid-cols-[1fr_minmax(0,420px)]">
          <div>
            <span className="chip bg-primary-subtle text-primary">{t('reports.dc.tag')}</span>
            <h1 className="mt-4 font-display text-[36px] font-bold leading-[44px] text-ink">{t('reports.dc.title')}</h1>
            <p className="mt-3 max-w-xl text-body-lg text-muted">{t('reports.dc.body')}</p>
            <ul className="mt-6 flex flex-col gap-3">
              {bullets.map((b) => (
                <li key={b} className="flex items-start gap-3 text-body-lg text-ink"><Check size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden />{b}</li>
              ))}
            </ul>
            <p className="mt-6 text-body-lg font-semibold text-ink">{t('reports.dc.price')}</p>
            <div className="mt-6 flex items-center gap-4">
              <Button variant="primary" size="lg" onClick={() => navigate('/add-ons/add-on/data-connector/setup?return=/reports/data-connector')}>{t('reports.dc.startNow')}</Button>
              <LearnMore topic="Data Connector">{t('reports.dc.learnMore')}</LearnMore>
            </div>
          </div>
          <div className="hidden aspect-square items-center justify-center rounded-xl bg-primary-subtle lg:flex">
            <Database size={120} className="text-primary" aria-hidden />
          </div>
        </div>
        <h2 className="mb-4 mt-10 font-display text-title-2 text-ink">{t('reports.dc.sync')}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {LOGOS.map((l) => <div key={l} className="card flex h-16 items-center justify-center px-3 text-center text-body-strong text-muted">{l}</div>)}
        </div>
      </Page>
    )
  }

  const config = record?.config ?? {}
  const username = (config.username as string | undefined) ?? null
  const host = `dc-eu-west.innoweb.app`
  const database = `ws_${workspace.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      /* clipboard may be unavailable; the toast still confirms the action */
    }
    toast(t('reports.dc.copied'))
  }
  const generate = async () => {
    setBusy('gen')
    await updateAddOnConfig('data-connector', { username: username ?? `innoweb_${Math.floor(Math.random() * 9000 + 1000)}`, password: secret() })
    setBusy(null)
    toast(t('reports.dc.generated'))
  }
  const sync = async () => {
    setBusy('sync')
    await updateAddOnConfig('data-connector', { lastSyncedAt: nowISO() })
    setBusy(null)
    toast(t('reports.dc.synced'))
  }
  const rows: [string, string][] = [
    [t('reports.dc.host'), host],
    [t('reports.dc.database'), database],
    ...(username ? ([[t('reports.dc.username'), username], [t('reports.dc.password'), String(config.password ?? '')]] as [string, string][]) : []),
  ]

  return (
    <Page>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 font-display text-title-1 text-ink">{t('reports.dc.activeTitle')} <Chip tone="success">{t('reports.dc.active')}</Chip></h1>
          <p className="mt-1 max-w-2xl text-body-lg text-muted">{t('reports.dc.activeBody')}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate('/add-ons/manage/data-connector')}>{t('reports.dc.manage')}</Button>
          <Button icon={<RefreshCw size={16} />} loading={busy === 'sync'} onClick={sync}>{t('reports.dc.syncNow')}</Button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="card p-5">
          <dl className="flex flex-col divide-y divide-line">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 py-3">
                <dt className="text-body text-muted">{label}</dt>
                <dd className="flex items-center gap-2 font-mono text-body text-ink">
                  {value}
                  <button type="button" className="icon-btn h-8 w-8" aria-label={`${t('reports.dc.copy')} ${label}`} onClick={() => copy(value)}><Copy size={14} aria-hidden /></button>
                </dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 py-3">
              <dt className="text-body text-muted">{t('reports.dc.lastSync')}</dt>
              <dd className="text-body text-ink">{config.lastSyncedAt ? fmtDateTime(String(config.lastSyncedAt)) : t('reports.dc.never')}</dd>
            </div>
          </dl>
          <Button className="mt-4" variant={username ? 'secondary' : 'primary'} loading={busy === 'gen'} onClick={generate}>{username ? t('reports.dc.regenerate') : t('reports.dc.generate')}</Button>
        </section>
        <section className="card p-5">
          <h2 className="mb-3 text-body-strong text-ink">{t('reports.dc.tables')}</h2>
          <ul className="flex flex-col gap-1.5">
            {TABLES.map((tb) => <li key={tb} className="flex items-center gap-2 font-mono text-small text-muted"><Database size={14} aria-hidden />{tb}</li>)}
          </ul>
        </section>
      </div>
    </Page>
  )
}
