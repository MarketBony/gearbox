import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppProps } from '../../types';
import { BrandChips, Icon, Seg, gx, hud, useSheets } from '../../ui/kit';
import { db } from '../../../../services/dataService';
import { brandName, dFR, nf, plural, today } from '../common';
import {
  type Equipes, type Fonction, type Vendeur, FONCTIONS, FonctionBadge, MARQUES, ORIGINES, ROLES_ENC, StatutBadge, equipes, invalider, nomV, statut, zoneL,
} from './modele';

/**
 * SPARK lot 4 — onglet « Équipes » : Organisation (plaques → sites → vendeurs, encadrement, fiche vendeur), Noms DCS,
 * Règles du portefeuille (activation, simulation, règles particulières, journal), À attribuer.
 * Maquette validée : maquettes/crm/v2/equipes.js. Toute décision de portefeuille est prise par le serveur (rcu/portefeuille.ts).
 */
type Sub = 'org' | 'dcs' | 'reg' | 'orph';
type Open = ReturnType<typeof useSheets>['open'];
const cv = (c: string) => ({ '--c': c } as React.CSSProperties);
const PLAQ_L: Record<string, string> = { CENTRE: 'Plaque Centre', NORD: 'Plaque Nord', SUD: 'Plaque Sud', 'SUD-OUEST': 'Plaque Sud-Ouest', NISSAN: 'Sites Nissan' };
const err = (e: any) => hud(e?.message || 'Opération refusée.');
const calcHud = (r: any, ok: string) => hud(r?.calcul ? `${ok} · portefeuilles recalculés (${nf(r.calcul.changements)} changement${r.calcul.changements > 1 ? 's' : ''})` : ok);

export default function EquipesView({ win, compact, openClient }: { win: AppProps['win']; compact: boolean; openClient: (id: number) => void }) {
  const [sub, setSub] = useState<Sub>(() => gx().store.get('crm.eq.sub', 'org'));
  const [data, setData] = useState<Equipes | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const { open, portals } = useSheets(win);
  const load = useCallback(() => { equipes(true).then((d) => { setData(d); setErreur(null); }).catch((e) => setErreur(e.message || 'Chargement impossible.')); }, []);
  useEffect(() => { load(); }, [load]);
  const go = (s: Sub) => { setSub(s); gx().store.set('crm.eq.sub', s); };
  if (!data) return <div className="empty" style={{ height: '100%' }}>{erreur ? <><Icon name="alert" />{erreur}<button className="btn sm" onClick={load}>Réessayer</button></> : 'Chargement…'}</div>;
  const nAtt = data.a_attribuer.reduce((a, x) => a + x.n, 0);
  const reload = () => { invalider(); load(); };
  return (
    <div className="eq-wrap">
      <div className="eq-sub">
        <Seg value={sub} onChange={go} options={[['org', 'Organisation'], ['dcs', <>Noms DCS{data.a_valider ? <span className="count" style={{ background: 'var(--warn)', marginLeft: 4 }}>{data.a_valider}</span> : null}</>],
          ['reg', <>Règles du portefeuille{!data.parametres.actif ? <span className="count" style={{ background: 'var(--danger)', marginLeft: 4 }}>!</span> : null}</>],
          ['orph', <>À attribuer{nAtt ? <span className="count" style={{ marginLeft: 4 }}>{nf(nAtt)}</span> : null}</>]]} />
        <span className="grow" /><span className="crm-note hide-s">{data.parametres.actif ? (data.dernier_calcul ? `Portefeuilles recalculés le ${dFR(data.dernier_calcul.fin)}` : 'Calcul activé') : 'Calcul des portefeuilles pas encore activé'}</span>
      </div>
      <div className="eq-body">
        {sub === 'org' ? <Organisation data={data} open={open} compact={compact} reload={reload} />
          : sub === 'dcs' ? <NomsDcs data={data} open={open} reload={reload} />
            : sub === 'reg' ? <Regles data={data} open={open} reload={reload} />
              : <AAttribuer data={data} openClient={openClient} reload={reload} />}
      </div>
      {portals}
    </div>
  );
}

// ================================================================ Organisation
function Organisation({ data, open, compact, reload }: { data: Equipes; open: Open; compact: boolean; reload: () => void }) {
  const [site, setSite] = useState<string>(() => gx().store.get('crm.eq.site', data.sites[0]?.site || 'Clermont'));
  const [vid, setVid] = useState<number | null>(null);
  const [svc, setSvc] = useState<'all' | 'VN' | 'VO'>('all');
  const pick = (s: string) => { setSite(s); setVid(null); gx().store.set('crm.eq.site', s); };
  const plaques = useMemo(() => { const m = new Map<string, string[]>(); data.sites.forEach((s) => m.set(s.plaque, [...(m.get(s.plaque) || []), s.site])); return [...m].sort((a, b) => Object.keys(PLAQ_L).indexOf(a[0]) - Object.keys(PLAQ_L).indexOf(b[0])); }, [data.sites]);
  const v = vid ? data.vendeurs.find((x) => x.id === vid) : null;
  const detail = v ? <FicheVendeur v={v} data={data} open={open} back={() => setVid(null)} reload={reload} />
    : <SitePanel site={site} data={data} svc={svc} setSvc={setSvc} open={open} onVendeur={setVid} reload={reload} />;
  if (compact) return <div className="scroll crm-dhost" style={{ height: '100%' }}>
    {!v ? <div style={{ padding: '12px 18px 0' }}><select className="select" value={site} onChange={(e) => pick(e.target.value)}>{data.sites.map((s) => <option key={s.site}>{s.site}</option>)}</select></div> : null}{detail}</div>;
  return (
    <div className="split crm-split" style={{ '--side-w': '250px' } as React.CSSProperties}>
      <div className="side"><div className="crm-list"><div className="scroll" style={{ flex: 1, minHeight: 0, paddingBottom: 16 }}>
        {plaques.map(([p, sites]) => <React.Fragment key={p}><div className="eq-pl crm-lbl">{PLAQ_L[p] || p}</div>
          {sites.map((s) => {
            const vs = data.vendeurs.filter((x) => x.site === s && !['sorti', 'archive'].includes(statut(x)));
            const bouge = vs.some((x) => statut(x) !== 'present');
            return <button key={s} className={`eq-site ${s === site && !v ? 'sel' : ''}`} onClick={() => pick(s)}><b className="grow ellipsis">{s}</b>
              {bouge ? <span style={{ color: 'var(--warn)', display: 'inline-flex' }} data-tip="Arrivée ou départ programmé"><Icon name="clock" size="sm" /></span> : null}<span className="num">{vs.length ? `${vs.length} vend.` : '—'}</span></button>;
          })}</React.Fragment>)}
      </div></div></div>
      <div className="main scroll crm-dhost">{detail}</div>
    </div>
  );
}

