import React, { useEffect, useState } from 'react';
import { Icon, hud } from '../../ui/kit';
import { db } from '../../../../services/dataService';
import { type Fiche as FicheT, type Echange, dFR, nameOf, today } from '../common';
import { type Vendeur, FONCTIONS, ORIGINES, equipes, nomV, statut } from './modele';

/**
 * Fiche client, couche Bony (lot 4) : badge du portefeuille et de l'agent, bandeau « ne plus contacter », onglet Échanges,
 * volets « Vendeur du portefeuille » et « Ne plus contacter ». Maquette : maquettes/crm/v2/equipes.js (pfBadge, nplcSheet, echHTML).
 */
type Open = (render: (close: (v?: unknown) => void) => React.ReactNode, opts?: { width?: number }) => unknown;
const cv = (c: string) => ({ '--c': c } as React.CSSProperties);
export const CANAUX: [string, string, string][] = [['email', 'E-mail', 'mail'], ['sms', 'SMS', 'sms'], ['tel', 'Téléphone', 'message'], ['courrier', 'Courrier', 'file']];

/** Agent (intermédiaire) du dernier achat retenu : seconde variable du client, sans effet sur le portefeuille. */
export const agentDe = (f: FicheT) => f.ventes.filter((v) => v.retenue).sort((a, b) => ((b.date_livraison || b.date_commande || '').localeCompare(a.date_livraison || a.date_commande || '')))[0]?.intermediaire || null;

export const PfBadges: React.FC<{ f: FicheT }> = ({ f }) => {
  const p = f.bony?.portefeuille, agent = agentDe(f);
  const pf = p
    ? <span className="badge" style={cv(p.vendeur ? 'var(--bony-violet)' : 'var(--warn)')} data-tip={`${ORIGINES[p.origine] || p.origine}${p.detail ? ` · ${p.detail}` : ''}${p.verrou ? ' · verrouillé' : ''} · depuis le ${dFR(p.depuis)}`}>
        <Icon name={p.verrou ? 'lock' : 'handshake'} size="sm" />Portefeuille : {p.vendeur || 'à attribuer'}{['regle', 'societes', 'secteur', 'hall'].includes(p.origine) ? <span style={{ opacity: 0.7 }}> · réattribué</span> : null}</span>
    : f.client.vendeur ? <span className="badge" style={cv('var(--bony-violet)')} data-tip={f.bony?.portefeuille_actif ? 'Hors portefeuille (dernier achat trop ancien)' : 'Portefeuilles pas encore calculés : vendeur du dernier achat'}><Icon name="handshake" size="sm" />Vendeur du dernier achat : {f.client.vendeur}</span> : null;
  return <>{pf}{agent ? <span className="badge" style={cv('var(--text-3)')} data-tip="Seconde variable : l’agent a vendu, le client reste au portefeuille de notre vendeur"><Icon name="building" size="sm" />Vendu via {agent}</span> : null}</>;
};

export const RefusBanner: React.FC<{ f: FicheT; onEdit: () => void }> = ({ f, onEdit }) => {
  const r = f.bony?.refus || [];
  if (!r.length) return null;
  const tout = r.find((x) => x.canal === 'tout');
  if (tout) return <div className="crm-stop"><Icon name="belloff" /><div className="grow"><b>Ne plus contacter</b> — {tout.motif || 'sans motif'}. Saisi par {tout.par || '—'} le {dFR(tout.le)}. Exclu de toutes les listes et de tous les exports ; aucun import ne lève ce statut.</div><button className="btn sm" onClick={onEdit}>Modifier</button></div>;
  return <div className="crm-stop warn"><Icon name="belloff" /><div className="grow"><b>Refuse :</b> {r.map((x) => CANAUX.find((c) => c[0] === x.canal)?.[1]).join(', ')}{r[0].motif ? ` (${r[0].motif})` : ''}. Exclu des exports sur ces canaux.</div><button className="btn sm" onClick={onEdit}>Modifier</button></div>;
};

