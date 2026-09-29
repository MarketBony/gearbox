import React from 'react';
import type { SocialPost } from '../../../types';
import { libelleMarqueDigital, libelleStatutSocial } from '../../../constants';
import { fournisseurDe, libelleCourt } from '../../../lib/linkProviders';
import { gx, Icon } from '../ui/kit';

// =====================================================================
// Rubrique « Digital » : référentiels et rendus partagés (maquettes/v2/js/apps/digital.js, en-tête),
// sur le VRAI modèle `SocialPost`. Aucune règle budgétaire : le Digital n'a pas de budget.
// =====================================================================

export const D = () => gx().data;
export const esc = (s: unknown) => gx().esc(String(s ?? ''));

/** Diffusion (`targets`) : valeur stockée → libellé du bouton. */
export const TARGETS: [string, string][] = [['Internet', 'WEB'], ['Collaborateurs', 'COLLAB.']];
/** Les 8 réseaux de base : ni modifiables ni supprimables (pages/Digital.tsx `LOCKED_NETWORKS`). */
export const LOCKED_NETWORKS = ['Instagram', 'Story Instagram', 'Facebook', 'Story Facebook', 'LinkedIn', 'GMB', 'TikTok', 'YouTube'];
/** Médias : même garde que Digital.tsx et `validerMediaFiles` (routes/social.ts, 50 au plus). */
export const MEDIA_MAX = 50;
export const MEDIA_MAX_SIZE = 2 * 1024 * 1024 * 1024;
export const MEDIA_ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'];

// ---------------------------------------------------------------- dates
/** « YYYY-MM-DD » → date LOCALE (sans décalage UTC). */
export const pd = (s: string) => { const [y, m, d] = (s || '').slice(0, 10).split('-').map(Number); return new Date(y || 1970, (m || 1) - 1, d || 1); };
export const monday = (d: Date) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
export const iso = (d: Date): string => gx().iso(d);
/** Date du jour en heure LOCALE (Digital.tsx utilisait l'UTC : la veille entre 0 h et 2 h). */
export const todayIso = () => iso(gx().today());

// ---------------------------------------------------------------- statuts (couleurs de la maquette, libellés réels)
export const stOf = (id: string) => D().socialStatus(id) as { id: string; c: string; solid?: boolean; strike?: boolean };
const LIGHT_ST = ['Constructeur', 'En attente', 'Validé', 'Publié'];
export const stFill = (id: string) => (stOf(id).strike ? 'var(--surface-4)' : stOf(id).c);
export const stFg = (id: string) => (stOf(id).strike ? 'var(--text-3)' : LIGHT_ST.includes(id) ? '#0b0a10' : '#fff');
export const stColor = (id: string) => (stOf(id).strike ? 'var(--text-3)' : stOf(id).c);
/** « Programmed » est STOCKÉ en anglais, affiché « Programmé » (constants.ts). */
export const stLabel = (id: string) => libelleStatutSocial(id);
export const brandLabel = (b: string) => libelleMarqueDigital(b);
export const stBadgeHTML = (id: string) => `<span class="badge solid" style="--c:${stFill(id)};color:${stFg(id)};font-weight:800;${stOf(id).strike ? 'text-decoration:line-through' : ''}">${esc(stLabel(id))}</span>`;
export const StBadge: React.FC<{ id: string }> = ({ id }) => (
  <span className="badge solid" style={{ '--c': stFill(id), color: stFg(id), fontWeight: 800, ...(stOf(id).strike ? { textDecoration: 'line-through' } : {}) } as React.CSSProperties}>{stLabel(id)}</span>
);
/** Étiquettes de marque pleines (`GX.r.brandChips`), Holding affiché « GROUPE BONY » (libelleMarqueDigital). */
export const DigBrandChips: React.FC<{ brands: string[] }> = ({ brands }) => <>{brands.map((b, i) => (
  <React.Fragment key={b}>{i > 0 && ' '}<span className="badge brand" style={{ '--c': D().brand(b)?.hex, ...(b === 'Renault' ? { color: '#1b1604' } : {}) } as React.CSSProperties}>{brandLabel(b)}</span></React.Fragment>
))}</>;
export const brandChipsHTML = (brands: string[]) => brands.map((b) => `<span class="badge brand" style="--c:${D().brand(b)?.hex};${b === 'Renault' ? 'color:#1b1604' : ''}">${esc(brandLabel(b))}</span>`).join(' ');
export const BrandDots: React.FC<{ brands: string[] }> = ({ brands }) => <>{brands.map((b) => <i key={b} className="brand-dot" style={{ '--c': D().brand(b)?.hex } as React.CSSProperties} data-tip={brandLabel(b)} />)}</>;

// ---------------------------------------------------------------- réseaux
/** Icône d'un réseau (catalogue de base de la maquette ; un réseau ajouté dans les Tags = globe). */
export const NetIc: React.FC<{ id: string }> = ({ id }) => {
  const n = D().network(id);
  return n ? <span style={{ color: n.c, display: 'inline-flex' }} data-tip={n.id}><Icon name={n.icon} size="sm" /></span>
    : <span style={{ color: 'var(--text-3)', display: 'inline-flex' }} data-tip={id}><Icon name="globe" size="sm" /></span>;
};
export const netIcHTML = (id: string) => { const n = D().network(id); return n ? `<span style="color:${n.c};display:inline-flex" data-tip="${esc(n.id)}">${gx().icon(n.icon, 'sm')}</span>` : `<span style="color:var(--text-3);display:inline-flex" data-tip="${esc(id)}">${gx().icon('globe', 'sm')}</span>`; };
export const Nets: React.FC<{ list: string[]; max: number; moreCls?: string }> = ({ list, max, moreCls = 'more' }) => (
  <>{list.slice(0, max).map((n) => <NetIc key={n} id={n} />)}{list.length > max ? <span className={moreCls}>+{list.length - max}</span> : null}</>
);

