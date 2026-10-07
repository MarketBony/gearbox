import React, { useState } from 'react';
import { Icon } from '../../ui/kit';
import { driveDays, driveTimes, type Drive, type Field } from '../../../../shared/bonyform';
import { pickImage } from './Studio';
import { FrameEditor } from './Frame';

// =====================================================================
// Réglages du champ « Prise d'essai » (F3, 01/10/2026). Le parc est saisi DANS le formulaire (décision de
// Théo) : voitures et exemplaires, durée des créneaux, période, horaires par jour, jours fermés, voitures au
// même moment, délai de prévenance. Calendrier et places : fonctions partagées (shared/bonyform.ts).
// =====================================================================

type Set = (p: Partial<Field> | ((f: Field) => void)) => void;
const DAYS: [string, string][] = [['1', 'Lundi'], ['2', 'Mardi'], ['3', 'Mercredi'], ['4', 'Jeudi'], ['5', 'Vendredi'], ['6', 'Samedi'], ['7', 'Dimanche']];
const rid = () => 'c' + Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');

export default function DriveEditor({ f, set }: { f: Field; set: Set }) {
  const d = f.drive!;
  const up = (fn: (x: Drive) => void) => set((x) => { fn(x.drive!); });
  const [ex, setEx] = useState('');
  const [frK, setFrK] = useState<number | null>(null);    // F5 : voiture dont on règle le cadrage de la photo
  const frC = frK !== null ? d.cars[frK] : undefined;
  const days = driveDays(d), slots = days.reduce((n, day) => n + driveTimes(d, day).length, 0);
  const fleet = d.cars.reduce((n, c) => n + (c.count || 0), 0);
  return (
    <div className="bfd">
      <div className="bfe-gt">Voitures à l’essai</div>
      {d.cars.map((c, k) => (
        <div key={c.id} className="bfd-car">
          <button className="bfd-img" style={c.image ? { backgroundImage: `url("${c.image}")` } : undefined} aria-label="Photo" data-tip="Photo (facultatif)"
            onClick={async () => { const u = await pickImage(900); if (u) up((x) => { x.cars[k].image = u; delete x.cars[k].frame; }); }}>{c.image ? null : <Icon name="image" size="sm" />}</button>
          {c.image ? <button className="icon-btn sm" aria-label="Cadrer" data-tip="Cadrer la photo" onClick={() => setFrK(frK === k ? null : k)}><Icon name="target" size="sm" /></button> : null}
          <input className="bfe-in" value={c.label} placeholder="ex. Renault 5 E-Tech" maxLength={60} onChange={(e) => up((x) => { x.cars[k].label = e.target.value; })} />
          <input className="bfe-in bfd-n" type="number" min={1} max={50} value={c.count} aria-label="Exemplaires" data-tip="Exemplaires disponibles" onChange={(e) => up((x) => { x.cars[k].count = Math.max(1, Math.min(50, Number(e.target.value) || 1)); })} />
          {d.cars.length > 1 ? <button className="icon-btn sm" aria-label="Retirer" onClick={() => up((x) => { x.cars.splice(k, 1); })}><Icon name="close" size="sm" /></button> : null}
        </div>))}
      {frC?.image ? <FrameEditor url={frC.image} frame={frC.frame} ratio={4 / 3} label={`Cadrage — ${frC.label}`} onClose={() => setFrK(null)}
        onChange={(fr) => up((x) => { const c = x.cars[frK!]; if (!c) return; if (fr) c.frame = fr; else delete c.frame; })} /> : null}
      <button className="btn sm" onClick={() => up((x) => { x.cars.push({ id: rid(), label: `Modèle ${x.cars.length + 1}`, count: 1 }); })}><Icon name="plus" size="sm" />Voiture</button>
      <div className="bfe-hint">Le nombre = exemplaires : 2 exemplaires = deux clients peuvent essayer ce modèle sur le même créneau.</div>

      <div className="bfe-gt">Créneaux</div>
      <div className="bfe-row">
        <label className="bfe-f"><span>Durée d’un essai</span>
          <select className="bfe-in" value={String(d.slot)} onChange={(e) => up((x) => { x.slot = Number(e.target.value) as any; })}>{[15, 30, 45, 60, 90, 120].map((n) => <option key={n} value={n}>{n < 60 ? `${n} min` : n === 60 ? '1 h' : n === 90 ? '1 h 30' : '2 h'}</option>)}</select></label>
        <label className="bfe-f"><span>Prévenance</span>
          <select className="bfe-in" value={String(d.leadHours ?? 2)} onChange={(e) => up((x) => { x.leadHours = Number(e.target.value); })}>{[0, 1, 2, 4, 12, 24, 48].map((n) => <option key={n} value={n}>{n === 0 ? 'Aucune' : n < 24 ? `${n} h avant` : `${n / 24} jour${n > 24 ? 's' : ''} avant`}</option>)}</select></label>
      </div>
      <div className="bfe-row">
        <label className="bfe-f"><span>Du (facultatif)</span><input className="bfe-in" type="date" value={d.from || ''} onChange={(e) => up((x) => { x.from = e.target.value || null; })} /></label>
        <label className="bfe-f"><span>Au (facultatif)</span><input className="bfe-in" type="date" value={d.to || ''} onChange={(e) => up((x) => { x.to = e.target.value || null; })} /></label>
      </div>
      <label className="bfe-f"><span>Voitures au plus sur un même créneau (tous modèles)</span>
        <input className="bfe-in" type="number" min={1} max={fleet || 1} value={d.perSlot ?? ''} placeholder={`Tout le parc (${fleet})`} onChange={(e) => up((x) => { const n = Number(e.target.value); x.perSlot = e.target.value && n >= 1 ? n : null; })} /></label>
      <div className="bfe-hint">Utile si l’équipe ne peut accompagner que quelques essais à la fois.</div>

      <div className="bfe-gt">Horaires d’ouverture</div>
      <div className="bfd-week">{DAYS.map(([k, l]) => {
        const r = d.hours[k] || [];
        return (
          <div key={k} className={`bfd-day ${r.length ? '' : 'off'}`}>
            <label className="frm-tg sm"><input type="checkbox" checked={!!r.length} onChange={(e) => up((x) => { x.hours[k] = e.target.checked ? [['09:00', '12:00'], ['14:00', '18:00']] : []; })} /><span className="sw" /><span>{l}</span></label>
            <div className="bfd-ranges">{r.map(([a, b], j) => (
              <span key={j} className="bfd-range">
                <input type="time" step={900} value={a} onChange={(e) => up((x) => { x.hours[k][j][0] = e.target.value; })} />–
                <input type="time" step={900} value={b} onChange={(e) => up((x) => { x.hours[k][j][1] = e.target.value; })} />
                <button className="icon-btn sm" aria-label="Retirer la plage" onClick={() => up((x) => { x.hours[k].splice(j, 1); })}><Icon name="close" size="sm" /></button>
              </span>))}
              {r.length && r.length < 3 ? <button className="btn sm" onClick={() => up((x) => { x.hours[k].push(['14:00', '18:00']); })}><Icon name="plus" size="sm" /></button> : null}
            </div>
          </div>);
      })}</div>
      <button className="btn sm" onClick={() => up((x) => { const m = x.hours['1'] || []; ['2', '3', '4', '5'].forEach((k) => { x.hours[k] = m.map((p) => [p[0], p[1]] as [string, string]); }); })}>Copier le lundi sur mardi → vendredi</button>

      <div className="bfe-gt">Jours fermés</div>
      <div className="bfd-ex">{(d.exclude || []).map((x) => <span key={x} className="badge">{new Date(`${x}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })}<button aria-label="Retirer" onClick={() => up((y) => { y.exclude = (y.exclude || []).filter((z) => z !== x); })}>×</button></span>)}</div>
      <div className="bst-kitnew"><input className="bfe-in" type="date" value={ex} onChange={(e) => setEx(e.target.value)} /><button className="btn sm" disabled={!ex} onClick={() => { up((y) => { y.exclude = [...new Set([...(y.exclude || []), ex])].sort(); }); setEx(''); }}>Fermer ce jour</button></div>

      <div className={`bfd-sum ${slots ? '' : 'bad'}`}><Icon name={slots ? 'check' : 'alert'} size="sm" />{slots ? <span><b>{days.length}</b> jour{days.length > 1 ? 's' : ''} · <b>{slots}</b> créneau{slots > 1 ? 'x' : ''} à venir · jusqu’à <b>{slots * Math.min(fleet, d.perSlot || fleet)}</b> essais</span> : <span>Aucun créneau à venir : vérifiez la période et les horaires.</span>}</div>
    </div>
  );
}
