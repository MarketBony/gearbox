import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, User } from '../../../types';
import { db } from '../../../services/dataService';
import { renduTexteRiche, premierLien } from '../../../lib/richText';
import { fournisseurDe, aUnApercuRiche, libelleCourt } from '../../../lib/linkProviders';
import { formatPoids } from '../../../utils/fichiers';
import { useWorkspace, workspace } from '../../store/workspace';
import { gx, hud, Icon } from '../ui/kit';
import { REACTIONS, hhmm, imageDistante, resumeMessage, estModifiable, UserAv } from './common';

// =====================================================================
// Un message du fil — `msgHTML` / `bodyHTML` de la maquette, types et règles de Chat.tsx :
// pièce jointe expirée, image, fichier, vocal, projet cité (neutralisé pour l'External), GIF
// (URL d'image distante envoyée en texte), texte riche (liens sûrs : lib/richText, JAMAIS de HTML
// injecté) + « (modifié) » + aperçu du PREMIER lien.
// =====================================================================

export interface MsgApi {
  react: (m: ChatMessage, emoji: string) => void;
  reply: (m: ChatMessage) => void;
  menu: (m: ChatMessage, at: Element | { x: number; y: number }) => void;
  edit: (m: ChatMessage) => void;
  goto: (id: string) => void;
  image: (src: string, m: ChatMessage, el: Element) => void;
}
export interface MsgCtx { meId: string; ext: boolean; byId: Record<string, User> }

// ---------------------------------------------------------------- vocal
const hash = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
const barsOf = (id: string, n = 30) => { const h = hash(id); return Array.from({ length: n }, (_, i) => 18 + ((h >> (i % 24)) % 7) * 12 + (i % 5 === 0 ? 10 : 0)); };
const secsOf = (d?: string) => { const m = /^(\d+):(\d{2})$/.exec(d || ''); return m ? +m[1] * 60 + +m[2] : 0; };
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/** Un seul vocal joué à la fois (comme la maquette). */
let playingAudio: HTMLAudioElement | null = null;

function Voice({ m }: { m: ChatMessage }) {
  const a = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(false), [p, setP] = useState(0), [left, setLeft] = useState<string | null>(null);
  const bars = useMemo(() => barsOf(m.id), [m.id]);
  // La durée est portée par `fileName` (« 0:12 ») : un webm de MediaRecorder n'a souvent pas de durée lisible.
  const total = () => { const d = a.current?.duration; return d && isFinite(d) ? d : secsOf(m.fileName); };
  const toggle = () => {
    const el = a.current; if (!el) return;
    if (!el.paused) { el.pause(); return; }
    if (playingAudio && playingAudio !== el) playingAudio.pause();
    playingAudio = el; el.play().catch(() => hud('Lecture impossible.'));
  };
  const onTime = () => { const el = a.current, t = total(); if (!el || !t) return; setP(Math.min(1, el.currentTime / t)); setLeft(fmt(Math.max(0, t - el.currentTime))); };
  const reset = () => { setOn(false); setP(0); setLeft(null); };
  return (
    <div className="cht-b cht-voice">
      <button className="pl" data-tip={on ? 'Pause' : 'Écouter'} aria-label={on ? 'Pause' : 'Écouter'} onClick={toggle}><Icon name={on ? 'pause' : 'play'} /></button>
      <div className="cht-wave">{bars.map((h, i) => <i key={i} className={i / bars.length < p ? 'on' : ''} style={{ height: `${h}%` }} />)}</div>
      <span className="num">{left ?? m.fileName ?? '0:00'}</span>
      <audio ref={a} src={m.content} preload="none" hidden onPlay={() => setOn(true)} onPause={() => setOn(false)} onEnded={reset} onTimeUpdate={onTime} />
    </div>
  );
}

