import { Check, Copy, Database, Link2, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Chip, LearnMore, PageSkeleton, toast, usePageLoading } from '@/components/ui'
import { findAddOn, isAddOnOn, updateAddOnConfig } from '@/api/addons'
import { fmtDateTime } from '@/lib/format'
import { nowISO } from '@/lib/time'
import { useDb } from '@/store/db'
import { ReportsLayout } from './landing/ReportsLayout'

const LOGOS = ['Adobe', 'Astrato', 'AtScale', 'Carto', 'Chartio', 'Domo', 'Google Data Studio', 'Amplitude', 'Cognos', 'Looker', 'Macheye', 'Metabase', 'MicroStrategy', 'Mode', 'Oracle', 'Pentaho', 'Power BI', 'Pyramid', 'Qlik', 'QuickSight', 'Sigma', 'SAP', 'Sisense', 'Snowflake', 'Tableau', 'ThoughtSpot', 'TIBCO']
const TABLES = ['appointments', 'appointment_items', 'sales', 'sale_items', 'payments', 'clients', 'team_members', 'services', 'products', 'stock_movements', 'gift_cards', 'memberships']

const secret = () => Array.from({ length: 20 }, () => 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 54)]).join('')

/** /reports/data-connector (reports.md §1.7): intro → enable screen → Active state, inside the reports panel. */
export function DataConnectorPage() {
  const loading = usePageLoading()
  const record = findAddOn(useDb((s) => s.addOns), 'data-connector')
  return <ReportsLayout active="dc">{loading ? <PageSkeleton /> : isAddOnOn(record) ? <ActiveConnector /> : <ConnectorIntro />}</ReportsLayout>
}

