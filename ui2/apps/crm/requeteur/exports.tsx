import React, { useMemo, useRef, useState } from 'react';
import { Icon, Seg, hud } from '../../ui/kit';
import { db } from '../../../../services/dataService';
import { writeSheetFile } from '../../../../services/exportXlsx';
import { dFR, mDiff, nf, tel, today } from '../common';
import { hasFin, hasT, type Colonne, type ExportJ, type Format, type Ligne, type Q, type Referentiels, type Requete } from './modele';
import { FMT, Ico, civS, csvBlob, csvText, fname, fullL, intl, isoFR, smsLen, telecharger } from './outils';
import { quandJ } from './Bibliotheque';

/**
 * Volets d'export du Requêteur. Chaque export appelle POST /requetes/export (inscrit au journal PAR LE SERVEUR, quel que
 * soit le format), puis le fichier est fabriqué DANS LE NAVIGATEUR avec les lignes reçues :
 *  - Excel et Courrier : `writeSheetFile` (services/exportXlsx.ts, la porte unique de l'Excel, xlsx-js-style en import dynamique) ;
 *  - Sarbacane, allmysms : CSV « ; » UTF-8 avec BOM, Blob + lien <a download> du document principal ;
 *  - Phoning : page imprimable ouverte dans une NOUVELLE fenêtre (la rubrique vit dans une racine fantôme).
 * Les aperçus des volets utilisent les 20 lignes de l'aperçu (POST /requetes/apercu, colonnes par défaut) : rien n'est
 * exporté avant le clic. Maquette : `exportSheet`, `excelSheet`, `smsSheet`, `phoningSheet`, `courrierSheet`.
 */

export interface ExpCtx {
  q: Q; req: Requete; main: number; apercu: Ligne[]; R: Referentiels | null; who: string; savedId: number | null;
  xl: string[] | null; setXl: (v: string[]) => void; done: () => void;
}
type Close = (v?: unknown) => void;
const cv = (c: string) => ({ '--c': c } as React.CSSProperties);

async function lancer(ctx: ExpCtx, format: Format, colonnes: string[], requete: Requete = ctx.req) {
  const fichier = fname(format, ctx.q.name, ctx.who);
  const r = await db.exporterCrmRequete({ requete, colonnes, format, fichier, ...(ctx.savedId ? { requete_id: ctx.savedId } : {}), requete_nom: ctx.q.name });
  return { fichier, lignes: (r?.lignes || []) as Ligne[], colonnes: (r?.colonnes || []) as Colonne[] };
}
/** Bouton principal d'un volet : exporte, fabrique le fichier, trace, ferme. */
function useGo(ctx: ExpCtx, close: Close) {
  const [busy, setBusy] = useState(false);
  const go = async (run: () => Promise<{ fichier: string; n: number }>, onFail?: () => void) => {
    if (busy) return; setBusy(true);
    try { const { fichier, n } = await run(); hud(`${fichier} : ${nf(n)} lignes · tracé dans l’historique`); ctx.done(); close('ok'); }
    catch (e: any) { onFail?.(); hud(e?.message || 'Export impossible.'); setBusy(false); }
  };
  return { busy, go };
}

const Head: React.FC<{ k: Format; t: string; sub: string; name: string }> = ({ k, t, sub, name }) => (
  <div className="row" style={{ gap: 10 }}><span className="rq-bi" style={cv('var(--accent)')}><Ico name={FMT[k][1]} /></span><div className="grow"><h3 style={{ margin: 0 }}>{t}</h3><div className="crm-note">« {name} » · {sub}</div></div>
    <button className="icon-btn sm" data-sheet="" aria-label="Fermer"><Icon name="close" size="sm" /></button></div>
);
const Foot: React.FC<{ k: Format; ctx: ExpCtx; label: string; busy: boolean; disabled?: boolean; onGo: () => void }> = ({ k, ctx, label, busy, disabled, onGo }) => (<>
  <div className="rq-fname"><Ico name={FMT[k][1]} /><span className="crm-mono">{fname(k, ctx.q.name, ctx.who)}</span></div>
  <div className="crm-note" style={{ marginTop: 8 }}><Icon name="lock" size="sm" /> Ouvert à tous les rôles qui ont SPARK, et tracé dans l’historique (qui, quand, combien, quelle requête). Le nom du fichier porte l’exportateur et la date. Les coordonnées suspectes ne sortent jamais.</div>
  <div className="foot"><button className="btn" data-sheet="">Annuler</button><button className="btn primary" disabled={busy || disabled} onClick={onGo}><Icon name="download" size="sm" />{busy ? 'Export en cours…' : Number.isFinite(ctx.main) ? `${label} · ${nf(ctx.main)} lignes` : label}</button></div>
</>);
const Warn: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="rq-warn" style={{ marginTop: 12 }}><div style={cv('var(--warn)')}><Icon name="alert" size="sm" /><span>{children}</span></div></div>;

