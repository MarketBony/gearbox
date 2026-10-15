import React, { useEffect, useState } from 'react';
import { Icon, PickerBtn, Seg, gx, hud } from '../../ui/kit';
import { db } from '../../../../services/dataService';
import { nf } from '../common';
import type { Q } from './modele';
import type { SetQ } from './Briques';
import {
  LISTE_L, MOIS_L, PORTEE_L, UNITE_L, complete, nouveauGroupe, nouvelleCondition, opL, aid,
  type Carte, type Champ, type Condition, type Details, type Groupe, type Liste, type Portee, type TypeChamp,
} from './avanceModele';

/**
 * Mode avancé du Requêteur (planche D, validée par Théo le 15/10) : groupes de conditions en cartes, conditions en lignes
 * alignées (champ · opérateur · valeurs · clients restants), exclusions en cartes orangées, liste collée.
 * Contrat : ../CONTRAT-API.md § « Mode avancé du Requêteur ». Les compteurs viennent de POST /requetes/details.
 */

const MAX_G = 12, MAX_C = 30;
const MOIS_C = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const ORDRE = ['Client', 'Coordonnées', 'Véhicule', 'Achat', 'Financement'];
const OP0: Record<TypeChamp, string> = { texte: 'est', liste: 'est_un_de', tableau: 'contient_un_de', nombre: 'ge', date: 'prochains', booleen: 'vrai' };
const VALS = ['est', 'n_est_pas', 'contient', 'ne_contient_pas', 'commence_par', 'finit_par', 'est_un_de', 'aucun_de', 'contient_un_de'];
const has = (x: unknown) => x !== null && x !== undefined && x !== '';
const num = (v: string) => (v === '' ? '' : Number(v));

// ---------------------------------------------------------------- étiquettes + suggestions
const Tags: React.FC<{ ch: Champ; valeurs: string[]; onChange: (v: string[]) => void }> = ({ ch, valeurs, onChange }) => {
  const [txt, setTxt] = useState(''), [focus, setFocus] = useState(false);
  const [sug, setSug] = useState<{ v: string; n: number }[] | null>(null);
  const can = ch.suggestions || ch.type === 'liste' || ch.type === 'tableau';
  useEffect(() => {
    if (!can || !focus) return;
    const ac = new AbortController();
    const t = setTimeout(() => { db.getCrmValeurs(ch.cle, txt.trim(), ac.signal).then((r) => setSug(r || [])).catch(() => { if (!ac.signal.aborted) setSug([]); }); }, 250);
    return () => { clearTimeout(t); ac.abort(); };
  }, [txt, focus, ch.cle, can]);
  const add = (raw: string) => {
    const nv = raw.split(/[,;\t\n]+/).map((x) => x.trim()).filter(Boolean).filter((x) => !valeurs.some((y) => y.toUpperCase() === x.toUpperCase()));
    if (nv.length) onChange([...valeurs, ...nv]);
    setTxt('');
  };
  const list = (sug || []).filter((s) => !valeurs.some((v) => v.toUpperCase() === String(s.v).toUpperCase()));
  return (
    <div className="rq3-tags">
      {valeurs.map((v) => <span key={v} className="rq3-tag">{v}<button aria-label={`Retirer ${v}`} onClick={() => onChange(valeurs.filter((x) => x !== v))}><Icon name="close" size="sm" /></button></span>)}
      <input className="rq3-ti" value={txt} placeholder={valeurs.length ? '' : can ? 'Tapez ou choisissez…' : 'Tapez puis Entrée…'}
        onChange={(e) => setTxt(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => { setTimeout(() => setFocus(false), 150); if (txt.trim()) add(txt); }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ',' || e.key === ';') && txt.trim()) { e.preventDefault(); add(txt); }
          else if (e.key === 'Backspace' && !txt && valeurs.length) onChange(valeurs.slice(0, -1));
          else if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
        }} />
      {focus && can && list.length ? <div className="rq3-sug" onMouseDown={(e) => e.preventDefault()}>
        {list.map((s) => <button key={s.v} onClick={() => add(String(s.v))}><span className="ellipsis grow">{s.v}</span><span className="faint">{nf(s.n)}</span></button>)}</div> : null}
    </div>
  );
};

