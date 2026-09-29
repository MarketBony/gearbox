import React, { useMemo, useState } from 'react';
import type { CongeType, User } from '../../../types';
import { gx, Icon, Avatar } from '../ui/kit';
import { TypesGrid, joursOuvres } from './common';

// Panneaux LATÉRAUX de la rubrique Congés (maquette : `panel()`, modèle Dépenses) :
// « Poser une période » (ModalePeriode) et « Participants » (ModaleParticipants).

/** Coque du panneau : en-tête (icône, titre, fermer), sous-titre, corps défilant, pied. */
export const SideShell: React.FC<{ icon: string; title: string; sub?: string; foot: React.ReactNode; onClose: () => void; children?: React.ReactNode }> = ({ icon, title, sub, foot, onClose, children }) => (
  <div className="cng-side-in" onKeyDown={(e) => { if (e.key === 'Escape' && !(e.target as HTMLElement).closest('.menu')) { e.stopPropagation(); onClose(); } }}>
    <div className="cng-side-h"><span className="ic"><Icon name={icon} /></span><h3 className="ellipsis">{title}</h3><button className="icon-btn" data-tip="Fermer (Échap)" onClick={onClose}><Icon name="close" /></button></div>
    {sub ? <div className="cng-side-sub">{sub}</div> : null}
    <div className="cng-side-b scroll">{children}</div>
    <div className="cng-side-f">{foot}</div>
  </div>
);

/**
 * « Poser une période » : champs EXACTS de ModalePeriode — Collaborateur (si plusieurs cibles), Du,
 * Au, Type (défaut CP). Jours ouvrés calculés côté client (`joursOuvres`), envoyés en liste exacte ;
 * jour entier (la page actuelle n'envoie pas de demi-journée).
 */
export const PosePanel: React.FC<{
  who: { id: string; name: string }[]; uid: string; pre: { u?: string; from?: string; to?: string };
  busy: boolean; onPose: (u: string, days: string[], type: CongeType) => Promise<boolean>; onClose: () => void;
}> = ({ who, uid, pre, busy, onPose, onClose }) => {
  const u0 = pre.u && who.some((x) => x.id === pre.u) ? pre.u : who.some((x) => x.id === uid) ? uid : who[0]?.id || '';
  const [u, setU] = useState(u0);
  const [from, setFrom] = useState(pre.from || '');
  const [to, setTo] = useState(pre.to || pre.from || '');
  const [type, setType] = useState<CongeType>('CP');
  const [sending, setSending] = useState(false);
  const days = useMemo(() => (from && to && from <= to ? joursOuvres(from, to) : []), [from, to]);
  const n = days.length;
  // Choisir le début aligne la fin dessus tant qu'elle est vide ou antérieure (constaté en recette).
  const onFrom = (v: string) => { setFrom(v); if (!to || to < v) setTo(v); };
  const ok = async () => {
    if (!n || sending) return; setSending(true);
    const done = await onPose(u, days, type);
    setSending(false); if (done) onClose();
  };
  return (
    <SideShell icon="plus" title="Poser une période" onClose={onClose}
      foot={<><button className="btn" disabled={sending} onClick={onClose}>Annuler</button><button className="btn primary" disabled={!n || sending || busy} onClick={ok}>{sending ? 'Enregistrement…' : 'Poser'}</button></>}>
      <div className="form-grid">
        {who.length > 1 ? <label className="field full"><span className="label">Collaborateur</span><select className="select" value={u} onChange={(e) => setU(e.target.value)}>{who.map((x) => <option key={x.id} value={x.id}>{x.name}{x.id === uid ? ' (vous)' : ''}</option>)}</select></label> : null}
        <label className="field"><span className="label">Du</span><input type="date" className="input" value={from} onChange={(e) => onFrom(e.target.value)} /></label>
        <label className="field"><span className="label">Au</span><input type="date" className="input" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
        <div className="field full"><span className="label">Type</span><TypesGrid sel={type} onPick={setType} /></div>
        <div className="full cng-count">{n
          ? <><Icon name="agenda" /><span><b className="num">{n}</b> jour{n > 1 ? 's' : ''} ouvré{n > 1 ? 's' : ''} seront posés. Week-ends et jours fériés sont automatiquement ignorés.</span></>
          : <><Icon name="info" /><span>Choisissez une date de début et une date de fin.</span></>}</div>
      </div>
    </SideShell>
  );
};

/**
 * « Participants » : comptes des rôles de `CONGES_LECTURE_ROLES` (liste blanche serveur de
 * `POST /membres`), tri alphabétique ; retirer demande confirmation et CONSERVE les congés.
 */
export const ParticipantsPanel: React.FC<{
  eligible: User[]; membres: string[]; busy: boolean;
  onAdd: (id: string) => void; onRemove: (id: string) => void; onClose: () => void;
}> = ({ eligible, membres, busy, onAdd, onRemove, onClose }) => {
  const [q, setQ] = useState('');
  const [ask, setAsk] = useState<string | null>(null);
  const rows = eligible.filter((u) => !q.trim() || (u.name || '').toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <SideShell icon="users" title="Participants" sub="Qui apparaît dans le planning des congés." onClose={onClose}
      foot={<span className="grow">Retirer quelqu’un ne supprime pas ses congés : il disparaît du planning, ses jours restent enregistrés.</span>}>
      <label className="search" style={{ marginBottom: 10 }}><Icon name="search" size="sm" /><input placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <div>{rows.length ? rows.map((u) => {
        const inn = membres.includes(u.id);
        return (
          <React.Fragment key={u.id}>
            <div className="cng-prow"><Avatar uid={u.id} /><div className="who"><b className="ellipsis">{u.name}</b><span>{gx().data.ROLES[u.role]?.l || u.role}</span></div>
              <input type="checkbox" className="check" checked={inn} disabled={busy} aria-label="Dans le planning" onChange={(e) => { if (e.target.checked) { if (!inn) { setAsk(null); onAdd(u.id); } } else if (inn) setAsk(u.id); }} /></div>
            {ask === u.id ? <div className="cng-confirm"><b>Retirer {u.name} du planning ?</b><span>Ses congés déjà posés sont CONSERVÉS : il suffit de le rajouter pour les revoir.</span>
              <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}><button className="btn sm" onClick={() => setAsk(null)}>Annuler</button><button className="btn sm primary" disabled={busy} onClick={() => { setAsk(null); onRemove(u.id); }}>Retirer</button></div></div> : null}
          </React.Fragment>
        );
      }) : <div className="empty">Aucun compte éligible.</div>}</div>
    </SideShell>
  );
};
