import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { AppProps } from '../types';
import { Chips, Icon, PickerBtn, Seg, Stack, gx, hud } from '../ui/kit';
import { db } from '../../../services/dataService';
import {
  type ClientRow, type Fiche as FicheT, type Source, FAM_C, FAM_LIST, PAGE, FinBadge, Plate, VhPill,
  brandHex, brandName, nameOf, nf, rcuId,
} from './common';
import { FicheLoader } from './Fiche';

/**
 * Clients : recherche universelle + filtres → liste paginée PAR LE SERVEUR (GET /clients, 50 lignes), fiche à droite
 * (pile sous 900 px). Maquette : `listHTML` / `itemHTML` / `wireList`.
 */

export interface Filtres {
  q: string; sites: string[]; brands: string[]; kind: 'all' | 'particulier' | 'societe'; vh: 'all' | Source; fam: string[];
  ech: 'all' | '3' | '6' | '12'; suspect: boolean; sort: 'recent' | 'nom' | 'fin';
}
export const F0 = (sites: string[] = []): Filtres => ({ q: '', sites, brands: [], kind: 'all', vh: 'all', fam: [], ech: 'all', suspect: false, sort: 'recent' });
export const nFilters = (f: Filtres) => f.sites.length + f.brands.length + f.fam.length + +(f.kind !== 'all') + +(f.vh !== 'all') + +(f.ech !== 'all') + +f.suspect;
export interface ClientsState { f: Filtres; page: number; selId: number | null; autoSel: boolean; showF: boolean }

const BRANDS = ['Renault', 'Dacia', 'Alpine', 'Nissan', 'Mobilize'];
const ECH: Record<Filtres['ech'], string> = { all: 'Toutes', 3: 'Dans les 3 mois', 6: 'Dans les 6 mois', 12: 'Dans les 12 mois' };
const SORT: Record<Filtres['sort'], string> = { recent: 'Achat le plus récent', nom: 'Nom A → Z', fin: 'Échéance la plus proche' };

/** Ce que le serveur va chercher — sert seulement à l'indication « Recherche par … » (le serveur détecte lui-même). */
function detect(q: string) {
  const t = q.trim(), compact = t.replace(/[\s.-]/g, '');
  if (!t) return null;
  if (t.includes('@')) return 'adresse e-mail';
  if (/^[A-Za-z]{2}-?\d{3}-?[A-Za-z]{2}$/.test(t.replace(/\s/g, ''))) return 'immatriculation';
  if (/^\+?\d{6,12}$/.test(compact)) return 'téléphone';
  if (/^[A-HJ-NPR-Z0-9]{8,17}$/i.test(compact) && /\d/.test(compact) && /[a-z]/i.test(compact)) return compact.length === 17 ? 'VIN' : 'VIN (partiel)';
  return 'nom, raison sociale ou ville';
}

const Item = React.memo(function Item({ c, sel, onOpen }: { c: ClientRow; sel: boolean; onOpen: (id: number, e: React.MouseEvent) => void }) {
  const v = c.vehicule;
  return (
    <div className={`crm-item ${sel ? 'sel' : ''}`} data-id={c.id} onClick={(e) => onOpen(c.id, e)}>
      <div className="n"><span className="t">{nameOf(c)}</span>{c.type === 'societe' ? <span className="crm-tag">Société</span> : null}<VhPill source={c.source_derniere} /></div>
      <div className="s"><span className="ellipsis grow">{[c.ville, c.cp ? `(${c.cp})` : ''].filter(Boolean).join(' ') || '—'}{c.site ? ` · ${c.site}` : ''}</span>
        {c.vendeur ? <span className="faint ellipsis" style={{ maxWidth: '42%' }} data-tip="Vendeur de la dernière vente"><Icon name="user" size="sm" /> {c.vendeur}</span> : null}</div>
      <div className="m">
        {v?.marque ? <i className="bd" style={{ '--c': brandHex(v.marque) } as React.CSSProperties} data-tip={brandName(v.marque)} /> : null}
        <span className="ellipsis" style={{ maxWidth: '52%' }}>{v?.modele || '—'}{c.nb_vehicules > 1 ? <> <span className="faint">+{c.nb_vehicules - 1}</span></> : null}</span>
        <Plate immat={v?.immat} /><span className="grow" /><FinBadge fin={c.fin} />
        {c.suspect ? <span className="badge" style={{ '--c': 'var(--danger)' } as React.CSSProperties} data-tip="Une coordonnée au moins est suspecte : ni rapprochement ni relance"><Icon name="alert" size="sm" />Suspecte</span> : null}
      </div>
    </div>
  );
});

