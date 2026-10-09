import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Equipment, EquipmentBooking, ServiceType } from '../../../types';
import { SERVICES, SITES_HORS_PLAQUE } from '../../../constants';
import { createBooking, updateBooking, deleteBooking, createEquipment, updateEquipment } from '../../store/collections';
import { gx, hud, Icon } from '../ui/kit';
import { P, isoAdd, range, available, usedOn, KNOWN_SITES, PLAQUES } from './logic';

// =====================================================================
// Panneau latéral de saisie (modèle Dépenses de la maquette) : réservation et matériel.
// Champs, défauts, messages et charges envoyées = ceux des modales de pages/Material.tsx.
// =====================================================================

export type Log = (action: string, entity: 'equipment' | 'booking', entityName: string) => void;

/** Coque du panneau (`.mat-side-in`) : en-tête, corps défilant, pied. Échap ferme (hors menus). */
export function Side({ icon, title, onClose, foot, children }: { icon: string; title: string; onClose: () => void; foot: React.ReactNode; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => ref.current?.querySelector<HTMLElement>('input:not([disabled]),textarea')?.focus({ preventScroll: true }), 80);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="mat-side-in" ref={ref} onKeyDown={(e) => { if (e.key === 'Escape' && !(e.target as HTMLElement).closest('.menu')) { e.stopPropagation(); onClose(); } }}>
      <div className="mat-side-h"><span className="ic"><Icon name={icon} /></span><h3 className="ellipsis">{title}</h3><button className="icon-btn" data-tip="Fermer (Échap)" onClick={onClose}><Icon name="close" /></button></div>
      <div className="mat-side-b scroll">{children}</div>
      <div className="mat-side-f">{foot}</div>
    </div>
  );
}
const Err = ({ m }: { m: string }) => <div className={`full mat-err ${m ? '' : 'hide'}`}>{m ? <><Icon name="alert" size="sm" />{m}</> : null}</div>;
const apiMsg = (e: any, dflt: string) => (e?.message && !/^Erreur \d+$/.test(e.message) && e.message !== 'Serveur injoignable' ? e.message : dflt);

// ---------------------------------------------------------------- réservation
export interface BookingPre { edit?: string; eq?: string; start?: string; end?: string; askDelete?: boolean }