const dedupe = (L: Ligne[], key: (l: Ligne) => string) => { const seen = new Set<string>(); return L.filter((l) => { const k = key(l); if (!k || seen.has(k)) return false; seen.add(k); return true; }); };
const moisRestants = (l: Ligne) => ('mois_restants' in l ? l.mois_restants ?? '' : l.fin_fin && l.fin_fin >= today() ? Math.max(0, Math.round(mDiff(today(), l.fin_fin))) : '');
const cellXl = (v: unknown) => (typeof v === 'number' ? v : (isoFR(v) as string | number));

// ---------------------------------------------------------------- Excel
const PRESETS: Record<string, string[]> = {
  tous: ['id_spark', 'civilite', 'nom', 'prenom', 'cp', 'ville', 'portable', 'email', 'site', 'vendeur', 'nb_parc', 'marque', 'modele', 'immat', 'date_achat', 'fin_organisme', 'fin_famille', 'fin_fin'],
  pro: ['id_spark', 'nom', 'cp', 'ville', 'portable', 'fixe', 'email', 'site', 'vendeur', 'nb_parc', 'parc_liste', 'derniere_vente'],
  email: ['civilite', 'prenom', 'nom', 'email', 'modele', 'fin_fin', 'vendeur', 'site'],
  sms: ['prenom', 'portable', 'modele', 'fin_fin', 'vendeur', 'site'],
  phoning: ['civilite', 'nom', 'prenom', 'portable', 'fixe', 'nb_parc', 'marque', 'modele', 'immat', 'fin_fin', 'date_achat', 'vendeur'],
  courrier: ['civilite', 'nom', 'prenom', 'adresse', 'cp', 'ville'],
};
export const ExcelSheet: React.FC<{ ctx: ExpCtx; close: Close }> = ({ ctx, close }) => {
  const all = ctx.R?.colonnes || [], known = new Set(all.map((c) => c.cle));
  const preset = (k: string) => (PRESETS[k] || PRESETS.tous).filter((x) => known.has(x));
  // Requête de professionnels : préréglage « Flottes » par défaut (taille + liste du parc).
  const pro = ctx.req.briques.some((b: any) => b.type === 'type_personne' && b.actif !== false && !b.sauf && (b.valeurs || []).includes('societe'));
  const on = (ctx.xl || preset(ctx.q.canal === 'tous' ? (pro ? 'pro' : 'tous') : ctx.q.canal)).filter((x) => known.has(x));
  // Une ligne par client (le véhicule retenu par la requête) ou une ligne par véhicule ENCORE au parc.
  const [parVeh, setParVeh] = useState(ctx.req.niveau === 'vehicule');
  const reqExport = (): Requete => (!parVeh ? ctx.req : {
    ...ctx.req, niveau: 'vehicule',
    briques: ctx.req.briques.some((b: any) => b.type === 'au_parc' && b.actif !== false && !b.sauf) ? ctx.req.briques : [...ctx.req.briques, { id: 'export-au-parc', type: 'au_parc', actif: true, valeur: true } as any],
  });
  const set = ctx.setXl, col = (k: string) => all.find((c) => c.cle === k);
  const off = all.filter((c) => !on.includes(c.cle));
  const mv = (k: string, d: number) => { const i = on.indexOf(k), j = i + d, n = on.slice(); [n[i], n[j]] = [n[j], n[i]]; set(n); };
  const { busy, go } = useGo(ctx, close);
  const run = () => go(async () => {
    const r = await lancer(ctx, 'excel', on, reqExport());
    const cols = r.colonnes.length ? r.colonnes : on.map((k) => col(k)!).filter(Boolean);
    await writeSheetFile(r.fichier, 'SPARK', cols.map((c) => c.libelle), r.lignes.map((l) => cols.map((c) => cellXl(l[c.cle]))));
    return { fichier: r.fichier, n: r.lignes.length };
  });
  return (<>
    <Head k="excel" t="Export Excel" sub="choisissez et ordonnez les colonnes" name={ctx.q.name} />
    <div className="crm-lbl" style={{ margin: '14px 0 6px' }}>Préréglage</div>
    <Seg value="" style={{ maxWidth: '100%', overflowX: 'auto' }} onChange={(v) => set(preset(v))} options={[['tous', 'Complet'], ['pro', 'Flottes'], ['email', 'E-mailing'], ['sms', 'SMS'], ['phoning', 'Phoning'], ['courrier', 'Courrier']]} />
    <div className="crm-lbl" style={{ margin: '14px 0 6px' }}>Une ligne par</div>
    <Seg value={parVeh ? 'veh' : 'client'} onChange={(v) => setParVeh(v === 'veh')} options={[['client', 'Client'], ['veh', 'Véhicule encore au parc']]} />
    <div className="crm-note" style={{ marginTop: 6 }}>{parVeh ? 'Chaque véhicule encore au parc des clients de la cible sur sa propre ligne (marque, modèle, immatriculation, financement…).' : 'Un client par ligne. Ajoutez la colonne « Parc actuel » pour lister tous ses véhicules dans une seule cellule.'}</div>
    <div className="row" style={{ justifyContent: 'space-between', margin: '14px 0 6px' }}><span className="crm-lbl">Colonnes · <span>{on.length} sur {all.length}</span></span><span className="crm-note">Flèches = ordre dans le fichier</span></div>
    {all.length ? <div className="rq-cols">
      {on.map((k, i) => <div key={k}><input type="checkbox" className="check" checked onChange={() => set(on.filter((x) => x !== k))} /><span className="grow">{col(k)?.libelle || k}</span>
        <span className="ord"><button className="icon-btn sm" disabled={!i} aria-label="Monter" onClick={() => mv(k, -1)}><Icon name="chevup" size="sm" /></button><button className="icon-btn sm" disabled={i >= on.length - 1} aria-label="Descendre" onClick={() => mv(k, 1)}><Icon name="chevdown" size="sm" /></button></span></div>)}
      {off.map((c) => <div key={c.cle} className="off"><input type="checkbox" className="check" checked={false} onChange={() => set([...on, c.cle])} /><span className="grow">{c.libelle}</span><span className="faint" style={{ fontSize: 11.5 }}>{c.groupe}</span></div>)}
    </div> : <div className="crm-note">Liste des colonnes indisponible (référentiels non chargés).</div>}
    <div className="crm-lbl" style={{ margin: '14px 0 6px' }}>Aperçu</div>
    <div className="scroll"><table className="tbl" style={{ fontSize: 12 }}><thead><tr>{on.map((k) => <th key={k}>{col(k)?.libelle || k}</th>)}</tr></thead>
      <tbody>{ctx.apercu.slice(0, 3).map((l, i) => <tr key={i}>{on.map((k) => <td key={k} style={{ whiteSpace: 'nowrap' }}>{k in l ? String(cellXl(l[k]) ?? '') : <span className="faint">…</span>}</td>)}</tr>)}</tbody></table></div>
    <div className="crm-note" style={{ marginTop: 6 }}>Aperçu sur les premières lignes ; « … » = colonne remplie au moment de l’export.</div>
    <div style={{ marginTop: 14 }} />
    <Foot k="excel" ctx={parVeh ? { ...ctx, main: NaN } : ctx} label="Télécharger le .xlsx" busy={busy} disabled={!on.length} onGo={run} />
  </>);
};