// ---------------------------------------------------------------- aperçu de lien (components/LinkPreview.tsx)
// Deux niveaux, mêmes règles : fournisseur oEmbed de la liste blanche serveur → titre / vignette réels ;
// domaine seulement reconnu → pastille, SANS requête ; sinon rien. Échec silencieux (un aperçu est un confort).
function LinkPrev({ href }: { href: string }) {
  const f = fournisseurDe(href), riche = aUnApercuRiche(href);
  const [ap, setAp] = useState<{ provider: string; title: string | null; author: string | null; thumbnail: string | null; url: string } | null>(null);
  useEffect(() => {
    if (!riche) return; let vivant = true;
    // BESOIN: lecture de l'aperçu hors ui2/store (BESOINS.md § 4).
    db.getLinkPreview(href).then((d) => { if (vivant && d) setAp(d); }).catch(() => {});
    return () => { vivant = false; };
  }, [href, riche]);
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  if (ap) return (
    <a className="cht-lp" href={ap.url} target="_blank" rel="noopener noreferrer" onClick={stop} style={{ textDecoration: 'none' }}>
      {ap.thumbnail ? <img src={ap.thumbnail} alt="" loading="lazy" style={{ display: 'block', width: '100%', maxWidth: 240, height: 124, objectFit: 'cover', borderRadius: 8 }} /> : null}
      <span className="d">{ap.provider}</span>
      {ap.title ? <b>{ap.title}</b> : null}
      {ap.author ? <span style={{ opacity: .75 }}>{ap.author}</span> : null}
    </a>
  );
  if (f) return (
    <a className="cht-lp" href={href} target="_blank" rel="noopener noreferrer" onClick={stop} style={{ textDecoration: 'none' }}>
      <span className="d">{f.nom}</span><span style={{ opacity: .75 }}>{libelleCourt(href)}</span>
    </a>
  );
  return null;
}

