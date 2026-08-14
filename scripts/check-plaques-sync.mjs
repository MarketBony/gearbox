// =============================================================================
// GARDE-FOU — la carte des plaques est DUPLIQUÉE entre le frontend et le backend.
//
// `PLAQUES_STRUCTURE` (constants.ts, racine) et `PLAQUES` (backend/src/auth/
// siteScope.ts) décrivent la même réalité. La duplication est assumée : le backend ne
// peut pas importer le `constants.ts` racine, qui n'est compilé que dans le bundle
// frontend. Mais elle était jusqu'ici « à synchroniser à la main », c'est-à-dire à
// oublier — et l'oubli est SILENCIEUX : un site ajouté d'un seul côté fausse le
// périmètre d'un chef de site sans lever la moindre erreur, ni au build ni à
// l'exécution. Personne ne s'en apercevrait avant qu'un responsable de concession
// signale des chiffres incohérents.
//
// Ce script compare les deux tables et sort en échec si elles divergent.
//
// ⚠️ OÙ IL TOURNE, ET POURQUOI PAS DANS DOCKER. Branché sur `predev` et `prebuild`,
// donc sur la COPIE DE TRAVAIL — la seule à contenir les deux fichiers. Aucune des
// deux images Docker ne peut faire cette comparaison, et ce n'est pas un oubli de
// configuration : `backend` est dans `.dockerignore` du contexte frontend, et le
// contexte du backend est `./backend`, qui ne voit pas le `constants.ts` racine.
// C'est exactement la raison pour laquelle la duplication existe. Le contrôle se fait
// donc chez la personne qui édite le code, au démarrage du serveur de dev — c'est-à-dire
// plusieurs fois par jour, et surtout dans la session où la faute est commise.
// Quand les fichiers du backend sont absents, on ne peut pas conclure : on IGNORE le
// contrôle au lieu d'échouer, sinon le build de l'image `web` casserait pour une raison
// qui n'a rien à voir avec une divergence.
//
// Volontairement sans dépendance et sans framework de test (le projet n'en a aucun) :
// on lit les deux fichiers comme du texte et on en extrait les littéraux.
// =============================================================================

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONSTANTS = join(racine, 'constants.ts');
const SITE_SCOPE = join(racine, 'backend', 'src', 'auth', 'siteScope.ts');

/**
 * Extrait un littéral objet `NOM ... = { 'CLE': [...], ... }` sous forme de
 * Map<clé, string[]>. On s'arrête à la première ligne ne contenant que `}` ou `};`,
 * ce qui suffit : ces deux tables sont plates et écrites une entrée par ligne.
 */
const litteralObjet = (source, nom, chemin) => {
  const apresAccolade = ouvertureApresEgal(source, nom, chemin, '{');
  const lignes = source.slice(apresAccolade + 1).split(/\r?\n/);
  const table = new Map();
  for (const ligne of lignes) {
    if (/^\s*[}]\s*;?\s*$/.test(ligne)) break;
    const m = ligne.match(/^\s*'([^']+)'\s*:\s*\[([^\]]*)\]/);
    if (m) table.set(m[1], valeursTableau(m[2]));
  }
  if (table.size === 0) throw new Error(`Aucune entrée lue dans "${nom}" (${chemin}) — format inattendu`);
  return table;
};

/**
 * Trouve l'ouvrant du littéral affecté à `nom`, en partant du `=` et non du nom.
 * ⚠️ Indispensable : chercher directement le premier `[` après « ALPINE_SITES »
 * tombe sur celui de l'annotation de type `: Site[]`, et on lit alors un tableau
 * vide — le script rendait un faux « format inattendu ».
 */
const ouvertureApresEgal = (source, nom, chemin, ouvrant) => {
  const debut = source.indexOf(nom);
  if (debut === -1) throw new Error(`"${nom}" introuvable dans ${chemin}`);
  const egal = source.indexOf('=', debut);
  if (egal === -1) throw new Error(`Affectation de "${nom}" introuvable dans ${chemin}`);
  const pos = source.indexOf(ouvrant, egal);
  if (pos === -1) throw new Error(`"${ouvrant}" de "${nom}" introuvable dans ${chemin}`);
  return pos;
};

