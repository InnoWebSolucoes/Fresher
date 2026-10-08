import { format, parseISO } from 'date-fns'
import type { Appointment, Client, Sale } from '@/types'
import { COUNTRY_CODES } from './constants'

export const clientName = (c: Pick<Client, 'firstName' | 'lastName'> | null | undefined) => (c ? `${c.firstName} ${c.lastName}`.trim() : '')

/** Split "+351 912 345 678" into the country-code select and the number field. */
export function splitPhone(phone: string | undefined): { code: string; number: string } {
  const value = (phone ?? '').trim()
  if (!value) return { code: '+351', number: '' }
  const code = [...COUNTRY_CODES].sort((a, b) => b.length - a.length).find((c) => value.startsWith(c))
  if (code) return { code, number: value.slice(code.length).trim() }
  return { code: '+351', number: value }
}

export const joinPhone = (code: string, number: string) => (number.trim() ? `${code} ${number.trim()}` : '')

/** "14 March 1990" */
export const fmtBirthday = (iso: string) => format(parseISO(iso), 'd MMMM yyyy')
/** "March 14, 1990" */
export const fmtLongDate = (iso: string) => format(parseISO(iso), 'MMMM d, yyyy')

export const appointmentValue = (a: Pick<Appointment, 'items'>) => a.items.reduce((s, i) => s + i.price + i.addOns.reduce((x, o) => x + o.price, 0), 0)

export const appointmentDuration = (a: Pick<Appointment, 'items'>) => a.items.reduce((s, i) => s + i.durationMin + i.extraTime.reduce((x, e) => x + e.durationMin, 0) + i.addOns.reduce((x, o) => x + o.durationMin, 0), 0)

/** Sale value without tips (what counts as "sales" for a client). */
export const saleItemsTotal = (s: Pick<Sale, 'items'>) => s.items.reduce((x, i) => x + i.unitPrice * i.quantity, 0)

export const isPaidSale = (s: Sale) => s.kind === 'sale' && (s.status === 'completed' || s.status === 'part_paid')

const ALLOWED = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'H1', 'H2', 'UL', 'OL', 'LI', 'SPAN', 'FONT', 'DIV', 'A'])

/** Keep the simple formatting the note editor produces; drop scripts, handlers and unknown tags. */
export function sanitizeHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return html.replace(/<[^>]*>/g, '')
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const walk = (node: Element) => {
    ;[...node.children].forEach((child) => {
      if (!ALLOWED.has(child.tagName)) {
        if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE' || child.tagName === 'IFRAME') {
          child.remove()
          return
        }
        child.replaceWith(...child.childNodes)
        return
      }
      ;[...child.attributes].forEach((attr) => {
        const keep = (attr.name === 'style' && /^(\s*color:[^;]+;?\s*)$/i.test(attr.value)) || (child.tagName === 'FONT' && attr.name === 'color') || (child.tagName === 'A' && attr.name === 'href' && /^https?:/i.test(attr.value))
        if (!keep) child.removeAttribute(attr.name)
      })
      walk(child)
    })
  }
  const root = doc.body.firstElementChild
  if (!root) return ''
  walk(root)
  return root.innerHTML
}

export const htmlToText = (html: string) => {
  if (typeof DOMParser === 'undefined') return html.replace(/<[^>]*>/g, ' ')
  return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? ''
}

export const fileSize = (bytes: number) => (bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)
