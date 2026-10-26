import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { AppProps } from '../types';
import { gx, useCompact, useEngineEvent, useEngineStore, Icon } from '../ui/kit';
import { db } from '../../../services/dataService';
import { useAuth } from '../../../contexts/AuthContext';
import { type Fiche as FicheT, Tabs, nf } from './common';
import ImportsView, { type Run, quand } from './ImportsView';
import HomeView, { type Shortcut } from './HomeView';
import ClientsView, { type ClientsState, type Filtres, F0 } from './ClientsView';
import ArbitrageView from './ArbitrageView';
import RequeteurView, { type RqStore } from './requeteur/RequeteurView';
import EquipesView from './equipes/EquipesView';

/**
 * Rubrique SPARK (id technique : crm) — référentiel client unique (RCU), base dédiée du VPS. Maquette validée : maquettes/crm/v2/.
 * « RCU » est le nom technique : il n'apparaît jamais à l'écran (l'outil s'appelle SPARK).
 * Contrat d'API : ./CONTRAT-API.md (tout passe par `db.*`, jamais `fetch` direct).
 *
 * Lot 1 (12/10/2026) : l'écran « Imports ». Lot 2 : Accueil, Clients (liste paginée par le serveur + fiche),
 * À arbitrer. Lot 3 : Requêteur (./requeteur/). Lot 4 : Équipes et portefeuilles (./equipes/). Accès : interrupteur SPARK + invités du Master (26/10/2026) — le refus réel est côté serveur
 * (`/api/crm`, porte unique backend/src/auth/crmAccess.ts). Onglet Imports : Master seul (`requireCrmMaster` côté serveur) ;
 * un invité ne le voit pas et l'Accueil lui montre le dernier import de chaque source depuis GET /apercu, sans détail.
 */

type View = 'home' | 'clients' | 'arb' | 'req' | 'equipes' | 'imports';
const VIEW_L: Record<View, string> = { home: 'Accueil', clients: 'Clients', arb: 'À arbitrer', req: 'Requêteur', equipes: 'Équipes', imports: 'Imports' };

const perToCtx = (): string[] => {
  const p = gx().ctx?.perimetre;
  return p && p !== 'Tout le réseau' && (gx().data.SITES as string[] | undefined)?.includes(p) ? [p] : [];
};

