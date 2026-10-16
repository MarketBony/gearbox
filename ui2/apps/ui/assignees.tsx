import React from 'react';
import type { User } from '../../../types';
import { canHaveTodo } from '../../../constants';
import { gx, Avatar } from './kit';

// =====================================================================
// Assignés d'une tâche (16/10/2026, tâches MULTI-ASSIGNÉES) — pièces d'interface partagées par la fiche projet
// (tableau des tâches, détail mode Expert) et la To-do (formulaire de tâche libre). Aucune règle ici :
//  - lecture / écriture des assignés : `assignesDe` / `poserAssignes` (utils/projet.ts) ;
//  - qui peut être assigné : `canHaveTodo` (constants.ts), miroir de `TODO_ROLES`, le vrai refus côté serveur
//    (backend/src/utils/taskAssignees.ts) — décision de Théo : « seulement parmi les rôles qui ont la To-do ».
// =====================================================================

/**
 * Personnes proposées dans le sélecteur : les comptes qui ont la To-do, triés par nom. `garder` = assignés ACTUELS
 * restés dans la liste même s'ils ne sont plus éligibles (rôle changé) : ils doivent rester visibles et décochables.
 * Un id sans compte (personne supprimée) n'est pas proposé : il ne peut qu'être retiré, par la ligne « Personne ».
 */
export function assignables(users: User[], garder: string[] = []): User[] {
  return users.filter((u) => canHaveTodo(u.role) || garder.includes(u.id)).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/** Libellé court d'une liste d'assignés : « Personne », « Julie », « Julie +2 ». */
export function assigneesLabel(users: User[], ids: string[], vide = 'Non assigné'): string {
  if (!ids.length) return vide;
  const first = users.find((u) => u.id === ids[0])?.name || 'Ancien membre';
  return ids.length > 1 ? `${first} +${ids.length - 1}` : first;
}

/** Sélecteur MULTIPLE du moteur (`gx().ui.pick`) : chaque coche rend la liste complète par `onChange`. */
export function pickAssignees(el: HTMLElement, users: User[], selected: string[], onChange: (ids: string[]) => void, title = 'Assigner à') {
  const roles = gx().data.ROLES || {};
  return gx().ui.pick(el, [{ label: 'Équipe (accès To-do)', items: assignables(users, selected).map((u) => ({ v: u.id, l: u.name, hint: roles[u.role]?.l || u.role })) }],
    // L'ordre est conservé : les personnes déjà assignées gardent leur rang, les nouvelles s'ajoutent à la fin (le
    // PREMIER de la liste est celui que montre l'ancienne interface).
    { multi: true, search: true, title, selected, allLabel: 'Personne', width: 300,
      onChange: (v: string[]) => onChange([...selected.filter((x) => v.includes(x)), ...v.filter((x) => !selected.includes(x))]) });
}

/** Pile d'avatars (`.av-stack` de la maquette, comme les membres d'une conversation du Chat). */
export const AvatarStack: React.FC<{ ids: string[]; max?: number; cls?: string }> = ({ ids, max = 3, cls = 'sm' }) => {
  if (!ids.length) return <span className={`av ${cls}`} style={{ '--c': 'var(--surface-4)' } as React.CSSProperties} data-tip="Non assigné">?</span>;
  const shown = ids.length > max ? ids.slice(0, max - 1) : ids, more = ids.length - shown.length;
  return (
    <span className="av-stack">{shown.map((u) => <React.Fragment key={u}><Avatar uid={u} cls={cls} /></React.Fragment>)}
      {more ? <span className={`av ${cls}`} style={{ '--c': 'var(--surface-4)', color: 'var(--text-2)' } as React.CSSProperties} data-tip={`${more} de plus`}>+{more}</span> : null}</span>
  );
};
