import React, { useEffect, useState } from 'react';
import { X, Download, Check, Share, PlusSquare, Info } from 'lucide-react';
import {
  Platform,
  canPrompt,
  getPlatform,
  isFirefoxDesktop,
  isStandalone,
  onInstallStateChange,
  promptInstall
} from '../services/pwaInstall';

// =====================================================================
// MODALE « INSTALLER L'APPLICATION »
//
// Trois plateformes, mais SEULEMENT DEUX peuvent offrir un vrai bouton :
// iOS n'expose aucune API d'installation, il faut y afficher la marche à
// suivre. La plateforme détectée est dépliée d'office, les deux autres restent
// consultables — utile pour lire la procédure iPhone depuis un PC et la
// transmettre à quelqu'un.
//
// Les pictos OS sont des SVG inline et NON des icônes Font Awesome : la
// bibliothèque est certes chargée dans index.html, mais elle n'est utilisée
// nulle part dans le code (dépendance CDN morte, candidate à la suppression) —
// autant ne pas l'ancrer dans une fonctionnalité neuve.
// =====================================================================

const IconeWindows: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M3 5.6l7.5-1.03v7.2H3V5.6zm0 12.8l7.5 1.03v-7.1H3v6.07zM11.4 19.6L21 21V12.8h-9.6v6.8zm0-15.2v7.4H21V3l-9.6 1.4z" />
  </svg>
);

const IconeApple: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16.36 12.72c.02 2.6 2.28 3.47 2.31 3.48-.02.06-.36 1.25-1.2 2.47-.72 1.06-1.47 2.11-2.66 2.13-1.16.02-1.54-.69-2.87-.69-1.33 0-1.75.67-2.85.71-1.14.04-2.01-1.14-2.74-2.19-1.5-2.17-2.64-6.14-1.1-8.82.76-1.33 2.13-2.17 3.61-2.19 1.12-.02 2.18.75 2.87.75.68 0 1.97-.93 3.32-.79.57.02 2.16.21 3.18 1.56-.08.05-1.9 1.11-1.87 3.31M14.3 4.36c.61-.74 1.02-1.77.91-2.79-.9.04-1.99.6-2.62 1.34-.57.65-1.06 1.7-.93 2.7 1 .08 2.03-.51 2.64-1.25" />
  </svg>
);

const IconeAndroid: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6 9v7.5A1.5 1.5 0 007.5 18h9a1.5 1.5 0 001.5-1.5V9H6zm-2.25.75a1.25 1.25 0 00-1.25 1.25v4a1.25 1.25 0 002.5 0v-4a1.25 1.25 0 00-1.25-1.25zm16.5 0A1.25 1.25 0 0019 11v4a1.25 1.25 0 002.5 0v-4a1.25 1.25 0 00-1.25-1.25zM9 19v1.75a1.25 1.25 0 002.5 0V19H9zm3.5 0v1.75a1.25 1.25 0 002.5 0V19h-2.5zM8.2 3.4l-.86-1.5a.4.4 0 01.7-.4l.9 1.55A6.6 6.6 0 0112 2.5c.75 0 1.46.13 2.11.37l.9-1.55a.4.4 0 01.7.4l-.87 1.5A5.3 5.3 0 0117.9 8H6.1a5.3 5.3 0 012.1-4.6zM9.5 5.6a.6.6 0 100 1.2.6.6 0 000-1.2zm5 0a.6.6 0 100 1.2.6.6 0 000-1.2z" />
  </svg>
);