// ---------------------------------------------------------------- Volet « Vendeur du portefeuille »
const PfSheet: React.FC<{ f: FicheT; close: (v?: unknown) => void; onChanged: () => void }> = ({ f, close, onChanged }) => {
  const [V, setV] = useState<Vendeur[] | null>(null);
  const p = f.bony?.portefeuille;
  const [sel, setSel] = useState<string>(p?.vendeur_id ? String(p.vendeur_id) : '');
  const [lock, setLock] = useState(!!p?.verrou);
  const [busy, setBusy] = useState(false);
  useEffect(() => { equipes().then((e) => setV(e.vendeurs.filter((v) => !['sorti', 'archive'].includes(statut(v))))).catch(() => setV([])); }, []);
  const site = f.client.site;
  const groupes = V ? [...(site ? [[`${site}`, V.filter((v) => v.site === site)]] : []), ['Autres sites', V.filter((v) => v.site !== site)]] as [string, Vendeur[]][] : [];
  const ok = () => {
    setBusy(true);
    db.saveCrmPortefeuille(f.client.id, { vendeur_id: sel ? Number(sel) : null, verrou: lock })
      .then(() => { hud('Portefeuille mis à jour'); close('ok'); onChanged(); }).catch((e) => { setBusy(false); hud(e.message || 'Enregistrement refusé.'); });
  };
  return <>
    <div className="label" style={{ color: 'var(--bony-violet)' }}>Portefeuille</div><h3 style={{ margin: '2px 0 8px' }}>Vendeur de {nameOf(f.client)}</h3>
    <div className="muted" style={{ lineHeight: 1.5 }}>Actuellement : <b style={{ color: 'var(--text)' }}>{p?.vendeur || (p ? 'à attribuer' : f.client.vendeur || '—')}</b>. Par défaut, le vendeur du dernier achat ; réattribué automatiquement si le vendeur part.</div>
    <label className="field" style={{ marginTop: 14 }}><span className="label">Vendeur</span>
      <select className="select" value={sel} onChange={(e) => setSel(e.target.value)} disabled={!V}>
        <option value="">{V ? '— À attribuer —' : 'Chargement…'}</option>
        {groupes.map(([g, L]) => <optgroup key={g} label={g}>{L.sort((a, b) => a.nom.localeCompare(b.nom)).map((v) => <option key={v.id} value={v.id}>{nomV(v)} · {v.site} · {v.service} {FONCTIONS[v.fonction].l}{statut(v) === 'arrive' ? ` (arrive le ${dFR(v.entree)})` : ''}</option>)}</optgroup>)}
      </select></label>
    <label className="row" style={{ gap: 8, marginTop: 10 }}><input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} /> Verrouiller : le recalcul automatique ne le changera plus</label>
    {f.bony?.historique.length ? <><div className="crm-lbl" style={{ marginTop: 14 }}>Historique</div><div className="crm-rel" style={{ marginTop: 6 }}>{f.bony.historique.slice(0, 5).map((h, i) => <div key={i}><Icon name="swap" size="sm" /><span className="grow">{h.de || '—'} → <b>{h.vers || 'à attribuer'}</b>{h.detail ? ` · ${h.detail}` : ''}</span><span className="faint">{dFR(h.le)}</span></div>)}</div></> : null}
    <div className="foot"><button className="btn" onClick={() => close()}>Annuler</button><button className="btn primary" disabled={busy || !V} onClick={ok}>Enregistrer</button></div>
  </>;
};
export const ouvrirPortefeuille = (open: Open, f: FicheT, onChanged: () => void) => open((close) => <PfSheet f={f} close={close} onChanged={onChanged} />, { width: 520 });

// ---------------------------------------------------------------- Volet « Ne plus contacter »
const MOTIFS = ['Demande du client', 'Désinscription (STOP, lien e-mail)', 'Client décédé', 'Litige en cours', 'Autre'];
const RefusSheet: React.FC<{ f: FicheT; close: (v?: unknown) => void; onChanged: () => void }> = ({ f, close, onChanged }) => {
  const r = f.bony?.refus || [];
  const [tout, setTout] = useState(r.some((x) => x.canal === 'tout'));
  const [can, setCan] = useState<string[]>(r.filter((x) => x.canal !== 'tout').map((x) => x.canal));
  const [motif, setMotif] = useState(r[0]?.motif || MOTIFS[0]);
  const [busy, setBusy] = useState(false);
  const ok = () => {
    setBusy(true);
    db.saveCrmRefus(f.client.id, { canaux: tout ? ['tout'] : can, motif: tout || can.length ? motif : null })
      .then(() => { hud(tout ? 'Ne plus contacter : tous canaux' : can.length ? 'Canaux refusés enregistrés' : 'Contact rétabli'); close('ok'); onChanged(); })
      .catch((e) => { setBusy(false); hud(e.message || 'Enregistrement refusé.'); });
  };
  return <>
    <div className="label" style={{ color: 'var(--danger)' }}>Ne plus contacter</div><h3 style={{ margin: '2px 0 8px' }}>{nameOf(f.client)}</h3>
    <div className="muted" style={{ lineHeight: 1.5 }}>Le client sort automatiquement de tous les exports et de tous les comptages du Requêteur, sur les canaux cochés. Aucun import ne lève ce statut.</div>
    <label className="row" style={{ gap: 8, marginTop: 12, fontWeight: 600 }}><input type="checkbox" checked={tout} onChange={(e) => setTout(e.target.checked)} /> Ne plus contacter du tout</label>
    <div className="eq-canaux">{CANAUX.map(([k, l, i]) => <label key={k} style={tout ? { opacity: 0.5 } : undefined}><input type="checkbox" disabled={tout} checked={tout || can.includes(k)} onChange={(e) => setCan((c) => (e.target.checked ? [...c, k] : c.filter((x) => x !== k)))} /><Icon name={i} size="sm" />{l}</label>)}</div>
    <label className="field" style={{ marginTop: 12 }}><span className="label">Motif</span><select className="select" value={motif} onChange={(e) => setMotif(e.target.value)}>{[...new Set([...MOTIFS, motif])].map((m) => <option key={m}>{m}</option>)}</select></label>
    <div className="foot"><button className="btn" onClick={() => close()}>Annuler</button><button className="btn primary" style={{ background: 'var(--danger)' }} disabled={busy} onClick={ok}>Enregistrer</button></div>
  </>;
};
export const ouvrirRefus = (open: Open, f: FicheT, onChanged: () => void) => open((close) => <RefusSheet f={f} close={close} onChanged={onChanged} />, { width: 500 });

