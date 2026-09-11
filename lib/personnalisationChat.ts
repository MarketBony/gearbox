import type { CSSProperties } from 'react';

/**
 * PERSONNALISATION DU CHAT — fonds de discussion et couleur des bulles.
 *
 * Demandes de Théo (11/09/2026) : d'abord « des fonds de chat de mon choix, comme sur
 * WhatsApp et Messenger », puis, après un premier jet jugé trop sage — « ils sont d'une
 * tristesse omg » — des fonds franchement colorés, et la possibilité de changer la
 * couleur des bulles « parce que le dégradé on peut vite s'en lasser ».
 *
 * ⚠️ POURQUOI ON PEUT SE PERMETTRE DE LA COULEUR ICI, et c'est ce qui a changé entre les
 * deux jets : le texte des messages n'est JAMAIS posé sur le fond, il est sur des bulles
 * (opaques pour les miennes, `bg-bony-panel` pour celles des autres). Seuls les
 * séparateurs de date et les horodatages flottent sur le fond. Le premier catalogue
 * bridait ses opacités à 0,12-0,16 comme si le fond devait rester lisible sous du texte :
 * précaution inutile, et c'est elle qui rendait tout terne.
 *
 * ⚠️ TOUT EST EN CSS, aucune image téléchargée pour les fonds du catalogue. Le lot PWA a
 * acté que l'app n'a aucun mode hors-ligne et que tout vient du réseau : huit images de
 * fond alourdiraient chaque ouverture du chat. Un dégradé reste par ailleurs net à
 * n'importe quelle densité d'écran, sans variante @2x/@3x.
 *
 * ⚠️ DEUX VARIANTES PAR FOND, clair et sombre. Un fond calibré pour le thème sombre vire
 * au gris sale sur fond blanc, et l'inverse éblouit.
 */

export interface FondChat {
  id: string;
  nom: string;
  famille: 'Couleurs' | 'Motifs' | 'Sobres';
  clair: CSSProperties;
  sombre: CSSProperties;
}

/** Encode un SVG pour un `url("data:image/svg+xml,…")` — un `#` brut casserait l'URL. */
const svg = (contenu: string): string =>
  `url("data:image/svg+xml,${encodeURIComponent(contenu)}")`;

/**
 * Catalogue des FONDS. L'`id` est ce qui part en base (préfixé `proc:`) : **ne jamais le
 * renommer** sans prévoir la reprise des valeurs déjà stockées. Un id inconnu retombe
 * proprement sur « aucun fond », mais l'utilisateur verrait son choix disparaître.
 */
