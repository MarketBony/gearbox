import React, { useLayoutEffect, useRef } from 'react';
import { Icon, gx } from '../ui/kit';

/**
 * Rubrique CRM — types du contrat d'API (CONTRAT-API.md), formats et petits rendus partagés par les
 * écrans (liste, fiche, arbitrage, accueil). Balisage et classes = maquette validée (maquettes/crm/v2/crm.js).
 */

export type Source = 'VN' | 'VO' | 'BSO';
export type Civilite = 'homme' | 'femme' | 'couple' | 'societe' | null;

export interface ClientRow {
  id: number;
  type: 'particulier' | 'societe';
  civilite: Civilite;
  civilite_dcs: string | null;
  nom: string | null;
  prenom: string | null;
  cp: string | null; ville: string | null;
  site: string | null;
  sites: string[];
  marques: string[];
  derniere_vente: string | null;
  source_derniere: Source | null;
  vehicule: { marque: string | null; modele: string | null; immat: string | null } | null;
  nb_vehicules: number;
  vendeur: string | null;
  fin: { famille: string | null; organisme: string | null; fin: string } | null;
  suspect: boolean;
}
export interface Contact { type: 'portable' | 'fixe' | 'email'; valeur: string; etat: 'valide' | 'suspect'; motif: string | null; sources: Source[]; derniere_vue: string | null }
export interface Vehicule {
  id: number; vin: string | null; immat: string | null; marque: string | null; modele: string | null; version: string | null;
  energie: string | null; genre: string | null; date_mec: string | null; ct_dernier: string | null; ct_prochain: string | null;
  actuel: boolean; derniere_vente: string | null;
}
export interface Financement { organisme: string | null; famille: string | null; produit: string | null; debut: string | null; fin: string | null; duree: number | null; duree_calculee: boolean }
export interface Vente {
  id: number; source: Source; type_vh: 'VN' | 'VO' | 'AUTRE'; date_commande: string | null; date_livraison: string | null;
  affaire: string | null; dossier: string | null; site: string | null; vendeurs: string[]; intermediaire: string | null;
  type_vente: string | null; montant_tarif: number | null; montant_reprise: number | null; vehicule_id: number | null;
  retenue: boolean; motif_exclusion: string | null; absente_depuis: string | null;
  fin: Financement | null;
  garantie: { code: string | null; libelle: string | null; km: number | null } | null;
}
export interface Identite { id: number; source: Source; societe: string; numero: string; nom: string | null; prenom: string | null; cp: string | null; ville: string | null; regle: string }
export interface Fiche {
  client: ClientRow & { num_rue: string | null; type_rue: string | null; rue: string | null };
  contacts: Contact[];
  vehicules: Vehicule[];
  ventes: Vente[];
  identites: Identite[];
}
export interface Paire { a: Fiche; b: Fiche; raison: string }

// ---------------------------------------------------------------- formats
export const PAGE = 50;
export const VH_C: Record<Source, string> = { VN: '#5b7fd6', VO: '#f75632', BSO: '#8a8599' };
export const VH_L: Record<Source, string> = { VN: 'VN', VO: 'VO', BSO: 'Ancienne base' };
export const FAM_C: Record<string, string> = { LOA: '#3b82f6', LLD: '#8b5cf6', 'Crédit': '#10b981', 'Crédit ballon': '#14b8a6', 'Crédit-bail': '#f59e0b', 'Comptant': '#94a3b8' };
export const FAM_LIST = ['LOA', 'LLD', 'Crédit', 'Crédit ballon', 'Crédit-bail', 'Comptant'];
const AV_C = ['#f75632', '#8f12ab', '#293f74', '#e11d74', '#0ea5a4', '#d97706', '#4f46e5', '#16a34a', '#0284c7', '#7c3aed'];
export const CIV: Record<string, { l: string; a: string }> = { homme: { l: 'Homme', a: 'M.' }, femme: { l: 'Femme', a: 'Mme' }, couple: { l: 'Couple', a: 'M. et Mme' }, societe: { l: 'Société', a: '' } };

