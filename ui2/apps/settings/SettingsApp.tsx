import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AppProps } from '../types';
import type { User } from '../../../types';
import { useAuth } from '../../../contexts/AuthContext';
import { useWorkspace } from '../../store/workspace';
import { canUseUi2 } from '../../beta';
import { gx, Icon, Stack, useCompact, useEngineEvent, useSheets } from '../ui/kit';
import { SecIco, UAv, canManageUsers, roleLabel, useAvatarTick, type SectionDef } from './common';
import { PhotoSheet } from './PhotoSheet';
import { AccountPanel } from './AccountPanel';
import { AppearancePanel, DesktopPanel, NotifsPanel } from './ShellPanels';
import { ApplicationPanel, InstallSheet, StoragePanel } from './AppPanels';
import { UsersPanel, setOtherAvatar, type UsersApi } from './UsersPanel';
import { RolesPanel } from './RolesPanel';
import { GooglePanel } from './GooglePanel';
import { AssistantPanel } from './AssistantPanel';
import { canSeeForms, canUseAssistant } from '../../../constants';

// =====================================================================
// Rubrique « Réglages » — transposition de maquettes/v2/js/apps/settings.js (barre latérale profil +
// recherche → panneaux, façon Réglages Système de macOS ; étroit = pile liste → panneau) sur les
// VRAIES fonctions de pages/Settings.tsx (parité : maquettes/ux/inventaires/reglages.md).
// Accès : TOUS les rôles connectés (External et chef de site compris : App.tsx les y autorise).
//  - Compte, Apparence, Bureau et Dock, Notifications, Application, Stockage : tous les rôles ;
//  - Utilisateurs et Rôles & accès : `canManageUsers` (Master, Administrator, Director) ;
//  - Espace détente : Master seul ; Nouvelle interface (bêta) : `canUseUi2(role)`.
// =====================================================================

