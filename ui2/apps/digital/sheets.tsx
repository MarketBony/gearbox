import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SocialPost, SocialComment } from '../../../types';
import { db, ApiError } from '../../../services/dataService';
import { useSocialPosts, socialPosts, updateSocialPost, useSocialComments, addSocialComment, deleteSocialComment } from '../../store/collections';
import { gx, hud, Icon, Avatar } from '../ui/kit';
import { MEDIA_ACCEPTED, MEDIA_MAX, MEDIA_MAX_SIZE, estLienExterne, isVideoUrl, mediaFilename, normLink, provider, shortLink, pd } from './common';

// Volets de la rubrique Digital (maquette : newPost, openWording, openMedia, lightbox, openComments),
// branchés sur les vraies écritures. Messages d'erreur repris MOT POUR MOT de pages/Digital.tsx.

const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError && e.message && !/^Erreur \d+$/.test(e.message) ? e.message : fallback);

// ---------------------------------------------------------------- création
export function NewPostSheet({ date, close, onCreate }: { date?: string; close: (v?: unknown) => void; onCreate: (title: string) => void }) {
  const [t, setT] = useState('');
  const ok = () => { const v = t.trim(); if (!v) return; close('ok'); onCreate(v); };
  return (
    <><h3>Nouvelle Publication</h3><div className="muted" style={{ fontSize: 12 }}>Statut « À venir », date {date ? 'du ' + gx().fmt.date(pd(date)) : 'du jour'}, « Tous Services ». Le reste se règle dans la ligne.</div>
      <label className="field" style={{ marginTop: 14 }}><span className="label">Titre</span><input className="input" autoFocus placeholder="Titre de la publication..." maxLength={160} value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ok(); }} /></label>
      <div className="foot"><button className="btn" onClick={() => close()}>ANNULER</button><button className="btn primary" disabled={!t.trim()} onClick={ok}>CRÉER</button></div></>
  );
}

// ---------------------------------------------------------------- wording
/** Le texte n'est écrit qu'à la FERMETURE du volet (jamais à la frappe : correctif 49). */
export function WordingSheet({ p, ed, draft, close }: { p: SocialPost; ed: boolean; draft: { v: string }; close: (v?: unknown) => void }) {
  const [v, setV] = useState(draft.v);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const t = setTimeout(() => { const el = ta.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 60); return () => clearTimeout(t); }, []);
  return (
    <><h3>Wording</h3><div className="muted ellipsis" style={{ fontSize: 12 }}>{p.title || 'Sans titre'}</div>
      <textarea ref={ta} className="textarea" rows={10} style={{ marginTop: 12, minHeight: 220 }} placeholder="Écris le texte de la publication…" readOnly={!ed} value={v} onChange={(e) => { setV(e.target.value); draft.v = e.target.value; }} />
      <div className="foot" style={{ alignItems: 'center' }}><span className="faint num grow" style={{ fontSize: 12 }}>{v.length} caractère{v.length > 1 ? 's' : ''}</span><button className="btn primary" onClick={() => close('close')}>Fermer</button></div></>
  );
}

// ---------------------------------------------------------------- médias
interface Media { url: string; name: string; i: number }
const GRAD: [string, string] = ['#293f74', '#8f12ab'];

/**
 * Médias d'une publication : fichiers déposés (`POST /api/uploads/calendar`) et liens externes, dans
 * `mediaFiles` + `mediaNames` (tableaux PARALLÈLES, toujours écrits ensemble). Figé si la publication
 * est archivée (comme Digital.tsx). Un lien externe n'atteint JAMAIS un <img>/<video> : zéro requête
 * vers un tiers tant que l'utilisateur n'a pas cliqué.
 */
