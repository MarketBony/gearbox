import React, { useMemo, useRef, useState } from 'react';
import type { AppProps } from '../types';
import { BrandChips, Icon, Seg, gx, hud, useEngineStore } from '../ui/kit';
import { db } from '../../../services/dataService';
import {
  type Fiche as FicheT, type Source, type Vehicule, type Vente, CIV, FAM_C, VH_C, VhPill, Plate, EtatBadge, Tabs,
  addM, avC, brandName, dFR, eur, finLeft, finTxt, fullName, initials, mDiff, mY, nameOf, nf, plural, rcuId, rel, tel, today, venteDate,
} from './common';

/**
 * Fiche client (GET /clients/:id) — maquette : `ficheHTML` et ses onglets. Lecture seule au lot 2, sauf « Séparer »
 * une identité (POST /clients/:id/separer). Couche Bony (vendeur référent réattribuable, « ne plus contacter »,
 * refus d'une coordonnée, échanges) : lot 3 — rien n'en est affiché comme s'il existait.
 */

type FTab = 'veh' | 'ventes' | 'fin' | 'coord' | 'src' | 'ech' | 'rel';
const cv = (c: string) => ({ '--c': c } as React.CSSProperties);
const vh = (f: FicheT, id: number | null) => (id == null ? undefined : f.vehicules.find((v) => v.id === id));
const vhOf = (v: Vente | undefined, f: FicheT) => (v ? vh(f, v.vehicule_id) : undefined);
const finOk = (v: Vente) => !!(v.fin && v.fin.fin && v.fin.famille !== 'Comptant');

// ---------------------------------------------------------------- Véhicules
const VehCard: React.FC<{ f: FicheT; v: Vehicule }> = ({ f, v }) => {
  const T = today();
  const s = f.ventes.filter((x) => x.vehicule_id === v.id && x.retenue).sort((a, b) => (venteDate(b) || '').localeCompare(venteDate(a) || ''))[0];
  const ct = v.ct_prochain;
  const ctC = v.actuel && ct ? (ct < T ? 'var(--danger)' : ct < addM(T, 2) ? 'var(--warn)' : '') : '';
  const first = !!v.date_mec && mDiff(v.date_mec, T) < 48 && !v.ct_dernier;
  return (
    <div className={`card crm-veh ${v.actuel ? '' : 'old'}`}>
      <div className="hd">{v.marque ? <BrandChips brands={[brandName(v.marque)]} /> : null}<span className="mo">{v.modele || 'Modèle inconnu'}</span><span className="faint">{v.version}</span><span className="grow" /><Plate immat={v.immat} /></div>
      <div className="crm-kv">
        <span>VIN</span><b className="crm-mono">{v.vin || '—'}</b>
        <span>Énergie</span><b>{v.energie || '—'}</b>
        <span>1re mise en circ.</span><b>{dFR(v.date_mec)}</b>
        {s ? <><span>Acheté</span><b><VhPill source={s.source} /> le {dFR(venteDate(s))} · {s.site || 'site à classer'}</b></> : null}
        {!v.actuel ? <><span>Sorti du parc</span><b>Revendu depuis : ce client n’en est plus le dernier acheteur connu</b></>
          : <><span>{first ? '1er contrôle technique' : 'Prochain CT'}</span><b style={ctC ? { color: ctC } : undefined}>{ct ? <>{dFR(ct)} <span className="faint" style={{ fontWeight: 500 }}>· {rel(ct)}</span></> : '—'}</b></>}
        {v.ct_dernier ? <><span>Dernier CT</span><b>{dFR(v.ct_dernier)}</b></> : null}
      </div>
    </div>
  );
};
const VehTab: React.FC<{ f: FicheT }> = ({ f }) => {
  const cur = f.vehicules.filter((v) => v.actuel), old = f.vehicules.filter((v) => !v.actuel);
  return <>
    <div className="crm-sec"><h3 className="crm-h2">Parc actuel <span className="n">{cur.length}</span></h3>
      {cur.length ? <div className="crm-vgrid">{cur.map((v) => <VehCard key={v.id} f={f} v={v} />)}</div> : <div className="crm-note">Aucun véhicule dont ce client soit le dernier acheteur connu.</div>}
      <div className="crm-note">Parc actuel = véhicules dont ce client est le dernier acheteur connu (clé : VIN, à défaut la plaque).</div></div>
    {old.length ? <div className="crm-sec"><h3 className="crm-h2">Historique <span className="n">{old.length}</span></h3><div className="crm-vgrid">{old.map((v) => <VehCard key={v.id} f={f} v={v} />)}</div></div> : null}
  </>;
};

