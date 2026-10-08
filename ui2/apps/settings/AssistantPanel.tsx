import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { AssistantMe, AssistantNote, AssistantUsageView, AssistantProviderStatus, AssistantTeamRow } from '../../../types';
import { db } from '../../../services/dataService';
import { getSocket } from '../../../services/socket';
import { ASSISTANT_TEAM_ROLES } from '../../../constants';
import { hud, Icon } from '../ui/kit';
import { Head, Row, Switch, css, type SectionDef } from './common';

// =====================================================================
// Réglages › « mIAouss » — consommation, mémoire personnelle, équipe (Master / Administrateur).
// Données : db.assistant* (lecture directe, comme le panneau Stockage : aucune ressource partagée n'existe pour
// l'assistant). Rafraîchi à l'ouverture, sur `assistant:notes` (mémoire, préférences, plafond) et à la
// reconnexion du socket. Tout est gratuit : on ne parle jamais d'argent. Heures en Europe/Paris.
// =====================================================================

const NOTE_MAX = 200, NOTES_MAX = 40;
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
const nf = (n: number) => n.toLocaleString('fr-FR');
const errMsg = (e: unknown, d: string) => (e instanceof Error && e.message ? e.message : d);
const capLabel = (cap: number) => (cap < 0 ? 'sans limite' : nf(cap));
/** Jauge d'équipe : moyenne des parts restantes des fournisseurs configurés (0..1). */
const capacityPct = (ps: AssistantProviderStatus[]) => { const c = ps.filter((p) => p.configured); return c.length ? c.reduce((s, p) => s + Math.max(0, Math.min(1, p.share || 0)), 0) / c.length : 0; };
const gaugeColor = (pct: number) => (pct > 0.5 ? 'var(--ok)' : pct >= 0.2 ? 'var(--warn)' : 'var(--danger)');

interface Props { s: SectionDef; role: string; openSheet: (r: (close: (v?: unknown) => void) => React.ReactNode, o?: { width?: number }) => unknown }

function useAssistantData() {
  const [me, setMe] = useState<AssistantMe | null>(null);
  const [notes, setNotes] = useState<AssistantNote[] | null>(null);
  const [usage, setUsage] = useState<AssistantUsageView | null>(null);
  const [err, setErr] = useState('');
  const alive = useRef(true);
  const load = useCallback(() => {
    Promise.all([db.assistantMe(), db.assistantNotes(), db.assistantUsage()])
      .then(([m, n, u]) => { if (!alive.current) return; setMe(m); setNotes(n); setUsage(u); setErr(''); })
      .catch((e) => { if (alive.current) setErr(errMsg(e, 'Impossible de joindre mIAouss (serveur injoignable ?).')); });
  }, []);
  useEffect(() => {
    alive.current = true; load();
    const s = getSocket();
    s?.on('assistant:notes', load); s?.on('connect', load);
    return () => { alive.current = false; s?.off('assistant:notes', load); s?.off('connect', load); };
  }, [load]);
  return { me, setMe, notes, setNotes, usage, err, load };
}

// ---------------------------------------------------------------- consommation
const Provider = React.memo(function Provider({ p }: { p: AssistantProviderStatus }) {
  const st = !p.configured ? <span className="faint">non configuré</span>
    : p.resting ? <span style={{ color: 'var(--warn)', fontWeight: 600 }}>au repos{p.until ? ` jusqu’à ${hhmm(p.until)}` : ''}{p.reason ? ` · ${p.reason}` : ''}</span>
    : <span style={{ color: 'var(--ok)', fontWeight: 600 }}>disponible</span>;
  return <div className="row" style={{ gap: 8, fontSize: 12.5, flexWrap: 'wrap' }}><b>{p.name}</b>{st}</div>;
});