export function MediaSheet({ postId, canEdit, close, lbHost }: { postId: string; canEdit: boolean; close: (v?: unknown) => void; lbHost: HTMLElement | null }) {
  const posts = useSocialPosts();
  const p = posts?.find((x) => x.id === postId);
  const ed = canEdit && !!p && !p.archived;
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [over, setOver] = useState(false);
  const [lien, setLien] = useState('');
  const [order, setOrder] = useState<number[] | null>(null);           // ordre provisoire pendant un glisser
  const [lb, setLb] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null), galRef = useRef<HTMLDivElement>(null), lInRef = useRef<HTMLInputElement>(null);
  const dragI = useRef<number | null>(null), rects = useRef<Map<string, DOMRect> | null>(null);

  const files = p?.mediaFiles || [], names = p?.mediaNames || [];
  const all: Media[] = useMemo(() => files.map((url, i) => ({ url, i, name: ((names[i] || '').trim() || mediaFilename(url)) })), [files, names]);
  const shown = order ? order.map((i) => all[i]).filter(Boolean) : all;
  const nl = files.filter(estLienExterne).length, nf = files.length - nl;

  // FLIP des vignettes (réordonnancement, retrait)
  const snap = () => { rects.current = new Map([...(galRef.current?.querySelectorAll<HTMLElement>('.dig-tile') || [])].map((t) => [t.dataset.mid!, t.getBoundingClientRect()])); };
  useLayoutEffect(() => {
    const R = rects.current; if (!R || !galRef.current) return; rects.current = null;
    galRef.current.querySelectorAll<HTMLElement>('.dig-tile').forEach((t) => { const r = R.get(t.dataset.mid!); if (r) gx().flip(t, r, { spring: 'snappy' }); });
  });

  /** Écrit les deux tableaux ENSEMBLE depuis l'état COURANT du store (jamais la closure du rendu). */
  const save = async (change: (f: string[], n: string[]) => [string[], string[]]) => {
    const cur = socialPosts.get()?.find((x) => x.id === postId); if (!cur) return;
    const f0 = cur.mediaFiles || [], n0 = f0.map((_, i) => (cur.mediaNames || [])[i] ?? '');
    const [f1, n1] = change(f0, n0);
    await updateSocialPost({ ...cur, mediaFiles: f1, mediaNames: n1 });
  };
  const animIn = (from: number) => requestAnimationFrame(() => galRef.current?.querySelectorAll<HTMLElement>('.dig-tile').forEach((t, i) => { if (i >= from) gx().animate(t, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], { spring: 'bouncy', delay: (i - from) * 40, fill: 'backwards' }); }));

  const addFiles = async (list: File[]) => {
    if (!ed) return; setErr(null);
    for (const file of list) {
      const cur = socialPosts.get()?.find((x) => x.id === postId);
      if ((cur?.mediaFiles || []).length >= MEDIA_MAX) { hud(`Maximum ${MEDIA_MAX} médias atteint`); break; }
      if (!MEDIA_ACCEPTED.includes(file.type)) { setErr(`Format non supporté : "${file.name}". Accepté : JPG, PNG, WebP, MP4, MOV.`); continue; }
      if (file.size > MEDIA_MAX_SIZE) { setErr(`"${file.name}" dépasse la limite de 2 Go.`); continue; }
      try {
        setUploading(true);
        // BESOIN: dépôt de fichier dans ui2/store (voir BESOINS.md) — seul appel direct à dataService.
        const url = await db.uploadFile('calendar', file);
        // ⚠️ Le nom d'origine n'existe QU'ICI (le serveur le remplace par un uuid) : capturé tout de suite.
        const at = (cur?.mediaFiles || []).length;
        await save((f, n) => [[...f, url], [...n, file.name]]); animIn(at);
      } catch (e) { setErr(e instanceof ApiError ? errMsg(e, `Échec de l'upload de "${file.name}".`) : `Échec de l'upload de "${file.name}".`); }
      finally { setUploading(false); }
    }
  };
  const addLink = async () => {
    const brut = lien.trim(); if (!brut || !ed) return; setErr(null);
    const u = normLink(brut);
    const shake = () => lInRef.current && gx().animate(lInRef.current, [{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 260 });
    if (!estLienExterne(u)) { setErr('Colle un lien commençant par http:// ou https:// — WeTransfer, SharePoint, Drive…'); shake(); return; }
    try { new URL(u); } catch { setErr("Ce lien n'est pas une adresse valide."); shake(); return; }
    if (files.includes(u)) { setErr('Ce lien est déjà attaché à ce post.'); return; }
    if (files.length >= MEDIA_MAX) { hud(`Maximum ${MEDIA_MAX} médias atteint`); return; }
    try { const at = files.length; await save((f, n) => [[...f, u], [...n, shortLink(u)]]); setLien(''); animIn(at); }
    catch (e) { setErr(errMsg(e, "Échec de l'ajout du lien.")); }
  };
  /** Retrait PAR INDEX (deux fois le même lien est légitime). */
  const remove = (m: Media, tile: HTMLElement | null) => {
    const go = async () => { snap(); try { await save((f, n) => [f.filter((_, i) => i !== m.i), n.filter((_, i) => i !== m.i)]); } catch (e) { setErr(errMsg(e, 'Échec de la suppression.')); } };
    if (!tile) return void go();
    gx().animate(tile, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.6)' }], { duration: 180, fill: 'forwards' }).onfinish = go;
  };
  const openOrDownload = (m: Media) => {
    if (estLienExterne(m.url)) { window.open(m.url, '_blank', 'noopener,noreferrer'); return; }
    const a = document.createElement('a'); a.href = m.url; a.download = m.name; a.click();   // téléchargé sous son NOM D'ORIGINE
  };

  // Réordonner : glisser-déposer natif ; l'ordre du tableau EST l'ordre de diffusion.
  const onDragStart = (e: React.DragEvent, m: Media) => { if (!ed) return; dragI.current = m.i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(m.i)); setOrder(all.map((x) => x.i)); };
  const onDragOverTile = (e: React.DragEvent, m: Media) => {
    if (dragI.current === null || !order) return; e.preventDefault();
    const from = order.indexOf(dragI.current), to = order.indexOf(m.i); if (from < 0 || to < 0 || from === to) return;
    snap(); const o = [...order]; o.splice(from, 1); o.splice(to, 0, dragI.current); setOrder(o);
  };
  const onDragEnd = async () => {
    const o = order, moved = dragI.current !== null && o && o.some((x, k) => x !== k); dragI.current = null;
    if (!moved || !o) { setOrder(null); return; }
    try { await save((f, n) => [o.map((i) => f[i]), o.map((i) => n[i])]); } catch (e) { setErr(errMsg(e, 'Échec du réordonnancement.')); }
    setOrder(null);
  };

  if (!p) return <><h3>Médias</h3><div className="empty">Cette publication n’existe plus.</div><div className="foot"><button className="btn primary" onClick={() => close()}>Terminé</button></div></>;
  const viewable = all.filter((m) => !estLienExterne(m.url));
  return (
    <>
      <div className="row"><h3 className="grow">Médias</h3><span className="faint num" style={{ fontSize: 12 }}>{nf} fichier{nf > 1 ? 's' : ''} · {nl} lien{nl > 1 ? 's' : ''} · max {MEDIA_MAX}</span></div>
      <div className="muted ellipsis" style={{ fontSize: 12 }}>{p.title || 'Publication sans titre'}</div>
      {ed ? <>
        <div className={`dig-drop ${over ? 'over' : ''}`} style={{ marginTop: 14 }} onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { if (![...e.dataTransfer.types].includes('Files')) return; e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); addFiles([...(e.dataTransfer?.files || [])] as File[]); }}>
          <Icon name="upload" size="lg" /><b style={{ color: 'var(--text)' }}>{uploading ? 'Envoi en cours…' : 'Glisse des fichiers ici…'}</b><span style={{ fontSize: 11 }}>JPG · PNG · WebP · MP4 · MOV, 2 Go max · ou clique pour parcourir</span>
          <input ref={fileRef} type="file" multiple accept={MEDIA_ACCEPTED.join(',')} hidden onChange={(e) => { const l = [...(e.target.files || [])] as File[]; e.target.value = ''; addFiles(l); }} />
        </div>
        <form className="row" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); addLink(); }}><input ref={lInRef} className="input" type="url" placeholder="…ou colle un lien WeTransfer, SharePoint, Drive…" value={lien} onChange={(e) => setLien(e.target.value)} /><button className="btn" disabled={!lien.trim()}><Icon name="link" size="sm" />Ajouter</button></form>
      </> : null}
      {err ? <div style={{ color: 'var(--danger)', fontWeight: 700, fontSize: 12.5, marginTop: 10 }}>{err}</div> : null}
      <div className="dig-gal" ref={galRef}>
        {shown.length ? shown.map((m, k) => {
          const link = estLienExterne(m.url), mid = `${m.i}:${m.url}`;
          const tact = <div className="dig-tact"><button data-tip={link ? 'Ouvrir' : 'Télécharger'} onClick={(e) => { e.stopPropagation(); openOrDownload(m); }}><Icon name={link ? 'arrowr' : 'download'} size="sm" /></button>{ed ? <button data-tip="Retirer" onClick={(e) => { e.stopPropagation(); remove(m, (e.currentTarget as HTMLElement).closest('.dig-tile')); }}><Icon name="close" size="sm" /></button> : null}</div>;
          const dnd = { draggable: ed, 'data-mid': mid, onDragStart: (e: React.DragEvent) => onDragStart(e, m), onDragOver: (e: React.DragEvent) => onDragOverTile(e, m), onDragEnd } as any;
          return link
            ? <div key={mid} className={`dig-tile ${order && dragI.current === m.i ? 'dragging' : ''}`} {...dnd} title={m.url}><span className="dig-num">{k + 1}</span>{tact}<div className="dig-thumb link"><Icon name="link" size="lg" /><div><b>{provider(m.url)}</b><div className="faint ellipsis" style={{ fontSize: 10.5 }}>{shortLink(m.url)}</div></div></div><div className="dig-fname ellipsis">{provider(m.url)}</div></div>
            : <div key={mid} className={`dig-tile ${order && dragI.current === m.i ? 'dragging' : ''}`} {...dnd}><span className="dig-num">{k + 1}</span>{tact}
                <div className="dig-thumb" style={{ '--a': GRAD[0], '--b': GRAD[1] } as React.CSSProperties} onClick={() => setLb(viewable.indexOf(m))}>
                  {isVideoUrl(m.url)
                    ? <><video src={m.url} preload="metadata" muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /><span className="vid">{(m.url.split('.').pop() || 'MP4').toUpperCase()}</span></>
                    : <img src={m.url} alt={m.name} />}
                </div><div className="dig-fname ellipsis" title={m.name}>{m.name}</div></div>;
        }) : <div className="empty" style={{ gridColumn: '1/-1', padding: 20 }}><Icon name="image" />Aucun média pour cette publication</div>}
      </div>
      <div className="foot"><span className="faint grow" style={{ fontSize: 11, alignSelf: 'center' }}>{ed && files.length > 1 ? 'Glisse les vignettes pour changer l’ordre de publication.' : ''}</span><button className="btn primary" onClick={() => close()}>Terminé</button></div>
      {lb !== null && lb >= 0 && lbHost ? createPortal(<Lightbox items={viewable} start={lb} onClose={() => setLb(null)} onDownload={openOrDownload} />, lbHost) : null}
    </>
  );
}

