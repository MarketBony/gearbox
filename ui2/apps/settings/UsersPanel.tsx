import React, { useDeferredValue, useMemo, useRef, useState } from 'react';
import type { User, UserRole } from '../../../types';
import { SITES, isSiteManager } from '../../../constants';
import { db, ApiError } from '../../../services/dataService';
import { setAvatarUrl } from '../../../services/avatarCache';
import { workspace, echo, logActivity } from '../../store/workspace';
import { gx, Icon } from '../ui/kit';
import { DIRECTOR_NOTE, Head, RoleBadge, UAv, bday, canDeleteUser, canManageUsers, css, loadCity, roleLabel, roleOptions, saveCity, type SectionDef } from './common';

// =====================================================================
// Gestion des Utilisateurs (Master / Administrator / Director) — bloc 2 de pages/Settings.tsx,
// au balisage de la maquette (tableau 8 colonnes, liste en fenêtre étroite, fiche en volet).
// Droits = ceux de la page actuelle, garde-fous réels = serveur (routes/users.ts) :
//  - créer / modifier : ADMIN_ROLES ; un Director n'attribue que DIRECTOR_ASSIGNABLE (canAssignRole) ;
//  - supprimer : Master et Administrator, jamais le compte Master ;
//  - « Concessions rattachées » seulement pour un Site Manager (revalidées par `cleanSites`).
// Liste = `useWorkspace(s => s.users)` (GET /api/users, temps réel `users:*`).
// =====================================================================

type Open = (render: (close: (v?: unknown) => void) => React.ReactNode, opts?: { width?: number; onClose?: (v?: unknown) => void }) => unknown;

// ---------------------------------------------------------------- écritures (bouchons)
// BESOIN: `createUser` / `updateUser` / `deleteUser` / `setUserAvatar` exportés par ui2/store/workspace.ts
// (voir BESOINS.md § 1). Le serveur n'envoie pas `users:*` à l'onglet qui écrit : on applique ici la
// RÉPONSE du serveur (jamais une valeur fabriquée), puis on rejoue l'événement pour les pages actuelles.
const putUser = (u: User) => { const L = workspace.getState().users; workspace.setState({ users: L.some((x) => x.id === u.id) ? L.map((x) => (x.id === u.id ? u : x)) : [...L, u] }); echo('users:updated', u); };
const dropUser = (id: string) => { workspace.setState({ users: workspace.getState().users.filter((x) => x.id !== id) }); echo('users:deleted', id); };
export async function setOtherAvatar(u: User, url: string | null) {
  const srv = await db.setUserAvatar(u.id, url);
  setAvatarUrl(u.id, url);
  window.dispatchEvent(new CustomEvent('gearbox-avatar-updated', { detail: { userId: u.id } }));
  putUser({ ...u, ...srv });
}

