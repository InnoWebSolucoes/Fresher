/** Random id with a readable prefix, e.g. `apt_k3j9x2p1`. */
export function uid(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return `${prefix}_${Array.from(bytes, (b) => (b % 36).toString(36)).join('')}${Date.now().toString(36).slice(-3)}`
}

/** 8-character uppercase hex booking reference like "488A0EEF". */
export function bookingRef(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

/** 8-letter gift card code like "AXOJWIJQ". */
export function giftCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => String.fromCharCode(65 + (b % 26))).join('')
}
