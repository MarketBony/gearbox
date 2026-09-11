import type { CSSProperties } from 'react';

/**
 * FONDS DE DISCUSSION DU CHAT — catalogue procédural + résolution d'une image importée.
 *
 * Demande de Théo (11/09/2026) : « des fonds de chat de mon choix, comme sur WhatsApp et
 * Messenger, soit des trucs générés procéduralement ultra stylés, soit des images
 * importées ».
 *
 * ⚠️ TOUT EST EN CSS, aucune image n'est téléchargée pour les fonds procéduraux. C'est
 * volontaire et structurant :
 *  - le lot PWA a acté que l'app n'a AUCUN mode hors-ligne et que tout vient du réseau ;
 *    un fond qui serait 8 images de 300 Ko ajouterait ce poids à chaque ouverture du chat ;
 *  - `cdn.tailwindcss.com` génère déjà tout le CSS à l'exécution, on n'alourdit pas la
 *    page avec des sprites ;
 *  - un dégradé CSS reste net à toutes les densités d'écran, sans variante @2x/@3x.
 *
 * ⚠️ DEUX VARIANTES PAR FOND, clair et sombre — et ce n'est pas de la coquetterie : un
 * fond pensé pour le thème sombre vire au gris sale sur fond blanc, et les bulles de
 * message (translucides, `gx-glass-*`) deviennent illisibles. Le thème est lu au rendu.
 *
 * ⚠️ LISIBILITÉ AVANT ESTHÉTIQUE. Chaque fond reste volontairement peu contrasté : c'est
 * une toile de fond derrière du texte, pas une affiche. Les opacités sont basses et les
 * motifs fins. Si un fond rend un message difficile à lire, c'est le fond qui a tort.
 */

export interface FondChat {
  id: string;
  nom: string;
  /** Famille, pour regrouper la galerie. */
  famille: 'Dégradés' | 'Motifs' | 'Sobres';
  clair: CSSProperties;
  sombre: CSSProperties;
}

/** Encode un SVG pour un `url("data:image/svg+xml,…")` — `#` casserait l'URL. */
const svg = (contenu: string): string =>
  `url("data:image/svg+xml,${encodeURIComponent(contenu)}")`;

/**
 * Catalogue. L'`id` est ce qui part en base (préfixé `proc:`) : **ne jamais le renommer**
 * sans prévoir la reprise des valeurs déjà stockées — un id inconnu retombe proprement
 * sur « aucun fond », mais l'utilisateur verrait son choix disparaître.
 */