export default function CrmApp({ win, inst }: AppProps) {
  const { user } = useAuth();
  const canImports = user?.role === 'Master';
  const rootRef = useRef<HTMLDivElement>(null);
  const compact = useCompact(rootRef, 900);
  const [storedView, setView] = useEngineStore<View>('crm.view', 'home');
  const view: View = storedView === 'imports' && !canImports ? 'home' : VIEW_L[storedView] ? storedView : 'home';

  const [runs, setRuns] = useState<Run[] | null>(null);
  const [apercu, setApercu] = useState<any>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [runSel, setRunSel] = useState<number | null>(null);
  const [arbTotal, setArbTotal] = useState<number | null>(null);
  const [cs, setCs] = useState<ClientsState>(() => ({ f: F0(perToCtx()), page: 0, selId: null, autoSel: false, showF: false }));
  const [focusSearch, setFocusSearch] = useState(0);
  const fiches = useRef(new Map<number, FicheT>()).current;
  const keyRef = useRef<((e: React.KeyboardEvent) => void) | null>(null);
  const lastPer = useRef(gx().ctx?.perimetre);
  const rqStore = useRef<RqStore | null>(null);

  const load = useCallback(() => {
    // Journal complet des imports : Master seul (le serveur refuse GET /imports aux invités). Un invité garde le
    // résumé « dernier import par source » de GET /apercu (source, statut, date : aucune donnée nominative).
    db.getCrmApercu().then((a) => {
      setApercu(a); setErreur(null); if (typeof a?.a_arbitrer === 'number') setArbTotal(a.a_arbitrer);
      if (!canImports) setRuns(Array.isArray(a?.imports) ? a.imports : []);
    }).catch((e) => { setErreur(e.message || 'Chargement impossible.'); if (!canImports) setRuns((r) => r ?? []); });
    if (canImports) db.getCrmImports().then(setRuns).catch(() => setRuns((r) => r ?? []));
  }, [canImports]);
  useEffect(() => { load(); }, [load]);
  // Une demande « appliquer quand même » en attente : on relit toutes les 20 s jusqu'à son traitement.
  const enAttente = !!runs?.some((r) => r.force_demande_le);
  useEffect(() => { if (!enAttente) return; const t = setInterval(load, 20000); return () => clearInterval(t); }, [enAttente, load]);

  // Périmètre de la coque : il devient le filtre de site de la liste (comme la maquette).
  useEngineEvent('ctx', () => {
    const p = gx().ctx?.perimetre; if (p === lastPer.current) return;
    lastPer.current = p; setCs((s) => ({ ...s, f: { ...s.f, sites: perToCtx() }, page: 0, selId: null }));
  });

  useEffect(() => { if (view !== 'clients') win.setTitle('SPARK', VIEW_L[view]); }, [view, win]);
  // Une décision d’arbitrage peut fusionner des fiches déjà ouvertes : le cache des fiches est vidé.
  const onArbTotal = useCallback((n: number) => { fiches.clear(); setArbTotal(n); }, [fiches]);

  const go = useCallback((v: View, opts: { filters?: Partial<Filtres>; showF?: boolean; focus?: boolean; run?: number } = {}) => {
    if (v === 'imports' && !canImports) return;
    setView(v);
    if (opts.filters) setCs((s) => ({ ...s, f: { ...F0(perToCtx()), ...opts.filters }, page: 0, selId: null, autoSel: false, showF: !!opts.showF }));
    if (opts.run) setRunSel(opts.run);
    if (opts.focus) setFocusSearch((n) => n + 1);
  }, [canImports, setView]);

  const shortcut = (k: Shortcut, run?: number) => ({
    search: () => go('clients', { filters: {}, focus: true }),
    all: () => go('clients', { filters: {} }),
    fin6: () => go('clients', { filters: { ech: '6', sort: 'fin' }, showF: true }),
    sus: () => go('clients', { filters: { suspect: true }, showF: true }),
    arb: () => go('arb'),
    imports: () => go('imports', { run }),
    req: () => go('req'),
  }[k]());

  const views: View[] = ['home', 'clients', 'arb', 'req', 'equipes', ...(canImports ? ['imports' as View] : [])];
  inst.command = (c: string) => {
    if (c === 'search') go('clients', { filters: {}, focus: true });
    if (c === 'arbitrage') go('arb');
    if (c === 'requeteur') go('req');
    if (typeof c === 'string' && c.startsWith('client:')) { const id = Number(c.slice(7)); if (id) { setCs((s) => ({ ...s, selId: id, autoSel: false })); go('clients'); } }
  };
  // Aperçu du Requêteur → fiche du client dans l'onglet Clients.
  const openClient = useCallback((id: number) => { setCs((s) => ({ ...s, selId: id, autoSel: false })); go('clients'); }, [go]);
  const setSort = (s: Filtres['sort']) => { setCs((x) => ({ ...x, f: { ...x.f, sort: s }, page: 0 })); go('clients'); };
  inst.menus = () => ({
    'Fichier': [{ label: 'Rechercher un client', icon: 'search', kbd: '/', action: () => go('clients', { focus: true }) }, { label: 'Actualiser', icon: 'refresh', action: () => { fiches.clear(); load(); } }],
    'Présentation': [...views.map((k) => ({ label: VIEW_L[k], checked: view === k, action: () => go(k) })), '-',
      { label: 'Clients : achat le plus récent d’abord', checked: cs.f.sort === 'recent', action: () => setSort('recent') },
      { label: 'Clients : nom A → Z', checked: cs.f.sort === 'nom', action: () => setSort('nom') },
      { label: 'Clients : échéance la plus proche', checked: cs.f.sort === 'fin', action: () => setSort('fin') }],
  });

  const lastVN = runs?.filter((r) => r.source === 'VN' && r.statut === 'applique').sort((a, b) => b.id - a.id)[0];
  const sub = apercu ? [typeof apercu.clients === 'number' ? `${nf(apercu.clients)} clients` : '', lastVN ? `mis à jour ${quand(lastVN.fin)}` : ''].filter(Boolean).join(' · ') : '';

  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest?.('input,textarea,select') || e.ctrlKey || e.metaKey || e.altKey) return;
    keyRef.current?.(e);
  };
  keyRef.current = null;

  let body: React.ReactNode;
  if (view === 'clients') body = <ClientsView st={cs} setSt={setCs} compact={compact} win={win} cache={fiches} keyRef={keyRef} focusSearch={focusSearch} />;
  else if (view === 'arb') body = <ArbitrageView onTotal={onArbTotal} keyRef={keyRef} />;
  else if (view === 'req') body = <RequeteurView win={win} store={rqStore} per={perToCtx()[0] || null} userId={String(user?.id ?? '')} who={user?.name || 'inconnu'} openClient={openClient} />;
  else if (view === 'equipes') body = <EquipesView win={win} compact={compact} openClient={openClient} />;
  else if (view === 'imports') body = runs ? <ImportsView runs={runs} win={win} reload={load} compact={compact} selId={runSel} onSel={setRunSel} /> : <div className="empty" style={{ height: '100%' }}>Chargement…</div>;
  else body = erreur && !apercu ? <div className="empty" style={{ height: '100%' }}><Icon name="alert" />{erreur}<button className="btn sm" onClick={load}>Réessayer</button></div>
    : !apercu ? <div className="empty" style={{ height: '100%' }}>Chargement…</div>
    : <HomeView apercu={apercu} runs={runs} arbTotal={arbTotal} canImports={canImports} go={shortcut} />;

  return (
    <div className="app crm" ref={rootRef} tabIndex={-1} onKeyDown={onKey}>
      <div className="app-head"><div className="ah-t"><span className="ah-eye">Relation client</span><h1>SPARK</h1><span className="sub">{sub}</span></div>
        <div className="ah-tabs"><Tabs value={view} onChange={(v) => go(v)} options={views.map((k) => [k, <>{VIEW_L[k]}{k === 'arb' && arbTotal ? <span className="count" style={{ background: 'var(--warn)', marginLeft: 4 }}>{nf(arbTotal)}</span> : null}</>] as [View, React.ReactNode])} /></div></div>
      <div className="crm-view">{body}</div>
    </div>
  );
}
