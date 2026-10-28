// @ts-nocheck — dessins SVG en chaînes, comme mascot.ts (même repère : viewBox 120 × 120, sol à y = 110).
import { useSyncExternalStore } from 'react';
import { db } from '../../../services/dataService';
import { makeCat } from './mascot';

// =====================================================================
// mIAouss PERSONNALISABLE (27/10/2026, demande de Théo : « chaque utilisateur a son mIAouss »).
//
// Le chat est COMPOSÉ de pièces indépendantes (pelage, motif, oreilles, yeux, pupilles, tenue et sa couleur, tête,
// lunettes, cou) + un prénom. Pelages siamois / noir / calico, clochette, écharpe et bonnet : repris de la maquette
// maquettes/ux/mascottes.html (Miso, Réglisse, Tricot) ; le reste est dessiné dans le même style.
//
// ⚠️ `DEFAULT_LOOK` redonne EXACTEMENT le mIAouss d'origine (Piston : tigré roux, salopette bleue, lunettes d'aviateur).
// Personne ne voit de changement tant qu'il n'a rien touché.
// ⚠️ Ce CATALOGUE est la seule liste des pièces : le serveur ne garde qu'une liste blanche de CLÉS (LOOK_KEYS de
// backend/src/routes/assistant.ts). Un identifiant inconnu (pièce retirée un jour) retombe sur le défaut ici.
// Une nouvelle catégorie = une clé ici ET dans LOOK_KEYS, dans le même lot (sinon elle est refusée en 400).
// =====================================================================

