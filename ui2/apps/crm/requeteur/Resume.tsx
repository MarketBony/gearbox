import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Seg, gx } from '../../ui/kit';
import { brandHex, brandName, dFR, nf } from '../common';
import { CANAL, SRC_L, TY, depL, has, hasT, type Canal, type Compte, type Enregistree, type Format, type Ligne, type Q } from './modele';
import { fenetre } from './Cartes';
import { FMT, FMT_ORDER, Ico, REC, nomL } from './outils';

/**
 * Colonne « En résumé » (sticky) : le gros chiffre, LA phrase qui décrit la cible, les écartés, le bouton d'export du
 * canal, « Voir les clients », « Enregistrer ». Répartitions et aperçu derrière « Voir les détails ».
 * Tous les chiffres viennent du serveur (POST /requetes/compter, /apercu) ; la phrase est tirée des briques.
 */

export type ResTab = 'site' | 'brand' | 'nrj';
const cv = (c: string) => ({ '--c': c } as React.CSSProperties);
export const mainOf = (q: Q, c: Compte | null) => (c ? (q.level === 'vehicule' ? c.lignes : c.clients) : 0);
const UNIT: Record<Canal, string> = { tous: 'clients', email: 'e-mails à envoyer', sms: 'SMS à envoyer', phoning: 'clients à appeler', courrier: 'courriers à envoyer' };
const SANS: Record<Exclude<Canal, 'tous'>, string> = { email: 'sans e-mail valide', sms: 'sans portable valide', phoning: 'sans téléphone valide', courrier: 'sans adresse complète' };
export const EXP_L: Record<Format, string> = { excel: 'Exporter vers Excel', sarbacane: 'Exporter pour Sarbacane', allmysms: 'Exporter pour allmysms', phoning: 'Imprimer les fiches d’appel', courrier: 'Exporter pour le courrier' };

