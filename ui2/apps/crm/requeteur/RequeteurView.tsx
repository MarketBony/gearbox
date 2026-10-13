import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AppProps } from '../../types';
import { Icon, Seg, gx, hud, useSheets } from '../../ui/kit';
import { db } from '../../../../services/dataService';
import {
  RECIPES, TY, applyPer, cloneQ, fromRequete, recipeQ, toRequete,
  type Compte, type Enregistree, type ExportJ, type Format, type Ligne, type Q, type Referentiels,
} from './modele';
import Bibliotheque, { type LibF } from './Bibliotheque';
import Cartes from './Cartes';
import Resume, { mainOf } from './Resume';
import VoirClients from './VoirClients';
import { CourrierSheet, ExcelSheet, type ExpCtx, JournalSheet, PhoningSheet, SarbacaneSheet, SmsSheet } from './exports';

/**
 * Onglet « Requêteur » de SPARK (lot 3) — refonte validée par Théo le 13/10 (planches A, B, C du canevas) :
 * en-tête (titre, « Partir d'une recette », « Mes requêtes »), 4 cartes-questions (./Cartes.tsx), colonne « En résumé »
 * (./Resume.tsx) et la vue « Voir les clients » (./VoirClients.tsx). Contrat : ../CONTRAT-API.md § « Lot 3 ».
 * Résultat EN DIRECT : POST /requetes/compter + /apercu, temporisés à 400 ms ; une réponse périmée est abandonnée.
 * L'état (requête en cours, préférences) survit aux changements d'onglet : il vit dans `store`, tenu par CrmApp.
 */

export interface RqStore {
  q: Q; vue: 'cartes' | 'clients'; libF: LibF; xl: string[] | null; R: Referentiels | null;
  counts: Record<string, number>; countsPer: string | null | undefined;
}
interface Res { c: Compte | null; lignes: Ligne[] | null; err: string | null }