/**
 * Comme `litteralObjet`, mais pour une table dont les VALEURS sont des chaînes :
 * `{ 'Clermont': 'Alpine-Clermont', … }`. Rend une Map<clé, valeur>.
 */
const litteralObjetTexte = (source, nom, chemin) => {
  const apresAccolade = ouvertureApresEgal(source, nom, chemin, '{');
  const lignes = source.slice(apresAccolade + 1).split(/\r?\n/);
  const table = new Map();
  for (const ligne of lignes) {
    if (/^\s*[}]\s*;?\s*$/.test(ligne)) break;
    const m = ligne.match(/^\s*'([^']+)'\s*:\s*'([^']*)'/);
    if (m) table.set(m[1], m[2]);
  }
  if (table.size === 0) throw new Error(`Aucune entrée lue dans "${nom}" (${chemin}) — format inattendu`);
  return table;
};

/** Extrait un `NOM ... = [ 'a', 'b' ]` (éventuellement sur plusieurs lignes). */
const litteralTableau = (source, nom, chemin) => {
  const ouvrante = ouvertureApresEgal(source, nom, chemin, '[');
  const fermante = source.indexOf(']', ouvrante);
  if (fermante === -1) throw new Error(`Crochet fermant de "${nom}" introuvable dans ${chemin}`);
  const valeurs = valeursTableau(source.slice(ouvrante + 1, fermante));
  if (valeurs.length === 0) throw new Error(`"${nom}" lu vide dans ${chemin} — format inattendu`);
  return valeurs;
};

// Les commentaires sont retirés AVANT extraction : `constants.ts` en contient au
// milieu de ses tableaux, et une chaîne citée dans un commentaire serait lue comme
// une valeur.
const valeursTableau = (brut) =>
  brut
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(',')
    .map(v => v.trim())
    .filter(v => /^'[^']*'$/.test(v))
    .map(v => v.slice(1, -1));

// Contexte sans le backend (build de l'image Docker `web`) : rien à comparer, on sort
// proprement. Ne JAMAIS transformer ce cas en échec — voir l'en-tête du fichier.
if (!existsSync(SITE_SCOPE)) {
  console.log('• check-plaques-sync : backend/ absent de ce contexte, contrôle ignoré (attendu dans un build Docker).');
  process.exit(0);
}

const ecarts = [];

const comparerTables = (etiquette, front, back) => {
  const clefs = [...new Set([...front.keys(), ...back.keys()])].sort();
  for (const clef of clefs) {
    const a = front.get(clef);
    const b = back.get(clef);
    if (!a) { ecarts.push(`${etiquette} : "${clef}" existe côté backend mais PAS dans constants.ts`); continue; }
    if (!b) { ecarts.push(`${etiquette} : "${clef}" existe dans constants.ts mais PAS côté backend`); continue; }
    // L'ORDRE n'a pas de sens ici (ce sont des ensembles d'appartenance), le CONTENU si.
    const manquantsBack = a.filter(s => !b.includes(s));
    const manquantsFront = b.filter(s => !a.includes(s));
    if (manquantsBack.length) ecarts.push(`${etiquette} / ${clef} : ${manquantsBack.map(s => `"${s}"`).join(', ')} absent(s) du backend`);
    if (manquantsFront.length) ecarts.push(`${etiquette} / ${clef} : ${manquantsFront.map(s => `"${s}"`).join(', ')} absent(s) de constants.ts`);
  }
};