// ---------------------------------------------------------------- projet cité
// ⚠️⚠️ CLOISONNEMENT (ProjectChatCard de Chat.tsx) : l'External a le Chat mais PAS les Projets. La carte
// montrerait site, dates, avancement : il ne reçoit qu'un libellé neutre, non cliquable.
function ProjectCard({ id, ext }: { id: string; ext: boolean }) {
  const p = useWorkspace((s) => s.byId[id]);
  if (ext) return <div className="cht-proj" style={{ cursor: 'default' }}><span className="ic"><Icon name="projects" /></span><b>Projet cité</b></div>;
  // Supprimé depuis, ou hors du périmètre renvoyé par l'API : on l'annonce au lieu d'une carte vide.
  if (!p) return <div className="cht-b del"><Icon name="projects" size="sm" />Projet introuvable</div>;
  const st = gx().data.PROJECT_STATUS[p.status] || { l: p.status, c: 'var(--text-3)' };
  const sites = p.sites && p.sites.length ? p.sites : [p.site];
  const pr = p.progress || 0;
  return (
    <button className="cht-proj" data-tip="Ouvrir le projet" onClick={() => gx().openProject(p.id)}>
      <span className="ic"><Icon name="projects" /></span>
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="label">Projet cité</span>
        <b className="ellipsis">{p.name}</b>
        <span className="row" style={{ gap: 6, fontSize: 12, color: 'var(--text-2)' }}><span className="badge" style={{ '--c': st.c } as React.CSSProperties}><i className="dot" />{st.l}</span><span className="ellipsis">{sites.join(', ')}</span></span>
        <span className="row" style={{ gap: 6 }}><span className="bar grow" style={{ height: 4 }}><i style={{ width: `${pr}%` }} /></span><span className="num faint" style={{ fontSize: 11.5 }}>{pr} %</span></span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------- corps
function Body({ m, ctx, api }: { m: ChatMessage; ctx: MsgCtx; api: MsgApi }) {
  if (m.deleted) return <div className="cht-b del"><Icon name="trash" size="sm" />Message supprimé</div>;
  // Pièce jointe purgée (180 j) : le message reste, le fichier a disparu du disque.
  if (m.fileExpiredAt) return (
    <div className="cht-b del cht-exp"><Icon name="file" size="sm" /><div style={{ minWidth: 0 }}><b className="ellipsis" style={{ display: 'block' }}>{m.fileName ?? 'Pièce jointe'}</b><span>Pièce jointe expirée</span></div></div>
  );
  if (m.type === 'image') return <button className="cht-media" onClick={(e) => api.image(m.content, m, e.currentTarget)}><img src={m.content} alt="" /></button>;
  if (m.type === 'file') {
    const ext = (m.fileName || '').includes('.') ? (m.fileName || '').split('.').pop()!.toUpperCase() : '';
    // `download` porte le nom d'origine : sur le serveur, le fichier s'appelle <uuid>.<ext>.
    return (
      <a className="cht-b cht-file" href={m.content} download={m.fileName ?? undefined} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
        <span className="fi"><Icon name="file" /></span>
        <div className="grow" style={{ minWidth: 0 }}><b className="ellipsis" style={{ display: 'block' }} title={m.fileName ?? ''}>{m.fileName ?? 'Pièce jointe'}</b><span>{formatPoids(m.fileSize) || 'Fichier'}{ext ? ` · ${ext}` : ''}</span></div>
        <Icon name="download" size="sm" />
      </a>
    );
  }
  if (m.type === 'audio') return <Voice m={m} />;
  if (m.type === 'project') return <ProjectCard id={m.content} ext={ctx.ext} />;
  const img = imageDistante(m);
  // GIF ou image collée sous forme d'URL : rendue comme image (détection sur l'URL, côté client, sans requête).
  if (img) return <button className="cht-media" onClick={(e) => api.image(img, m, e.currentTarget)}><img src={img} alt="GIF" /></button>;
  const lien = premierLien(m.content);
  return (
    <div className="cht-b">{renduTexteRiche(m.content)}{m.edited ? <span className="cht-ed">(modifié)</span> : null}{lien ? <LinkPrev href={lien} /> : null}</div>
  );
}

// ---------------------------------------------------------------- message
export const Msg: React.FC<{ m: ChatMessage; parent: ChatMessage | null; first: boolean; last: boolean; ctx: MsgCtx; api: MsgApi }> =
  React.memo(function Msg({ m, parent, first, last, ctx, api }) {
    const mine = m.senderId === ctx.meId, u = ctx.byId[m.senderId];
    const name = u?.name || m.senderName, color = u?.avatarColor || m.senderColor;
    const reacts = (Object.entries(m.reactions || {}) as [string, string[]][]).filter(([, ids]) => ids.length);
    const noms = (ids: string[]) => [...(ids.includes(ctx.meId) ? ['Vous'] : []), ...ids.filter((x) => x !== ctx.meId).map((x) => ctx.byId[x]?.name || 'Ancien membre')];
    return (
      <div className={`cht-msg ${mine ? 'me' : ''} ${first ? 'first' : ''} ${last ? 'last' : ''}`} data-id={m.id}
        onDoubleClick={(e) => { if (mine && (e.target as HTMLElement).closest('.cht-b') && estModifiable(m, ctx.meId)) api.edit(m); }}
        onContextMenu={(e) => { if (!(e.target as HTMLElement).closest('.cht-bwrap') || m.deleted) return; e.preventDefault(); api.menu(m, { x: e.clientX, y: e.clientY }); }}>
        {!mine ? (last ? <UserAv u={u || ({ name: m.senderName, avatarColor: m.senderColor } as User)} /> : <span className="cht-avsp" />) : null}
        <div className="cht-col">
          {!mine && first && !m.deleted ? <div className="cht-author"><span style={{ color }}>{name}</span> · {hhmm(m.timestamp)}</div> : null}
          {parent && !m.deleted ? (
            <button className="cht-quote" onClick={() => api.goto(parent.id)}><b>{parent.senderId === ctx.meId ? 'Vous' : (ctx.byId[parent.senderId]?.name || parent.senderName)}</b><span className="ellipsis">{resumeMessage(parent, workspace.getState().byId)}</span></button>
          ) : null}
          <div className="cht-bwrap">
            <Body m={m} ctx={ctx} api={api} />
            {m.deleted ? null : (
              <div className="cht-tools">
                {REACTIONS.map((e) => <button key={e} aria-label={`Réagir ${e}`} onClick={(ev) => { ev.stopPropagation(); api.react(m, e); }}>{e}</button>)}
                <button data-tip="Répondre" aria-label="Répondre" onClick={(ev) => { ev.stopPropagation(); api.reply(m); }}><Icon name="back" size="sm" /></button>
                {mine ? <button data-tip="Plus" aria-label="Plus" onClick={(ev) => { ev.stopPropagation(); api.menu(m, ev.currentTarget); }}><Icon name="more" size="sm" /></button> : null}
              </div>
            )}
          </div>
          {reacts.length && !m.deleted ? (
            <div className="cht-reacts">{reacts.map(([e, ids]) => {
              const n = noms(ids).join(', ');
              return <button key={e} className={`cht-react ${ids.includes(ctx.meId) ? 'mine' : ''}`} data-e={e} data-tip={n} aria-label={`${e} : ${n}`} onClick={() => api.react(m, e)}>{e}<span>{ids.length}</span></button>;
            })}</div>
          ) : null}
          {mine && !m.deleted && last ? <div className="cht-time">{hhmm(m.timestamp)}</div> : null}
        </div>
      </div>
    );
  });
