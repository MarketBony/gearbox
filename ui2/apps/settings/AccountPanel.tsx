import React, { useEffect, useRef, useState } from 'react';
import type { User } from '../../../types';
import { SITES } from '../../../constants';
import { useAuth } from '../../../contexts/AuthContext';
import { gx, hud, Icon } from '../ui/kit';
import { Head, RoleBadge, Row, UAv, loadCity, saveCity, type SectionDef } from './common';

// =====================================================================
// Panneau « Compte » (Paramètres du Compte) — `handleUpdateProfile` de pages/Settings.tsx :
//  - nom, anniversaire (serveur, PUT /api/auth/me via `updateProfile` d'AuthContext) ;
//  - ville de référence : préférence LOCALE au poste (météo de Hello Marketing) ;
//  - mot de passe : confirmation + 4 caractères minimum ; seul le NOUVEAU part au serveur.
//    ⚠️ Défaut connu (inventaire § 11) : l'ancien mot de passe n'est ni envoyé ni vérifié
//    (routes/auth.ts hache directement). On ne l'aggrave pas : le champ reste affiché, comme
//    dans la page actuelle ; le corriger demande une vérification CÔTÉ SERVEUR.
// =====================================================================

function strength(pw: string) {
  if (!pw) return null;
  if (pw.length < 4) return { l: 'Trop court', n: 1, c: 'var(--danger)' };
  const sc = Number(pw.length >= 12) + Number(/[a-z]/.test(pw) && /[A-Z]/.test(pw)) + Number(/\d/.test(pw)) + Number(/[^A-Za-z0-9]/.test(pw));
  return [{ l: 'Faible', n: 1, c: 'var(--danger)' }, { l: 'Faible', n: 1, c: 'var(--danger)' }, { l: 'Moyen', n: 2, c: 'var(--warn)' }, { l: 'Fort', n: 3, c: 'var(--ok)' }, { l: 'Excellent', n: 4, c: 'var(--ok)' }][sc];
}

