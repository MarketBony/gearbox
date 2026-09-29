import React, { useLayoutEffect, useRef } from 'react';
import type { CongeJour, CongeType, CongeDemi } from '../../../types';
import { CONGES_TYPES, CONGES_DEMI, CONGES_DROIT_DEFAUT, valeurJourConge } from '../../../constants';
import { estChome, ferieDe, estWeekend, joursOuvres } from '../../../lib/joursFeries';
import { gx } from '../ui/kit';

// Données et petits rendus de la rubrique Congés (maquettes/v2/js/apps/conges.js, en-tête), sur le
// VRAI modèle. Aucune règle recopiée : comptage = `valeurJourConge`, jours chômés = `estChome`,
// jours ouvrés d'une plage = `joursOuvres`, solde = `congeDecompteSolde` (constants.ts, lib/joursFeries.ts).

export type Tab = 'planning' | 'agenda' | 'dash';
export const TAB_LABEL: Record<Tab, string> = { planning: 'Planning', agenda: 'Agenda', dash: 'Tableau de bord' };
/** Clé de session de pages/Conges.tsx (`conges_onglet`) : la page nomme le tableau de bord `dashboard`. */
export const TAB_SESSION: Record<Tab, string> = { planning: 'planning', agenda: 'agenda', dash: 'dashboard' };

/** Les familles, dans l'ORDRE de `CONGES_TYPES` (ordre du sélecteur). */
export const TYPES = Object.entries(CONGES_TYPES).map(([id, t]) => ({ id: id as CongeType, l: t.label, s: t.court, c: t.couleur }));
export const typeOf = (id?: string | null) => TYPES.find((t) => t.id === id);
export const demiLabel = (d: CongeDemi) => (d ? CONGES_DEMI[d].label : 'Journée');
/** Valeur d'une cellule : la seule porte de comptage. */
export const val = (c: CongeJour) => valeurJourConge(c.type, c.demi);
/** « 1,5 » et non « 1.5 » (fmtJours de la page actuelle). */
export const nf = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

// ---------------------------------------------------------------- dates
export const P = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addM = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
export const todayIso = () => isoOf(new Date());
export const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const MSHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const LETTER = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
export const WEEK_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const worked = (iso: string) => !estChome(iso);
export const isWE = estWeekend;
export const holiday = ferieDe;
export { joursOuvres };
/** Jours ('YYYY-MM-DD') du mois `mois` (0-11) de `annee`. */
export const daysOf = (annee: number, mois: number) => { const n = new Date(annee, mois + 1, 0).getDate(); return [...Array(n)].map((_, i) => isoOf(new Date(annee, mois, i + 1))); };
/** Les douze mois d'une période de référence (juin → mai), en `[année, mois]`. */
export const monthsOfPeriod = (periode: number): [number, number][] => [...Array(12)].map((_, i) => (i < 7 ? [periode, 5 + i] : [periode + 1, i - 7]) as [number, number]);
export const dateLong = (iso: string) => cap(gx().fmt.dateLong(P(iso)));
export const droitDefaut = CONGES_DROIT_DEFAUT;

// ---------------------------------------------------------------- rendus
/** Case de congé : pleine = validée, pâle = en attente, demi-journée = à moitié remplie. */
export const K: React.FC<{ c: CongeJour; tip?: boolean }> = ({ c, tip = true }) => {
  const L = typeOf(c.type); if (!L) return null;
  return (
    <i className={`cng-k ${c.validated ? 'ok' : 'pend'} ${c.demi === 'AM' ? 'am' : c.demi === 'PM' ? 'pm' : ''}`} style={{ '--c': L.c } as React.CSSProperties}
      data-tip={tip ? `${L.l}${c.demi ? ' — ' + CONGES_DEMI[c.demi].label.toLowerCase() : ''}${c.validated ? ' — validé' : ' — en attente'}` : undefined}>{L.s}</i>
  );
};

/** Petite pastille d'un absent (agenda) : couleur de la personne, liseré du type. */
export const AbsAv: React.FC<{ c: CongeJour }> = ({ c }) => {
  const u = gx().data.user(c.userId), L = typeOf(c.type);
  return <span className={`cng-av ${c.validated ? '' : 'pend'}`} style={{ '--c': u.color, '--r': L?.c } as React.CSSProperties} data-tip={`${u.name} — ${L?.l || c.type}${c.demi ? ` (${CONGES_DEMI[c.demi].court})` : ''}`}>{u.initials}</span>;
};

/** Liste des familles (panneau d'une case, période). */
export const TypesGrid: React.FC<{ sel?: string | null; disabled?: boolean; onPick: (t: CongeType) => void }> = ({ sel, disabled, onPick }) => (
  <div className="cng-types">{TYPES.map((l) => (
    <button key={l.id} data-type={l.id} aria-pressed={sel === l.id} style={{ '--c': l.c } as React.CSSProperties} disabled={disabled} onClick={() => onPick(l.id)}><i>{l.s}</i><span className="ellipsis">{l.l}</span></button>
  ))}</div>
);

// BESOIN: primitive partagée `Tabs` (onglets `.tabs` + `.ink`, pendant de `Seg`) — voir BESOINS.md.
/** Onglets `.tabs` du moteur (GX.ui.refresh / placeInk) avec leur trait `.ink`, logique React. */
export function Tabs<T extends string>({ value, options, onChange, className = '' }: { value: T; options: [T, React.ReactNode][]; onChange: (v: T) => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null), first = useRef(true);
  useLayoutEffect(() => {
    const tabs = ref.current; if (!tabs) return;
    const b = tabs.querySelector<HTMLElement>(':scope > button[aria-selected="true"]'), t = tabs.querySelector<HTMLElement>(':scope > .ink');
    if (!b || !t) return;
    const anim = !first.current; first.current = false;
    if (!anim) t.style.transition = 'none';
    t.style.width = b.offsetWidth - 16 + 'px'; t.style.transform = `translateX(${b.offsetLeft + 8}px)`;
    if (!anim) requestAnimationFrame(() => (t.style.transition = ''));
  });
  return (
    <div ref={ref} className={`tabs ${className}`}>
      {options.map(([v, l]) => <button key={v} data-v={v} aria-selected={v === value} onClick={(e) => { e.stopPropagation(); if (v !== value) onChange(v); }}>{l}</button>)}
      <span className="ink" />
    </div>
  );
}
