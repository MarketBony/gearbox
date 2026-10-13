import React, { useCallback, useState } from 'react';
import type { AppProps } from '../types';
import { Icon, Seg, Stack, gx, hud } from '../ui/kit';
import { db } from '../../../services/dataService';
import type { Source } from './common';

/**
 * Onglet « Imports » (lot 1, journal `rcu.import_run`) — l'écran du correctif 82, déplacé tel quel dans un onglet.
 * Réservé au rôle Master (maquette) ; le refus réel est côté serveur (`/api/crm`, CRM_ROLES).
 */

export interface Run {
  id: number; source: Source; fichier: string; empreinte: string; recu_le: string | null; debut: string; fin: string | null;
  statut: 'en_cours' | 'applique' | 'refuse' | 'erreur'; force: boolean; message: string | null;
  stats: Record<string, any>; force_demande_le: string | null; force_demandeur: string | null;
}

export const RUN_ST: Record<Run['statut'], { l: string; c: string; i: string }> = {
  applique: { l: 'Appliqué', c: 'var(--ok)', i: 'check' },
  refuse: { l: 'Refusé', c: 'var(--warn)', i: 'alert' },
  erreur: { l: 'Erreur', c: 'var(--danger)', i: 'close' },
  en_cours: { l: 'En cours', c: 'var(--info)', i: 'clock' },
};
const VH_C: Record<Source, string> = { VN: 'var(--info)', VO: 'var(--accent)', BSO: 'var(--text-3)' };
const n = (v: unknown) => (typeof v === 'number' ? v.toLocaleString('fr-FR') : '—');
export const hm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—');
const jour = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
export const quand = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso), auj = new Date();
  const hier = new Date(auj); hier.setDate(auj.getDate() - 1);
  if (d.toDateString() === auj.toDateString()) return `aujourd’hui à ${hm(iso)}`;
  if (d.toDateString() === hier.toDateString()) return `hier à ${hm(iso)}`;
  return `${jour(iso)} à ${hm(iso)}`;
};
const duree = (s: unknown) => (typeof s !== 'number' ? '—' : s >= 60 ? `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')} s` : `${s.toString().replace('.', ',')} s`);

const Pill: React.FC<{ source: Source }> = ({ source }) => <span className="crm-pill" style={{ '--c': VH_C[source] } as React.CSSProperties}>{source === 'BSO' ? 'Anc. base' : source}</span>;
export const Badge: React.FC<{ run: Run }> = ({ run }) => {
  const s = RUN_ST[run.statut];
  return <span className="badge" style={{ '--c': s.c } as React.CSSProperties}><i className="dot" />{s.l}{run.force ? ' (forcé)' : ''}</span>;
};
/** Ligne de contrôle : vrai = vert, faux = rouge, null = sans objet. */
const Check: React.FC<{ ok: boolean | null; label: string; hint?: string }> = ({ ok, label, hint }) => (
  <div>
    <span style={{ color: ok === true ? 'var(--ok)' : ok === false ? 'var(--danger)' : 'var(--text-3)' }}><Icon name={ok === true ? 'check' : ok === false ? 'close' : 'minus'} size="sm" /></span>
    <span className="grow">{label}</span><span className="faint num" style={{ fontSize: 12.5 }}>{hint}</span>
  </div>
);

const RunItem = React.memo(function RunItem({ run, sel, onOpen }: { run: Run; sel: boolean; onOpen: (id: number) => void }) {
  const s = run.stats || {};
  return (
    <button className={`crm-run ${run.statut !== 'applique' ? 'ko' : ''} ${sel ? 'sel' : ''}`} style={{ '--c': RUN_ST[run.statut].c } as React.CSSProperties} onClick={() => onOpen(run.id)}>
      <div className="n"><Pill source={run.source} /><b className="num">n° {run.id}</b><span className="faint ellipsis grow">{jour(run.debut)} · {hm(run.debut)}</span><Badge run={run} /></div>
      <div className="s"><span className="grow ellipsis">{s.lignesLues != null ? `${n(s.lignesLues)} lignes` : 'fichier non lu'}{s.ventesNouvelles != null ? ` · +${n(s.ventesNouvelles)} ventes` : ''}</span><span className="num">{duree(s.dureeSecondes)}</span></div>
    </button>
  );
});

