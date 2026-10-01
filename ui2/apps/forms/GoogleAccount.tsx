import React, { useCallback, useEffect, useState } from 'react';
import type { GoogleStatus } from '../../../types';
import { db } from '../../../services/dataService';
import { getSocket } from '../../../services/socket';
import { gx, hud, Icon } from '../ui/kit';

// =====================================================================
// Compte Google de la rubrique Forms — état et carte de connexion, PARTAGÉS par la rubrique
// (quand rien n'est connecté) et par Réglages › Comptes connectés. Connexion / déconnexion :
// Master seul (`canConnect`, décidé par le serveur, GOOGLE_CONNECT_ROLES).
// =====================================================================

/** État de la connexion Google, rafraîchi sur `forms:changed` (connexion faite dans un autre onglet). */
export function useGoogleStatus() {
  const [st, setSt] = useState<GoogleStatus | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => db.getGoogleStatus().then((v) => { setSt(v); setErr(''); }).catch((e) => setErr(e?.message || 'Lecture impossible.')), []);
  useEffect(() => {
    load();
    const s = getSocket(); s?.on('forms:changed', load);
    return () => { s?.off('forms:changed', load); };
  }, [load]);
  return { st, err, reload: load };
}

/** Quitte Gearbox pour l'écran d'autorisation Google ; Google ramène ensuite sur `/?gx-google=…`. */
export async function startGoogleConnect() {
  try { window.location.href = await db.connectGoogle(); }
  catch (e: any) { hud(e?.message || 'Connexion impossible.'); }
}

export function GoogleAccountCard({ st, onChanged, compact = false }: { st: GoogleStatus; onChanged: () => void; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const off = async (el: HTMLElement) => {
    gx().menu.open([
      { header: 'Déconnecter le compte Google ?' },
      { label: 'Déconnecter', icon: 'close', action: async () => {
        setBusy(true);
        try { await db.disconnectGoogle(); hud('Compte Google déconnecté'); onChanged(); }
        catch (e: any) { hud(e?.message || 'Déconnexion impossible.'); }
        finally { setBusy(false); }
      } },
      { label: 'Annuler', action: () => {} },
    ], el, { align: 'right' });
  };
  const when = st.connectedAt ? new Date(st.connectedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  if (!st.configured) {
    return <div className="frm-acc"><span className="frm-g"><Icon name="lock" /></span><div className="grow"><b>Google n’est pas configuré sur ce serveur</b><span>Variables GOOGLE_* absentes de l’environnement du serveur.</span></div></div>;
  }
  if (!st.connected) {
    return (
      <div className={`frm-acc ${compact ? '' : 'big'}`}>
        <span className="frm-g"><GLogo /></span>
        <div className="grow"><b>Aucun compte Google connecté</b>
          <span>{st.canConnect ? 'Connectez le compte marketing (marketbony@gmail.com). Google affichera « application non validée » : Paramètres avancés › Accéder à Gearbox, puis cochez tous les accès.' : 'Seul le Master peut connecter le compte Google de l’équipe.'}</span></div>
        {st.canConnect ? <button className="btn primary" disabled={busy} onClick={startGoogleConnect}><Icon name="link" size="sm" />Connecter le compte Google</button> : null}
      </div>
    );
  }
  return (
    <div className={`frm-acc ${st.lastError ? 'warn' : 'ok'}`}>
      <span className="frm-g"><GLogo /></span>
      <div className="grow"><b>{st.email || 'Compte Google connecté'}</b>
        <span>{st.lastError ? st.lastError : `Connecté${st.connectedBy ? ` par ${st.connectedBy}` : ''}${when ? ` le ${when}` : ''} · formulaires et réponses`}</span></div>
      {st.canConnect ? <>
        {st.lastError ? <button className="btn primary sm" disabled={busy} onClick={startGoogleConnect}>Reconnecter</button> : null}
        <button className="btn sm" disabled={busy} onClick={(e) => off(e.currentTarget)}>Déconnecter</button>
      </> : null}
    </div>
  );
}

/** Logo « G » de Google (quatre couleurs), dessiné en SVG. */
export const GLogo = () => (
  <svg viewBox="0 0 48 48" width="22" height="22" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17z" />
    <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
  </svg>
);