function SitePanel({ site, data, svc, setSvc, open, onVendeur, reload }: { site: string; data: Equipes; svc: 'all' | 'VN' | 'VO'; setSvc: (s: 'all' | 'VN' | 'VO') => void; open: Open; onVendeur: (id: number) => void; reload: () => void }) {
  const [archives, setArchives] = useState(false);
  const vs = data.vendeurs.filter((v) => v.site === site && (archives || statut(v) !== 'archive'));
  const tot = vs.reduce((a, v) => a + v.portefeuille, 0), att = data.a_attribuer.find((x) => x.site === site)?.n || 0;
  const plaque = data.sites.find((s) => s.site === site)?.plaque || '';
  const ordre: Record<string, number> = { present: 0, part: 1, arrive: 2, sorti: 3, archive: 4 };
  const table = (s: 'VN' | 'VO') => {
    const L = vs.filter((v) => v.service === s).sort((a, b) => ordre[statut(a)] - ordre[statut(b)] || a.nom.localeCompare(b.nom));
    return (
      <div className="crm-sec" key={s}><h3 className="crm-h2">{s === 'VN' ? 'Véhicules neufs' : 'Véhicules d’occasion'} <span className="n">{L.filter((v) => !['sorti', 'archive'].includes(statut(v))).length}</span></h3>
        <div className="card scroll"><table className="eq-tbl"><thead><tr><th>Vendeur</th><th>Fonction</th><th className="hide-m">Marques</th><th className="hide-m">Secteur</th><th>Statut</th><th className="r">Portefeuille</th></tr></thead><tbody>
          {L.map((v) => <tr key={v.id} className={`cl ${['sorti', 'archive'].includes(statut(v)) ? 'off' : ''}`} onClick={() => onVendeur(v.id)}>
            <td><div className="row" style={{ gap: 10 }}><span className="eq-av">{(v.prenom[0] || '') + (v.nom[0] || '')}</span><div style={{ minWidth: 0 }}><b>{nomV(v)}</b>{v.ipn ? <div className="faint crm-mono" style={{ fontSize: 11.5 }}>{v.ipn}</div> : null}</div></div></td>
            <td><FonctionBadge f={v.fonction} /></td>
            <td className="hide-m">{v.marques.length ? <BrandChips brands={v.marques.map(brandName)} /> : <span className="faint">Toutes</span>}</td>
            <td className="hide-m"><div className="eq-cps">{v.zones.length ? <>{v.zones.slice(0, 3).map((z) => <span key={z} className="badge">{zoneL(z)}</span>)}{v.zones.length > 3 ? <span className="faint">+{v.zones.length - 3}</span> : null}</> : <span className="faint">—</span>}</div></td>
            <td><StatutBadge v={v} /></td><td className="r"><b>{v.portefeuille ? nf(v.portefeuille) : '—'}</b></td></tr>)}
          {!L.length ? <tr><td colSpan={6} className="faint">Aucun vendeur</td></tr> : null}
        </tbody></table></div></div>
    );
  };
  return (
    <div className="eq-pad">
      <div className="crm-crumb"><span className="c">Équipes <span>/</span> {PLAQ_L[plaque] || plaque} <span>/</span> <b>{site}</b></span>
        <div className="acts"><button className="btn primary" onClick={() => ouvrirVendeur(open, data, null, site, reload)}><Icon name="plus" size="sm" />Ajouter un vendeur</button></div></div>
      <div><div className="crm-eye">Concession</div><h2 className="crm-name">{site}</h2>
        <div className="crm-tags"><span className="badge"><Icon name="users" size="sm" />{plural(vs.filter((v) => statut(v) === 'present' || statut(v) === 'part').length, 'vendeur présent', 'vendeurs présents')}</span>
          <span className="badge"><Icon name="handshake" size="sm" />{nf(tot)} clients en portefeuille</span>
          {att ? <span className="badge" style={cv('var(--warn)')}><Icon name="alert" size="sm" />{nf(att)} à attribuer</span> : null}</div></div>
      <div className="crm-sec"><h3 className="crm-h2">Encadrement</h3><div className="eq-enc">{ROLES_ENC.map(([k, l]) => {
        const e = data.encadrement.find((x) => x.site === site && x.role === k);
        return <button key={k} className="card" onClick={() => ouvrirEncadrement(open, site, k, l, e?.nom || '', reload)}><span className="crm-lbl">{l}</span><b>{e?.nom || <span className="faint">Non désigné</span>}</b></button>;
      })}</div></div>
      <div className="row wrap" style={{ gap: 10 }}><Seg value={svc} onChange={setSvc} options={[['all', 'Tous'], ['VN', 'VN'], ['VO', 'VO']]} />
        <label className="row crm-note" style={{ gap: 6 }}><input type="checkbox" checked={archives} onChange={(e) => setArchives(e.target.checked)} /> Afficher les archivés</label>
        <span className="crm-note">Cliquer sur un vendeur pour sa fiche, son secteur et son portefeuille.</span></div>
      {svc !== 'VO' ? table('VN') : null}{svc !== 'VN' ? table('VO') : null}
    </div>
  );
}