// ---------------------------------------------------------------- Ventes (frise)
const VentesTab: React.FC<{ f: FicheT; ventes: Vente[] }> = ({ f, ventes }) => {
  const [vf, setVf] = useState<'all' | Source>('all');
  const has = (k: Source) => ventes.some((s) => s.source === k);
  const L = ventes.filter((s) => vf === 'all' || s.source === vf);
  const exclues = f.ventes.length - ventes.length;
  return <>
    <div className="row wrap" style={{ justifyContent: 'space-between', gap: 10 }}>
      <Seg value={vf} onChange={setVf} options={([['all', 'Toutes'], ['VN', 'VN'], ['VO', 'VO'], ['BSO', 'Ancienne base']] as ['all' | Source, string][]).filter(([k]) => k === 'all' || has(k as Source))} />
      <span className="crm-note">Seules les ventes retenues apparaissent (particuliers et sociétés, R3){exclues > 0 ? ` · ${plural(exclues, 'vente exclue')} masquée${exclues > 1 ? 's' : ''}` : ''}.</span></div>
    <div className="crm-tl">{L.map((s) => {
      const v = vhOf(s, f), fn = finOk(s) ? s.fin : null;
      return (
        <div key={s.id} className={`card crm-ev ${s.absente_depuis ? 'gone' : ''}`} style={cv(VH_C[s.source])}>
          <div className="hd"><VhPill source={s.source} />{s.type_vh === 'AUTRE' ? <span className="crm-tag" data-tip="« Relation client » de l’ancienne base">Autre</span> : null}
            <b style={{ fontSize: 14.5 }}>{s.source === 'BSO' ? 'Évènement' : s.date_livraison ? 'Livrée' : 'Commandée'} le {dFR(venteDate(s))}</b>
            {s.source !== 'BSO' && s.date_livraison && s.date_commande ? <span className="faint" style={{ fontSize: 12.5 }}>commande {dFR(s.date_commande)}</span> : null}
            <span className="grow" />{s.montant_tarif != null ? <b className="num">{eur(s.montant_tarif)}</b> : null}</div>
          {v ? <div className="row wrap" style={{ gap: 8 }}>{v.marque ? <BrandChips brands={[brandName(v.marque)]} /> : null}<b>{v.modele}</b><span className="faint">{[v.version, v.energie].filter(Boolean).join(' · ')}</span><Plate immat={v.immat} /></div> : null}
          {s.absente_depuis ? <div className="crm-note" style={{ color: 'var(--warn)' }}><Icon name="alert" size="sm" /> Disparue de l’import du {dFR(s.absente_depuis)} : conservée et marquée, jamais supprimée.</div> : null}
          <div className="kv2">
            <div className="crm-kv">
              <span>Site</span><b>{s.site || 'à classer'}</b>
              {s.affaire ? <><span>{s.source === 'BSO' ? 'Compte évènement' : 'Affaire'}</span><b className="crm-mono">{s.affaire}</b></> : null}
              {s.dossier ? <><span>N° de dossier</span><b className="crm-mono">{s.dossier}</b></> : null}
              <span>Type de vente</span><b>{s.type_vente || '—'}</b>
            </div>
            <div className="crm-kv">
              <span>Vendeur{s.vendeurs.length > 1 ? 's' : ''}</span><b>{s.vendeurs.join(', ') || '—'}</b>
              {s.intermediaire ? <><span>Intermédiaire</span><b>{s.intermediaire} <span className="crm-tag">Agent R2</span></b></> : null}
              {s.montant_reprise ? <><span>Reprise</span><b>{eur(s.montant_reprise)}</b></> : null}
              <span>Financement</span><b>{fn ? [fn.organisme, fn.famille, fn.duree ? `${fn.duree} mois` : null].filter(Boolean).join(' · ') : s.fin ? 'Comptant' : '—'}</b>
            </div>
          </div>
        </div>
      );
    })}{!L.length ? <div className="crm-note">Aucune vente retenue.</div> : null}</div>
  </>;
};

