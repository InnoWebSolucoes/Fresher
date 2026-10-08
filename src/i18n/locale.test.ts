import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import en from '@locales/en.json'

/** Every literal t('…') key used in the code must exist in locales/en.json. */
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

describe('locales/en.json', () => {
  it('contains every literal translation key used in the source', () => {
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

  it('never names the reference product', () => {
    expect(JSON.stringify(en)).not.toMatch(/fresha/i)
  })
})
