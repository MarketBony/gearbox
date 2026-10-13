import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Seg, gx } from '../../ui/kit';
import { FAM_C, brandHex, brandName, mY, nf } from '../common';
import {
  CANAL, MENU, TY, famOf, has, mk, siteGroups,
  type Canal, type Compte, type MenuEntry, type Q, type Referentiels, type UB,
} from './modele';
import { Brick, Editor, type SetQ } from './Briques';
import { Ico } from './outils';

/**
 * Constructeur en 4 questions (refonte validée par Théo, 13/10 — planche B) : 1 · Qui ? 2 · Quel véhicule ? 3 · À quel
 * moment ? 4 · Comment les joindre ? Les cartes ne sont qu'une VUE des briques (`Q.bricks`) : recettes, requêtes enregistrées
 * et contrat ne changent pas. Ce qui n'entre pas dans une carte s'ajoute par « préciser » ou « Sauf… », jamais par défaut.
 */

// ---------------------------------------------------------------- opérations sur les briques
const insert = (q: Q, b: UB): Q => { const i = q.bricks.findIndex((y) => famOf(y) === 'sauf'); return { ...q, from: null, bricks: i < 0 ? [...q.bricks, b] : [...q.bricks.slice(0, i), b, ...q.bricks.slice(i)] }; };
const patch = (q: Q, id: string, p: Record<string, any>): Q => ({ ...q, from: null, bricks: q.bricks.map((x) => (x.id === id ? { ...x, p: { ...x.p, ...p }, on: true } : x)) });
const drop = (q: Q, pred: (b: UB) => boolean): Q => ({ ...q, from: null, bricks: q.bricks.filter((x) => !pred(x)) });
const first = (q: Q, t: string, pred: (b: UB) => boolean = () => true) => q.bricks.find((b) => b.t === t && !b.sauf && pred(b));

// ---------------------------------------------------------------- répartition des briques entre les cartes
export type Moment = 'aucun' | 'fin' | 'ct' | 'anniv' | 'sans';
const FIN_T = ['fin_echeance', 'fin_famille', 'fin_duree', 'fin_ecoule'];
const C1 = ['type_personne', 'site_client', 'zone', 'geo', 'civilite', 'anciennete', 'flotte', 'nb_vehicules', 'vendeur_client', 'sources'];
export const momentOf = (q: Q): Moment => {
  const a = q.bricks.filter((b) => !b.sauf);
  if (a.some((b) => FIN_T.includes(b.t))) return 'fin';
  if (a.some((b) => b.t === 'ct')) return 'ct';
  if (a.some((b) => b.t === 'livraison' && b.p.mode === 'anniv')) return 'anniv';
  if (a.some((b) => b.t === 'sans_achat_depuis')) return 'sans';
  return 'aucun';
};
const isMoment = (b: UB, m: Moment) => !b.sauf && ((m === 'fin' && (FIN_T.includes(b.t) || b.t === 'fin_organisme')) || (m === 'ct' && b.t === 'ct')
  || (m === 'anniv' && b.t === 'livraison' && b.p.mode === 'anniv') || (m === 'sans' && b.t === 'sans_achat_depuis'));
const isAnyMoment = (b: UB) => !b.sauf && (FIN_T.includes(b.t) || b.t === 'ct' || b.t === 'sans_achat_depuis' || (b.t === 'livraison' && b.p.mode === 'anniv') || (b.t === 'fin_organisme' && b.p.v?.some((x: string) => x !== 'Aucun')));
export const cardOf = (b: UB, m: Moment): 1 | 2 | 3 | 4 | 'sauf' => (famOf(b) === 'sauf' ? 'sauf' : isMoment(b, m) ? 3 : C1.includes(b.t) ? 1 : b.t.startsWith('a_') ? 4 : 2);

// ---------------------------------------------------------------- petits éléments
const cv = (c: string) => ({ '--c': c } as React.CSSProperties);
interface Common { q: Q; setQ: SetQ; R: Referentiels | null; c: Compte | null; open: string | null; setOpen: (id: string | null) => void; impacts: Record<string, number> }

