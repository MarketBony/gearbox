import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BrandChips, Icon, gx, hud } from '../ui/kit';
import { db } from '../../../services/dataService';
import { type Fiche as FicheT, type Paire, VhPill, brandName, dFR, nf, tel } from './common';

/**
 * File d'arbitrage : GET /arbitrage?offset= (5 paires par lot), POST /arbitrage { a, b, decision }.
 * « Plus tard » passe à la paire suivante SANS rien enregistrer : la paire reste dans la file du serveur, d'où
 * l'`offset` du lot suivant = nombre de paires reportées. Raccourcis F / S / P. Maquette : `arbBuild` / `decide`.
 */

type Dec = 'merge' | 'split' | 'later';
const DEC_API: Record<Exclude<Dec, 'later'>, 'fusion' | 'separation'> = { merge: 'fusion', split: 'separation' };
const norm = (s: string | null | undefined) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const portable = (f: FicheT) => f.contacts.find((k) => k.type === 'portable');
const email = (f: FicheT) => f.contacts.find((k) => k.type === 'email');
const adresse = (f: FicheT) => [f.client.num_rue, f.client.type_rue, f.client.rue].filter(Boolean).join(' ');
const vehTxt = (f: FicheT) => { const v = f.client.vehicule; return v ? [[brandName(v.marque), v.modele].filter(Boolean).join(' '), v.immat].filter(Boolean).join(' · ') : '—'; };
const idTxt = (f: FicheT) => f.identites.map((x) => `${x.source} · ${x.societe} · ${x.numero}`).join(' / ') || '—';