export const nf = (v: unknown) => (typeof v === 'number' ? v.toLocaleString('fr-FR') : '—');
export const eur = (v: number | null | undefined) => (typeof v === 'number' ? gx().fmt.eur(v) : '—');
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const addM = (iso: string, m: number) => { const d = new Date(iso); d.setMonth(d.getMonth() + m); return gx().iso(d) as string; };
/** Écart en mois (moyens) de `a` à `b`. */
export const mDiff = (a: string, b: string) => (+new Date(b) - +new Date(a)) / (864e5 * 30.44);
export const dFR = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '—');
export const mY = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }).replace('.', '') : '—');
export const rel = (iso: string) => gx().fmt.rel(iso) as string;
export const tel = (n: string) => n.replace(/(\d{2})(?=\d)/g, '$1 ');
export const plural = (n: number, s: string, p = s + 's') => `${nf(n)} ${n > 1 ? p : s}`;
/** Marque DCS (RENAULT) → identifiant de la coque (Renault). */
export const brandName = (b: string | null | undefined) => (b ? b.charAt(0).toUpperCase() + b.slice(1).toLowerCase() : '');
export const brandHex = (b: string | null | undefined) => gx().data.brand(brandName(b))?.hex || '#8a8599';

export const nameOf = (c: Pick<ClientRow, 'type' | 'nom' | 'prenom'>) => (c.type === 'societe' ? c.nom || 'Société sans nom' : [c.nom, c.prenom].filter(Boolean).join(' ') || 'Sans nom');
export const fullName = (c: ClientRow) => (c.type === 'societe' ? nameOf(c) : [CIV[c.civilite || '']?.a, c.nom, c.prenom].filter(Boolean).join(' ') || 'Sans nom');
export const initials = (c: ClientRow) => {
  const w = c.type === 'societe' ? (c.nom || '').split(/\s+/).filter(Boolean) : [c.prenom || '', c.nom || ''];
  const x = (c.type === 'societe' && w.length > 1 ? w.slice(1, 3) : w).map((s) => s[0] || '').join('').toUpperCase();
  return x || '?';
};
export const avC = (id: number) => AV_C[Math.abs(id) % AV_C.length];
export const rcuId = (id: number) => `RCU-${String(id).padStart(7, '0')}`;

/** Mois restants avant la fin d'un financement. */
export const finLeft = (fin: string) => mDiff(today(), fin);
export const finTxt = (fin: string) => { const m = finLeft(fin); return m < 1 ? `fin dans ${Math.max(0, Math.round(m * 30.44))} j` : `fin dans ${Math.round(m)} mois`; };
/** Échéance : rouge sous 3 mois, orange sous 6, bleu au-delà. */
export const finCol = (fin: string) => { const m = finLeft(fin); return m < 3 ? 'var(--danger)' : m < 6 ? 'var(--warn)' : 'var(--info)'; };
export const venteDate = (v: Vente) => v.date_livraison || v.date_commande;

// ---------------------------------------------------------------- petits rendus
const cv = (c: string) => ({ '--c': c } as React.CSSProperties);
export const VhPill: React.FC<{ source: Source | null }> = ({ source }) => (source ? <span className="crm-pill" style={cv(VH_C[source])}>{VH_L[source]}</span> : null);
export const Plate: React.FC<{ immat: string | null | undefined }> = ({ immat }) => (immat ? <span className="crm-plate" data-tip="Immatriculation">{immat}</span> : null);
export const EtatBadge: React.FC<{ etat: 'valide' | 'suspect' }> = ({ etat }) => (etat === 'suspect'
  ? <span className="badge" style={cv('var(--danger)')}><Icon name="alert" size="sm" />Suspect</span>
  : <span className="badge" style={cv('var(--ok)')}><Icon name="check" size="sm" />Valide</span>);
export const FinBadge: React.FC<{ fin: ClientRow['fin'] }> = ({ fin }) => {
  if (!fin?.fin) return null;
  return <span className="badge" style={cv(finCol(fin.fin))} data-tip={`${fin.famille || ''} ${fin.organisme || ''} · échéance le ${dFR(fin.fin)}`}><Icon name="euro" size="sm" />{fin.famille || 'Financement'} · {finTxt(fin.fin)}</span>;
};
export const Empty: React.FC<{ icon?: string; children: React.ReactNode }> = ({ icon, children }) => <div className="empty" style={{ height: '100%' }}>{icon ? <Icon name={icon} /> : null}{children}</div>;

// BESOIN: primitive partagée `Tabs` (onglets `.tabs` + trait `.ink`, pendant de `Seg`) — déjà demandée par Congés (BESOINS.md).
/** Onglets `.tabs` du moteur avec leur trait `.ink`, logique React (même calcul que `placeInk`). */
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
