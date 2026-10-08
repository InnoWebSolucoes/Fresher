// Moves the built site from dist/ into dist/<base>/ so a host serves it at /<base>/
// (innoweb.agency/bookings proxies to this project's /bookings/ path).
// Run with: node scripts/nest-dist.mjs bookings
import { mkdirSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'

const base = process.argv[2]
if (!base) throw new Error('Usage: node scripts/nest-dist.mjs <base>')
const dist = new URL('../dist', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const target = join(dist, base)
const entries = readdirSync(dist).filter((name) => name !== base)
mkdirSync(target, { recursive: true })
for (const name of entries) renameSync(join(dist, name), join(target, name))
console.log(`Moved ${entries.length} entries into dist/${base}/`)