interface CarteProps {
  id: Platform;
  titre: string;
  soustitre: string;
  icone: React.ReactNode;
  ouverte: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const Carte: React.FC<CarteProps> = ({ titre, soustitre, icone, ouverte, onToggle, children }) => (
  <div
    className={`rounded-xl border transition-colors ${
      ouverte
        ? 'border-bony-orange/60 bg-bony-orange/5'
        : 'border-slate-200 dark:border-bony-border hover:border-bony-orange/40'
    }`}
  >
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-3 px-4 py-3 min-h-[56px] text-left"
    >
      <span className={ouverte ? 'text-bony-orange' : 'text-slate-500 dark:text-slate-400'}>{icone}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-slate-900 dark:text-white truncate">{titre}</span>
        <span className="block text-[11px] text-slate-500 dark:text-bony-muted truncate">{soustitre}</span>
      </span>
    </button>
    {ouverte && <div className="px-4 pb-4 -mt-1">{children}</div>}
  </div>
);

const Etape: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <li className="flex gap-2.5 items-start">
    <span className="shrink-0 w-5 h-5 rounded-full bg-bony-orange/15 text-bony-orange text-[10px] font-bold flex items-center justify-center mt-0.5">
      {n}
    </span>
    <span className="text-xs text-slate-600 dark:text-bony-muted leading-relaxed">{children}</span>
  </li>
);

interface Props {
  onClose: () => void;
  /** Rendu sous le bloc d'installation (bouton d'activation des notifications). */
  footer?: React.ReactNode;
}

