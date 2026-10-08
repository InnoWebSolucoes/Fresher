import { CircleCheck, CircleOff, ClipboardList, Copy, List, Pencil, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { formTemplatesApi } from '@/api/settings'
import { confirm, type MenuGroup } from '@/components/ui'
import { now } from '@/lib/time'
import type { FormTemplate } from '@/types'
import { useAction } from '../components/useAction'
import { FORMS_BASE, cloneSection, templatePath } from './shared'

/** Activate / Deactivate / Duplicate / Delete for a form template, plus the Actions menu groups. */
export function useFormTemplateActions() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [busy, run] = useAction()

  const activate = async (tpl: FormTemplate) => {
    const services = tpl.serviceIds === 'all' ? t('settings.frm.values.allServicesLower') : t('settings.frm.values.selectedServices', { count: tpl.serviceIds.length })
    const body = tpl.request === 'before' ? t(tpl.frequency === 'every' ? 'settings.frm.confirm.activateBefore' : 'settings.frm.confirm.activateBeforeOnce', { name: tpl.name, services }) : t('settings.frm.confirm.activateManual', { name: tpl.name })
    const ok = await confirm({ title: t('settings.frm.confirm.activateTitle'), body, confirmLabel: t('settings.frm.actions.activate'), cancelLabel: t('settings.common.cancel'), tone: 'primary' })
    if (ok) await run(() => formTemplatesApi.update(tpl.id, { status: 'active' }), t('settings.frm.toast.activated'))
  }

  const deactivate = (tpl: FormTemplate) => run(() => formTemplatesApi.update(tpl.id, { status: 'inactive' }), t('settings.frm.toast.deactivated'))

  const duplicate = (tpl: FormTemplate) =>
    run(
      () =>
        formTemplatesApi.create({
          name: t('settings.frm.confirm.copyName', { name: tpl.name }),
          status: 'inactive',
          sections: tpl.sections.map(cloneSection),
          request: tpl.request,
          frequency: tpl.frequency,
          serviceIds: tpl.serviceIds === 'all' ? 'all' : [...tpl.serviceIds],
          signatureRequired: tpl.signatureRequired,
          createdAt: now().toISOString(),
        }),
      t('settings.frm.toast.duplicated'),
    )

  /** Returns true when deleted. */
  const remove = async (tpl: FormTemplate, after?: () => void) => {
    const ok = await confirm({ title: t('settings.frm.confirm.deleteTitle'), body: t('settings.frm.confirm.deleteBody', { name: tpl.name }), confirmLabel: t('settings.frm.actions.delete'), cancelLabel: t('settings.common.cancel'), tone: 'danger' })
    if (!ok) return false
    return run(() => formTemplatesApi.remove(tpl.id), t('settings.frm.toast.deleted'), after)
  }

  /** Overview, Edit, Preview, Activate|Deactivate, Duplicate · Delete. */
  const menuGroups = (tpl: FormTemplate, options: { overview?: boolean; afterDelete?: () => void } = {}): MenuGroup[] => [
    {
      items: [
        ...(options.overview === false ? [] : [{ label: t('settings.frm.actions.overview'), icon: <List size={16} />, onSelect: () => navigate(templatePath(tpl.id, 'details')) }]),
        { label: t('settings.frm.actions.edit'), icon: <Pencil size={16} />, onSelect: () => navigate(templatePath(tpl.id, 'edit')) },
        { label: t('settings.frm.actions.preview'), icon: <ClipboardList size={16} />, onSelect: () => navigate(templatePath(tpl.id, 'preview')) },
        tpl.status === 'active'
          ? { label: t('settings.frm.actions.deactivate'), icon: <CircleOff size={16} />, onSelect: () => void deactivate(tpl), disabled: busy }
          : { label: t('settings.frm.actions.activate'), icon: <CircleCheck size={16} />, onSelect: () => void activate(tpl), disabled: busy },
        { label: t('settings.frm.actions.duplicate'), icon: <Copy size={16} />, onSelect: () => void duplicate(tpl), disabled: busy },
      ],
    },
    { items: [{ label: t('settings.frm.actions.delete'), icon: <Trash2 size={16} />, danger: true, onSelect: () => void remove(tpl, options.afterDelete ?? (() => navigate(FORMS_BASE))), disabled: busy }] },
  ]

  return { busy, activate, deactivate, duplicate, remove, menuGroups }
}