export const FONDS_CHAT: FondChat[] = [
  {
    id: 'miami',
    nom: 'Miami',
    famille: 'Couleurs',
    clair: {
      backgroundColor: '#fff1f6',
      backgroundImage: [
        'radial-gradient(60% 55% at 12% 8%, rgba(236,72,153,0.55), transparent 65%)',
        'radial-gradient(55% 50% at 88% 12%, rgba(249,115,22,0.50), transparent 65%)',
        'radial-gradient(70% 60% at 50% 105%, rgba(56,189,248,0.50), transparent 65%)',
      ].join(','),
    },
    sombre: {
      backgroundColor: '#1a0b1e',
      backgroundImage: [
        'radial-gradient(60% 55% at 12% 8%, rgba(236,72,153,0.60), transparent 65%)',
        'radial-gradient(55% 50% at 88% 12%, rgba(249,115,22,0.45), transparent 65%)',
        'radial-gradient(70% 60% at 50% 105%, rgba(56,189,248,0.45), transparent 65%)',
      ].join(','),
    },
  },
  {
    id: 'aurore-boreale',
    nom: 'Aurore boréale',
    famille: 'Couleurs',
    clair: {
      backgroundColor: '#eefcf7',
      backgroundImage: [
        'radial-gradient(65% 50% at 20% 100%, rgba(16,185,129,0.55), transparent 70%)',
        'radial-gradient(55% 45% at 75% 85%, rgba(34,211,238,0.55), transparent 70%)',
        'radial-gradient(60% 50% at 50% 0%, rgba(139,92,246,0.40), transparent 70%)',
      ].join(','),
    },
    sombre: {
      backgroundColor: '#04121a',
      backgroundImage: [
        'radial-gradient(65% 50% at 20% 100%, rgba(16,185,129,0.55), transparent 70%)',
        'radial-gradient(55% 45% at 75% 85%, rgba(34,211,238,0.50), transparent 70%)',
        'radial-gradient(60% 50% at 50% 0%, rgba(139,92,246,0.45), transparent 70%)',
      ].join(','),
    },
  },
  {
    id: 'agrumes',
    nom: 'Agrumes',
    famille: 'Couleurs',
    clair: {
      backgroundColor: '#fff8e7',
      backgroundImage: [
        'radial-gradient(55% 50% at 85% 10%, rgba(250,204,21,0.65), transparent 65%)',
        'radial-gradient(60% 55% at 10% 30%, rgba(249,115,22,0.55), transparent 65%)',
        'radial-gradient(65% 55% at 55% 100%, rgba(244,63,94,0.40), transparent 70%)',
      ].join(','),
    },
    sombre: {
      backgroundColor: '#1c1005',
      backgroundImage: [
        'radial-gradient(55% 50% at 85% 10%, rgba(250,204,21,0.42), transparent 65%)',
        'radial-gradient(60% 55% at 10% 30%, rgba(249,115,22,0.50), transparent 65%)',
        'radial-gradient(65% 55% at 55% 100%, rgba(244,63,94,0.40), transparent 70%)',
      ].join(','),
    },
  },
  {
    id: 'lagon',
    nom: 'Lagon',
    famille: 'Couleurs',
    clair: {
      backgroundColor: '#ecfeff',
      backgroundImage: [
        'radial-gradient(70% 60% at 15% 15%, rgba(14,165,233,0.50), transparent 70%)',
        'radial-gradient(60% 55% at 90% 60%, rgba(45,212,191,0.55), transparent 70%)',
        'radial-gradient(70% 60% at 40% 110%, rgba(99,102,241,0.40), transparent 70%)',
      ].join(','),
    },
    sombre: {
      backgroundColor: '#04141c',
      backgroundImage: [
        'radial-gradient(70% 60% at 15% 15%, rgba(14,165,233,0.50), transparent 70%)',
        'radial-gradient(60% 55% at 90% 60%, rgba(45,212,191,0.45), transparent 70%)',
        'radial-gradient(70% 60% at 40% 110%, rgba(99,102,241,0.45), transparent 70%)',
      ].join(','),
    },
  },
  {
    id: 'holographique',
    nom: 'Holographique',
    famille: 'Couleurs',
    // `conic-gradient` : le seul moyen d'obtenir l'irisation d'un badge holographique
    // sans image. Adouci par un radial blanc au centre, sinon l'oeil ne se pose nulle part.
    clair: {
      backgroundColor: '#ffffff',
      backgroundImage: [
        'radial-gradient(60% 60% at 50% 45%, rgba(255,255,255,0.85), transparent 70%)',
        'conic-gradient(from 210deg at 50% 50%, #ffd6e7, #d9e4ff, #ccfbf1, #fef3c7, #f5d0fe, #ffd6e7)',
      ].join(','),
    },
    sombre: {
      backgroundColor: '#0b0b12',
      backgroundImage: [
        'radial-gradient(60% 60% at 50% 45%, rgba(10,10,18,0.72), transparent 72%)',
        'conic-gradient(from 210deg at 50% 50%, #ec4899, #6366f1, #06b6d4, #f59e0b, #a855f7, #ec4899)',
      ].join(','),
    },
  },
  {
    id: 'synthwave',
    nom: 'Synthwave',
    famille: 'Couleurs',
    clair: {
      backgroundColor: '#fdf2ff',
      backgroundImage: [
        'linear-gradient(rgba(217,70,239,0.25) 1px, transparent 1px)',
        'linear-gradient(90deg, rgba(34,211,238,0.25) 1px, transparent 1px)',
        'linear-gradient(180deg, rgba(249,115,22,0.35), rgba(168,85,247,0.30) 60%, transparent)',
      ].join(','),
      backgroundSize: '32px 32px, 32px 32px, 100% 100%',
    },
    sombre: {
      backgroundColor: '#0d0418',
      backgroundImage: [
        'linear-gradient(rgba(217,70,239,0.35) 1px, transparent 1px)',
        'linear-gradient(90deg, rgba(34,211,238,0.30) 1px, transparent 1px)',
        'linear-gradient(180deg, rgba(249,115,22,0.30), rgba(168,85,247,0.35) 60%, transparent)',
      ].join(','),
      backgroundSize: '32px 32px, 32px 32px, 100% 100%',
    },
  },
  {
    id: 'terrazzo',
    nom: 'Terrazzo',
    famille: 'Motifs',
    clair: {
      backgroundColor: '#fffaf3',
      backgroundImage: svg(
        '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140"><g><circle cx="20" cy="28" r="7" fill="%23f97316" opacity="0.55"/><circle cx="104" cy="18" r="5" fill="%2306b6d4" opacity="0.55"/><circle cx="126" cy="86" r="8" fill="%23ec4899" opacity="0.45"/><circle cx="58" cy="72" r="4" fill="%23a855f7" opacity="0.60"/><circle cx="28" cy="112" r="6" fill="%2322c55e" opacity="0.50"/><circle cx="86" cy="118" r="4" fill="%23eab308" opacity="0.65"/><circle cx="72" cy="34" r="3" fill="%23ef4444" opacity="0.50"/></g></svg>'
      ),
      backgroundSize: '140px 140px',
    },
    sombre: {
      backgroundColor: '#14100c',
      backgroundImage: svg(
        '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140"><g><circle cx="20" cy="28" r="7" fill="%23f97316" opacity="0.75"/><circle cx="104" cy="18" r="5" fill="%2306b6d4" opacity="0.75"/><circle cx="126" cy="86" r="8" fill="%23ec4899" opacity="0.65"/><circle cx="58" cy="72" r="4" fill="%23a855f7" opacity="0.80"/><circle cx="28" cy="112" r="6" fill="%2322c55e" opacity="0.70"/><circle cx="86" cy="118" r="4" fill="%23eab308" opacity="0.85"/><circle cx="72" cy="34" r="3" fill="%23ef4444" opacity="0.70"/></g></svg>'
      ),
      backgroundSize: '140px 140px',
    },
  },
  {
    id: 'confettis',
    nom: 'Confettis',
    famille: 'Motifs',
    clair: {
      backgroundColor: '#fffdf7',
      backgroundImage: svg(
        '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><g stroke-width="3" stroke-linecap="round"><line x1="16" y1="10" x2="22" y2="22" stroke="%23f97316" opacity="0.7"/><line x1="92" y1="16" x2="86" y2="28" stroke="%2306b6d4" opacity="0.7"/><line x1="54" y1="44" x2="62" y2="52" stroke="%23ec4899" opacity="0.7"/><line x1="22" y1="76" x2="16" y2="88" stroke="%23a855f7" opacity="0.7"/><line x1="100" y1="84" x2="94" y2="96" stroke="%2322c55e" opacity="0.7"/><line x1="66" y1="104" x2="74" y2="112" stroke="%23eab308" opacity="0.8"/></g></svg>'
      ),
      backgroundSize: '120px 120px',
    },
    sombre: {
      backgroundColor: '#111014',
      backgroundImage: svg(
        '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><g stroke-width="3" stroke-linecap="round"><line x1="16" y1="10" x2="22" y2="22" stroke="%23f97316" opacity="0.9"/><line x1="92" y1="16" x2="86" y2="28" stroke="%2306b6d4" opacity="0.9"/><line x1="54" y1="44" x2="62" y2="52" stroke="%23ec4899" opacity="0.9"/><line x1="22" y1="76" x2="16" y2="88" stroke="%23a855f7" opacity="0.9"/><line x1="100" y1="84" x2="94" y2="96" stroke="%2322c55e" opacity="0.9"/><line x1="66" y1="104" x2="74" y2="112" stroke="%23eab308" opacity="0.95"/></g></svg>'
      ),
      backgroundSize: '120px 120px',
    },
  },
  {
    id: 'memphis',
    nom: 'Memphis',
    famille: 'Motifs',
    clair: {
      backgroundColor: '#fef6ff',
      backgroundImage: svg(
        '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150"><g fill="none" stroke-width="3"><circle cx="28" cy="30" r="11" stroke="%23f97316" opacity="0.65"/><path d="M96 20 l14 24 h-28 z" fill="%2306b6d4" opacity="0.55" stroke="none"/><path d="M20 96 q14 -16 28 0" stroke="%23ec4899" opacity="0.65"/><rect x="104" y="92" width="18" height="18" transform="rotate(20 113 101)" stroke="%23a855f7" opacity="0.65"/><circle cx="66" cy="128" r="5" fill="%2322c55e" opacity="0.7" stroke="none"/></g></svg>'
      ),
      backgroundSize: '150px 150px',
    },
    sombre: {
      backgroundColor: '#120d16',
      backgroundImage: svg(
        '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150"><g fill="none" stroke-width="3"><circle cx="28" cy="30" r="11" stroke="%23f97316" opacity="0.85"/><path d="M96 20 l14 24 h-28 z" fill="%2306b6d4" opacity="0.75" stroke="none"/><path d="M20 96 q14 -16 28 0" stroke="%23ec4899" opacity="0.85"/><rect x="104" y="92" width="18" height="18" transform="rotate(20 113 101)" stroke="%23a855f7" opacity="0.85"/><circle cx="66" cy="128" r="5" fill="%2322c55e" opacity="0.9" stroke="none"/></g></svg>'
      ),
      backgroundSize: '150px 150px',
    },
  },
  {
    id: 'bulles-neon',
    nom: 'Bulles néon',
    famille: 'Motifs',
    clair: {
      backgroundColor: '#fdf4ff',
      backgroundImage: [
        'radial-gradient(closest-side, rgba(236,72,153,0.45), transparent)',
        'radial-gradient(closest-side, rgba(34,211,238,0.45), transparent)',
        'radial-gradient(closest-side, rgba(168,85,247,0.40), transparent)',
        'radial-gradient(closest-side, rgba(250,204,21,0.45), transparent)',
      ].join(','),
      backgroundSize: '220px 220px, 180px 180px, 260px 260px, 150px 150px',
      backgroundPosition: '0% 20%, 80% 0%, 60% 90%, 15% 85%',
      backgroundRepeat: 'no-repeat',
    },
    sombre: {
      backgroundColor: '#0c0a14',
      backgroundImage: [
        'radial-gradient(closest-side, rgba(236,72,153,0.50), transparent)',
        'radial-gradient(closest-side, rgba(34,211,238,0.45), transparent)',
        'radial-gradient(closest-side, rgba(168,85,247,0.50), transparent)',
        'radial-gradient(closest-side, rgba(250,204,21,0.35), transparent)',
      ].join(','),
      backgroundSize: '220px 220px, 180px 180px, 260px 260px, 150px 150px',
      backgroundPosition: '0% 20%, 80% 0%, 60% 90%, 15% 85%',
      backgroundRepeat: 'no-repeat',
    },
  },
  {
    id: 'grille',
    nom: 'Grille technique',
    famille: 'Sobres',
    clair: {
      backgroundColor: '#fbfbfc',
      backgroundImage: [
        'linear-gradient(rgba(15,23,42,0.06) 1px, transparent 1px)',
        'linear-gradient(90deg, rgba(15,23,42,0.06) 1px, transparent 1px)',
        'radial-gradient(80% 60% at 50% 0%, rgba(247,86,50,0.10), transparent 70%)',
      ].join(','),
      backgroundSize: '28px 28px, 28px 28px, 100% 100%',
    },
    sombre: {
      backgroundColor: '#131313',
      backgroundImage: [
        'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
        'linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
        'radial-gradient(80% 60% at 50% 0%, rgba(247,86,50,0.14), transparent 70%)',
      ].join(','),
      backgroundSize: '28px 28px, 28px 28px, 100% 100%',
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

/**
 * COULEUR DES BULLES (mes messages).
 *
 * ⚠️ Ne change QUE mes bulles. Celles des autres gardent le panneau neutre — sinon on ne
 * distinguerait plus qui parle, et c'est la convention de toutes les messageries.
 *
 * `texteSombre` pour les fonds clairs : du blanc sur du jaune ne se lit pas. C'est la
 * seule raison d'être de ce drapeau, il n'y en a pas d'autre à inventer.
 */
export interface BulleChat {
  id: string;
  nom: string;
  css: string;
  texteSombre?: boolean;
}

/** `bony` est le défaut historique : exactement le dégradé écrit en dur jusqu'ici. */
export const BULLES_CHAT: BulleChat[] = [
  { id: 'bony',       nom: 'Bony',        css: 'linear-gradient(135deg, #f75632, #8f12ab)' },
  { id: 'ocean',      nom: 'Océan',       css: 'linear-gradient(135deg, #0ea5e9, #2563eb)' },
  { id: 'lagon',      nom: 'Lagon',       css: 'linear-gradient(135deg, #06b6d4, #14b8a6)' },
  { id: 'foret',      nom: 'Forêt',       css: 'linear-gradient(135deg, #22c55e, #15803d)' },
  { id: 'coucher',    nom: 'Coucher',     css: 'linear-gradient(135deg, #fb7185, #f97316)' },
  { id: 'violine',    nom: 'Violine',     css: 'linear-gradient(135deg, #a855f7, #6366f1)' },
  { id: 'framboise',  nom: 'Framboise',   css: 'linear-gradient(135deg, #ec4899, #be123c)' },
  { id: 'nuit',       nom: 'Nuit',        css: 'linear-gradient(135deg, #334155, #0f172a)' },
  { id: 'or',         nom: 'Or',          css: 'linear-gradient(135deg, #fbbf24, #f59e0b)', texteSombre: true },
  { id: 'menthe',     nom: 'Menthe',      css: 'linear-gradient(135deg, #a7f3d0, #5eead4)', texteSombre: true },
  { id: 'graphite',   nom: 'Graphite',    css: '#3f3f46' },
  { id: 'orange',     nom: 'Orange uni',  css: '#f75632' },
];

export const BULLE_PAR_DEFAUT = BULLES_CHAT[0];

export const bulleDe = (id?: string | null): BulleChat =>
  BULLES_CHAT.find(b => b.id === id) ?? BULLE_PAR_DEFAUT;

/** Préfixe des fonds procéduraux en base. Une image importée stocke son chemin. */
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
 * ⚠️ Rend `{}` pour une valeur vide OU INCONNUE : un fond retiré du catalogue, ou une
 * valeur exotique, ne doit jamais casser l'affichage du chat — on retombe simplement sur
 * le fond par défaut de l'application.
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
 * ⚠️ Il n'a pas le même rôle selon la source. Sur une IMAGE importée, on ne maîtrise ni
 * la luminosité ni le contraste : le voile est franc (45 %) et c'est lui qui garde
 * lisibles les horodatages et les séparateurs de date. Sur un fond du catalogue, calibré,
 * il est très léger — le monter reviendrait à délaver les couleurs qu'on vient d'ajouter,
 * ce qui était précisément le reproche fait au premier jet.
 */
export const voileFondChat = (valeur: string | null | undefined, sombre: boolean): string => {
  if (!valeur) return 'transparent';
  if (estFondImporte(valeur)) return sombre ? 'rgba(10,10,10,0.45)' : 'rgba(255,255,255,0.45)';
  return sombre ? 'rgba(10,10,10,0.10)' : 'rgba(255,255,255,0.10)';
};