const RequeteurView: React.FC<{
  win: AppProps['win']; store: React.MutableRefObject<RqStore | null>; per: string | null; userId: string; who: string;
  openClient: (id: number) => void;
}> = ({ win, store, per, userId, who, openClient }) => {
  const S0 = store.current;
  const [q, setQState] = useState<Q>(() => S0?.q ?? recipeQ(RECIPES[1], S0?.R ?? null, per));
  const [R, setR] = useState<Referentiels | null>(S0?.R ?? null);
  const [vue, setVue] = useState<'cartes' | 'clients'>(S0?.vue ?? 'cartes');
  const [wantCounts, setWantCounts] = useState(false);
  const [libF, setLibF] = useState<LibF>(S0?.libF ?? 'all');
  const [xl, setXl] = useState<string[] | null>(S0?.xl ?? null);
  const [counts, setCounts] = useState<Record<string, number>>(S0?.countsPer === per ? S0?.counts ?? {} : {});
  const [open, setOpen] = useState<string | null>(null);
  const [saved, setSaved] = useState<Enregistree[] | null>(null);
  const [savedErr, setSavedErr] = useState<string | null>(null);
  const [journal, setJournal] = useState<ExportJ[] | null>(null);
  const [res, setRes] = useState<Res>({ c: null, lignes: null, err: null });
  const [busy, setBusy] = useState(true);
  const [impacts, setImpacts] = useState<Record<string, number>>({});
  const taRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { const ta = taRef.current; if (ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; } }, [q.name, vue]);
  const { open: openSheet, portals } = useSheets(win);

  const setQ = useCallback((f: (q: Q) => Q) => setQState(f), []);
  // L'état survit aux changements d'onglet (la vue est démontée) : recopié dans le magasin de CrmApp.
  useEffect(() => { store.current = { q, vue, libF, xl, R, counts, countsPer: countsFor.current }; });
  // Périmètre de la barre de menus → brique « Site du client » préremplie (comme le filtre de l'onglet Clients).
  useEffect(() => { setQState((x) => applyPer(x, per)); }, [per]);

  // ---------------------------------------------------------------- chargements
  useEffect(() => {
    if (R) return;
    db.getCrmReferentiels().then((r) => setR(r)).catch((e) => hud(`Listes de choix indisponibles : ${e?.message || 'erreur'}`));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const loadSaved = useCallback(() => { db.getCrmRequetes().then((l) => { setSaved(l || []); setSavedErr(null); }).catch((e) => setSavedErr(e?.message || 'Chargement impossible.')); }, []);
  const loadJournal = useCallback(() => { db.getCrmExports().then((l) => setJournal(l || [])).catch(() => setJournal((j) => j ?? [])); }, []);
  useEffect(() => { loadSaved(); loadJournal(); }, [loadSaved, loadJournal]);

  // ---------------------------------------------------------------- résultat en direct
  const req = useMemo(() => toRequete(q), [q]);
  const key = useMemo(() => JSON.stringify(req), [req]);
  const seqRef = useRef(0);
  useEffect(() => {
    const ac = new AbortController(), seq = ++seqRef.current;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const [c, a] = await Promise.all([db.compterCrmRequete(req, ac.signal), db.apercuCrmRequete(req, ac.signal)]);
        if (seq !== seqRef.current) return;
        setRes({ c, lignes: a?.lignes || [], err: null }); setBusy(false);
        // Impact de chaque exclusion « Sauf » : la même requête sans elle (avant garde-fous du canal).
        const sauf = req.briques.filter((b) => b.sauf && b.actif);
        const out: Record<string, number> = {};
        for (const b of sauf) {
          const sans = { ...req, briques: req.briques.map((x) => (x.id === b.id ? { ...x, actif: false } : x)) };
          const r2 = await db.compterCrmRequete(sans, ac.signal);
          if (seq !== seqRef.current) return;
          out[b.id] = Math.max(0, (r2?.avant_canal ?? 0) - (c?.avant_canal ?? 0));
        }
        setImpacts(out);
      } catch (e: any) {
        if (ac.signal.aborted || seq !== seqRef.current) return;
        setRes((r) => ({ ...r, err: e?.message || 'Calcul impossible.' })); setBusy(false);
      }
    }, 400);
    return () => { clearTimeout(t); ac.abort(); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Estimations des recettes (≈ clients) : à la première ouverture du volet, une fois par périmètre, l'une après l'autre.
  const countsFor = useRef<string | null | undefined>(S0?.countsPer);
  useEffect(() => {
    if (!R || !wantCounts) return;
    if (countsFor.current === per && Object.keys(counts).length >= RECIPES.length) return;
    countsFor.current = per; setCounts({});
    const ac = new AbortController(); let alive = true;
    (async () => {
      const acc: Record<string, number> = {};
      for (const r of RECIPES) {
        try { const c = await db.compterCrmRequete(toRequete(recipeQ(r, R, per)), ac.signal); if (!alive) return; acc[r.id] = c?.clients ?? 0; setCounts({ ...acc }); }
        catch { if (!alive) return; }
      }
    })();
    return () => { alive = false; ac.abort(); };
  }, [R, per, wantCounts]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- actions
  const sv = saved?.find((s) => s.id === q.savedId);
  const mine = (s: Enregistree | undefined) => !!s && String(s.auteur_id) === String(userId);
  const loadRecipe = (id: string) => { const r = RECIPES.find((x) => x.id === id)!; setVue('cartes'); setQState(recipeQ(r, R, per)); setOpen(null); hud(`Recette chargée : ${r.l}`); };
  const loadSavedQ = (s: Enregistree) => { setVue('cartes'); setQState(fromRequete(s.requete || { niveau: 'client', canal: 'tous', dedoublonnage: true, briques: [] }, R, { name: s.nom, savedId: s.id })); setOpen(null); };

  const libSheet = (part: 'recettes' | 'mes') => { if (part === 'recettes') setWantCounts(true); openSheet((close) => (<>
    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}><h3 style={{ margin: 0 }}>{part === 'recettes' ? 'Partir d’une recette' : 'Mes requêtes'}</h3><button className="icon-btn sm" data-sheet="" aria-label="Fermer"><Icon name="close" size="sm" /></button></div>
    <div className="col" style={{ gap: 18 }}>{libRef.current(part, close)}</div></>), { width: 480 }); };
  const journalSheet = () => openSheet(() => <JournalSheet journal={journalRef.current} />, { width: 980 });
  const planSheet = () => openSheet(() => (<>
    <div className="row" style={{ gap: 8 }}><span className="label" style={{ color: 'var(--accent)' }}>Requêteur</span><span className="badge" style={{ '--c': 'var(--bony-violet)' } as React.CSSProperties}><Icon name="star" size="sm" />Idée · pas encore au planning</span></div>
    <h3 style={{ margin: '6px 0 8px' }}>Programmer « {qRef.current.name} »</h3>
    <div className="muted" style={{ lineHeight: 1.5 }}>La requête se relance seule après l’import de la nuit, et vous prévient quand il y a du nouveau. Aucune liste n’est envoyée par e-mail : le résultat reste dans Gearbox.</div>
    <div className="col" style={{ gap: 12, marginTop: 14 }}>
      <label className="field"><span className="label">Quand</span><select className="select" defaultValue="lundi"><option value="lundi">Chaque lundi à 7 h</option><option value="jour">Chaque jour à 7 h</option><option value="mois">Le 1er de chaque mois</option></select></label>
      <label className="row" style={{ gap: 10, fontSize: 13.5 }}><input type="checkbox" className="switch" defaultChecked />Me prévenir par une notification Gearbox</label>
      <label className="row" style={{ gap: 10, fontSize: 13.5 }}><input type="checkbox" className="switch" defaultChecked />Seulement si le nombre de clients bouge de plus de <input className="input" type="number" defaultValue={5} style={{ width: 64, height: 30 }} /> %</label>
      <label className="row" style={{ gap: 10, fontSize: 13.5 }}><input type="checkbox" className="switch" />Ne garder que les <b>nouveaux</b> clients depuis la dernière fois</label>
    </div>
    <div className="foot"><button className="btn" data-sheet="">Annuler</button><button className="btn primary" data-sheet="ok">Noter l’idée</button></div></>),
  { width: 500, onClose: (v) => { if (v === 'ok') hud('Idée notée : « Programmer » n’est pas encore développé'); } });
  const saveSheet = () => openSheet((close) => <SaveSheet q={qRef.current} sv={sv} mine={!sv || mine(sv)} close={close} onSaved={(id, name) => { setQState((x) => ({ ...x, name, savedId: id })); loadSaved(); }} />, { width: 480 });
  const delSheet = (s: Enregistree) => openSheet(() => (<>
    <h3>Supprimer « {s.nom} » ?</h3><div className="muted" style={{ lineHeight: 1.55 }}>La requête enregistrée disparaît pour tous ceux qui la voyaient. L’historique des exports, lui, est conservé.</div>
    <div className="foot"><button className="btn" data-sheet="">Annuler</button><button className="btn primary" data-sheet="ok" style={{ background: 'var(--danger)' }}>Supprimer</button></div></>),
  { width: 440, onClose: (v) => { if (v !== 'ok') return; db.deleteCrmRequete(s.id).then(() => { setQState((x) => (x.savedId === s.id ? { ...x, savedId: null } : x)); loadSaved(); hud('Requête supprimée'); }).catch((e) => hud(e?.message || 'Suppression refusée.')); } });
  const more = (el: HTMLElement) => gx().menu.open([
    { label: 'Nouvelle requête vide', icon: 'plus', action: () => { setQState(applyPer(fromRequete({ niveau: 'client', canal: 'tous', dedoublonnage: true, briques: [] }, R, { name: 'Nouvelle requête' }), per)); setOpen(null); } },
    { label: 'Dupliquer', icon: 'copy', action: () => { setQState((x) => ({ ...cloneQ(x), name: x.name + ' (copie)', savedId: null })); hud('Requête dupliquée : pensez à l’enregistrer'); } },
    '-', { label: 'Réactiver toutes les conditions', icon: 'refresh', disabled: !q.bricks.some((b) => !b.on && !TY[b.t]?.ui), action: () => setQState((x) => ({ ...x, bricks: x.bricks.map((b) => ({ ...b, on: true })) })) },
    { label: 'Historique des exports', icon: 'clock', action: journalSheet },
    { label: 'Programmer (idée)…', icon: 'clock', action: planSheet },
    ...(sv && mine(sv) ? ['-', { label: 'Supprimer la requête enregistrée', icon: 'trash', action: () => delSheet(sv) }] : []),
  ], el, { align: 'right' });

  // ---------------------------------------------------------------- exports
  const main = mainOf(q, res.c);
  const ctx: ExpCtx = {
    q, req, main, apercu: res.lignes || [], R, who, savedId: q.savedId,
    xl, setXl: (v) => setXl(v), done: loadJournal,
  };
  const ctxRef = useRef(ctx); ctxRef.current = ctx;
  const qRef = useRef(q); qRef.current = q;
  const journalRef = useRef(journal); journalRef.current = journal;
  const exportSheet = (k: Format) => {
    if (!res.c) return;
    const C = { excel: ExcelSheet, sarbacane: SarbacaneSheet, allmysms: SmsSheet, phoning: PhoningSheet, courrier: CourrierSheet }[k];
    // Le contenu lit `ctxRef` au rendu : un volet ouvert suit les changements (colonnes, journal).
    openSheet((close) => <C ctx={ctxRef.current} close={close} />, { width: k === 'phoning' ? 900 : k === 'allmysms' ? 660 : 720 });
  };

  // ---------------------------------------------------------------- rendu
  const lib = (part: 'recettes' | 'mes', close?: (v?: unknown) => void) => (
    <Bibliotheque part={part} inSheet from={q.from} savedId={q.savedId} userId={userId} counts={counts} saved={saved} savedErr={savedErr} journal={journal}
      libF={libF} setLibF={setLibF} onRecipe={(id) => { close?.(); loadRecipe(id); }} onSaved={(s) => { close?.(); loadSavedQ(s); }} onJournal={() => { close?.(); journalSheet(); }} />
  );
  const libRef = useRef(lib); libRef.current = lib;
  const P = { q, setQ, R, c: res.c, open, setOpen, impacts };
  if (vue === 'clients') return (<div className="rq2" style={{ overflow: 'hidden' }}>
    <VoirClients q={q} setQ={setQ} req={req} reqKey={key} c={res.c} main={main} onBack={() => setVue('cartes')} onClient={openClient} />{portals}</div>);
  return (
    <div className="rq2">
      <div className="rq2-in">
        <header className="rq2-head">
          <div className="rq2-title"><textarea ref={taRef} className="rq-title" rows={1} aria-label="Nom de la requête" spellCheck={false} value={q.name}
            onChange={(e) => setQState((x) => ({ ...x, name: e.target.value.replace(/\n/g, ' ') }))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }} />
            <span className="crm-tag" data-tip={sv ? `Enregistrée par ${sv.auteur}` : 'Pas encore enregistrée'}>{sv ? (sv.partagee ? <><Icon name="users" size="sm" /> Partagée</> : <><Icon name="user" size="sm" /> Perso</>) : 'Brouillon'}</span></div>
          <div className="rq2-hacts"><button className="btn" onClick={() => libSheet('recettes')}><Icon name="star" size="sm" />Partir d’une recette</button>
            <button className="btn" onClick={() => libSheet('mes')}><Icon name="file" size="sm" />Mes requêtes</button>
            <button className="btn" aria-label="Plus d’actions" data-tip="Nouvelle, dupliquer, programmer…" onClick={(e) => more(e.currentTarget)}><Icon name="more" size="sm" /></button></div>
        </header>
        <Cartes {...P} />
        <Resume q={q} c={res.c} lignes={res.lignes} busy={busy} err={res.err} saved={sv} onExport={exportSheet} onVoir={() => setVue('clients')} onSave={saveSheet} onClient={openClient} />
      </div>
      {portals}
    </div>
  );
};
export default RequeteurView;