// ---------------------------------------------------------------- Onglet Échanges
const TYPES: Record<Echange['type'], [string, string]> = { appel: ['Appel', 'message'], email: ['E-mail', 'mail'], sms: ['SMS', 'sms'], visite: ['Visite', 'users'], note: ['Note', 'edit'] };
const RESULTATS = ['Intéressé', 'Projet d’achat', 'À rappeler', 'Pas intéressé', 'Injoignable', 'Information'];
const EchSheet: React.FC<{ f: FicheT; close: (v?: unknown) => void; onChanged: () => void }> = ({ f, close, onChanged }) => {
  const [e, setE] = useState({ type: 'appel', le: today(), resultat: RESULTATS[0], rappel: '', texte: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof e) => (x: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setE({ ...e, [k]: x.target.value });
  const ok = () => {
    setBusy(true);
    db.addCrmEchange(f.client.id, { ...e, rappel: e.rappel || null }).then(() => { hud('Échange enregistré'); close('ok'); onChanged(); })
      .catch((er) => { setBusy(false); hud(er.message || 'Enregistrement refusé.'); });
  };
  return <>
    <h3>Noter un échange</h3>
    <div className="eq-form">
      <label className="field"><span className="label">Type</span><select className="select" value={e.type} onChange={set('type')}>{Object.entries(TYPES).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="field"><span className="label">Date</span><input className="input" type="date" value={e.le} onChange={set('le')} /></label>
      <label className="field"><span className="label">Résultat</span><select className="select" value={e.resultat} onChange={set('resultat')}>{RESULTATS.map((x) => <option key={x}>{x}</option>)}</select></label>
      <label className="field"><span className="label">Rappeler le</span><input className="input" type="date" value={e.rappel} onChange={set('rappel')} /></label>
      <label className="field full"><span className="label">Compte rendu</span><textarea className="input" rows={4} value={e.texte} onChange={set('texte')} placeholder="Ce qui a été dit, le projet du client…" /></label>
    </div>
    <div className="foot"><button className="btn" onClick={() => close()}>Annuler</button><button className="btn primary" disabled={busy} onClick={ok}>Enregistrer</button></div>
  </>;
};
export const EchangesTab: React.FC<{ f: FicheT; open: Open; userId: string; isMaster: boolean; onChanged: () => void }> = ({ f, open, userId, isMaster, onChanged }) => {
  const L = f.bony?.echanges || [];
  const suppr = (x: Echange) => db.deleteCrmEchange(f.client.id, x.id).then(() => { hud('Échange supprimé'); onChanged(); }).catch((e) => hud(e.message || 'Suppression refusée.'));
  return (
    <div className="crm-sec">
      <div className="row" style={{ gap: 10 }}><h3 className="crm-h2 grow">Échanges <span className="n">{L.length}</span></h3>
        <button className="btn sm primary" onClick={() => open((close) => <EchSheet f={f} close={close} onChanged={onChanged} />, { width: 560 })}><Icon name="plus" size="sm" />Noter un échange</button></div>
      <div className="crm-note">Appels, e-mails, visites et notes. Couche Bony : saisie par les utilisateurs, jamais modifiée par l’import du soir. La date de rappel se retrouve dans le Requêteur (mode avancé, « Échange à rappeler »).</div>
      <div className="eq-ech">{L.map((x) => (
        <div key={x.id} className="card eq-ev"><span className="ic"><Icon name={TYPES[x.type]?.[1] || 'edit'} size="sm" /></span><div className="grow">
          <div className="row wrap" style={{ gap: 8 }}><b>{TYPES[x.type]?.[0] || x.type}</b>{x.resultat ? <span className="badge">{x.resultat}</span> : null}
            {x.rappel ? <span className="badge" style={cv(x.rappel < today() ? 'var(--text-3)' : 'var(--warn)')}><Icon name="clock" size="sm" />rappel le {dFR(x.rappel)}</span> : null}
            <span className="grow" /><span className="faint" style={{ fontSize: 12.5 }}>{dFR(x.le)} · {x.auteur || '—'}</span>
            {x.auteur_id === userId || isMaster ? <button className="btn sm ghost" aria-label="Supprimer" data-tip="Supprimer cet échange" onClick={() => suppr(x)}><Icon name="trash" size="sm" /></button> : null}</div>
          {x.texte ? <div style={{ marginTop: 4, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{x.texte}</div> : null}</div></div>
      ))}{!L.length ? <div className="crm-soon"><Icon name="message" size="lg" /><div>Aucun échange noté pour ce client.</div></div> : null}</div>
    </div>
  );
};
