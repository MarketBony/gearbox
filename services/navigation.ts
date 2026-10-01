import {
  LayoutDashboard, FolderKanban, Megaphone, Package, CalendarDays, PiggyBank, Archive,
  Globe, Euro, Sparkles, Gamepad2, CheckSquare, MessageSquare, FileSpreadsheet, Palmtree, ClipboardList,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { canSeeGames, SITE_MANAGER_SECTIONS, isSiteManager } from '../constants';
import { EXPORT_ALLOWED_ROLES, canSeeForms } from '../constants';

// ============================================================================
// Navigation : SOURCE UNIQUE des rubriques visibles, partagée par la Sidebar
// (ancienne interface) et le Dock de la coque v2 (`ui2/`). Extraite de
// Sidebar.tsx le 29/09/2026 : sans elle, la v2 aurait recopié les règles de rôle,
// exactement le genre de seconde copie qui a déjà laissé une navigation complète
// visible à un chef de site (05/08/2026).
// ⚠️ Le refus réel reste côté serveur, et les gardes de `resolvedTab` dans App.tsx
// rattrapent toute rubrique atteinte autrement : ceci ne fait que MONTRER.
// ============================================================================

export interface NavItem { id: string; icon: LucideIcon; label: string }

export interface NavContext {
  role: string | undefined;
  gamesEnabled: boolean;
  voitConges: boolean;
  /** Interface v2 (Gearbox OS). Certaines rubriques n'existent QUE dans la v2 (Forms) : l'ancienne
   *  interface n'a pas de page pour elles, elles n'apparaissent donc ni dans son menu ni dans ses gardes. */
  ui2?: boolean;
}

export interface NavGroup { label: string; items: NavItem[] }

const I = (id: string, icon: LucideIcon, label: string): NavItem => ({ id, icon, label });

export function computeNav({ role, gamesEnabled, voitConges, ui2 = false }: NavContext) {
  const isExternal = role === 'External';
  const isSm = isSiteManager(role);
  const canAccessGames = canSeeGames(role, gamesEnabled);
  const canExport = EXPORT_ALLOWED_ROLES.includes(role ?? '');

  // Ordre du menu latéral (tablette, feuille « Plus », Dock v2).
  const allMainItems: NavItem[] = [
    I('hello-marketing', Sparkles, 'Hello Marketing'),
    ...(canAccessGames ? [I('games', Gamepad2, 'Jeux')] : []),
    I('dashboard', LayoutDashboard, 'Dashboard'),
    I('projects', FolderKanban, 'Projets'),
    ...(!isExternal ? [I('todo', CheckSquare, 'To-do')] : []),
    I('digital', Globe, 'Digital'),
    I('chat', MessageSquare, 'Chat'),
    I('campaigns', Megaphone, 'Campagnes'),
    ...(ui2 && canSeeForms(role) ? [I('forms', ClipboardList, 'Forms')] : []),
    I('material', Package, 'Matériel'),
    I('agenda', CalendarDays, 'Agenda'),
    I('budget', PiggyBank, 'Budget'),
    I('fixed-expenses', Euro, 'Dépenses'),
    ...(canExport ? [I('export', FileSpreadsheet, 'Export')] : []),
    ...(voitConges ? [I('conges', Palmtree, 'Congés')] : []),
  ];

  // Chef de site : liste FERMÉE de rubriques. External : Digital, Chat, Hello Marketing.
  const mainItems = isSm
    ? allMainItems.filter(i => SITE_MANAGER_SECTIONS.includes(i.id))
    : isExternal
      ? allMainItems.filter(i => ['digital', 'chat', 'hello-marketing'].includes(i.id))
      : allMainItems;

  // Archives n'est pas dans `mainItems` : autorisée à part, sauf chef de site
  // (et External, qui n'a jamais eu de nav groupée — son groupe unique = mainItems).
  const allowedIds = new Set([...mainItems.map(i => i.id), ...(isSm ? [] : ['archives'])]);

  // Nav groupée (desktop lg+). Toujours filtrée par `allowedIds` : une rubrique
  // ajoutée ici sans passer par `allMainItems` n'apparaît pour personne.
  const byId = new Map(allMainItems.map(i => [i.id, i]));
  const pick = (...ids: string[]) => ids.map(id => byId.get(id)).filter((i): i is NavItem => !!i);
  const rawGroups: NavGroup[] = isExternal
    ? [{ label: '', items: mainItems }]
    : [
        { label: '', items: pick('dashboard') },
        { label: 'GESTION DE PROJETS', items: pick('projects', 'todo') },
        { label: 'COM DIGITALE', items: pick('digital', 'campaigns', 'forms') },
        { label: 'COMMUNAUTÉ', items: pick('hello-marketing', 'conges', 'games', 'chat') },
        { label: 'OUTILS', items: pick('budget', 'fixed-expenses', 'material', 'agenda', 'export') },
        { label: 'HISTORIQUE', items: [I('archives', Archive, 'Archives')] },
      ];
  const groups = rawGroups
    .map(g => ({ ...g, items: g.items.filter(i => allowedIds.has(i.id)) }))
    .filter(g => g.items.length > 0);

  return { mainItems, groups, allowedIds, canAccessGames, canExport };
}
