import React from 'react';
import { Icon, Seg } from '../../ui/kit';
import { dFR, nf, today } from '../common';
import { CANAL, RECIPES, RULE_AGENT, type Enregistree, type ExportJ } from './modele';
import { FMT, Ico } from './outils';

/**
 * Colonne de gauche : Recettes (en dur, format du contrat), Mes requêtes (GET /requetes), Historique des exports
 * (GET /exports). Maquette : `libHTML` / `jrHTML`. Rendue aussi dans un volet en largeur moyenne (`inSheet`).
 */

export type LibF = 'all' | 'me' | 'team';
const cv = (c: string) => ({ '--c': c } as React.CSSProperties);
export const quandJ = (iso: string) => {
  const d = new Date(iso); if (isNaN(+d)) return '—';
  const j = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const t = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return j === today() ? `aujourd’hui ${t}` : `${dFR(j)} ${t}`;
};

export const JournalRow: React.FC<{ j: ExportJ }> = ({ j }) => (
  <div className="rq-jr"><span className="ic"><Ico name={FMT[j.format]?.[1] || 'file'} /></span><div className="grow" style={{ minWidth: 0 }}>
    <div><b>{j.auteur}</b> · {FMT[j.format]?.[0] || j.format} · <b className="num">{nf(j.nb_lignes)}</b> lignes</div>
    <div className="faint ellipsis">« {j.requete_nom || j.fichier} » · {quandJ(j.cree_le)}</div></div></div>
);

const Bibliotheque: React.FC<{
  part?: 'recettes' | 'mes'; strip?: boolean; inSheet?: boolean; from: string | null; savedId: number | null; userId: string;
  counts: Record<string, number>; saved: Enregistree[] | null; savedErr: string | null; journal: ExportJ[] | null;
  libF: LibF; setLibF: (v: LibF) => void; onRecipe: (id: string) => void; onSaved: (s: Enregistree) => void; onJournal: () => void;
}> = ({ part, strip = false, inSheet, from, savedId, userId, counts, saved, savedErr, journal, libF, setLibF, onRecipe, onSaved, onJournal }) => {
  const mine = (s: Enregistree) => String(s.auteur_id) === String(userId);
  const sv = (saved || []).filter((s) => libF === 'all' || (libF === 'me' ? mine(s) && !s.partagee : s.partagee));
  const open = !strip || inSheet;
  return (
    <>
      {part === 'mes' ? null : <div className="rq-sec"><div className="row" style={{ justifyContent: 'space-between' }}><h3 className="crm-h2"><Icon name="star" size="sm" /> Recettes</h3><span className="crm-note">≈ clients au dernier import</span></div>
        <div className="rq-hint" style={{ padding: '9px 11px', fontSize: 12.5, gap: 9 }}><Icon name="handshake" size="sm" /><div>{RULE_AGENT}</div></div>
        <div className={`rq-rcs ${strip && !inSheet ? 'strip' : ''}`}>{RECIPES.map((r) => (
          <button key={r.id} className={`rq-rc ${from === r.id ? 'on' : ''}`} style={cv(r.c)} onClick={() => onRecipe(r.id)}>
            <span className="ico"><Icon name={r.i} size="sm" /></span><span className="tx"><span className="t">{r.l}</span><span className="d">{r.d}</span></span>
            <span className="k" data-tip="Estimation, clients">{typeof counts[r.id] === 'number' ? `≈ ${nf(counts[r.id])}` : '≈ …'}</span></button>))}</div></div>}
      {part === 'recettes' ? null : <>
      <details className="rq-sec" open={open}><summary><h3 className="crm-h2"><Icon name="file" size="sm" /> Mes requêtes <span className="n">{saved ? saved.length : ''}</span></h3><span className="chev"><Icon name="chevron" size="sm" /></span></summary>
        <Seg<LibF> value={libF} onChange={setLibF} className="rq-full" options={[['all', 'Toutes'], ['me', 'Perso'], ['team', 'Partagées']]} />
        <div className="rq-rcs">{savedErr ? <div className="crm-note"><Icon name="alert" size="sm" /> {savedErr}</div>
          : !saved ? <div className="crm-note">Chargement…</div>
          : sv.length ? sv.map((s) => (
            <button key={s.id} className={`rq-rc ${savedId === s.id ? 'on' : ''}`} style={cv(s.partagee ? 'var(--info)' : 'var(--text-3)')} onClick={() => onSaved(s)}>
              <span className="ico"><Icon name={s.partagee ? 'users' : 'user'} size="sm" /></span>
              <span className="tx"><span className="t">{s.nom}</span><span className="d">{s.auteur} · {dFR(s.maj_le)} · {CANAL[s.requete?.canal]?.l || 'Tous'}</span></span>
              <span className="k" data-tip={s.dernier_lancement ? `Résultat au dernier lancement (${dFR(s.dernier_lancement)})` : 'Pas encore lancée'}>{typeof s.dernier_compte === 'number' ? nf(s.dernier_compte) : '—'}</span></button>))
          : <div className="crm-note">Aucune requête ici.</div>}</div></details>
      <details className="rq-sec" open={open}><summary><h3 className="crm-h2"><Icon name="clock" size="sm" /> Historique des exports</h3><span className="chev"><Icon name="chevron" size="sm" /></span></summary>
        <div>{!journal ? <div className="crm-note">Chargement…</div> : journal.length ? journal.slice(0, 5).map((j) => <JournalRow key={j.id} j={j} />) : <div className="crm-note">Aucun export pour l’instant.</div>}</div>
        <button className="crm-link" style={{ alignSelf: 'flex-start' }} onClick={onJournal}>Tout l’historique{journal ? ` (${journal.length})` : ''}</button></details></>}
    </>
  );
};
export default Bibliotheque;