export interface Look { name: string; fur: string; motif: string; ears: string; eyes: string; pupil: string; outfit: string; outfitColor: string; hat: string; glasses: string; neck: string }
export const DEFAULT_LOOK: Look = { name: '', fur: 'roux', motif: 'tigre', ears: 'pointues', eyes: 'ambre', pupil: 'aucune', outfit: 'salopette', outfitColor: 'bleu', hat: 'aviateur', glasses: 'aucunes', neck: 'aucun' };
export const NAME_MAX = 16;
/** Même nettoyage que `cleanBotName` du serveur (routes/assistant.ts) : l'écran montre ce qui sera enregistré. */
export const cleanName = (v: unknown) => (typeof v === 'string' ? v.replace(/[^\p{L}\p{N} '’-]/gu, '').replace(/\s+/g, ' ').trimStart().slice(0, NAME_MAX) : '');
export const botName = (l: Look) => (l.name || '').trim() || 'mIAouss';

// ---------------------------------------------------------------- pelages
const FURS = {
  roux: { l: 'Roux tigré', sw: '#f6a650', fur: ['#ffdcab', '#f6a650', '#c9651f'], cream: ['#fffdf8', '#f1d6b8'], earIn: ['#ffcad8', '#f08aa8'], fluff: '#e8913f', rim: '#ffe6c4', line: '#5a2f1f', nose: '#ff7c9c', tail: ['#e48c3c', '#c4621f'], stripe: '#c4621f' },
  gris: { l: 'Gris', sw: '#9aa3b1', fur: ['#e3e7ee', '#9aa3b1', '#5d6676'], cream: ['#f8f9fb', '#d5d9e0'], earIn: ['#ffc8d6', '#e88aa6'], fluff: '#a2abb8', rim: '#f2f5fa', line: '#2e3440', nose: '#e8849e', tail: ['#8d96a5', '#5d6676'], stripe: '#5d6676' },
  noir: { l: 'Noir', sw: '#2a2535', fur: ['#5d5670', '#2a2535', '#100d16'], cream: ['#3d3749', '#24202e'], earIn: ['#c98aa6', '#8e4e6c'], fluff: '#2a2535', rim: '#b79cff', line: '#e9e2ff', nose: '#c97a99', tail: ['#262131', '#141119'], stripe: '#0a080f', blush: '#d06b98', shine: .3, muzzleOp: .9 },
  blanc: { l: 'Blanc', sw: '#f4efe9', fur: ['#ffffff', '#f7f4f0', '#dcd6ce'], cream: ['#ffffff', '#f3ede6'], earIn: ['#ffd0dc', '#f29ab3'], fluff: '#f0ebe5', rim: '#ffffff', line: '#5a4a40', nose: '#ff9fb4', tail: ['#f4f0eb', '#dcd6ce'], stripe: '#cfc6bb', shine: .6 },
  siamois: { l: 'Siamois', sw: '#f1e2cc', fur: ['#fffaf2', '#f1e2cc', '#c9ab88'], cream: ['#e9d3b6', '#b98c66'], earIn: ['#c98f86', '#8d5148'], fluff: '#ead8bf', rim: '#ffffff', line: '#3b2418', nose: '#4a2c22', tail: ['#6a4433', '#3f2519'], stripe: '#5f3f2f', paw: '#6a4433', darkEars: ['#5a3a2c', '#2f1d15'], blush: '#f5a0b4', shine: .55, muzzleOp: .55 },
  calico: { l: 'Calico', sw: '#f2a04e', fur: ['#ffffff', '#f4efe9', '#d3cbc1'], cream: ['#ffffff', '#efe6dc'], earIn: ['#ffc8d6', '#f08aa8'], fluff: '#efe8e0', rim: '#ffffff', line: '#5a3a2a', nose: '#ff8fa6', tail: ['#f2a04e', '#3d3a42'], stripe: '#3d3a42', shine: .6 },
  chocolat: { l: 'Chocolat', sw: '#7a4e33', fur: ['#c09474', '#7a4e33', '#46281a'], cream: ['#ecd3bc', '#c19a7a'], earIn: ['#e8a5b0', '#b36a7a'], fluff: '#7a4e33', rim: '#e6c09e', line: '#2a170e', nose: '#d47a8e', tail: ['#6e4430', '#46281a'], stripe: '#3a2014' },
  creme: { l: 'Crème', sw: '#f3d9a8', fur: ['#fff4dd', '#f3d9a8', '#cfa86a'], cream: ['#fffdf6', '#f6e6c8'], earIn: ['#ffcad8', '#f08aa8'], fluff: '#ecd09a', rim: '#fff6e2', line: '#5a3c22', nose: '#ff8fa6', tail: ['#e8c88e', '#cfa86a'], stripe: '#c79a52' },
};

// ---------------------------------------------------------------- motifs (sur la tête)
const MOTIFS = {
  tigre: { l: 'Rayures', draw: (u, s) => `<path d="M30.2 49.6 Q34 50.8 36.2 48.8 M29.8 55 Q34 55.6 36.7 53.8 M89.8 49.6 Q86 50.8 83.8 48.8 M90.2 55 Q86 55.6 83.3 53.8" stroke="${s}" stroke-width="2.1" fill="none" stroke-linecap="round" opacity=".7"/>` },
  front: { l: 'Rayures du front', draw: (u, s) => `<path d="M52 29 Q54.5 35 53.5 40 M60 26.5 V38.5 M68 29 Q65.5 35 66.5 40" stroke="${s}" stroke-width="2.3" fill="none" stroke-linecap="round" opacity=".7"/><path d="M30.2 49.6 Q34 50.8 36.2 48.8 M89.8 49.6 Q86 50.8 83.8 48.8" stroke="${s}" stroke-width="2.1" fill="none" stroke-linecap="round" opacity=".7"/>` },
  masque: { l: 'Masque', draw: (u) => `<ellipse cx="60" cy="58" rx="25" ry="21.5" fill="url(#mk${u})"/>` },
  taches: { l: 'Taches', draw: () => `<path d="M30 40 Q34 26 48 25 Q50 36 44 46 Q36 50 30 47Z" fill="#f2a04e" opacity=".95"/><path d="M73 26 Q86 28 90 42 Q86 49 78 46 Q72 38 73 26Z" fill="#3d3a42" opacity=".92"/><ellipse cx="82" cy="60" rx="7" ry="5" fill="#f2a04e" opacity=".8"/>` },
  aucun: { l: 'Uni', draw: () => '' },
};

const EARS_L = { pointues: { l: 'Pointues', v: 'normal' }, hautes: { l: 'Hautes', v: 'tall' }, rondes: { l: 'Rondes', v: 'round' } };

// ---------------------------------------------------------------- yeux
const IRIS = {
  ambre: { l: 'Ambre', iris: ['#b57a3c', '#43281a', '#160c06'], ring: '#160c06' },
  noisette: { l: 'Noisette', iris: ['#e3bd73', '#8a5a24', '#3d2410'], ring: '#2e1a0b' },
  miel: { l: 'Miel', iris: ['#ffe3a0', '#e39a2e', '#7a4310'], ring: '#5a300a' },
  bleu: { l: 'Bleu glacier', iris: ['#e6f7ff', '#6cc1ff', '#1f5fbf'], ring: '#173f86' },
  vertor: { l: 'Vert-or', iris: ['#fbffc2', '#c7e04a', '#5f8a14'], ring: '#3c5a0c' },
  emeraude: { l: 'Émeraude', iris: ['#d8ffe9', '#3ccf8e', '#0f6b45'], ring: '#0b4a30' },
  violet: { l: 'Violet', iris: ['#efe2ff', '#a77bff', '#5a2fd6'], ring: '#3d1f99' },
  vairons: { l: 'Vairons', iris: ['#e6f7ff', '#6cc1ff', '#1f5fbf'], iris2: ['#ffe3a0', '#e39a2e', '#7a4310'], ring: '#3a2a3a' },
};
const PUPILS = { aucune: { l: 'Billes', v: 'none' }, ronde: { l: 'Rondes', v: 'round' }, fente: { l: 'En fente', v: 'slit' } };

// ---------------------------------------------------------------- couleur des vêtements (tenue, chapeaux en tissu, nœuds)
const COLORS = {
  bleu: { l: 'Bleu', c: ['#5d98ff', '#2350c2', '#1b46ad'] },
  orange: { l: 'Orange Bony', c: ['#ff8a5c', '#f75632', '#c43d1d'] },
  violet: { l: 'Violet Bony', c: ['#9a72ff', '#7c4dff', '#4a24b8'] },
  rouge: { l: 'Rouge', c: ['#ff6b78', '#d42a3f', '#9e1628'] },
  vert: { l: 'Vert', c: ['#5ee09a', '#1f9a5a', '#146a3e'] },
  rose: { l: 'Rose', c: ['#ffb3d1', '#f06aa3', '#c23f79'] },
  jaune: { l: 'Jaune', c: ['#ffe27a', '#f5c022', '#c99412'] },
  noir: { l: 'Noir', c: ['#5a5568', '#2b2735', '#15121b'] },
};

// ---------------------------------------------------------------- tenues (dans le corps)
// ⚠️ 27/10 (retour de Théo : « ça déborde, ça fait bâclé ») : un vêtement n'est plus une forme dessinée à côté du corps
// mais le CORPS LUI-MÊME (même ellipse, rognée par `bc`), coupé à un ourlet qui laisse voir le bas du ventre, et ombré
// comme la fourrure (`og` : dégradé radial clair en haut à gauche ; `vol` : assombrissement des bords). Rien ne peut
// dépasser du chat, quelle que soit sa forme. Les manches (`sleeve`) habillent les bras, la patte sort au bout.
const chest = (u) => `<ellipse cx="60" cy="96" rx="12" ry="11" fill="url(#c${u})"/>`;
/** Le vêtement : le corps rogné jusqu'à l'ourlet `hem`, ombré, avec un bord d'ourlet. `inner` = motifs (rognés aussi). */
const shell = (u, fill, hem, edge, inner = '') => `<g clip-path="url(#bc${u})">
    <rect x="36" y="72" width="48" height="${hem - 72}" fill="${fill}"/>${inner}
    <rect x="36" y="72" width="48" height="${hem - 72}" fill="url(#vol${u})"/>
    <rect x="36" y="${hem - 2.2}" width="48" height="2.2" fill="${edge}" opacity=".85"/>
  </g>`;
/** Manche longue : le bras dans le tissu, un poignet, la patte qui dépasse. */
const sleeve = (u, cx, fill, cuff, paw, inner = '') => `<ellipse cx="${cx}" cy="92.2" rx="6.7" ry="6.1" fill="${fill}"/>${inner}
  <ellipse cx="${cx}" cy="92.2" rx="6.7" ry="6.1" fill="url(#vla${u})"/>
  <path d="M${cx - 5.6} 95.4 Q${cx} 98.2 ${cx + 5.6} 95.4" stroke="${cuff}" stroke-width="2" fill="none" stroke-linecap="round"/>
  <ellipse cx="${cx}" cy="97.6" rx="4.5" ry="3.1" fill="${paw}"/>`;
/** Manche courte : le haut du bras seulement. */
const shortSleeve = (u, cx, fill, edge, paw) => `<ellipse cx="${cx}" cy="93" rx="6.4" ry="5.8" fill="${paw}"/>
  <g clip-path="url(#sl${u})"><ellipse cx="${cx}" cy="93" rx="6.6" ry="6" fill="${fill}"/><ellipse cx="${cx}" cy="93" rx="6.6" ry="6" fill="url(#vla${u})"/></g>
  <path d="M${cx - 6} 92.6 Q${cx} 94.4 ${cx + 6} 92.6" stroke="${edge}" stroke-width="1.4" fill="none"/>`;
const STRIPES = (c) => [82, 86.5, 91, 95.5, 100].map((y) => `<rect x="36" y="${y}" width="48" height="2.2" fill="${c}"/>`).join('');

const OUTFITS = {
  // La salopette d'origine (dessin de la maquette validé par Théo) : inchangée.
  salopette: { l: 'Salopette de mécano', body: (u, c) => `<path d="M40.3 93 Q41.3 108.8 60 109.8 Q78.7 108.8 79.7 93 Q78.2 87 72 87 L48 87 Q41.8 87 40.3 93Z" fill="url(#o${u})"/>
    <rect x="50.5" y="81.5" width="19" height="13.5" rx="4.6" fill="url(#o${u})"/>
    <path d="M46.6 77.5 L51.3 87.2 M73.4 77.5 L68.7 87.2" stroke="${c[1]}" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="51.3" cy="87.2" r="1.9" fill="#ffd84d"/><circle cx="68.7" cy="87.2" r="1.9" fill="#ffd84d"/>
    <rect x="55" y="88.5" width="10" height="7" rx="2.2" fill="${c[2]}" opacity=".55"/>
    <path d="M60.5 88.3 L64.8 81.5" stroke="#d6dbe6" stroke-width="2.3" stroke-linecap="round"/><path d="M63 80.6 a2.4 2.4 0 1 0 3.6 1.8" fill="none" stroke="#d6dbe6" stroke-width="2"/>` },
  polo: { l: 'Polo Bony',
    body: (u, c) => `${shell(u, `url(#og${u})`, 104, c[2])}
    <path d="M60 83.5 V92.5" stroke="${c[2]}" stroke-width="1.3"/><circle cx="60" cy="87.2" r=".95" fill="#fff"/><circle cx="60" cy="90.6" r=".95" fill="#fff"/>
    <path d="M50 79.2 Q52.3 87.4 59.4 84.9 L60 80.6Z" fill="#fff"/><path d="M70 79.2 Q67.7 87.4 60.6 84.9 L60 80.6Z" fill="#fff"/>
    <path d="M50 79.2 Q52.3 87.4 59.4 84.9 M70 79.2 Q67.7 87.4 60.6 84.9" stroke="#000" stroke-opacity=".14" stroke-width=".9" fill="none"/>
    <circle cx="70" cy="91.5" r="3.3" fill="#fff"/><text x="70" y="93.4" font-size="5" font-weight="800" font-family="system-ui,sans-serif" text-anchor="middle" fill="${c[1]}">B</text>`,
    arm: (u, cx, paw, c) => shortSleeve(u, cx, `url(#og${u})`, c[2], paw) },
  sweat: { l: 'Sweat à capuche',
    body: (u, c) => `${shell(u, `url(#og${u})`, 105, c[2], `<rect x="36" y="101.5" width="48" height="3.5" fill="${c[2]}" opacity=".55"/>`)}
    <path d="M48.5 96.5 Q48.5 94.6 50.5 94.6 H69.5 Q71.5 94.6 71.5 96.5 L70 102.3 H50Z" fill="${c[2]}" opacity=".45"/>
    <path d="M50.4 96 H69.6" stroke="#fff" stroke-opacity=".35" stroke-width=".8" stroke-dasharray="1.6 1.4"/>
    <path d="M39.5 83 Q43 76.5 51 77.6 Q60 85 69 77.6 Q77 76.5 80.5 83 Q73 89.5 60 89.5 Q47 89.5 39.5 83Z" fill="url(#og${u})"/>
    <path d="M39.5 83 Q43 76.5 51 77.6 Q60 85 69 77.6 Q77 76.5 80.5 83 Q73 89.5 60 89.5 Q47 89.5 39.5 83Z" fill="url(#vla${u})"/>
    <path d="M56.2 87.5 Q55.6 91.5 55.8 95.2 M63.8 87.5 Q64.4 91.5 64.2 95.2" stroke="#fff" stroke-width="1.1" fill="none" stroke-linecap="round"/>
    <rect x="55" y="94.8" width="1.6" height="2.2" rx=".6" fill="#d6dbe6"/><rect x="63.4" y="94.8" width="1.6" height="2.2" rx=".6" fill="#d6dbe6"/>`,
    arm: (u, cx, paw, c) => sleeve(u, cx, `url(#og${u})`, c[2], paw) },
  costume: { l: 'Costume',
    body: (u, c) => `${shell(u, `url(#kj${u})`, 107, '#14161d')}
    <path d="M53.6 79 L60 96 L66.4 79Z" fill="#fff"/><path d="M53.6 79 L60 96 L66.4 79" stroke="#000" stroke-opacity=".12" stroke-width=".8" fill="none"/>
    <path d="M58.6 81 H61.4 L62.6 83.6 L61.4 93.5 L60 95.6 L58.6 93.5 L57.4 83.6Z" fill="url(#og${u})"/><path d="M58.4 81 H61.6 L61 83.4 H59Z" fill="${c[2]}"/>
    <path d="M53.6 79 L58.4 93 L51.2 88.4 L49.6 80.4Z" fill="#454b5c"/><path d="M66.4 79 L61.6 93 L68.8 88.4 L70.4 80.4Z" fill="#454b5c"/>
    <path d="M53.6 79 L58.4 93 M66.4 79 L61.6 93" stroke="#6b7385" stroke-width=".7" fill="none"/>
    <circle cx="60" cy="99.5" r="1.1" fill="#8a90a0"/><circle cx="60" cy="103.6" r="1.1" fill="#8a90a0"/>
    <path d="M68.6 89.6 L73.4 89.6 L72.6 87 L70.6 88.4 L69.4 86.8Z" fill="${c[0]}"/>`,
    arm: (u, cx, paw) => sleeve(u, cx, `url(#kj${u})`, '#ffffff', paw) },
  mariniere: { l: 'Marinière',
    body: (u, c) => `${shell(u, `url(#wg${u})`, 104, c[2], STRIPES(c[1]))}
    <path d="M49 79.6 Q60 84.8 71 79.6" stroke="#fbfaf7" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    arm: (u, cx, paw, c) => sleeve(u, cx, `url(#wg${u})`, c[2], paw, `<g clip-path="url(#sv${u}${Math.round(cx)})">${[88.4, 92.4].map((y) => `<rect x="${cx - 7}" y="${y}" width="14" height="1.9" fill="${c[1]}"/>`).join('')}</g><clipPath id="sv${u}${Math.round(cx)}"><ellipse cx="${cx}" cy="92.2" rx="6.7" ry="6.1"/></clipPath>`) },
  cape: { l: 'Super-héros',
    back: (u, c) => `<path d="M45 79 Q37.5 92 30.5 110 Q45 106 60 108.5 Q75 106 89.5 110 Q82.5 92 75 79Z" fill="url(#og${u})"/>
    <path d="M30.5 110 Q45 106 60 108.5 Q75 106 89.5 110 L88.4 107.2 Q75 103.6 60 106 Q45 103.6 31.6 107.2Z" fill="${c[2]}"/>
    <path d="M41 90 Q37 100 35 107 M79 90 Q83 100 85 107" stroke="${c[2]}" stroke-opacity=".5" stroke-width="1" fill="none"/>`,
    body: (u, c) => `${chest(u)}
    <path d="M60 87.6 L66.6 90.2 Q66.2 98 60 101.8 Q53.8 98 53.4 90.2Z" fill="url(#og${u})" stroke="#ffd84d" stroke-width="1.2" stroke-linejoin="round"/>
    <text x="60" y="97.4" font-size="7.2" font-weight="800" font-family="system-ui,sans-serif" text-anchor="middle" fill="#ffd84d">B</text>
    <path d="M44.6 80.4 Q60 86.6 75.4 80.4" stroke="${c[2]}" stroke-width="2.8" fill="none" stroke-linecap="round"/><circle cx="45.2" cy="81" r="2.1" fill="#ffd84d"/><circle cx="74.8" cy="81" r="2.1" fill="#ffd84d"/>` },
  aucune: { l: 'Aucune', body: (u) => chest(u) },
};

// ---------------------------------------------------------------- sur la tête
// ⚠️ 27/10 : un chapeau qui COUVRE la tête se dessine en DEUX temps — la calotte (`under`), puis les oreilles qui
// passent au travers (rognées par `clip`, la zone au-dessus du bord), puis le bord (`over`) qui recouvre leur base.
// C'était le défaut principal : les oreilles sortaient SOUS le bonnet et la casquette, sur les côtés.
const HEAD_OUT = 'M0 0 H120 V120 H0Z M28.5 52 A31.5 28.5 0 1 0 91.5 52 A31.5 28.5 0 1 0 28.5 52Z';   // hors de la tête
const HATS = {
  aviateur: { l: 'Lunettes d’aviateur', over: (u) => `<path d="M29 35 Q60 23 91 35" stroke="#5a3a26" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <g><circle cx="49" cy="31" r="8.2" fill="#c9a04a"/><circle cx="49" cy="31" r="6.2" fill="url(#gl${u}g)"/><path d="M45.5 28.5 Q48 26.5 51 27.5" stroke="#fff" stroke-width="1.6" fill="none" opacity=".85" stroke-linecap="round"/>
      <circle cx="71" cy="31" r="8.2" fill="#c9a04a"/><circle cx="71" cy="31" r="6.2" fill="url(#gl${u}g)"/><path d="M67.5 28.5 Q70 26.5 73 27.5" stroke="#fff" stroke-width="1.6" fill="none" opacity=".85" stroke-linecap="round"/>
      <path d="M57.2 31 Q60 29 62.8 31" stroke="#c9a04a" stroke-width="2.4" fill="none"/></g>` },
  bonnet: { l: 'Bonnet à pompon', clip: 'M0 0 H120 V39.5 Q60 29.5 0 39.5Z',
    under: (u, c) => `<path d="M29.4 41 Q29 11 60 10 Q91 11 90.6 41 Q60 33 29.4 41Z" fill="url(#og${u})"/>
    <path d="M38 17.5 Q36.5 28 37 38 M45.5 13.4 Q44.5 25 45 35.5 M53 11.2 Q52.6 23 52.8 34 M60 10.6 V33.5 M67 11.2 Q67.4 23 67.2 34 M74.5 13.4 Q75.5 25 75 35.5 M82 17.5 Q83.5 28 83 38" stroke="${c[2]}" stroke-width="1.1" opacity=".45" fill="none"/>
    <path d="M29.4 41 Q29 11 60 10 Q91 11 90.6 41 Q60 33 29.4 41Z" fill="url(#vlh${u})"/>`,
    over: (u, c) => `<path d="M27.8 41.2 Q60 31 92.2 41.2 L92.4 47.2 Q60 37.4 27.6 47.2Z" fill="${c[1]}"/>
    <path d="M27.8 41.2 Q60 31 92.2 41.2 L92.4 47.2 Q60 37.4 27.6 47.2Z" fill="url(#vlh${u})"/>
    <path d="M30 44 Q60 34.4 90 44" stroke="#fff" stroke-opacity=".35" stroke-width="1" stroke-dasharray="1.4 1.6" fill="none"/>
    <circle cx="60" cy="8.6" r="6.8" fill="url(#pp${u})"/><circle cx="57.8" cy="6.4" r="2.1" fill="#fff" opacity=".5"/>` },
  casquette: { l: 'Casquette', clip: 'M0 0 H120 V38.5 Q60 29.5 0 38.5Z',
    under: (u, c) => `<path d="M30.6 40 Q30 12 60 11 Q90 12 89.4 40 Q60 31.5 30.6 40Z" fill="url(#og${u})"/>
    <path d="M60 11.4 V31.5 M45.5 14.6 Q43.4 25 44.2 34.6 M74.5 14.6 Q76.6 25 75.8 34.6" stroke="${c[2]}" stroke-width="1" opacity=".55" fill="none"/>
    <path d="M30.6 40 Q30 12 60 11 Q90 12 89.4 40 Q60 31.5 30.6 40Z" fill="url(#vlh${u})"/>
    <circle cx="60" cy="11.6" r="2.2" fill="${c[2]}"/>
    <circle cx="60" cy="23.5" r="4" fill="#fff"/><text x="60" y="25.8" font-size="6.2" font-weight="800" font-family="system-ui,sans-serif" text-anchor="middle" fill="${c[1]}">B</text>`,
    over: (u, c) => `<path d="M31.4 38.6 Q60 30 88.6 38.6 Q92 44.4 60 41 Q28 44.4 31.4 38.6Z" fill="${c[2]}"/>
    <path d="M34 39.6 Q60 32.6 86 39.6" stroke="#fff" stroke-opacity=".3" stroke-width=".8" stroke-dasharray="1.4 1.4" fill="none"/>` },
  chantier: { l: 'Casque de chantier', clip: 'M0 0 H120 V38 Q60 30 0 38Z',
    under: () => `<path d="M29.6 40 Q29 9 60 8 Q91 9 90.4 40Z" fill="url(#yh0)"/>
    <path d="M60 8.6 V35 M50 10.4 Q47.6 22 48.6 36 M70 10.4 Q72.4 22 71.4 36" stroke="#e0a800" stroke-width="2.6" fill="none"/>
    <path d="M38 19 Q44 12.6 53 11.6" stroke="#fff" stroke-width="2.2" fill="none" opacity=".55" stroke-linecap="round"/>`,
    over: () => `<path d="M24.6 40 Q60 31.6 95.4 40 Q96.6 45 60 41.6 Q23.4 45 24.6 40Z" fill="#f2b600"/><path d="M27 40.4 Q60 33 93 40.4" stroke="#fff3b0" stroke-width=".9" fill="none"/>` },
  sorciere: { l: 'Chapeau de sorcière', clip: 'M0 0 H120 V33 Q60 27 0 33Z',
    over: (u, c) => `<ellipse cx="60" cy="33.6" rx="34" ry="6.2" fill="#2a1f3d"/><ellipse cx="60" cy="32.6" rx="31" ry="4.6" fill="#3b2b57" opacity=".7"/>
    <path d="M44.4 32 Q48.6 17 58 9 Q70 0 82 3.4 Q71 8.6 72.6 18 Q74 26 76 32Z" fill="url(#wb${u})"/>
    <path d="M44.6 28 Q60 31.6 75.6 28 L76.2 32.2 Q60 35.6 44 32.2Z" fill="${c[1]}"/><rect x="57" y="28.6" width="6" height="5" rx="1" fill="none" stroke="#ffd34d" stroke-width="1.4"/>
    <path d="M52 22 Q56 13 64 8.6" stroke="#fff" stroke-opacity=".18" stroke-width="2" fill="none" stroke-linecap="round"/>` },
  casqueaudio: { l: 'Casque audio', clip: HEAD_OUT,
    under: () => `<path d="M27.4 52 Q25 15.5 60 14.4 Q95 15.5 92.6 52" fill="none" stroke="#2b2f3a" stroke-width="5.6" stroke-linecap="round"/>
    <path d="M30 40 Q30.5 19.5 60 17.4 Q89.5 19.5 90 40" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="1.2"/>`,
    over: (u) => `<rect x="20" y="43.4" width="12.4" height="19" rx="6" fill="url(#og${u})"/><rect x="87.6" y="43.4" width="12.4" height="19" rx="6" fill="url(#og${u})"/>
    <rect x="20" y="43.4" width="12.4" height="19" rx="6" fill="url(#vla${u})"/><rect x="87.6" y="43.4" width="12.4" height="19" rx="6" fill="url(#vla${u})"/>
    <rect x="28.8" y="45.4" width="3.8" height="15" rx="1.9" fill="#2b2f3a"/><rect x="87.4" y="45.4" width="3.8" height="15" rx="1.9" fill="#2b2f3a"/>` },
  couronne: { l: 'Couronne', over: () => `<path d="M45.6 31.6 L44 17 L52.2 23.6 L60 13.4 L67.8 23.6 L76 17 L74.4 31.6 Q60 28.6 45.6 31.6Z" fill="url(#cg0)" stroke="#b07a10" stroke-width="1" stroke-linejoin="round"/>
    <path d="M45.4 29.4 Q60 26.4 74.6 29.4" stroke="#b07a10" stroke-width=".9" fill="none"/>
    <circle cx="44" cy="16.4" r="1.7" fill="#fff3b0"/><circle cx="60" cy="12.6" r="1.9" fill="#fff3b0"/><circle cx="76" cy="16.4" r="1.7" fill="#fff3b0"/>
    <circle cx="60" cy="24.6" r="2.4" fill="#ff4f6b"/><circle cx="51.6" cy="27.4" r="1.6" fill="#5aa9ff"/><circle cx="68.4" cy="27.4" r="1.6" fill="#3ccf8e"/>` },
  noeud: { l: 'Nœud', over: (u, c) => `<g transform="translate(73.5 28.5) rotate(22)">
    <path d="M0 0 C-3 -6 -11.5 -8 -12 -1 C-12.4 5.4 -3.6 5 0 0Z" fill="url(#og${u})"/><path d="M0 0 C3 -6 11.5 -8 12 -1 C12.4 5.4 3.6 5 0 0Z" fill="url(#og${u})"/>
    <path d="M-1.4 0 C-4 -3.2 -8 -4 -9 -1 M1.4 0 C4 -3.2 8 -4 9 -1" stroke="${c[2]}" stroke-width=".8" fill="none" opacity=".7"/>
    <rect x="-2.6" y="-2.8" width="5.2" height="5.6" rx="2" fill="${c[2]}"/></g>` },
  aucun: { l: 'Rien' },
};

// ---------------------------------------------------------------- lunettes (sur les yeux)
const GLASSES = {
  aucunes: { l: 'Aucunes', draw: () => '' },
  rondes: { l: 'Rondes', draw: (u, ex, ey) => `<g fill="#fff" fill-opacity=".1" stroke="#2b2f3a" stroke-width="1.9">${ex.map((x) => `<circle cx="${x}" cy="${ey}" r="10"/>`).join('')}</g>
    <path d="M${ex[0] + 10} ${ey - 1} Q60 ${ey - 4} ${ex[1] - 10} ${ey - 1} M${ex[0] - 10} ${ey - 1} L31 ${ey - 3} M${ex[1] + 10} ${ey - 1} L89 ${ey - 3}" stroke="#2b2f3a" stroke-width="1.9" fill="none" stroke-linecap="round"/>` },
  soleil: { l: 'De soleil', draw: (u, ex, ey) => `${ex.map((x) => `<rect x="${x - 10.5}" y="${ey - 7}" width="21" height="14" rx="5.5" fill="#14111a" opacity=".93"/><path d="M${x - 6.5} ${ey - 3} L${x - 2} ${ey - 5}" stroke="#fff" stroke-width="1.6" opacity=".6" stroke-linecap="round"/>`).join('')}
    <path d="M${ex[0] + 10.5} ${ey - 2} Q60 ${ey - 5} ${ex[1] - 10.5} ${ey - 2} M${ex[0] - 10.5} ${ey - 2} L31 ${ey - 4} M${ex[1] + 10.5} ${ey - 2} L89 ${ey - 4}" stroke="#14111a" stroke-width="2" fill="none" stroke-linecap="round"/>` },
  coeur: { l: 'Cœurs', draw: (u, ex, ey) => `${ex.map((x) => `<path d="M${x} ${ey + 8.5} C${x - 13} ${ey} ${x - 8} ${ey - 11} ${x} ${ey - 4.5} C${x + 8} ${ey - 11} ${x + 13} ${ey} ${x} ${ey + 8.5}Z" fill="#ff4f8b" fill-opacity=".6" stroke="#d62e6c" stroke-width="1.6"/>`).join('')}
    <path d="M${ex[0] + 9} ${ey - 3} Q60 ${ey - 6} ${ex[1] - 9} ${ey - 3}" stroke="#d62e6c" stroke-width="1.6" fill="none"/>` },
  monocle: { l: 'Monocle', draw: (u, ex, ey) => `<circle cx="${ex[1]}" cy="${ey}" r="10" fill="#fff" fill-opacity=".12" stroke="#c9a04a" stroke-width="2"/><path d="M${ex[1] + 7} ${ey + 7} Q${ex[1] + 12} ${ey + 20} ${ex[1] + 2} ${ey + 27}" stroke="#c9a04a" stroke-width="1.1" fill="none" stroke-dasharray="1.6 1.2"/>` },
};

// ---------------------------------------------------------------- au cou
// Le menton s'arrête à y ≈ 80,5 : tout ce qui se porte au cou se place SOUS cette ligne (le nœud et le bandana étaient
// à moitié cachés par la tête au premier jet).
const NECKS = {
  aucun: { l: 'Rien', draw: () => '' },
  clochette: { l: 'Clochette', draw: () => `<g><path d="M44 79.5 Q60 86 76 79.5" stroke="#f75632" stroke-width="3.6" fill="none" stroke-linecap="round"/><circle cx="60" cy="85.5" r="3.6" fill="#ffcf4a"/><circle cx="58.9" cy="84.4" r="1.2" fill="#fff" opacity=".8"/><path d="M58.3 87 H61.7" stroke="#a87a1a" stroke-width="1"/></g>` },
  echarpe: { l: 'Écharpe Bony', draw: () => `<g><path d="M40 79 Q60 89 80 79 L79 85 Q60 94 41 85Z" fill="#f75632"/><path d="M44 81.5 Q60 89.5 76 81.5" stroke="#ffb07a" stroke-width="1.4" fill="none" stroke-dasharray="2 2.4"/><path d="M41 84.5 Q60 92.5 79 84.5" stroke="#c43d1d" stroke-width="1.2" fill="none"/>
    <path d="M64 84 Q70 92 67 104 L74 103 Q77 92 70 83Z" fill="#f75632"/><path d="M67.5 99 H73.5 M67.8 102 H74" stroke="#7c4dff" stroke-width="1.8"/><path d="M67 104 l.5 2.5 M69.5 103.8 l.2 2.6 M72 103.6 l.5 2.5" stroke="#f75632" stroke-width="1.3" stroke-linecap="round"/></g>` },
  noeudpap: { l: 'Nœud papillon', draw: (u, c) => `<g transform="translate(60 85.4)">
    <path d="M0 0 C-2.6 -5 -10 -6.6 -10.8 -1 C-11.2 4.6 -3.4 5 0 0Z" fill="url(#og${u})"/><path d="M0 0 C2.6 -5 10 -6.6 10.8 -1 C11.2 4.6 3.4 5 0 0Z" fill="url(#og${u})"/>
    <path d="M-1.6 0 C-4 -2.6 -7.4 -3.2 -8.2 -.6 M1.6 0 C4 -2.6 7.4 -3.2 8.2 -.6" stroke="${c[2]}" stroke-width=".8" fill="none" opacity=".7"/>
    <rect x="-2.4" y="-2.6" width="4.8" height="5.2" rx="1.8" fill="${c[2]}"/></g>` },
  collier: { l: 'Collier à médaille', draw: (u, c) => `<path d="M44 79.5 Q60 86 76 79.5" stroke="${c[1]}" stroke-width="3.4" fill="none" stroke-linecap="round"/><circle cx="60" cy="88" r="3.7" fill="#e3e7ee" stroke="#9aa3b1" stroke-width=".8"/><text x="60" y="89.8" font-size="4.8" font-weight="800" font-family="system-ui,sans-serif" text-anchor="middle" fill="#5a6270">B</text>` },
  bandana: { l: 'Bandana', draw: (u) => `<path d="M41.4 79.6 Q60 88 78.6 79.6 Q73 90.6 60 99.4 Q47 90.6 41.4 79.6Z" fill="url(#og${u})"/>
    <path d="M41.4 79.6 Q60 88 78.6 79.6 Q73 90.6 60 99.4 Q47 90.6 41.4 79.6Z" fill="url(#vla${u})"/>
    <path d="M44.6 81.6 Q60 89 75.4 81.6" stroke="#000" stroke-opacity=".15" stroke-width="1" fill="none"/>
    <g fill="#fff" opacity=".8"><circle cx="52" cy="87" r=".95"/><circle cx="60" cy="90" r=".95"/><circle cx="68" cy="87" r=".95"/><circle cx="56" cy="93.4" r=".95"/><circle cx="64" cy="93.4" r=".95"/></g>` },
};

/** Le catalogue, dans l'ordre d'affichage des Réglages. `sw` = pastille de couleur (sinon le libellé seul). */
export const CATALOGUE: { key: keyof Look; l: string; items: [string, string, string?][] }[] = [
  { key: 'fur', l: 'Pelage', items: Object.entries(FURS).map(([k, v]) => [k, v.l, v.sw]) },
  { key: 'motif', l: 'Motif', items: Object.entries(MOTIFS).map(([k, v]) => [k, v.l]) },
  { key: 'ears', l: 'Oreilles', items: Object.entries(EARS_L).map(([k, v]) => [k, v.l]) },
  { key: 'eyes', l: 'Couleur des yeux', items: Object.entries(IRIS).map(([k, v]) => [k, v.l, v.iris[1]]) },
  { key: 'pupil', l: 'Pupilles', items: Object.entries(PUPILS).map(([k, v]) => [k, v.l]) },
  { key: 'outfit', l: 'Tenue', items: Object.entries(OUTFITS).map(([k, v]) => [k, v.l]) },
  { key: 'outfitColor', l: 'Couleur des vêtements', items: Object.entries(COLORS).map(([k, v]) => [k, v.l, v.c[1]]) },
  { key: 'hat', l: 'Sur la tête', items: Object.entries(HATS).map(([k, v]) => [k, v.l]) },
  { key: 'glasses', l: 'Lunettes', items: Object.entries(GLASSES).map(([k, v]) => [k, v.l]) },
  { key: 'neck', l: 'Au cou', items: Object.entries(NECKS).map(([k, v]) => [k, v.l]) },
];
const TABLES = { fur: FURS, motif: MOTIFS, ears: EARS_L, eyes: IRIS, pupil: PUPILS, outfit: OUTFITS, outfitColor: COLORS, hat: HATS, glasses: GLASSES, neck: NECKS };

/** Apparence propre : clés connues, identifiants du catalogue (sinon le défaut), prénom borné. */
export function normalizeLook(raw: any): Look {
  const out = { ...DEFAULT_LOOK };
  if (raw && typeof raw === 'object') {
    for (const k of Object.keys(TABLES)) if (typeof raw[k] === 'string' && TABLES[k][raw[k]]) out[k] = raw[k];
    out.name = cleanName(raw.name).trim();
  }
  return out;
}
export const isDefaultLook = (l: Look) => Object.keys(DEFAULT_LOOK).every((k) => (k === 'name' ? !(l.name || '').trim() : l[k] === DEFAULT_LOOK[k]));

/** Un tirage au hasard (bouton « Surprends-moi ») : le prénom est gardé. */
export function randomLook(keep: Look): Look {
  const pick = (t) => { const ks = Object.keys(t); return ks[Math.floor(Math.random() * ks.length)]; };
  const l = { ...keep }; for (const [k, t] of Object.entries(TABLES)) l[k] = pick(t); return l;
}

/** Le chat dessiné pour une apparence (définition pour `Rig` / `Buddy`). Mise en cache : même apparence = même objet. */
const cache = new Map<string, any>();
export function catFor(look: Look) {
  const L = normalizeLook(look), key = JSON.stringify({ ...L, name: '' });
  const hit = cache.get(key); if (hit) return hit;
  const F = FURS[L.fur], M = MOTIFS[L.motif], I = IRIS[L.eyes], C = COLORS[L.outfitColor].c, O = OUTFITS[L.outfit], H = HATS[L.hat];
  const def = makeCat({
    id: 'miaouss', name: botName(L),
    fur: F.fur, cream: F.cream, earIn: F.earIn, fluff: F.fluff, rim: F.rim, line: F.line, nose: F.nose, tail: F.tail,
    paw: F.paw, blush: F.blush, shine: F.shine, muzzleOp: F.muzzleOp,
    ear: F.darkEars ? (u) => `url(#de${u})` : undefined,
    ears: EARS_L[L.ears].v,
    eye: { dx: 13, y: 53, rx: 7, ry: 8.3, iris: I.iris, iris2: I.iris2, ring: I.ring, pupil: PUPILS[L.pupil].v, pr: 2.6, pw: 1.7 },
    defs: (u) => `<linearGradient id="o${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C[0]}"/><stop offset="1" stop-color="${C[1]}"/></linearGradient>
      <radialGradient id="og${u}" cx="36%" cy="26%" r="85%"><stop offset="0" stop-color="${C[0]}"/><stop offset=".55" stop-color="${C[1]}"/><stop offset="1" stop-color="${C[2]}"/></radialGradient>
      <radialGradient id="wg${u}" cx="36%" cy="26%" r="85%"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#f3f1ec"/><stop offset="1" stop-color="#d6d1c7"/></radialGradient>
      <radialGradient id="kj${u}" cx="36%" cy="26%" r="85%"><stop offset="0" stop-color="#565d70"/><stop offset=".55" stop-color="#2f3442"/><stop offset="1" stop-color="#161921"/></radialGradient>
      <radialGradient id="wb${u}" cx="30%" cy="40%" r="80%"><stop offset="0" stop-color="#55407a"/><stop offset="1" stop-color="#2a1f3d"/></radialGradient>
      <radialGradient id="vol${u}" gradientUnits="userSpaceOnUse" cx="54" cy="86" r="26"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></radialGradient>
      <radialGradient id="vla${u}" cx="40%" cy="30%" r="75%"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></radialGradient>
      <radialGradient id="vlh${u}" cx="40%" cy="25%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></radialGradient>
      <linearGradient id="yh0" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe066"/><stop offset="1" stop-color="#f5b800"/></linearGradient>
      <linearGradient id="cg0" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0a0"/><stop offset=".5" stop-color="#ffd34d"/><stop offset="1" stop-color="#d9a21a"/></linearGradient>
      <clipPath id="bc${u}"><ellipse cx="60" cy="92" rx="21.5" ry="17.5"/></clipPath>
      <clipPath id="sl${u}"><rect x="0" y="0" width="120" height="92.6"/></clipPath>
      <radialGradient id="gl${u}g" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#d9fbff"/><stop offset=".5" stop-color="#6fc7e8"/><stop offset="1" stop-color="#256a8f"/></radialGradient>
      <radialGradient id="pp${u}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#ffc08a"/><stop offset="1" stop-color="#f2621f"/></radialGradient>
      <radialGradient id="mk${u}" cx="50%" cy="64%" r="52%"><stop offset="0" stop-color="${F.stripe}" stop-opacity="1"/><stop offset=".5" stop-color="${F.stripe}" stop-opacity=".8"/><stop offset=".78" stop-color="${F.stripe}" stop-opacity=".3"/><stop offset="1" stop-color="${F.stripe}" stop-opacity="0"/></radialGradient>
      ${F.darkEars ? `<radialGradient id="de${u}" cx="50%" cy="20%" r="90%"><stop offset="0" stop-color="${F.darkEars[0]}"/><stop offset="1" stop-color="${F.darkEars[1]}"/></radialGradient>` : ''}`,
    marks: (u) => M.draw(u, F.stripe),
    back: O.back ? (u) => O.back(u, C) : undefined,
    body: (u) => O.body(u, C),
    arm: O.arm ? (u, cx, paw) => O.arm(u, cx, paw, C) : undefined,
    neck: (u) => NECKS[L.neck].draw(u, C),
    face: (u, ex, ey) => GLASSES[L.glasses].draw(u, ex, ey),
    hatUnder: H.under ? (u) => H.under(u, C) : undefined,
    earClip: H.clip,
    hat: H.over ? (u) => H.over(u, C) : undefined,
  });
  cache.set(key, def);
  return def;
}

// ---------------------------------------------------------------- store : l'apparence du compte connecté
// `useSyncExternalStore`, jamais `useState` + abonnement dans un `useEffect` (motif « signal perdu », correctif 99).
let state: Look = DEFAULT_LOOK;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());
// Écritures GROUPÉES et EN ORDRE : chaque choix s'affiche tout de suite ; l'envoi part 350 ms après le dernier clic et
// porte TOUJOURS l'état le plus récent ; un clic arrivé pendant un envoi en relance un après lui. Jamais deux PUT en
// parallèle (le plus ancien pourrait arriver le dernier), jamais de bouton bloqué pendant l'enregistrement (des clics
// rapides étaient perdus — vu au premier test, 27/10).
let timer: ReturnType<typeof setTimeout> | undefined, inflight: Promise<void> | null = null, dirty = false;
let waiters: { ok: () => void; ko: (e: unknown) => void }[] = [];
async function flush() {
  if (inflight) { dirty = true; return; }
  const batch = waiters; waiters = []; dirty = false;
  const n = state;
  inflight = db.assistantSetLook(isDefaultLook(n) ? null : { ...n, name: n.name.trim() })
    .then(() => { batch.forEach((w) => w.ok()); })
    .catch(async (e) => { await lookStore.load(); batch.forEach((w) => w.ko(e)); })
    .finally(() => { inflight = null; if (dirty || waiters.length) void flush(); });
}
export const lookStore = {
  subscribe(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; },
  get: () => state,
  /** Affichage immédiat (aperçu, écriture optimiste). */
  set(l: Look) { state = normalizeLook(l); emit(); },
  /** Relit l'apparence enregistrée. Échec silencieux : on garde l'état courant. */
  async load() { try { const r = await db.assistantLook(); lookStore.set(normalizeLook(r?.look)); } catch { /* réseau, accès coupé */ } },
  /** Affiche tout de suite, enregistre peu après (null si c'est le mIAouss d'origine). Échec : relit l'état serveur et
   *  rejette la promesse (message à l'appelant). */
  save(l: Look): Promise<void> {
    lookStore.set(l);
    return new Promise((ok, ko) => { waiters.push({ ok, ko }); clearTimeout(timer); timer = setTimeout(() => { void flush(); }, 350); });
  },
};
export const useMiaoussLook = (): Look => useSyncExternalStore(lookStore.subscribe, lookStore.get);