function ConnectorIntro() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const bullets = t('reports.dc.bullets', { returnObjects: true }) as string[]
  return (
    <section className="card overflow-hidden">
      <div className="grid items-center gap-10 bg-gradient-to-br from-surface via-surface to-success-subtle p-10 lg:grid-cols-[1fr_minmax(0,360px)]">
        <div>
          <p className="flex items-center gap-3 text-body-strong text-ink">
            <span className="flex h-12 w-12 items-center justify-center rounded-md bg-success text-white">
              <Link2 size={22} aria-hidden />
            </span>
            {t('reports.dc.tag')}
          </p>
          <h1 className="mt-6 font-display text-[32px] font-bold leading-[40px] text-ink">{t('reports.dc.title')}</h1>
          <p className="mt-4 max-w-xl text-body-lg text-ink">{t('reports.dc.body')}</p>
          <ul className="mt-5 flex flex-col gap-2">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-body-lg text-ink">
                <Check size={20} className="mt-0.5 shrink-0" aria-hidden />
                {b}
              </li>
            ))}
          </ul>
          <p className="mt-10 font-display text-title-2 text-ink">{t('reports.dc.price')}</p>
          <div className="mt-8 flex items-center gap-6">
            <Button variant="primary" size="lg" onClick={() => navigate('/add-ons/add-on/data-connector/setup?return=/reports/data-connector')}>
              {t('reports.dc.startNow')}
            </Button>
            <LearnMore topic="Data Connector">{t('reports.dc.learnMore')}</LearnMore>
          </div>
        </div>
        <div className="hidden lg:block" aria-hidden>
          <div className="relative mx-auto w-[260px] rounded-xl bg-surface p-5 shadow-md">
            <p className="text-small font-semibold text-ink">{t('reports.dc.artClients')}</p>
            <p className="font-display text-title-2 text-ink">3,400</p>
            <div className="mt-3 flex h-28 items-end gap-3">
              {[70, 55, 40, 62, 85].map((h, i) => (
                <span key={i} className="flex flex-1 flex-col justify-end overflow-hidden rounded-t-sm bg-primary-subtle" style={{ height: `${h}%` }}>
                  <span className="bg-primary" style={{ height: `${h - 15}%` }} />
                </span>
              ))}
            </div>
            <span className="absolute -right-10 -top-6 flex h-16 w-16 items-center justify-center rounded-lg bg-surface shadow-md">
              <Database size={28} className="text-accent" />
            </span>
          </div>
        </div>
      </div>
      <div className="px-10 pb-10">
        <h2 className="mb-4 text-body-strong text-ink">{t('reports.dc.sync')}</h2>
        <ul className="flex flex-wrap gap-3">
          {LOGOS.map((l) => (
            <li key={l} title={l} className="flex h-14 w-14 items-center justify-center rounded-md border border-line bg-surface px-1 text-center text-[10px] font-bold uppercase leading-tight text-muted">
              {l}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function ActiveConnector() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const record = findAddOn(useDb((s) => s.addOns), 'data-connector')
  const workspace = useDb((s) => s.workspace)
  const [busy, setBusy] = useState<'gen' | 'sync' | null>(null)
  const config = record?.config ?? {}
  const username = typeof config.username === 'string' ? config.username : null
  const password = typeof config.password === 'string' ? config.password : ''
  const lastSyncedAt = typeof config.lastSyncedAt === 'string' ? config.lastSyncedAt : null
  const host = 'dc-eu-west.innoweb.app'
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
    toast(t(username ? 'reports.dc.regenerated' : 'reports.dc.generated'))
  }
  const sync = async () => {
    setBusy('sync')
    await updateAddOnConfig('data-connector', { lastSyncedAt: nowISO() })
    setBusy(null)
    toast(t('reports.dc.synced'))
  }
  const rows: [string, string][] = [[t('reports.dc.host'), host], [t('reports.dc.port'), '5432'], [t('reports.dc.database'), database], ...(username ? ([[t('reports.dc.username'), username], [t('reports.dc.password'), password]] as [string, string][]) : [])]

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 font-display text-title-1 text-ink">
            {t('reports.dc.activeTitle')} <Chip tone="success">{t('reports.dc.active')}</Chip>
          </h1>
          <p className="mt-1 max-w-2xl text-body-lg text-muted">{t('reports.dc.activeBody')}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate('/add-ons/manage/data-connector')}>{t('reports.dc.manage')}</Button>
          <Button icon={<RefreshCw size={16} />} loading={busy === 'sync'} onClick={() => void sync()}>
            {t('reports.dc.syncNow')}
          </Button>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <section className="card p-6">
          <h2 className="mb-2 text-body-strong text-ink">{t('reports.dc.credentials')}</h2>
          <dl className="flex flex-col divide-y divide-line">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 py-3">
                <dt className="text-body text-muted">{label}</dt>
                <dd className="flex items-center gap-2 font-mono text-body text-ink">
                  {value}
                  <button type="button" className="icon-btn h-8 w-8" aria-label={`${t('reports.dc.copy')} ${label}`} onClick={() => void copy(value)}>
                    <Copy size={14} aria-hidden />
                  </button>
                </dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 py-3">
              <dt className="text-body text-muted">{t('reports.dc.lastSync')}</dt>
              <dd className="text-body text-ink">{lastSyncedAt ? fmtDateTime(lastSyncedAt) : t('reports.dc.never')}</dd>
            </div>
          </dl>
          {!username && <p className="mt-2 text-body text-muted">{t('reports.dc.noCredentials')}</p>}
          <Button className="mt-4" variant={username ? 'secondary' : 'primary'} loading={busy === 'gen'} onClick={() => void generate()}>
            {username ? t('reports.dc.regenerate') : t('reports.dc.generate')}
          </Button>
        </section>
        <section className="card p-6">
          <h2 className="mb-3 text-body-strong text-ink">{t('reports.dc.tables')}</h2>
          <ul className="flex flex-col gap-1.5">
            {TABLES.map((tb) => (
              <li key={tb} className="flex items-center gap-2 font-mono text-small text-muted">
                <Database size={14} aria-hidden />
                {tb}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
