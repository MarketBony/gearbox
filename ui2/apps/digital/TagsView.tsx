import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SocialPost, DigitalTags } from '../../../types';
import { gx, hud, Icon } from '../ui/kit';
import { LOCKED_NETWORKS, NetIc } from './common';

// « Gestion des TAGS » — `renderTags` de la maquette, sur le catalogue réel (`/api/tags`).
// ⚠️ Écriture = PATCH d'UNE seule catégorie (perte du 10/09/2026), et rien tant que les tags n'ont pas
// été LUS avec succès (`loaded`). Renommer un tag ne répercute PAS le nom sur les publications
// (comme pages/Digital.tsx).

type Cat = 'networks' | 'co2' | 'lom';
const COLS: { k: Cat; title: string; icon: string; ph: string; used: (p: SocialPost, n: string) => boolean }[] = [
  { k: 'networks', title: 'Réseaux Sociaux', icon: 'globe', ph: 'Nouveau réseau…', used: (p, n) => (p.networks || []).includes(n) },
  { k: 'co2', title: 'Classes CO² & Mentions', icon: 'leaf', ph: 'Ex. CLIO - B120', used: (p, n) => (p.co2s || []).includes(n) },
  { k: 'lom', title: 'Mentions Loi LOM', icon: 'info', ph: 'Nouvelle mention…', used: (p, n) => p.lom === n },
];

export function TagsView({ tags, posts, ed, save }: { tags: DigitalTags | null | undefined; posts: SocialPost[]; ed: boolean; save: (patch: Partial<DigitalTags>) => void }) {
  const [add, setAdd] = useState<Record<Cat, string>>({ networks: '', co2: '', lom: '' });
  const [edit, setEdit] = useState<{ k: Cat; n: string; v: string } | null>(null);
  const [del, setDel] = useState<{ k: Cat; n: string } | null>(null);
  const added = useRef<{ k: Cat; n: string } | null>(null), hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!del) return; const t = setTimeout(() => setDel(null), 3000); return () => clearTimeout(t); }, [del]);
  useLayoutEffect(() => {
    const a = added.current; if (!a) return; added.current = null;
    const it = [...(hostRef.current?.querySelectorAll<HTMLElement>(`[data-tags="${a.k}"] .dig-tag`) || [])].find((x) => x.dataset.tag === a.n);
    if (it) { it.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); gx().animate(it, [{ opacity: 0, transform: 'translateY(8px) scale(.96)' }, { opacity: 1, transform: 'none' }], { spring: 'bouncy' }); }
  });

  if (tags === undefined) return <div className="empty" style={{ height: '100%' }}>Chargement…</div>;
  const list = (k: Cat) => (tags ? tags[k] || [] : []);
  const guard = () => { if (!tags) { hud('Les tags n\'ont pas pu être chargés : rien n\'a été enregistré. Rechargez la page.'); return false; } return true; };
  const doAdd = (k: Cat) => {
    const n = add[k].trim(); if (!n || !guard()) return;
    if (list(k).includes(n)) { hud('Ce tag existe déjà'); return; }
    added.current = { k, n }; save({ [k]: [...list(k), n] }); setAdd({ ...add, [k]: '' });
  };
  const finishEdit = (ok: boolean) => {
    const e = edit; setEdit(null); if (!e || !ok) return;
    const v = e.v.trim(); if (!v || v === e.n || !guard()) return;
    if (list(e.k).includes(v)) { hud('Ce tag existe déjà'); return; }
    save({ [e.k]: list(e.k).map((x) => (x === e.n ? v : x)) });
  };
  const remove = (k: Cat, n: string, el: HTMLElement | null) => {
    setDel(null); if (!guard()) return;
    const go = () => save({ [k]: list(k).filter((x) => x !== n) });
    if (!el) return go();
    const h = el.offsetHeight; el.style.overflow = 'hidden';
    gx().animate(el, [{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px', transform: 'scale(.98)' }], { spring: 'snappy', fill: 'forwards' }).onfinish = go;
  };

  return (
    <div className="dig-tags" ref={hostRef}>
      {!tags ? <div className="dig-note" style={{ gridColumn: '1/-1' }}><Icon name="info" size="sm" /><span>Les tags n'ont pas pu être chargés : rien n'a été enregistré. Rechargez la page.</span></div> : null}
      {COLS.map((c, i) => (
        <section key={c.k} className="card dig-tagcol enter" style={{ '--i': i * 2 } as React.CSSProperties} data-tags={c.k}>
          <div className="dig-tagh"><Icon name={c.icon} size="sm" /><b>{c.title}</b><span className="count">{list(c.k).length}</span></div>
          {ed ? <form className="dig-tagadd" onSubmit={(e) => { e.preventDefault(); doAdd(c.k); }}><input className="input" placeholder={c.ph} maxLength={80} value={add[c.k]} onChange={(e) => setAdd({ ...add, [c.k]: e.target.value })} /><button className="btn sm primary"><Icon name="plus" size="sm" />Ajouter</button></form> : null}
          <div className="dig-taglist scroll">
            {list(c.k).map((n) => {
              const locked = c.k === 'networks' && LOCKED_NETWORKS.includes(n), used = posts.filter((p) => c.used(p, n)).length;
              const editing = edit && edit.k === c.k && edit.n === n, confirming = del && del.k === c.k && del.n === n;
              return (
                <div key={n} className="dig-tag" data-tag={n}>
                  {c.k === 'networks' ? <NetIc id={n} /> : null}
                  {editing
                    ? <input className="input" autoFocus maxLength={80} value={edit!.v} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setEdit({ ...edit!, v: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') finishEdit(true); if (e.key === 'Escape') { e.stopPropagation(); finishEdit(false); } }} onBlur={() => finishEdit(true)} />
                    : <span className={`nm ${c.k === 'lom' ? 'long' : ''}`}>{n}</span>}
                  <span className="faint num" style={{ fontSize: 11 }} data-tip={`${used} publication(s)`}>{used}</span>
                  {locked ? <span className="dig-lock" data-tip="Réseau de base : verrouillé"><Icon name="lock" size="sm" /></span>
                    : ed && !editing ? <span className="ctrl"><button className="icon-btn sm" data-tip="Modifier" onClick={() => { setDel(null); setEdit({ k: c.k, n, v: n }); }}><Icon name="edit" size="sm" /></button>
                      <button className={`icon-btn sm dig-tdel ${confirming ? 'confirm' : ''}`} data-tip={confirming ? '' : 'Supprimer'} onClick={(e) => (confirming ? remove(c.k, n, (e.currentTarget as HTMLElement).closest('.dig-tag')) : setDel({ k: c.k, n }))}>{confirming ? 'Confirmer ?' : <Icon name="trash" size="sm" />}</button></span> : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