const ClientsView: React.FC<{
  st: ClientsState; setSt: React.Dispatch<React.SetStateAction<ClientsState>>; compact: boolean; win: AppProps['win'];
  cache: Map<number, FicheT>; keyRef: React.MutableRefObject<((e: React.KeyboardEvent) => void) | null>; focusSearch: number;
}> = ({ st, setSt, compact, win, cache, keyRef, focusSearch }) => {
  const { f, page } = st;
  const [qDraft, setQDraft] = useState(f.q);
  const [res, setRes] = useState<{ total: number; page: number; rows: ClientRow[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pile, setPile] = useState(false);
  const [reload, setReload] = useState(0);
  const qRef = useRef<HTMLInputElement>(null), itemsRef = useRef<HTMLDivElement>(null), seq = useRef(0);

  // Recherche : un appel serveur par pause de frappe (300 ms), la frappe reste instantanée.
  useEffect(() => { setQDraft(f.q); }, [f.q]);
  useEffect(() => {
    if (qDraft === f.q) return;
    const t = setTimeout(() => setSt((s) => ({ ...s, f: { ...s.f, q: qDraft }, page: 0 })), 300);
    return () => clearTimeout(t);
  }, [qDraft]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (focusSearch) setTimeout(() => qRef.current?.focus(), 80); }, [focusSearch]);

  useEffect(() => {
    const n = ++seq.current; setLoading(true);
    db.getCrmClients({ q: f.q.trim(), sites: f.sites, marques: f.brands.map((b) => b.toUpperCase()), type: f.kind, vh: f.vh, fam: f.fam, ech: f.ech, suspect: f.suspect, sort: f.sort, page })
      .then((r) => { if (n !== seq.current) return; setRes({ total: r.total ?? 0, page: r.page ?? page, rows: r.rows ?? [] }); setErr(null); setLoading(false); })
      .catch((e) => { if (n !== seq.current) return; setErr(e.message || 'Recherche impossible.'); setLoading(false); });
  }, [f, page, reload]);

  // Sélection automatique du premier client (fenêtre large seulement), comme la maquette.
  useEffect(() => {
    if (!res || compact) return;
    if (!st.selId || !res.rows.some((c) => c.id === st.selId)) setSt((s) => ({ ...s, selId: res.rows[0]?.id ?? null, autoSel: true }));
  }, [res, compact]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!compact) setPile(false); }, [compact]);

  const sel = st.selId;
  const selRow = res?.rows.find((c) => c.id === sel);
  useEffect(() => { win.setTitle('CRM', selRow && !(compact && !pile) ? nameOf(selRow) : 'Clients'); }, [selRow, compact, pile, win]);

  const select = useCallback((id: number) => {
    setSt((s) => ({ ...s, selId: id, autoSel: false }));
    if (compact) setPile(true);
  }, [compact, setSt]);
  const onOpen = useCallback((id: number, e: React.MouseEvent) => { e.preventDefault(); select(id); }, [select]);

  const upd = (p: Partial<Filtres>) => setSt((s) => ({ ...s, f: { ...s.f, ...p }, page: 0 }));
  const setPage = (d: number) => { setSt((s) => ({ ...s, page: Math.max(0, s.page + d), selId: null })); itemsRef.current?.scrollTo(0, 0); };

  keyRef.current = (e) => {
    if (!res || compact) return;
    const i = res.rows.findIndex((c) => c.id === sel);
    if (e.key === 'ArrowDown') { e.preventDefault(); const c = res.rows[Math.min(res.rows.length - 1, i + 1)]; if (c) { select(c.id); itemsRef.current?.querySelector(`[data-id="${c.id}"]`)?.scrollIntoView({ block: 'nearest' }); } }
    if (e.key === 'ArrowUp') { e.preventDefault(); const c = res.rows[Math.max(0, i - 1)]; if (c) { select(c.id); itemsRef.current?.querySelector(`[data-id="${c.id}"]`)?.scrollIntoView({ block: 'nearest' }); } }
    if (e.key === '/') { e.preventDefault(); qRef.current?.focus(); }
  };

  const sortMenu = (el: HTMLElement) => gx().menu.open((Object.keys(SORT) as Filtres['sort'][]).map((k) => ({ label: k === 'fin' ? 'Échéance de financement la plus proche' : SORT[k], checked: f.sort === k, action: () => upd({ sort: k }) })), el);
  const pickSites = (el: HTMLElement) => gx().ui.sitePicker(el, f.sites, (v: string[]) => upd({ sites: v }), { variant: 'filter', entities: false, title: 'Site d’achat' });
  const pickFam = (el: HTMLElement) => gx().ui.pick(el, [{ items: FAM_LIST.map((x) => ({ v: x, l: x, color: FAM_C[x] })) }], { title: 'Famille de financement', selected: f.fam, allLabel: 'Toutes', onChange: (v: string[]) => upd({ fam: v }) });
  const pickEch = (el: HTMLElement) => gx().ui.pick(el, [{ items: (Object.keys(ECH) as Filtres['ech'][]).map((v) => ({ v, l: ECH[v] })) }], { multi: false, title: 'Fin de financement', selected: [f.ech],
    onChange: ([v]: string[]) => upd({ ech: (v || 'all') as Filtres['ech'], ...(v && v !== 'all' ? { sort: 'fin' as const } : {}) }) });

  const n = nFilters(f), total = res?.total ?? 0, pages = Math.max(1, Math.ceil(total / PAGE)), p = res?.page ?? page;
  const from = total ? p * PAGE + 1 : 0, to = Math.min(total, (p + 1) * PAGE), hint = detect(f.q);
  const summary = (v: string[], all: string) => gx().ui.summary(v, { all }) as string;

  const listEl = (
    <div className="crm-list">
      <div className="crm-search"><label className="search"><Icon name="search" size="sm" /><input ref={qRef} placeholder="Nom, téléphone, e-mail, plaque, VIN…" aria-label="Rechercher un client" value={qDraft} onChange={(e) => setQDraft(e.target.value)} /></label>
        {compact ? null : <button className={`btn crm-ftog ${st.showF ? 'on' : ''}`} data-tip={st.showF ? 'Masquer les filtres' : 'Filtres'} aria-label="Filtres" onClick={() => setSt((s) => ({ ...s, showF: !s.showF }))}>
          <Icon name={st.showF ? 'close' : 'filter'} size="sm" />{!st.showF && n ? <span className="count">{n}</span> : null}</button>}</div>
      <div className="crm-qhint">{hint ? <><Icon name="info" size="sm" />Recherche par <b>{hint}</b> ·</> : null}
        {err ? <span style={{ color: 'var(--danger)' }}>{err}</span> : !res ? <span>Recherche…</span> : total ? <span><b className="num">{nf(from)}–{nf(to)}</b> sur <b className="num">{nf(total)}</b> client{total > 1 ? 's' : ''}</span> : <span>Aucun résultat</span>}
        {loading && res ? <span className="faint">· mise à jour…</span> : null}
        <span className="grow" /><button className="crm-link" onClick={(e) => sortMenu(e.currentTarget)}>{SORT[f.sort]} <Icon name="chevdown" size="sm" /></button></div>
      {st.showF && !compact ? <div className="card crm-fcard">
        <div className="crm-f2"><div className="crm-fg"><span className="crm-lbl">Site (au moins un achat)</span><PickerBtn icon="pin" label={summary(f.sites, 'Tout le réseau')} active={!!f.sites.length} onClick={pickSites} /></div>
          <div className="crm-fg"><span className="crm-lbl">Famille de financement</span><PickerBtn icon="euro" label={summary(f.fam, 'Toutes')} active={!!f.fam.length} onClick={pickFam} /></div></div>
        <div className="crm-fg"><span className="crm-lbl">Marque (au moins un véhicule)</span><Chips values={BRANDS} selected={f.brands} onChange={(v) => upd({ brands: v })} colors={Object.fromEntries(BRANDS.map((b) => [b, brandHex(b)]))} /></div>
        <div className="crm-fg"><span className="crm-lbl">Client</span><Seg value={f.kind} onChange={(v) => upd({ kind: v })} options={[['all', 'Tous'], ['particulier', 'Particuliers'], ['societe', 'Sociétés']]} /></div>
        <div className="crm-fg"><span className="crm-lbl">Type d’achat</span><Seg value={f.vh} onChange={(v) => upd({ vh: v })} options={[['all', 'Tous'], ['VN', 'VN'], ['VO', 'VO'], ['BSO', 'Ancienne base']]} /></div>
        <div className="crm-f2"><div className="crm-fg"><span className="crm-lbl">Fin de financement</span><PickerBtn icon="clock" label={ECH[f.ech]} active={f.ech !== 'all'} onClick={pickEch} /></div>
          <div className="crm-fg"><span className="crm-lbl">Qualité</span><div className="col" style={{ gap: 6, paddingTop: 2 }}><label className="row" style={{ fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={f.suspect} onChange={(e) => upd({ suspect: e.target.checked })} />Coordonnée suspecte</label></div></div></div>
        <div className="crm-ffoot"><button className="crm-link" onClick={() => setSt((s) => ({ ...s, f: { ...F0(), q: s.f.q }, page: 0 }))}>Réinitialiser</button><span className="crm-note">Filtres appliqués par le serveur</span></div>
      </div> : null}
      <div className="crm-items scroll" ref={itemsRef}>
        {err && !res ? <div className="empty"><Icon name="alert" />{err}<button className="btn sm" onClick={() => setReload((x) => x + 1)}>Réessayer</button></div>
          : !res ? <div className="empty">Chargement…</div>
          : res.rows.length ? res.rows.map((c) => <Item key={c.id} c={c} sel={c.id === sel && !(compact && st.autoSel)} onOpen={onOpen} />)
          : <div className="empty"><Icon name="users" />Aucun client ne correspond.<span className="crm-note">Vérifiez l’orthographe, ou cherchez par plaque, téléphone ou VIN.</span></div>}
      </div>
      <div className="crm-pager"><button className="btn sm" disabled={p <= 0 || loading} aria-label="Page précédente" onClick={() => setPage(-1)}><Icon name="back" size="sm" /></button>
        <span className="grow num">Page {nf(p + 1)} / {nf(pages)}</span>
        <span className="faint" data-tip="Le navigateur ne reçoit que la page affichée (50 fiches). Recherche, filtres, tri et pagination sont faits par la base."><Icon name="info" size="sm" /></span>
        <button className="btn sm" disabled={p >= pages - 1 || loading} aria-label="Page suivante" onClick={() => setPage(1)}><Icon name="chevron" size="sm" /></button></div>
    </div>
  );

  const onRedirect = (id: number) => { hud('Ce client a été fusionné : ouverture de la fiche qui le regroupe.'); setSt((s) => ({ ...s, selId: id, autoSel: false })); };
  const fiche = sel ? <FicheLoader key={sel} id={sel} cache={cache} win={win} onRedirect={onRedirect} onChanged={() => setReload((x) => x + 1)} />
    : <div className="empty" style={{ height: '100%' }}><Icon name="users" /><b className="display" style={{ color: 'var(--text)', fontSize: 15 }}>Sélectionnez un client</b>↑ ↓ pour naviguer · / pour chercher</div>;

  if (compact) return <Stack onBack={() => setPile(false)} pages={[
    { key: 'l', title: 'Clients', noHead: true, content: listEl },
    ...(pile && sel ? [{ key: `c${sel}`, title: selRow ? nameOf(selRow) : rcuId(sel), content: <div className="crm-dhost">{fiche}</div> }] : []),
  ]} />;
  return <div className="split crm-split"><div className="side">{listEl}</div><div className="main scroll crm-dhost">{fiche}</div></div>;
};
export default ClientsView;