// ---------------------------------------------------------------- Fiche vendeur
function FicheVendeur({ v, data, open, back, reload }: { v: Vendeur; data: Equipes; open: Open; back: () => void; reload: () => void }) {
  const [det, setDet] = useState<any>(null);
  const [cp, setCp] = useState('');
  useEffect(() => { setDet(null); db.getCrmVendeur(v.id).then(setDet).catch(() => setDet({ journal: [], par_marque: [], par_origine: [] })); }, [v.id, v]);
  const st = statut(v), rempl = v.remplacant_id ? data.vendeurs.find((x) => x.id === v.remplacant_id) : null;
  const save = (patch: Partial<Vendeur>, ok: string) => (hud('Enregistrement et recalcul des portefeuilles…'), db.saveCrmVendeur(v.id, { ...v, ...patch }).then((r) => { calcHud(r, ok); reload(); }).catch(err));
  const addCp = () => {
    const z = cp.trim().toUpperCase();
    if (!/^([0-9]{2}|2[AB])([0-9]{3})?$/.test(z)) return hud('Code postal (5 chiffres) ou département (2 chiffres)');
    if (v.zones.includes(z)) return hud('Déjà dans le secteur');
    setCp(''); save({ zones: [...v.zones, z] }, `${zoneL(z)} ajouté au secteur`);
  };
  const tb = (det?.par_marque || []).reduce((a: number, x: any) => a + x.n, 0) || 1;
  const menu = (el: HTMLElement) => gx().menu.open([
    { label: 'Transférer des clients…', icon: 'swap', action: () => ouvrirTransfert(open, data, v, reload) },
    { label: st === 'archive' ? 'Désarchiver' : 'Archiver', icon: 'archives', action: () => db.archiverCrmVendeur(v.id, st !== 'archive').then((r) => { calcHud(r, st === 'archive' ? 'Désarchivé' : 'Archivé : masqué des listes, ses clients sont réattribués'); reload(); }).catch(err) },
  ], el, { align: 'right' });
  return (
    <div className="eq-pad">
      <div className="crm-crumb"><span className="c">Équipes <span>/</span> <a style={{ cursor: 'pointer' }} onClick={back}>{v.site}</a> <span>/</span> <b>{nomV(v)}</b></span>
        <div className="acts"><button className="btn" onClick={() => ouvrirVendeur(open, data, v, v.site, reload)}><Icon name="edit" size="sm" />Modifier</button>
          {st === 'present' || st === 'part' || st === 'arrive' ? <button className="btn" style={{ color: 'var(--warn)' }} onClick={() => ouvrirDepart(open, data, v, reload)}><Icon name="clock" size="sm" />{v.sortie ? 'Modifier le départ…' : 'Programmer un départ…'}</button> : null}
          <button className="btn" aria-label="Plus" onClick={(e) => menu(e.currentTarget)}><Icon name="more" size="sm" /></button></div></div>
      <div className="crm-idt"><span className="av" style={cv('var(--bony-violet)')}>{(v.prenom[0] || '') + (v.nom[0] || '')}</span><div className="grow">
        <div className="crm-eye">{v.service} · {v.site}</div><h2 className="crm-name">{nomV(v)}</h2>
        <div className="crm-tags"><FonctionBadge f={v.fonction} />{v.marques.length ? <BrandChips brands={v.marques.map(brandName)} /> : <span className="badge">Toutes marques</span>}<StatutBadge v={v} />
          {!v.recoit ? <span className="badge" style={cv('var(--text-3)')}><Icon name="lock" size="sm" />Ne reçoit pas de clients</span> : null}
          {rempl ? <span className="badge" style={cv('var(--warn)')}><Icon name="swap" size="sm" />Remplacé par {nomV(rempl)}</span> : null}</div></div></div>
      <div className="crm-facts">
        <div className="card crm-fact"><span className="crm-lbl">Portefeuille</span><span className="v">{v.portefeuille ? nf(v.portefeuille) : '—'}</span><span className="h">{st === 'arrive' ? `commence le ${dFR(v.entree)}` : st === 'sorti' ? 'réattribué à son départ' : data.parametres.actif ? 'clients dont il est le vendeur' : 'calcul pas encore activé'}</span></div>
        <div className="card crm-fact"><span className="crm-lbl">Dont vendus via un agent</span><span className="v">{nf(v.via_agent)}</span><span className="h">restent à lui, agent noté à part</span></div>
        <div className="card crm-fact"><span className="crm-lbl">Reçus par réattribution</span><span className="v">{nf(v.reattribues)}</span><span className="h">règles, secteur, hall</span></div>
        <div className="card crm-fact"><span className="crm-lbl">Secteur</span><span className="v">{v.zones.length ? plural(v.zones.length, 'zone') : '—'}</span><span className="h">{v.fonction === 'secteur' ? 'codes postaux attitrés' : 'pas de secteur attitré'}</span></div>
      </div>
      <div className="crm-g2 eq">
        <div className="crm-sec"><h3 className="crm-h2">Fiche</h3><div className="card" style={{ padding: '14px 16px' }}><div className="crm-kv">
          <span>Nom</span><b>{v.nom}</b><span>Prénom</span><b>{v.prenom || '—'}</b><span>IPN</span><b className="crm-mono">{v.ipn || '—'}</b>
          <span>Téléphone</span><b>{v.telephone || '—'}</b><span>E-mail</span><b>{v.email || '—'}</b>
          <span>Site</span><b>{v.site}</b><span>Service</span><b>{v.service}</b><span>Fonction</span><b>{FONCTIONS[v.fonction].l}</b>
          <span>Marques</span><b>{v.marques.length ? v.marques.map(brandName).join(', ') : 'Toutes'}</b><span>Entrée</span><b>{dFR(v.entree)}</b><span>Sortie</span><b>{dFR(v.sortie)}</b>
          <span>Reçoit des clients</span><b>{v.recoit ? 'Oui' : 'Non'}</b>{v.note ? <><span>Note</span><b>{v.note}</b></> : null}</div></div></div>
        <div className="crm-sec"><h3 className="crm-h2">Secteur <span className="n">{v.zones.length}</span></h3>
          <div className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="eq-cps">{v.zones.length ? v.zones.map((z) => <span key={z} className="badge">{z.length === 2 ? `Département ${z}` : z}<button className="btn sm ghost" aria-label="Retirer" style={{ padding: '0 2px', marginLeft: 2 }} onClick={() => save({ zones: v.zones.filter((x) => x !== z) }, `${zoneL(z)} retiré`)}><Icon name="close" size="sm" /></button></span>) : <span className="faint">Aucun code postal</span>}</div>
            <div className="row" style={{ gap: 8 }}><input className="input" value={cp} onChange={(e) => setCp(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addCp(); }} placeholder="Code postal (63270) ou département (43)" style={{ flex: 1 }} /><button className="btn sm" onClick={addCp}><Icon name="plus" size="sm" />Ajouter</button></div>
            <div className="crm-note">Un code postal précis l’emporte sur un département entier. Deux vendeurs Secteur présents ne peuvent pas avoir la même zone sur le même site, service et marque : SPARK le refuse.{v.fonction !== 'secteur' ? ' Ce vendeur n’est pas en fonction « Secteur » : sa liste n’est pas utilisée par le calcul.' : ''}</div></div>
          <h3 className="crm-h2" style={{ marginTop: 6 }}>Noms dans DCS</h3><div className="card" style={{ padding: '14px 16px' }}>
            <div className="eq-cps">{v.noms_dcs.length ? v.noms_dcs.map((a) => <span key={a} className="badge crm-mono">{a}</span>) : <span className="faint">Aucun nom DCS rattaché</span>}</div>
            <div className="crm-note" style={{ marginTop: 8 }}>Les ventes DCS à ces noms lui sont rattachées. Gérés dans « Noms DCS ».</div></div></div>
      </div>
      <div className="crm-sec"><h3 className="crm-h2">Portefeuille par marque</h3>
        {det?.par_marque?.length ? <><div className="eq-bar">{det.par_marque.map((x: any) => <i key={x.cle} style={{ width: `${(x.n / tb) * 100}%`, background: gx().data.brand(brandName(x.cle))?.hex || 'var(--text-3)' }} data-tip={`${brandName(x.cle)} : ${nf(x.n)}`} />)}</div>
          <div className="row wrap" style={{ gap: 10 }}>{det.par_marque.map((x: any) => <span key={x.cle} className="crm-note">{brandName(x.cle)} · {nf(x.n)}</span>)}{det.par_origine.map((x: any) => <span key={x.cle} className="badge">{ORIGINES[x.cle] || x.cle} · {nf(x.n)}</span>)}</div></>
          : <div className="crm-note">{det ? 'Aucun client en portefeuille.' : 'Chargement…'}</div>}
        <div className="crm-note">Pour la liste de ses clients : Requêteur, mode avancé, « Vendeur du portefeuille » est {nomV(v)}.</div></div>
      <div className="crm-sec"><h3 className="crm-h2">Historique</h3><div className="crm-rel">{(det?.journal || []).map((j: any, i: number) => <div key={i}><Icon name="edit" size="sm" /><span className="grow">{j.texte}</span><span className="faint">{dFR(j.le)} · {j.par || '—'}</span></div>)}
        {det && !det.journal.length ? <div>Aucune modification.</div> : null}</div></div>
    </div>
  );
}