// ---------------------------------------------------------------- Financements et garanties
const FinTab: React.FC<{ f: FicheT; ventes: Vente[] }> = ({ f, ventes }) => {
  const T = today();
  const L = ventes.filter(finOk).sort((a, b) => b.fin!.fin!.localeCompare(a.fin!.fin!));
  const g = ventes.filter((s) => s.garantie).slice().sort((a, b) => (venteDate(b) || '').localeCompare(venteDate(a) || ''));
  return <>
    <div className="crm-sec"><h3 className="crm-h2">Financements <span className="n">{L.length}</span></h3>
      {L.map((s) => {
        const fn = s.fin!, end = fn.fin!, done = end < T, left = finLeft(end), v = vhOf(s, f);
        const tot = fn.debut ? mDiff(fn.debut, end) : 0, el = fn.debut ? Math.min(tot, Math.max(0, mDiff(fn.debut, T))) : 0;
        const pct = tot > 0 ? Math.round((el / tot) * 100) : done ? 100 : 0;
        const col = done ? 'var(--text-3)' : left < 3 ? 'var(--danger)' : left < 6 ? 'var(--warn)' : FAM_C[fn.famille || ''] || 'var(--info)';
        const diac = fn.organisme === 'DIAC';
        return (
          <div key={s.id} className="card crm-fin">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
              <div className="hd"><span className={`badge ${diac ? 'solid' : ''}`} style={{ '--c': diac ? '#ffcc33' : 'var(--info)', ...(diac ? { color: '#1b1604' } : {}) } as React.CSSProperties}>{fn.organisme || 'Organisme inconnu'}</span>
                <span className="fam">{fn.famille || 'Famille inconnue'}</span>{fn.produit ? <span className="faint crm-mono" data-tip="Libellé ou code DCS brut, traduit par ref_financement">{fn.produit}</span> : null}</div>
              <div className="crm-kv">
                <span>Véhicule</span><b>{v ? [v.modele, v.immat].filter(Boolean).join(' · ') : '—'}</b>
                <span>Vente</span><b><VhPill source={s.source} /> du {dFR(venteDate(s))} · {s.site || 'site à classer'}</b>
                <span>Début → fin</span><b>{dFR(fn.debut)} → {dFR(end)}</b>
                <span>Durée</span><b>{fn.duree != null ? `${fn.duree} mois` : '—'}{fn.duree_calculee ? <> <span className="crm-tag" data-tip="Saisie à 0 dans DCS (règle au VO) : calculée depuis le début et la fin">calculée</span></> : null}</b>
              </div>
            </div>
            <div className="crm-prog"><span className="crm-lbl">{done ? 'Terminé' : 'Avancement jusqu’à l’échéance'}</span>
              <span className="big" style={{ color: col }}>{done ? `Terminé depuis ${Math.max(1, Math.round(-left))} mois` : `Échéance ${finTxt(end).replace('fin ', '')}`}</span>
              <div className="bar"><i style={{ width: `${pct}%`, '--c': col } as React.CSSProperties} /></div>
              <div className="lg"><span>{mY(fn.debut)}</span><span>{pct} %</span><span>{mY(end)}</span></div></div>
          </div>
        );
      })}
      {!L.length ? <div className="crm-note">Aucun financement connu : achats au comptant ou financement hors Bony.</div> : null}</div>
    <div className="crm-sec"><h3 className="crm-h2">Garanties <span className="n">{g.length}</span></h3>
      {g.length ? <div className="card scroll"><table className="tbl"><thead><tr><th>Véhicule</th><th>Garantie</th><th>Code</th><th className="r">Kilométrage</th><th>Vente</th></tr></thead><tbody>
        {g.map((s) => { const v = vhOf(s, f); return (
          <tr key={s.id}><td><b>{v?.modele || '—'}</b> <span className="faint">{v?.immat}</span></td><td>{s.garantie!.libelle || '—'}</td><td className="crm-mono">{s.garantie!.code || '—'}</td>
            <td className="r num">{s.garantie!.km ? `${nf(s.garantie!.km)} km` : '—'}</td><td className="num">{dFR(venteDate(s))}</td></tr>); })}
      </tbody></table></div> : <div className="crm-note">Aucune garantie transmise.</div>}
      <div className="crm-note">DCS ne transmet que le contrat (code, libellé) et le kilométrage : aucune date de fin de garantie n’est affichée.</div></div>
  </>;
};

