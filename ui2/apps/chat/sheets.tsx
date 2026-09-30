import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatConversation, Project, User } from '../../../types';
import { db, ApiError } from '../../../services/dataService';
import { emitWithAck } from '../../../services/socket';
import { chatStore } from '../../../services/chatStore';
import { FONDS_CHAT, BULLES_CHAT, PREFIXE_PROC, styleFondChat, estFondImporte, bulleDe } from '../../../lib/personnalisationChat';
import { useWorkspace } from '../../store/workspace';
import { gx, hud, Icon } from '../ui/kit';
import {
  useChatConvs, convName, privateWith, roleLabel, UserAv,
  AVATAR_INPUT_TYPES, MAX_AVATAR_SIZE, FOND_TYPES, MAX_FOND_SIZE,
} from './common';

// =====================================================================
// Volets du Chat (win.sheet du moteur, contenu React) : message privé, nouveau groupe, membres,
// photo du groupe, personnalisation (thème PARTAGÉ), citer un projet, confirmations, alertes.
// Balisage : maquettes/v2/js/apps/chat.js ; règles et messages : pages/Chat.tsx.
// Chaque volet relit la conversation dans le store temps réel : il reste juste si un autre membre
// la modifie pendant qu'il est ouvert.
// =====================================================================

type Close = (v?: unknown) => void;
const errMsg = (e: unknown, def: string) => (e instanceof ApiError || e instanceof Error) && e.message ? e.message : def;

/** Alerte (remplace les `alert()` natifs de la page, interdits par PORTAGE.md § 5). */
export function AlertSheet({ title, body, close }: { title: string; body?: string; close: Close }) {
  return (
    <><h3>{title}</h3>{body ? <div className="muted" style={{ whiteSpace: 'pre-line' }}>{body}</div> : null}
      <div className="foot"><button className="btn primary" autoFocus onClick={() => close()}>OK</button></div></>
  );
}

export function ConfirmSheet({ title, body, ok, close, onOk }: { title: string; body: string; ok: string; close: Close; onOk: () => void }) {
  return (
    <><h3>{title}</h3><div className="muted">{body}</div>
      <div className="foot"><button className="btn" onClick={() => close()}>Annuler</button><button className="btn primary" style={{ background: 'var(--danger)' }} onClick={() => { close('ok'); onOk(); }}>{ok}</button></div></>
  );
}

// ---------------------------------------------------------------- message privé
export function NewDmSheet({ meId, people, close, onPick }: { meId: string; people: User[]; close: Close; onPick: (uid: string) => void }) {
  const convs = useChatConvs();
  const [q, setQ] = useState('');
  const s = q.trim().toLowerCase();
  const rows = people.filter((u) => !s || u.name.toLowerCase().includes(s));
  return (
    <><h3>Message privé</h3><div className="muted">Conversation 1-to-1</div>
      <label className="search" style={{ marginTop: 12 }}><Icon name="search" size="sm" /><input autoFocus placeholder="Rechercher un collègue" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <div className="cht-pick scroll">
        {rows.length ? rows.map((u) => (
          <div key={u.id} className="list-row" onClick={() => { close(); onPick(u.id); }}>
            <UserAv u={u} />
            <div className="grow" style={{ minWidth: 0 }}><b className="ellipsis" style={{ display: 'block' }}>{u.name}</b><span className="faint" style={{ fontSize: 12.5 }}>{roleLabel(u.role)}</span></div>
            {privateWith(convs, meId, u.id) ? <span className="badge" style={{ '--c': 'var(--info)' } as React.CSSProperties}>EXISTANTE</span> : null}
          </div>
        )) : <div className="empty">Personne</div>}
      </div>
      <div className="foot"><button className="btn" onClick={() => close()}>Annuler</button></div></>
  );
}