// ---------------------------------------------------------------- Volets : vendeur, départ, transfert, encadrement
const VendeurForm: React.FC<{ data: Equipes; v: Vendeur | null; site: string; close: (x?: unknown) => void; reload: () => void; init?: { nom: string; prenom: string } }> = ({ data, v, site, close, reload, init }) => {
  const [x, setX] = useState(() => ({
    nom: v?.nom || init?.nom || '', prenom: v?.prenom || init?.prenom || '', site: v?.site || site, service: v?.service || 'VN', fonction: (v?.fonction || 'hall') as Fonction,
    marques: v?.marques || ['RENAULT'], recoit: v ? v.recoit : true, entree: v?.entree || '', sortie: v?.sortie || '', ipn: v?.ipn || '',
    telephone: v?.telephone || '', email: v?.email || '', note: v?.note || '', zones: v?.zones || [], remplacant_id: v?.remplacant_id || null,
  }));
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setX({ ...x, [k]: e.target.value });
  const ok = () => {
    if (!x.nom.trim()) return hud('Nom obligatoire');
    setBusy(true);
    db.saveCrmVendeur(v?.id ?? null, x).then((r) => { calcHud(r, v ? 'Vendeur modifié' : 'Vendeur ajouté'); close('ok'); reload(); }).catch((e) => { setBusy(false); err(e); });
  };
  return <>
    <div className="label" style={{ color: 'var(--bony-violet)' }}>Référentiel vendeurs</div><h3 style={{ margin: '2px 0 8px' }}>{v ? `Modifier ${nomV(v)}` : 'Ajouter un vendeur'}</h3>
    <div className="eq-form">
      <label className="field"><span className="label">Nom</span><input className="input" value={x.nom} onChange={set('nom')} /></label>
      <label className="field"><span className="label">Prénom</span><input className="input" value={x.prenom} onChange={set('prenom')} /></label>
      <label className="field"><span className="label">Site</span><select className="select" value={x.site} onChange={set('site')}>{data.sites.map((s) => <option key={s.site}>{s.site}</option>)}</select></label>
      <label className="field"><span className="label">Service</span><select className="select" value={x.service} onChange={set('service')}><option>VN</option><option>VO</option></select></label>
      <label className="field"><span className="label">Fonction</span><select className="select" value={x.fonction} onChange={(e) => setX({ ...x, fonction: e.target.value as Fonction, recoit: !['alternant', 'magasin'].includes(e.target.value) })}>{Object.entries(FONCTIONS).map(([k, f]) => <option key={k} value={k}>{f.l}</option>)}</select></label>
      <div className="field"><span className="label">Marques (aucune = toutes)</span><div className="row wrap" style={{ gap: 6, marginTop: 4 }}>{MARQUES.map((m) => <label key={m} className="row" style={{ gap: 4 }}><input type="checkbox" checked={x.marques.includes(m)} onChange={(e) => setX({ ...x, marques: e.target.checked ? [...x.marques, m] : x.marques.filter((y) => y !== m) })} />{brandName(m)}</label>)}</div></div>
      <label className="field"><span className="label">Date d’entrée</span><input className="input" type="date" value={x.entree} onChange={set('entree')} /></label>
      <label className="field"><span className="label">Date de sortie (dernier jour)</span><input className="input" type="date" value={x.sortie} onChange={set('sortie')} /></label>
      <label className="field"><span className="label">IPN</span><input className="input crm-mono" value={x.ipn} onChange={set('ipn')} placeholder="D123456" /></label>
      <label className="field"><span className="label">Téléphone</span><input className="input" value={x.telephone} onChange={set('telephone')} /></label>
      <label className="field full"><span className="label">E-mail</span><input className="input" value={x.email} onChange={set('email')} /></label>
      <label className="field full"><span className="label">Note</span><input className="input" value={x.note} onChange={set('note')} /></label>
    </div>
    <label className="row" style={{ gap: 8, marginTop: 8 }}><input type="checkbox" checked={x.recoit} onChange={(e) => setX({ ...x, recoit: e.target.checked })} /> Reçoit des clients (décocher : alternant, magasin, absence longue)</label>
    <div className="crm-note" style={{ marginTop: 8 }}>Une date d’entrée future : il n’entre dans la répartition qu’à cette date. Une date de sortie : ses clients sont réattribués la nuit qui suit.</div>
    <div className="foot"><button className="btn" onClick={() => close()}>Annuler</button><button className="btn primary" disabled={busy} onClick={ok}>{busy ? 'Recalcul des portefeuilles…' : 'Enregistrer'}</button></div>
  </>;
};
const ouvrirVendeur = (open: Open, data: Equipes, v: Vendeur | null, site: string, reload: () => void, init?: { nom: string; prenom: string }) => open((close) => <VendeurForm data={data} v={v} site={site} close={close} reload={reload} init={init} />, { width: 640 });