// ---------------------------------------------------------------- Coordonnées
const C_TYPE: Record<string, { l: string; i: string }> = { portable: { l: 'Portable', i: 'sms' }, fixe: { l: 'Fixe', i: 'message' }, email: { l: 'E-mail', i: 'mail' } };
const CoordTab: React.FC<{ f: FicheT }> = ({ f }) => {
  const c = f.client;
  const addr = [c.num_rue, c.type_rue, c.rue].filter(Boolean).join(' ');
  return (
    <div className="crm-sec">
      <div className="card scroll"><table className="tbl crm-ctbl"><thead><tr><th>Type</th><th>Coordonnée</th><th>État</th><th>Motif</th><th>Source</th><th /></tr></thead><tbody>
        {f.contacts.map((k, i) => { const t = C_TYPE[k.type] || C_TYPE.fixe; return (
          <tr key={i} className={k.etat === 'suspect' ? 'sus' : ''}><td><Icon name={t.i} size="sm" /> {t.l}</td>
            <td><b className={`val ${k.type === 'email' ? '' : 'num'}`}>{k.type === 'email' ? k.valeur : tel(k.valeur)}</b></td>
            <td><EtatBadge etat={k.etat} /></td><td className="crm-note" style={{ maxWidth: 280 }}>{k.motif || '—'}</td>
            <td style={{ fontSize: 12.5 }}><span className="row wrap" style={{ gap: 4 }}>{k.sources.map((s) => <VhPill key={s} source={s} />)}</span>{k.derniere_vue ? <div className="faint">vue le {dFR(k.derniere_vue)}</div> : null}</td>
            <td className="r">{k.etat === 'suspect' ? <span className="faint" style={{ fontSize: 12 }} data-tip="Recalculé à chaque import (R4)">automatique</span> : null}</td></tr>); })}
        <tr><td><Icon name="pin" size="sm" /> Adresse</td><td><b>{addr || '—'}</b><div className="faint">{[c.cp, c.ville].filter(Boolean).join(' ')}</div></td><td><EtatBadge etat="valide" /></td>
          <td className="crm-note">Celle de la vente la plus récente</td><td style={{ fontSize: 12.5 }}><VhPill source={c.source_derniere} /></td><td /></tr>
      </tbody></table></div>
      {!f.contacts.length ? <div className="crm-note">Aucun téléphone ni e-mail connu.</div> : null}
      <div className="crm-legend"><span><EtatBadge etat="valide" /> utilisable pour rapprocher et relancer</span><span><EtatBadge etat="suspect" /> partagée par trop d’identités, domaine Bony ou numéro bidon : ni rapprochement ni relance (R4)</span></div>
    </div>
  );
};

// ---------------------------------------------------------------- Sources
const NUM_L: Record<Source, string> = { BSO: 'n° de fiche', VN: 'n° client propriétaire', VO: 'n° compte client' };
const SrcTab: React.FC<{ f: FicheT; onSep: (identite: FicheT['identites'][number]) => void }> = ({ f, onSep }) => (
  <>
    <div className="crm-note">Une <b>identité source</b> est ce que DCS appelle un client : clé source · société · numéro (le numéro DCS n’est unique que par société, et le VO a sa propre numérotation). Le client SPARK regroupe ses identités ; ses attributs viennent de la vente la plus récente. Une décision manuelle est <b>rejouée à chaque import</b>.</div>
    <div className="crm-idgrid">{f.identites.map((x) => {
      const manuel = /à la main/i.test(x.regle), origine = /seule|référence/i.test(x.regle);
      return (
        <div key={x.id} className="card crm-idc">
          <div className="hd"><VhPill source={x.source} /><b>{x.societe}</b><span className="faint">{NUM_L[x.source]}</span><b className="crm-mono">{x.numero}</b><span className="grow" />
            {f.identites.length > 1 ? <button className="btn sm ghost" data-tip="Décision manuelle : cette identité deviendra un client distinct" onClick={() => onSep(x)}>Séparer</button> : null}</div>
          <div className="crm-kv">
            <span>Nom dans DCS</span><b className="crm-mono">{[x.nom, x.prenom].filter(Boolean).join(' ') || '—'}</b>
            <span>Lieu</span><b>{[x.cp, x.ville].filter(Boolean).join(' ') || '—'}</b>
            <span>Rattachement</span><b><span className="badge" style={cv(origine ? 'var(--text-3)' : manuel ? 'var(--bony-violet)' : 'var(--ok)')}>{x.regle}</span></b>
          </div>
        </div>
      );
    })}</div>
  </>
);