const Head: React.FC<{ n: number; t: string; h: string }> = ({ n, t, h }) => (
  <div className="rq2-ch"><span className="rq2-n">{n}</span><div><h3>{t}</h3><div className="h">{h}</div></div></div>
);
/** Briques « en plus » d'une carte (phrase + édition) et le lien « préciser… » qui en ajoute. */
const Extras: React.FC<Common & { bricks: UB[]; add: MenuEntry[]; label?: string }> = ({ q, setQ, R, open, setOpen, impacts, bricks, add, label = 'préciser…' }) => {
  const menu = (el: HTMLElement) => gx().menu.open(add.map((m) => ({
    label: m.l, disabled: !!m.off,
    action: () => { const b = mk(m.t, R, m.p || {}, m.sauf ? { sauf: true } : {}); setQ((x) => insert(x, b)); setOpen(TY[m.t].fields.length ? b.id : null); },
  })), el);
  return (<>
    {bricks.length ? <div className="rq-list">{bricks.map((b) => <Brick key={b.id} b={b} R={R} open={open === b.id} impact={impacts[b.id]} setQ={setQ} setOpen={setOpen} />)}</div> : null}
    {add.length ? <button className="rq2-link" onClick={(e) => menu(e.currentTarget)}><Icon name="plus" size="sm" />{label}</button> : null}
  </>);
};
const entries = (ts: string[], l: Record<string, string> = {}): MenuEntry[] => ts.map((t) => ({ t, l: l[t] || TY[t].l }));

// ---------------------------------------------------------------- 1 · Qui ?
/** Plage libre « de … à … véhicules » : saisie locale, appliquée après une pause de frappe (jamais perdue par un rendu). */
const Plage: React.FC<{ min: unknown; max: unknown; onChange: (min: string, max: string) => void; onClear?: () => void }> = ({ min, max, onChange, onClear }) => {
  const [a, setA] = useState(String(min ?? '')), [b, setB] = useState(String(max ?? ''));
  const t = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => { setA(String(min ?? '')); setB(String(max ?? '')); }, [min, max]);
  useEffect(() => () => clearTimeout(t.current), []);
  const go = (x: string, y: string) => { clearTimeout(t.current); t.current = setTimeout(() => onChange(x, y), 450); };
  return (
    <div className="rq2-pills" style={{ alignItems: 'center' }}>
      <span>de</span>
      <input className="input" type="number" min={0} inputMode="numeric" aria-label="Flotte minimum" placeholder="0" value={a} style={{ width: 80 }}
        onChange={(e) => { setA(e.target.value); go(e.target.value, b); }} />
      <span>à</span>
      <input className="input" type="number" min={0} inputMode="numeric" aria-label="Flotte maximum" placeholder="sans limite" value={b} style={{ width: 110 }}
        onChange={(e) => { setB(e.target.value); go(a, e.target.value); }} />
      <span>véhicules</span>
      {onClear ? <button className="rq2-link" onClick={() => { clearTimeout(t.current); onClear(); }}>toutes tailles</button> : null}
    </div>
  );
};