function Lightbox({ items, start, onClose, onDownload }: { items: Media[]; start: number; onClose: () => void; onDownload: (m: Media) => void }) {
  const [k, setK] = useState(start);
  const ref = useRef<HTMLDivElement>(null), imgRef = useRef<HTMLDivElement>(null), dir = useRef(0);
  useEffect(() => { ref.current?.focus(); }, []);
  useLayoutEffect(() => { if (dir.current && imgRef.current) gx().animate(imgRef.current, [{ opacity: 0, transform: `translateX(${dir.current * 30}px) scale(.96)` }, { opacity: 1, transform: 'none' }], { spring: 'snappy' }); dir.current = 0; }, [k]);
  const m = items[k]; if (!m) return null;
  const go = (d: number) => { dir.current = d; setK((x) => (x + d + items.length) % items.length); };
  const close = () => { const el = ref.current; if (!el) return onClose(); gx().animate(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }).onfinish = onClose; };
  const hide = items.length < 2 ? { visibility: 'hidden' as const } : undefined;
  return (
    <div ref={ref} className="dig-lb" tabIndex={-1} onClick={(e) => { const t = e.target as HTMLElement; if (t === ref.current || t.classList.contains('dig-lb-stage')) close(); }}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); }}>
      <div className="dig-lb-bar"><span className="ellipsis grow">{m.name}</span><span style={{ opacity: 0.6, fontWeight: 600 }} className="num">{k + 1} / {items.length}</span><button data-tip="Télécharger" onClick={() => onDownload(m)}><Icon name="download" /></button><button data-tip="Fermer (Échap)" onClick={close}><Icon name="close" /></button></div>
      <div className="dig-lb-stage"><button className="dig-lb-nav" style={hide} onClick={() => go(-1)}><Icon name="back" size="lg" /></button>
        <div ref={imgRef} className="dig-lb-img" style={{ '--a': GRAD[0], '--b': GRAD[1] } as React.CSSProperties}>{isVideoUrl(m.url) ? <video src={m.url} controls preload="metadata" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} /> : <img src={m.url} alt="" />}</div>
        <button className="dig-lb-nav" style={hide} onClick={() => go(1)}><Icon name="chevron" size="lg" /></button></div>
      <div className="dig-lb-foot">← → pour naviguer · Échap pour fermer</div>
    </div>
  );
}