export const FONDS_CHAT: FondChat[] = [
  {
    id: 'aurore',
    nom: 'Aurore',
    famille: 'Dégradés',
    // Trois taches de couleur qui se fondent : le « mesh gradient » sans image.
    clair: {
      backgroundColor: '#fdfbfa',
      backgroundImage: [
        'radial-gradient(60% 50% at 15% 10%, rgba(247,86,50,0.14), transparent 70%)',
        'radial-gradient(50% 45% at 85% 20%, rgba(139,92,246,0.16), transparent 70%)',
        'radial-gradient(70% 60% at 50% 100%, rgba(56,189,248,0.12), transparent 70%)',
      ].join(','),
    },
    sombre: {
      backgroundColor: '#151515',
      backgroundImage: [
        'radial-gradient(60% 50% at 15% 10%, rgba(247,86,50,0.22), transparent 70%)',
        'radial-gradient(50% 45% at 85% 20%, rgba(139,92,246,0.24), transparent 70%)',
        'radial-gradient(70% 60% at 50% 100%, rgba(56,189,248,0.16), transparent 70%)',
      ].join(','),
    },
  },
  {
    id: 'nebuleuse',
    nom: 'Nébuleuse',
    famille: 'Dégradés',
    clair: {
      backgroundColor: '#faf9ff',
      backgroundImage: [
        'radial-gradient(40% 35% at 75% 15%, rgba(99,102,241,0.16), transparent 70%)',
        'radial-gradient(45% 40% at 20% 70%, rgba(236,72,153,0.12), transparent 70%)',
        'radial-gradient(80% 70% at 50% 40%, rgba(14,165,233,0.08), transparent 70%)',
      ].join(','),
    },
    sombre: {
      backgroundColor: '#0f1020',
      backgroundImage: [
        'radial-gradient(40% 35% at 75% 15%, rgba(99,102,241,0.35), transparent 70%)',
        'radial-gradient(45% 40% at 20% 70%, rgba(236,72,153,0.22), transparent 70%)',
        'radial-gradient(80% 70% at 50% 40%, rgba(14,165,233,0.14), transparent 70%)',
      ].join(','),
    },
  },
  {
    id: 'coucher',
    nom: 'Coucher',
    famille: 'Dégradés',
    clair: {
      backgroundImage: 'linear-gradient(170deg, #fff3ec 0%, #ffe8f0 45%, #f3ecff 100%)',
    },
    sombre: {
      backgroundImage: 'linear-gradient(170deg, #2a1410 0%, #241426 55%, #131425 100%)',
    },
  },
  {
    id: 'grille',
    nom: 'Grille technique',
    famille: 'Motifs',
    // Deux dégradés répétés valent une grille : aucune image, et le pas se règle au pixel.
    clair: {
      backgroundColor: '#fbfbfc',
      backgroundImage: [
        'linear-gradient(rgba(15,23,42,0.06) 1px, transparent 1px)',
        'linear-gradient(90deg, rgba(15,23,42,0.06) 1px, transparent 1px)',
        'radial-gradient(80% 60% at 50% 0%, rgba(247,86,50,0.06), transparent 70%)',
      ].join(','),
      backgroundSize: '28px 28px, 28px 28px, 100% 100%',
    },
    sombre: {
      backgroundColor: '#131313',
      backgroundImage: [
        'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
        'linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
        'radial-gradient(80% 60% at 50% 0%, rgba(247,86,50,0.10), transparent 70%)',
      ].join(','),
      backgroundSize: '28px 28px, 28px 28px, 100% 100%',
    },
  },
  {
    id: 'constellation',
    nom: 'Constellation',
    famille: 'Motifs',
    clair: {
      backgroundColor: '#fbfbfd',
      backgroundImage: svg(
        '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><g fill="#0f172a" opacity="0.18"><circle cx="14" cy="22" r="1.6"/><circle cx="66" cy="10" r="1.1"/><circle cx="98" cy="44" r="1.7"/><circle cx="34" cy="70" r="1.2"/><circle cx="80" cy="92" r="1.5"/><circle cx="10" cy="104" r="1.1"/></g></svg>'
      ),
      backgroundSize: '120px 120px',
    },
    sombre: {
      backgroundColor: '#101014',
      backgroundImage: svg(
        '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><g fill="#ffffff" opacity="0.30"><circle cx="14" cy="22" r="1.6"/><circle cx="66" cy="10" r="1.1"/><circle cx="98" cy="44" r="1.7"/><circle cx="34" cy="70" r="1.2"/><circle cx="80" cy="92" r="1.5"/><circle cx="10" cy="104" r="1.1"/></g></svg>'
      ),
      backgroundSize: '120px 120px',
    },
  },
  {
    id: 'topographie',
    nom: 'Topographie',
    famille: 'Motifs',
    clair: {
      backgroundColor: '#fbfaf8',
      backgroundImage: svg(
        '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><g fill="none" stroke="#0f172a" stroke-opacity="0.10" stroke-width="1"><path d="M0 130 Q40 100 80 130 T160 130"/><path d="M0 100 Q40 70 80 100 T160 100"/><path d="M0 70 Q40 40 80 70 T160 70"/><path d="M0 40 Q40 10 80 40 T160 40"/></g></svg>'
      ),
      backgroundSize: '160px 160px',
    },
    sombre: {
      backgroundColor: '#121212',
      backgroundImage: svg(
        '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><g fill="none" stroke="#ffffff" stroke-opacity="0.10" stroke-width="1"><path d="M0 130 Q40 100 80 130 T160 130"/><path d="M0 100 Q40 70 80 100 T160 100"/><path d="M0 70 Q40 40 80 70 T160 70"/><path d="M0 40 Q40 10 80 40 T160 40"/></g></svg>'
      ),
      backgroundSize: '160px 160px',
    },
  },
  {
    id: 'chevrons',
    nom: 'Chevrons',
    famille: 'Motifs',
    clair: {
      backgroundColor: '#fafafa',
      backgroundImage: svg(
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><path d="M0 20 L10 10 L20 20 L30 10 L40 20" fill="none" stroke="#0f172a" stroke-opacity="0.08" stroke-width="1.5"/></svg>'
      ),
      backgroundSize: '40px 40px',
    },
    sombre: {
      backgroundColor: '#141414',
      backgroundImage: svg(
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><path d="M0 20 L10 10 L20 20 L30 10 L40 20" fill="none" stroke="#ffffff" stroke-opacity="0.07" stroke-width="1.5"/></svg>'
      ),
      backgroundSize: '40px 40px',
    },
  },
  {
    id: 'ardoise',
    nom: 'Ardoise',
    famille: 'Sobres',
    clair: { backgroundColor: '#f4f4f5' },
    sombre: { backgroundColor: '#0d0d0d' },
  },
];