function Usage({ me, usage }: { me: AssistantMe; usage: AssistantUsageView }) {
  const cap = usage.capacity, pct = capacityPct(cap.providers), col = gaugeColor(pct);
  return (
    <>
      <div className="set-group enter" style={{ padding: '18px 20px', display: 'grid', gap: 6 }} data-anchor="conso">
        <div className="row wrap" style={{ alignItems: 'baseline', gap: '6px 12px' }}>
          <b className="num" style={{ fontSize: 26, letterSpacing: '-.02em' }}>{nf(me.today)}</b>
          <span className="muted" style={{ fontSize: 13 }}>{me.cap < 0 ? `question${me.today > 1 ? 's' : ''} aujourd’hui, sans limite` : <>sur {nf(me.cap)} aujourd’hui{me.remaining != null ? ` · ${nf(Math.max(0, me.remaining))} restante${me.remaining > 1 ? 's' : ''}` : ''}</>}</span>
        </div>
        <div className="muted" style={{ fontSize: 12.5 }}>{nf(me.month)} question{me.month > 1 ? 's' : ''} ce mois-ci</div>
      </div>
      <div className="set-gt">Capacité de l’équipe aujourd’hui</div>
      <div className="set-group enter" style={css({ '--i': 1, padding: '18px 20px', display: 'grid', gap: 10 })} data-anchor="capacite">
        <div className="set-disk"><i style={css({ width: `${Math.round(pct * 100)}%`, '--c': col })} /></div>
        <div style={{ fontSize: 13.5 }}>Environ <b className="num">{nf(Math.max(0, Math.round(cap.questionsLeft)))}</b> questions restantes <span className="faint">(estimation)</span></div>
        <div style={{ display: 'grid', gap: 4 }}>{cap.providers.map((p) => <Provider key={p.id} p={p} />)}</div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- mémoire
const NoteLine = React.memo(function NoteLine({ n, onSaved, onDeleted }: { n: AssistantNote; onSaved: (x: AssistantNote) => void; onDeleted: (id: string) => void }) {
  const [edit, setEdit] = useState(false), [val, setVal] = useState(n.content), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const save = async () => {
    const t = val.trim();
    if (!t || t === n.content) { setEdit(false); setVal(n.content); return; }
    setBusy(true); setErr('');
    try { onSaved(await db.assistantEditNote(n.id, t)); setEdit(false); } catch (e) { setErr(errMsg(e, 'Échec de la modification.')); }
    setBusy(false);
  };
  const del = async () => { setBusy(true); try { await db.assistantDeleteNote(n.id); onDeleted(n.id); } catch (e) { setErr(errMsg(e, 'Échec de la suppression.')); setBusy(false); } };
  return (
    <div className="set-row">
      <div className="t" style={{ minWidth: 0 }}>
        {edit
          ? <><input className="input" autoFocus maxLength={NOTE_MAX} value={val} disabled={busy} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEdit(false); setVal(n.content); } }} style={{ width: '100%' }} /><small className="num">{val.length} / {NOTE_MAX}</small></>
          : <b style={{ fontWeight: 500, lineHeight: 1.45, overflowWrap: 'anywhere' }}>{n.content}</b>}
        {n.source === 'ia' ? <small><span className="badge" style={css({ '--c': 'var(--bony-orange)' })}>retenue par mIAouss</span></small> : null}
        {err ? <div className="set-err">{err}</div> : null}
      </div>
      <div className="ctl">
        {edit
          ? <><button className="btn sm" disabled={busy} onClick={() => { setEdit(false); setVal(n.content); setErr(''); }}>Annuler</button><button className="btn primary sm" disabled={busy || !val.trim()} onClick={save}>Enregistrer</button></>
          : <><button className="icon-btn sm" data-tip="Modifier" aria-label="Modifier la note" disabled={busy} onClick={() => { setVal(n.content); setEdit(true); }}><Icon name="edit" size="sm" /></button><button className="icon-btn sm" data-tip="Supprimer" aria-label="Supprimer la note" disabled={busy} style={{ color: 'var(--danger)' }} onClick={del}><Icon name="trash" size="sm" /></button></>}
      </div>
    </div>
  );
});