// Table clé -> chaîne : on compare les clés ET les valeurs. C'est la VALEUR qui
// comptait pour le bug du 14/08/2026 (nom de bucket mal formé côté backend).
const comparerTablesTexte = (etiquette, front, back) => {
  const clefs = [...new Set([...front.keys(), ...back.keys()])].sort();
  for (const clef of clefs) {
    const a = front.get(clef);
    const b = back.get(clef);
    if (a === undefined) { ecarts.push(`${etiquette} : "${clef}" existe côté backend mais PAS dans constants.ts`); continue; }
    if (b === undefined) { ecarts.push(`${etiquette} : "${clef}" existe dans constants.ts mais PAS côté backend`); continue; }
    if (a !== b) ecarts.push(`${etiquette} / ${clef} : "${a}" (constants.ts) ≠ "${b}" (backend)`);
  }
};

const comparerListes = (etiquette, front, back) => {
  const manquantsBack = front.filter(s => !back.includes(s));
  const manquantsFront = back.filter(s => !front.includes(s));
  if (manquantsBack.length) ecarts.push(`${etiquette} : ${manquantsBack.map(s => `"${s}"`).join(', ')} absent(s) du backend`);
  if (manquantsFront.length) ecarts.push(`${etiquette} : ${manquantsFront.map(s => `"${s}"`).join(', ')} absent(s) de constants.ts`);
};

try {
  const front = readFileSync(CONSTANTS, 'utf8');
  const back = readFileSync(SITE_SCOPE, 'utf8');

  comparerTables(
    'Plaques',
    litteralObjet(front, 'PLAQUES_STRUCTURE', 'constants.ts'),
    litteralObjet(back, 'const PLAQUES', 'backend/src/auth/siteScope.ts')
  );

  // Seconde duplication du même fichier, tout aussi silencieuse : le backend décide
  // avec elle quelle enveloppe Alpine un chef de site a le droit de voir.
  //
  // ⚠️ On compare la TABLE site -> nom de bucket, et pas seulement la liste des sites.
  // Ne comparer que les sites est exactement ce qui a laissé passer le bug du
  // 14/08/2026 : le backend fabriquait le nom par concaténation et produisait
  // `Alpine-Le Puy-en-Velay` au lieu de `Alpine-Le Puy`. Les listes de sites étaient
  // identiques des deux côtés, et le contrôle passait au vert.
  comparerTablesTexte(
    'ALPINE_BUCKETS',
    litteralObjetTexte(front, 'ALPINE_BUCKETS', 'constants.ts'),
    litteralObjetTexte(back, 'const ALPINE_BUCKETS', 'backend/src/auth/siteScope.ts')
  );

  // Les sites hors plaque (Montluçon, Saint-Etienne) : `SITES` côté frontend et
  // `ALL_SITES` côté backend les ajoutent à la main aux membres des plaques.
  const horsPlaqueFront = litteralTableau(front.slice(front.indexOf('export const SITES')), 'SITES', 'constants.ts');
  const horsPlaqueBack = litteralTableau(back.slice(back.indexOf('export const ALL_SITES')), 'ALL_SITES', 'backend/src/auth/siteScope.ts');
  comparerListes('Sites hors plaque', horsPlaqueFront, horsPlaqueBack);
} catch (e) {
  console.error(`\n✖ check-plaques-sync : impossible de comparer les tables.\n  ${e.message}\n`);
  console.error("  Le format d'un des deux fichiers a changé. Corrige ce script plutôt que de le contourner :");
  console.error('  sans lui, une divergence de périmètre repasse silencieuse.\n');
  process.exit(1);
}

if (ecarts.length > 0) {
  console.error('\n✖ check-plaques-sync : les tables de plaques ont DIVERGÉ.\n');
  ecarts.forEach(e => console.error(`  - ${e}`));
  console.error('\n  Fichiers à réaligner :');
  console.error('    constants.ts                        (PLAQUES_STRUCTURE, ALPINE_SITES, SITES)');
  console.error('    backend/src/auth/siteScope.ts       (PLAQUES, ALPINE_SITES, ALL_SITES)');
  console.error('\n  Conséquence si on ignore : le périmètre d\'un chef de site est faux — il voit');
  console.error('  des données hors de ses concessions, ou en manque, SANS aucune erreur visible.\n');
  process.exit(1);
}

console.log('✓ check-plaques-sync : constants.ts et backend/src/auth/siteScope.ts sont en phase.');
