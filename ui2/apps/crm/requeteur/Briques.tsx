import React from 'react';
import { Chips, Icon, PickerBtn, Seg, gx, hud } from '../../ui/kit';
import { nf } from '../common';
import { FAMS, TY, famOf, has, sayOf, siteGroups, type Field, type Q, type Referentiels, type UB } from './modele';

/**
 * Briques du Requêteur : l'éditeur des paramètres d'une brique (`Editor`) et la ligne « phrase » d'une brique (`Brick`),
 * utilisés par les réglages « préciser » des cartes et par la section « Sauf… ». Maquette : `brickHTML` / `editorHTML`.
 */

const cv = (c: string) => ({ '--c': c } as React.CSSProperties);
export type SetQ = (f: (q: Q) => Q) => void;

// ---------------------------------------------------------------- édition d'une brique
/** `only` : clés des champs à montrer (réglage réduit d'une tuile). */
export const Editor: React.FC<{ b: UB; R: Referentiels | null; set: (p: Record<string, any>) => void; only?: string[] }> = ({ b, R, set, only }) => {
  const p = b.p;
  const field = (f: Field) => {
    switch (f.t) {
      case 'chips': return <Chips values={f.opts(R)} selected={p[f.k] || []} onChange={(v) => set({ [f.k]: v })} all={f.all || 'Peu importe'} colors={f.colors ? f.colors(R) : {}} label={f.label} />;
      case 'seg': return <Seg value={p[f.k]} options={f.opts.map(([v, l]) => [v, l] as [string, React.ReactNode])} onChange={(v) => set({ [f.k]: v })} />;
      case 'pick1': return <PickerBtn icon={f.i} label={p[f.k] || 'Choisir…'} active={!!p[f.k]} onClick={(el) => gx().ui.pick(el, [{ items: f.opts(R) }], { multi: false, title: f.l, selected: [p[f.k]], width: 300, onChange: ([v]: string[]) => set({ [f.k]: v }) })} />;
      case 'pick': return <PickerBtn icon={f.i} label={gx().ui.summary(p[f.k], { all: f.all || 'Tous', max: 3 })} active={!!p[f.k]?.length}
        onClick={(el) => gx().ui.pick(el, f.groups(R), { title: f.l, selected: p[f.k], allLabel: f.all || 'Tous', width: 300, onChange: (v: string[]) => set({ [f.k]: v }) })} />;
      case 'sites': return <PickerBtn icon="pin" label={gx().ui.summary(p[f.k], { all: 'Tout le réseau', max: 3 })} active={!!p[f.k]?.length}
        onClick={(el) => gx().ui.pick(el, siteGroups(R), { title: f.l, selected: p[f.k], allLabel: 'Tout le réseau', width: 310, onChange: (v: string[]) => set({ [f.k]: v }) })} />;
      case 'range': return (
        <div className="rq-range"><span className="faint">de</span>
          <input className="input" type="number" inputMode="numeric" min={0} value={has(p[f.a]) ? p[f.a] : ''} placeholder="—" aria-label="Minimum" onChange={(e) => set({ [f.a]: e.target.value === '' ? '' : Math.max(0, +e.target.value) })} />
          <span className="faint">à</span>
          <input className="input" type="number" inputMode="numeric" min={0} value={has(p[f.b]) ? p[f.b] : ''} placeholder="—" aria-label="Maximum" onChange={(e) => set({ [f.b]: e.target.value === '' ? '' : Math.max(0, +e.target.value) })} />
          <span>{f.u}</span><span className="crm-note">Laisser vide = sans limite</span></div>);
      case 'num': return <div className="rq-range"><input className="input" type="number" inputMode="numeric" min={0} value={has(p[f.k]) ? p[f.k] : ''} onChange={(e) => set({ [f.k]: e.target.value === '' ? '' : Math.max(0, +e.target.value) })} /><span>{f.u}</span></div>;
      case 'dates': return (
        <div className="rq-range"><input className="input" type="date" value={p[f.a] || ''} aria-label="Du" onChange={(e) => set({ [f.a]: e.target.value })} />
          <span className="faint">au</span><input className="input" type="date" value={p[f.b] || ''} aria-label="Au" onChange={(e) => set({ [f.b]: e.target.value })} /></div>);
      case 'text': return <input className="input" value={p[f.k] || ''} placeholder={f.ph(p)} onChange={(e) => set({ [f.k]: e.target.value })} />;
    }
    return null;
  };
  return <>{TY[b.t].fields.filter((f) => (!f.show || f.show(p)) && (!only || only.includes('k' in f ? f.k : f.a))).map((f, i) => <div key={`${b.t}${i}${'k' in f ? f.k : ''}`} className="rq-fld"><span className="crm-lbl">{f.l}</span>{field(f)}</div>)}</>;
};