function Memory({ me, notes, setMe, setNotes, load, openSheet }: { me: AssistantMe; notes: AssistantNote[]; setMe: (m: AssistantMe) => void; setNotes: React.Dispatch<React.SetStateAction<AssistantNote[] | null>>; load: () => void; openSheet: Props['openSheet'] }) {
  const [draft, setDraft] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const full = notes.length >= NOTES_MAX;
  const pause = async (v: boolean) => { try { setMe(await db.assistantSetPrefs({ memoryPaused: v })); } catch (e) { hud(errMsg(e, 'Échec de la modification.')); load(); } };
  const add = async () => {
    const t = draft.trim(); if (!t || busy) return;
    setBusy(true); setErr('');
    try { const n = await db.assistantAddNote(t); setNotes((L) => [n, ...(L || []).filter((x) => x.id !== n.id)]); setDraft(''); } catch (e) { setErr(errMsg(e, 'Impossible d’ajouter la note.')); }
    setBusy(false);
  };
  const clear = () => openSheet((close) => (
    <><h3>Tout effacer ?</h3><div className="muted">Les {notes.length} notes de mémoire seront supprimées pour de bon. mIAouss repartira de zéro sur ce que tu lui as appris.</div>
      <div className="foot"><button className="btn" onClick={() => close()}>Annuler</button><button className="btn primary" style={{ background: 'var(--danger)' }} onClick={async () => { close('ok'); try { await db.assistantClearNotes(); setNotes([]); hud('Mémoire effacée'); } catch (e) { hud(errMsg(e, 'Échec de la suppression.')); load(); } }}>Tout effacer</button></div></>), { width: 420 });
  return (
    <>
      <div className="set-gt">Mémoire</div>
      <div className="set-note" style={{ marginTop: 0, marginBottom: 8 }}>mIAouss lit ces notes à chaque question ; elle peut en ajouter en travaillant avec toi ; toi seul les vois.</div>
      <div className="set-group enter" style={css({ '--i': 2 })} data-anchor="memoire-pause">
        <Row t="Mémoire en pause" d={me.memoryPaused ? 'mIAouss ignore tes notes et n’en ajoute aucune' : 'mIAouss utilise tes notes et peut en retenir de nouvelles'}>
          <Switch on={me.memoryPaused} label="Mettre la mémoire de mIAouss en pause" onChange={pause} />
        </Row>
      </div>
      <div className="set-group enter" style={css({ '--i': 3, padding: '14px 16px', display: 'grid', gap: 6 })} data-anchor="memoire-notes">
        <div className="row" style={{ gap: 8 }}>
          <input className="input grow" placeholder={full ? `Limite de ${NOTES_MAX} notes atteinte` : 'Ajouter une note (ex. « Je préfère les réponses courtes »)'} maxLength={NOTE_MAX} value={draft} disabled={busy} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          <button className="btn primary" disabled={busy || !draft.trim()} onClick={add}><Icon name="plus" size="sm" />Ajouter</button>
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}><span className="set-err">{err}</span><span className="faint num" style={{ fontSize: 12 }}>{draft.length} / {NOTE_MAX} · {notes.length} / {NOTES_MAX} notes</span></div>
      </div>
      {notes.length
        ? <div className="set-group enter" style={css({ '--i': 4 })}>{notes.map((n) => <NoteLine key={n.id} n={n} onSaved={(x) => setNotes((L) => (L || []).map((y) => (y.id === x.id ? x : y)))} onDeleted={(id) => setNotes((L) => (L || []).filter((y) => y.id !== id))} />)}</div>
        : <div className="set-note">Aucune note pour l’instant.</div>}
      {notes.length ? <div style={{ marginTop: 10 }}><button className="set-link" style={{ color: 'var(--danger)' }} onClick={clear}>Tout effacer</button></div> : null}
    </>
  );
}

