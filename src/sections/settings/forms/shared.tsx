import { AlignLeft, CircleDot, PenLine, SquareCheck, TextCursorInput, Text, type LucideIcon } from 'lucide-react'
import type { TFunction } from 'i18next'
import { Chip } from '@/components/ui'
import { uid } from '@/lib/ids'
import type { FormSection, FormTemplate, ID } from '@/types'

/** Settings › Forms shared bits (reference/settings-forms.md). */

export type FormBlock = FormSection['blocks'][number]
export type FormBlockType = FormBlock['type']

export const BLOCK_TYPES: FormBlockType[] = ['paragraph', 'yes_no', 'short_text', 'long_text', 'checkbox', 'signature']

export const BLOCK_ICONS: Record<FormBlockType, LucideIcon> = {
  paragraph: Text,
  yes_no: CircleDot,
  short_text: TextCursorInput,
  long_text: AlignLeft,
  checkbox: SquareCheck,
  signature: PenLine,
}

export const FORMS_BASE = '/setup/forms-and-notes/form-templates'
export const templatePath = (id: ID, view: 'details' | 'edit' | 'preview') => `${FORMS_BASE}/${id}/${view}`

/** The editable part of a template (what the builder works on). */
export type TemplateDraft = Pick<FormTemplate, 'name' | 'sections' | 'request' | 'frequency' | 'serviceIds' | 'signatureRequired'>

export const EMPTY_DRAFT: TemplateDraft = { name: '', sections: [], request: 'before', frequency: 'every', serviceIds: 'all', signatureRequired: true }

export function newSection(kind: FormSection['kind']): FormSection {
  return kind === 'client_details' ? { id: uid('fs'), kind, title: 'Personal Information', blocks: [] } : { id: uid('fs'), kind, title: '', blocks: [] }
}

export function newBlock(type: FormBlockType): FormBlock {
  return { id: uid('q'), type, label: '' }
}

/** Deep copy with fresh ids (Duplicate). */
export function cloneSection(section: FormSection): FormSection {
  return { ...section, id: uid('fs'), blocks: section.blocks.map((b) => ({ ...b, id: uid('q') })) }
}

/** "All services" or "N services". */
export function servicesLabel(t: TFunction, serviceIds: FormTemplate['serviceIds']): string {
  return serviceIds === 'all' ? t('settings.frm.values.allServices') : t('settings.frm.values.servicesCount', { count: serviceIds.length })
}

export function requestLabel(t: TFunction, request: FormTemplate['request']): string {
  return t(request === 'before' ? 'settings.frm.values.before' : 'settings.frm.values.manual')
}

export function frequencyLabel(t: TFunction, frequency: FormTemplate['frequency']): string {
  return t(frequency === 'every' ? 'settings.frm.values.every' : 'settings.frm.values.once')
}

export function TemplateStatusChip({ status, t }: { status: FormTemplate['status']; t: TFunction }) {
  return <Chip tone={status === 'active' ? 'success' : 'warning'}>{t(status === 'active' ? 'settings.common.active' : 'settings.common.inactive')}</Chip>
}

/** Validation problems in a draft's sections, keyed by section id / block id. */
export function sectionErrors(t: TFunction, sections: FormSection[]): Record<string, string> {
  const errors: Record<string, string> = {}
  sections.forEach((s) => {
    if (s.kind !== 'custom') return
    if (!s.title.trim()) errors[`title:${s.id}`] = t('settings.frm.builder.sectionTitleRequired')
    if (s.blocks.length === 0) errors[`blocks:${s.id}`] = t('settings.frm.builder.sectionNoBlocks')
    s.blocks.forEach((b) => {
      if (!b.label.trim()) errors[`block:${b.id}`] = t(b.type === 'paragraph' ? 'settings.frm.builder.textRequired' : 'settings.frm.builder.labelRequired')
    })
  })
  return errors
}
