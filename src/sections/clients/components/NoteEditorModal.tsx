import clsx from 'clsx'
import { Baseline, Bold, Heading1, Italic, List, ListOrdered, Paperclip, Redo2, Strikethrough, Underline, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Client } from '@/types'
import { Button, Modal } from '@/components/ui'
import { useDismiss } from '@/lib/useDismiss'
import { addClientFiles } from '@/api/clients'
import { SWATCHES } from '../lib/constants'
import { htmlToText, sanitizeHtml } from '../lib/helpers'
import { ClientAvatar } from './common'

interface Props {
  open: boolean
  onClose: () => void
  client: Client
  initialHtml?: string
  title?: string
  onSave: (html: string) => Promise<void>
}

/** Rich-text "Add a note" editor (calendar.md §7.4). */
export function NoteEditorModal(props: Props) {
  if (!props.open) return null
  return <Editor {...props} />
}

function Editor({ onClose, client, initialHtml = '', title, onSave }: Props) {
  const { t } = useTranslation()
  const editor = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [html, setHtml] = useState(initialHtml)
  const [saving, setSaving] = useState(false)
  const [colorOpen, setColorOpen] = useState(false)
  const colorRef = useRef<HTMLDivElement>(null)
  const colorRefs = useMemo(() => [colorRef], [])
  useDismiss(colorRefs, colorOpen, () => setColorOpen(false))

  useEffect(() => {
    if (editor.current) {
      editor.current.innerHTML = initialHtml
      editor.current.focus()
    }
  }, [initialHtml])

  const sync = () => setHtml(editor.current?.innerHTML ?? '')
  const exec = (command: string, value?: string) => {
    editor.current?.focus()
    document.execCommand(command, false, value)
    sync()
  }
  const toggleHeading = () => {
    const current = String(document.queryCommandValue('formatBlock') || '').toLowerCase()
    exec('formatBlock', current === 'h1' ? 'p' : 'h1')
  }
  const empty = htmlToText(html).trim() === ''

  const save = async () => {
    if (empty) return
    setSaving(true)
    try {
      await onSave(sanitizeHtml(html))
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const tool = (label: string, icon: ReactNode, onClick: () => void) => (
    <button type="button" title={label} aria-label={label} onMouseDown={(e) => e.preventDefault()} onClick={onClick} className="icon-btn h-9 w-9">
      {icon}
    </button>
  )

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={title ?? t('clients.note.title')}
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="inline-flex items-center gap-2 rounded-full border border-line-strong py-1 pl-1 pr-3 text-body">
            <ClientAvatar client={client} size={26} initials />
            {client.firstName} {client.lastName}
          </span>
          <Button variant="primary" disabled={empty} loading={saving} onClick={() => void save()}>
            {t('clients.common.save')}
          </Button>
        </div>
      }
    >
      <div className="rounded-lg border border-line bg-surface">
        <div role="toolbar" aria-label={t('clients.note.toolbar')} className="m-3 flex flex-wrap items-center gap-0.5 rounded-full bg-sunken px-2 py-1">
          {tool(t('clients.note.undo'), <Undo2 size={17} aria-hidden />, () => exec('undo'))}
          {tool(t('clients.note.redo'), <Redo2 size={17} aria-hidden />, () => exec('redo'))}
          <span className="mx-1 h-5 w-px bg-line-strong" aria-hidden />
          {tool(t('clients.note.heading'), <Heading1 size={17} aria-hidden />, toggleHeading)}
          <div ref={colorRef} className="relative">
            {tool(t('clients.note.textColour'), <Baseline size={17} aria-hidden />, () => setColorOpen((o) => !o))}
            {colorOpen && (
              <div className="absolute left-0 top-full z-10 mt-2 grid w-[244px] grid-cols-6 gap-2 rounded-lg border border-line bg-raised p-3 shadow-md">
                {SWATCHES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    title={s.label}
                    aria-label={s.label}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      exec('foreColor', s.color)
                      setColorOpen(false)
                    }}
                    className={clsx('h-7 w-7 rounded-full ring-offset-2 hover:ring-2 hover:ring-primary', s.key === 'black' && 'ring-2 ring-line-strong')}
                    style={{ background: s.color }}
                  />
                ))}
              </div>
            )}
          </div>
          <span className="mx-1 h-5 w-px bg-line-strong" aria-hidden />
          {tool(t('clients.note.bold'), <Bold size={17} aria-hidden />, () => exec('bold'))}
          {tool(t('clients.note.italic'), <Italic size={17} aria-hidden />, () => exec('italic'))}
          {tool(t('clients.note.strike'), <Strikethrough size={17} aria-hidden />, () => exec('strikeThrough'))}
          {tool(t('clients.note.underline'), <Underline size={17} aria-hidden />, () => exec('underline'))}
          {tool(t('clients.note.bullets'), <List size={17} aria-hidden />, () => exec('insertUnorderedList'))}
          {tool(t('clients.note.numbers'), <ListOrdered size={17} aria-hidden />, () => exec('insertOrderedList'))}
          {tool(t('clients.note.attach'), <Paperclip size={17} aria-hidden />, () => fileInput.current?.click())}
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={async (e) => {
              const files = [...(e.target.files ?? [])]
              e.target.value = ''
              if (!files.length) return
              await addClientFiles(client.id, files.map((f) => ({ name: f.name, size: f.size })))
              exec('insertText', ` ${t('clients.note.attached', { names: files.map((f) => f.name).join(', ') })} `)
            }}
          />
        </div>
        <div className="relative">
          {empty && <p className="pointer-events-none absolute left-4 top-1 text-body text-subtle">{t('clients.note.placeholder')}</p>}
          <div
            ref={editor}
            role="textbox"
            aria-multiline="true"
            aria-label={t('clients.note.placeholder')}
            contentEditable
            suppressContentEditableWarning
            onInput={sync}
            className="note-editor min-h-[260px] px-4 pb-4 text-body text-ink outline-none [&_h1]:font-display [&_h1]:text-title-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
          />
        </div>
      </div>
    </Modal>
  )
}

/** Read-only rendering of a saved note. */
export function NoteHtml({ html, className }: { html: string; className?: string }) {
  const clean = useMemo(() => sanitizeHtml(html), [html])
  return <div className={clsx('text-body text-ink [&_h1]:font-display [&_h1]:text-title-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6', className)} dangerouslySetInnerHTML={{ __html: clean }} />
}