const DepartForm: React.FC<{ data: Equipes; v: Vendeur; close: (x?: unknown) => void; reload: () => void }> = ({ data, v, close, reload }) => {
  const [sortie, setSortie] = useState(v.sortie || today());
  const [mode, setMode] = useState<'regles' | 'rempl'>(v.remplacant_id ? 'rempl' : 'regles');
  const autres = data.vendeurs.filter((x) => x.id !== v.id && !['sorti', 'archive'].includes(statut(x))).sort((a, b) => (a.site === v.site ? -1 : 0) - (b.site === v.site ? -1 : 0) || a.nom.localeCompare(b.nom));
  const [rempl, setRempl] = useState<number>(v.remplacant_id || autres[0]?.id || 0);
  const [prev, setPrev] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { db.apercuCrmDepart(v.id).then(setPrev).catch(() => setPrev({ destinations: [] })); }, [v.id]);
  const ok = () => {
    setBusy(true);
    db.saveCrmVendeur(v.id, { ...v, sortie, remplacant_id: mode === 'rempl' ? rempl : null }).then((r) => { calcHud(r, `Départ programmé au ${dFR(sortie)}`); close('ok'); reload(); }).catch((e) => { setBusy(false); err(e); });
  };
  const annuler = () => db.saveCrmVendeur(v.id, { ...v, sortie: null, remplacant_id: null }).then((r) => { calcHud(r, 'Départ annulé'); close('ok'); reload(); }).catch(err);
  const D = (prev?.destinations || []) as { vendeur: string | null; origine: string; n: number }[];
  return <>
    <div className="label" style={{ color: 'var(--warn)' }}>Départ</div><h3 style={{ margin: '2px 0 8px' }}>{nomV(v)} quitte {v.site}</h3>
    <label className="field"><span className="label">Dernier jour</span><input className="input" type="date" value={sortie} onChange={(e) => setSortie(e.target.value)} /></label>
    <div className="field" style={{ marginTop: 10 }}><span className="label">Ses {nf(v.portefeuille)} clients</span>
      <label className="row" style={{ gap: 8, marginTop: 6 }}><input type="radio" checked={mode === 'regles'} onChange={() => setMode('regles')} /> Les répartir selon les règles (recommandé)</label>
      <label className="row" style={{ gap: 8, marginTop: 6 }}><input type="radio" checked={mode === 'rempl'} onChange={() => setMode('rempl')} /> Tout donner à :
        <select className="select" style={{ flex: 1 }} value={rempl} onChange={(e) => { setRempl(Number(e.target.value)); setMode('rempl'); }}>{autres.map((x) => <option key={x.id} value={x.id}>{nomV(x)} · {x.site} {x.service}{statut(x) === 'arrive' ? ` (arrive le ${dFR(x.entree)})` : ''}</option>)}</select></label></div>
    {mode === 'regles' ? <><div className="crm-lbl" style={{ marginTop: 14 }}>Aperçu s’il partait aujourd’hui</div>
      {!prev ? <div className="crm-note" style={{ marginTop: 8 }}>Calcul…</div> : !D.length ? <div className="crm-note" style={{ marginTop: 8 }}>{data.parametres.actif ? 'Aucun client en portefeuille.' : 'Calcul des portefeuilles pas encore activé : pas d’aperçu.'}</div>
        : <div className="eq-prev">{D.map((d, i) => <div key={i} style={d.origine === 'a_attribuer' ? { color: 'var(--warn)' } : undefined}><Icon name={d.origine === 'secteur' ? 'pin' : d.origine === 'hall' ? 'users' : d.origine === 'a_attribuer' ? 'alert' : 'swap'} size="sm" />
          <span className="grow"><b>{nf(d.n)}</b> → {d.vendeur || (d.origine === 'hors' ? 'hors portefeuille' : 'à attribuer')} <span className="faint">({ORIGINES[d.origine] || d.origine})</span></span></div>)}</div>}</> : null}
    <div className="crm-note" style={{ marginTop: 12 }}>Rien ne bouge avant le dernier jour : la réattribution se fait la nuit qui suit, et chaque client garde la trace du départ. Les clients verrouillés à son nom passent dans « À attribuer ».</div>
    <div className="foot">{v.sortie ? <button className="btn ghost" onClick={annuler}>Annuler le départ</button> : null}<span className="grow" /><button className="btn" onClick={() => close()}>Fermer</button><button className="btn primary" style={{ background: 'var(--warn)' }} disabled={busy} onClick={ok}>{busy ? 'Recalcul des portefeuilles…' : 'Programmer le départ'}</button></div>
  </>;
};
const ouvrirDepart = (open: Open, data: Equipes, v: Vendeur, reload: () => void) => open((close) => <DepartForm data={data} v={v} close={close} reload={reload} />, { width: 580 });

const TransfertForm: React.FC<{ data: Equipes; v: Vendeur; close: (x?: unknown) => void; reload: () => void }> = ({ data, v, close, reload }) => {
  const autres = data.vendeurs.filter((x) => x.id !== v.id && !['sorti', 'archive'].includes(statut(x)) && x.site === v.site);
  const [vers, setVers] = useState(autres[0]?.id || 0);
  const [zones, setZones] = useState('');
  const [marque, setMarque] = useState('');
  const [verrou, setVerrou] = useState(false);
  const ok = () => db.transfererCrmVendeur(v.id, { vers, zones: zones.split(/[\s,;/]+/).filter(Boolean), marque: marque || null, verrou })
    .then((r) => { hud(`${nf(r.clients)} client${r.clients > 1 ? 's' : ''} transféré${r.clients > 1 ? 's' : ''}`); close('ok'); reload(); }).catch(err);
  return <>
    <h3>Transférer des clients de {nomV(v)}</h3><div className="muted">Pour un rééquilibrage ou une absence longue, sans départ. Effet immédiat.</div>
    <label className="field" style={{ marginTop: 12 }}><span className="label">Codes postaux ou départements (vide = tous)</span><input className="input" value={zones} onChange={(e) => setZones(e.target.value)} placeholder="63270, 63118, 43" /></label>
    <label className="field"><span className="label">Marque du dernier achat (vide = toutes)</span><select className="select" value={marque} onChange={(e) => setMarque(e.target.value)}><option value="">Toutes</option>{MARQUES.map((m) => <option key={m} value={m}>{brandName(m)}</option>)}</select></label>
    <label className="field"><span className="label">Vers</span><select className="select" value={vers} onChange={(e) => setVers(Number(e.target.value))}>{autres.map((x) => <option key={x.id} value={x.id}>{nomV(x)} · {x.service} {FONCTIONS[x.fonction].l}</option>)}</select></label>
    <label className="row" style={{ gap: 8, marginTop: 8 }}><input type="checkbox" checked={verrou} onChange={(e) => setVerrou(e.target.checked)} /> Verrouiller (le recalcul ne les déplacera plus)</label>
    <div className="foot"><button className="btn" onClick={() => close()}>Annuler</button><button className="btn primary" disabled={!vers} onClick={ok}>Transférer</button></div>
  </>;
};
const ouvrirTransfert = (open: Open, data: Equipes, v: Vendeur, reload: () => void) => open((close) => <TransfertForm data={data} v={v} close={close} reload={reload} />, { width: 520 });

const EncForm: React.FC<{ site: string; role: string; libelle: string; nom: string; close: (x?: unknown) => void; reload: () => void }> = ({ site, role, libelle, nom, close, reload }) => {
  const [x, setX] = useState(nom);
  const ok = () => db.saveCrmEncadrement({ site, role, nom: x.trim() }).then(() => { hud('Encadrement enregistré'); close('ok'); reload(); }).catch(err);
  return <>
    <h3>{libelle} · {site}</h3><div className="muted">Un seul titulaire par rôle et par site (comme GRID). Vide = non désigné.</div>
    <label className="field" style={{ marginTop: 12 }}><span className="label">Nom</span><input className="input" value={x} onChange={(e) => setX(e.target.value)} autoFocus /></label>
    <div className="foot"><button className="btn" onClick={() => close()}>Annuler</button><button className="btn primary" onClick={ok}>Enregistrer</button></div>
  </>;
};
const ouvrirEncadrement = (open: Open, site: string, role: string, libelle: string, nom: string, reload: () => void) => open((close) => <EncForm site={site} role={role} libelle={libelle} nom={nom} close={close} reload={reload} />, { width: 440 });