// ---------------------------------------------------------------- Échanges, Relances (lots 3 et 4)
const SoonTab: React.FC<{ k: 'ech' | 'rel'; f: FicheT; ventes: Vente[] }> = ({ k, f, ventes }) => {
  if (k === 'ech') return (
    <div className="crm-soon"><Icon name="message" size="lg" /><div><b style={{ color: 'var(--text)' }}>Échanges — arrive avec le lot 4</b>
      <div className="crm-note" style={{ marginTop: 4 }}>Appels, visites, e-mails et notes des vendeurs, qualification du client, réattribution du vendeur. Couche Bony : saisie par les utilisateurs, jamais touchée par l’import du soir.</div>
      <button className="btn sm" style={{ marginTop: 12 }} disabled><Icon name="plus" size="sm" />Noter un échange</button></div></div>
  );
  const T = today(), c = f.client, out: [string, string, string][] = [];
  if (c.fin?.fin) out.push(['euro', `Fin de ${c.fin.famille || 'financement'} le ${dFR(c.fin.fin)}`, finTxt(c.fin.fin)]);
  const cur = f.vehicules.filter((v) => v.actuel);
  cur.forEach((v) => { if (v.ct_prochain && v.ct_prochain >= T && v.ct_prochain < addM(T, 12)) out.push(['car', `Contrôle technique ${v.modele || ''} (${v.immat || '—'})`, dFR(v.ct_prochain)]); });
  cur.forEach((v) => { if (!v.date_mec) return; const a = Math.floor(mDiff(v.date_mec, T) / 12); if (a >= 4) out.push(['clock', `${v.modele || 'Véhicule'} : ${a} ans`, 'âge du véhicule']); });
  const last = ventes.map(venteDate).filter(Boolean).sort().pop();
  if (last) { const y = Math.floor(mDiff(last, T) / 12); if (y >= 4) out.push(['refresh', `Sans achat depuis ${y} ans`, `dernier : ${dFR(last)}`]); }
  return (
    <div className="crm-soon"><Icon name="bell" size="lg" /><div className="grow"><b style={{ color: 'var(--text)' }}>Relances — suivi par client au lot 4</b> <span className="faint" style={{ fontWeight: 500 }}>· les listes se construisent dès le lot 3 dans le Requêteur</span>
      <div className="crm-note" style={{ marginTop: 4 }}>Règles réglables (fin de financement, CT, anniversaire, âge du véhicule, sans achat depuis X ans), listes exportables. Aperçu de ce que ce client déclencherait :</div>
      <div className="crm-rel" style={{ marginTop: 12 }}>{out.length ? out.map(([i, l, h], j) => <div key={j}><Icon name={i} size="sm" /><span className="grow">{l}</span><span className="faint">{h}</span></div>) : <div>Aucun déclencheur pour l’instant.</div>}</div></div></div>
  );
};