const Qui: React.FC<Common> = (P) => {
  const { q, setQ, R } = P;
  const tp = first(q, 'type_personne'), who = tp ? tp.p.v : 'tous';
  const sites = q.bricks.filter((b) => b.t === 'site_client' && !b.sauf), zones = q.bricks.filter((b) => b.t === 'zone' && !b.sauf);
  const setWho = (v: string) => setQ((x) => { const b = first(x, 'type_personne'); if (v === 'tous') return b ? drop(x, (y) => y.id === b.id) : x; return b ? patch(x, b.id, { v }) : insert(x, mk('type_personne', R, { v })); });
  const pickSites = (el: HTMLElement) => {
    // Le site du périmètre garde sa propre brique (pastille « périmètre ») : on édite l'autre.
    const b = sites.find((s) => !s.per);
    gx().ui.pick(el, siteGroups(R), { title: 'Ayant acheté à', selected: b?.p.v || [], allLabel: 'Aucun autre', width: 310, onChange: (v: string[]) => setQ((x) => {
      const cur = x.bricks.find((y) => y.t === 'site_client' && !y.sauf && !y.per);
      if (!v.length) return cur ? drop(x, (y) => y.id === cur.id) : x;
      return cur ? patch(x, cur.id, { v }) : insert(x, mk('site_client', R, { v, mode: 'achat' }));
    }) });
  };
  const pickZone = (el: HTMLElement) => gx().ui.pick(el, [{ items: (R?.zones || []).map((z) => ({ v: z.concession, l: z.concession, hint: (z.departements || []).join(', ') })) }],
    { multi: false, title: 'Zone de chalandise d’une concession', selected: [zones[0]?.p.v], width: 300, onChange: ([v]: string[]) => setQ((x) => (zones[0] ? patch(x, zones[0].id, { v }) : insert(x, mk('zone', R, { v })))) });
  const addMenu = (el: HTMLElement) => gx().menu.open([
    { label: 'Un ou des sites…', icon: 'pin', action: () => pickSites(el) },
    { label: 'La zone d’une concession…', icon: 'flag', action: () => pickZone(el) },
    { label: 'Un lieu d’habitation (département, code postal, ville)', icon: 'globe', action: () => { const b = mk('geo', R); setQ((x) => insert(x, b)); P.setOpen(b.id); } },
  ], el);
  const unSite = (b: UB, s: string) => setQ((x) => { const v = b.p.v.filter((y: string) => y !== s); return v.length ? patch(x, b.id, { v }) : drop(x, (y) => y.id === b.id); });
  // Taille de flotte (professionnels) : raccourcis visibles d'emblée.
  const fl = first(q, 'flotte');
  const setFl = (n: number | null) => setQ((x) => { const b = first(x, 'flotte'); if (n == null) return b ? drop(x, (y) => y.id === b.id) : x; return b ? patch(x, b.id, { min: n, max: '' }) : insert(x, mk('flotte', R, { min: n, max: '' })); });
  // Plage libre (ex. 5 à 35) : une case vide = sans limite ; les deux vides = toutes tailles.
  const setFlR = (min: unknown, max: unknown) => setQ((x) => {
    const n = (v: unknown) => (v === '' || v == null || !Number.isFinite(Number(v)) ? '' : Math.max(0, Math.round(Number(v))));
    let [a, b] = [n(min), n(max)];
    if (a !== '' && b !== '' && a > b) [a, b] = [b, a];
    const cur = first(x, 'flotte');
    if (a === '' && b === '') return cur ? drop(x, (y) => y.id === cur.id) : x;
    return cur ? patch(x, cur.id, { min: a, max: b }) : insert(x, mk('flotte', R, { min: a, max: b }));
  });
  const m = momentOf(q), extras = q.bricks.filter((b) => cardOf(b, m) === 1 && b !== tp && !sites.includes(b) && !zones.includes(b) && !(who === 'societe' && b === fl));
  return (
    <section className="rq2-card">
      <Head n={1} t="Qui ?" h="Le profil des clients et le lieu où ils ont acheté." />
      <Seg value={who} onChange={setWho} options={[['tous', 'Tous'], ['particulier', 'Particuliers'], ['societe', 'Professionnels']]} />
      {who === 'societe' ? <div className="rq2-row" data-tip="Véhicules encore au parc (achetés chez nous, pas revendus). Laissez une case vide pour « sans limite »."><span className="rq2-lbl">taille de flotte</span>
        <Plage min={fl?.p.min ?? ''} max={fl?.p.max ?? ''} onChange={setFlR} onClear={fl ? () => setFl(null) : undefined} /></div> : null}
      <div className="rq2-row"><span className="rq2-lbl">ayant acheté à</span>
        <div className="rq2-pills">
          {sites.flatMap((b) => (b.p.v as string[]).map((s) => (
            <span key={b.id + s} className={`rq2-pill on ${b.on ? '' : 'off'}`} data-tip={b.per ? 'Prérempli par le périmètre de la barre de menus' : b.p.mode === 'dernier' ? 'Dernier achat sur ce site' : 'Au moins un achat sur ce site'}>
              <Icon name="pin" size="sm" />{s}{b.per ? <span className="faint" style={{ fontSize: 11 }}>périmètre</span> : null}<button className="x" aria-label={`Retirer ${s}`} onClick={() => unSite(b, s)}><Icon name="close" size="sm" /></button></span>)))}
          {zones.map((b) => <span key={b.id} className="rq2-pill on"><Icon name="flag" size="sm" />Zone de {b.p.v}<button className="x" aria-label="Retirer la zone" onClick={() => setQ((x) => drop(x, (y) => y.id === b.id))}><Icon name="close" size="sm" /></button></span>)}
          {!sites.length && !zones.length ? <span className="faint">partout</span> : null}
          <button className="rq2-pill add" onClick={(e) => addMenu(e.currentTarget)}><Icon name="plus" size="sm" />site ou zone</button></div></div>
      <Extras {...P} bricks={extras} add={entries(['civilite', 'anciennete', 'flotte', 'nb_vehicules', 'vendeur_client', 'sources', 'geo'])} />
    </section>
  );
};