// ================================================================ Noms DCS
const DCS_ST: Record<string, [string, string]> = { auto: ['Reconnu', 'var(--ok)'], valide: ['Validé', 'var(--ok)'], propose: ['À valider', 'var(--warn)'], inconnu: ['Inconnu', 'var(--danger)'], ancien: ['Ancien vendeur', 'var(--text-3)'], pas_vendeur: ['Pas un vendeur', 'var(--text-3)'] };
function NomsDcs({ data, open, reload }: { data: Equipes; open: Open; reload: () => void }) {
  const [L, setL] = useState<any[] | null>(null);
  const [f, setF] = useState<'todo' | 'all'>('todo');
  const [q, setQ] = useState('');
  const load = useCallback(() => { db.getCrmNomsDcs().then(setL).catch(() => setL([])); }, []);
  useEffect(() => { load(); }, [load]);
  const V = data.vendeurs.filter((v) => statut(v) !== 'archive').sort((a, b) => a.nom.localeCompare(b.nom));
  const save = (libelle: string, etat: string, vendeur_id?: number | null) => db.saveCrmNomDcs({ libelle, etat, vendeur_id }).then((r) => { calcHud(r, 'Nom DCS classé'); load(); reload(); }).catch(err);
  const rattacher = (d: any, el: HTMLElement) => gx().menu.open([{ header: d.libelle },
    ...V.filter((v) => !d.sites?.length || d.sites.includes(v.site)).slice(0, 12).map((v) => ({ label: `${nomV(v)} · ${v.site} ${v.service}`, icon: 'user', action: () => save(d.libelle, 'valide', v.id) })), '-',
    { label: 'Créer ce vendeur dans le référentiel…', icon: 'plus', action: () => { const [nom, ...p] = d.libelle.split(' '); ouvrirVendeur(open, data, null, d.sites?.[0] || data.sites[0].site, () => { load(); reload(); }, { nom, prenom: p.map((x: string) => x.charAt(0) + x.slice(1).toLowerCase()).join(' ') }); } },
    { label: 'Ancien vendeur (réattribuer ses clients)', icon: 'clock', action: () => save(d.libelle, 'ancien') },
    { label: 'Pas un vendeur (direction, compte générique)', icon: 'close', action: () => save(d.libelle, 'pas_vendeur') },
    ...(d.etat !== 'inconnu' ? [{ label: 'Remettre « inconnu »', icon: 'refresh', action: () => save(d.libelle, 'inconnu') }] : []),
  ], el, { align: 'right' });
  const R = (L || []).filter((d) => (f === 'all' || ['propose', 'inconnu'].includes(d.etat)) && (!q || d.libelle.includes(q.toUpperCase()) || (d.vendeur || '').toUpperCase().includes(q.toUpperCase())))
    // À traiter : les propositions d'abord, puis les noms les plus récemment vus (un vendeur actif oublié du référentiel ressort en tête).
    .sort((a, b) => (f === 'all' ? 0 : (a.etat === 'propose' ? 0 : 1) - (b.etat === 'propose' ? 0 : 1) || (b.derniere || '').localeCompare(a.derniere || '')));
  return (
    <div className="scroll" style={{ height: '100%' }}><div className="eq-pad">
      <div><div className="crm-eye">Correspondances</div><h2 className="crm-name" style={{ fontSize: 22 }}>Noms de vendeurs dans DCS</h2>
        <div className="crm-note" style={{ maxWidth: 780 }}>DCS écrit le vendeur en texte libre (« Nom vendeur1 »). SPARK rattache chaque nom à un vendeur du référentiel : automatiquement quand le nom est identique, à valider quand il est proche. Un nom <b>inconnu ou ancien</b> n’a pas de vendeur présent : ses clients sont réattribués par les règles. Noms vus depuis 5 ans.</div></div>
      <div className="row wrap" style={{ gap: 10 }}><Seg value={f} onChange={setF} options={[['todo', `À traiter (${(L || []).filter((d) => ['propose', 'inconnu'].includes(d.etat)).length})`], ['all', 'Tous']]} />
        <input className="input" style={{ maxWidth: 260 }} placeholder="Rechercher un nom" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {!L ? <div className="crm-note">Chargement…</div> : <div className="card scroll"><table className="eq-tbl"><thead><tr><th>Nom dans DCS</th><th className="r">Ventes</th><th className="hide-m">Dernière vente</th><th className="hide-m">Sites</th><th>Rattaché à</th><th>État</th><th /></tr></thead><tbody>
        {R.slice(0, 300).map((d) => { const [l, c] = DCS_ST[d.etat] || DCS_ST.inconnu; return (
          <tr key={d.libelle}><td><b className="crm-mono">{d.libelle}</b></td><td className="r">{nf(d.ventes)}</td><td className="hide-m">{dFR(d.derniere)}</td><td className="hide-m faint">{(d.sites || []).join(', ')}</td>
            <td>{d.vendeur ? <>{d.vendeur} <span className="faint">· {d.vendeur_site}</span></> : <span className="faint">—</span>}</td><td><span className="badge" style={cv(c)}>{l}</span></td>
            <td className="r" style={{ whiteSpace: 'nowrap' }}>{d.etat === 'propose' ? <button className="btn sm primary" onClick={() => save(d.libelle, 'valide', d.vendeur_id)}>Valider</button> : null} <button className="btn sm" onClick={(e) => rattacher(d, e.currentTarget)}>{d.etat === 'auto' || d.etat === 'valide' ? 'Changer…' : 'Rattacher…'}</button></td></tr>); })}
        {!R.length ? <tr><td colSpan={7} className="faint">{f === 'todo' ? 'Rien à traiter : tous les noms récents sont classés.' : 'Aucun nom.'}</td></tr> : null}
      </tbody></table></div>}
    </div></div>
  );
}

