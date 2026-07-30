import React, { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Info, Loader2 } from 'lucide-react';
import {
  PushState,
  getPushState,
  subscribeToPush,
  unsubscribeFromPush
} from '../services/pushNotifications';

// =====================================================================
// ACTIVATION DES NOTIFICATIONS — bloc réutilisé dans les Paramètres ET dans la
// modale d'installation (juste après une installation réussie).
//
// Les quatre états sont traités explicitement, parce qu'ils ne se règlent pas de
// la même façon :
//   - refusé : IRRÉVERSIBLE depuis la page. Seul l'utilisateur peut revenir en
//     arrière depuis les réglages du navigateur. Afficher un bouton serait
//     mensonger, on explique où aller.
//   - iOS hors app installée : l'API existe mais ne donnera jamais rien. On
//     renvoie vers l'installation au lieu d'un bouton mort.
// =====================================================================

const NotificationsToggle: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const [etat, setEtat] = useState<PushState>('default');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => setEtat(getPushState()), []);

  const activer = async () => {
    setOccupe(true);
    setErreur(null);
    try {
      setEtat(await subscribeToPush());
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Échec de l’activation.');
      setEtat(getPushState());
    } finally {
      setOccupe(false);
    }
  };

  const desactiver = async () => {
    setOccupe(true);
    try {
      await unsubscribeFromPush();
      // La permission navigateur reste « granted » : on ne peut pas la retirer
      // par programme. Ce qu'on retire, c'est l'abonnement — donc les envois.
      setEtat('default');
    } finally {
      setOccupe(false);
    }
  };

  if (etat === 'unsupported') {
    return (
      <p className={`flex items-start gap-2 text-slate-500 dark:text-bony-muted ${compact ? 'text-[11px]' : 'text-xs'}`}>
        <Info size={13} className="shrink-0 mt-0.5" />
        Ce navigateur ne gère pas les notifications. Chrome, Edge ou Safari les acceptent.
      </p>
    );
  }

  if (etat === 'ios-needs-install') {
    return (
      <p className={`flex items-start gap-2 text-amber-600 dark:text-amber-400 ${compact ? 'text-[11px]' : 'text-xs'}`}>
        <Info size={13} className="shrink-0 mt-0.5" />
        <span>
          Sur iPhone et iPad, les notifications ne sont possibles qu'
          <span className="font-bold">après avoir ajouté Gearbox à l'écran d'accueil</span>.
          Installe l'app, ouvre-la, puis reviens activer les notifications.
        </span>
      </p>
    );
  }

  if (etat === 'denied') {
    return (
      <p className={`flex items-start gap-2 text-amber-600 dark:text-amber-400 ${compact ? 'text-[11px]' : 'text-xs'}`}>
        <BellOff size={13} className="shrink-0 mt-0.5" />
        <span>
          Les notifications ont été refusées pour Gearbox. Pour les rétablir, il faut passer par
          les réglages : <span className="font-bold">cadenas ou ⓘ dans la barre d'adresse →
          Notifications → Autoriser</span>. Cette page ne peut plus le demander.
        </span>
      </p>
    );
  }

  if (etat === 'granted') {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-xs font-bold text-green-600 dark:text-green-400">
          <BellRing size={14} /> Notifications activées
        </span>
        <button
          onClick={desactiver}
          disabled={occupe}
          className="text-[11px] text-slate-500 dark:text-bony-muted underline hover:text-slate-800 dark:hover:text-bony-text transition disabled:opacity-50 min-h-[44px] px-1"
        >
          {occupe ? 'Désactivation…' : 'Ne plus recevoir de notifications sur cet appareil'}
        </button>
      </div>
    );
  }

  // état 'default' : jamais demandé. Le clic est OBLIGATOIRE (exigence iOS).
  return (
    <div className="space-y-2">
      <button
        onClick={activer}
        disabled={occupe}
        className="min-h-[44px] px-4 py-2 rounded-lg border border-bony-violet/50 bg-bony-violet/10 text-bony-violet dark:text-purple-300 text-xs font-bold flex items-center gap-2 hover:bg-bony-violet/20 transition disabled:opacity-50"
      >
        {occupe ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
        {occupe ? 'Activation…' : 'Activer les notifications'}
      </button>
      <p className={`text-slate-500 dark:text-bony-muted ${compact ? 'text-[11px]' : 'text-xs'} leading-relaxed`}>
        Reçois les messages du chat sur cet appareil, même Gearbox fermé. Tu peux mettre une
        conversation en sourdine depuis la rubrique Chat.
      </p>
      {erreur && <p className="text-[11px] text-red-500">{erreur}</p>}
    </div>
  );
};

export default NotificationsToggle;