// ---------------------------------------------------------------- équipe
function CapCtl({ r, onSet }: { r: AssistantTeamRow; onSet: (userId: string, cap: number | null) => Promise<void> }) {
  const mode = r.customCap == null ? 'def' : r.customCap < 0 ? 'inf' : 'num';
  const [m, setM] = useState<string>(mode), [n, setN] = useState<string>(r.customCap != null && r.customCap >= 0 ? String(r.customCap) : String(Math.max(0, r.cap)));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setM(mode); if (r.customCap != null && r.customCap >= 0) setN(String(r.customCap)); }, [mode, r.customCap]);
  const run = async (cap: number | null) => { setBusy(true); try { await onSet(r.userId, cap); } catch (e) { hud(errMsg(e, 'Échec du réglage.')); setM(mode); } setBusy(false); };
  const applyNum = () => { const v = Math.round(Number(n)); if (!Number.isFinite(v) || v < 0 || v > 500) { hud('Le plafond doit être compris entre 0 et 500.'); return; } if (r.customCap !== v) run(v); };
  return (
    <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
      <select className="select" value={m} disabled={busy} aria-label={`Plafond de ${r.name}`} onChange={(e) => { const v = e.target.value; setM(v); if (v === 'def') run(null); else if (v === 'inf') run(-1); }}>
        <option value="def">Par défaut</option><option value="inf">Sans limite</option><option value="num">Nombre…</option>
      </select>
      {m === 'num' ? <input className="input" type="number" min={0} max={500} value={n} disabled={busy} aria-label={`Nombre de questions par jour pour ${r.name}`} style={{ width: 76 }} onChange={(e) => setN(e.target.value)} onBlur={applyNum} onKeyDown={(e) => { if (e.key === 'Enter') applyNum(); }} /> : null}
    </div>
  );
}

function Team({ rows, canSetCaps, onSet }: { rows: AssistantTeamRow[]; canSetCaps: boolean; onSet: (userId: string, cap: number | null) => Promise<void> }) {
  return (
    <>
      <div className="set-gt">Équipe</div>
      <div className="set-group enter" style={css({ '--i': 5, overflow: 'hidden' })} data-anchor="equipe">
        <div className="scroll" style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>Nom</th><th>Aujourd’hui</th><th>30 jours</th><th>Jetons (30 j)</th>{canSetCaps ? <th style={{ textAlign: 'right' }}>Plafond</th> : null}</tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.userId}>
                <td><b>{r.name}</b></td>
                <td className="num">{nf(r.today)} / {capLabel(r.cap)}</td>
                <td className="num">{nf(r.last30)}</td>
                <td className="num">{nf(r.tokens30)}</td>
                {canSetCaps ? <td><CapCtl r={r} onSet={onSet} /></td> : null}
              </tr>))}</tbody>
          </table>
        </div>
      </div>
      <div className="set-note">Plafond = nombre de questions par jour. « Par défaut » : 25 questions. Le Master n’a pas de limite.</div>
    </>
  );
}

// ---------------------------------------------------------------- panneau
export function AssistantPanel({ s, role, openSheet }: Props) {
  const team = ASSISTANT_TEAM_ROLES.includes(role);
  const { me, setMe, notes, setNotes, usage, err, load } = useAssistantData();
  const setCap = async (userId: string, cap: number | null) => { await db.assistantSetCap(userId, cap); load(); };
  if (!me || !notes || !usage) return <div className="set-panel"><Head s={s} /><div className="set-group" style={{ padding: 22 }}>{err ? <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{err}</span> : <span className="muted">Chargement…</span>}</div></div>;
  return (
    <div className="set-panel"><Head s={s} />
      {err ? <div className="set-err" style={{ marginBottom: 8 }}>{err}</div> : null}
      <Usage me={me} usage={usage} />
      <Memory me={me} notes={notes} setMe={setMe} setNotes={setNotes} load={load} openSheet={openSheet} />
      {team && usage.team ? <Team rows={usage.team} canSetCaps={!!usage.canSetCaps} onSet={setCap} /> : null}
    </div>
  );
}