// ---------------------------------------------------------------- Sarbacane (CSV e-mailing)
const STD = ['email', 'civilite', 'prenom', 'nom'], PERSO = ['modele', 'date_fin_contrat', 'vendeur', 'site', 'mois_restants'];
const sarbRow = (l: Ligne) => [l.email || '', civS(l.civilite), l.prenom || '', l.nom || '', l.modele || '', isoFR(l.fin_fin), l.vendeur || '', l.site || '', moisRestants(l)];
export const SarbacaneSheet: React.FC<{ ctx: ExpCtx; close: Close }> = ({ ctx, close }) => {
  const { busy, go } = useGo(ctx, close);
  const sample = ctx.apercu.filter((l) => l.email).slice(0, 4);
  const run = () => go(async () => {
    const r = await lancer(ctx, 'sarbacane', ['email', 'civilite', 'prenom', 'nom', 'modele', 'fin_fin', 'vendeur', 'site', 'mois_restants']);
    const L = dedupe(r.lignes, (l) => String(l.email || '').trim().toLowerCase());
    telecharger(r.fichier, csvBlob([[...STD, ...PERSO], ...L.map(sarbRow)]));
    return { fichier: r.fichier, n: L.length };
  });
  return (<>
    <Head k="sarbacane" t="Fichier pour Sarbacane" sub="prêt pour l’import d’une liste de contacts" name={ctx.q.name} />
    {ctx.q.canal !== 'email' ? <Warn>Le canal de la requête n’est pas « E-mailing » : les clients sans e-mail valide seront ignorés, et le dédoublonnage par e-mail s’appliquera au fichier.</Warn> : null}
    <div className="crm-lbl" style={{ margin: '14px 0 6px' }}>Champs standard Sarbacane</div>
    <div className="rq-vars">{STD.map((c) => <button key={c} type="button">{c}</button>)}</div>
    <div className="crm-lbl" style={{ margin: '12px 0 6px' }}>Champs personnalisés <span className="faint" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>· à créer une fois dans la liste Sarbacane, puis à associer à l’import</span></div>
    <div className="rq-vars">{PERSO.map((c) => <button key={c} type="button" data-tip="Variable de personnalisation dans le modèle d’e-mail">{c}</button>)}</div>
    <div className="crm-note" style={{ marginTop: 6 }}>« civilite » vaut Madame ou Monsieur (un couple sort en Monsieur), vide pour une société : prévoir « Bonjour » par défaut dans le modèle. « date_fin_contrat » et « mois_restants » sont vides si la requête ne porte pas sur un financement.</div>
    <div className="crm-lbl" style={{ margin: '14px 0 6px' }}>Aperçu du fichier · séparateur « ; » · UTF-8</div>
    <div className="rq-code">{csvText([[...STD, ...PERSO], ...sample.map(sarbRow)])}</div>
    <div style={{ marginTop: 14 }} />
    <Foot k="sarbacane" ctx={ctx} label="Télécharger pour Sarbacane" busy={busy} onGo={run} />
  </>);
};