// ---------------------------------------------------------------- nouveau groupe
export function NewGroupSheet({ meId, people, close, onCreated }: { meId: string; people: User[]; close: Close; onCreated: (c: ChatConversation) => void }) {
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const n = chosen.length, ok = !!name.trim() && n >= 2;
  const create = async () => {
    if (!ok || busy) return;
    setBusy(true); setErr('');
    try {
      // Le créateur est ajouté d'office et administrateur du groupe (Chat.tsx).
      const conv = await db.createConversation({ type: 'group', name: name.trim(), participants: [...new Set([meId, ...chosen])], adminIds: [meId] });
      chatStore.upsertConversation(conv);
      close(); onCreated(conv);
    } catch (e) { setErr(errMsg(e, 'Échec de la création du groupe.')); setBusy(false); }
  };
  return (
    <><h3>Nouveau groupe</h3><div className="muted">Groupe de travail · vous en serez l’administrateur.</div>
      <label className="field" style={{ marginTop: 14 }}><span className="label">Nom du groupe</span><input className="input" autoFocus placeholder="Ex: Équipe comm Renault…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(); }} /></label>
      <div className="row" style={{ marginTop: 12 }}><span className="label grow">Membres ({n} sélectionné{n > 1 ? 's' : ''}) — 2 minimum</span></div>
      <div className="cht-pick scroll">{people.map((u) => (
        <label key={u.id} className="list-row" style={{ cursor: 'pointer' }}>
          <input type="checkbox" className="check" checked={chosen.includes(u.id)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, u.id] : c.filter((x) => x !== u.id)))} />
          <UserAv u={u} cls="sm" /><span className="grow ellipsis">{u.name}</span><span className="faint" style={{ fontSize: 12.5 }}>{roleLabel(u.role)}</span>
        </label>
      ))}</div>
      {err ? <div style={{ color: 'var(--danger)', fontSize: 12.5, fontWeight: 600, marginTop: 8 }}>{err}</div> : null}
      <div className="foot"><button className="btn" onClick={() => close()}>Annuler</button><button className="btn primary" disabled={!ok || busy} onClick={create}>{busy ? 'Création…' : 'Créer le groupe'}</button></div></>
  );
}

// ---------------------------------------------------------------- membres du groupe
export function MembersSheet({ convId, meId, people, close, confirm, alert }: {
  convId: string; meId: string; people: User[]; close: Close;
  confirm: (title: string, body: string, ok: string, onOk: () => void) => void; alert: (t: string) => void;
}) {
  const convs = useChatConvs();
  const users = useWorkspace((s) => s.users);
  const c = convs.find((x) => x.id === convId);
  useEffect(() => { if (!c) close(); }, [!!c]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!c) return null;
  const byId: Record<string, User> = Object.fromEntries(users.map((u) => [u.id, u]));
  const admins = c.adminIds ?? [], adm = admins.includes(meId);
  const out = people.filter((u) => !c.participants.includes(u.id));
  // Par le SERVEUR (`chat:conversation:members`) : la réponse part dans le store, le `updated` qui suit la rediffuse.
  const change = async (patch: { add?: string[]; remove?: string[] }) => {
    try { chatStore.upsertConversation(await emitWithAck<ChatConversation>('chat:conversation:members', { conversationId: c.id, ...patch })); }
    catch (e) { alert(errMsg(e, 'Mise à jour des membres impossible.')); }
  };
  return (
    <><h3>Membres ({c.participants.length})</h3><div className="muted">{convName(c, meId, byId)}{adm ? '' : ' · seul un administrateur du groupe peut ajouter ou retirer des membres'}</div>
      <div className="cht-pick scroll">{c.participants.map((id) => {
        const u = byId[id], a = admins.includes(id);
        return (
          <div key={id} className="list-row">
            <UserAv u={u} />
            <div className="grow" style={{ minWidth: 0 }}><b className="ellipsis" style={{ display: 'block' }}>{u?.name || 'Ancien membre'}{id === meId ? ' (moi)' : ''}</b><span className="faint" style={{ fontSize: 12.5 }}>{a ? '★ Admin' : u ? roleLabel(u.role) : ''}</span></div>
            {/* Ni soi-même ni un admin ne peuvent être retirés (serveur : realtime/chat.ts). */}
            {adm && !a && id !== meId ? <button className="btn sm danger" data-tip="Retirer" onClick={() => confirm(`Retirer ${u?.name ?? 'ce membre'} du groupe ?`, 'Cette personne n’y aura plus accès.', 'Retirer', () => change({ remove: [id] }))}>Retirer</button> : null}
          </div>
        );
      })}</div>
      {adm && out.length ? <><div className="label" style={{ marginTop: 14 }}>Ajouter</div>
        <div className="cht-pick scroll" style={{ marginTop: 6 }}>{out.map((u) => (
          <button key={u.id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => change({ add: [u.id] })}>
            <UserAv u={u} cls="sm" /><div className="grow" style={{ minWidth: 0 }}><b className="ellipsis" style={{ display: 'block' }}>{u.name}</b><span className="faint" style={{ fontSize: 12.5 }}>{roleLabel(u.role)}</span></div><Icon name="plus" size="sm" />
          </button>
        ))}</div></> : null}
      <div className="foot"><button className="btn primary" onClick={() => close()}>Terminé</button></div></>
  );
}

