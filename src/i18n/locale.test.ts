import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

type Tree = Record<string, unknown>
const isTree = (v: unknown): v is Tree => typeof v === 'object' && v !== null && !Array.isArray(v)
const merge = (base: Tree, extra: Tree): Tree => {
  const out: Tree = { ...base }
  for (const [key, value] of Object.entries(extra)) out[key] = isTree(value) && isTree(out[key]) ? merge(out[key] as Tree, value) : value
  return out
}

const LOCALES = join(__dirname, '..', '..', 'locales')
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Tree
/** locales/<lang>.json plus any locales/parts/*.<lang>.json (merged in the app the same way). */
function load(lang: 'en' | 'pt'): Tree {
  const partsDir = join(LOCALES, 'parts')
  const parts = existsSync(partsDir) ? readdirSync(partsDir).filter((f) => f.endsWith(`.${lang}.json`)) : []
  return parts.reduce((all, file) => merge(all, read(join(partsDir, file))), read(join(LOCALES, `${lang}.json`)))
}
const en = load('en')
const pt = load('pt')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

function has(tree: unknown, key: string): boolean {
  let node: unknown = tree
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null || !(part in node)) return false
    node = (node as Record<string, unknown>)[part]
  }
  return true
}

/** Every string leaf as [path, value]. */
function leaves(tree: unknown, prefix = ''): [string, string][] {
  if (typeof tree === 'string') return [[prefix, tree]]
  if (Array.isArray(tree)) return tree.flatMap((v, i) => leaves(v, `${prefix}[${i}]`))
  if (isTree(tree)) return Object.entries(tree).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k))
  return []
}
const leafMap = (tree: Tree) => new Map(leaves(tree))
const tokens = (s: string) => [...s.matchAll(/\{\{\s*[\w.]+\s*(?:,[^}]*)?\}\}|<\/?\w+\s*\/?>/g)].map((m) => m[0].replace(/\s+/g, '')).sort().join('|')

describe('locales', () => {
  it('contain every literal translation key used in the source', () => {
    const missing = new Set<string>()
    const keyPattern = /\bt\(\s*['"]([a-zA-Z][\w-]*(?:\.[\w-]+)+)['"]/g
    for (const file of sourceFiles(join(__dirname, '..'))) {
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(keyPattern)) {
        const key = match[1]
        // Plural keys are stored as key_one / key_other.
        if (!has(en, key) && !has(en, `${key}_one`) && !has(en, `${key}_other`)) missing.add(`${key}  (${file.split(/[\\/]src[\\/]/)[1]})`)
      }
    }
    expect([...missing].sort()).toEqual([])
  })

  it('Portuguese has every English string, with the same placeholders', () => {
    const ptLeaves = leafMap(pt)
    const problems: string[] = []
    for (const [key, value] of leaves(en)) {
      const translated = ptLeaves.get(key)
      if (translated === undefined) problems.push(`missing: ${key}`)
      else if (tokens(value) !== tokens(translated)) problems.push(`placeholders differ: ${key}`)
    }
    expect(problems.slice(0, 50)).toEqual([])
  })

  it('never names the reference product', () => {
    expect(JSON.stringify(en)).not.toMatch(/fresha/i)
    expect(JSON.stringify(pt)).not.toMatch(/fresha/i)
  })
})