// ---------------------------------------------------------------- allmysms (CSV SMS)
const SMS_COLS = ['numero', 'civilite', 'prenom', 'nom', 'modele', 'date_fin', 'vendeur', 'site'];
const VARS = ['civilite', 'prenom', 'nom', 'modele', 'date_fin', 'vendeur', 'site'];
const dateFin = (l: Ligne) => String(l.fin_fin ? isoFR(l.fin_fin) : l.ct_prochain ? isoFR(l.ct_prochain) : '');
const varsOf = (l: Ligne): Record<string, string> => ({ civilite: civS(l.civilite), prenom: l.prenom || l.nom || '', nom: l.nom || '', modele: l.modele || '', date_fin: dateFin(l), vendeur: l.vendeur || '', site: l.site || '' });
const smsRow = (l: Ligne, plus: boolean) => { const v = varsOf(l); return [intl(l.portable, plus), v.civilite, v.prenom, v.nom, v.modele, v.date_fin, v.vendeur, v.site]; };
const T0 = 'Bonjour {prenom}, le contrat de votre {modele} finit le {date_fin}. {vendeur} vous attend chez Bony {site}. STOP au 36XXX';
export const SmsSheet: React.FC<{ ctx: ExpCtx; close: Close }> = ({ ctx, close }) => {
  const { busy, go } = useGo(ctx, close);
  const [nf_, setNf] = useState<'33' | 'plus'>('33');
  const [from, setFrom] = useState('BONY AUTO');
  const [msg, setMsg] = useState(T0);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const L = ctx.apercu, smp = L.find((l) => l.portable) || L[0];
  const fill = (t: string, l: Ligne | undefined) => t.replace(/\{(\w+)\}/g, (m, k) => (l ? varsOf(l)[k] ?? m : m));
  const longest = (k: string) => L.reduce((a, l) => { const v = varsOf(l)[k] ?? ''; return v.length > a.length ? v : a; }, '');
  const fromOk = /^[A-Za-z0-9 ]{1,11}$/.test(from) && /[A-Za-z]/.test(from);
  const m = useMemo(() => {
    const worst = msg.replace(/\{(\w+)\}/g, (x, k) => longest(k) || x), a = smsLen(fill(msg, smp)), bad = [...new Set([...a.bad, ...smsLen(worst).bad])];
    let w = smsLen(worst); if (bad.length && !w.bad.length) w = { ...w, parts: w.n <= 70 ? 1 : Math.ceil(w.n / 67) };   // un seul « ç » dans une valeur suffit à passer en Unicode
    return { a, w, bad };
  }, [msg, L]); // eslint-disable-line react-hooks/exhaustive-deps
  const ins = (k: string) => { const ta = taRef.current, p = ta?.selectionStart ?? msg.length, e = ta?.selectionEnd ?? p; setMsg(msg.slice(0, p) + `{${k}}` + msg.slice(e)); ta?.focus(); };
  const run = () => go(async () => {
    const r = await lancer(ctx, 'allmysms', ['portable', 'civilite', 'prenom', 'nom', 'modele', 'fin_fin', 'ct_prochain', 'vendeur', 'site']);
    const rows = dedupe(r.lignes.filter((l) => l.portable), (l) => intl(l.portable, false));
    telecharger(r.fichier, csvBlob([SMS_COLS, ...rows.map((l) => smsRow(l, nf_ === 'plus'))]));
    return { fichier: r.fichier, n: rows.length };
  });
  return (<>
    <Head k="allmysms" t="Fichier pour allmysms" sub="numéros au format international, prêts pour l’import" name={ctx.q.name} />
    <div className="row wrap" style={{ gap: '10px 16px', margin: '14px 0 6px', alignItems: 'flex-end' }}>
      <div className="rq-fld"><span className="crm-lbl">Format du numéro</span><Seg value={nf_} onChange={setNf} options={[['33', '33639981234'], ['plus', '+33639981234']]} /></div>
      <label className="rq-fld"><span className="crm-lbl">Expéditeur (11 car. max.)</span><input className="input" value={from} maxLength={11} style={{ width: 170, height: 34 }} onChange={(e) => setFrom(e.target.value)} /></label>
      <span className="crm-note">{fromOk ? <span className="rq-ok"><Icon name="check" size="sm" /> {from.length}/11</span> : <span style={{ color: 'var(--warn)' }}><Icon name="alert" size="sm" /> lettres et chiffres seulement, au moins une lettre, 11 au plus</span>}</span></div>
    <div className="crm-lbl" style={{ margin: '12px 0 6px' }}>Colonnes du fichier</div>
    <div className="rq-code">{csvText([SMS_COLS, ...L.filter((l) => l.portable).slice(0, 3).map((l) => smsRow(l, nf_ === 'plus'))])}</div>
    <div className="crm-lbl" style={{ margin: '14px 0 6px' }}>Message type</div>
    <div className="rq-vars" style={{ marginBottom: 6 }}>{VARS.map((k) => <button key={k} type="button" onClick={() => ins(k)}>{`{${k}}`}</button>)}</div>
    <textarea ref={taRef} className="textarea" rows={4} style={{ width: '100%' }} value={msg} onChange={(e) => setMsg(e.target.value)} />
    <div className="rq-meter" style={{ marginTop: 8 }}>
      <span>Ce client : <b>{m.a.n}</b> caractères · <b>{m.a.parts}</b> SMS</span>
      <span>Pire cas (variables les plus longues) : <b>{m.w.n}</b> · <b>{m.w.parts}</b> SMS</span>
      <span>Volume : <b>≈ {nf(ctx.main * m.w.parts)}</b> SMS facturés au plus</span>
      {m.bad.length ? <span style={{ color: 'var(--warn)' }}><Icon name="alert" size="sm" /> « {m.bad.slice(0, 4).join(' ')} » (message ou valeur d’une variable) force l’encodage Unicode : 70 caractères par SMS au lieu de 160</span>
        : <span className="rq-ok"><Icon name="check" size="sm" /> Alphabet SMS standard (160 car.)</span>}
      {/\bSTOP\b/.test(msg) ? null : <span style={{ color: 'var(--danger)' }}><Icon name="alert" size="sm" /> Mention STOP absente : obligatoire</span>}</div>
    <div className="crm-lbl" style={{ margin: '14px 0 6px' }}>Aperçu sur le premier client</div><div className="rq-smsp">{fill(msg, smp)}</div>
    <div className="crm-note" style={{ marginTop: 8 }}>160 caractères pour un SMS, puis des tranches de 153 au-delà. La mention de désinscription (STOP) est obligatoire. Les numéros suspects ou en double sont déjà retirés. Le message et l’expéditeur se saisissent dans allmysms : ils ne sont pas dans le fichier.</div>
    <div style={{ marginTop: 14 }} />
    <Foot k="allmysms" ctx={ctx} label="Télécharger pour allmysms" busy={busy} onGo={run} />
  </>);
};