// ---------------------------------------------------------------- liens et médias
/** Deux formes disjointes dans `mediaFiles` : `/uploads/calendar/<uuid>.<ext>` ou `https://…`. */
export const estLienExterne = (url: string) => /^https?:\/\//i.test(url);
/**
 * Adresse OUVRABLE d'un `post.link`, ou null (pages/Digital.tsx `hrefSur`, correctif 50) : seuls
 * http/https deviennent cliquables — `link` n'est validé nulle part côté serveur, un `javascript:`
 * saisi deviendrait sinon exécutable d'un clic chez un collègue.
 */
export const hrefSur = (lien?: string): string | null => {
  const brut = (lien ?? '').trim(); if (!brut) return null;
  const c = /^www\./i.test(brut) ? `https://${brut}` : brut;
  if (!estLienExterne(c)) return null;
  try { const u = new URL(c); return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null; } catch { return null; }
};
/** Saisie d'un lien (maquette) : `www.…` et `domaine.tld/…` préfixés en https://. */
export const normLink = (v: string) => { v = v.trim(); if (!v) return ''; if (/^www\./i.test(v)) return 'https://' + v; if (!/^[a-z]+:/i.test(v) && /\.[a-z]{2,}/i.test(v)) return 'https://' + v; return v; };
export const shortLink = (u: string) => libelleCourt(u);
export const provider = (u: string) => fournisseurDe(u)?.nom || 'Lien';
/** ⚠️ Jamais sur un lien externe : un `<video src>` vers un tiers serait une requête sortante. */
export const isVideoUrl = (url: string) => !estLienExterne(url) && /\.(mp4|mov)$/i.test(url);
export const mediaFilename = (url: string) => (estLienExterne(url) ? libelleCourt(url) : (url.split('/').pop() ?? url));
/** « 2 fichiers · 1 lien », ou la forme simple (Digital.tsx `libelleMedias`). */
export const libelleMedias = (urls: string[]) => {
  const nl = urls.filter(estLienExterne).length, nf = urls.length - nl, pl = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;
  return !nl ? pl(nf, 'fichier') : !nf ? pl(nl, 'lien') : `${pl(nf, 'fichier')} · ${pl(nl, 'lien')}`;
};
export const nine = (n: number) => (n > 9 ? '9+' : String(n));

// ---------------------------------------------------------------- filtres
/** Périmètre global (barre de menus). Chef de site : le SERVEUR a déjà cloisonné, on ne refiltre pas. */
export function inPeri(p: SocialPost) {
  const per: string = gx().ctx.perimetre; if (!per || per === 'Tout le réseau' || gx().ctx.site) return true;
  const c = p.concessions || [];
  if (per === 'Nissan') return (p.brands || []).includes('Nissan' as any) || c.includes('FULL NISSAN');
  const plaque: string[] | undefined = D().PLAQUES[per];
  if (plaque) return c.includes(per) || c.includes('GROUPE BONY') || c.some((x) => plaque.includes(x));
  return c.includes(per) || c.includes('GROUPE BONY') || c.includes(D().plaqueOf(per));
}

export interface Filters { q: string; brand: string; service: string }
export const F0: Filters = { q: '', brand: '', service: '' };
/** Calendrier / Archives : règles réelles (Holding passe tout filtre marque, « Tous Services » tout filtre service). */
export function listPosts(posts: SocialPost[], archived: boolean, f: Filters, asc: boolean) {
  const q = f.q.trim().toLowerCase();
  return posts.filter((p) => !!p.archived === archived && inPeri(p)
    && (!q || (p.title || '').toLowerCase().includes(q))
    && (!f.brand || (p.brands || []).includes(f.brand as any) || (p.brands || []).includes('Holding'))
    && (!f.service || p.service === f.service || p.service === 'Tous Services'))
    .sort((a, b) => (asc ? 1 : -1) * ((a.date || '').localeCompare(b.date || '') || (a.title || '').localeCompare(b.title || '')));
}
/** Planning : toutes les publications (archivées comprises), filtre de site MONO (plaque ou site). */
export function planPosts(posts: SocialPost[], site: string) {
  const plaque: string[] | undefined = site ? D().PLAQUES[site] : undefined;
  return posts.filter((p) => { const c = p.concessions || []; return inPeri(p) && (!site || c.includes('GROUPE BONY') || c.includes(site) || (!!plaque && c.some((x) => plaque.includes(x)))); });
}

// ---------------------------------------------------------------- session (mêmes clés que pages/Digital.tsx)
const SS = (k: string) => `gearbox_session_${k}`;
export const ssGet = <T,>(k: string, d: T): T => { try { const v = sessionStorage.getItem(SS(k)); return v === null ? d : JSON.parse(v); } catch { return d; } };
export const ssSet = (k: string, v: unknown) => { try { sessionStorage.setItem(SS(k), JSON.stringify(v)); } catch { /* navigation privée */ } };

export type TabId = 'cal' | 'plan' | 'arch' | 'tags';
export const TABS: [TabId, string, string][] = [['cal', 'Calendrier Editorial', 'digital'], ['plan', 'Planning Digital', 'agenda'], ['arch', 'Archives', 'archives'], ['tags', 'Gestion des TAGS', 'settings']];
export const tabOfLabel = (l: string): TabId => TABS.find((t) => t[1] === l)?.[0] || 'cal';
export const labelOfTab = (t: TabId) => TABS.find((x) => x[0] === t)![1];