// ---------------------------------------------------------------- Fiche
export const FicheView: React.FC<{ f: FicheT; win: AppProps['win']; onChanged: (newId?: number) => void }> = ({ f, win, onChanged }) => {
  const [tab, setTab] = useEngineStore<FTab>('crm.ftab', 'veh');
  const tabsRef = useRef<HTMLDivElement>(null);
  const c = f.client;
  const ventes = useMemo(() => f.ventes.filter((v) => v.retenue).sort((a, b) => (venteDate(b) || '').localeCompare(venteDate(a) || '')), [f]);
  const T = today();
  const nb = (k: Source) => ventes.filter((s) => s.source === k).length;
  const cur = f.vehicules.filter((v) => v.actuel);
  const cts = cur.map((v) => v.ct_prochain).filter(Boolean).sort()[0] as string | undefined;
  const nSus = f.contacts.filter((k) => k.etat === 'suspect').length;
  const lastFin = ventes.filter((s) => finOk(s) && s.fin!.fin! < T).sort((a, b) => b.fin!.fin!.localeCompare(a.fin!.fin!))[0];
  const first = ventes.map(venteDate).filter(Boolean).sort()[0];
  const last = ventes[0];
  const addr = [[c.num_rue, c.type_rue, c.rue].filter(Boolean).join(' '), [c.cp, c.ville].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  const tabs: [FTab, string, number | string][] = [['veh', 'Véhicules', f.vehicules.length], ['ventes', 'Ventes', ventes.length], ['fin', 'Financements et garanties', ventes.filter(finOk).length],
    ['coord', 'Coordonnées', f.contacts.length], ['src', 'Sources', f.identites.length], ['ech', 'Échanges', 'lot 4'], ['rel', 'Relances', 'lot 4']];
  const goto = (t: FTab) => { setTab(t); tabsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); };

  const more = (el: HTMLElement) => gx().menu.open([
    { header: 'Couche Bony — lot 4' },
    { label: 'Réattribuer le vendeur référent…', icon: 'handshake', disabled: true },
    '-', { label: 'Copier l’identifiant SPARK', icon: 'copy', action: () => { try { navigator.clipboard?.writeText(rcuId(c.id)); } catch { /* presse-papier refusé */ } hud(`${rcuId(c.id)} copié`); } },
  ], el, { align: 'right' });

  const esc = gx().esc;
  const separer = (x: FicheT['identites'][number]) => win.sheet(`<h3>Séparer cette identité ?</h3><div class="muted" style="line-height:1.55">L’identité <b style="color:var(--text)">${esc(x.source)} · ${esc(x.societe)} · ${esc(x.numero)}</b> sera détachée de ${esc(nameOf(c))} et deviendra un client distinct.<br><br>La décision est enregistrée et <b style="color:var(--text)">rejouée à chaque import</b> : la nuit ne la défera pas.</div>
    <div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok">Séparer</button></div>`, { onClose: (v: unknown) => {
    if (v !== 'ok') return;
    db.separerCrmIdentite(c.id, x.id).then((r) => { hud(`Identité séparée · nouveau client ${rcuId(r.client)}`); onChanged(); }).catch((e) => hud(e.message || 'Séparation refusée.'));
  } });

  return (
    <div className="crm-fiche">
      <div className="crm-crumb"><span className="c">Clients <span>/</span> <b className="ellipsis" style={{ maxWidth: 300 }}>{nameOf(c)}</b><span className="num hide-s crm-mono" style={{ marginLeft: 8 }} data-tip="Identifiant SPARK : attribué à vie, survit aux fusions">{rcuId(c.id)}</span></span>
        <div className="acts"><button className="btn" aria-label="Plus d’actions" data-tip="Vendeur référent, copier l’identifiant…" onClick={(e) => more(e.currentTarget)}><Icon name="more" size="sm" /></button></div></div>
      <div className="crm-idt"><span className="av" style={cv(avC(c.id))}>{initials(c)}</span><div className="grow">
        <div className="crm-eye">{c.type === 'societe' ? 'Société' : 'Particulier'}{first ? ` · client depuis ${first.slice(0, 4)}` : ''}</div>
        <h2 className="crm-name">{fullName(c)}</h2>
        <div className="crm-addr">{addr || 'Adresse inconnue'}</div>
        <div className="crm-tags">
          {c.civilite ? <span className="badge" style={cv('var(--info)')} data-tip={`Civilité normalisée (4 valeurs). Libellé DCS : « ${c.civilite_dcs || '—'} »`}><Icon name={c.type === 'societe' ? 'building' : 'user'} size="sm" />{CIV[c.civilite]?.l}</span> : null}
          {c.site ? <span className="badge" data-tip="Site principal : celui de la dernière vente"><Icon name="pin" size="sm" />{c.site}</span> : null}
          <BrandChips brands={c.marques.map(brandName)} />
          {c.vendeur ? <span className="badge" style={cv('var(--bony-violet)')} data-tip="Par défaut : vendeur de la dernière vente. Réattribuable au lot 4 (R6)."><Icon name="handshake" size="sm" />Vendeur référent : {c.vendeur}</span> : null}
          {nSus ? <span className="badge" style={cv('var(--danger)')}><Icon name="alert" size="sm" />{nSus} coordonnée{nSus > 1 ? 's' : ''} suspecte{nSus > 1 ? 's' : ''}</span> : null}
        </div></div></div>
      <div className="crm-facts">
        <div className="card crm-fact" onClick={() => goto('veh')}><span className="crm-lbl">Parc actuel</span><span className="v">{plural(cur.length, 'véhicule')}</span><span className="h">{f.vehicules.length - cur.length ? `+ ${f.vehicules.length - cur.length} en historique` : 'aucun historique'}</span></div>
        <div className="card crm-fact" onClick={() => goto('ventes')}><span className="crm-lbl">Ventes</span><span className="v">{ventes.length}</span><span className="h">{[nb('VN') && `${nb('VN')} VN`, nb('VO') && `${nb('VO')} VO`, nb('BSO') && `${nb('BSO')} anc. base`].filter(Boolean).join(' · ')}{last ? ` · dernière ${mY(venteDate(last))}` : ''}</span></div>
        <div className="card crm-fact" onClick={() => goto('fin')}><span className="crm-lbl">Financement en cours</span>
          <span className="v" style={c.fin?.fin && finLeft(c.fin.fin) < 6 ? { color: 'var(--warn)' } : undefined}>{c.fin ? [c.fin.famille, c.fin.organisme].filter(Boolean).join(' · ') || 'En cours' : 'Aucun'}</span>
          <span className="h">{c.fin?.fin ? `échéance le ${dFR(c.fin.fin)} (${finTxt(c.fin.fin).replace('fin ', '')})` : lastFin ? `dernier terminé le ${dFR(lastFin.fin!.fin)}` : 'jamais financé chez Bony'}</span></div>
        <div className="card crm-fact" onClick={() => goto('veh')}><span className="crm-lbl">Prochain contrôle technique</span><span className="v" style={cts && cts < addM(T, 2) ? { color: 'var(--warn)' } : undefined}>{cts ? dFR(cts) : '—'}</span><span className="h">{cts ? rel(cts) : cur.length ? 'non connu' : 'aucun véhicule au parc'}</span></div>
      </div>
      <div className="crm-tabsbar" ref={tabsRef}><Tabs value={tab} onChange={setTab} options={tabs.map(([k, l, n]) => [k, <>{l}{typeof n === 'number' ? <> <span className="k">{n}</span></> : <> <span className="soon">{n}</span></>}{k === 'coord' && nSus ? <span style={{ color: 'var(--danger)', display: 'inline-flex' }}><Icon name="alert" size="sm" /></span> : null}</>] as [FTab, React.ReactNode])} /></div>
      <div className="crm-tabc">
        {tab === 'ventes' ? <VentesTab f={f} ventes={ventes} /> : tab === 'fin' ? <FinTab f={f} ventes={ventes} /> : tab === 'coord' ? <CoordTab f={f} />
          : tab === 'src' ? <SrcTab f={f} onSep={separer} /> : tab === 'ech' || tab === 'rel' ? <SoonTab k={tab} f={f} ventes={ventes} /> : <VehTab f={f} />}
      </div>
    </div>
  );
};

