import React from 'react';
import { Icon } from '../../ui/kit';
import { today } from '../common';
import type { Canal, Format, Ligne } from './modele';

/**
 * Requêteur — outils partagés : pictogrammes absents du jeu commun, noms de fichier, téléchargement, CSV, numéros, SMS.
 */

// ---------------------------------------------------------------- pictogrammes (maquette : IC, même trait que le moteur)
const PATHS: Record<string, React.ReactNode> = {
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />,
  printer: <><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></>,
  sheet: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" /></>,
  letter: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
};
/** Pictogramme du jeu commun, ou l'un des quatre dessinés ici (phone, printer, sheet, letter). */
export const Ico: React.FC<{ name: string }> = ({ name }) => (PATHS[name]
  ? <svg className="i sm" viewBox="0 0 24 24" aria-hidden="true">{PATHS[name]}</svg>
  : <Icon name={name} size="sm" />);

export const FMT: Record<Format, [string, string]> = { excel: ['Excel', 'sheet'], sarbacane: ['Sarbacane', 'mail'], allmysms: ['allmysms', 'sms'], phoning: ['Phoning', 'printer'], courrier: ['Courrier', 'letter'] };
export const FMT_ORDER: Format[] = ['excel', 'sarbacane', 'allmysms', 'phoning', 'courrier'];
/** Bouton d'export mis en avant selon le canal de la requête. */
export const REC: Partial<Record<Canal, Format>> = { email: 'sarbacane', sms: 'allmysms', phoning: 'phoning', courrier: 'courrier' };

// ---------------------------------------------------------------- nom du fichier (décision Théo, 12/10)
const FEXT: Record<Format, string> = { excel: 'xlsx', sarbacane: 'csv', allmysms: 'csv', phoning: 'pdf', courrier: 'xlsx' };
export const plain = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const slug = (x: string) => plain(x).replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
/** SPARK_<format>_<requete>_<exportateur>_<AAAA-MM-JJ>.<ext> */
export const fname = (fmt: Format, requete: string, who: string, date = today()) => `SPARK_${fmt}_${slug(requete).slice(0, 40) || 'requete'}_${slug(who) || 'inconnu'}_${date}.${FEXT[fmt]}`;

// ---------------------------------------------------------------- fichiers
/** Téléchargement : Blob + lien <a download> créé dans le document PRINCIPAL (la rubrique vit dans une racine fantôme). */
export function telecharger(nom: string, blob: Blob) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = nom; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const cell = (v: unknown) => { const s = v == null ? '' : String(v); return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
/** CSV « ; », UTF-8 AVEC BOM (Excel et Sarbacane lisent alors les accents correctement). */
export const csvBlob = (rows: unknown[][]) => new Blob(['﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
export const csvText = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(';')).join('\n');

// ---------------------------------------------------------------- valeurs
/** AAAA-MM-JJ → JJ/MM/AAAA (le reste inchangé). */
export const isoFR = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : v == null ? '' : v);
/** Civilité Sarbacane / publipostage : Madame ou Monsieur (un couple sort en Monsieur), vide pour une société. */
export const civS = (v: unknown) => { const s = String(v || '').toLowerCase(); return s === 'madame' || s === 'femme' ? 'Madame' : s === 'monsieur' || s === 'homme' || s === 'couple' ? 'Monsieur' : ''; };
export const civA = (v: unknown) => ({ Madame: 'Mme', Monsieur: 'M.' } as Record<string, string>)[civS(v)] || '';
export const nomL = (l: Ligne) => [l.nom, l.prenom].filter(Boolean).join(' ') || 'Sans nom';
export const fullL = (l: Ligne) => [civA(l.civilite), l.nom, l.prenom].filter(Boolean).join(' ') || 'Sans nom';
/** Numéro au format international : 33XXXXXXXXX, ou +33XXXXXXXXX. */
export const intl = (raw: unknown, plus: boolean) => {
  let d = String(raw || '').replace(/\D/g, ''); if (!d) return '';
  if (d.startsWith('0033')) d = d.slice(2);
  if (d.startsWith('0') && d.length === 10) d = '33' + d.slice(1);
  else if (!d.startsWith('33') && d.length === 9) d = '33' + d;
  return (plus ? '+' : '') + d;
};

// ---------------------------------------------------------------- SMS (alphabet GSM 03.38)
const GSM = new Set('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà');
const GSMX = new Set('^{}\\[~]|€');
export function smsLen(t: string) {
  const bad = [...new Set([...t].filter((ch) => !GSM.has(ch) && !GSMX.has(ch)))];
  if (bad.length) { const n = t.length; return { n, parts: n <= 70 ? 1 : Math.ceil(n / 67), bad }; }
  const n = [...t].reduce((s, ch) => s + (GSMX.has(ch) ? 2 : 1), 0);
  return { n, parts: n <= 160 ? 1 : Math.ceil(n / 153), bad };
}