// ================================================================ Règles
const ETAPES: [string, string, string][] = [
  ['lock', 'Choix manuel verrouillé', 'Un client attribué à la main avec « verrouiller » ne bouge plus jamais, même au départ du vendeur (il passe alors dans « À attribuer »).'],
  ['handshake', 'Vendeur de son dernier achat', 'Le client appartient au vendeur de son dernier achat (VN ou VO), s’il est présent. Un nouvel achat le remet en jeu. L’agent qui a vendu reste noté à part : il ne change pas le portefeuille.'],
  ['users', 'Vendeur présent gardé', 'Un client qui a déjà un vendeur présent (réattribué plus tôt, choisi à la main) le garde : pas de rééquilibrage automatique.'],
  ['swap', 'Remplaçant, puis règles particulières', 'Client sans vendeur présent : le remplaçant désigné au départ de son vendeur, sinon les règles du tableau ci-dessous, dans l’ordre.'],
  ['building', 'Sociétés', 'Client société : vendeur « Sociétés » du site, marque compatible, le moins chargé.'],
  ['pin', 'Secteur', 'Vendeur « Secteur » du site dont la liste couvre son code postal (un code postal précis l’emporte sur un département), même service et marque compatible.'],
  ['users', 'Hall', 'Sinon : vendeurs « Hall » du site, même service et marque compatible, en donnant au moins chargé. Calcul déterministe.'],
  ['alert', 'À attribuer', 'Personne ne convient : le client attend dans la file du site.'],
];
function Regles({ data, open, reload }: { data: Equipes; open: Open; reload: () => void }) {
  const [regles, setRegles] = useState<any[] | null>(null);
  const [runs, setRuns] = useState<any[] | null>(null);
  const [simu, setSimu] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [ans, setAns] = useState<string>(data.parametres.anciennete_ans == null ? '' : String(data.parametres.anciennete_ans));
  const load = useCallback(() => { db.getCrmRegles().then(setRegles).catch(() => setRegles([])); db.getCrmRecalculs().then(setRuns).catch(() => setRuns([])); }, []);
  useEffect(() => { load(); }, [load]);
  const simuler = () => { setBusy(true); setSimu(null); db.recalculerCrm(true).then((r) => { setSimu(r); setBusy(false); }).catch((e) => { setBusy(false); err(e); }); };
  const param = (actif: boolean) => {
    const a = ans.trim() === '' ? null : Number(ans);
    setBusy(true);
    db.saveCrmParametres({ actif, anciennete_ans: a }).then((r) => { setBusy(false); calcHud(r, actif ? 'Calcul des portefeuilles activé' : 'Réglages enregistrés'); load(); reload(); }).catch((e) => { setBusy(false); err(e); });
  };
  const P = data.parametres, S = simu?.par_origine || {};
  return (
    <div className="scroll" style={{ height: '100%' }}><div className="eq-pad">
      <div><div className="crm-eye">Recalcul automatique</div><h2 className="crm-name" style={{ fontSize: 22 }}>Règles du portefeuille</h2>
        <div className="crm-note" style={{ maxWidth: 780 }}>Après chaque import, chaque nuit (départs et arrivées datés) et à chaque changement du référentiel, SPARK recalcule à qui appartient chaque client <b>qui n’a plus de vendeur présent</b>. Chaque changement est tracé sur la fiche du client.</div></div>
      <div className={`card ${P.actif ? '' : 'crm-stop warn'}`} style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="row wrap" style={{ gap: 10 }}><Icon name={P.actif ? 'check' : 'alert'} /><b className="grow">{P.actif ? `Calcul activé${P.maj_par ? ` par ${P.maj_par}` : ''}` : 'Calcul pas encore activé'}</b>
          <label className="row" style={{ gap: 6 }}>Hors portefeuille au-delà de <input className="input" style={{ width: 64 }} value={ans} onChange={(e) => setAns(e.target.value)} /> ans sans achat</label></div>
        <div className="crm-note">{P.actif ? 'Le premier calcul a eu lieu : les portefeuilles suivent les règles ci-dessous.' : 'Avant d’activer : classez les noms DCS (onglet « Noms DCS ») — un nom non rattaché fait passer les clients de son vendeur aux règles —, puis simulez.'} Un client dont le dernier achat est plus ancien n’est pas distribué (il reste au vendeur de cet achat s’il est encore là).</div>
        <div className="row wrap" style={{ gap: 8 }}><button className="btn" disabled={busy} onClick={simuler}><Icon name="eye" size="sm" />Simuler (rien n’est écrit)</button>
          {P.actif ? <><button className="btn" disabled={busy} onClick={() => param(true)}>Enregistrer la durée</button><button className="btn ghost" disabled={busy} onClick={() => param(false)}>Suspendre le calcul</button></>
            : <button className="btn primary" disabled={busy} onClick={() => param(true)}><Icon name="bolt" size="sm" />Activer et lancer le premier calcul</button>}</div>
        {busy && !simu ? <div className="crm-note">Calcul…</div> : null}
        {simu ? <div className="eq-prev"><div><Icon name="users" size="sm" /><span className="grow"><b>{nf(simu.clients)}</b> clients en portefeuille · <b>{nf(simu.changements)}</b> changeraient de vendeur · {nf(simu.hors)} hors portefeuille · calcul en {nf(simu.ms)} ms</span></div>
          {Object.entries(S).sort((a: any, b: any) => b[1] - a[1]).map(([k, n]: any) => <div key={k} style={k === 'a_attribuer' ? { color: 'var(--warn)' } : undefined}><Icon name="arrowr" size="sm" /><span className="grow">{ORIGINES[k] || k} : <b>{nf(n)}</b></span></div>)}</div> : null}
      </div>
      <div className="crm-sec"><h3 className="crm-h2">Dans l’ordre</h3><div className="eq-rules">{ETAPES.map(([i, l, t], k) => <div key={k} className="card eq-rule"><span className="k">{k + 1}</span><div className="grow"><b><Icon name={i} size="sm" /> {l}</b><div className="crm-note" style={{ marginTop: 3 }}>{t}</div></div></div>)}</div></div>
      <div className="crm-sec"><h3 className="crm-h2">Règles particulières <span className="n">{regles?.length ?? ''}</span></h3>
        <div className="card scroll"><table className="eq-tbl"><thead><tr><th style={{ width: 44 }}>Active</th><th>Site</th><th>Quand le client…</th><th>Va à</th><th /></tr></thead><tbody>
          {(regles || []).map((r) => <tr key={r.id}><td><input type="checkbox" checked={r.actif} onChange={(e) => db.saveCrmRegle(r.id, { ...r, actif: e.target.checked }).then((x) => { calcHud(x, 'Règle mise à jour'); load(); reload(); }).catch(err)} /></td>
            <td>{r.site}{r.service ? ` · ${r.service}` : ''}</td><td>{r.type === 'cp' ? 'a un code postal parmi' : r.type === 'agent' ? 'a acheté via l’agent' : 'avait pour vendeur'} <b>{r.valeurs.join(', ')}</b>{r.note ? <div className="faint" style={{ fontSize: 12 }}>{r.note}</div> : null}</td>
            <td>{r.vendeur}</td><td className="r"><button className="btn sm ghost" aria-label="Supprimer" onClick={() => db.deleteCrmRegle(r.id).then((x) => { calcHud(x, 'Règle supprimée'); load(); reload(); }).catch(err)}><Icon name="trash" size="sm" /></button></td></tr>)}
          {regles && !regles.length ? <tr><td colSpan={5} className="faint">Aucune règle particulière.</td></tr> : null}
        </tbody></table></div>
        <div><button className="btn sm" onClick={() => open((close) => <RegleForm data={data} close={close} done={() => { load(); reload(); }} />, { width: 540 })}><Icon name="plus" size="sm" />Ajouter une règle…</button></div></div>
      <div className="crm-sec"><h3 className="crm-h2">Derniers recalculs</h3><div className="crm-rel">{(runs || []).map((j) => <div key={j.id}><Icon name="refresh" size="sm" />
        <span className="grow"><b>{nf(j.changements ?? 0)}</b> changement{(j.changements ?? 0) > 1 ? 's' : ''} · {j.declencheur}{j.stats?.a_attribuer != null ? ` · ${nf(j.stats.a_attribuer)} à attribuer` : ''}{j.fin ? '' : ' · en cours ou interrompu'}</span><span className="faint">{j.debut ? new Date(j.debut).toLocaleString('fr-FR') : ''}</span></div>)}
        {runs && !runs.length ? <div>Aucun recalcul pour l’instant.</div> : null}</div></div>
    </div></div>
  );
}
const RegleForm: React.FC<{ data: Equipes; close: (x?: unknown) => void; done: () => void }> = ({ data, close, done }) => {
  const [r, setR] = useState({ site: data.sites[0]?.site || '', service: '', type: 'cp', valeurs: '', vendeur_id: 0, note: '' });
  const V = data.vendeurs.filter((v) => !['sorti', 'archive'].includes(statut(v))).sort((a, b) => (a.site === r.site ? -1 : 0) - (b.site === r.site ? -1 : 0) || a.nom.localeCompare(b.nom));
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setR({ ...r, [k]: e.target.value });
  const ok = () => db.saveCrmRegle(null, { ...r, service: r.service || null, valeurs: r.valeurs.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean), vendeur_id: r.vendeur_id || V[0]?.id })
    .then((x) => { calcHud(x, 'Règle ajoutée'); close('ok'); done(); }).catch(err);
  return <>
    <h3>Nouvelle règle particulière</h3><div className="muted">S’applique aux clients sans vendeur présent, avant les vendeurs Sociétés, Secteur et Hall.</div>
    <div className="eq-form" style={{ marginTop: 12 }}>
      <label className="field"><span className="label">Site du client</span><select className="select" value={r.site} onChange={set('site')}>{data.sites.map((s) => <option key={s.site}>{s.site}</option>)}</select></label>
      <label className="field"><span className="label">Service</span><select className="select" value={r.service} onChange={set('service')}><option value="">VN et VO</option><option>VN</option><option>VO</option></select></label>
      <label className="field"><span className="label">Quand le client…</span><select className="select" value={r.type} onChange={set('type')}><option value="cp">a un code postal parmi…</option><option value="agent">a acheté via l’agent…</option><option value="ancien_vendeur">avait pour vendeur (début du nom DCS)…</option></select></label>
      <label className="field"><span className="label">Valeurs (séparées par des virgules)</span><input className="input" value={r.valeurs} onChange={set('valeurs')} placeholder={r.type === 'cp' ? '43100, 43360, 15' : r.type === 'agent' ? 'GGE SERVEL DIDIER ET NATH' : 'RANSON'} /></label>
      <label className="field full"><span className="label">Il va à</span><select className="select" value={r.vendeur_id || V[0]?.id} onChange={(e) => setR({ ...r, vendeur_id: Number(e.target.value) })}>{V.map((v) => <option key={v.id} value={v.id}>{nomV(v)} · {v.site} {v.service}</option>)}</select></label>
      <label className="field full"><span className="label">Note</span><input className="input" value={r.note} onChange={set('note')} /></label>
    </div>
    <div className="foot"><button className="btn" onClick={() => close()}>Annuler</button><button className="btn primary" onClick={ok}>Ajouter</button></div>
  </>;
};

