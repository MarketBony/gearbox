import React, { useMemo } from 'react';
import { computeNav } from '../../../services/navigation';
import { peutLireConges } from '../../../constants';
import { useAppSettings } from '../../../services/appSettings';
import { tabOf } from '../../os/bridge';
import { gx, Icon } from '../ui/kit';
import { AppIco, Head, RANKS, READ_ONLY, ROLE_SHORT, SecIco, css, roleLabel, type SectionDef } from './common';

// =====================================================================
// « Rôles & accès » — matrice de la maquette, calculée avec la SOURCE UNIQUE de la navigation
// (`computeNav`, services/navigation.ts) : aucune table d'accès recopiée. Informatif seulement :
// le refus réel est côté serveur et dans les gardes d'App.tsx.
// Écart voulu : le groupe « Voir comme » n'est pas porté — le moteur l'a retiré (rôle = compte connecté).
// =====================================================================

const MATRIX_APPS = ['hello', 'dashboard', 'projects', 'todo', 'digital', 'chat', 'campaigns', 'material', 'agenda', 'budget', 'fixed', 'conges', 'export', 'games', 'archives', 'settings'];

export function RolesPanel({ s, cur }: { s: SectionDef; cur: string }) {
  const { gamesEnabled } = useAppSettings();
  const apps = MATRIX_APPS.filter((id) => gx().app(id));
  // Congés : visibles des membres du périmètre et des gestionnaires (services/congesAcces.ts) — pour
  // un RÔLE, on montre donc les rôles qui PEUVENT lire le planning (CONGES_LECTURE_ROLES).
  const access = useMemo(() => Object.fromEntries(RANKS.map((r) => {
    const nav = computeNav({ role: r, gamesEnabled, voitConges: peutLireConges(r) });
    return [r, new Set(apps.filter((id) => id === 'settings' || nav.allowedIds.has(tabOf(id))))];
  })), [gamesEnabled]); // eslint-disable-line react-hooks/exhaustive-deps
  const cell = (r: string, id: string) => access[r].has(id)
    ? (READ_ONLY.includes(r) ? <span className="set-ro" data-tip="Lecture seule"><Icon name="eye" /></span> : <span className="set-yes"><Icon name="check" /></span>)
    : <span className="set-no">—</span>;
  return (
    <div className="set-panel" style={{ maxWidth: 1080 }}><Head s={s} />
      <div className="set-gt">Matrice des accès</div>
      <div className="set-group enter" data-anchor="matrix"><div className="scroll"><table className="tbl set-mx">
        <thead><tr><th>Rubrique</th>{RANKS.map((r) => <th key={r} className={r === cur ? 'cur' : ''} data-tip={roleLabel(r)}>{ROLE_SHORT[r]}</th>)}</tr></thead>
        <tbody>{apps.map((id) => <tr key={id}><td><div className="row" style={{ gap: 8 }}><AppIco id={id} s={20} /><span className="ellipsis">{gx().app(id).name}</span></div></td>{RANKS.map((r) => <td key={r} className={r === cur ? 'cur' : ''}>{cell(r, id)}</td>)}</tr>)}</tbody>
      </table></div>
        <div className="set-legend2"><span><span className="set-yes"><Icon name="check" /></span>Accès</span><span><span className="set-ro"><Icon name="eye" /></span>Lecture seule</span><span><span className="set-no">—</span>Aucun accès</span></div></div>
      <div className="set-note">Congés : réservé aux membres du planning et à ceux qui le gèrent. Jeux : selon l’interrupteur « Espace détente » ({gamesEnabled ? 'visible' : 'masqué'} actuellement).</div>
      <div className="set-group set-notecard enter" style={css({ '--i': 2 })} data-anchor="note"><SecIco s={{ icon: 'building', c: 'var(--danger)' }} cls="lg" /><div><b>Chef de site (Site Manager)</b>
        <ul><li><b>Lecture seule partout</b> : aucun bouton de création ni d’édition, il ne figure dans aucune liste de rôles éditeurs.</li>
          <li><b>Limité à ses concessions</b> (rattachées à son compte). Les projets multi-sites n’affichent que sa part (« +N masqués »).</li>
          <li>Rubriques : Dashboard, Projets, Digital (onglet Planning seulement), Hello Marketing, Budget, Agenda.</li>
          <li>Le filtrage se fait <b>côté serveur</b> : les autres concessions ne transitent jamais par son navigateur.</li></ul>
        <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>Directeur = droits d’Administrateur sauf Jeux · Externe : Digital, Chat, Hello Marketing et Réglages.</div></div></div>
    </div>
  );
}
