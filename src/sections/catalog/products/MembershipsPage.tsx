import clsx from 'clsx'
import { BadgeCheck, CalendarCheck, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, EmptyState, IntroPage, LearnMore, Menu, Modal, Page, PageHeader, PillTabs, SearchInput, confirm, toast, usePageLoading } from '@/components/ui'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { money } from '@/lib/format'
import { PALETTE } from '@/styles/palette'
import type { Membership, Service } from '@/types'
import { deleteMembership, setMembershipArchived } from '@/api/catalog'
import { isPalette } from '../lib'
import { CardsSkeleton, ToolbarCard, useIntroProps } from '../ui'

const P = 'catalog.products2.memberships'

export const membershipColor = (color: string) => (isPalette(color) ? PALETTE[color].edge : PALETTE.blue.edge)

/** "4 sessions · Blow Dry, Wash & blow dry" lines for a membership's benefits. */
export function useBenefitLines() {
  const { t } = useTranslation()
  return (m: Pick<Membership, 'benefits'>, services: Service[]) =>
    m.benefits.map((b) => {
      const names = b.serviceIds.map((id) => services.find((s) => s.id === id)?.name).filter(Boolean)
      const sessions = b.sessions === 'unlimited' ? t(`${P}.unlimited`) : t(`${P}.sessions`, { count: b.sessions })
      return `${sessions} · ${names.join(', ') || t(`${P}.noServices`)}`
    })
}

