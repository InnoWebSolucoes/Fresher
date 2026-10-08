// Merges section string files (src/sections/<name>/en*.json) into the single
// locales/en.json under the section's key, then deletes the section files.
// Run with: node scripts/merge-locales.mjs
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const localePath = join(root, 'locales', 'en.json')
const sectionsDir = join(root, 'src', 'sections')

const isTree = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
const merge = (base, extra) => {
  const out = { ...base }
  for (const [key, value] of Object.entries(extra)) out[key] = isTree(value) && isTree(out[key]) ? merge(out[key], value) : value
  return out
}

let en = JSON.parse(readFileSync(localePath, 'utf8'))
const merged = []
for (const section of readdirSync(sectionsDir)) {
  const dir = join(sectionsDir, section)
  let files
  try {
    files = readdirSync(dir).filter((f) => /^en(\..+)?\.json$/.test(f)).sort()
  } catch {
    continue
  }
  for (const file of files) {
    const content = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    if (Object.keys(content).length) en = merge(en, { [section]: content })
    unlinkSync(join(dir, file))
    merged.push(`${section}/${file}`)
  }
}
writeFileSync(localePath, `${JSON.stringify(en, null, 2)}\n`)
console.log(`Merged ${merged.length} files into locales/en.json`)