// ---------------------------------------------------------------- photo du groupe
const CIRCLE = 190;
/**
 * Photo PARTAGÉE du groupe (tout participant peut la changer, décision de Théo). Même chemin que la
 * page : recadrage rond → JPEG 200×200 → POST /api/uploads/avatar → `chat:conversation:avatar`, que le
 * serveur rediffuse à tous (émetteur compris) : aucune écriture optimiste.
 * Recadrage : cercle de la maquette (zoom 1 à 3, pas de 0,05) + déplacement au glisser.
 */
export function GroupPhotoSheet({ convId, meId, close }: { convId: string; meId: string; close: Close }) {
  const convs = useChatConvs(), users = useWorkspace((s) => s.users);
  const c = convs.find((x) => x.id === convId);
  const [src, setSrc] = useState<string | null>(null);
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1), [off, setOff] = useState({ x: 0, y: 0 });
  const [err, setErr] = useState(''), [saving, setSaving] = useState<'' | 'save' | 'del'>('');
  const fileRef = useRef<HTMLInputElement>(null);
  const byId: Record<string, User> = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  if (!c) return null;

  const take = (f: File | null | undefined) => {
    if (!f) return;
    if (!AVATAR_INPUT_TYPES.includes(f.type)) { setErr('Format non supporté. Utilisez jpg, png, gif ou webp.'); return; }
    if (f.size > MAX_AVATAR_SIZE) { setErr('Fichier trop lourd (max 5 Mo).'); return; }
    setErr('');
    const rd = new FileReader();
    rd.onload = () => {
      const url = rd.result as string, img = new Image();
      img.onload = () => { setDim({ w: img.naturalWidth, h: img.naturalHeight }); setSrc(url); setZoom(1); setOff({ x: 0, y: 0 }); };
      img.onerror = () => setErr('Format non supporté. Utilisez jpg, png, gif ou webp.');
      img.src = url;
    };
    rd.readAsDataURL(f);
  };
  // Échelle « couvrir le cercle » × zoom ; le décalage reste borné pour que l'image couvre toujours le cercle.
  const scale = dim ? (CIRCLE / Math.min(dim.w, dim.h)) * zoom : 1;
  const clamp = (o: { x: number; y: number }, s = scale) => {
    if (!dim) return o;
    const mx = Math.max(0, (dim.w * s - CIRCLE) / 2), my = Math.max(0, (dim.h * s - CIRCLE) / 2);
    return { x: Math.max(-mx, Math.min(mx, o.x)), y: Math.max(-my, Math.min(my, o.y)) };
  };
  const drag = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget, sx = e.clientX, sy = e.clientY, o0 = off;
    el.setPointerCapture(e.pointerId);
    const mv = (ev: PointerEvent) => setOff(clamp({ x: o0.x + ev.clientX - sx, y: o0.y + ev.clientY - sy }));
    el.addEventListener('pointermove', mv);
    el.addEventListener('pointerup', () => el.removeEventListener('pointermove', mv), { once: true });
  };
  const crop = (): Promise<Blob> => new Promise((res, rej) => {
    if (!src || !dim) return rej(new Error('Aucune image.'));
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = 200; cv.height = 200;
      const ctx = cv.getContext('2d'); if (!ctx) return rej(new Error('No canvas context'));
      const side = CIRCLE / scale, cx = dim.w / 2 - off.x / scale, cy = dim.h / 2 - off.y / scale;
      ctx.beginPath(); ctx.arc(100, 100, 100, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(img, cx - side / 2, cy - side / 2, side, side, 0, 0, 200, 200);
      cv.toBlob((b) => (b ? res(b) : rej(new Error('Recadrage impossible.'))), 'image/jpeg', 0.88);
    };
    img.onerror = rej; img.src = src;
  });
  const validate = async () => {
    if (!src || saving) return;
    setSaving('save'); setErr('');
    try {
      const blob = await crop();
      const url = await db.uploadFile('avatar', new File([blob], 'group-avatar.jpg', { type: 'image/jpeg' }));
      await emitWithAck('chat:conversation:avatar', { conversationId: c.id, avatarUrl: url });
      close(); hud('Photo du groupe mise à jour');
    } catch (e) {
      // On ne ferme PAS : le recadrage est conservé ; le message serveur est affiché tel quel.
      setErr(errMsg(e, 'Échec de l’enregistrement. Réessayez.')); setSaving('');
    }
  };
  const remove = async () => {
    if (saving) return;
    setSaving('del'); setErr('');
    try { await emitWithAck('chat:conversation:avatar', { conversationId: c.id, avatarUrl: null }); close(); }
    catch (e) { setErr(errMsg(e, 'Échec de la suppression. Réessayez.')); setSaving(''); }
  };
  const bg = dim ? `calc(50% + ${off.x}px) calc(50% + ${off.y}px) / ${dim.w * scale}px ${dim.h * scale}px no-repeat url("${src}")` : undefined;
  return (
    <><h3>Photo du groupe</h3><div className="muted">{convName(c, meId, byId)} · visible par tous les membres</div>
      {!src ? (
        <div tabIndex={0} role="button" onClick={() => fileRef.current?.click()} onKeyDown={(e) => { if (e.key === 'Enter') fileRef.current?.click(); }}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); take(e.dataTransfer.files[0]); }}
          style={{ marginTop: 14, height: 170, borderRadius: 14, border: '2px dashed var(--line-2)', display: 'grid', placeContent: 'center', justifyItems: 'center', gap: 6, textAlign: 'center', cursor: 'pointer' }}>
          <Icon name="upload" size="lg" /><b>Glisser une photo ici</b><span className="muted" style={{ fontSize: 12.5 }}>ou cliquer pour parcourir</span><span className="faint" style={{ fontSize: 11.5 }}>jpg, png, gif, webp — max 5 Mo</span>
        </div>
      ) : (
        <><div style={{ marginTop: 14, height: 230, borderRadius: 14, background: '#000', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
          <div onPointerDown={drag} style={{ width: CIRCLE, height: CIRCLE, borderRadius: '50%', background: bg, boxShadow: '0 0 0 999px rgba(0,0,0,.55)', cursor: 'grab', touchAction: 'none' }} />
        </div>
          <div className="row" style={{ marginTop: 10 }}><Icon name="search" size="sm" /><input type="range" className="grow" min={1} max={3} step={0.05} value={zoom} aria-label="Zoom"
            onChange={(e) => { const z = +e.target.value; setZoom(z); if (dim) setOff((o) => clamp(o, (CIRCLE / Math.min(dim.w, dim.h)) * z)); }} /></div>
          <button className="btn ghost sm" style={{ marginTop: 6 }} disabled={!!saving} onClick={() => { setSrc(null); setDim(null); }}>Choisir une autre photo</button></>
      )}
      <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/gif,image/webp" onChange={(e) => { take(e.target.files?.[0]); e.target.value = ''; }} />
      <div style={{ color: 'var(--danger)', fontSize: 12.5, fontWeight: 600, marginTop: 8 }}>{err}</div>
      <div className="foot">
        {src ? <button className="btn primary" disabled={!!saving} onClick={validate}><Icon name="check" size="sm" />{saving === 'save' ? 'Enregistrement…' : 'Valider'}</button> : null}
        {c.avatarUrl ? <button className="btn danger" disabled={!!saving} onClick={remove}><Icon name="trash" size="sm" />{saving === 'del' ? 'Suppression…' : 'Supprimer la photo'}</button> : null}
        <button className="btn" disabled={!!saving} onClick={() => close()}>Annuler</button>
      </div></>
  );
}

