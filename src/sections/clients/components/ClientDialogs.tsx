import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { ID } from '@/types'
import { useDb } from '@/store/db'
import { Button, Field, Modal, Select, toast } from '@/components/ui'
import { assignTags, blockClients, setClientTags } from '@/api/clients'
import { BLOCK_REASONS } from '../lib/constants'
import { TagPicker } from './TagPicker'

/** "Block Client" (clients.md §4). Works for one client or a bulk selection. */
export function BlockClientModal({ open, onClose, clientIds, onDone }: { open: boolean; onClose: () => void; clientIds: ID[]; onDone?: () => void }) {
  if (!open) return null
  return <BlockBody onClose={onClose} clientIds={clientIds} onDone={onDone} />
}

function BlockBody({ onClose, clientIds, onDone }: { onClose: () => void; clientIds: ID[]; onDone?: () => void }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!reason) return setError(true)
    setBusy(true)
    try {
      await blockClients(clientIds, reason)
      toast(clientIds.length === 1 ? t('clients.block.toast') : t('clients.block.toastMany', { count: clientIds.length }))
      onDone?.()
      onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('clients.block.title')}
      footer={
        <>
          <Button onClick={onClose}>{t('clients.common.cancel')}</Button>
          <Button variant="danger" loading={busy} onClick={() => void submit()}>
            {t('clients.block.confirm')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-body text-ink">
        <p>{t('clients.block.question')}</p>
        <p>{t('clients.block.body1')}</p>
        <p>{t('clients.block.body2')}</p>
        <Field label={t('clients.block.reason')} error={error ? t('clients.block.reasonError') : undefined} className="mt-2">
          {(id) => (
            <Select
              id={id}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                setError(false)
              }}
              placeholder={t('clients.block.reason')}
              options={BLOCK_REASONS}
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}

/** Bulk "Add client tags" (clients.md §1). */
export function AddTagsModal({ open, onClose, clientIds, onDone }: { open: boolean; onClose: () => void; clientIds: ID[]; onDone?: () => void }) {
  if (!open) return null
  return <AddTagsBody onClose={onClose} clientIds={clientIds} onDone={onDone} />
}

function AddTagsBody({ onClose, clientIds, onDone }: { onClose: () => void; clientIds: ID[]; onDone?: () => void }) {
  const { t } = useTranslation()
  const [tagIds, setTagIds] = useState<ID[]>([])
  const [busy, setBusy] = useState(false)
  const apply = async () => {
    setBusy(true)
    try {
      await assignTags(clientIds, tagIds)
      toast(clientIds.length === 1 ? t('clients.tags.assignedOne') : t('clients.tags.assignedMany', { count: clientIds.length }))
      onDone?.()
      onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={t('clients.tags.bulkTitle')}
      footer={
        <>
          <Button onClick={onClose}>{t('clients.common.cancel')}</Button>
          <Button variant="primary" disabled={tagIds.length === 0} loading={busy} onClick={() => void apply()}>
            {t('clients.common.apply')}
          </Button>
        </>
      }
    >
      <Field label={t('clients.tags.label')} className="pb-24">
        {(id) => <TagPicker id={id} value={tagIds} onChange={setTagIds} autoFocus />}
      </Field>
    </Modal>
  )
}

/** "Manage client tags" for one client (clients.md §4 Add tag). */
export function ManageTagsModal({ open, onClose, clientId, initial }: { open: boolean; onClose: () => void; clientId: ID; initial: ID[] }) {
  if (!open) return null
  return <ManageTagsBody onClose={onClose} clientId={clientId} initial={initial} />
}

function ManageTagsBody({ onClose, clientId, initial }: { onClose: () => void; clientId: ID; initial: ID[] }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const tags = useDb((s) => s.clientTags)
  const [tagIds, setTagIds] = useState<ID[]>(initial)
  const [busy, setBusy] = useState(false)
  const suggested = useMemo(
    () =>
      [...tags]
        .sort((a, b) => a.name.localeCompare(b.name))
        .filter((tag) => !tagIds.includes(tag.id))
        .slice(0, 6),
    [tags, tagIds],
  )
  const apply = async () => {
    setBusy(true)
    try {
      await setClientTags(clientId, tagIds)
      toast(t('clients.tags.updated'))
      onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={t('clients.tags.manageTitle')}
      subtitle={
        <>
          {t('clients.tags.manageSubtitle')}{' '}
          <button type="button" className="font-semibold text-primary hover:underline" onClick={() => navigate('/setup/clients/client-tags')}>
            {t('clients.tags.clientSettings')}
          </button>
          .
        </>
      }
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="text-body text-muted">
            <strong className="text-ink">{tagIds.length}</strong> {t('clients.tags.selected')}
          </span>
          <div className="flex gap-2">
            <Button onClick={onClose}>{t('clients.common.cancel')}</Button>
            <Button variant="primary" loading={busy} onClick={() => void apply()}>
              {t('clients.common.apply')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="min-h-[300px]">
        <TagPicker value={tagIds} onChange={setTagIds} />
        {suggested.length > 0 && (
          <div className="mt-5 pb-2">
            <p className="mb-2 text-body-strong text-ink">{t('clients.tags.suggested')}</p>
            <div className="flex flex-wrap gap-2">
              {suggested.map((tag) => (
                <button key={tag.id} type="button" onClick={() => setTagIds([...tagIds, tag.id])} className="h-9 rounded-full border border-line-strong px-4 text-body text-ink hover:bg-sunken">
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