// ---------------------------------------------------------------- Phoning (vue imprimable)
const PER_PAGE = 12;
const repKey = (q: Q): [string, string] => (hasFin(q) ? ['Fin de contrat', 'fin_fin'] : hasT(q, 'ct') ? ['Prochain CT', 'ct_prochain'] : ['Livré le', 'date_achat']);
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
interface Page { g: string; site: string; total: number; rows: Ligne[]; i: number }
function paginer(L: Ligne[], par: 'vendeur' | 'site', tri: boolean, rk: string): Page[] {
  const by = new Map<string, Ligne[]>();
  L.forEach((l) => { const k = String((par === 'site' ? l.site : l.vendeur) || (par === 'site' ? 'Sans site' : 'Sans vendeur')); if (!by.has(k)) by.set(k, []); by.get(k)!.push(l); });
  const out: Page[] = []; let i = 0;
  [...by.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([g, ls]) => {
    const rows = tri ? ls.slice().sort((a, b) => String(a[rk] || '9999').localeCompare(String(b[rk] || '9999'))) : ls;
    for (let k = 0; k < rows.length; k += PER_PAGE) out.push({ g, site: par === 'site' ? g : String(rows[0].site || '—'), total: rows.length, rows: rows.slice(k, k + PER_PAGE), i: ++i });
  });
  return out;
}
const telL = (l: Ligne) => { const t = String(l.portable || l.fixe || '').replace(/\D/g, ''); return t ? tel(t) : '—'; };
function printHTML(pages: Page[], o: { titre: string; who: string; rl: string; rk: string; par: 'vendeur' | 'site'; fichier: string }) {
  const d = dFR(today());
  const page = (p: Page) => `<section class="rq-paper"><div class="hd"><div><div class="eye">Fichier de phoning · Bony</div><h4>${esc(p.g)}</h4><div class="sub">${o.par === 'vendeur' ? `Site : ${esc(p.site)} · ` : ''}${nf(p.total)} client${p.total > 1 ? 's' : ''} à appeler</div></div>
    <div class="m">Campagne : <b>${esc(o.titre)}</b><br>Édité le ${d} par ${esc(o.who)}<br>Page ${p.i} / ${pages.length}</div></div>
    <table><thead><tr><th>Client</th><th>Téléphone</th><th>Véhicule</th><th>${esc(o.rl)}</th><th>Dernier achat</th><th class="ck">Joint</th><th class="ck">Messa&shy;gerie</th><th class="ck">RDV</th><th class="ck">Pas intéressé</th></tr></thead>
    <tbody>${p.rows.map((l) => `<tr><td><b>${esc(fullL(l))}</b><br><span class="g">${esc([l.cp, l.ville].filter(Boolean).join(' '))}</span></td><td style="white-space:nowrap">${esc(telL(l))}</td><td>${esc([l.marque, l.modele].filter(Boolean).join(' '))}<br><span class="g">${esc(l.immat || '')}</span></td><td style="white-space:nowrap">${l[o.rk] ? dFR(l[o.rk]) : '—'}</td><td style="white-space:nowrap">${l.derniere_vente ? dFR(l.derniere_vente) : '—'}</td>${'<td class="ck"><span class="box"></span></td>'.repeat(4)}</tr>`).join('')}</tbody></table>
    <div class="notes">Notes :</div><div class="ft"><span>Document interne — ne pas diffuser, à détruire après la campagne</span><span>${esc(p.g)}</span></div></section>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(o.fichier.replace(/\.pdf$/, ''))}</title><style>
    @page{size:A4 landscape;margin:10mm}
    *{box-sizing:border-box}body{margin:0;font:11px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1d1b22;background:#fff}
    .rq-paper{padding:4px 2px;page-break-after:always;break-after:page}.rq-paper:last-child{page-break-after:auto;break-after:auto}
    .eye{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:#5c5866}.sub{color:#5c5866;margin-top:2px}
    h4{margin:0;font-size:15px}.hd{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #1d1b22;padding-bottom:8px;margin-bottom:10px}
    .hd .m{color:#5c5866;font-size:10.5px;line-height:1.5;text-align:right}.hd .m b{color:#1d1b22}
    table{width:100%;border-collapse:collapse}th{font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;text-align:left;color:#5c5866;border-bottom:1px solid #b9b5c2;padding:4px 5px}
    td{border-bottom:1px solid #e3e0ea;padding:6px 5px;vertical-align:top}td.ck,th.ck{text-align:center;width:46px}.g{color:#5c5866}
    .box{display:inline-block;width:11px;height:11px;border:1.4px solid #1d1b22;border-radius:2px}
    .notes{margin-top:12px;border:1px solid #b9b5c2;border-radius:4px;height:64px;padding:5px 8px;color:#8a8597}
    .ft{display:flex;justify-content:space-between;margin-top:10px;color:#8a8597;font-size:9.5px}
  </style></head><body>${pages.map(page).join('') || '<p>Aucun client à appeler.</p>'}</body></html>`;
}
export const PhoningSheet: React.FC<{ ctx: ExpCtx; close: Close }> = ({ ctx, close }) => {
  const { busy, go } = useGo(ctx, close);
  const [par, setPar] = useState<'vendeur' | 'site'>('vendeur');
  const [tri, setTri] = useState(true);
  const [rl, rk0] = repKey(ctx.q);
  // L'aperçu n'a pas toutes les colonnes : sans la colonne repère, on montre la fin de contrat.
  const rk = !ctx.apercu.length || rk0 in ctx.apercu[0] ? rk0 : 'fin_fin', rlP = rk === rk0 ? rl : 'Fin de contrat';
  const pages = useMemo(() => paginer(ctx.apercu, par, tri, rk), [ctx.apercu, par, tri, rk]);
  const shown = pages.filter((p, i, a) => a.findIndex((x) => x.g === p.g) === i).slice(0, 2);   // première page des deux premiers groupes
  const run = () => {
    // Fenêtre ouverte DANS le clic (sinon le bloqueur de fenêtres la refuse), remplie quand les lignes arrivent.
    const w = window.open('', '_blank');
    if (!w) { hud('Fenêtre bloquée par le navigateur : autorisez les fenêtres surgissantes pour Gearbox.'); return; }
    w.document.write('<!doctype html><meta charset="utf-8"><title>SPARK · phoning</title><p style="font:14px system-ui;padding:24px">Préparation du fichier de phoning…</p>');
    go(async () => {
      const r = await lancer(ctx, 'phoning', ['civilite', 'nom', 'prenom', 'cp', 'ville', 'portable', 'fixe', 'marque', 'modele', 'immat', 'fin_fin', 'ct_prochain', 'date_achat', 'derniere_vente', 'vendeur', 'site']);
      const P = paginer(r.lignes, par, tri, rk0);
      w.document.open(); w.document.write(printHTML(P, { titre: ctx.q.name, who: ctx.who, rl, rk: rk0, par, fichier: r.fichier })); w.document.close();
      w.focus(); setTimeout(() => { try { w.print(); } catch { /* fenêtre fermée */ } }, 400);
      return { fichier: r.fichier, n: r.lignes.length };
    }, () => { try { w.close(); } catch { /* déjà fermée */ } });
  };
  return (<>
    <Head k="phoning" t="Fichier de phoning imprimable" sub={`une page par ${par === 'vendeur' ? 'vendeur' : 'site'}, ${PER_PAGE} clients par page`} name={ctx.q.name} />
    <div className="row wrap" style={{ gap: 10, margin: '14px 0 10px' }}>
      <Seg value={par} onChange={setPar} options={[['vendeur', 'Une page par vendeur'], ['site', 'Une page par site']]} />
      <label className="row" style={{ gap: 8, fontSize: 13 }}><input type="checkbox" className="check" checked={tri} onChange={(e) => setTri(e.target.checked)} />Trier par {rl.toLowerCase()}</label></div>
    <div className="rq-print">{shown.map((p) => (
      <div key={p.g} className="rq-paper"><div className="hd"><div><div style={{ fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#5c5866' }}>Fichier de phoning · Bony</div><h4>{p.g}</h4>
        <div style={{ color: '#5c5866', marginTop: 2 }}>{par === 'vendeur' ? `Site : ${p.site} · ` : ''}aperçu sur les premières lignes</div></div>
        <div className="m">Campagne : <b style={{ color: '#1d1b22' }}>{ctx.q.name}</b><br />Édité le {dFR(today())} par {ctx.who}<br />Page {p.i}</div></div>
        <table><thead><tr><th>Client</th><th>Téléphone</th><th>Véhicule</th><th>{rlP}</th><th>Dernier achat</th><th className="ck">Joint</th><th className="ck">Messa&shy;gerie</th><th className="ck">RDV</th><th className="ck">Pas intéressé</th></tr></thead>
          <tbody>{p.rows.slice(0, 10).map((l, i) => <tr key={i}><td><b>{fullL(l)}</b><br /><span style={{ color: '#5c5866' }}>{[l.cp, l.ville].filter(Boolean).join(' ')}</span></td><td style={{ whiteSpace: 'nowrap' }}>{telL(l)}</td>
            <td>{[l.marque, l.modele].filter(Boolean).join(' ')}<br /><span style={{ color: '#5c5866' }}>{l.immat || ''}</span></td><td style={{ whiteSpace: 'nowrap' }}>{l[rk] ? dFR(l[rk]) : '—'}</td><td style={{ whiteSpace: 'nowrap' }}>{l.derniere_vente ? dFR(l.derniere_vente) : '…'}</td>
            {[0, 1, 2, 3].map((k) => <td key={k} className="ck"><span className="box" /></td>)}</tr>)}</tbody></table>
        <div className="notes">Notes :</div><div className="ft"><span>Document interne — ne pas diffuser, à détruire après la campagne</span><span>{p.g}</span></div></div>))}
      {!shown.length ? <div className="crm-note" style={{ textAlign: 'center' }}>Aperçu indisponible.</div> : <div className="crm-note" style={{ textAlign: 'center' }}>… et les pages des autres {par === 'vendeur' ? 'vendeurs' : 'sites'} à l’impression</div>}</div>
    <div className="crm-note" style={{ marginTop: 8 }}>L’impression s’ouvre dans une nouvelle fenêtre : choisissez « Enregistrer au format PDF » pour garder le fichier.</div>
    <div style={{ marginTop: 14 }} />
    <Foot k="phoning" ctx={ctx} label="Imprimer / PDF" busy={busy} onGo={run} />
  </>);
};

// ---------------------------------------------------------------- Courrier (Excel de publipostage)
const COUR_H = ['Civilité', 'Nom', 'Prénom', 'Adresse', 'Code postal', 'Ville'];
const courRow = (l: Ligne) => [civS(l.civilite), l.nom || '', l.prenom || '', l.adresse || '', l.cp || '', l.ville || ''];
export const CourrierSheet: React.FC<{ ctx: ExpCtx; close: Close }> = ({ ctx, close }) => {
  const { busy, go } = useGo(ctx, close);
  const run = () => go(async () => {
    const r = await lancer(ctx, 'courrier', ['civilite', 'nom', 'prenom', 'adresse', 'cp', 'ville']);
    await writeSheetFile(r.fichier, 'Publipostage', COUR_H, r.lignes.map(courRow));
    return { fichier: r.fichier, n: r.lignes.length };
  });
  return (<>
    <Head k="courrier" t="Courrier" sub="fichier de publipostage (Excel)" name={ctx.q.name} />
    <div className="crm-note" style={{ margin: '14px 0 6px' }}>Fichier à fusionner dans Word (Publipostage → Sélection des destinataires → Utiliser une liste existante).</div>
    <div className="scroll"><table className="tbl" style={{ fontSize: 12 }}><thead><tr>{COUR_H.map((h) => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{ctx.apercu.slice(0, 4).map((l, i) => <tr key={i}>{courRow(l).map((v, k) => <td key={k} style={{ whiteSpace: 'nowrap' }}>{k === 3 && !('adresse' in l) ? <span className="faint">…</span> : v}</td>)}</tr>)}</tbody></table></div>
    {ctx.q.canal !== 'courrier' ? <Warn>Choisissez le canal « Courrier » pour retirer les adresses incomplètes et n’envoyer qu’un courrier par foyer.</Warn> : null}
    <div style={{ marginTop: 14 }} />
    <Foot k="courrier" ctx={ctx} label="Télécharger le .xlsx" busy={busy} onGo={run} />
  </>);
};

// ---------------------------------------------------------------- historique
export const JournalSheet: React.FC<{ journal: ExportJ[] | null }> = ({ journal }) => (<>
  <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>Historique des exports</h3><button className="icon-btn sm" data-sheet="" aria-label="Fermer"><Icon name="close" size="sm" /></button></div>
  <div className="crm-note" style={{ margin: '6px 0 12px' }}>Chaque export est tracé : qui, quand, combien de lignes, quelle requête, quel format. Le journal ne s’efface pas. Les 200 derniers sont affichés.</div>
  {!journal ? <div className="crm-note">Chargement…</div> : !journal.length ? <div className="crm-note">Aucun export pour l’instant.</div>
    : <div className="scroll"><table className="tbl"><thead><tr><th>Quand</th><th>Qui</th><th>Format</th><th className="r">Lignes</th><th>Requête</th><th>Fichier</th></tr></thead>
      <tbody>{journal.map((j) => <tr key={j.id}><td style={{ whiteSpace: 'nowrap' }}>{quandJ(j.cree_le)}</td><td style={{ whiteSpace: 'nowrap' }}>{j.auteur}</td>
        <td style={{ whiteSpace: 'nowrap' }}><Ico name={FMT[j.format]?.[1] || 'file'} /> {FMT[j.format]?.[0] || j.format}</td><td className="r num">{nf(j.nb_lignes)}</td><td>{j.requete_nom || '—'}</td>
        <td className="crm-mono" style={{ whiteSpace: 'nowrap', fontSize: 11.5 }}>{j.fichier}</td></tr>)}</tbody></table></div>}
</>);