// ---------------------------------------------------------------- personnaliser la discussion
/**
 * THÈME PARTAGÉ de la conversation (fond + couleur de MES bulles), visible par tous ses membres,
 * modifiable par tout membre, JAMAIS sur le Chat Général (inviolable : ni bouton, ni menu ; le serveur
 * refuse aussi). `''` et non `null` pour un retrait (convention serveur « vide = retrait »).
 */
export function PaletteSheet({ convId, meId, sombre, close }: { convId: string; meId: string; sombre: boolean; close: Close }) {
  const convs = useChatConvs(), users = useWorkspace((s) => s.users);
  const c = convs.find((x) => x.id === convId);
  const [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const byId: Record<string, User> = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  if (!c || c.type === 'general') return null;
  const fond = c.background ?? null, bulle = bulleDe(c.bubble);
  const wall = styleFondChat(fond, sombre), aUnFond = Object.keys(wall).length > 0;

  const save = async (patch: { background?: string; bubble?: string }) => {
    setBusy(true); setErr('');
    try { chatStore.upsertConversation(await emitWithAck<ChatConversation>('chat:conversation:theme', { conversationId: c.id, ...patch })); return true; }
    catch (e) { setErr(errMsg(e, 'Enregistrement impossible.')); return false; }
    finally { setBusy(false); }
  };
  // Choisir un fond ferme le volet ; « Aucun fond » et les bulles le laissent ouvert (Chat.tsx).
  const pickFond = async (v: string | null) => { if (await save({ background: v ?? '' }) && v) close(); };
  const importer = async (f: File) => {
    // Types exacts (et non tout `image/*`, qui laissait passer un GIF refusé ensuite par le serveur).
    if (!FOND_TYPES.includes(f.type)) { setErr('Choisissez une image (JPEG, PNG ou WebP).'); return; }
    if (f.size > MAX_FOND_SIZE) { setErr('Image trop lourde : 8 Mo maximum.'); return; }
    setBusy(true); setErr('');
    try {
      const url = await db.uploadFile('chatbg', f);
      chatStore.upsertConversation(await emitWithAck<ChatConversation>('chat:conversation:theme', { conversationId: c.id, background: url }));
      close();
    } catch (e) { setErr(errMsg(e, 'Import du fond impossible.')); setBusy(false); }
  };
  const familles = [...new Set(FONDS_CHAT.map((f) => f.famille))];
  return (
    <><h3>Personnaliser la discussion</h3><div className="muted">« {convName(c, meId, byId)} » — visible par tous les membres de la discussion.</div>
      <div className="cht-prev-box">
        {aUnFond ? <div className="cht-wall" style={wall} /> : null}
        <div className="b o">On part sur 3 véhicules ?</div>
        <div className="b m" style={{ background: bulle.css, ...(bulle.texteSombre ? { color: '#0f172a' } : {}) }}>Oui, et l’A290 en vitrine 🚗</div>
      </div>
      {familles.map((fam) => (
        <React.Fragment key={fam}><div className="label" style={{ marginTop: 14 }}>{fam}</div>
          <div className="cht-bggrid">{FONDS_CHAT.filter((f) => f.famille === fam).map((f) => {
            const v = `${PREFIXE_PROC}${f.id}`;
            return <button key={f.id} className={`cht-bgt ${fond === v ? 'on' : ''}`} disabled={busy} onClick={() => pickFond(v)}><span style={sombre ? f.sombre : f.clair} />{f.nom}</button>;
          })}</div></React.Fragment>
      ))}
      <div className="label" style={{ marginTop: 16 }}>Couleur des bulles</div>
      <div className="cht-sw">{BULLES_CHAT.map((b) => (
        <button key={b.id} className={(c.bubble ?? 'bony') === b.id ? 'on' : ''} data-tip={b.nom} aria-label={b.nom} disabled={busy} style={{ background: b.css }} onClick={() => save({ bubble: b.id })} />
      ))}</div>
      <div className="faint" style={{ fontSize: 12 }}>Partagée : chaque membre voit ses propres messages dans cette couleur.</div>
      <div className="label" style={{ marginTop: 16 }}>Une image</div>
      <div className="row" style={{ marginTop: 6, gap: 10 }}>
        <button className="btn" disabled={busy} data-tip="Importer une image (JPEG, PNG ou WebP, 8 Mo max)" onClick={() => fileRef.current?.click()}><Icon name="upload" size="sm" />Importer</button>
        {estFondImporte(fond) ? <span data-tip="Image actuelle de la discussion" style={{ width: 64, height: 40, borderRadius: 9, background: `center/cover url("${fond}")`, boxShadow: '0 0 0 2px var(--accent)' }} /> : null}
        <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) importer(f); e.target.value = ''; }} />
      </div>
      <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>JPEG, PNG ou WebP — 8 Mo maximum.</div>
      <div style={{ color: 'var(--danger)', fontSize: 12.5, fontWeight: 600 }}>{err}</div>
      <div className="foot"><button className="btn" disabled={busy || !fond} onClick={() => pickFond(null)}>Aucun fond</button><span className="grow" /><button className="btn primary" onClick={() => close()}>Terminé</button></div></>
  );
}