const Detail: React.FC<{ run: Run | undefined; runs: Run[]; win: AppProps['win']; reload: () => void }> = ({ run, runs, win, reload }) => {
  const [classes, setClasses] = useState<Record<string, string>>({});
  if (!run) return <div className="empty" style={{ height: '100%' }}><Icon name="upload" />Sélectionnez un import</div>;
  const s = run.stats || {}, st = RUN_ST[run.statut];
  const msg = run.message || '';
  const prev = runs.filter((y) => y.source === run.source && y.id < run.id && y.statut === 'applique').sort((a, b) => b.id - a.id)[0];
  const avant = s.lignesAvant ?? prev?.stats?.lignesClient;
  const variation = avant && s.lignesClient != null ? ((s.lignesClient - avant) / avant) * 100 : null;
  const manque = msg.startsWith('Colonnes obligatoires absentes');
  const totalKo = msg.startsWith('Ligne de total absente') || msg.startsWith('Le total annoncé');
  const forcable = run.statut === 'refuse' && s.lignesAvant != null && !run.force_demande_le;
  const exclusions: { motif: string; nb: number }[] = s.exclusions || [];
  const aClasser: { affaire: string | null; libelle: string | null; compte_evenement: string | null; nb: number }[] = s.sitesAClasser || [];

  const forcer = () => win.sheet(`<div class="row" style="gap:12px;color:var(--warn)">${gx().icon('alert', 'lg')}<h3 style="margin:0;color:var(--text)">Appliquer quand même ?</h3></div>
    <div class="muted" style="margin-top:10px;line-height:1.55">${gx().esc(msg)}<br><br>Le fichier sera appliqué tel quel : <b style="color:var(--text)">les ventes absentes de ce fichier seront marquées « disparues »</b> (environ ${n(Math.max(0, (s.lignesAvant ?? 0) - (s.lignesClient ?? 0)))}). À ne faire que si la baisse est expliquée.</div>
    <div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok" style="background:var(--warn)">Appliquer quand même</button></div>`,
  { width: 480, onClose: (v: unknown) => {
    if (v !== 'ok') return;
    db.forcerCrmImport(run.id).then(() => { hud('Demande envoyée : le serveur l’applique dans la minute.'); reload(); }).catch((e) => hud(e.message || 'Demande refusée.'));
  } });

  const classer = (el: HTMLElement, a: (typeof aClasser)[number], k: string) => gx().ui.sitePicker(el, [], ([site]: string[]) => {
    if (!site) return;
    gx().ui.closePick?.();
    const body = a.compte_evenement ? { compte: a.compte_evenement, site } : { affaire: a.affaire ?? '', libelle: a.libelle ?? '', site };
    db.classerCrmSite(body).then(() => { setClasses((c) => ({ ...c, [k]: site })); hud(`Correspondance ajoutée → ${site}. Effet au prochain import.`); })
      .catch((e) => hud(e.message || 'Classement refusé.'));
  }, { variant: 'filter', multi: false, title: 'Site Gearbox' });

  return (
    <div className="crm-rd">
      <div className="crm-crumb"><span className="c">Imports <span>/</span> <b>n° {run.id}</b></span>
        <div className="acts">{forcable ? <button className="btn" style={{ color: 'var(--warn)' }} onClick={forcer}><Icon name="bolt" size="sm" />Appliquer quand même…</button> : null}</div></div>
      <div>
        <div className="crm-eye">{run.source === 'BSO' ? 'Import unique · ancienne base Sud-Ouest' : `Requête ${run.source} du soir`}</div>
        <h2 className="crm-name" style={{ fontSize: 22 }}>{run.fichier}</h2>
        <div className="crm-tags"><Badge run={run} />{run.recu_le ? <span className="badge"><Icon name="clock" size="sm" />reçu {quand(run.recu_le)}</span> : null}
          <span className="badge">traité de {hm(run.debut)} à {hm(run.fin)} · {duree(s.dureeSecondes)}</span>
          <span className="badge crm-mono" data-tip="Empreinte sha256 : un même fichier n’est jamais appliqué deux fois">{run.empreinte.slice(0, 12)}…</span></div>
      </div>
      {run.force_demande_le ? <div className="crm-msg" style={{ '--c': 'var(--info)' } as React.CSSProperties}><Icon name="clock" /><div>Application forcée demandée par {run.force_demandeur} {quand(run.force_demande_le)} : le serveur la traite dans la minute.</div></div> : null}
      {msg && msg !== 'Import appliqué.' ? <div className="crm-msg" style={{ '--c': run.statut === 'applique' ? 'var(--info)' : st.c } as React.CSSProperties}><Icon name={run.statut === 'applique' ? 'info' : st.i} /><div>{msg}</div></div> : null}
      <div className="crm-g2 eq">
        <div className="card crm-panel"><h3 className="crm-h2">Contrôles</h3><div className="crm-chk">
          <Check ok={manque ? false : s.lignesClient != null ? true : null} label={manque ? 'En-têtes : colonne obligatoire absente' : 'En-têtes reconnus par leur nom'} />
          {run.source === 'BSO' ? <Check ok={null} label="Ligne de total" hint="absente dans ce fichier (normal)" />
            : <Check ok={totalKo ? false : s.totalAnnonce != null ? s.totalAnnonce === s.lignesLues : null} label="Ligne de total présente et égale au nombre de lignes" hint={s.totalAnnonce != null ? `${n(s.totalAnnonce)} = ${n(s.lignesLues)}` : ''} />}
          {run.source === 'BSO' || variation == null ? <Check ok={null} label="Volume comparé à l’import précédent" hint={run.source === 'BSO' ? 'import unique' : 'premier import'} />
            : <Check ok={variation > -10} label={`Volume comparé à l’import précédent (seuil −10 %)`} hint={`${variation > 0 ? '+' : ''}${variation.toFixed(1).replace('.', ',')} %`} />}
          <Check ok={run.statut === 'erreur' ? false : run.statut === 'applique' ? true : null} label="Écriture en base (transaction unique)" hint={run.statut === 'erreur' ? 'annulée' : run.statut === 'refuse' ? 'non tentée' : run.statut === 'applique' ? 'validée' : ''} />
        </div></div>
        <div className="card crm-panel"><h3 className="crm-h2">Lignes du fichier</h3>
          {s.lignesLues != null ? <div className="crm-cnt">
            <div><span className="crm-lbl">Lues</span><b>{n(s.lignesLues)}</b></div>
            <div><span className="crm-lbl">Sans client</span><b>{n(s.sansClient)}</b></div>
            <div><span className="crm-lbl">Exclues</span><b>{n(s.ventes != null && s.retenues != null ? s.ventes - s.retenues : undefined)}</b></div>
            <div><span className="crm-lbl">Retenues</span><b style={{ color: 'var(--ok)' }}>{n(s.retenues)}</b></div>
          </div> : <div className="crm-note">Le fichier n’a pas été lu.</div>}
          {s.ventes != null && s.lignesClient != null && s.ventes < s.lignesClient
            ? <div className="crm-note">{n(s.lignesClient)} lignes avec client regroupées en {n(s.ventes)} ventes ({run.source === 'BSO' ? 'un même évènement répété par compte comptable' : 'un dossier sur plusieurs lignes, une par vendeur'}).</div> : null}
        </div>
      </div>
      {s.ventesEcrites != null ? <div className="crm-g2 eq">
        <div className="card crm-panel"><h3 className="crm-h2">Exclusions par motif</h3>
          {exclusions.length ? <div dangerouslySetInnerHTML={{ __html: gx().chart.hbars({ items: exclusions.map((e) => ({ label: e.motif, value: e.nb })), fmt: (v: number) => v.toLocaleString('fr-FR') }) }} />
            : <div className="crm-note">Aucune exclusion.</div>}
          <div className="crm-note">Motifs tirés des tables de référence (types de vente, affaires). Corrigeables sans toucher au code.</div></div>
        <div className="card crm-panel"><h3 className="crm-h2">Ce qui a changé</h3><div className="crm-cnt">
          <div><span className="crm-lbl">Ventes nouvelles</span><b style={{ color: 'var(--ok)' }}>+{n(s.ventesNouvelles)}</b></div>
          <div><span className="crm-lbl">Ventes modifiées</span><b>{n(s.ventesModifiees)}</b></div>
          <div><span className="crm-lbl">Ventes disparues</span><b style={s.ventesDisparues ? { color: 'var(--warn)' } : undefined}>{n(s.ventesDisparues)}</b></div>
          {s.ventesReapparues ? <div><span className="crm-lbl">Ventes réapparues</span><b style={{ color: 'var(--ok)' }}>{n(s.ventesReapparues)}</b></div> : null}
          <div><span className="crm-lbl">Identités nouvelles</span><b>+{n(s.identitesNouvelles)}</b></div>
          <div><span className="crm-lbl">Véhicules nouveaux</span><b>+{n(s.vehiculesNouveaux)}</b></div>
        </div><div className="crm-note">Une vente disparue d’un import complet est marquée, jamais supprimée.</div></div>
      </div> : null}
      {aClasser.length ? <div className="card crm-panel"><h3 className="crm-h2"><Icon name="pin" size="sm" />Sites à classer <span className="n">{aClasser.length}</span></h3>
        <div className="crm-note">Libellé de site inconnu : la vente est importée avec un site « à classer », jamais rejetée ni devinée. Classer ajoute la correspondance ; elle s’applique au prochain import.</div>
        <div className="scroll"><table className="tbl"><thead><tr><th>Affaire / compte</th><th>Libellé DCS</th><th className="r">Lignes</th><th>Site Gearbox</th></tr></thead><tbody>
          {aClasser.map((a, i) => { const k = `${a.affaire}|${a.libelle}|${a.compte_evenement}`; return (
            <tr key={i}><td className="crm-mono">{a.compte_evenement || a.affaire}</td><td><b>{a.libelle || '—'}</b></td><td className="r num">{n(a.nb)}</td>
              <td>{classes[k] ? <span className="badge" style={{ '--c': 'var(--ok)' } as React.CSSProperties}><Icon name="check" size="sm" />{classes[k]}</span>
                : <button className="btn sm" onClick={(e) => classer(e.currentTarget, a, k)}><Icon name="pin" size="sm" />Classer…</button>}</td></tr>); })}
        </tbody></table></div></div> : null}
      <div className="crm-note">Fichier archivé 14 jours sur le VPS. La base de SPARK ne quitte jamais le VPS (R1).</div>
    </div>
  );
};

