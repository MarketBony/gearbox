import React, { useEffect, useState } from 'react';
import type { User } from '../../../types';
import { getAvatarUrl } from '../../../services/avatarCache';
import { avatarKey } from '../../../components/Avatar';
import { gx, Icon } from '../ui/kit';

// =====================================================================
// Réglages (v2) — rendus et constantes partagés par les panneaux. Balisage et classes de
// maquettes/v2/js/apps/settings.js (rowH, sw, head, roleBadge, avHTML, octets…).
// =====================================================================

export const RANKS = ['Master', 'Administrator', 'Director', 'Coordinator', 'Digital Manager', 'Guest', 'External', 'Site Manager'];
// ⚠️ Doit rester aligné sur `DIRECTOR_ASSIGNABLE_ROLES` de backend/src/auth/roles.ts (seul garde-fou réel).
// BESOIN: listes recopiées de pages/Settings.tsx (voir BESOINS.md § 3).
export const DIRECTOR_CAN = ['Coordinator', 'Digital Manager', 'Guest', 'External'];
/** Gestion des comptes : Master, Administrator, Director (= ADMIN_ROLES de routes/users.ts). */
export const canManageUsers = (role?: string) => role === 'Master' || role === 'Administrator' || role === 'Director';
/** Suppression : Master et Administrator (= USER_DELETE_ROLES), jamais le compte Master. */
export const canDeleteUser = (role: string | undefined, target: { role: string }) => (role === 'Master' || role === 'Administrator') && target.role !== 'Master';
/** `roleOptions()` de Settings.tsx : le rang en place reste affichable et conservable. */
export const roleOptions = (actor: string | undefined, cur?: string) => {
  const base = actor === 'Director' ? DIRECTOR_CAN : RANKS;
  return cur && !base.includes(cur) ? [cur, ...base] : base;
};

export const ROLE_C: Record<string, string> = { Master: 'var(--bony-orange)', Administrator: 'var(--bony-violet)', Director: 'var(--info)', Coordinator: 'var(--ok)', 'Digital Manager': 'var(--cyan)', Guest: 'var(--text-3)', External: 'var(--warn)', 'Site Manager': 'var(--danger)' };
export const ROLE_SHORT: Record<string, string> = { Master: 'Master', Administrator: 'Admin.', Director: 'Dir.', Coordinator: 'Coord.', 'Digital Manager': 'Digital', Guest: 'Invité', External: 'Externe', 'Site Manager': 'Chef site' };
export const READ_ONLY = ['Guest', 'Site Manager'];
export const roleLabel = (r: string) => gx().data.ROLES[r]?.l || r;
export const DIRECTOR_NOTE = 'Directeur : rangs attribuables Coordinateur, Digital Manager, Invité et Externe. Le rang Chef de site et les rangs de direction restent réservés au Master et aux Administrateurs.';

export const css = (o: Record<string, string | number>) => o as React.CSSProperties;
export const RoleBadge = ({ r }: { r: string }) => <span className="badge" style={css({ '--c': ROLE_C[r] || 'var(--text-3)' })}>{roleLabel(r)}</span>;

/** `formatOctets()` de Settings.tsx (virgule décimale, comme la maquette). */
export const octets = (o: number) => o <= 0 ? '0 o' : o < 1024 ? `${o} o` : o < 2 ** 20 ? `${(o / 1024).toFixed(0)} Ko` : o < 2 ** 30 ? `${(o / 2 ** 20).toFixed(o < 10 * 2 ** 20 ? 1 : 0).replace('.', ',')} Mo` : `${(o / 2 ** 30).toFixed(1).replace('.', ',')} Go`;
export const LIBELLES_TYPE: Record<string, string> = { chat: 'Chat (pièces jointes)', avatar: 'Photos de profil', calendar: 'Digital (médias)' };

/** Anniversaire 'YYYY-MM-DD' → « 4 août » (parse LOCAL, jamais `new Date(iso)` en UTC). */
export const bday = (iso?: string) => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); };
export const initials = (name: string) => (name || '').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';