// ---------------------------------------------------------------- la phrase
const ou = (a: string[]) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} ou ${a[a.length - 1]}`);
const lst = (s: string) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const span = (a: any, b: any, u: string) => (has(a) && has(b) ? `de ${a} à ${b} ${u}` : has(a) ? `de plus de ${a} ${u}` : has(b) ? `de moins de ${b} ${u}` : '');
/** Toute la cible en une phrase française, tirée des briques actives (« Particuliers de Clermont, en Renault… »). */
export function phrase(q: Q): string {
  const pos = q.bricks.filter((b) => b.on && !b.sauf && TY[b.t] && !TY[b.t].ui), used = new Set<string>();
  const get = (t: string, pred: (b: any) => boolean = () => true) => { const b = pos.find((x) => x.t === t && !used.has(x.id) && pred(x)); if (b) used.add(b.id); return b; };
  const tp = get('type_personne');
  let s = tp ? (tp.p.v === 'societe' ? 'Professionnels' : 'Particuliers') : 'Clients';
  const sites = pos.filter((b) => b.t === 'site_client' && b.p.v?.length); sites.forEach((b) => used.add(b.id));
  const all = [...new Set(sites.flatMap((b) => b.p.v as string[]))];
  if (all.length) s += all.length > 3 ? ` de ${all.length} sites` : ` de ${ou(all)}`;
  const z = get('zone'); if (z) s += ` de la zone de ${z.p.v}`;
  const fl = get('flotte');
  if (fl) s += has(fl.p.min) && !has(fl.p.max) ? ` avec une flotte de ${fl.p.min} véhicule${+fl.p.min > 1 ? 's' : ''} ou plus` : ` avec une flotte de ${span(fl.p.min, fl.p.max, 'véhicules')}`;
  const g = get('geo'); if (g) s += g.p.mode === 'dep' ? (g.p.deps.length ? ` habitant le ${ou(g.p.deps.map(depL))}` : '') : lst(g.p.txt).length ? (g.p.mode === 'cp' ? ` du ${ou(lst(g.p.txt))}` : ` habitant ${ou(lst(g.p.txt))}`) : '';
  const v: string[] = [];
  const mq = get('marque'), mo = get('modele'), en = get('energie'), pa = get('au_parc'), at = get('achat_type'), ag = get('age_vehicule');
  const mods = mo ? lst(mo.p.txt) : [];
  if (mq?.p.v?.length || mods.length) v.push(`en ${mods.length ? ou(mods) : ou(mq!.p.v.map(brandName))}`);
  if (en?.p.v?.length) v.push(ou(en.p.v.map((x: string) => x.toLowerCase())));
  if (ag && span(ag.p.min, ag.p.max, 'ans')) v.push(span(ag.p.min, ag.p.max, 'ans'));
  if (at?.p.v?.length) v.push(`achetés en ${ou(at.p.v.map((x: string) => SRC_L[x] || x))}`);
  if (pa) v.push(pa.p.v === 'oui' ? 'toujours à eux' : 'revendus depuis');
  if (v.length) s += `, ${v.join(' ')}`;
  const fam = get('fin_famille'), ech = get('fin_echeance'), org = get('fin_organisme'), ct = get('ct'), an = get('livraison', (b) => b.p.mode === 'anniv'), sa = get('sans_achat_depuis');
  const orgs: string[] = (org?.p.v || []).filter((x: string) => x !== 'Aucun');
  if (fam || ech) {
    const quand = !ech ? '' : ech.p.when === 'cours' ? ' est encore en cours' : ech.p.when === 'entre' ? ` se termine entre le ${dFR(ech.p.from)} et le ${dFR(ech.p.to)}` : ` se termine ${fenetre(ech.p.min, ech.p.max)}`;
    s += `, dont le contrat ${fam?.p.v?.length ? ou(fam.p.v) : 'de financement'}${orgs.length ? ` chez ${ou(orgs)}` : ''}${quand || ' est en cours ou terminé'}`;
  } else if (org?.p.v?.length === 1 && org.p.v[0] === 'Aucun') s += ', payés comptant';
  else if (orgs.length) s += `, financés chez ${ou(orgs)}`;
  if (ct) s += `, dont le contrôle technique tombe ${has(ct.p.min) && +ct.p.min > 0 ? `dans ${ct.p.min} à ${ct.p.max} mois` : `dans les ${has(ct.p.max) ? ct.p.max : '?'} mois`}`;
  if (an) s += `, livrés il y a ${has(an.p.n) ? an.p.n : '?'} ans (anniversaire à ± ${has(an.p.f) ? an.p.f : 30} jours)`;
  if (sa) s += `, sans achat depuis plus de ${has(sa.p.n) ? sa.p.n : '?'} ans`;
  const rest = pos.filter((b) => !used.has(b.id)).length, sauf = q.bricks.filter((b) => b.on && b.sauf && !TY[b.t]?.ui).length;
  if (rest) s += `, avec ${rest} autre${rest > 1 ? 's' : ''} condition${rest > 1 ? 's' : ''}`;
  if (sauf) s += `, hors ${sauf} exclusion${sauf > 1 ? 's' : ''}`;
  return s + '.';
}

// ---------------------------------------------------------------- détails : répartitions + aperçu
export function repere(q: Q, L: Ligne[]): [string, (l: Ligne) => string] {
  const want: [string, string] = hasT(q, 'fin_echeance', 'fin_famille', 'fin_duree', 'fin_ecoule') ? ['Fin de contrat', 'fin_fin'] : hasT(q, 'ct') ? ['Prochain CT', 'ct_prochain'] : hasT(q, 'livraison') ? ['Livré le', 'date_achat'] : ['Fin de contrat', 'fin_fin'];
  const [lb, k] = !L.length || want[1] in L[0] ? want : ['Fin de contrat', 'fin_fin'];
  return [lb, (l) => (l[k] ? dFR(l[k]) : '—')];
}
const Details: React.FC<{ q: Q; c: Compte; lignes: Ligne[] | null; onClient: (id: number) => void }> = ({ q, c, lignes, onClient }) => {
  const [tab, setTab] = useState<ResTab>('site');
  const rep = useMemo(() => {
    const ch = gx().chart, n0 = (v: number) => nf(v);
    if (tab === 'brand') return ch.hbars({ items: c.par_marque.map((x) => ({ label: x.cle === '—' ? '—' : brandName(x.cle), value: x.n, color: brandHex(x.cle) })), fmt: n0 });
    if (tab === 'nrj') return ch.hbars({ items: c.par_energie.map((x) => ({ label: x.cle, value: x.n })), fmt: n0 });
    const top = c.par_site.slice(0, 6), rest = Math.max(0, c.lignes - top.reduce((a, x) => a + x.n, 0));
    return ch.hbars({ items: [...top.map((x) => ({ label: x.cle, value: x.n })), ...(rest ? [{ label: 'Autres sites', value: rest, color: 'var(--text-3)' }] : [])], fmt: n0 });
  }, [c, tab]);
  const [rl, rf] = repere(q, lignes || []);
  return (<>
    <div className="card crm-panel" style={{ gap: 10 }}><div className="row wrap" style={{ justifyContent: 'space-between', gap: 8 }}><h3 className="crm-h2"><Icon name="pie" size="sm" /> Répartition</h3>
      <Seg<ResTab> value={tab} onChange={setTab} options={[['site', 'Sites'], ['brand', 'Marques'], ['nrj', 'Énergies']]} /></div>
      {c.lignes ? <div dangerouslySetInnerHTML={{ __html: rep }} /> : <div className="crm-note">—</div>}</div>
    <div className="card crm-panel" style={{ gap: 10, paddingLeft: 0, paddingRight: 0, paddingBottom: 6 }}>
      <div className="row" style={{ padding: '0 18px' }}><h3 className="crm-h2"><Icon name="list" size="sm" /> Aperçu <span className="n">{lignes ? `${lignes.length} lignes` : ''}</span></h3></div>
      {lignes?.length ? <div className="scroll"><table className="tbl rq-prev"><thead><tr><th>Client</th><th>Véhicule</th><th>{rl}</th><th>Contact</th></tr></thead>
        <tbody>{lignes.map((l, i) => (
          <tr key={`${l.client_id}-${i}`} onClick={() => onClient(Number(l.client_id))}>
            <td><div className="nm">{nomL(l)}</div><div className="sm">{[l.ville, l.site].filter(Boolean).join(' · ') || '—'}</div></td>
            <td><div className="row" style={{ gap: 6, whiteSpace: 'nowrap' }}>{l.marque ? <i className="brand-dot" style={cv(brandHex(l.marque))} /> : null}{l.modele || '—'}</div><div className="sm">{l.immat || '—'}</div></td>
            <td className="num" style={{ whiteSpace: 'nowrap' }}>{rf(l)}</td>
            <td style={{ whiteSpace: 'nowrap' }}><span className={l.email ? 'rq-ok' : 'rq-ko'}><Icon name="mail" size="sm" /></span> <span className={l.portable ? 'rq-ok' : 'rq-ko'}><Icon name="sms" size="sm" /></span></td></tr>))}</tbody></table></div>
        : <div className="crm-note" style={{ padding: '0 18px' }}>{lignes ? 'Aucun client ne correspond.' : 'Chargement…'}</div>}</div>
  </>);
};

// ---------------------------------------------------------------- le gros chiffre animé
const Num: React.FC<{ n: number }> = ({ n }) => {
  const ref = useRef<HTMLDivElement>(null), from = useRef<number | null>(null);
  useEffect(() => {
    const el = ref.current?.firstChild as Text | null, a = from.current; from.current = n;
    if (!el || a === null || a === n) return;
    const t0 = performance.now(); let raf = 0;
    const step = (t: number) => { const k = Math.min(1, (t - t0) / 420), e = 1 - Math.pow(1 - k, 3); el.textContent = nf(Math.round(a + (n - a) * e)); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [n]);
  return <div className="rq-big" ref={ref}>{nf(n)}</div>;
};

// ---------------------------------------------------------------- « En résumé »
const Resume: React.FC<{
  q: Q; c: Compte | null; lignes: Ligne[] | null; busy: boolean; err: string | null; saved: Enregistree | undefined;
  onExport: (f: Format) => void; onVoir: () => void; onSave: () => void; onClient: (id: number) => void;
}> = ({ q, c, lignes, busy, err, saved, onExport, onVoir, onSave, onClient }) => {
  const [det, setDet] = useState(false);
  const G = CANAL[q.canal], main = mainOf(q, c), veh = q.level === 'vehicule';
  const unit = veh && q.canal === 'tous' ? 'véhicules' : UNIT[q.canal];
  const ph = useMemo(() => phrase(q), [q]);
  const rec = REC[q.canal];
  const sans = c && G.key ? Math.max(0, c.entonnoir.total - c.entonnoir[G.key]) : 0, dup = c && G.key && q.dedupe ? c.doublons_retires : 0;
  const off = q.bricks.filter((b) => !b.on && !TY[b.t]?.ui).length;
  const prev = saved && typeof saved.dernier_compte === 'number' ? saved.dernier_compte : null;
  const choisir = (el: HTMLElement) => gx().menu.open(FMT_ORDER.map((k) => ({ label: `${FMT[k][0]}${REC[q.canal] === k ? ' (canal choisi)' : ''}`, action: () => onExport(k) })), el);
  return (
    <aside className="rq2-side">
      <div className="rq2-sum" style={busy ? { opacity: 0.65 } : undefined}>
        <span className="crm-lbl">En résumé{busy ? ' · calcul…' : ''}</span>
        {c ? <Num n={main} /> : <div className="rq-big">—</div>}
        <div className="rq2-unit">{unit}{c && q.canal !== 'tous' && !veh ? <span className="faint"> · sur {nf(c.avant_canal)} clients</span> : null}
          {c && prev !== null ? <span className="faint" data-tip={`Au dernier lancement${saved?.dernier_lancement ? ` (${dFR(saved.dernier_lancement)})` : ''}`}> · {main - prev >= 0 ? '+' : '−'}{nf(Math.abs(main - prev))} depuis le dernier lancement</span> : null}</div>
        <p className="rq2-phrase">{ph}</p>
        {c && G.key && (sans || dup) ? <div className="rq2-ec"><Icon name="info" size="sm" /><span><b>{nf(sans + dup)}</b> écartés : {[sans ? `${nf(sans)} ${SANS[q.canal as Exclude<Canal, 'tous'>]}` : '', dup ? `${nf(dup)} en double` : ''].filter(Boolean).join(', ')}</span></div> : null}
        {off ? <div className="rq2-ec"><Icon name="eye" size="sm" /><span>{off} condition{off > 1 ? 's' : ''} désactivée{off > 1 ? 's' : ''} : {off > 1 ? 'elles ne comptent' : 'elle ne compte'} pas.</span></div> : null}
        {err ? <div className="rq2-ec" style={cv('var(--danger)')}><Icon name="alert" size="sm" /><span>Le serveur n’a pas pu calculer ce résultat : {err}</span></div> : null}
        <div className="rq2-acts">
          {rec ? <button className="btn primary" disabled={!main || busy} onClick={() => onExport(rec)}><Ico name={FMT[rec][1]} />{EXP_L[rec]}</button>
            : <button className="btn primary" disabled={!main || busy} onClick={(e) => choisir(e.currentTarget)}><Icon name="download" size="sm" />Exporter…</button>}
          <button className="btn" disabled={!main} onClick={onVoir}><Icon name="list" size="sm" />Voir les {c ? nf(main) : ''} {veh ? 'lignes' : 'clients'}</button>
          <button className="btn" onClick={onSave}><Icon name="check" size="sm" />{saved ? 'Mettre à jour' : 'Enregistrer'}</button>
          {rec && rec !== 'excel' ? <button className="btn" disabled={!main || busy} onClick={() => onExport('excel')}><Ico name={FMT.excel[1]} />Exporter vers Excel</button> : null}
          {rec ? <button className="rq2-link" disabled={!main || busy} onClick={(e) => choisir(e.currentTarget)}>autre format…</button> : null}
        </div>
      </div>
      {c ? <button className="rq2-link" style={{ alignSelf: 'center' }} onClick={() => setDet(!det)}>{det ? 'Masquer les détails' : 'Voir les détails'}</button> : null}
      {det && c ? <Details q={q} c={c} lignes={lignes} onClient={onClient} /> : null}
    </aside>
  );
};
export default Resume;
