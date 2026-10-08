import clsx from 'clsx'
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useDb } from '@/store/db'
import { money } from '@/lib/format'
import { durationLabel } from '@/lib/time'
import type { WebsiteConfig } from '@/api/online'
import { sampleImage, usePhone } from '../shared'

export interface Template {
  id: string
  palette: number
  fontPack: number
  hero: 'image' | 'band' | 'split' | 'arch'
}

export const TEMPLATES: Template[] = [
  { id: 'elegant', palette: 2, fontPack: 0, hero: 'image' },
  { id: 'bold', palette: 6, fontPack: 1, hero: 'band' },
  { id: 'editorial', palette: 0, fontPack: 2, hero: 'arch' },
  { id: 'noir', palette: 9, fontPack: 3, hero: 'image' },
  { id: 'crisp', palette: 4, fontPack: 4, hero: 'band' },
  { id: 'botanical', palette: 1, fontPack: 5, hero: 'split' },
]

/** [background, surface, text, accent, accent text] */
export const PALETTES: [string, string, string, string, string][] = [
  ['#faf6f1', '#ffffff', '#2b2420', '#b0805a', '#ffffff'],
  ['#f3f5ef', '#ffffff', '#24301f', '#6d8a5c', '#ffffff'],
  ['#f6f1ec', '#ffffff', '#1f1b18', '#1f1b18', '#f6f1ec'],
  ['#fdf4f4', '#ffffff', '#3a2228', '#c45b74', '#ffffff'],
  ['#eef0fb', '#ffffff', '#1e2140', '#6b74d6', '#ffffff'],
  ['#f2f7f8', '#ffffff', '#16313a', '#2f8a9b', '#ffffff'],
  ['#fff7e8', '#ffffff', '#2a1f0a', '#f0a92a', '#2a1f0a'],
  ['#f6f6f6', '#ffffff', '#111111', '#e0472b', '#ffffff'],
  ['#f4efe9', '#fbf8f4', '#3b2f2a', '#8c6d5a', '#ffffff'],
  ['#141414', '#1d1d1d', '#f4ede1', '#c9a45c', '#141414'],
  ['#10202a', '#162b38', '#e8f0f3', '#7fc4c9', '#10202a'],
  ['#fbf3f8', '#ffffff', '#33203a', '#9c5fb5', '#ffffff'],
]

export const FONT_PACKS: { heading: string; body: string }[] = [
  { heading: "Georgia, 'Times New Roman', serif", body: 'ui-sans-serif, system-ui, sans-serif' },
  { heading: "'Trebuchet MS', ui-sans-serif, sans-serif", body: 'ui-sans-serif, system-ui, sans-serif' },
  { heading: "'Palatino Linotype', Palatino, 'Book Antiqua', serif", body: "Georgia, serif" },
  { heading: "Didot, 'Bodoni MT', 'Times New Roman', serif", body: 'ui-sans-serif, system-ui, sans-serif' },
  { heading: "'Segoe UI', Helvetica, Arial, sans-serif", body: "'Segoe UI', Helvetica, Arial, sans-serif" },
  { heading: "'Gill Sans', 'Gill Sans MT', Calibri, sans-serif", body: "'Gill Sans', Calibri, sans-serif" },
]

/**
 * Live rendering of the generated site (used in the wizard, preview modals and
 * the dashboard). `page` shows a single page as visitors see it; the home page
 * (default) shows the hero followed by every visible page section.
 */
