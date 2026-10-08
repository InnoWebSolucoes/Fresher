import clsx from 'clsx'
import { Baseline, Bold, Heading1, Italic, List, ListOrdered, Paperclip, Redo2, Strikethrough, Underline, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal } from '@/components/ui'
import { PALETTE, PALETTE_ORDER } from '@/styles/palette'
import { Dropdown } from '../ui'

const NEUTRALS = [
  { key: 'black', color: '#10201F' },
  { key: 'charcoal', color: '#3B4A48' },
  { key: 'grey', color: '#6B7A78' },
  { key: 'lightGrey', color: '#A9B5B3' },
]

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase())
    .slice(0, 2)
    .join('')

/** "Add a note" rich-text modal (calendar.md §7.4). */
export function NoteModal({ open, title, initialHtml = '', clientName, clientPhoto, onClient, onClose, onSave }: { open: boolean; title?: string; initialHtml?: string; clientName?: string; clientPhoto?: string; onClient?: () => void; onClose: () => void; onSave: (html: string) => Promise<void> | void }) {
  const { t } = useTranslation()
  const editor = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [empty, setEmpty] = useState(!initialHtml)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      if (editor.current) {
        editor.current.innerHTML = initialHtml
        setEmpty(!editor.current.textContent?.trim())
        editor.current.focus()
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [open, initialHtml])

  const exec = (command: string, value?: string) => {
    editor.current?.focus()
    document.execCommand(command, false, value)
    setEmpty(!editor.current?.textContent?.trim())
  }

  const save = async () => {
    const html = editor.current?.innerHTML ?? ''
    if (!editor.current?.textContent?.trim()) return
    setBusy(true)
    try {
      await onSave(html)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const tool = (label: string, icon: ReactNode, onClick: () => void) => (
    <button type="button" aria-label={label} title={label} onMouseDown={(e) => e.preventDefault()} onClick={onClick} className="icon-btn h-8 w-8">
      {icon}
    </button>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={title ?? t('calendar.note.title')}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          {clientName ? (
            <button type="button" onClick={onClient} disabled={!onClient} className="inline-flex h-9 items-center gap-2 rounded-full border border-line-strong pl-1 pr-3 text-body text-ink hover:bg-sunken disabled:cursor-default" data-testid="note-client-chip">
              {clientPhoto ? (
                <img src={clientPhoto} alt="" aria-hidden className="h-7 w-7 rounded-full object-cover" />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-subtle text-caption font-semibold text-primary" aria-hidden>
                  {initials(clientName)}
                </span>
              )}
              {clientName}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button onClick={onClose}>{t('calendar.common.cancel')}</Button>
            <Button variant="primary" disabled={empty} loading={busy} onClick={save} data-testid="note-save">
              {t('calendar.common.save')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="rounded-md border border-line-strong">
        <div className="flex flex-wrap items-center gap-0.5 border-b border-line p-1.5">
          {tool(t('calendar.note.undo'), <Undo2 size={16} />, () => exec('undo'))}
          {tool(t('calendar.note.redo'), <Redo2 size={16} />, () => exec('redo'))}
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          {tool(t('calendar.note.heading'), <Heading1 size={16} />, () => exec('formatBlock', document.queryCommandValue('formatBlock') === 'h1' ? 'p' : 'h1'))}
          <Dropdown
            trigger={({ toggle }) => (
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={toggle} aria-label={t('calendar.note.color')} title={t('calendar.note.color')} className="icon-btn h-8 w-8">
                <Baseline size={16} aria-hidden />
              </button>
            )}
            panelClassName="p-3"
            width={232}
          >
            {(close) => (
              <div className="grid grid-cols-6 gap-2">
                {[...PALETTE_ORDER.map((key) => ({ key, color: PALETTE[key].edge, label: PALETTE[key].label })), ...NEUTRALS.map((n) => ({ ...n, label: t(`calendar.note.colors.${n.key}`) }))].map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      exec('foreColor', c.color)
                      close()
                    }}
                    aria-label={c.label}
                    title={c.label}
                    className="h-7 w-7 rounded-full ring-1 ring-line hover:scale-110"
                    style={{ background: c.color }}
                  />
                ))}
              </div>
            )}
          </Dropdown>
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          {tool(t('calendar.note.bold'), <Bold size={16} />, () => exec('bold'))}
          {tool(t('calendar.note.italic'), <Italic size={16} />, () => exec('italic'))}
          {tool(t('calendar.note.strike'), <Strikethrough size={16} />, () => exec('strikeThrough'))}
          {tool(t('calendar.note.underline'), <Underline size={16} />, () => exec('underline'))}
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          {tool(t('calendar.note.bullets'), <List size={16} />, () => exec('insertUnorderedList'))}
          {tool(t('calendar.note.numbers'), <ListOrdered size={16} />, () => exec('insertOrderedList'))}
          {tool(t('calendar.note.attach'), <Paperclip size={16} />, () => fileInput.current?.click())}
          <input
            ref={fileInput}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const names = [...(e.target.files ?? [])].map((f) => f.name)
              if (names.length) exec('insertHTML', `<p>📎 ${names.map((n) => n.replace(/[<>&]/g, '')).join(', ')}</p>`)
              e.target.value = ''
            }}
          />
        </div>
        <div className="relative">
          {empty && <span className="pointer-events-none absolute left-4 top-3 text-body text-subtle">{t('calendar.note.placeholder')}</span>}
          <div
            ref={editor}
            role="textbox"
            aria-multiline="true"
            aria-label={t('calendar.note.title')}
            contentEditable
            suppressContentEditableWarning
            onInput={() => setEmpty(!editor.current?.textContent?.trim())}
            className={clsx('prose-note min-h-[200px] px-4 py-3 text-body text-ink outline-none [&_h1]:text-title-3 [&_h1]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6')}
            data-testid="note-editor"
          />
        </div>
      </div>
    </Modal>
  )
}