const ImportsView: React.FC<{ runs: Run[]; win: AppProps['win']; reload: () => void; compact: boolean; selId: number | null; onSel: (id: number) => void }> = ({ runs, win, reload, compact, selId, onSel }) => {
  const [src, setSrc] = useState<'all' | Source>('all');
  const [pile, setPile] = useState(false);
  const liste = runs.filter((r) => src === 'all' || r.source === src);
  const sel = runs.find((r) => r.id === (selId ?? runs[0]?.id));
  const open = useCallback((id: number) => { onSel(id); setPile(true); }, [onSel]);

  const listeEl = (
    <div className="crm-list">
      <div style={{ padding: '14px 16px 10px' }}><Seg value={src} onChange={setSrc} style={{ width: '100%' }} options={[['all', 'Toutes'], ['VN', 'VN'], ['VO', 'VO'], ['BSO', 'Anc. base']]} /></div>
      <div className="crm-runs scroll" style={{ flex: 1, minHeight: 0 }}>
        {liste.length ? liste.map((r) => <RunItem key={r.id} run={r} sel={!compact && r.id === sel?.id} onOpen={open} />) : <div className="empty">Aucun import</div>}
      </div>
    </div>
  );
  const detail = <Detail key={sel?.id} run={sel} runs={runs} win={win} reload={reload} />;
  if (compact) return <Stack onBack={() => setPile(false)} pages={[
    { key: 'l', title: 'Imports', noHead: true, content: listeEl },
    ...(pile && sel ? [{ key: `d${sel.id}`, title: `Import n° ${sel.id}`, content: <div className="crm-dhost">{detail}</div> }] : []),
  ]} />;
  return <div className="split crm-split" style={{ '--side-w': '400px' } as React.CSSProperties}><div className="side">{listeEl}</div><div className="main scroll crm-dhost">{detail}</div></div>;
};
export default ImportsView;