export function AccountPanel({ s, user, onPhoto }: { s: SectionDef; user: User; onPhoto: () => void }) {
  const { updateProfile } = useAuth();
  const [name, setName] = useState(user.name || '');
  const [city, setCity] = useState(() => loadCity(user.id));
  const [birthdate, setBirthdate] = useState(user.birthdate || '');
  const [pw, setPw] = useState({ old: '', nw: '', conf: '' });
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string }>({ ok: true, t: '' });
  const [busy, setBusy] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  // Autre compte (déconnexion / reconnexion) : le formulaire repart de ses valeurs.
  useEffect(() => { setName(user.name || ''); setCity(loadCity(user.id)); setBirthdate(user.birthdate || ''); }, [user.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const ro = !!gx().ctx.readOnly;
  const st = strength(pw.nw);

  const fail = (t: string) => {
    setMsg({ ok: false, t });
    if (btn.current) gx().animate(btn.current, [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], { duration: 300, easing: 'ease-out' });
  };
  const save = async () => {
    if (busy) return;
    setMsg({ ok: true, t: '' });
    // Écart voulu (maquette) : un nom vide n'est plus envoyé en silence.
    if (!name.trim()) return fail('Le nom affiché est obligatoire.');
    if (pw.old || pw.nw || pw.conf) {
      // Règles réelles de Settings.tsx : pas de vérification locale de l'ancien mot de passe.
      if (pw.nw !== pw.conf) return fail('Les nouveaux mots de passe ne correspondent pas.');
      if (pw.nw.length < 4) return fail('Le mot de passe est trop court.');
    }
    setBusy(true);
    try {
      // `birthdate` part au serveur avec le profil ('' = effacer) ; seule la ville reste locale.
      await updateProfile({ ...user, name, birthdate, password: pw.nw || undefined });
      saveCity(user.id, city);
      setMsg({ ok: true, t: 'Profil mis à jour avec succès.' });
      setPw({ old: '', nw: '', conf: '' });
      if (btn.current) gx().animate(btn.current, [{ transform: 'scale(.94)' }, { transform: 'none' }], { spring: 'bouncy' });
      hud('Profil enregistré');
    } catch {
      fail('Échec de la mise à jour (serveur injoignable ?).');
    } finally { setBusy(false); }
  };
  const pwType = show ? 'text' : 'password';

  return (
    <div className="set-panel"><Head s={s} />
      <div className="set-group set-idcard enter" data-anchor="carte">
        <button className="set-avbtn" data-tip="Changer la photo de profil" aria-label="Changer la photo de profil" onClick={onPhoto}><UAv u={user} cls="xl" /></button>
        <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
          <h3 className="ellipsis">{user.name}</h3>
          <div className="row wrap"><RoleBadge r={user.role} /><span className="faint" style={{ fontSize: 12.5 }}>ID : <span className="set-login">{user.loginId}</span></span>{ro ? <span className="badge" style={{ '--c': 'var(--danger)' } as React.CSSProperties}>Lecture seule</span> : null}</div>
          <button className="set-link" onClick={onPhoto}>Changer la photo de profil</button>
        </div>
      </div>
      <div className="set-cols"><div>
        <div className="set-gt">Identité</div>
        <div className="set-group enter" style={{ '--i': 1 } as React.CSSProperties} data-anchor="identite">
          <Row t="Nom affiché" d="Visible dans le Chat, les projets et le classement" cls="stk"><input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nom affiché" /></Row>
          <Row t="Ville de référence (météo)" d="Pilote la météo de Hello Marketing sur ce poste" cls="stk">
            <select className="select" value={city} aria-label="Ville de référence (météo)" onChange={(e) => setCity(e.target.value)}><option value="">— Sélectionner une ville —</option>{SITES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          </Row>
          <Row t="Date de naissance" d="Partagée avec l’équipe : Hello Marketing souhaite les anniversaires" cls="stk"><input className="input" type="date" value={birthdate} aria-label="Date de naissance" onChange={(e) => setBirthdate(e.target.value || '')} /></Row>
        </div>
      </div><div>
        <div className="set-gt">Sécurité</div>
        <div className="set-group enter" style={{ '--i': 2 } as React.CSSProperties} data-anchor="securite">
          <Row t="Ancien mot de passe" cls="stk"><input className="input" type={pwType} autoComplete="new-password" placeholder="Requis pour changer" aria-label="Ancien mot de passe" value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} /></Row>
          <Row t="Nouveau mot de passe" d="Au moins 4 caractères ; plus il est long, mieux c’est" cls="stk">
            <div className="set-pw"><input className="input" type={pwType} autoComplete="new-password" placeholder="Nouveau mot de passe" aria-label="Nouveau mot de passe" value={pw.nw} onChange={(e) => setPw({ ...pw, nw: e.target.value })} />
              <div className="set-meter">{[0, 1, 2, 3].map((k) => <i key={k} style={{ background: st && k < st.n ? st.c : '' }} />)}</div>
              <div className="set-pwinfo"><span className="faint" style={{ color: st ? st.c : '' }}>{st ? st.l : ''}</span><button className="btn sm ghost" style={{ height: 18, padding: '0 4px', fontSize: 11 }} onClick={() => setShow(!show)}>{show ? 'Masquer' : 'Afficher'}</button></div></div>
          </Row>
          <Row t="Confirmer" cls="stk">
            <div className="set-pw"><input className="input" type={pwType} autoComplete="new-password" placeholder="Confirmer" aria-label="Confirmer le mot de passe" value={pw.conf} onChange={(e) => setPw({ ...pw, conf: e.target.value })} />
              <div className="set-pwinfo"><span style={{ color: pw.conf === pw.nw ? 'var(--ok)' : 'var(--danger)' }}>{pw.conf ? (pw.conf === pw.nw ? 'Les mots de passe correspondent' : 'Les mots de passe ne correspondent pas') : ''}</span></div></div>
          </Row>
        </div>
        <div className="set-note">Le nouveau mot de passe est transmis au serveur, qui le hache : il n’est jamais conservé dans le navigateur.</div>
      </div></div>
      <div className="set-foot"><span className="set-msg" style={{ color: msg.t ? (msg.ok ? 'var(--ok)' : 'var(--danger)') : undefined }}>{msg.t}</span>
        <button ref={btn} className="btn primary lg" disabled={busy} onClick={save}><Icon name="check" size="sm" />Enregistrer mon profil</button></div>
    </div>
  );
}