const Side: React.FC<{ f: FicheT; lbl: string }> = ({ f, lbl }) => {
  const c = f.client, id0 = f.identites[0], v = c.vehicule;
  return (
    <div className="card crm-panel" style={{ gap: 10 }}>
      <div className="row wrap">{id0 ? <><VhPill source={id0.source} /><b>{id0.societe}</b><span className="crm-mono faint">{id0.numero}</span></> : <VhPill source={c.source_derniere} />}
        {f.identites.length > 1 ? <span className="faint">+{f.identites.length - 1}</span> : null}<span className="grow" /><span className="crm-tag">{lbl}</span></div>
      <div style={{ fontWeight: 700, fontSize: 16 }}>{[c.civilite_dcs, c.nom, c.prenom].filter(Boolean).join(' ') || 'Sans nom'}</div>
      <div className="muted" style={{ fontSize: 13 }}>{[adresse(f), [c.cp, c.ville].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || 'Adresse inconnue'}</div>
      {v ? <div className="row wrap" style={{ gap: 6 }}>{v.marque ? <BrandChips brands={[brandName(v.marque)]} /> : null}<span style={{ fontSize: 13 }}>{[v.modele, v.immat].filter(Boolean).join(' · ')}</span></div> : null}
      <div className="crm-note">Dernière vente le {dFR(c.derniere_vente)}{c.site ? ` · ${c.site}` : ''}{c.vendeur ? ` · ${c.vendeur}` : ''}</div>
    </div>
  );
};

const ArbitrageView: React.FC<{ onTotal: (n: number) => void; keyRef: React.MutableRefObject<((e: React.KeyboardEvent) => void) | null> }> = ({ onTotal, keyRef }) => {
  const [queue, setQueue] = useState<Paire[] | null>(null);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ p: Paire; dec: Dec }[]>([]);
  const skipped = useRef(0), pairRef = useRef<HTMLDivElement>(null), animate = useRef(false);

  const load = useCallback(() => {
    setErr(null);
    db.getCrmArbitrage(skipped.current)
      .then((r) => { setQueue(r.paires ?? []); setTotal(r.total ?? 0); onTotal(r.total ?? 0); })
      .catch((e) => setErr(e.message || 'File d’arbitrage indisponible.'));
  }, [onTotal]);
  useEffect(() => { load(); }, [load]);

  const p = queue?.[0];
  useLayoutEffect(() => {
    if (!animate.current) return; animate.current = false;
    const el = pairRef.current; if (el) gx().animate(el, [{ opacity: 0, transform: 'translateX(18px)' }, { opacity: 1, transform: 'none' }], { spring: 'soft' });
  }, [p]);

  const next = (rest: Paire[]) => { animate.current = true; if (rest.length) setQueue(rest); else { setQueue(null); load(); } };
  const decide = (dec: Dec) => {
    if (!p || busy || !queue) return;
    const rest = queue.slice(1);
    if (dec === 'later') { skipped.current++; setDone((d) => [...d, { p, dec }]); hud('Reporté : rien n’est enregistré'); return next(rest); }
    setBusy(true);
    db.decideCrmArbitrage(p.a.client.id, p.b.client.id, DEC_API[dec])
      .then(() => {
        setDone((d) => [...d, { p, dec }]); setTotal((t) => { const n = Math.max(0, t - 1); onTotal(n); return n; });
        hud(dec === 'merge' ? 'Fusionnés · rejoué à chaque import' : 'Séparés · ne seront plus proposés');
        next(rest);
      })
      .catch((e) => hud(e.message || 'Décision refusée.'))
      .finally(() => setBusy(false));
  };
  const jump = (k: number) => { if (!queue) return; const q = queue.slice(); const [x] = q.splice(k, 1); q.unshift(x); animate.current = true; setQueue(q); };

  keyRef.current = (e) => { const k = ({ f: 'merge', s: 'split', p: 'later' } as Record<string, Dec>)[e.key.toLowerCase()]; if (k) { e.preventDefault(); decide(k); } };

  if (err) return <div className="empty" style={{ height: '100%' }}><Icon name="alert" />{err}<button className="btn sm" onClick={load}>Réessayer</button></div>;
  if (!queue) return <div className="empty" style={{ height: '100%' }}>Chargement de la file…</div>;

  const pa = p ? portable(p.a) : undefined, pb = p ? portable(p.b) : undefined, sus = pa?.etat === 'suspect' || pb?.etat === 'suspect';
  const cmp: [string, string, string, boolean?][] = p ? [
    ['Nom', p.a.client.nom || '—', p.b.client.nom || '—'], ['Prénom', p.a.client.prenom || '—', p.b.client.prenom || '—'], ['Code postal', p.a.client.cp || '—', p.b.client.cp || '—'],
    ['Adresse', adresse(p.a) || '—', adresse(p.b) || '—'],
    ['Portable', pa ? tel(pa.valeur) + (pa.etat === 'suspect' ? ' ⚠' : '') : '—', pb ? tel(pb.valeur) + (pb.etat === 'suspect' ? ' ⚠' : '') : '—', sus],
    ['E-mail', email(p.a)?.valeur || '—', email(p.b)?.valeur || '—'], ['Véhicule', vehTxt(p.a), vehTxt(p.b)], ['Identité DCS', idTxt(p.a), idTxt(p.b)],
  ] : [];
  const decided = done.filter((d) => d.dec !== 'later').length;
  const pos = done.length + 1, sur = total + decided;

  return (
    <div className="scroll" style={{ height: '100%' }}><div className="crm-arb">
      <div className="crm-arbm" ref={pairRef}>{p ? <>
        <div className="crm-arbh"><h2 className="crm-h2">Paire {nf(pos)} <span className="n">sur {nf(sur)}</span></h2><span className="grow" />{p.a.client.site ? <span className="crm-note">Site : {p.a.client.site}</span> : null}</div>
        <div className="crm-why"><Icon name="info" /><div><b>Pourquoi cette paire ?</b> {p.raison}<div className="crm-note" style={{ marginTop: 4 }}>Règle § 4.3 : proposé, jamais appliqué automatiquement. Votre décision est enregistrée et rejouée à chaque import.</div></div></div>
        <div className="grid2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12 }}><Side f={p.a} lbl="Identité A" /><Side f={p.b} lbl="Identité B" /></div>
        <div className="card scroll"><table className="crm-cmp"><thead><tr><th>Champ</th><th>Identité A</th><th /><th>Identité B</th></tr></thead><tbody>
          {cmp.map(([l, a, b, s]) => { const eq = norm(a) === norm(b); return (
            <tr key={l} className={s ? 'sus' : eq ? 'eq' : 'ne'}><td>{l}</td><td className="v">{a}</td>
              <td className="mk v">{s ? <span style={{ color: 'var(--danger)' }} data-tip="Coordonnée suspecte : ignorée pour rapprocher"><Icon name="alert" size="sm" /></span> : eq ? <span style={{ color: 'var(--ok)' }}><Icon name="check" size="sm" /></span> : <span style={{ color: 'var(--warn)' }} data-tip="Différent">≠</span>}</td>
              <td className="v">{b}</td></tr>); })}
        </tbody></table></div>
        <div className="crm-acts"><span className="crm-note grow">Raccourcis : F fusionner · S séparer · P plus tard</span>
          <button className="btn" disabled={busy} onClick={() => decide('later')}><Icon name="clock" size="sm" />Plus tard<span className="crm-kbd">P</span></button>
          <button className="btn" disabled={busy} onClick={() => decide('split')}><Icon name="close" size="sm" />Séparer<span className="crm-kbd">S</span></button>
          <button className="btn primary" disabled={busy} onClick={() => decide('merge')}><Icon name="check" size="sm" />Fusionner<span className="crm-kbd">F</span></button></div>
      </> : <div className="empty" style={{ padding: '60px 20px' }}><Icon name="check" /><b style={{ color: 'var(--text)', fontSize: 15 }}>Plus rien à arbitrer</b>
        <span className="crm-note">{skipped.current ? `${nf(skipped.current)} paire${skipped.current > 1 ? 's' : ''} reportée${skipped.current > 1 ? 's' : ''} dans cette session : elles reviendront à la prochaine ouverture.` : 'Les doublons proposés apparaîtront ici après le prochain import.'}</span>
        {skipped.current ? <button className="btn sm" onClick={() => { skipped.current = 0; setDone((d) => d.filter((x) => x.dec !== 'later')); setQueue(null); load(); }}>Revoir les paires reportées</button> : null}</div>}
      </div>
      <aside className="crm-arbm">
        <div className="card crm-panel"><h3 className="crm-h2">À suivre <span className="n">{Math.max(0, queue.length - 1)}</span></h3><div className="crm-q">
          {queue.slice(1, 7).map((x, k) => <div key={`${x.a.client.id}-${x.b.client.id}`} className="list-row" onClick={() => jump(k + 1)}><Icon name="users" size="sm" /><span className="grow ellipsis"><b>{x.a.client.nom} {x.a.client.prenom}</b> <span className="faint">· {x.a.client.cp}</span></span><VhPill source={x.a.identites[0]?.source ?? x.a.client.source_derniere} /><VhPill source={x.b.identites[0]?.source ?? x.b.client.source_derniere} /></div>)}
          {queue.length <= 1 ? <div className="crm-note">{total > queue.length ? 'Le lot suivant se charge après cette paire.' : '—'}</div> : null}</div></div>
        <div className="card crm-panel"><h3 className="crm-h2">Décisions de la session <span className="n">{done.length}</span></h3><div className="crm-q">
          {done.slice().reverse().slice(0, 8).map((d, i) => <div key={i} className="list-row">{d.dec === 'merge' ? <span style={{ color: 'var(--ok)' }}><Icon name="check" size="sm" /></span> : d.dec === 'split' ? <span style={{ color: 'var(--warn)' }}><Icon name="close" size="sm" /></span> : <span className="faint"><Icon name="clock" size="sm" /></span>}
            <span className="grow ellipsis">{d.p.a.client.nom} {d.p.a.client.prenom} <span className="faint">· {{ merge: 'fusionnés', split: 'séparés', later: 'reporté' }[d.dec]}</span></span></div>)}
          {!done.length ? <div className="crm-note">Aucune pour l’instant.</div> : null}</div>
          <div className="crm-note">Fusion : le client le plus ancien garde son identifiant SPARK, l’autre est journalisé. Séparation : les deux ne seront plus proposés ensemble.</div></div>
      </aside>
    </div></div>
  );
};
export default ArbitrageView;