const SECTIONS: (SectionDef & { manage?: boolean; master?: boolean; forms?: boolean; assistant?: boolean })[] = [
  { id: 'compte', l: 'Compte', t: 'Paramètres du Compte', icon: 'user', c: 'var(--info)', g: 0, sub: 'Identité, ville de référence et mot de passe' },
  { id: 'apparence', l: 'Apparence', icon: 'contrast', c: 'var(--bony-violet)', g: 1, sub: 'Thème, matière, style d’icônes, effets et fond d’écran' },
  { id: 'bureau', l: 'Bureau et Dock', icon: 'desktop', c: 'var(--bony-blue)', g: 1, desktop: true, sub: 'Dock, widgets du bureau et session des fenêtres' },
  { id: 'notifs', l: 'Notifications', icon: 'bell', c: 'var(--danger)', g: 1, sub: 'Bannières, Ne pas déranger et notifications de cet appareil' },
  { id: 'application', l: 'Application', icon: 'download', c: 'var(--ok)', g: 2, sub: 'Installation, notifications de cet appareil et modules' },
  { id: 'comptes', l: 'Comptes connectés', icon: 'link', c: 'var(--info)', g: 2, forms: true, sub: 'Compte Google de la rubrique Forms' },
  { id: 'miaouss', l: 'mIAouss', t: 'mIAouss, l’assistant IA', icon: 'bolt', c: 'var(--bony-orange)', g: 2, assistant: true, sub: 'Consommation, mémoire personnelle et capacité de l’équipe' },
  { id: 'stockage', l: 'Stockage', icon: 'layers', c: 'var(--text-3)', g: 2, sub: 'Disque du serveur et fichiers envoyés dans Gearbox' },
  { id: 'users', l: 'Utilisateurs', t: 'Gestion des Utilisateurs (Master/Admin)', icon: 'users', c: 'var(--bony-orange)', g: 3, manage: true, sub: 'Comptes, rangs, villes, anniversaires et concessions rattachées' },
  { id: 'roles', l: 'Rôles & accès', icon: 'lock', c: 'var(--warn)', g: 3, master: true, sub: 'Qui voit quoi dans Gearbox' },   // Master seul (décision Théo, 30/09/2026)
];
/** Réglages cherchables : [libellé, section, ancre]. */
const ITEMS: [string, string, string][] = [
  ['Nom affiché', 'compte', 'identite'], ['Ville de référence (météo)', 'compte', 'identite'], ['Date de naissance', 'compte', 'identite'], ['Mot de passe', 'compte', 'securite'], ['Identifiant de connexion', 'compte', 'carte'], ['Photo de profil', 'compte', 'carte'],
  ['Barre du haut escamotable', 'bureau', 'dock'], ['Notifications de cet appareil (push)', 'application', 'push'], ['Espace détente (Jeux)', 'application', 'modules'], ['Nouvelle interface (bêta)', 'application', 'beta'], ['Ménage automatique des fichiers', 'stockage', 'menage'],
  ['Thème clair ou sombre', 'apparence', 'theme'], ['Matière (Pixel, Liquid Glass, Opaque)', 'apparence', 'matiere'], ['Style d’icônes', 'apparence', 'icones'], ['Effets économes (flou, transparence)', 'apparence', 'effets'], ['Fond d’écran', 'apparence', 'wallpaper'], ['Widgets du bureau', 'apparence', 'widgets'],
  ['Taille du Dock', 'bureau', 'dock'], ['Agrandissement du Dock', 'bureau', 'dock'], ['Masquer automatiquement le Dock', 'bureau', 'dock'], ['Dock intelligent', 'bureau', 'dock'], ['Personnaliser les widgets du bureau', 'bureau', 'wdg'], ['Réinitialiser les widgets', 'bureau', 'wdg'], ['Réinitialiser la session des fenêtres', 'bureau', 'session'], ['Balayage à deux doigts entre les fenêtres', 'bureau', 'session'],
  ['Ne pas déranger', 'notifs', 'notifs'], ['Notification de test', 'notifs', 'notifs'],
  ['Installer l’application', 'application', 'install'],
  ['Compte Google (Forms)', 'comptes', 'google'], ['Connecter Google', 'comptes', 'google'],
  ['Ma consommation mIAouss', 'miaouss', 'conso'], ['Capacité de l’équipe (questions restantes)', 'miaouss', 'capacite'], ['Mémoire de mIAouss', 'miaouss', 'memoire-notes'], ['Mémoire en pause', 'miaouss', 'memoire-pause'], ['Consommation de l’équipe (plafonds)', 'miaouss', 'equipe'],
  ['Utilisation du stockage', 'stockage', 'usage'], ['Fichiers par type', 'stockage', 'types'],
  ['Gestion des Utilisateurs', 'users', 'users'], ['Nouvel Utilisateur', 'users', 'users'], ['Concessions rattachées', 'users', 'users'],
  ['Matrice des accès', 'roles', 'matrix'], ['Chef de site', 'roles', 'note'],
];
const secDef = (id: string) => SECTIONS.find((s) => s.id === id)!;