const InstallAppModal: React.FC<Props> = ({ onClose, footer }) => {
  const plateforme = getPlatform();
  const [ouverte, setOuverte] = useState<Platform>(plateforme);
  const [dispo, setDispo] = useState(canPrompt());
  const [installee, setInstallee] = useState(isStandalone());
  const [refus, setRefus] = useState(false);

  // L'invite peut arriver après le montage (course au chargement) : on suit son
  // état plutôt que de le lire une seule fois.
  useEffect(() => onInstallStateChange(() => {
    setDispo(canPrompt());
    setInstallee(isStandalone());
  }), []);

  const installer = async () => {
    setRefus(false);
    const r = await promptInstall();
    if (r === 'accepted') setInstallee(true);
    if (r === 'dismissed') setRefus(true);
  };

  const BoutonNatif = (
    <button
      onClick={installer}
      className="w-full min-h-[44px] rounded-lg bg-bony-gradient text-white text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
    >
      <Download size={15} /> Installer maintenant
    </button>
  );

  const ProcedureManuelle = (
    <ol className="space-y-2">
      <Etape n={1}>
        Ouvre le menu du navigateur (<span className="font-bold">⋮</span> ou{' '}
        <span className="font-bold">…</span>), en haut à droite.
      </Etape>
      <Etape n={2}>
        Choisis <span className="font-bold text-slate-700 dark:text-bony-text">Installer Gearbox</span> —
        ou l'icône d'installation qui apparaît dans la barre d'adresse.
      </Etape>
      <Etape n={3}>Confirme. Gearbox s'ouvre alors dans sa propre fenêtre.</Etape>
    </ol>
  );

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="glass-strong glass-sheen relative rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-bony-border shrink-0">
          <div className="min-w-0">
            {/* « Installer Gearbox » et non « Installer l'application » : la police
                de titre Syncopate est très large et le libellé long passait sur
                deux lignes dès 375 px (284 px de texte pour 231 px utiles).
                Pas de `whitespace-nowrap` : à 320 px il tronquerait le titre.
                Il tient sur une ligne dès 375 px, et passe sur deux en dessous. */}
            <h3 className="font-title text-slate-900 dark:text-bony-text flex items-center gap-2">
              <Download size={18} className="text-bony-orange shrink-0" /> Installer Gearbox
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-bony-muted mt-0.5">
              Choisis ton appareil
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-bony-text transition shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto custom-scrollbar">
          {installee ? (
            <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-4 flex items-start gap-3">
              <Check size={18} className="text-green-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">Déjà installée</p>
                <p className="text-xs text-slate-600 dark:text-bony-muted mt-1">
                  Tu utilises Gearbox depuis l'application. Rien à faire de plus.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Explication : personne ne cherchera un fichier dans ses téléchargements. */}
              <p className="text-xs text-slate-600 dark:text-bony-muted leading-relaxed">
                Gearbox s'installe directement depuis le navigateur, avec son icône et sa
                propre fenêtre. <span className="font-bold">Aucun fichier à télécharger</span>,
                aucun store. Les mises à jour arrivent toutes seules.
              </p>

              <Carte
                id="desktop"
                titre="Gearbox pour Windows"
                soustitre="Chrome ou Edge — fonctionne aussi sur Mac"
                icone={<IconeWindows />}
                ouverte={ouverte === 'desktop'}
                onToggle={() => setOuverte('desktop')}
              >
                {isFirefoxDesktop() ? (
                  <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                    <Info size={14} className="shrink-0 mt-0.5" />
                    <span>
                      Firefox sur ordinateur ne sait pas installer d'application web. Ouvre
                      Gearbox dans <span className="font-bold">Chrome</span> ou{' '}
                      <span className="font-bold">Edge</span> pour l'installer.
                    </span>
                  </div>
                ) : dispo && plateforme === 'desktop' ? (
                  BoutonNatif
                ) : (
                  ProcedureManuelle
                )}
              </Carte>

              <Carte
                id="android"
                titre="Gearbox pour Android"
                soustitre="Chrome, Edge, Samsung Internet"
                icone={<IconeAndroid />}
                ouverte={ouverte === 'android'}
                onToggle={() => setOuverte('android')}
              >
                {dispo && plateforme === 'android' ? (
                  BoutonNatif
                ) : plateforme === 'android' ? (
                  <ol className="space-y-2">
                    <Etape n={1}>Ouvre le menu <span className="font-bold">⋮</span> du navigateur.</Etape>
                    <Etape n={2}>
                      Touche{' '}
                      <span className="font-bold text-slate-700 dark:text-bony-text">
                        Installer l'application
                      </span>{' '}
                      ou <span className="font-bold">Ajouter à l'écran d'accueil</span>.
                    </Etape>
                    <Etape n={3}>Confirme : l'icône Gearbox rejoint tes applications.</Etape>
                  </ol>
                ) : (
                  <p className="text-xs text-slate-600 dark:text-bony-muted leading-relaxed">
                    Ouvre <span className="font-bold">gearbox.bonyauto-mobile.com</span> sur le
                    téléphone, puis menu <span className="font-bold">⋮</span> →{' '}
                    <span className="font-bold">Installer l'application</span>.
                  </p>
                )}
              </Carte>

              <Carte
                id="ios"
                titre="Gearbox pour iOS"
                soustitre="iPhone et iPad — via le menu Partager"
                icone={<IconeApple />}
                ouverte={ouverte === 'ios'}
                onToggle={() => setOuverte('ios')}
              >
                {/* Pas de bouton possible : Apple n'expose aucune API d'installation. */}
                <ol className="space-y-2">
                  <Etape n={1}>
                    Ouvre Gearbox dans <span className="font-bold">Safari</span>.
                  </Etape>
                  <Etape n={2}>
                    Touche l'icône <Share size={12} className="inline -mt-0.5" />{' '}
                    <span className="font-bold">Partager</span>, en bas de l'écran.
                  </Etape>
                  <Etape n={3}>
                    Choisis <PlusSquare size={12} className="inline -mt-0.5" />{' '}
                    <span className="font-bold text-slate-700 dark:text-bony-text">
                      Sur l'écran d'accueil
                    </span>
                    , puis <span className="font-bold">Ajouter</span>.
                  </Etape>
                </ol>
                <p className="text-[11px] text-slate-500 dark:text-bony-muted mt-3 leading-relaxed">
                  Chrome, Edge et Firefox conviennent aussi à partir d'iOS 16.4. Sur iPhone,
                  les notifications ne sont possibles <span className="font-bold">qu'après</span>{' '}
                  cette installation.
                </p>
              </Carte>

              {refus && (
                <p className="text-[11px] text-slate-500 dark:text-bony-muted">
                  Installation annulée. Tu peux relancer quand tu veux.
                </p>
              )}
            </>
          )}

          {footer}
        </div>
      </div>
    </div>
  );
};

export default InstallAppModal;
