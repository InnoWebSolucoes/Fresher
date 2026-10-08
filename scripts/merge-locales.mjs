// Folds string files written during parallel work (locales/parts/<name>.en.json and
// <name>.pt.json) into locales/en.json and locales/pt.json, keeping en.json's key order
// in pt.json, then deletes the parts files.
// Run with: node scripts/merge-locales.mjs
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const localesDir = join(root, 'locales')
const partsDir = join(localesDir, 'parts')

const isTree = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
const merge = (base, extra) => {
  const out = { ...base }
  for (const [key, value] of Object.entries(extra)) out[key] = isTree(value) && isTree(out[key]) ? merge(out[key], value) : value
  return out
}
/** Same key order as the English tree. */
const ordered = (shape, tree) => {
  if (!isTree(shape) || !isTree(tree)) return tree
  const out = {}
  for (const key of Object.keys(shape)) if (key in tree) out[key] = ordered(shape[key], tree[key])
  for (const key of Object.keys(tree)) if (!(key in out)) out[key] = tree[key]
  return out
}

const files = existsSync(partsDir) ? readdirSync(partsDir).filter((f) => /\.(en|pt)\.json$/.test(f)).sort() : []
const result = {}
for (const lang of ['en', 'pt']) {
  const path = join(localesDir, `${lang}.json`)
  result[lang] = files.filter((f) => f.endsWith(`.${lang}.json`)).reduce((tree, f) => merge(tree, JSON.parse(readFileSync(join(partsDir, f), 'utf8'))), JSON.parse(readFileSync(path, 'utf8')))
}
result.pt = ordered(result.en, result.pt)
for (const lang of ['en', 'pt']) writeFileSync(join(localesDir, `${lang}.json`), `${JSON.stringify(result[lang], null, 2)}\n`)
for (const f of files) unlinkSync(join(partsDir, f))
console.log(`Merged ${files.length} parts files into locales/en.json and locales/pt.json`)
