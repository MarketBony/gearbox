import React from 'react';
import { db } from '../../../../services/dataService';
import { dFR, today } from '../common';

/**
 * SPARK lot 4 — types et petits rendus partagés par l'onglet Équipes et la fiche client (portefeuille).
 * Contrat : backend/src/routes/crmEquipes.ts. Maquette validée : maquettes/crm/v2/equipes.js.
 */

export type Fonction = 'hall' | 'secteur' | 'societes' | 'magasin' | 'alternant';
export interface Vendeur {
  id: number; nom: string; prenom: string; site: string; service: 'VN' | 'VO'; fonction: Fonction; marques: string[]; recoit: boolean;
  entree: string | null; sortie: string | null; archive: boolean; zones: string[]; remplacant_id: number | null;
  ipn: string | null; telephone: string | null; email: string | null; note: string | null;
  noms_dcs: string[]; portefeuille: number; via_agent: number; reattribues: number;
}
export interface Equipes {
  sites: { site: string; plaque: string; ordre: number }[];
  encadrement: { site: string; role: string; nom: string }[];
  parametres: { actif: boolean; anciennete_ans: number | null; maj_le: string; maj_par: string | null };
  dernier_calcul: { id: number; fin: string; changements: number } | null;
  a_valider: number; a_attribuer: { site: string; n: number }[];
  vendeurs: Vendeur[];
}

export const FONCTIONS: Record<Fonction, { l: string; c: string; tip: string }> = {
  hall: { l: 'Hall', c: 'var(--info)', tip: 'Reçoit les clients sans vendeur du site, répartis au moins chargé' },
  secteur: { l: 'Secteur', c: 'var(--bony-violet)', tip: 'Reçoit les clients sans vendeur de SES codes postaux' },
  societes: { l: 'Sociétés', c: 'var(--warn)', tip: 'Reçoit les clients sociétés sans vendeur du site' },
  magasin: { l: 'Magasin', c: 'var(--text-3)', tip: 'Magasin / DIAC : ne reçoit pas de clients par le calcul' },
  alternant: { l: 'Alternant', c: 'var(--text-3)', tip: 'Ne reçoit pas de clients (« pas de leads »)' },
};
export const MARQUES = ['RENAULT', 'DACIA', 'ALPINE', 'NISSAN', 'MOBILIZE'];
export const ROLES_ENC: [string, string][] = [['chef_de_site', 'Chef de site'], ['chef_de_vente_vn', 'Chef des ventes VN'], ['chef_de_vente_vo', 'Chef des ventes VO']];
export const ORIGINES: Record<string, string> = {
  achat: 'Vendeur de son dernier achat', garde: 'Gardé (vendeur toujours présent)', regle: 'Règle particulière', societes: 'Vendeur Sociétés',
  secteur: 'Secteur (code postal)', hall: 'Hall (au moins chargé)', manuel: 'Choisi à la main', a_attribuer: 'À attribuer', hors: 'Hors portefeuille',
};

export const nomV = (v: Pick<Vendeur, 'prenom' | 'nom'> | undefined | null) => (v ? [v.prenom, v.nom].filter(Boolean).join(' ') : '');
export type Statut = 'present' | 'part' | 'arrive' | 'sorti' | 'archive';
export const statut = (v: Vendeur): Statut => {
  const T = today();
  if (v.archive) return 'archive';
  if (v.sortie && v.sortie < T) return 'sorti';
  if (v.entree && v.entree > T) return 'arrive';
  return v.sortie ? 'part' : 'present';
};
const ST: Record<Statut, [string, string]> = { present: ['Présent', 'var(--ok)'], part: ['Part', 'var(--warn)'], arrive: ['Arrive', 'var(--info)'], sorti: ['Sorti', 'var(--text-3)'], archive: ['Archivé', 'var(--text-3)'] };
const cv = (c: string) => ({ '--c': c } as React.CSSProperties);
export const StatutBadge: React.FC<{ v: Vendeur }> = ({ v }) => {
  const s = statut(v), [l, c] = ST[s];
  return <span className="badge" style={cv(c)}>{l}{s === 'part' || s === 'sorti' ? ` le ${dFR(v.sortie)}` : s === 'arrive' ? ` le ${dFR(v.entree)}` : ''}</span>;
};
export const FonctionBadge: React.FC<{ f: Fonction }> = ({ f }) => <span className="badge" style={cv(FONCTIONS[f].c)} data-tip={FONCTIONS[f].tip}>{FONCTIONS[f].l}</span>;
export const zoneL = (z: string) => (z.length === 2 ? `dép. ${z}` : z);

/** Référentiel chargé une fois et partagé (fiche client : choix du vendeur) ; `invalider()` après une écriture. */
let cache: Promise<Equipes> | null = null;
export const equipes = (force = false): Promise<Equipes> => {
  if (!cache || force) cache = db.getCrmEquipes().catch((e: unknown) => { cache = null; throw e; });
  return cache;
};
export const invalider = () => { cache = null; };