// ---------------------------------------------------------------- 2 · Quel véhicule ?
const MAIN_BR = ['RENAULT', 'DACIA', 'NISSAN', 'ALPINE'];
const Vehicule: React.FC<Common> = (P) => {
  const { q, setQ, R } = P;
  const mb = first(q, 'marque'), sel: string[] = mb?.p.v || [];
  const parc = first(q, 'au_parc', (b) => b.p.v === 'oui');
  const all = R?.marques?.length ? R.marques : MAIN_BR, main = MAIN_BR.filter((b) => all.includes(b) || !R), others = all.filter((b) => !main.includes(b));
  const setBr = (v: string[]) => setQ((x) => { const b = first(x, 'marque'); if (!v.length) return b ? drop(x, (y) => y.id === b.id) : x; return b ? patch(x, b.id, { v }) : insert(x, mk('marque', R, { v })); });
  const tog = (m: string) => setBr(sel.includes(m) ? sel.filter((x) => x !== m) : [...sel, m]);
  const autres = (el: HTMLElement) => gx().ui.pick(el, [{ items: others.map((m) => ({ v: m, l: brandName(m), color: brandHex(m) })) }],
    { title: 'Autres marques', selected: sel.filter((m) => others.includes(m)), allLabel: 'Aucune', width: 280, onChange: (v: string[]) => setBr([...sel.filter((m) => main.includes(m)), ...v]) });
  const setParc = (on: boolean) => setQ((x) => { const b = first(x, 'au_parc', (y) => y.p.v === 'oui'); return on ? (b ? x : insert(x, mk('au_parc', R, { v: 'oui' }))) : b ? drop(x, (y) => y.id === b.id) : x; });
  const m = momentOf(q), extras = q.bricks.filter((b) => cardOf(b, m) === 2 && b !== mb && b !== parc);
  const selOthers = sel.filter((b) => !main.includes(b));
  return (
    <section className="rq2-card">
      <Head n={2} t="Quel véhicule ?" h="Celui qu’ils ont acheté chez nous." />
      <div className="rq2-pills">
        {main.map((b) => <button key={b} className={`rq2-pill ${sel.includes(b) ? 'on' : ''}`} style={cv(brandHex(b))} aria-pressed={sel.includes(b)} onClick={() => tog(b)}><i className="brand-dot" style={cv(brandHex(b))} />{brandName(b)}</button>)}
        {selOthers.map((b) => <button key={b} className="rq2-pill on" style={cv(brandHex(b))} onClick={() => tog(b)}><i className="brand-dot" style={cv(brandHex(b))} />{brandName(b)}<Icon name="close" size="sm" /></button>)}
        {others.length ? <button className="rq2-pill add" onClick={(e) => autres(e.currentTarget)}><Icon name="plus" size="sm" />Autres marques</button> : null}
        {!sel.length ? <span className="faint" style={{ marginLeft: 4 }}>toutes marques</span> : null}</div>
      <label className="rq2-check"><input type="checkbox" className="check" checked={!!parc} onChange={(e) => setParc(e.target.checked)} />Encore à eux <span className="faint">(pas revendu)</span></label>
      <Extras {...P} bricks={extras} add={entries(['modele', 'energie', 'age_vehicule', 'achat_type', 'livraison', 'montant', 'reprise', 'garantie', 'agent', 'site_achat', 'vendeur_achat'], { livraison: 'Date de livraison' })} />
    </section>
  );
};