// ---------------------------------------------------------------- une brique
export const Brick: React.FC<{ b: UB; R: Referentiels | null; open: boolean; impact: number | undefined; setQ: SetQ; setOpen: (id: string | null) => void }> = React.memo(({ b, R, open, impact, setQ, setOpen }) => {
  const T = TY[b.t], fam = famOf(b), f = FAMS[fam], soon = T.ui === 'soon', locked = T.ui === 'locked', isOpen = open && !T.ui;
  const upd = (patch: Partial<UB>) => setQ((q) => ({ ...q, from: null, bricks: q.bricks.map((x) => (x.id === b.id ? { ...x, ...patch } : x)) }));
  const setP = (p: Record<string, any>) => setQ((q) => ({ ...q, from: null, bricks: q.bricks.map((x) => (x.id === b.id ? { ...x, p: { ...x.p, ...p } } : x)) }));
  const del = () => { setQ((q) => ({ ...q, from: null, bricks: q.bricks.filter((x) => x.id !== b.id) })); if (open) setOpen(null); hud('Condition supprimée'); };
  const cls = locked ? 'rq-lock' : soon ? 'soon' : '';
  return (
    <div className={`rq-b ${b.on || T.ui ? '' : 'off'} ${isOpen ? 'open' : ''} ${cls}`} data-b={b.id} style={cv(f.c)}>
      <div className="rq-bh"><span className="rq-bi"><Icon name={f.i} size="sm" /></span>
        <button className="rq-bs" disabled={!!T.ui} data-tip={soon ? 'Arrive au lot 4' : locked ? 'Retirées d’office par le serveur, quelle que soit la requête' : 'Cliquer pour modifier'} onClick={() => !T.ui && setOpen(open ? null : b.id)}>{sayOf(b)}</button>
        {b.per ? <span className="crm-tag" data-tip="Prérempli par le périmètre choisi dans la barre de menus">Périmètre</span> : null}
        {T.lot ? <span className="crm-tag">{T.lot}</span> : null}
        {locked ? <span className="crm-tag" data-tip="Appliqué par le serveur à toutes les requêtes"><Icon name="lock" size="sm" /> Toujours</span> : null}
        {fam === 'sauf' && !T.ui ? <span className={`rq-bn ${impact ? '' : 'z'}`} data-tip="Clients retirés par cette exclusion">{typeof impact === 'number' ? (impact ? `− ${nf(impact)}` : '0') : '…'}</span> : null}
        {T.ui ? null : <>
          <input type="checkbox" className="switch" checked={b.on} aria-label="Activer la condition" data-tip={b.on ? 'Désactiver temporairement' : 'Réactiver'} onChange={(e) => upd({ on: e.target.checked })} />
          <button className="icon-btn sm" aria-label="Supprimer la condition" data-tip="Supprimer" onClick={del}><Icon name="trash" size="sm" /></button></>}
      </div>
      {isOpen ? <div className="rq-be"><Editor b={b} R={R} set={setP} />
        {T.note ? <div className="rq-hint" style={{ padding: '10px 12px', fontSize: 13 }}><Icon name="info" size="sm" /><div>{T.note}</div></div> : null}
        <div className="foot"><span className="crm-note">{T.scope === 'line' ? (b.sauf ? 'Retire le client s’il a acheté au moins un véhicule qui remplit cette condition.' : 'Porte sur le même véhicule que les autres conditions Véhicule, Achat et Financement.') : 'Porte sur la fiche client.'}</span>
          <button className="btn sm primary" onClick={() => setOpen(null)}><Icon name="check" size="sm" />Terminé</button></div></div> : null}
    </div>
  );
});

