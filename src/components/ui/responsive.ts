import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'

/** Phones are below Tailwind's `md` breakpoint (768px). */
const PHONE_QUERY = '(max-width: 767px)'

const matches = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches

/** True on phone-width screens (< 768px); follows rotation and window resizes. */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(PHONE_QUERY)
    const onChange = () => setPhone(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return phone
}

/**
 * Keeps an absolutely positioned popup (menu, popover) inside the screen on
 * phones: returns a sideways offset in px to apply as a translateX. Desktop
 * (≥ 768px) always gets 0, so its placement is unchanged.
 */
export function useKeepOnScreen(ref: RefObject<HTMLElement | null>, open: boolean, gutter = 8): number {
  const [shift, setShift] = useState(0)
  useLayoutEffect(() => {
    if (!open) {
      setShift(0)
      return
    }
    const el = ref.current
    if (!el || !matches()) return
    const measure = () => {
      const vw = document.documentElement.clientWidth
      // Measure without the current shift.
      const r = el.getBoundingClientRect()
      const left = r.left - shiftOf(el)
      const right = left + r.width
      let dx = 0
      if (right > vw - gutter) dx = vw - gutter - right
      if (left + dx < gutter) dx = gutter - left
      setShift(Math.round(dx))
    }
    measure()
  }, [open, ref, gutter])
  return shift
}

function shiftOf(el: HTMLElement): number {
  const m = /translateX\((-?[\d.]+)px\)/.exec(el.style.transform)
  return m ? Number(m[1]) : 0
}