// ---------------------------------------------------------------- 3 · À quel moment ?
const TILES: [Exclude<Moment, 'aucun'>, string, string, string][] = [
  ['fin', 'Fin de contrat', 'LOA, LLD, crédit', 'euro'], ['ct', 'Contrôle technique', 'prochain CT', 'car'],
  ['anniv', 'Anniversaire', 'de la livraison', 'gift'], ['sans', 'Sans nouvelles', 'pas d’achat depuis…', 'clock'],
];
const MOIS = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const addMois = (n: number) => { const d = new Date(); d.setDate(15); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };
/** « entre janvier et avril 2027 » à partir d'un intervalle en mois depuis aujourd'hui. */
export const fenetre = (min: any, max: any) => {
  if (!has(max)) return has(min) && +min > 0 ? `après ${MOIS(addMois(+min))}` : 'à n’importe quelle date';
  const a = addMois(has(min) ? +min : 0), b = addMois(+max), [ma, ya] = MOIS(a).split(' '), mb = MOIS(b);
  return `entre ${a.slice(0, 4) === b.slice(0, 4) ? ma : `${ma} ${ya}`} et ${mb}`;
};
const ou = (a: string[]) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} ou ${a[a.length - 1]}`);
const dFR = (iso: string) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '…');
export const finPhrase = (q: Q) => {
  const fam = first(q, 'fin_famille'), ech = first(q, 'fin_echeance'), org = first(q, 'fin_organisme');
  const f = fam?.p.v?.length ? ou(fam.p.v) : 'Un financement';
  const e = !ech ? '' : ech.p.when === 'cours' ? ' encore en cours' : ech.p.when === 'entre' ? ` qui se termine entre le ${dFR(ech.p.from)} et le ${dFR(ech.p.to)}` : ` qui se termine ${fenetre(ech.p.min, ech.p.max)}`;
  const o = org?.p.v?.length && !(org.p.v.length === 1 && org.p.v[0] === 'Aucun') ? ` chez ${ou(org.p.v.filter((x: string) => x !== 'Aucun'))}` : '';
  return `${f}${o}${e}`;
};
const Moment_: React.FC<Common> = (P) => {
  const { q, setQ, R, c } = P;
  const m = momentOf(q), [more, setMore] = useState(false);
  const choose = (t: Moment) => {
    setMore(false);
    setQ((x) => {
      let y = drop(x, (b) => isAnyMoment(b) && !(t === 'fin' && isMoment(b, 'fin')));
      if (t === 'fin') { if (!first(y, 'fin_famille')) y = insert(y, mk('fin_famille', R, { v: ['LOA', 'LLD'] })); if (!first(y, 'fin_echeance')) y = insert(y, mk('fin_echeance', R, { when: 'dans', min: 3, max: 6 })); }
      if (t === 'ct') y = insert(y, mk('ct', R));
      if (t === 'anniv') y = insert(y, mk('livraison', R, { mode: 'anniv', n: 3, f: 30 }));
      if (t === 'sans') y = insert(y, mk('sans_achat_depuis', R));
      return y;
    });
  };
  const ed = (b: UB | undefined, only?: string[]) => (b ? <Editor b={b} R={R} only={only} set={(p) => setQ((x) => patch(x, b.id, p))} /> : null);
  const fam = first(q, 'fin_famille'), ech = first(q, 'fin_echeance'), org = first(q, 'fin_organisme'), ct = first(q, 'ct'),
    an = first(q, 'livraison', (b) => b.p.mode === 'anniv'), sa = first(q, 'sans_achat_depuis');
  const orgV: string[] = org?.p.v || [];
  const setOrg = (v: string[]) => setQ((x) => { const b = first(x, 'fin_organisme'); if (!v.length) return b ? drop(x, (y) => y.id === b.id) : x; return b ? patch(x, b.id, { v }) : insert(x, mk('fin_organisme', R, { v })); });
  const phrase = m === 'fin' ? finPhrase(q)
    : m === 'ct' && ct ? `Prochain contrôle technique ${has(ct.p.min) && +ct.p.min > 0 ? `dans ${ct.p.min} à ${ct.p.max} mois` : `dans les ${has(ct.p.max) ? ct.p.max : '?'} mois`}`
    : m === 'anniv' && an ? `Livrés il y a ${has(an.p.n) ? an.p.n : '?'} ans, anniversaire à ± ${has(an.p.f) ? an.p.f : 30} jours`
    : m === 'sans' && sa ? `Pas d’achat depuis plus de ${has(sa.p.n) ? sa.p.n : '?'} ans` : '';
  const extras = q.bricks.filter((b) => cardOf(b, m) === 3 && b !== fam && b !== ech && b !== org && b !== ct && b !== an && b !== sa);
  const histo = useMemo(() => {
    if (m !== 'fin' || !c) return '';
    const by = c.par_mois_echeance.filter((x) => x.n); if (!by.length) return '';
    const g = Object.fromEntries(by.map((x) => [x.cle, x.n])), ms: string[] = [];
    for (let d = new Date(by[0].cle + '-15'), end = by[by.length - 1].cle; ; d.setMonth(d.getMonth() + 1)) { const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; ms.push(k); if (k >= end || ms.length > 24) break; }
    return gx().chart.bars({ labels: ms.map((x) => mY(x + '-15')), series: [{ name: 'Fins de contrat', values: ms.map((x) => g[x] || 0), color: FAM_C.LOA }], height: 110, fmt: (v: number) => nf(v) });
  }, [m, c]);
  return (
    <section className="rq2-card">
      <Head n={3} t="À quel moment ?" h="Ce qui déclenche la relance." />
      <div className="rq2-tiles">{TILES.map(([k, t, d, i]) => (
        <button key={k} className={`rq2-tile ${m === k ? 'on' : ''}`} aria-pressed={m === k} onClick={() => choose(m === k ? 'aucun' : k)}>
          <span className="ic"><Icon name={i} size="sm" /></span><span className="t">{t}</span><span className="d">{d}</span></button>))}</div>
      {m === 'aucun' ? <div className="crm-note">Aucun déclencheur : tous les clients qui répondent aux questions 1 et 2.</div> : (
        <div className="rq2-set">
          <div className="row" style={{ justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}><span className="rq2-ph">{phrase}</span>
            <button className="rq2-link" onClick={() => setMore(!more)}>{more ? 'terminé' : 'préciser'}</button></div>
          {more ? <div className="rq2-ed">
            {m === 'fin' ? <>
              {ed(fam)}{ed(ech)}
              <div className="rq-fld"><span className="crm-lbl">Organisme</span>
                <div className="chips"><button className="chip" aria-pressed={!orgV.filter((x) => x !== 'Aucun').length} onClick={() => setOrg([])}>Tous</button>
                  {['DIAC', 'Autre banque'].map((o) => <button key={o} className="chip" aria-pressed={orgV.includes(o)} onClick={() => setOrg(orgV.includes(o) ? orgV.filter((x) => x !== o) : [...orgV.filter((x) => x !== 'Aucun'), o])}>{o}</button>)}</div></div>
            </> : m === 'ct' ? ed(ct) : m === 'anniv' ? ed(an, ['n', 'f']) : ed(sa)}
            {m === 'fin' ? <Extras {...P} bricks={extras} add={entries(['fin_duree', 'fin_ecoule'])} label="durée, part écoulée…" /> : null}
          </div> : null}
          {histo ? <div className="rq2-histo"><span className="crm-lbl">Échéances par mois</span><div dangerouslySetInnerHTML={{ __html: histo }} /></div> : null}
        </div>)}
    </section>
  );
};

// ---------------------------------------------------------------- 4 · Comment les joindre ?
const CAN_T: [Exclude<Canal, 'tous'>, string, string][] = [['email', 'E-mail', 'Sarbacane'], ['sms', 'SMS', 'allmysms'], ['phoning', 'Téléphone', 'fiches d’appel'], ['courrier', 'Courrier', 'publipostage']];
const Joindre: React.FC<Common> = (P) => {
  const { q, setQ, c } = P, G = CANAL[q.canal];
  const m = momentOf(q), extras = q.bricks.filter((b) => cardOf(b, m) === 4);
  return (
    <section className="rq2-card">
      <Head n={4} t="Comment les joindre ?" h="Le canal de la campagne : il garde les bonnes coordonnées et retire les doublons." />
      <div className="rq2-tiles">{CAN_T.map(([k, t, d]) => (
        <button key={k} className={`rq2-tile canal ${q.canal === k ? 'on' : ''}`} aria-pressed={q.canal === k} onClick={() => setQ((x) => ({ ...x, canal: x.canal === k ? 'tous' : k }))}>
          <span className="ic"><Ico name={CANAL[k].icon} /></span><span className="t">{t} <span className="faint" style={{ fontWeight: 500 }}>· {d}</span></span>
          <span className="k">{c ? nf(c.entonnoir[CANAL[k].key!]) : '…'}</span><span className="d">joignables</span></button>))}</div>
      <div className="crm-note">{G.key ? `Seuls les clients avec un ${G.coord} ${q.canal === 'courrier' ? 'complète' : 'valide'} sont gardés (jamais une coordonnée suspecte)${q.dedupe ? ` ; ${G.dd!.charAt(0).toLowerCase() + G.dd!.slice(1)}` : ''}. Cliquez à nouveau pour revenir à « tous les canaux ».`
        : 'Aucun canal choisi : tous les clients, sans garde-fou ni dédoublonnage.'}</div>
      <Extras {...P} bricks={extras} add={[]} />
    </section>
  );
};

// ---------------------------------------------------------------- sous les cartes : Sauf… et options avancées
const Bas: React.FC<Common> = (P) => {
  const { q, setQ } = P, m = momentOf(q);
  const sauf = q.bricks.filter((b) => cardOf(b, m) === 'sauf'), user = sauf.filter((b) => !TY[b.t].ui);
  return (<>
    <details className="rq2-low" open={user.length > 0}><summary><Icon name="minus" size="sm" />Sauf…<span className="faint">{user.length ? `${user.length} exclusion${user.length > 1 ? 's' : ''}` : 'exclure des clients'}</span><span className="chev"><Icon name="chevron" size="sm" /></span></summary>
      <Extras {...P} bricks={sauf} add={MENU.sauf.map((x) => ({ ...x, off: x.off || (x.sauf && q.bricks.some((b) => b.sauf && b.t === x.t) ? 'déjà là' : undefined) }))} label="exclure…" /></details>
    <details className="rq2-low"><summary><Icon name="more" size="sm" />Options avancées<span className="faint">{q.level === 'vehicule' ? 'une ligne par véhicule' : 'une ligne par client'}{q.dedupe ? '' : ' · sans dédoublonnage'}</span><span className="chev"><Icon name="chevron" size="sm" /></span></summary>
      <div className="rq2-row"><span className="rq2-lbl">Une ligne par</span><Seg value={q.level} onChange={(v) => setQ((x) => ({ ...x, level: v }))} options={[['client', 'Client'], ['vehicule', 'Véhicule']]} /></div>
      <label className="rq2-check"><input type="checkbox" className="switch" checked={q.dedupe} onChange={(e) => setQ((x) => ({ ...x, dedupe: e.target.checked }))} />Dédoublonner selon le canal (un envoi par e-mail, par numéro, par foyer)</label></details>
  </>);
};

const Cartes: React.FC<Common> = (P) => (
  <div className="rq2-main"><Qui {...P} /><Vehicule {...P} /><Moment_ {...P} /><Joindre {...P} /><Bas {...P} /></div>
);
export default Cartes;
