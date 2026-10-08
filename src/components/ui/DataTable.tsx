import clsx from 'clsx'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  /** Value used for sorting; enables a sortable header. */
  sortValue?: (row: T) => string | number
  align?: 'left' | 'right'
  width?: string
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  /** Grey first row (e.g. report "Total"). */
  totalRow?: Partial<Record<string, ReactNode>>
  empty?: ReactNode
  selectable?: { selected: Set<string>; onChange: (next: Set<string>) => void }
  /** Rows per page; footer shows "Viewing 1 - N of M results". */
  pageSize?: number
  initialSort?: { key: string; dir: 'asc' | 'desc' }
  className?: string
  footer?: boolean
}

/** Table used by list pages and reports. */
export function DataTable<T>({ columns, rows, rowKey, onRowClick, totalRow, empty, selectable, pageSize = 50, initialSort, className, footer = true }: DataTableProps<T>) {
  const [sort, setSort] = useState(initialSort)
  const [page, setPage] = useState(0)
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort?.key)
    if (!col?.sortValue || !sort) return rows
    const factor = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const va = col.sortValue!(a)
      const vb = col.sortValue!(b)
      return (va < vb ? -1 : va > vb ? 1 : 0) * factor
    })
  }, [rows, columns, sort])
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const current = Math.min(page, pages - 1)
  const visible = sorted.slice(current * pageSize, current * pageSize + pageSize)
  const allSelected = selectable && rows.length > 0 && rows.every((r) => selectable.selected.has(rowKey(r)))

  return (
    <div className={clsx('overflow-hidden rounded-lg border border-line bg-surface', className)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-left text-body">
          <thead>
            <tr className="border-b border-line">
              {selectable && (
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={Boolean(allSelected)}
                    onChange={(e) => selectable.onChange(new Set(e.target.checked ? rows.map(rowKey) : []))}
                    className="h-4 w-4 accent-[rgb(var(--primary))]"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th key={col.key} style={{ width: col.width }} className={clsx('whitespace-nowrap px-4 py-3 text-body-strong text-ink', col.align === 'right' && 'text-right')}>
                  {col.sortValue ? (
                    <button
                      type="button"
                      onClick={() => setSort((s) => ({ key: col.key, dir: s?.key === col.key && s.dir === 'desc' ? 'asc' : 'desc' }))}
                      className="inline-flex items-center gap-1 hover:text-primary"
                    >
                      {col.header}
                      {sort?.key === col.key && (sort.dir === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {totalRow && rows.length > 0 && (
              <tr className="border-b border-line bg-sunken font-semibold">
                {selectable && <td />}
                {columns.map((col) => (
                  <td key={col.key} className={clsx('whitespace-nowrap px-4 py-3', col.align === 'right' && 'text-right tabular')}>
                    {totalRow[col.key] ?? ''}
                  </td>
                ))}
              </tr>
            )}
            {visible.map((row) => {
              const key = rowKey(row)
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={clsx('border-b border-line last:border-0', onRowClick && 'cursor-pointer hover:bg-sunken/60', selectable?.selected.has(key) && 'bg-primary-subtle/40')}
                >
                  {selectable && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label="Select row"
                        checked={selectable.selected.has(key)}
                        onChange={(e) => {
                          const next = new Set(selectable.selected)
                          if (e.target.checked) next.add(key)
                          else next.delete(key)
                          selectable.onChange(next)
                        }}
                        className="h-4 w-4 accent-[rgb(var(--primary))]"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className={clsx('px-4 py-3 align-middle', col.align === 'right' && 'text-right tabular', col.className)}>
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (empty ?? <p className="px-6 py-10 text-center text-body text-muted">No results found — Try using different filters</p>)}
      {footer && rows.length > 0 && (
        <div className="flex items-center justify-center gap-4 border-t border-line px-4 py-3 text-small text-muted">
          {pages > 1 && (
            <button type="button" className="btn-ghost h-8 px-3" disabled={current === 0} onClick={() => setPage(current - 1)}>
              Previous
            </button>
          )}
          <span>
            Viewing {current * pageSize + 1} - {Math.min(sorted.length, (current + 1) * pageSize)} of {sorted.length} results
          </span>
          {pages > 1 && (
            <button type="button" className="btn-ghost h-8 px-3" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
              Next
            </button>
          )}
        </div>
      )}
    </div>
  )
}