// ================================================================ À attribuer
function AAttribuer({ data, openClient, reload }: { data: Equipes; openClient: (id: number) => void; reload: () => void }) {
  const [site, setSite] = useState<string>('');
  const [page, setPage] = useState(0);
  const [res, setRes] = useState<{ total: number; rows: any[] } | null>(null);
  const [sel, setSel] = useState<number[]>([]);
  const [vers, setVers] = useState(0);
  const [verrou, setVerrou] = useState(false);
  const load = useCallback(() => { setRes(null); setSel([]); db.getCrmAAttribuer(site || null, page).then(setRes).catch(() => setRes({ total: 0, rows: [] })); }, [site, page]);
  useEffect(() => { load(); }, [load]);
  const V = data.vendeurs.filter((v) => !['sorti', 'archive'].includes(statut(v)) && (!site || v.site === site)).sort((a, b) => a.nom.localeCompare(b.nom));
  const give = () => db.attribuerCrm({ clients: sel, vendeur_id: vers || V[0]?.id, verrou }).then((r) => { hud(`${nf(r.clients)} client${r.clients > 1 ? 's' : ''} attribué${r.clients > 1 ? 's' : ''}`); load(); reload(); }).catch(err);
  const nom = (c: any) => (c.type === 'societe' ? c.nom : [c.nom, c.prenom].filter(Boolean).join(' ')) || 'Sans nom';
  return (
    <div className="scroll" style={{ height: '100%' }}><div className="eq-pad">
      <div><div className="crm-eye">File d’attente</div><h2 className="crm-name" style={{ fontSize: 22 }}>Clients à attribuer</h2>
        <div className="crm-note" style={{ maxWidth: 780 }}>Aucune règle n’a trouvé de vendeur (souvent : aucun vendeur du bon service ou de la bonne marque sur le site). On peut les répartir ici, ou ajouter un vendeur ou une règle : la file se vide au recalcul suivant.</div></div>
      <div className="row wrap" style={{ gap: 10 }}>
        <select className="select" style={{ maxWidth: 260 }} value={site} onChange={(e) => { setSite(e.target.value); setPage(0); }}><option value="">Tous les sites ({nf(data.a_attribuer.reduce((a, x) => a + x.n, 0))})</option>
          {data.a_attribuer.slice().sort((a, b) => b.n - a.n).map((x) => <option key={x.site || '—'} value={x.site || ''}>{x.site || 'Sans site'} ({nf(x.n)})</option>)}</select>
        <span className="grow" />
        {sel.length ? <><span className="crm-note">{sel.length} sélectionné{sel.length > 1 ? 's' : ''} →</span>
          <select className="select" style={{ maxWidth: 280 }} value={vers || V[0]?.id} onChange={(e) => setVers(Number(e.target.value))}>{V.map((v) => <option key={v.id} value={v.id}>{nomV(v)} · {v.site} {v.service} {FONCTIONS[v.fonction].l}</option>)}</select>
          <label className="row crm-note" style={{ gap: 6 }}><input type="checkbox" checked={verrou} onChange={(e) => setVerrou(e.target.checked)} />Verrouiller</label>
          <button className="btn primary" onClick={give}><Icon name="handshake" size="sm" />Attribuer</button></> : null}
      </div>
      {!res ? <div className="crm-note">Chargement…</div> : <div className="card scroll"><table className="eq-tbl"><thead><tr>
        <th style={{ width: 30 }}><input type="checkbox" checked={!!res.rows.length && sel.length === res.rows.length} onChange={(e) => setSel(e.target.checked ? res.rows.map((c) => Number(c.id)) : [])} /></th>
        <th>Client</th><th className="hide-m">CP</th><th>Site</th><th>Dernier achat</th><th className="hide-m">Pourquoi</th></tr></thead><tbody>
        {res.rows.map((c) => <tr key={c.id} className="cl" onClick={(e) => { if (!(e.target as HTMLElement).closest('input')) openClient(Number(c.id)); }}>
          <td><input type="checkbox" checked={sel.includes(Number(c.id))} onChange={(e) => setSel((s) => (e.target.checked ? [...s, Number(c.id)] : s.filter((x) => x !== Number(c.id))))} /></td>
          <td><b>{nom(c)}</b></td><td className="hide-m">{c.cp || '—'}</td><td>{c.site || '—'}</td><td>{[c.type_vh, brandName(c.marque)].filter(Boolean).join(' ')} · {dFR(c.date_achat)}</td><td className="hide-m faint">{c.detail || '—'}</td></tr>)}
        {!res.rows.length ? <tr><td colSpan={6} className="faint">{data.parametres.actif ? 'Aucun client à attribuer.' : 'Calcul des portefeuilles pas encore activé.'}</td></tr> : null}
      </tbody></table></div>}
      {res && res.total > 50 ? <div className="row" style={{ gap: 10, justifyContent: 'center' }}><button className="btn sm" disabled={!page} onClick={() => setPage(page - 1)}>Précédent</button>
        <span className="crm-note">Page {page + 1} / {Math.ceil(res.total / 50)} · {nf(res.total)} clients</span><button className="btn sm" disabled={(page + 1) * 50 >= res.total} onClick={() => setPage(page + 1)}>Suivant</button></div> : null}
    </div></div>
  );
}