// ---------------------------------------------------------------- fiche (création / modification)
function UserForm({ u, isNew, actor, users, close, onSaved, onDelete }: {
  u: User; isNew: boolean; actor: string; users: User[]; close: (v?: unknown) => void; onSaved: (u: User) => void; onDelete: () => void;
}) {
  const roles = roleOptions(actor, u.role);
  const [v, setV] = useState({ name: u.name || '', loginId: u.loginId || '', role: u.role as string, city: isNew ? '' : loadCity(u.id), birthdate: u.birthdate || '', password: isNew ? 'admin' : '' });
  const [sites, setSites] = useState<string[]>(u.sites || []);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const saveRef = useRef<HTMLButtonElement>(null), boxRef = useRef<HTMLDivElement>(null);
  const sm = isSiteManager(v.role);
  const set = (p: Partial<typeof v>) => setV({ ...v, ...p });
  const onRole = (role: string) => {
    const was = isSiteManager(v.role); set({ role });
    if (isSiteManager(role) && !was) requestAnimationFrame(() => boxRef.current && gx().animate(boxRef.current, [{ opacity: 0, transform: 'translateY(-6px) scale(.98)' }, { opacity: 1, transform: 'none' }], { spring: 'bouncy' }));
  };
  const fail = (m: string) => { setErr(m); if (saveRef.current) gx().animate(saveRef.current, [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], { duration: 280, easing: 'ease-out' }); };
  const save = async () => {
    if (busy) return;
    const name = v.name.trim(), loginId = v.loginId.trim(), role = v.role;
    // Écart voulu (maquette) : la page actuelle ne faisait RIEN, sans message, si l'un manquait.
    if (!name || !loginId || !role) return fail('Nom, identifiant et rang sont obligatoires.');
    if (users.some((x) => x.id !== u.id && (x.loginId || '').toLowerCase() === loginId.toLowerCase())) return fail('Cet identifiant de connexion est déjà utilisé.');
    if (!roles.includes(role)) return fail('Vous ne pouvez pas attribuer ce rang.');
    setErr(''); setBusy(true);
    try {
      let saved: User;
      if (isNew) {
        // L'id est généré par le serveur ; le mot de passe part en clair, le hash bcrypt est fait côté serveur.
        saved = await db.createUser({
          name, loginId, password: v.password || 'admin', role: role as UserRole,
          avatarColor: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
          birthdate: v.birthdate || undefined,
          sites: isSiteManager(role) ? sites : [],
        } as Omit<User, 'id'>);
        logActivity('user', "a créé l'utilisateur", saved.name);
      } else {
        // Instantané complet comme la page actuelle ; mot de passe vide = non envoyé = hash inchangé.
        const next: User = { ...u, name, loginId, role: role as UserRole, birthdate: v.birthdate, sites: isSiteManager(role) ? sites : [], ...(v.password ? { password: v.password } : {}) };
        if (!next.password) delete next.password;
        saved = await db.updateUser(next);
        logActivity('user', "a modifié l'utilisateur", saved.name);
      }
      saveCity(saved.id, v.city);     // la ville reste LOCALE au poste
      putUser(saved);
      close('ok'); onSaved(saved);
    } catch (e) {
      // Un 400 / 403 du serveur (rang non attribuable, identifiant pris…) porte un message clair.
      fail(e instanceof ApiError ? e.message : "Échec de l'enregistrement (serveur injoignable ?).");
      setBusy(false);
    }
  };
  const toggleSite = (s: string) => setSites(sites.includes(s) ? sites.filter((x) => x !== s) : [...sites, s]);
  return (
    <>
      <h3>{isNew ? 'Nouvel Utilisateur' : `Modifier ${u.name}`}</h3>
      <div className="muted">{isNew ? 'Le mot de passe part en clair et il est haché côté serveur.' : <>Identifiant : <span className="set-login">{u.loginId}</span></>}</div>
      <div className="form-grid">
        <label className="field"><span className="label">Nom</span><input className="input" autoFocus value={v.name} placeholder="Nom complet" onChange={(e) => set({ name: e.target.value })} /></label>
        <label className="field"><span className="label">ID Connexion</span><input className="input" value={v.loginId} placeholder="ID" onChange={(e) => set({ loginId: e.target.value })} /></label>
        <label className="field"><span className="label">Rang</span><select className="select" value={v.role} onChange={(e) => onRole(e.target.value)}>{roles.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select></label>
        <label className="field"><span className="label">Ville</span><select className="select" value={v.city} onChange={(e) => set({ city: e.target.value })}><option value="">—</option>{SITES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label className="field"><span className="label">Anniversaire</span><input className="input" type="date" value={v.birthdate} onChange={(e) => set({ birthdate: e.target.value || '' })} /></label>
        {/* Champ texte comme la page actuelle (défaut connu : mot de passe par défaut « admin », visible à la saisie). */}
        <label className="field"><span className="label">Mot de passe</span><input className="input" value={v.password} placeholder={isNew ? 'Mot de passe' : 'Laisser vide si inchangé'} autoComplete="new-password" onChange={(e) => set({ password: e.target.value })} /></label>
        {sm ? <div className="full set-sites" ref={boxRef}>
          <div><span className="label" style={{ color: 'var(--danger)' }}>Concessions rattachées</span><div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Le chef de site ne voit que ces concessions, en lecture seule.</div></div>
          <div className="row wrap">{SITES.map((s2) => <button key={s2} type="button" className="chip" aria-pressed={sites.includes(s2)} onClick={() => toggleSite(s2)}>{s2}</button>)}</div>
          {!sites.length ? <div className="set-warn">Aucune concession : ce compte ne verra aucune donnée.</div> : null}
        </div> : null}
        {actor === 'Director' ? <div className="full faint" style={{ fontSize: 12 }}>{DIRECTOR_NOTE}</div> : null}
        <div className="full set-err">{err}</div>
      </div>
      <div className="foot">
        {!isNew && canDeleteUser(actor, u) ? <button className="btn danger" style={{ marginRight: 'auto' }} onClick={() => { close(); setTimeout(onDelete, 60); }}><Icon name="trash" size="sm" />Supprimer</button> : null}
        <button className="btn" onClick={() => close()}><Icon name="close" size="sm" />Annuler</button>
        <button ref={saveRef} className="btn primary" disabled={busy} onClick={save}><Icon name="check" size="sm" />{isNew ? 'Créer' : 'Enregistrer'}</button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- panneau
const Line = React.memo(function Line({ u, me, del }: { u: User; me: boolean; del: boolean }) {
  const city = loadCity(u.id);   // ville : localStorage du POSTE (défaut connu, inventaire § 11)
  const dash = <span className="faint">—</span>;
  return (
    <tr data-uid={u.id} className={me ? 'me' : ''}>
      <td><button className="set-avbtn sm" data-photo={u.id} data-tip="Modifier la photo de profil" aria-label={`Modifier la photo de ${u.name}`}><UAv u={u} /></button></td>
      <td><b>{u.name}</b>{me ? <> <span className="badge" style={css({ '--c': 'var(--accent)' })}>vous</span></> : null}
        {isSiteManager(u.role) ? <div className="faint" style={{ fontSize: 11.5 }}>{(u.sites || []).length ? u.sites!.join(', ') : <span className="set-warn">Aucune concession</span>}</div> : null}</td>
      <td><span className="set-login">{u.loginId}</span></td><td><RoleBadge r={u.role} /></td>
      <td className="muted opt">{city ? <span className="ic"><Icon name="pin" size="sm" />{city}</span> : dash}</td>
      <td className="muted opt">{u.birthdate ? <span className="ic"><Icon name="gift" size="sm" />{bday(u.birthdate)}</span> : dash}</td>
      <td className="faint" style={{ letterSpacing: '.1em' }}>••••••</td>
      <td className="r"><button className="icon-btn sm" data-edit={u.id} data-tip="Modifier" aria-label="Modifier"><Icon name="edit" size="sm" /></button>{del ? <button className="icon-btn sm" data-delu={u.id} data-tip="Supprimer" aria-label="Supprimer" style={{ color: 'var(--danger)' }}><Icon name="trash" size="sm" /></button> : null}</td>
    </tr>
  );
}, (a, b) => a.u === b.u && a.me === b.me && a.del === b.del);

export interface UsersApi { add: () => void }
export function UsersPanel({ s, actor, meId, users, openSheet, onPhoto, apiRef }: {
  s: SectionDef; actor: string; meId: string; users: User[]; openSheet: Open; onPhoto: (u: User) => void; apiRef: React.MutableRefObject<UsersApi | null>;
}) {
  const [uq, setUq] = useState('');
  const [bannerErr, setBannerErr] = useState('');
  const hostRef = useRef<HTMLDivElement>(null);
  const q = useDeferredValue(uq);
  const L = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? users.filter((u) => `${u.name} ${u.loginId || ''} ${loadCity(u.id)} ${roleLabel(u.role)}`.toLowerCase().includes(t)) : users;   // ordre = celui du serveur, pas de tri
  }, [users, q]);
  const find = (id?: string) => users.find((u) => u.id === id);

  const flash = (id: string) => requestAnimationFrame(() => { const r = hostRef.current?.querySelector(`tr[data-uid="${id}"]`); if (r) gx().animate(r, [{ background: 'var(--sel)' }, { background: 'transparent' }], { duration: 1400, easing: 'ease-out' }); });
  const edit = (u: User | null) => {
    if (!canManageUsers(actor)) return;
    const isNew = !u;
    const base = u || ({ id: '', name: '', loginId: '', role: 'Coordinator', birthdate: '', sites: [] } as unknown as User);
    openSheet((close) => <UserForm u={base} isNew={isNew} actor={actor} users={users} close={close}
      onSaved={(sv) => { flash(sv.id); gx().shell.notify({ app: 'settings', title: isNew ? 'Utilisateur créé' : 'Utilisateur modifié', body: `${sv.name} · ${roleLabel(sv.role)}${isSiteManager(sv.role) ? ' · ' + ((sv.sites || []).join(', ') || 'aucune concession') : ''}`, silent: true }); }}
      onDelete={() => remove(base)} />, { width: 620 });
  };
  const remove = (u: User) => {
    if (!canDeleteUser(actor, u)) return;
    openSheet((close) => (
      <><h3>Supprimer {u.name} ?</h3><div className="muted">Êtes-vous sûr de vouloir supprimer cet utilisateur ?</div>
        <div className="foot"><button className="btn" onClick={() => close()}>Annuler</button><button className="btn primary" style={{ background: 'var(--danger)' }} onClick={async () => {
          close('ok'); setBannerErr('');
          try {
            await db.deleteUser(u.id);
            logActivity('user', "a supprimé l'utilisateur", u.name);
            const row = hostRef.current?.querySelector(`tr[data-uid="${u.id}"]`);
            const done = () => { dropUser(u.id); gx().shell.notify({ app: 'settings', title: 'Utilisateur supprimé', body: u.name, silent: true }); };
            if (row) gx().animate(row, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(30px)' }], { duration: 240, easing: 'ease-in', fill: 'forwards' }).onfinish = done; else done();
          } catch (e) { setBannerErr(e instanceof ApiError ? e.message : 'Échec de la suppression (serveur injoignable ?).'); }
        }}>Supprimer</button></div></>));
  };
  apiRef.current = { add: () => edit(null) };

  const onClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    const ph = t.closest<HTMLElement>('[data-photo]'); if (ph) { const u = find(ph.dataset.photo); if (u) onPhoto(u); return; }
    const ed = t.closest<HTMLElement>('[data-edit]'); if (ed) { const u = find(ed.dataset.edit); if (u) edit(u); return; }
    const du = t.closest<HTMLElement>('[data-delu]'); if (du) { const u = find(du.dataset.delu); if (u) remove(u); }
  };
  const note = actor === 'Director'
    ? DIRECTOR_NOTE + ' La suppression est réservée au Master et aux Administrateurs.'
    : 'Suppression réservée au Master et aux Administrateurs ; le compte Master ne peut jamais être supprimé.';
  return (
    <div className="set-panel" ref={hostRef}>
      <Head s={s} extra={<><span className="faint num" style={{ fontSize: 12.5 }}>{users.length} comptes</span><button className="btn primary" onClick={() => edit(null)}><Icon name="plus" size="sm" />Nouvel Utilisateur</button></>} />
      {bannerErr ? <div className="set-usr-err">{bannerErr}</div> : null}
      <div className="set-group enter" data-anchor="users" onClick={onClick}>
        <div className="set-utools"><label className="search grow" style={{ minWidth: 160 }}><Icon name="search" size="sm" /><input placeholder="Rechercher un nom, un identifiant, une ville" value={uq} onChange={(e) => setUq(e.target.value)} /></label></div>
        <div className="set-utblwrap scroll"><table className="tbl set-utbl"><thead><tr><th style={{ width: 56 }} /><th>Nom</th><th>ID Connexion</th><th>Rang</th><th className="opt">Ville</th><th className="opt">Anniversaire</th><th>Mot de passe</th><th className="r">Actions</th></tr></thead>
          <tbody>{L.length ? L.map((u) => <Line key={u.id} u={u} me={u.id === meId} del={canDeleteUser(actor, u)} />) : <tr><td colSpan={8}><div className="empty" style={{ padding: 20 }}>Aucun utilisateur</div></td></tr>}</tbody></table></div>
        <div className="set-ulist">{L.length ? L.map((u) => (
          <div key={u.id} className="list-row" data-edit={u.id}><UAv u={u} /><div className="grow" style={{ minWidth: 0 }}><div className="row" style={{ gap: 6 }}><b className="ellipsis">{u.name}</b><RoleBadge r={u.role} /></div><div className="faint ellipsis" style={{ fontSize: 12 }}><span className="set-login">{u.loginId}</span> · {loadCity(u.id) || '—'} · {u.birthdate ? bday(u.birthdate) : '—'}</div></div><span className="faint"><Icon name="chevron" size="sm" /></span></div>)) : <div className="empty">Aucun utilisateur</div>}</div>
      </div>
      <div className="set-note">{note} Cliquez sur un avatar pour changer la photo d’un compte.</div>
    </div>
  );
}