/** Memberships list (catalog.md §3). */
export function MembershipsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const loading = usePageLoading()
  const intro = useIntroProps(t('nav.memberships'))
  const memberships = useDb((s) => s.memberships)
  const services = useDb((s) => s.services)
  const clientMemberships = useDb((s) => s.clientMemberships)
  const benefitLines = useBenefitLines()
  const paymentsOn = useDb((s) => s.addOns.some((a) => a.slug === 'payments' && a.status === 'active'))
  const [gateOpen, setGateOpen] = useState(false)
  // Memberships charge saved cards, so creating one needs Payments (catalog.md §3).
  const startAdd = () => (paymentsOn ? navigate('/catalogue/memberships/add') : setGateOpen(true))
  const gate = (
    <Modal
      open={gateOpen}
      onClose={() => setGateOpen(false)}
      title={t(`${P}.gateTitle`)}
      footer={
        <Button variant="primary" onClick={() => navigate('/add-ons/add-on/payments/intro')}>
          {t(`${P}.gateContinue`)}
        </Button>
      }
    >
      <p className="pb-2 text-body-lg text-ink">{t(`${P}.gateBody`)}</p>
    </Modal>
  )
  const [tab, setTab] = useState<'active' | 'archived'>('active')
  const [query, setQuery] = useState('')

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return memberships.filter((m) => (tab === 'archived' ? m.archived : !m.archived) && (!q || m.name.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name))
  }, [memberships, tab, query])
  const holders = (id: string) => clientMemberships.filter((c) => c.membershipId === id && c.status === 'active').length
  const archivedCount = memberships.filter((m) => m.archived).length

  const archive = async (m: Membership, archived: boolean) => {
    if (archived && !(await confirm({ title: t(`${P}.archiveTitle`), body: t(`${P}.archiveBody`, { name: m.name }), confirmLabel: t('catalog.common.archive') }))) return
    await setMembershipArchived(m.id, archived)
    toast(archived ? t(`${P}.toasts.archived`) : t(`${P}.toasts.unarchived`))
  }
  const remove = async (m: Membership) => {
    if (!(await confirm({ title: t(`${P}.deleteTitle`), body: t(`${P}.deleteBody`, { name: m.name }), confirmLabel: t('catalog.common.delete'), tone: 'danger' }))) return
    await deleteMembership(m.id)
    toast(t(`${P}.toasts.deleted`))
  }

  if (loading) {
    return (
      <Page wide>
        <CardsSkeleton />
      </Page>
    )
  }

  if (memberships.length === 0) {
    return (
      <Page wide>
        <IntroPage
          {...intro}
          title={t(`${P}.introTitle`)}
          body={t(`${P}.introBody`)}
          bullets={[t(`${P}.introB1`), t(`${P}.introB2`), t(`${P}.introB3`)]}
          primary={{ label: t('catalog.common.startNow'), onClick: startAdd }}
          art={
            <div className="mx-auto flex max-w-xs flex-col gap-3 py-8">
              {[
                { name: t(`${P}.artName`), price: `${money(80)} / ${t(`${P}.interval.month`)}` },
                { name: t(`${P}.artName`), price: `${money(120)} / ${t(`${P}.interval.week`)}` },
              ].map((c, i) => (
                <div key={i} className="rounded-xl p-5 text-white shadow-md" style={{ background: membershipColor(i ? 'purple' : 'blue') }}>
                  <p className="font-display text-title-3">{c.name}</p>
                  <p className="mt-6 text-right font-display text-title-2">{c.price}</p>
                </div>
              ))}
            </div>
          }
        />
        {gate}
      </Page>
    )
  }

  return (
    <Page wide>
      <PageHeader
        title={t(`${P}.title`)}
        count={memberships.filter((m) => !m.archived).length}
        subtitle={
          <>
            {t(`${P}.subtitle`)} <LearnMore topic={t('nav.memberships')}>{t('catalog.common.learnMore')}</LearnMore>
          </>
        }
        actions={
          <Button variant="primary" onClick={startAdd}>
            {t('catalog.common.add')}
          </Button>
        }
      />
      <PillTabs
        className="mb-6"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'active', label: t('catalog.common.active') },
          { value: 'archived', label: t('catalog.common.archived'), count: archivedCount },
        ]}
      />
      <ToolbarCard>
        <SearchInput value={query} onChange={setQuery} placeholder={t(`${P}.search`)} className="w-full max-w-[300px]" />
      </ToolbarCard>
      {shown.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<BadgeCheck size={26} />}
            title={query ? t('catalog.common.noResults') : tab === 'archived' ? t(`${P}.emptyArchived`) : t(`${P}.empty`)}
            body={tab === 'active' && !query ? t(`${P}.emptyBody`) : undefined}
            action={
              tab === 'active' && !query ? (
                <Button variant="primary" onClick={startAdd}>
                  {t(`${P}.add`)}
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((m) => (
            <article key={m.id} className={clsx('card flex flex-col overflow-hidden', m.archived && 'opacity-80')}>
              <div className="flex items-start justify-between gap-3 p-5 text-white" style={{ background: membershipColor(m.color) }}>
                <div className="min-w-0">
                  <h2 className="truncate font-display text-title-2">{m.name}</h2>
                  <p className="mt-1 line-clamp-2 text-body opacity-90">{m.description || t(`${P}.noDescription`)}</p>
                </div>
                <div className="rounded-full bg-white/90 text-ink">
                  <Menu
                    groups={
                      m.archived
                        ? [
                            {
                              items: [
                                { label: t('catalog.common.edit'), onSelect: () => navigate(`/catalogue/memberships/edit/${m.id}`) },
                                { label: t('catalog.common.unarchive'), onSelect: () => void archive(m, false) },
                              ],
                            },
                            { items: [{ label: t('catalog.common.delete'), danger: true, onSelect: () => void remove(m) }] },
                          ]
                        : [
                            {
                              items: [
                                { label: t(`${P}.sell`), onSelect: () => drawer.open('checkout', { d_add: `membership:${m.id}` }) },
                                { label: t('catalog.common.edit'), onSelect: () => navigate(`/catalogue/memberships/edit/${m.id}`) },
                                { label: t('catalog.common.archive'), onSelect: () => void archive(m, true) },
                              ],
                            },
                          ]
                    }
                  />
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-4 p-5">
                <div>
                  <p className="font-display text-title-1 text-ink">
                    {money(m.price)} <span className="text-body-lg font-normal text-muted">/ {t(`${P}.interval.${m.interval}`)}</span>
                  </p>
                  {m.firstPeriodPrice !== undefined && <p className="text-small text-muted">{t(`${P}.firstPeriod`, { price: money(m.firstPeriodPrice), interval: t(`${P}.interval.${m.interval}`) })}</p>}
                </div>
                <ul className="flex flex-col gap-2">
                  {benefitLines(m, services).map((line, i) => (
                    <li key={i} className="flex items-start gap-2 text-body text-ink">
                      <CalendarCheck size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-4 text-small text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <Users size={14} aria-hidden />
                    {t(`${P}.holders`, { count: holders(m.id) })}
                  </span>
                  <span aria-hidden>·</span>
                  <span>{m.onlineSale ? t(`${P}.onlineOn`) : t(`${P}.onlineOff`)}</span>
                  {m.archived && <span className="chip ml-auto h-5 bg-sunken text-caption text-muted">{t('catalog.common.archived')}</span>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {gate}
    </Page>
  )
}