// ---------------------------------------------------------------- citer un projet
/** Projets ACTIFS non échus (même définition que la To-do : le Brouillon est exclu), tri par échéance, 50 max. */
export function QuoteProjectSheet({ close, onPick }: { close: Close; onPick: (p: Project) => void }) {
  const projects = useWorkspace((s) => s.projects);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const today = new Date().toISOString().split('T')[0], s = q.trim().toLowerCase();
    return projects
      .filter((p) => p.status === 'Active' && p.endDate >= today)
      .filter((p) => !s || p.name.toLowerCase().includes(s) || (p.site ?? '').toLowerCase().includes(s))
      .sort((a, b) => a.endDate.localeCompare(b.endDate))
      .slice(0, 50);
  }, [projects, q]);
  return (
    <><h3>Citer un projet</h3><div className="muted">Projets actifs, par échéance la plus proche. Une carte cliquable apparaît dans la conversation.</div>
      <label className="search" style={{ marginTop: 12 }}><Icon name="search" size="sm" /><input autoFocus placeholder="Rechercher un projet…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <div className="cht-pick scroll">{list.length ? list.map((p) => (
        <div key={p.id} className="list-row" onClick={() => { close(); onPick(p); }}>
          <span className="cht-gav sm" style={{ background: 'var(--bony-grad)', borderRadius: 9 }}><Icon name="projects" /></span>
          <div className="grow" style={{ minWidth: 0 }}><b className="ellipsis" style={{ display: 'block' }}>{p.name}</b><span className="faint ellipsis" style={{ display: 'block', fontSize: 12.5 }}>{p.site || ''} · échéance {gx().fmt.date(p.endDate)}</span></div>
        </div>
      )) : <div className="empty">Aucun projet actif trouvé.</div>}</div>
      <div className="foot"><button className="btn" onClick={() => close()}>Annuler</button></div></>
  );
}
