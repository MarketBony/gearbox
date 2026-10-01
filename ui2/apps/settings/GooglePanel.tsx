import React from 'react';
import { Head, type SectionDef } from './common';
import { useGoogleStatus, GoogleAccountCard } from '../forms/GoogleAccount';

// Réglages › Comptes connectés (01/10/2026) — compte Google de la rubrique Forms. Visible des
// FORMS_ROLES (savoir quel compte est branché) ; connexion et déconnexion : Master seul (serveur).
export function GooglePanel({ s }: { s: SectionDef }) {
  const { st, err, reload } = useGoogleStatus();
  return (
    <div className="set-panel"><Head s={s} />
      <div className="set-gt">Google</div>
      <div className="set-group enter" style={{ padding: 16 }} data-anchor="google">
        {st ? <GoogleAccountCard st={st} onChanged={reload} compact /> : <span className="muted">{err || 'Lecture…'}</span>}
      </div>
      <div className="set-note">Gearbox n’utilise ce compte que pour Google Forms : lire, créer et modifier les formulaires, et lire leurs réponses. L’accès est conservé chiffré sur le serveur et n’est jamais envoyé aux navigateurs. Les réponses copiées pour les statistiques sont supprimées quand un formulaire est retiré de Gearbox.</div>
    </div>
  );
}
