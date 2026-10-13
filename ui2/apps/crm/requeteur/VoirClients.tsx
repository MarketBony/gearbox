import React, { useEffect, useState } from 'react';
import { Icon } from '../../ui/kit';
import { db } from '../../../../services/dataService';
import { brandHex, dFR, nf, tel } from '../common';
import { CANAL, TY, sayOf, type Compte, type Ligne, type Q, type Requete } from './modele';
import type { SetQ } from './Briques';
import { civA } from './outils';

/**
 * « Voir les clients » (piste C) : les filtres en étiquettes supprimables, la barre de joignabilité, et le résultat en
 * TABLEAU paginé PAR LE SERVEUR (POST /requetes/lignes, 50 lignes par page). Un clic ouvre la fiche client.
 */

const cv = (c: string) => ({ '--c': c } as React.CSSProperties);
const TAILLE = 50;
const telL = (v: unknown) => { const t = String(v || '').replace(/\D/g, ''); return t ? tel(t) : ''; };

const VoirClients: React.FC<{
  q: Q; setQ: SetQ; req: Requete; reqKey: string; c: Compte | null; main: number; onBack: () => void; onClient: (id: number) => void;
}> = ({ q, setQ, req, reqKey, c, main, onBack, onClient }) => {
  const [page, setPage] = useState(0);
  const [tri, setTri] = useState<'recent' | 'flotte' | 'nom' | 'echeance'>('recent');
  const [rows, setRows] = useState<Ligne[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setPage(0); }, [reqKey, tri]);
  useEffect(() => {
    const ac = new AbortController(); let alive = true;
    setRows(null); setErr(null);
    db.getCrmLignes(req, page, ac.signal, tri).then((r) => { if (alive) setRows(r?.lignes || []); })
      .catch((e) => { if (alive && !ac.signal.aborted) setErr(e?.message || 'Chargement impossible.'); });
    return () => { alive = false; ac.abort(); };
  }, [reqKey, page, tri]); // eslint-disable-line react-hooks/exhaustive-deps

  const tags = q.bricks.filter((b) => b.on && TY[b.t] && !TY[b.t].ui && TY[b.t].out?.(b.p));
  const pages = Math.max(1, Math.ceil(main / TAILLE));
  const G = CANAL[q.canal];
  return (
    <div className="rq2-vc">
      <div className="rq2-vch">
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}><button className="btn" onClick={onBack}><Icon name="back" size="sm" />Retour aux questions</button>
          <h2 className="crm-h2" style={{ margin: 0 }}>{q.name}</h2></div>
        <div className="rq2-chips">
          {tags.map((b) => <span key={b.id} className={`rq2-chip ${b.sauf ? 'sauf' : ''}`}>{b.sauf ? null : <span className="faint">{TY[b.t].l} :</span>}<span className="v">{sayOf(b)}</span>
            <button aria-label="Retirer ce filtre" onClick={() => setQ((x) => ({ ...x, from: null, bricks: x.bricks.filter((y) => y.id !== b.id) }))}><Icon name="close" size="sm" /></button></span>)}
          {G.key ? <span className="rq2-chip canal"><span className="faint">Canal :</span><span className="v">{G.l}</span><button aria-label="Retirer le canal" onClick={() => setQ((x) => ({ ...x, canal: 'tous' }))}><Icon name="close" size="sm" /></button></span> : null}
          <button className="rq2-chip add" onClick={onBack}><Icon name="plus" size="sm" />Filtre</button></div>
        {c ? <div className="rq2-bar"><b>{nf(main)}</b> {q.level === 'vehicule' ? 'lignes' : 'clients'} · <b>{nf(c.entonnoir.email)}</b> e-mail · <b>{nf(c.entonnoir.portable)}</b> portable · <b>{nf(c.entonnoir.telephone)}</b> téléphone · <b>{nf(c.entonnoir.adresse)}</b> adresse
          {G.key ? <span className="faint"> (avant le canal {G.l})</span> : null}</div> : null}
        <div className="rq2-row"><span className="rq2-lbl">trier par</span>
          <select className="select" value={tri} onChange={(e) => setTri(e.target.value as typeof tri)} aria-label="Trier les clients">
            <option value="recent">Achat le plus récent</option><option value="flotte">Taille de flotte (la plus grande d’abord)</option>
            <option value="echeance">Échéance de financement la plus proche</option><option value="nom">Nom (A → Z)</option></select></div>
      </div>
      <div className="scroll rq2-tbl">
        {err ? <div className="empty" style={{ padding: 30 }}><Icon name="alert" />{err}</div>
          : !rows ? <div className="empty" style={{ padding: 30 }}>Chargement…</div>
          : !rows.length ? <div className="empty" style={{ padding: 30 }}><Icon name="filter" />Aucun client ne correspond.</div>
          : <table className="tbl rq-prev"><thead><tr><th>Client</th><th>Lieu</th><th>Véhicule</th><th>Financement</th><th>Prochain CT</th><th>Achat</th><th>Contact</th><th>Vendeur</th><th className="num" data-tip="Véhicules encore au parc">Flotte</th></tr></thead>
            <tbody>{rows.map((l, i) => (
              <tr key={`${l.client_id}-${i}`} onClick={() => onClient(Number(l.client_id))}>
                <td><div className="nm">{[civA(l.civilite), l.nom, l.prenom].filter(Boolean).join(' ') || 'Sans nom'}</div></td>
                <td><div>{l.ville || '—'}</div><div className="sm">{l.site || ''}</div></td>
                <td><div className="row" style={{ gap: 6, whiteSpace: 'nowrap' }}>{l.marque ? <i className="brand-dot" style={cv(brandHex(l.marque))} /> : null}{l.modele || '—'}</div><div className="sm">{l.immat || ''}</div></td>
                <td>{l.fin_famille ? <><div>{l.fin_famille}{l.fin_organisme ? <span className="faint"> · {l.fin_organisme}</span> : null}</div><div className="sm">{l.fin_fin ? `fin ${dFR(l.fin_fin)}` : ''}</div></> : <span className="faint">—</span>}</td>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>{l.ct_prochain ? dFR(l.ct_prochain) : '—'}</td>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>{l.date_achat ? dFR(l.date_achat) : '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}><div className="sm" style={{ color: 'var(--text-2)' }}>{l.email || ''}</div><div className="sm">{telL(l.portable) || telL(l.fixe)}</div></td>
                <td style={{ whiteSpace: 'nowrap' }}>{l.vendeur || '—'}</td><td className="num">{l.nb_parc ?? '—'}</td></tr>))}</tbody></table>}
      </div>
      <div className="crm-pager"><button className="btn sm" disabled={page <= 0} onClick={() => setPage(page - 1)}><Icon name="chevleft" size="sm" />Précédent</button>
        <span className="grow">Page {page + 1} / {nf(pages)} · {TAILLE} lignes par page · un clic ouvre la fiche</span>
        <button className="btn sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Suivant<Icon name="chevron" size="sm" /></button></div>
    </div>
  );
};
export default VoirClients;