export default function SettingsApp({ win, inst }: AppProps) {
  const { user, setAvatarPhoto } = useAuth();
  const users = useWorkspace((s) => s.users);
  const role = user?.role || '';
  const rootRef = useRef<HTMLDivElement>(null), panelRef = useRef<HTMLDivElement>(null), qRef = useRef<HTMLInputElement>(null);
  const compact = useCompact(rootRef as React.RefObject<HTMLElement>, 760);
  const { open: openSheet, portals } = useSheets(win);
  const [, setTick] = useState(0);
  const tick = useCallback(() => setTick((n) => n + 1), []);
  useAvatarTick();
  useEngineEvent('prefs', tick);     // Centre de contrôle, raccourcis : les préférences changent ailleurs
  useEngineEvent('wm:change', tick); // nombre de fenêtres de la session (Bureau et Dock)

  const mobile = gx().host?.dataset?.shell === 'mobile';
  const allowed = useMemo(() => SECTIONS.filter((s) => (!s.manage || canManageUsers(role)) && (!s.master || role === 'Master') && (!s.forms || canSeeForms(role)) && (!s.assistant || canUseAssistant(role)) && (!s.desktop || !mobile)), [role, mobile]);
  const ok = (id?: string) => !!id && allowed.some((s) => s.id === id);
  const tab0 = win.params?.tab;
  const [sec, setSec] = useState<string>(() => (ok(tab0) ? tab0 : 'compte'));
  const [inPanel, setInPanel] = useState(!!tab0);
  const [q, setQ] = useState('');
  const pendingAnchor = useRef<string | null>(null), animNext = useRef(false);
  const usersApi = useRef<UsersApi | null>(null);
  const cur = ok(sec) ? sec : 'compte';

  // --- navigation
  const go = useCallback((id: string, anchor?: string | null) => {
    if (!allowed.some((s) => s.id === id)) return;
    if (id !== cur) animNext.current = true;
    pendingAnchor.current = anchor || null;
    setSec(id); setInPanel(true);
  }, [allowed, cur]);
  useEffect(() => { win.setTitle('Réglages', compact && !inPanel ? '' : secDef(cur).l); }, [cur, compact, inPanel]); // eslint-disable-line react-hooks/exhaustive-deps
  // Changement de panneau : apparition ; ancre demandée par la recherche : défilement + éclair.
  useLayoutEffect(() => {
    const host = panelRef.current; if (!host) return;
    if (animNext.current) { animNext.current = false; host.scrollTop = 0; const f = host.querySelector<HTMLElement>('.set-panel'); if (f) gx().animate(f, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { spring: 'soft' }); }
    const a = pendingAnchor.current; if (!a) return; pendingAnchor.current = null;
    setTimeout(() => { const el = panelRef.current?.querySelector<HTMLElement>(`[data-anchor="${a}"]`); if (!el) return; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.remove('set-flash'); void el.offsetWidth; el.classList.add('set-flash'); }, compact ? 380 : 60);
  });

  // --- volets
  const photo = (target: User | null) => {
    if (!user) return;
    const own = !target || target.id === user.id;
    if (!own && !canManageUsers(role)) return;
    const t = own ? user : target!;
    openSheet((close) => <PhotoSheet target={t} close={close}
      onSave={own ? (url) => setAvatarPhoto(url) : (url) => setOtherAvatar(t, url)} />, { width: 420, onClose: (v) => { if (v === 'ok') gx().shell.hud('Photo de profil mise à jour'); if (v === 'rm') gx().shell.hud('Photo supprimée'); } });
  };
  const install = () => openSheet((close) => <InstallSheet close={close} />, { width: 520 });
  const addUser = () => { if (!ok('users')) return; go('users'); setTimeout(() => usersApi.current?.add(), 120); };

  inst.command = (c: string) => { if (typeof c !== 'string') return; const id = c.startsWith('tab:') ? c.slice(4) : c; if (ok(id)) go(id); if (c === 'add-user') addUser(); };
  inst.menus = () => ({
    'Fichier': ok('users') ? [{ label: 'Ajouter un utilisateur…', icon: 'plus', action: addUser }] : [],
    'Présentation': allowed.map((s) => ({ label: s.l, icon: s.icon, checked: cur === s.id && (!compact || inPanel), action: () => go(s.id) })),
  });

  if (!user) return null;

  // --- barre latérale
  const items = ITEMS.filter(([l, id]) => ok(id) && (l !== 'Nouvelle interface (bêta)' || canUseUi2(role)) && (l !== 'Espace détente (Jeux)' || role === 'Master'));
  const nav = (() => {
    const t = q.trim().toLowerCase();
    if (t) {
      const hits: [string, string, string | null][] = [...allowed.filter((s) => s.l.toLowerCase().includes(t)).map((s) => [s.l, s.id, null] as [string, string, null]), ...items.filter(([l]) => l.toLowerCase().includes(t))];
      const seen = new Set<string>(), uniq = hits.filter((h) => { const k = h[0] + h[1]; if (seen.has(k)) return false; seen.add(k); return true; });
      return uniq.length
        ? <div className="set-navg">{uniq.map(([l, id, a]) => <div key={l + id} className="side-it res" data-go={id} data-anchor-go={a || undefined}><SecIco s={secDef(id)} /><span className="ellipsis">{l}</span><small>{secDef(id).l}</small></div>)}</div>
        : <div className="empty" style={{ padding: '28px 10px' }}><Icon name="search" />Aucun réglage pour « {q} »</div>;
    }
    return [1, 2, 3].map((g) => allowed.filter((s) => s.g === g)).filter((a) => a.length).map((arr, i) => (
      <div key={i} className="set-navg">{arr.map((s) => <div key={s.id} className={`side-it ${s.id === cur && !compact ? 'on' : ''}`} data-go={s.id}><SecIco s={s} /><span className="ellipsis">{s.l}</span>{compact ? <span className="chev"><Icon name="chevron" size="sm" /></span> : null}</div>)}</div>));
  })();
  const onSide = (e: React.MouseEvent) => { const it = (e.target as HTMLElement).closest<HTMLElement>('[data-go]'); if (it) go(it.dataset.go!, it.dataset.anchorGo); };
  const side = (
    <div className="set-side" onClick={onSide}>
      <button className={`set-prof ${cur === 'compte' && !compact ? 'on' : ''}`} data-go="compte"><UAv u={user} cls="lg" /><div style={{ minWidth: 0 }}><b className="ellipsis">{user.name}</b><small>{roleLabel(role)} · Identifiant Gearbox</small></div>{compact ? <span style={{ marginLeft: 'auto', color: 'var(--text-3)' }}><Icon name="chevron" size="sm" /></span> : null}</button>
      <label className="search set-search"><Icon name="search" size="sm" /><input ref={qRef} placeholder="Rechercher un réglage" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { const it = (e.currentTarget.closest('.set-side')?.querySelector('.set-nav [data-go]') as HTMLElement | null); if (it) go(it.dataset.go!, it.dataset.anchorGo); } }} /></label>
      <div className={`set-nav scroll ${compact ? 'big' : ''}`}>{nav}</div>
    </div>
  );

  // --- panneau
  const s = secDef(cur);
  const panel = (() => {
    switch (cur) {
      case 'apparence': return <AppearancePanel s={s} />;
      case 'bureau': return <DesktopPanel s={s} role={role} openSheet={openSheet} />;
      case 'notifs': return <NotifsPanel s={s} onPush={() => go('application', 'push')} />;
      case 'application': return <ApplicationPanel s={s} user={user} onInstall={install} />;
      case 'comptes': return <GooglePanel s={s} />;
      case 'miaouss': return <AssistantPanel s={s} role={role} openSheet={openSheet} />;
      case 'stockage': return <StoragePanel s={s} />;
      case 'users': return <UsersPanel s={s} actor={role} meId={user.id} users={users} openSheet={openSheet} onPhoto={photo} apiRef={usersApi} />;
      case 'roles': return <RolesPanel s={s} cur={role} />;
      default: return <AccountPanel s={s} user={user} onPhoto={() => photo(null)} />;
    }
  })();

  return (
    <div className="app" ref={rootRef}>
      {compact
        ? <Stack onBack={() => setInPanel(false)} pages={[{ key: 'side', title: 'Réglages', noHead: true, content: side }, ...(inPanel ? [{ key: 'panel', title: s.l, content: <div ref={panelRef}>{panel}</div> }] : [])]} />
        : <div className="app-body"><div className="split" style={{ '--side-w': '262px' } as React.CSSProperties}><div className="side">{side}</div><div className="main scroll" ref={panelRef}>{panel}</div></div></div>}
      {portals}
    </div>
  );
}