/** Préfixe des fonds procéduraux en base. Une image importée, elle, stocke son chemin. */
export const PREFIXE_PROC = 'proc:';

/** Chemin d'un fond IMPORTÉ, servi par Gearbox. Miroir de la regex du serveur. */
const CHEMIN_IMPORT = /^\/uploads\/chatbg\/[0-9a-f-]{36}\.(jpg|png|webp)$/i;

export const estFondImporte = (valeur?: string | null): boolean =>
  !!valeur && CHEMIN_IMPORT.test(valeur);

export const fondProcedural = (valeur?: string | null): FondChat | undefined =>
  valeur?.startsWith(PREFIXE_PROC)
    ? FONDS_CHAT.find(f => f.id === valeur.slice(PREFIXE_PROC.length))
    : undefined;

/**
 * Style à appliquer au conteneur des messages.
 *
 * ⚠️ Rend `{}` pour une valeur vide OU INCONNUE : un fond supprimé du catalogue, ou une
 * valeur exotique arrivée d'ailleurs, ne doit jamais casser l'affichage du chat — on
 * retombe simplement sur le fond par défaut de l'application.
 */
export const styleFondChat = (valeur: string | null | undefined, sombre: boolean): CSSProperties => {
  if (!valeur) return {};
  if (estFondImporte(valeur)) {
    return {
      backgroundImage: `url("${valeur}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    };
  }
  const fond = fondProcedural(valeur);
  return fond ? (sombre ? fond.sombre : fond.clair) : {};
};

/**
 * Voile posé PAR-DESSUS le fond, sous les messages.
 *
 * ⚠️ Sans lui, une photo importée (le cas « image de mon choix ») peut rendre le texte
 * illisible : on ne maîtrise ni sa luminosité ni son contraste. Les fonds procéduraux,
 * eux, sont calibrés — d'où un voile plus léger. C'est la même logique que le fond
 * translucide des bulles de la charte liquid glass.
 */
export const voileFondChat = (valeur: string | null | undefined, sombre: boolean): string => {
  if (!valeur) return 'transparent';
  if (estFondImporte(valeur)) return sombre ? 'rgba(10,10,10,0.55)' : 'rgba(255,255,255,0.55)';
  return sombre ? 'rgba(10,10,10,0.15)' : 'rgba(255,255,255,0.20)';
};