interface BookingProps {
  pre: BookingPre; edit: EquipmentBooking | null; equipment: Equipment[]; bookings: EquipmentBooking[]; defaultEq: string; uid: string;
  log: Log; onClose: () => void; onCreated: (b: EquipmentBooking) => void;
}
export const BookingForm: React.FC<BookingProps> = ({ pre, edit, equipment, bookings, defaultEq, uid, log, onClose, onCreated }) => {
  const T = gx().iso(gx().today());
  // Défauts de la vraie page (openBookingModal) : site GROUPE BONY, service Tous Services, marque Holding (sans champ).
  const [v, setV] = useState(() => edit
    ? { eq: edit.equipmentId, start: edit.startDate, end: edit.endDate, qty: String(edit.quantity), site: edit.site as string, service: edit.service as string, note: edit.description || '' }
    : { eq: pre.eq || defaultEq || equipment[0]?.id || '', start: pre.start || T, end: pre.end || pre.start || T, qty: '1', site: 'GROUPE BONY', service: 'Tous Services', note: '' });
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false), [delAsk, setDelAsk] = useState(!!pre.askDelete);
  const set = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));
  const rootRef = useRef<HTMLDivElement>(null), dispoRef = useRef<HTMLSpanElement>(null), delRef = useRef<HTMLSpanElement>(null);
  const eq = equipment.find((e) => e.id === v.eq);
  const qty = parseInt(v.qty, 10) || 0;
  const ok = !!(v.eq && v.start && v.end);
  // Recalculée à chaque changement de la liste des réservations, panneau ouvert compris (comme la page).
  const dispo = ok && eq ? available(bookings, eq, v.start, v.end < v.start ? v.start : v.end, edit?.id) : null;
  const days = useMemo(() => { const out: string[] = []; if (ok) for (let d = v.start, n = 0; d <= v.end && n < 62; d = isoAdd(d, 1), n++) out.push(d); return out; }, [ok, v.start, v.end]);
  useEffect(() => { if (dispo !== null && qty <= dispo) setErr(''); }, [dispo, qty]);
  useEffect(() => { if (delAsk && delRef.current) gx().animate(delRef.current, [{ opacity: 0 }, { opacity: 1 }], { duration: 160 }); }, [delAsk]);

  const clampQty = () => {
    // Comme la vraie saisie : une quantité au-delà du disponible est refusée (ramenée au disponible).
    let q = parseInt(v.qty, 10) || 1;
    if (dispo !== null && q > dispo && dispo > 0) { q = dispo; if (dispoRef.current) gx().animate(dispoRef.current, [{ transform: 'scale(1.2)' }, { transform: 'none' }], { spring: 'bouncy' }); }
    set({ qty: String(Math.max(1, q)) });
  };
  const shake = () => rootRef.current && gx().animate(rootRef.current.closest('.mat-side-in') || rootRef.current, [{ transform: 'none' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-5px)' }, { transform: 'none' }], { duration: 420, easing: 'ease-out' });

  const save = async () => {
    if (!v.eq || !v.start || !v.end || !qty) return setErr('Veuillez remplir tous les champs obligatoires.');
    if (v.end < v.start) return setErr('La date de fin doit être postérieure ou égale à la date de début.');
    if (!eq) return;
    const d = available(bookings, eq, v.start, v.end, edit?.id);
    if (qty > d) { setErr(`Stock insuffisant ! Disponible : ${d} / ${eq.totalQuantity}`); shake(); return; }
    setBusy(true); setErr('');
    try {
      if (edit) {
        // Même charge que la page : l'enregistrement complet, matériel et marque inchangés.
        await updateBooking({ ...edit, startDate: v.start, endDate: v.end, quantity: qty, site: v.site as any, service: v.service as ServiceType, description: v.note });
        log('a modifié une réservation matériel', 'booking', eq.name);
        hud('Réservation modifiée');
      } else {
        const created = await createBooking({ equipmentId: v.eq, startDate: v.start, endDate: v.end, quantity: qty, site: v.site as any, service: v.service as ServiceType, brand: 'Holding', description: v.note });
        log('a créé une réservation matériel', 'booking', eq.name);
        gx().shell?.notify?.({ app: 'material', u: uid, title: 'Réservation créée', body: `${qty}x ${eq.name} · ${range(v.start, v.end)} · ${v.site} · ${v.service}`, onClick: () => gx().wm?.open?.('material'), silent: true });
        onCreated(created);
      }
      onClose();
    } catch (e) { setErr(apiMsg(e, 'Échec de l’enregistrement (serveur injoignable ?).')); setBusy(false); }
  };
  const remove = async () => {
    if (!edit) return; setBusy(true);
    try {
      await deleteBooking(edit.id);
      log('a supprimé une réservation matériel', 'booking', eq?.name || 'Matériel');
      onClose(); hud('Réservation supprimée');
    } catch (e) { setErr(apiMsg(e, 'Échec de la suppression (serveur injoignable ?).')); setBusy(false); setDelAsk(false); }
  };

  const siteKnown = KNOWN_SITES.includes(v.site);
  return (
    <Side icon={edit ? 'edit' : 'plus'} title={edit ? 'Modifier la réservation' : 'Nouvelle réservation'} onClose={onClose}
      foot={<>{edit ? <span className="mat-del" ref={delRef}>{delAsk
        ? <><span>Confirmer ?</span><button className="btn sm yes" disabled={busy} onClick={remove}>Oui</button><button className="btn sm ghost" onClick={() => setDelAsk(false)}>Non</button></>
        : <button className="btn ghost danger" onClick={() => setDelAsk(true)}>Supprimer</button>}</span> : null}
        <button className="btn" onClick={onClose}>Annuler</button><button className="btn primary" disabled={busy} onClick={save}>Enregistrer</button></>}>
      <div className="form-grid" ref={rootRef}>
        <label className="field full"><span className="label">Matériel</span><select className="select" value={v.eq} disabled={!!edit} onChange={(e) => set({ eq: e.target.value })}>{equipment.map((e) => <option key={e.id} value={e.id}>{e.name} (Total: {e.totalQuantity})</option>)}</select></label>
        <label className="field"><span className="label">Date de début</span><input type="date" className="input" value={v.start} onChange={(e) => { const s = e.target.value; set({ start: s, ...(v.end && s && v.end < s ? { end: s } : {}) }); }} /></label>
        <label className="field"><span className="label">Date de fin</span><input type="date" className="input" value={v.end} onChange={(e) => set({ end: e.target.value })} /></label>
        <label className="field full"><span className="row"><span className="label grow">Quantité</span><span className="mat-dispo num" ref={dispoRef} style={{ color: dispo === 0 ? 'var(--danger)' : 'var(--ok)' }}>{dispo === null ? '' : `Disponible : ${dispo}`}</span></span>
          <input type="number" className={`input num mat-qty ${dispo !== null && qty > dispo ? 'over' : ''}`} min={1} max={dispo !== null ? dispo : undefined} value={v.qty} onChange={(e) => set({ qty: e.target.value })} onBlur={clampQty} onKeyDown={(e) => { if (e.key === 'Enter') clampQty(); }} /></label>
        <label className="field"><span className="label">Site</span><select className="select" value={v.site} onChange={(e) => set({ site: e.target.value })}>
          {!siteKnown && v.site ? <option value={v.site}>{v.site}</option> : null}
          <option value="GROUPE BONY">GROUPE BONY</option>
          {Object.entries(PLAQUES).map(([pl, ss]) => <optgroup key={pl} label={pl}>{ss.map((s) => <option key={s} value={s}>{s}</option>)}</optgroup>)}
          <optgroup label="Hors plaque">{(SITES_HORS_PLAQUE as string[]).map((s) => <option key={s} value={s}>{s}</option>)}</optgroup>
          <optgroup label="Entité"><option value="Nissan">Nissan</option></optgroup></select></label>
        <label className="field"><span className="label">Service</span><select className="select" value={v.service} onChange={(e) => set({ service: e.target.value })}>{SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
        {eq ? <div className="field full"><span className="label">Disponibilité jour par jour · {eq.name}{days.length ? ` · ${days.length} jour${days.length > 1 ? 's' : ''}` : ''}</span><div className="mat-strip">
          {days.map((d) => { const free = eq.totalQuantity - usedOn(bookings, eq.id, d, edit?.id); return <i key={d} className={free <= 0 ? 'full' : free < qty ? 'low' : ''} style={{ height: `${Math.max(12, (Math.max(0, free) / (eq.totalQuantity || 1)) * 100)}%` }} data-tip={`${gx().fmt.dateLong(P(d))} : ${Math.max(0, free)} / ${eq.totalQuantity} disponible${free > 1 ? 's' : ''}`} />; })}</div></div> : null}
        <label className="field full"><span className="label">Description / Détail OP</span><textarea className="textarea" placeholder="Détails de l'événement..." style={{ minHeight: 96, resize: 'none' }} value={v.note} onChange={(e) => set({ note: e.target.value })} /></label>
        <Err m={err} />
      </div>
    </Side>
  );
};

// ---------------------------------------------------------------- matériel (catalogue)
export const EquipmentForm: React.FC<{ e: Equipment | null; equipment: Equipment[]; log: Log; onClose: () => void }> = ({ e, equipment, log, onClose }) => {
  const cats = useMemo(() => [...new Set(equipment.map((x) => x.category).filter(Boolean) as string[])], [equipment]);
  // Défauts de la page : catégorie « Autre », quantité 1 à la création.
  const [v, setV] = useState(() => ({ name: e?.name || '', cat: e ? e.category || '' : 'Autre', qty: String(e?.totalQuantity || 1) }));
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const save = async () => {
    const name = v.name.trim(), cat = v.cat.trim(), qty = parseInt(v.qty, 10) || 0;
    if (!name || !qty) return setErr('Veuillez remplir le nom et la quantité.');
    setBusy(true); setErr('');
    try {
      if (e) await updateEquipment({ ...e, name, category: cat, totalQuantity: qty });
      else await createEquipment({ name, totalQuantity: qty, category: cat });
      log(e ? 'a modifié le matériel' : 'a ajouté le matériel', 'equipment', name);
      onClose(); hud(e ? 'Matériel modifié' : 'Matériel ajouté');
    } catch (x) { setErr(apiMsg(x, 'Échec de l’enregistrement (serveur injoignable ?).')); setBusy(false); }
  };
  return (
    <Side icon={e ? 'edit' : 'material'} title={e ? 'Modifier le matériel' : 'Nouveau matériel'} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn primary" disabled={busy} onClick={save}>Enregistrer</button></>}>
      <div className="form-grid">
        <label className="field full"><span className="label">Nom du matériel</span><input className="input" value={v.name} placeholder="Ex: Enceinte JBL" onChange={(x) => setV({ ...v, name: x.target.value })} onKeyDown={(x) => { if (x.key === 'Enter') save(); }} /></label>
        <label className="field full"><span className="label">Catégorie</span><input className="input" list="matCats" value={v.cat} placeholder="Ex: Son, Mobilier, PLV..." onChange={(x) => setV({ ...v, cat: x.target.value })} /><datalist id="matCats">{cats.map((c) => <option key={c} value={c} />)}</datalist></label>
        <label className="field"><span className="label">Quantité Totale</span><input type="number" className="input num" min={1} value={v.qty} onChange={(x) => setV({ ...v, qty: x.target.value })} /></label>
        <Err m={err} />
      </div>
    </Side>
  );
};