export function SitePreview({ config, mobile, compact, page = 'home' }: { config: WebsiteConfig; mobile?: boolean; compact?: boolean; page?: string }) {
  const workspace = useDb((s) => s.workspace)
  const services = useDb((s) => s.services)
  const team = useDb((s) => s.teamMembers)
  const locations = useDb((s) => s.locations)
  const [bg, surface, ink, accent, onAccent] = PALETTES[config.palette] ?? PALETTES[0]
  const font = FONT_PACKS[config.fontPack] ?? FONT_PACKS[0]
  const template = TEMPLATES.find((t) => t.id === config.template) ?? TEMPLATES[0]
  const featured = useMemo(() => services.filter((s) => !s.archived && s.onlineBooking).slice(0, 4), [services])
  const members = team.filter((m) => !m.archived && m.bookable).slice(0, 4)
  const nav = config.pages.filter((p) => !p.hidden && p.id !== 'home')
  const current = config.pages.find((p) => p.id === page)
  const single = page !== 'home' && current ? current : null
  const sections = single ? [single] : nav
  const heroImg = sampleImage(template.id.length)
  const s = compact ? 0.7 : 1
  const cta = (
    <span className="inline-block px-5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.15em] max-md:whitespace-nowrap" style={{ background: accent, color: onAccent }}>
      {config.hero.button}
    </span>
  )
  const heroText = (light: boolean) => (
    <div style={{ color: light ? '#fff' : ink }}>
      <p className="mb-3 text-[11px] uppercase tracking-[0.3em] opacity-80">{config.hero.eyebrow}</p>
      <h2 style={{ fontFamily: font.heading, fontSize: (mobile ? 28 : 44) * s, lineHeight: 1.1 }}>{config.hero.heading}</h2>
      <p className="mt-4 max-w-md text-[14px] opacity-90">{config.hero.text}</p>
      <div className="mt-6">{cta}</div>
    </div>
  )
  return (
    <div className="relative overflow-hidden" style={{ background: bg, color: ink, fontFamily: font.body }}>
      {!config.hideNavigation && (
        <div className={clsx('flex items-center justify-between gap-4 px-6 py-4', template.hero === 'image' && 'absolute left-0 right-0 z-10')} style={{ color: template.hero === 'image' ? '#fff' : ink }}>
          <span className="text-[14px] font-bold uppercase tracking-[0.15em]" style={{ fontFamily: font.heading }}>
            {workspace.name}
          </span>
          {!mobile && (
            <span className="flex gap-5 text-[13px]">
              {nav.map((p) => (
                <span key={p.id} className={clsx(p.id === page && 'underline underline-offset-4')}>
                  {p.name}
                </span>
              ))}
            </span>
          )}
          {cta}
        </div>
      )}
      {single ? (
        <div className={clsx('px-8 pb-10', template.hero === 'image' && !config.hideNavigation ? 'pt-24' : 'pt-10')} style={{ background: template.hero === 'image' ? ink : surface, color: template.hero === 'image' ? bg : ink }}>
          <h2 style={{ fontFamily: font.heading, fontSize: (mobile ? 28 : 40) * s, lineHeight: 1.1 }}>{single.name}</h2>
        </div>
      ) : (
        <div className="relative">
          {template.hero === 'image' && (
            <div className="relative flex min-h-[340px] items-center px-8 pb-12 pt-24" style={{ backgroundImage: `linear-gradient(rgba(0,0,0,.55),rgba(0,0,0,.55)), url("${heroImg}")`, backgroundSize: 'cover' }}>
              {heroText(true)}
            </div>
          )}
          {template.hero === 'band' && (
            <div className="px-8 py-14" style={{ background: accent }}>
              <div style={{ color: onAccent }}>
                <p className="mb-3 text-[11px] uppercase tracking-[0.3em] opacity-80">{config.hero.eyebrow}</p>
                <h2 style={{ fontFamily: font.heading, fontSize: (mobile ? 28 : 44) * s, lineHeight: 1.1 }}>{config.hero.heading}</h2>
                <p className="mt-4 max-w-md text-[14px] opacity-90">{config.hero.text}</p>
                <span className="mt-6 inline-block px-5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.15em]" style={{ background: onAccent, color: accent }}>
                  {config.hero.button}
                </span>
              </div>
            </div>
          )}
          {(template.hero === 'split' || template.hero === 'arch') && (
            <div className={clsx('grid items-center gap-6 px-8 py-12', !mobile && 'grid-cols-2')}>
              {heroText(false)}
              <img src={heroImg} alt="" className={clsx('h-64 w-full object-cover', template.hero === 'arch' ? 'rounded-t-full' : 'rounded-lg')} />
            </div>
          )}
        </div>
      )}
      {sections.map((p) => (
        <section key={p.id} className="px-8 py-10" style={{ background: p.id === 'team' || p.id === 'contact' ? surface : bg }}>
          {!(single && p.heading === p.name) && <h3 style={{ fontFamily: font.heading, fontSize: 26 * s }}>{p.heading}</h3>}
          <p className="mt-2 text-[14px] opacity-80">{p.text}</p>
          {p.id === 'services' && (
            <ul className={clsx('mt-5 grid gap-3', !mobile && 'grid-cols-2')}>
              {featured.map((sv) => (
                <li key={sv.id} className="flex justify-between border-b py-2 text-[14px]" style={{ borderColor: `${ink}22` }}>
                  <span>
                    {sv.name}
                    <span className="block text-[12px] opacity-60">{durationLabel(sv.durationMin)}</span>
                  </span>
                  <span>{money(sv.price)}</span>
                </li>
              ))}
            </ul>
          )}
          {p.id === 'team' && (
            <div className="mt-5 flex flex-wrap gap-4">
              {members.map((m) => (
                <div key={m.id} className="text-center text-[13px]">
                  <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full text-[16px] font-semibold" style={{ background: accent, color: onAccent }}>
                    {m.firstName[0]}
                    {m.lastName[0] ?? ''}
                  </div>
                  {m.firstName}
                </div>
              ))}
            </div>
          )}
          {p.id === 'contact' && (
            <ul className={clsx('mt-5 grid gap-4 text-[14px]', !mobile && 'grid-cols-2')}>
              {locations.map((l) => (
                <li key={l.id}>
                  <span className="block font-semibold">{l.name}</span>
                  <span className="block opacity-80">{[l.address.line1, l.address.postcode, l.address.city].filter(Boolean).join(', ')}</span>
                  <span className="block opacity-80">{l.phone}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}

/** Width the desktop rendering is laid out at before it is scaled down on phones. */
const DESKTOP_PREVIEW_WIDTH = 820
/** Lays children out at a fixed desktop width and scales them down to fit the available width. */
function ScaledToFit({ width, children }: { width: number; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ scale: number; height?: number }>({ scale: 1 })
  useLayoutEffect(() => {
    const o = outer.current
    const i = inner.current
    if (!o || !i) return
    const update = () => {
      const scale = Math.min(1, o.clientWidth / width)
      setBox({ scale, height: Math.ceil(i.offsetHeight * scale) })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(o)
    ro.observe(i)
    return () => ro.disconnect()
  }, [width])
  return (
    <div ref={outer} className="overflow-hidden" style={{ height: box.height }}>
      <div ref={inner} style={{ width, transform: `scale(${box.scale})`, transformOrigin: 'top left' }}>
        {children}
      </div>
    </div>
  )
}

/** Browser chrome around a preview. On phones the desktop rendering is shown scaled down to fit, like a thumbnail. */
export function BrowserFrame({ url, mobile, children }: { url: string; mobile?: boolean; children: ReactNode }) {
  const phone = usePhone()
  return (
    <div className={clsx('mx-auto overflow-hidden rounded-lg border border-line bg-surface shadow-md', mobile ? 'max-w-[380px]' : 'w-full')}>
      <div className="flex items-center gap-2 border-b border-line bg-sunken px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-danger/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
        <span className="ml-2 flex-1 truncate rounded-full bg-surface px-3 py-0.5 text-caption text-muted">{url}</span>
      </div>
      <div className="relative max-h-[560px] overflow-y-auto">{phone && !mobile ? <ScaledToFit width={DESKTOP_PREVIEW_WIDTH}>{children}</ScaledToFit> : children}</div>
    </div>
  )
}