// ---------------------------------------------------------------- commentaires
const quand = (s: string) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? '' : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} à ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/**
 * Fil d'UNE publication (lu à l'ouverture seulement, comme Digital.tsx). L'auteur est résolu par le
 * SERVEUR (`author`) : un rôle cloisonné ne reçoit pas la liste des utilisateurs.
 * Suppression : son auteur, ou Master / Administrator (le serveur refuse sinon).
 */
export function CommentsSheet({ p, ed, uid, isAdmin, close }: { p: SocialPost; ed: boolean; uid: string; isAdmin: boolean; close: (v?: unknown) => void }) {
  const list: SocialComment[] | undefined = useSocialComments(p.id);
  const [t, setT] = useState(''), [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null), ta = useRef<HTMLTextAreaElement>(null), n0 = useRef<number | null>(null);
  useEffect(() => { const x = setTimeout(() => ta.current?.focus(), 60); return () => clearTimeout(x); }, []);
  useLayoutEffect(() => {
    const el = listRef.current; if (!el || !list) return;
    if (n0.current === null) el.scrollTop = el.scrollHeight;
    else if (list.length > n0.current) { el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); const last = el.lastElementChild; if (last) gx().animate(last, [{ opacity: 0, transform: 'translateY(10px) scale(.97)' }, { opacity: 1, transform: 'none' }], { spring: 'bouncy' }); }
    n0.current = list.length;
  }, [list]);
  const grow = () => { const el = ta.current; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(140, el.scrollHeight) + 'px'; };
  const send = async () => {
    const v = t.trim().slice(0, 2000); if (!v || busy) return;
    setBusy(true);
    try { await addSocialComment(p.id, v); setT(''); requestAnimationFrame(grow); socialPosts.reloadAll(); }   // BESOIN: socialPosts sur RT_EVENTS.socialComments (pastille commentCount)
    catch { /* message déjà affiché par la source */ }
    finally { setBusy(false); }
  };
  const del = (c: SocialComment, el: HTMLElement | null) => {
    const go = () => deleteSocialComment(p.id, c.id).then(() => socialPosts.reloadAll()).catch(() => { /* message déjà affiché */ });
    if (!el) return void go();
    const h = el.offsetHeight; el.style.overflow = 'hidden';
    gx().animate(el, [{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0, marginBottom: '-12px', transform: 'scale(.98)' }], { spring: 'snappy', fill: 'forwards' }).onfinish = go;
  };
  return (
    <>
      <div className="row"><h3 className="grow">Commentaires</h3><span className="badge" style={{ '--c': 'var(--bony-violet)' } as React.CSSProperties}>{list ? list.length : p.commentCount || 0}</span></div>
      <div className="muted ellipsis" style={{ fontSize: 12 }}>{p.title || 'Sans titre'}</div>
      <div className="dig-cmts" ref={listRef}>
        {list === undefined ? <div className="empty" style={{ padding: 24 }}>Chargement…</div>
          : list.length ? list.map((c) => {
            const mine = c.authorId === uid, name = c.author?.name ?? 'Compte supprimé';
            return (
              <div key={c.id} className={`dig-cmt ${mine ? 'mine' : ''}`}>
                <Avatar user={c.author} name={name} />
                <div className="bub"><div className="who"><b>{name}</b><span className="faint num">{quand(c.createdAt)}</span><span className="grow" />
                  {ed && (mine || isAdmin) ? <button className="icon-btn sm x" data-tip="Supprimer" onClick={(e) => del(c, (e.currentTarget as HTMLElement).closest('.dig-cmt'))}><Icon name="trash" size="sm" /></button> : null}</div>
                  <div className="txt">{c.content}</div></div>
              </div>
            );
          }) : <div className="empty" style={{ padding: 24 }}><Icon name="message" />Aucun commentaire.{ed ? ' Laissez une consigne à l’équipe.' : ''}</div>}
      </div>
      {!ed ? <div className="faint" style={{ marginTop: 12, fontSize: 12 }}>Lecture seule : vous ne pouvez pas commenter.</div> : <>
        <div className="dig-compose"><textarea ref={ta} className="textarea" rows={1} maxLength={2000} placeholder="Écrire un commentaire…" value={t}
          onChange={(e) => { setT(e.target.value); grow(); }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button className="btn primary" data-tip="Envoyer (Entrée)" disabled={!t.trim() || busy} onClick={send}><Icon name="send" size="sm" /></button></div>
        <div className="row faint" style={{ fontSize: 11, marginTop: 6 }}><span className="grow">Entrée pour envoyer · Maj+Entrée pour un retour à la ligne</span><span className="num">{t.length} / 2000</span></div></>}
      <div className="foot"><button className="btn" onClick={() => close()}>Fermer</button></div>
    </>
  );
}
