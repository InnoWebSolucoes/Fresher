import { create } from 'zustand'
import { importClients, type ImportRow } from '@/api/clients'
import { autoMap, parseCsv, type Mapping } from '../lib/csv'

export interface ImportFile {
  name: string
  size: number
  headers: string[]
  rows: string[][]
}

type RunStatus = 'idle' | 'running' | 'done' | 'failed'

interface ImportState {
  file: ImportFile | null
  mapping: Mapping | null
  status: RunStatus
  imported: number
  /** Rows waiting to be imported when the progress step starts. */
  pending: ImportRow[]
  setFile: (name: string, size: number, text: string) => 'ok' | 'empty'
  clearFile: () => void
  setMapping: (mapping: Mapping) => void
  run: (rows: ImportRow[]) => Promise<void>
  retry: () => Promise<void>
  reset: () => void
}

/** Wizard state that survives step changes (each step is its own URL). */
export const useImportWizard = create<ImportState>()((set, get) => ({
  file: null,
  mapping: null,
  status: 'idle',
  imported: 0,
  pending: [],
  setFile(name, size, text) {
    const parsed = parseCsv(text)
    const [headers, ...rows] = parsed
    if (!headers || rows.length === 0) return 'empty'
    set({ file: { name, size, headers, rows }, mapping: autoMap(headers), status: 'idle', imported: 0 })
    return 'ok'
  },
  clearFile: () => set({ file: null, mapping: null }),
  setMapping: (mapping) => set({ mapping }),
  async run(rows) {
    if (get().status === 'running') return
    set({ status: 'running', pending: rows, imported: 0 })
    try {
      const count = await importClients(rows)
      set({ status: 'done', imported: count, pending: [] })
    } catch {
      set({ status: 'failed' })
    }
  },
  retry: () => get().run(get().pending),
  reset: () => set({ file: null, mapping: null, status: 'idle', imported: 0, pending: [] }),
}))