// ---------------------------------------------------------------- ville (préférence LOCALE au poste)
// Même clé et même forme que pages/Settings.tsx : `gearbox_user_prefs_<id>` = { city }. Lue par Hello
// Marketing pour la météo du poste ; jamais envoyée au serveur.
const USER_PREFS_KEY = (id: string) => `gearbox_user_prefs_${id}`;
export const loadCity = (id: string): string => { try { return { city: '', ...JSON.parse(localStorage.getItem(USER_PREFS_KEY(id)) || '{}') }.city || ''; } catch { return ''; } };
export const saveCity = (id: string, city: string) => { try { localStorage.setItem(USER_PREFS_KEY(id), JSON.stringify({ city })); } catch { /* stockage indisponible */ } };

// ---------------------------------------------------------------- photos de profil
/** Photo : URL serveur (cache alimenté par l'API), sinon photo base64 legacy du poste — même ordre que components/Avatar.tsx. */
export const photoOf = (u: { id: string; avatarUrl?: string | null }) => {
  if (!u.id) return null;
  let legacy: string | null = null; try { legacy = localStorage.getItem(avatarKey(u.id)); } catch { /* */ }
  return getAvatarUrl(u.id) || u.avatarUrl || legacy || null;
};
/** Re-rendu à chaque `gearbox-avatar-updated` (photo changée ici ou ailleurs). */
export function useAvatarTick() {
  const [, set] = useState(0);
  useEffect(() => { const h = () => set((n) => n + 1); window.addEventListener('gearbox-avatar-updated', h); return () => window.removeEventListener('gearbox-avatar-updated', h); }, []);
}
/** `avHTML()` de la maquette : `.av` teinté, ou la photo en fond. */
export const UAv = ({ u, cls = '' }: { u: Pick<User, 'id' | 'name' | 'avatarColor' | 'avatarUrl'>; cls?: string }) => {
  const ph = photoOf(u);
  const c = u.avatarColor || '#8a8599';
  return ph
    ? <span className={`av ${cls}`} style={css({ '--c': c, background: `center/cover url('${ph.replace(/'/g, '%27')}')` })} />
    : <span className={`av ${cls}`} style={css({ '--c': c })}>{initials(u.name)}</span>;
};

// ---------------------------------------------------------------- lignes et interrupteurs
export function Row({ t, d, children, cls = '', anchor, ico }: { t: React.ReactNode; d?: React.ReactNode; children?: React.ReactNode; cls?: string; anchor?: string; ico?: React.ReactNode }) {
  return (
    <div className={`set-row ${cls}`} data-anchor={anchor}>
      {ico}
      <div className="t"><b>{t}</b>{d ? <small>{d}</small> : null}</div>
      <div className="ctl">{children}</div>
    </div>
  );
}
export const Switch = ({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) =>
  <input type="checkbox" className="switch" checked={!!on} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.checked)} />;

/** Icône d'application du moteur (`GX.appIcon`, HTML) dans un conteneur neutre. */
export const AppIco = ({ id, s }: { id: string; s: number }) => (gx().app(id) ? <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: gx().appIcon(id, s) }} /> : null);

export interface SectionDef { id: string; l: string; t?: string; icon: string; c: string; g: number; sub: string; desktop?: boolean }
export const SecIco = ({ s, cls = '' }: { s: { icon: string; c: string }; cls?: string }) => <span className={`set-ico ${cls}`} style={css({ '--c': s.c })}><Icon name={s.icon} /></span>;
/** En-tête au modèle validé : catégorie « Système », titre, sous-titre. */
export const Head = ({ s, extra }: { s: SectionDef; extra?: React.ReactNode }) => (
  <div className="app-head"><div className="ah-t"><span className="ah-eye">Système</span><h1>{s.t || s.l}</h1><span className="sub">{s.sub}</span></div>{extra ? <div className="ah-f">{extra}</div> : null}</div>
);