// ---------------------------------------------------------------- volet « Enregistrer »
const SaveSheet: React.FC<{ q: Q; sv: Enregistree | undefined; mine: boolean; close: (v?: unknown) => void; onSaved: (id: number, name: string) => void }> = ({ q, sv, mine, close, onSaved }) => {
  const [name, setName] = useState(q.name);
  const [share, setShare] = useState<'me' | 'team'>(sv?.partagee ? 'team' : 'me');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy) return; setBusy(true);
    const nom = (name || 'Sans nom').trim(), partagee = share === 'team';
    const body = { nom, requete: toRequete({ ...q, name: nom }), partagee };
    try {
      let id = sv?.id ?? 0;
      if (sv && mine) await db.updateCrmRequete(sv.id, body);
      else id = (await db.saveCrmRequete(body))?.id;
      onSaved(id, nom); hud(partagee ? 'Requête enregistrée et partagée avec l’équipe' : 'Requête enregistrée'); close('ok');
    } catch (e: any) { hud(e?.message || 'Enregistrement refusé.'); setBusy(false); }
  };
  return (<>
    <div className="label" style={{ color: 'var(--accent)' }}>Requêteur</div><h3 style={{ margin: '2px 0 8px' }}>{sv && mine ? 'Mettre à jour la requête' : 'Enregistrer la requête'}</h3>
    <label className="field" style={{ marginTop: 10 }}><span className="label">Nom</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} /></label>
    <div className="field" style={{ marginTop: 12 }}><span className="label">Visible par</span>
      <Seg value={share} onChange={setShare} className="rq-full" options={[['me', <><Icon name="user" size="sm" /> Moi seulement</>], ['team', <><Icon name="users" size="sm" /> Toute l’équipe SPARK</>]]} /></div>
    <div className="crm-note" style={{ marginTop: 10 }}>On enregistre les <b>conditions</b>, jamais la liste : relancée demain, la requête tiendra compte de l’import de la nuit.{sv && !mine ? ` Cette requête appartient à ${sv.auteur} : vous en créez une copie.` : ''}</div>
    <div className="foot"><button className="btn" data-sheet="">Annuler</button><button className="btn primary" disabled={busy} onClick={save}>Enregistrer</button></div>
  </>);
};
