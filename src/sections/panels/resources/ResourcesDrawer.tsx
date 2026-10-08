import clsx from 'clsx'
import { CircleHelp, Newspaper, Rocket } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DrawerProps } from '@/app/sectionRegistry'
import { useDrawer } from '@/lib/drawer'
import { Button, toast } from '@/components/ui'
import { markNewsRead, setNewsAction, usePanels } from '@/api/panels'
import { BottomTabs, PanelHeader } from '../shared'
import { HelpPanel } from './Help'
import { GuidesPanel } from './Guides'

type Tab = 'news' | 'help' | 'guides'

/** Resources drawer: News, Help and Guides with a bottom tab bar (top-bar.md §1, help.md). */
export function ResourcesDrawer({ params }: DrawerProps) {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const raw = params.get('tab')
  const tab: Tab = raw === 'news' || raw === 'guides' ? raw : 'help'
  const newsRead = usePanels((s) => s.newsRead)
  const unreadNews = NEWS.filter((n) => !newsRead.includes(n.id)).length

  return (
    <div className="flex h-full flex-col" aria-label={t('drawers.resources')}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'news' && <NewsPanel />}
        {tab === 'help' && <HelpPanel params={params} />}
        {tab === 'guides' && <GuidesPanel params={params} />}
      </div>
      <BottomTabs<Tab>
        value={tab}
        onChange={(v) => drawer.update({ tab: v, view: undefined, d_article: undefined, d_guide: undefined, d_q: undefined })}
        items={[
          { value: 'news', label: t('panels.resources.news'), icon: Newspaper, badge: unreadNews },
          { value: 'help', label: t('panels.resources.help'), icon: CircleHelp },
          { value: 'guides', label: t('panels.resources.guides'), icon: Rocket },
        ]}
      />
    </div>
  )
}

const NEWS = [
  { id: 'welcome', action: null },
  { id: 'instagram', action: 'instagram' },
  { id: 'youtube', action: 'youtube' },
] as const

function NewsPanel() {
  const { t } = useTranslation()
  const newsRead = usePanels((s) => s.newsRead)
  const actions = usePanels((s) => s.newsActions)
  const [unreadAtOpen] = useState(() => NEWS.filter((n) => !usePanels.getState().newsRead.includes(n.id)).map((n) => n.id as string))
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    markNewsRead(NEWS.map((n) => n.id))
  }, [])

  const toggle = async (id: string) => {
    const done = actions.includes(id)
    setBusy(id)
    try {
      await setNewsAction(id, !done)
      toast(t(`panels.news.${id}.${done ? 'undoneToast' : 'doneToast'}`))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <PanelHeader title={t('panels.news.title')} />
      <div className="flex flex-col gap-4 px-6 pb-6">
        {NEWS.map((item) => {
          const unread = unreadAtOpen.includes(item.id) || !newsRead.includes(item.id)
          const action = item.action
          const done = action ? actions.includes(action) : false
          return (
            <article key={item.id} className="card relative overflow-hidden p-5">
              {unread && <span className="absolute right-4 top-4 h-2.5 w-2.5 rounded-full bg-primary" aria-label={t('panels.common.unread')} />}
              {item.id === 'welcome' && <WelcomeArt />}
              <h3 className="pr-6 font-display text-title-3 text-ink">{t(`panels.news.${item.id}.title`)}</h3>
              <p className="text-caption text-muted">{t('panels.news.postedAgo')}</p>
              <p className="mt-2 text-body text-ink">{t(`panels.news.${item.id}.body`)}</p>
              {action && (
                <Button className="mt-4 rounded-full" size="sm" variant={done ? 'secondary' : 'primary'} loading={busy === action} onClick={() => toggle(action)}>
                  {t(`panels.news.${item.id}.${done ? 'doneLabel' : 'cta'}`)}
                </Button>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}

/** Original artwork: a miniature calendar on a teal card. */
function WelcomeArt() {
  const blocks = [
    ['bg-[#D1EEEB]', 'h-8'],
    ['bg-[#FCEBC6]', 'h-12'],
    ['bg-[#D6E8FB]', 'h-6'],
    ['bg-[#FBDDEB]', 'h-10'],
  ]
  return (
    <div className="mb-4 overflow-hidden rounded-md bg-gradient-to-br from-primary to-primary-active p-4" aria-hidden>
      <div className="rounded-sm bg-surface p-3 shadow-md">
        <div className="mb-2 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary" />
          <span className="h-1.5 w-16 rounded-full bg-sunken" />
          <span className="ml-auto h-1.5 w-8 rounded-full bg-accent" />
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {blocks.map(([bg, h], i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <span className={clsx('rounded-xs', bg, h)} />
              <span className={clsx('rounded-xs', blocks[(i + 2) % 4][0], 'h-5')} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