/** Fiche chargée par son id, avec un cache partagé par la rubrique (une fiche déjà ouverte ne se recharge pas). */
export const FicheLoader: React.FC<{ id: number; cache: Map<number, FicheT>; win: AppProps['win']; onChanged: () => void; onRedirect: (id: number) => void }> = ({ id, cache, win, onChanged, onRedirect }) => {
  const [state, setState] = useState<{ id: number; f?: FicheT; err?: string } | null>(() => (cache.has(id) ? { id, f: cache.get(id) } : null));
  const [tick, setTick] = useState(0);
  React.useEffect(() => {
    if (cache.has(id)) { setState({ id, f: cache.get(id) }); return; }
    let live = true; setState(null);
    db.getCrmClient(id).then((r: any) => {
      if (!live) return;
      if (r && typeof r.redirect === 'number') { onRedirect(r.redirect); return; }
      cache.set(id, r); setState({ id, f: r });
    }).catch((e) => live && setState({ id, err: e.message || 'Fiche introuvable.' }));
    return () => { live = false; };
  }, [id, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!state || state.id !== id) return <div className="empty" style={{ height: '100%' }}>Chargement de la fiche…</div>;
  if (state.err) return <div className="empty" style={{ height: '100%' }}><Icon name="alert" />{state.err}</div>;
  return <FicheView key={id} f={state.f!} win={win} onChanged={() => { cache.delete(id); setTick((n) => n + 1); onChanged(); }} />;
};
