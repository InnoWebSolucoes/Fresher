import en from '@locales/en.json'
import { PAGES, REDIRECTS } from './routeRegistry'
import { RAIL_ITEMS, SETTINGS_CATEGORIES } from './navigation'
import { REPORTS } from './reportCatalog'

const pages = en.pages as Record<string, { title: string; subtitle: string }>

describe('route registry', () => {
  it('has unique ids and paths', () => {
    expect(new Set(PAGES.map((p) => p.id)).size).toBe(PAGES.length)
    expect(new Set(PAGES.map((p) => p.path)).size).toBe(PAGES.length)
  })

  it('gives every page a title and subtitle in en.json', () => {
    for (const page of PAGES) {
      expect(pages[page.id]?.title, page.id).toBeTruthy()
      expect(pages[page.id]?.subtitle, page.id).toBeTruthy()
    }
  })

  it('never uses the reference product name in a route', () => {
    const all = [...PAGES.map((p) => p.path), ...REDIRECTS.flatMap((r) => [r.from, r.to])]
    expect(all.filter((path) => /fresha/i.test(path))).toEqual([])
  })

  it('registers a page for every left-menu and settings link', () => {
    const resolvable = (to: string) => {
      const path = to.split(/[?#]/)[0]
      return PAGES.some((p) => p.path === path) || REDIRECTS.some((r) => r.from === path)
    }
    const links = [
      ...RAIL_ITEMS.flatMap((item) => [item.to, ...(item.panel?.groups.flatMap((g) => g.links.map((l) => l.to)) ?? [])]),
      ...SETTINGS_CATEGORIES.flatMap((c) => [c.to, ...c.groups.flatMap((g) => g.links.map((l) => l.to)), ...c.shortcuts.map((l) => l.to)]),
    ]
    expect(links.filter((to) => !resolvable(to))).toEqual([])
  })

  it('keeps the main menu order from SPEC §6', () => {
    expect(RAIL_ITEMS.map((i) => i.id)).toEqual(['home', 'calendar', 'sales', 'clients', 'catalog', 'online', 'marketing', 'team', 'reports', 'addons', 'settings'])
  })

  it('lists all 59 reports with unique slugs', () => {
    expect(REPORTS).toHaveLength(59)
    expect(new Set(REPORTS.map((r) => r.slug)).size).toBe(59)
    expect(REPORTS.filter((r) => r.premium)).toHaveLength(10)
  })
})

describe('locale file', () => {
  it('does not mention the reference product', () => {
    expect(JSON.stringify(en)).not.toMatch(/fresha/i)
  })
})