const Unite: React.FC<{ c: Condition; set: (p: Partial<Condition>) => void }> = ({ c, set }) => (
  <select className="select rq3-u" value={c.unite || 'mois'} onChange={(e) => set({ unite: e.target.value as Condition['unite'] })}>
    {Object.entries(UNITE_L).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
);
const Valeurs: React.FC<{ c: Condition; ch: Champ | undefined; set: (p: Partial<Condition>) => void }> = ({ c, ch, set }) => {
  if (!ch || !c.op) return <span className="faint">—</span>;
  const n = (k: 'n' | 'min' | 'max', ph = '') => <input className="input rq3-n" type="number" value={has(c[k]) ? String(c[k]) : ''} placeholder={ph} onChange={(e) => set({ [k]: num(e.target.value) } as Partial<Condition>)} />;
  const d = (k: 'de' | 'a') => <input className="input rq3-d" type="date" value={c[k] || ''} onChange={(e) => set({ [k]: e.target.value } as Partial<Condition>)} />;
  if (VALS.includes(c.op)) return <Tags ch={ch} valeurs={c.valeurs || []} onChange={(v) => set({ valeurs: v })} />;
  switch (c.op) {
    case 'mois_annee': { const v = c.valeurs || []; return (
      <div className="rq3-mois">{MOIS_L.map((m, i) => { const k = String(i + 1), on = v.includes(k); return <button key={k} className={`rq2-pill ${on ? 'on' : ''}`} onClick={() => set({ valeurs: on ? v.filter((x) => x !== k) : [...v, k] })}>{MOIS_C[i]}</button>; })}</div>); }
    case 'eq': case 'ne': case 'gt': case 'ge': case 'lt': case 'le': return <div className="rq3-in">{n('n')}</div>;
    case 'il_y_a_plus_de': return <div className="rq3-in">{n('n')}<Unite c={c} set={set} /></div>;
    case 'entre': return ch.type === 'date' ? <div className="rq3-in">{d('de')}<span className="faint">et le</span>{d('a')}</div> : <div className="rq3-in">{n('min')}<span className="faint">et</span>{n('max')}</div>;
    case 'avant': case 'apres': return <div className="rq3-in">{d('de')}</div>;
    case 'prochains': case 'derniers': return <div className="rq3-in">{n('min', 'de')}<span className="faint">à</span>{n('max', 'à')}<Unite c={c} set={set} /></div>;
  }
  return <span className="faint">—</span>;
};

// ---------------------------------------------------------------- une condition
const Ligne_: React.FC<{ c: Condition; champs: Champ[]; count: React.ReactNode; set: (p: Partial<Condition>) => void; del: () => void }> = ({ c, champs, count, set, del }) => {
  const ch = champs.find((x) => x.cle === c.champ), ok = complete(c, ch), off = c.actif === false;
  const pick = (el: HTMLElement) => gx().ui.pick(el, ORDRE.map((g) => ({ label: g, items: champs.filter((x) => x.groupe === g).map((x) => ({ v: x.cle, l: x.libelle })) }))
    .concat(champs.some((x) => !ORDRE.includes(x.groupe)) ? [{ label: 'Autres', items: champs.filter((x) => !ORDRE.includes(x.groupe)).map((x) => ({ v: x.cle, l: x.libelle })) }] : [])
    .filter((g) => g.items.length), { multi: false, search: true, title: 'Champ', selected: [c.champ], width: 330, onChange: ([v]: string[]) => {
      const n = champs.find((x) => x.cle === v); if (!n) return;
      const same = ch && ch.type === n.type;
      set({ champ: v, op: same && n.operateurs.includes(c.op) ? c.op : n.operateurs.includes(OP0[n.type]) ? OP0[n.type] : n.operateurs[0],
        ...(same ? {} : { valeurs: [], n: '', min: '', max: '', de: '', a: '' }) });
    } });
  return (
    <div className={`rq3-c ${off ? 'off' : ''} ${ok ? '' : 'todo'}`}>
      <div className="f"><PickerBtn label={ch?.libelle || 'Choisir un champ…'} active={!!ch} onClick={pick} /></div>
      <div className="o">{ch ? <select className="select" value={c.op} onChange={(e) => set({ op: e.target.value })}>
        {ch.operateurs.map((o) => <option key={o} value={o}>{opL(o, ch.type)}</option>)}</select> : <span className="faint">opérateur</span>}</div>
      <div className="v"><Valeurs c={c} ch={ch} set={set} /></div>
      <div className="n">{ok ? count : <span className="rq3-todo" data-tip="Condition incomplète : elle n’est pas envoyée au serveur">à compléter</span>}</div>
      <div className="a"><input type="checkbox" className="switch" checked={!off} aria-label="Activer la condition" data-tip={off ? 'Réactiver' : 'Désactiver temporairement'} onChange={(e) => set({ actif: e.target.checked })} />
        <button className="icon-btn sm" aria-label="Supprimer la condition" data-tip="Supprimer" onClick={del}><Icon name="trash" size="sm" /></button></div>
    </div>
  );
};

// ---------------------------------------------------------------- volet « Coller une liste »
export const ListeSheet: React.FC<{ liste: Liste | null | undefined; close: (v?: unknown) => void; onApply: (l: Liste | null) => void }> = ({ liste, close, onApply }) => {
  const [type, setType] = useState<Liste['type']>(liste?.type || 'immat');
  const [txt, setTxt] = useState((liste?.valeurs || []).join('\n'));
  const [excl, setExcl] = useState(!!liste?.exclure);
  const vals = [...new Set(txt.split(/[\n,;\t]+/).map((x) => x.trim()).filter(Boolean))];
  return (<>
    <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>Coller une liste</h3><button className="icon-btn sm" data-sheet="" aria-label="Fermer"><Icon name="close" size="sm" /></button></div>
    <div className="crm-note" style={{ margin: '6px 0 12px' }}>Une valeur par ligne, ou séparées par des virgules, points-virgules ou tabulations (copier-coller d’une colonne Excel). 20 000 valeurs au plus.</div>
    <div className="field"><span className="label">Type de valeurs</span>
      <Seg<Liste['type']> value={type} onChange={setType} className="rq-full" options={(Object.keys(LISTE_L) as Liste['type'][]).map((k) => [k, LISTE_L[k]])} /></div>
    <textarea className="textarea" rows={10} style={{ width: '100%', marginTop: 12, fontFamily: 'ui-monospace,Consolas,monospace', fontSize: 12.5 }} value={txt} onChange={(e) => setTxt(e.target.value)}
      placeholder={type === 'immat' ? 'AB-123-CD\nEF-456-GH' : type === 'vin' ? 'VF1RJA00012345678' : type === 'id_spark' ? 'SPK-0012345' : 'DUPONT JEAN'} />
    <div className="row wrap" style={{ justifyContent: 'space-between', marginTop: 8, gap: 10 }}>
      <label className="row" style={{ gap: 8, fontSize: 13.5 }}><input type="checkbox" className="check" checked={excl} onChange={(e) => setExcl(e.target.checked)} />Exclure ces clients au lieu de les cibler</label>
      <span className="crm-note" style={vals.length > 20000 ? { color: 'var(--danger)' } : undefined}><b>{nf(vals.length)}</b> valeur{vals.length > 1 ? 's' : ''} lue{vals.length > 1 ? 's' : ''}{vals.length > 20000 ? ' : 20 000 au plus' : ''}</span></div>
    <div className="foot">{liste ? <button className="btn" onClick={() => { onApply(null); close('ok'); }}>Retirer la liste</button> : null}<span className="grow" />
      <button className="btn" data-sheet="">Annuler</button>
      <button className="btn primary" disabled={!vals.length || vals.length > 20000} onClick={() => { onApply({ type, valeurs: vals, exclure: excl }); close('ok'); }}>Appliquer</button></div>
  </>);
};

// ---------------------------------------------------------------- mode avancé
const Avance: React.FC<{
  q: Q; setQ: SetQ; champs: Champ[] | null; details: Details | null; carte: Carte; dBusy: boolean; simple: number;
  onSimple: () => void; onListe: () => void;
}> = ({ q, setQ, champs, details, carte, dBusy, simple, onSimple, onListe }) => {
  const G = q.groupes || [], C = champs || [];
  const updG = (id: string, f: (g: Groupe) => Groupe | null) => setQ((x) => ({ ...x, from: null, groupes: (x.groupes || []).flatMap((g) => { if (g.id !== id) return [g]; const r = f(g); return r ? [r] : []; }) }));
  const updC = (gid: string, cid: string, p: Partial<Condition>) => updG(gid, (g) => ({ ...g, conditions: g.conditions.map((c) => (c.id === cid ? { ...c, ...p } : c)) }));
  const addG = (exclure: boolean) => setQ((x) => ({ ...x, from: null, groupes: [...(x.groupes || []), nouveauGroupe(exclure)] }));

  const val = (n: number | undefined) => (dBusy || !details ? '…' : n === undefined || n < 0 ? '—' : nf(n));
  const menuG = (g: Groupe, el: HTMLElement) => gx().menu.open([
    { label: g.actif === false ? 'Réactiver le groupe' : 'Désactiver le groupe', icon: 'eye', action: () => updG(g.id, (x) => ({ ...x, actif: x.actif === false })) },
    { label: 'Dupliquer', icon: 'copy', disabled: G.length >= MAX_G, action: () => setQ((x) => { const gs = x.groupes || [], i = gs.findIndex((y) => y.id === g.id);
      const copie = { ...JSON.parse(JSON.stringify(g)), id: aid('g'), conditions: g.conditions.map((c) => ({ ...JSON.parse(JSON.stringify(c)), id: aid('c') })) };
      return { ...x, from: null, groupes: [...gs.slice(0, i + 1), copie, ...gs.slice(i + 1)] }; }) },
    '-', { label: g.exclure ? 'Supprimer l’exclusion' : 'Supprimer le groupe', icon: 'trash', action: () => { updG(g.id, () => null); hud('Groupe supprimé'); } },
  ], el, { align: 'right' });

  let n = 0;
  return (
    <div className="rq2-main rq3">
      <div className="rq3-top">
        {details && !dBusy ? <span>Point de départ : <b>{nf(details.base)}</b> clients{simple ? ' (avec les conditions du mode simple)' : ''}</span> : dBusy ? <span className="faint">Point de départ : …</span> : <span /> }
        {simple ? <span className="rq3-rappel">+ {simple} condition{simple > 1 ? 's' : ''} du mode simple <button className="rq2-link" onClick={onSimple}>voir</button></span> : null}
      </div>
      {!champs ? <div className="crm-note">Chargement de la liste des champs…</div> : null}
      {!G.length && !q.liste ? <div className="rq-hint"><Icon name="info" /><div><b style={{ color: 'var(--text)' }}>Ciblage sur mesure.</b> Un groupe réunit des conditions (toutes, ou au moins une) ; les groupes s’ajoutent en ET. « Le même véhicule » : un seul achat doit remplir tout le groupe.</div></div> : null}
      {G.map((g, gi) => {
        const m = carte.g[g.id], d = m && details ? details.groupes[m.i] : undefined;
        const prev = m && details ? (m.i === 0 ? details.base : details.groupes[m.i - 1]?.apres) : undefined;
        const off = g.actif === false, num_ = g.exclure ? 0 : ++n;
        const cnt = !m ? <span className="faint">—</span> : g.exclure ? <>−{val(d && prev !== undefined && d.apres >= 0 ? prev - d.apres : undefined)} clients</> : <>→ {val(d?.apres)} clients</>;
        return (
          <React.Fragment key={g.id}>
            {gi ? <div className="rq3-and">ET</div> : null}
            <section className={`rq3-g ${g.exclure ? 'excl' : ''} ${off ? 'off' : ''}`}>
              <div className="rq3-gh">
                <span className="rq3-gt">{g.exclure ? 'Exclure les clients dont' : <><b>Groupe {num_}</b> · porte sur</>}</span>
                <select className="select rq3-sel" value={g.portee} onChange={(e) => updG(g.id, (x) => ({ ...x, portee: e.target.value as Portee }))}>
                  {(Object.keys(PORTEE_L) as Portee[]).map((p) => <option key={p} value={p}>{PORTEE_L[p]}</option>)}</select>
                <span className="rq3-gt">{g.exclure ? 'remplit' : 'et doit remplir'}</span>
                <select className={`select rq3-sel ${g.mode === 'ou' ? 'ou' : ''}`} value={g.mode} onChange={(e) => updG(g.id, (x) => ({ ...x, mode: e.target.value === 'ou' ? 'ou' : 'et' }))}>
                  <option value="et">toutes les conditions (ET)</option><option value="ou">au moins une condition (OU)</option></select>
                <span className="grow" />
                <span className="rq3-gn">{off ? <span className="faint">désactivé</span> : cnt}</span>
                <button className="icon-btn sm" aria-label="Actions du groupe" onClick={(e) => menuG(g, e.currentTarget)}><Icon name="more" size="sm" /></button>
              </div>
              <div className="rq3-cs">
                {g.conditions.map((c, ci) => (
                  <React.Fragment key={c.id}>
                    {ci ? <div className={`rq3-op ${g.mode === 'ou' ? 'ou' : ''}`}>{g.mode === 'ou' ? 'OU' : 'ET'}</div> : null}
                    <Ligne_ c={c} champs={C} count={val(m && c.id in m.c && d ? d.conditions[m.c[c.id]] : undefined)}
                      set={(p) => updC(g.id, c.id, p)} del={() => updG(g.id, (x) => ({ ...x, conditions: x.conditions.filter((y) => y.id !== c.id) }))} />
                  </React.Fragment>))}
                {!g.conditions.length ? <div className="crm-note">Aucune condition : ce groupe ne filtre rien.</div> : null}
              </div>
              <button className="rq2-link" disabled={g.conditions.length >= MAX_C} onClick={() => { const c = nouvelleCondition(); updG(g.id, (x) => ({ ...x, conditions: [...x.conditions, c] })); }}>
                <Icon name="plus" size="sm" />Condition</button>
            </section>
          </React.Fragment>);
      })}
      {q.liste?.valeurs.length ? <>
        {G.length ? <div className="rq3-and">ET</div> : null}
        <section className={`rq3-g ${q.liste.exclure ? 'excl' : ''}`}><div className="rq3-gh">
          <Icon name="list" size="sm" /><span className="rq3-gt"><b>Liste collée</b> · {LISTE_L[q.liste.type]} · {nf(q.liste.valeurs.length)} valeur{q.liste.valeurs.length > 1 ? 's' : ''} · {q.liste.exclure ? 'clients exclus' : 'clients ciblés'}</span>
          <span className="grow" /><span className="rq3-gn">{details?.liste != null && !dBusy ? <>= {nf(details.liste)} clients</> : val(undefined)}</span>
          <button className="btn sm" onClick={onListe}>Modifier</button>
          <button className="icon-btn sm" aria-label="Retirer la liste" data-tip="Retirer la liste" onClick={() => setQ((x) => ({ ...x, from: null, liste: null }))}><Icon name="trash" size="sm" /></button></div></section></> : null}
      <div className="rq3-add">
        <button className="btn" disabled={G.length >= MAX_G} onClick={() => addG(false)}><Icon name="plus" size="sm" />Groupe</button>
        <button className="btn rq3-ex" disabled={G.length >= MAX_G} onClick={() => addG(true)}><Icon name="minus" size="sm" />Exclusion</button>
        <button className="btn" onClick={onListe}><Icon name="list" size="sm" />{q.liste ? 'Modifier la liste collée…' : 'Coller une liste (VIN, immat, noms, identifiants SPARK)…'}</button>
      </div>
      <div className="crm-note"><Icon name="info" size="sm" /> ET entre les groupes ; dans un groupe, ET ou OU selon son réglage. Une condition « à compléter » n’est pas envoyée. Les chiffres à droite : clients restants (avant le canal) après chaque condition et chaque groupe.</div>
    </div>
  );
};
export default Avance;
