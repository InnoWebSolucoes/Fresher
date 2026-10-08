import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { ID } from '@/types'
import { useDb } from '@/store/db'
import { Button, Modal, SearchInput } from '@/components/ui'

/** "Client segments" picker used by the clients list filters (calendar.md §3 item 8). */
export function SegmentsPickerModal({ open, onClose, value, onApply }: { open: boolean; onClose: () => void; value: ID[]; onApply: (ids: ID[]) => void }) {
  if (!open) return null
  return <PickerBody onClose={onClose} value={value} onApply={onApply} />
}

function PickerBody({ onClose, value, onApply }: { onClose: () => void; value: ID[]; onApply: (ids: ID[]) => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const segments = useDb((s) => s.segments)
  const [selected, setSelected] = useState<ID[]>(value)
  const [query, setQuery] = useState('')
  const visible = segments.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()))
  const all = segments.length > 0 && selected.length === segments.length
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('clients.segmentsModal.title')}
      subtitle={
        <>
          {t('clients.segmentsModal.subtitle')}{' '}
          <button type="button" className="font-semibold text-primary hover:underline" onClick={() => navigate('/clients/segments')}>
            {t('clients.segmentsModal.link')}
          </button>
        </>
      }
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="text-body text-muted">{t('clients.segmentsModal.selected', { count: selected.length })}</span>
          <Button
            variant="primary"
            onClick={() => {
              onApply(selected)
              onClose()
            }}
          >
            {t('clients.common.apply')}
          </Button>
        </div>
      }
    >
      <SearchInput value={query} onChange={setQuery} placeholder={t('clients.common.search')} className="mb-3" />
      <label className="flex cursor-pointer items-center gap-3 border-b border-line py-3">
        <input type="checkbox" checked={all} onChange={(e) => setSelected(e.target.checked ? segments.map((s) => s.id) : [])} className="h-5 w-5 accent-[rgb(var(--primary))]" />
        <span className="text-body-strong text-ink">{t('clients.segmentsModal.all')}</span>
        <span className="chip h-5 bg-sunken px-1.5 text-caption text-muted">{segments.length}</span>
      </label>
      <ul>
        {visible.map((s) => (
          <li key={s.id}>
            <label className="flex cursor-pointer items-start gap-3 border-b border-line py-3">
              <input
                type="checkbox"
                checked={selected.includes(s.id)}
                onChange={(e) => setSelected(e.target.checked ? [...selected, s.id] : selected.filter((x) => x !== s.id))}
                className="mt-0.5 h-5 w-5 accent-[rgb(var(--primary))]"
              />
              <span>
                <span className="block text-body-strong text-ink">{s.name}</span>
                <span className="block text-small text-muted">{s.description}</span>
              </span>
            </label>
          </li>
        ))}
        {visible.length === 0 && <li className="py-6 text-center text-body text-muted">{t('clients.common.noResults')}</li>}
      </ul>
    </Modal>
  )
}
