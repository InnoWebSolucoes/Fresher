import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, EmptyState, confirm } from '@/components/ui'
import { deleteResource, deleteResourceType, type ResourceRecord } from '@/api/settings'
import { useDb } from '@/store/db'
import { PALETTE } from '@/styles/palette'
import type { PaletteColor, ResourceType } from '@/types'
import { useLocations } from '../hooks'
import { ActionsPill, ListCard, ListRow, PillMenu, SectionHeading, SettingsPage } from '../components/ui'
import { IconFor } from '../components/pickers'
import { useAction } from '../components/useAction'
import { ResourceTypeModal } from './ResourceTypeModal'
import { rowActions } from './shared'

const K = 'settings.sched.resources'

/** Settings › Scheduling › Resources (settings-scheduling.md §4). */
export function ResourcesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const resources = useDb((s) => s.resources) as ResourceRecord[]
  const types = useDb((s) => s.resourceTypes)
  const services = useDb((s) => s.services)
  const locations = useLocations()
  const [typeModal, setTypeModal] = useState<ResourceType | 'new' | null>(null)
  const [, run] = useAction()

  const typesById = useMemo(() => new Map(types.map((x) => [x.id, x])), [types])
  const groups = useMemo(
    () =>
      locations
        .map((location) => ({ location, items: resources.filter((r) => r.locationId === location.id).sort((a, b) => a.name.localeCompare(b.name)) }))
        .filter((g) => g.items.length > 0),
    [locations, resources],
  )

  const addResource = (locationId?: string) => navigate(`/setup/scheduling/resources/new${locationId ? `?location=${locationId}` : ''}`)
  const editResource = (id: string) => navigate(`/setup/scheduling/resources/${id}`)

  const removeResource = async (resource: ResourceRecord) => {
    const ok = await confirm({ title: t(`${K}.deleteTitle`), body: t(`${K}.deleteBody`, { name: resource.name }), confirmLabel: t('settings.common.delete'), tone: 'danger' })
    if (ok) await run(() => deleteResource(resource.id), t(`${K}.deleted`))
  }
  const removeType = async (type: ResourceType) => {
    const ok = await confirm({ title: t(`${K}.deleteTypeTitle`), body: t(`${K}.deleteTypeBody`, { name: type.name }), confirmLabel: t('settings.common.delete'), tone: 'danger' })
    if (ok) await run(() => deleteResourceType(type.id), t(`${K}.typeDeleted`))
  }

  const capacity = (r: ResourceRecord) => (r.capacity > 1 ? t(`${K}.capacityMany`, { count: r.capacity }) : t(`${K}.capacityOne`))

  return (
    <SettingsPage
      title={t(`${K}.title`)}
      description={t(`${K}.description`)}
      learnMore={t('settings.sched.resources.title')}
      actions={
        <PillMenu
          primary
          label={t('settings.common.add')}
          width={200}
          groups={[
            {
              items: [
                { label: t(`${K}.addResource`), onSelect: () => addResource() },
                { label: t(`${K}.addType`), onSelect: () => setTypeModal('new') },
              ],
            },
          ]}
        />
      }
    >
      {resources.length === 0 ? (
        <div className="card flex flex-col items-center pt-12" data-testid="resources-empty">
          <ResourceArt />
          <EmptyState
            className="pt-6"
            title={t(`${K}.emptyTitle`)}
            body={t(`${K}.emptyBody`)}
            action={
              <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => addResource()}>
                {t(`${K}.addResourceButton`)}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-8" data-testid="resources-list">
          {groups.map(({ location, items }) => (
            <section key={location.id} className="flex flex-col gap-3">
              {locations.length > 1 && (
                <div className="flex items-end justify-between gap-4">
                  <SectionHeading title={location.name} description={t(`${K}.resourceCount`, { count: items.length })} />
                  <Button variant="link" onClick={() => addResource(location.id)}>
                    {t(`${K}.addResourceButton`)}
                  </Button>
                </div>
              )}
              <ListCard>
                {items.map((r) => {
                  const type = typesById.get(r.typeId)
                  const palette = PALETTE[r.color as PaletteColor] ?? PALETTE.orange
                  const parts = [type?.name ?? t(`${K}.noType`), capacity(r)]
                  if (r.availability === 'specific') parts.push(t(`${K}.specificTimes`))
                  return (
                    <ListRow
                      key={r.id}
                      testId={`resource-${r.id}`}
                      tile={false}
                      leading={
                        <span className="flex h-11 w-11 items-center justify-center rounded-md" style={{ background: palette.fill, color: palette.text }}>
                          <IconFor name={type?.icon ?? 'sparkles'} size={22} />
                        </span>
                      }
                      title={r.name}
                      subtitle={parts.join(' • ')}
                      onClick={() => editResource(r.id)}
                      trailing={<ActionsPill groups={rowActions(t, { onEdit: () => editResource(r.id), onDelete: () => void removeResource(r) })} />}
                    />
                  )
                })}
              </ListCard>
            </section>
          ))}
        </div>
      )}

      <section className="flex flex-col gap-3" data-testid="resource-types">
        <div className="flex items-end justify-between gap-4">
          <SectionHeading title={t(`${K}.typesTitle`)} description={t(`${K}.typesDescription`)} />
          <Button variant="link" onClick={() => setTypeModal('new')}>
            {t(`${K}.addType`)}
          </Button>
        </div>
        {types.length === 0 ? (
          <div className="card">
            <EmptyState
              title={t(`${K}.typesEmptyTitle`)}
              body={t(`${K}.typesEmptyBody`)}
              action={
                <Button icon={<Plus size={16} aria-hidden />} onClick={() => setTypeModal('new')}>
                  {t(`${K}.addType`)}
                </Button>
              }
            />
          </div>
        ) : (
          <ListCard>
            {types.map((type) => {
              const used = resources.filter((r) => r.typeId === type.id).length
              const usedByServices = services.filter((s) => s.resourceTypeIds.includes(type.id)).length
              const subtitle = [t(`${K}.resourceCount`, { count: used }), usedByServices ? t(`${K}.serviceCount`, { count: usedByServices }) : null, type.description || null].filter(Boolean).join(' • ')
              return (
                <ListRow
                  key={type.id}
                  testId={`resource-type-${type.id}`}
                  leading={<IconFor name={type.icon} size={22} />}
                  title={type.name}
                  subtitle={subtitle}
                  onClick={() => setTypeModal(type)}
                  trailing={
                    <ActionsPill
                      groups={rowActions(t, {
                        onEdit: () => setTypeModal(type),
                        onDelete: () => void removeType(type),
                        deleteHint: used ? t(`${K}.typeInUse`) : undefined,
                      })}
                    />
                  }
                />
              )
            })}
          </ListCard>
        )}
      </section>

      {typeModal && <ResourceTypeModal type={typeModal === 'new' ? null : typeModal} onClose={() => setTypeModal(null)} />}
    </SettingsPage>
  )
}

/** Our own empty-state artwork: a fan of resource icons on palette tiles. */
function ResourceArt() {
  const tiles: { icon: string; color: PaletteColor; size: number }[] = [
    { icon: 'sun', color: 'amber', size: 34 },
    { icon: 'hand', color: 'lavender', size: 40 },
    { icon: 'bed', color: 'coral', size: 46 },
    { icon: 'armchair', color: 'green', size: 54 },
    { icon: 'door-open', color: 'red', size: 64 },
    { icon: 'waves', color: 'cyan', size: 54 },
    { icon: 'lamp', color: 'yellow', size: 46 },
    { icon: 'flame', color: 'pink', size: 40 },
    { icon: 'wrench', color: 'teal', size: 34 },
  ]
  return (
    <span className="flex items-center" aria-hidden>
      {tiles.map((tile) => (
        <span key={tile.icon} className="-mx-0.5 flex items-center justify-center rounded-md shadow-xs" style={{ width: tile.size, height: tile.size, background: PALETTE[tile.color].fill, color: PALETTE[tile.color].edge }}>
          <IconFor name={tile.icon} size={Math.round(tile.size * 0.45)} />
        </span>
      ))}
    </span>
  )
}
