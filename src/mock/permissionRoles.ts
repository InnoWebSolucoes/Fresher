import type { PermissionLevel } from '@/types'
import { L } from './text'

/**
 * Default permission roles (reference/settings-team.md §1). `permissions`
 * maps a permission area to its enabled permission keys; an area with the
 * key 'active' is switched on. The full matrix UI lives in the settings
 * section; src/lib/permissions.ts maps roles to visible sections (by id).
 * Names and descriptions are written in the language active when called.
 */
export function defaultPermissionRoles(): PermissionLevel[] {
  const areas = (list: string[]) => Object.fromEntries(list.map((a) => [a, ['active']]))
  return [
    { id: 'basic', name: L('Basic', 'Básico'), description: L('Partial access to Calendar, Sales, and Reports.', 'Acesso parcial a Calendário, Vendas e Relatórios.'), system: false, order: 0, permissions: areas(['calendar', 'sales']) },
    { id: 'low', name: L('Low', 'Baixo'), description: L('Partial access to Calendar, Sales, Clients, Online profile, Marketing, Team, Reports, and Workspace.', 'Acesso parcial a Calendário, Vendas, Clientes, Perfil online, Marketing, Equipa, Relatórios e Espaço de trabalho.'), system: false, order: 1, permissions: areas(['calendar', 'sales', 'clients', 'online_profile', 'team']) },
    { id: 'medium', name: L('Medium', 'Médio'), description: L('Partial access to Calendar, Sales, Clients, Catalog, Online profile, Marketing, Team, Reports, and Workspace.', 'Acesso parcial a Calendário, Vendas, Clientes, Catálogo, Perfil online, Marketing, Equipa, Relatórios e Espaço de trabalho.'), system: false, order: 2, permissions: areas(['calendar', 'sales', 'clients', 'catalog', 'online_profile', 'marketing', 'team', 'workspace']) },
    { id: 'high', name: L('High', 'Alto'), description: L('Full access to Clients, Online profile, Marketing, and Workspace. Partial access to Calendar, Sales, Catalog, Team, Reports, and Payments and wallet.', 'Acesso total a Clientes, Perfil online, Marketing e Espaço de trabalho. Acesso parcial a Calendário, Vendas, Catálogo, Equipa, Relatórios e Pagamentos e carteira.'), system: false, order: 3, permissions: { ...areas(['calendar', 'sales', 'clients', 'catalog', 'online_profile', 'marketing', 'team', 'reports', 'payments_wallet']), workspace: ['active', 'home_page'] } },
    { id: 'owner', name: L('Workspace owner', 'Proprietário do espaço de trabalho'), description: L('Full access to all areas.', 'Acesso total a todas as áreas.'), system: true, order: 4, permissions: { ...areas(['calendar', 'sales', 'clients', 'catalog', 'online_profile', 'marketing', 'team', 'reports', 'payments_wallet']), workspace: ['active', 'home_page'] } },
    { id: 'none', name: L('No access', 'Sem acesso'), description: L('No access to workspace features.', 'Sem acesso às funcionalidades do espaço de trabalho.'), system: true, order: 5, permissions: {} },
  ]
}
