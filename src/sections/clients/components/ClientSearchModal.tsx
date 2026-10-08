import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Client, ID } from '@/types'
import { useDb } from '@/store/db'
import { Modal, SearchInput } from '@/components/ui'
import { ClientAvatar } from './common'
import { clientName } from '../lib/helpers'

/** "Search for client" modal (merge "Add another client", referred by). */
export function ClientSearchModal({ open, onClose, onPick, exclude = [], title }: { open: boolean; onClose: () => void; onPick: (client: Client) => void; exclude?: ID[]; title?: string }) {
  if (!open) return null
  return <Body onClose={onClose} onPick={onPick} exclude={exclude} title={title} />
}

function Body({ onClose, onPick, exclude, title }: { onClose: () => void; onPick: (client: Client) => void; exclude: ID[]; title?: string }) {
  const { t } = useTranslation()
  const clients = useDb((s) => s.clients)
  const [query, setQuery] = useState('')
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return clients
      .filter((c) => !c.deletedAt && !exclude.includes(c.id))
      .filter((c) => !q || clientName(c).toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')))
      .sort((a, b) => clientName(a).localeCompare(clientName(b)))
      .slice(0, 40)
  }, [clients, exclude, query])
  return (
    <Modal open onClose={onClose} title={title ?? t('clients.search.title')} size="md">
      <SearchInput value={query} onChange={setQuery} placeholder={t('clients.search.placeholder')} className="mb-3" />
      <ul className="-mx-2 max-h-[50vh] overflow-y-auto">
        {results.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => {
                onPick(c)
                onClose()
              }}
              className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-sunken"
            >
              <ClientAvatar client={c} size={40} />
              <span className="min-w-0">
                <span className="block truncate text-body-strong text-ink">{clientName(c)}</span>
                <span className="block truncate text-small text-muted">{c.email || c.phone || '—'}</span>
              </span>
            </button>
          </li>
        ))}
        {results.length === 0 && <li className="px-2 py-8 text-center text-body text-muted">{t('clients.common.noResults')}</li>}
      </ul>
    </Modal>
  )
}
