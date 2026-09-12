/**
 * IMPORT DU PLANNING DE CONGÉS EXISTANT (correctif 55, 12/09/2026)
 * ================================================================
 *
 * Reprend le fichier Excel tenu par le boss de Théo (« Conges_marketing_2026_V2.xlsx »,
 * onglets « Planning 2026 » et « Planning 2027 ») dans les tables `CongeJour` et
 * `CongeMembre`. Les cellules ont été extraites et normalisées à part ; ce script ne lit
 * que `backend/scripts/donnees-conges-2026.json`, ce qui le rend rejouable et auditable sans
 * Excel.
 *
 * ⚠️ CE SCRIPT ÉCRIT DANS LA BASE DE PRODUCTION. Il n'y a pas de base de développement
 * sur ce projet. Il est IDEMPOTENT (upsert sur la clé `userId + date`) : le relancer
 * n'ajoute aucun doublon, il réécrit les mêmes valeurs.
 *
 * ⚠️ Il n'efface RIEN. Une cellule saisie dans Gearbox après l'import et absente du
 * fichier Excel n'est pas touchée ; une cellule présente dans les deux est écrasée par
 * la valeur du fichier.
 *
 * Trois choix, à connaître avant de relancer :
 *
 *  1. CORRESPONDANCE DES COMPTES — explicite et par nom COMPLET, jamais par préfixe :
 *     le fichier ne donne que des prénoms, et Gearbox contient « Lucie » ET
 *     « Lucien Marchetti ». Une correspondance approximative aurait importé les congés
 *     de l'une dans la ligne de l'autre. Un nom absent ou ambigu arrête le script.
 *
 *  2. ALISON ET MÉLANIE SONT ÉCARTÉES — elles ne font plus partie du marketing
 *     (décision de Théo, 12/09/2026). Leurs 44 cellules ne sont pas reprises.
 *     Au passage : les colonnes de Mélanie sont intitulées « Lucy » / « LUCY » dans les
 *     blocs juillet et août du fichier d'origine (coquille du fichier, pas de l'import).
 *
 *  3. LES JOURS CHÔMÉS SONT ÉCARTÉS — le fichier contient cinq cellules posées un
 *     samedi. Gearbox n'affiche ni ne compte les week-ends et les jours fériés : les
 *     importer créerait des lignes invisibles mais bien présentes en base.
 *
 * Usage (depuis `backend/`, qui porte le client Prisma et le .env) :
 *   node scripts/import-conges-2026.mjs            # rapport seul, n'écrit rien
 *   node scripts/import-conges-2026.mjs --ecrire   # applique
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ici = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();
const ECRIRE = process.argv.includes('--ecrire');

/**
 * Prénom du fichier Excel → nom COMPLET du compte Gearbox.
 * ⚠️ Table écrite à la main et vérifiée avec Théo. Ne pas la deviner.
 */
const COMPTES = {
  'Claire': 'Claire Richard',
  'Théo': 'Théo Labonne',
  'Alexis': 'Alexis Perz',
  'Romane': 'Romane Chambon',
  'Bastien': 'Bastien Fuziol',
  'Morgane': 'Morgane Barthe',
  'Hugo': 'Hugo Culetto',
  'Isabelle': 'Isabelle Auclair',
  'Zakaria': 'Zakaria Bounaga',
  'Lucie': 'Lucie',
  'Ludivine': 'Ludivine Roux',
  'Raphaël': 'Raphaël Fuziol',
  'Christian': 'Christian Charlier',
};

/** ⚠️ Copie de `LECTURE_ROLES` de `src/routes/conges.ts`. Le script n'importe pas le
 *  TypeScript du serveur ; si la liste y change, la changer ici aussi. */
const LECTURE_ROLES = ['Master', 'Administrator', 'Director', 'Coordinator', 'Digital Manager', 'Guest'];

const main = async () => {
  const donnees = JSON.parse(readFileSync(join(ici, 'donnees-conges-2026.json'), 'utf8'));
  const users = await prisma.user.findMany({ select: { id: true, name: true, role: true } });

  // Résolution stricte : nom complet exact, et un seul compte pour ce nom.
  const idParPrenom = new Map();
  for (const [prenom, nomComplet] of Object.entries(COMPTES)) {
    const trouves = users.filter(u => u.name === nomComplet);
    if (trouves.length !== 1) {
      throw new Error(`Compte « ${nomComplet} » : ${trouves.length} correspondance(s) — import interrompu.`);
    }
    // ⚠️ Ce script écrit DIRECTEMENT en base, il ne passe pas par POST /conges/membres :
    // le contrôle de rôle de la route ne s'applique donc pas, et il faut le refaire ici.
    // Sans lui, on créerait une ligne de planning que le rôle de la personne lui interdit
    // de lire — visible de tous, illisible par l'intéressé.
    if (!LECTURE_ROLES.includes(trouves[0].role)) {
      throw new Error(`« ${nomComplet} » a le rôle ${trouves[0].role}, qui n'a pas accès à la rubrique Congés — import interrompu.`);
    }
    idParPrenom.set(prenom, trouves[0].id);
  }

  // Le périmètre d'abord : une ligne de congé pour un non-membre serait refusée par la
  // route et invisible dans le planning.
  const membres = new Set((await prisma.congeMembre.findMany({ select: { userId: true } })).map(m => m.userId));
  const aAjouter = [...idParPrenom.values()].filter(id => !membres.has(id));

  const parPersonne = new Map();
  for (const d of donnees) parPersonne.set(d.prenom, (parPersonne.get(d.prenom) ?? 0) + (d.demi ? 0.5 : 1));

  console.log(`Fichier : ${donnees.length} cellules pour ${parPersonne.size} personnes.`);
  console.log(`Périmètre : ${membres.size} membre(s) actuellement, ${aAjouter.length} à ajouter.`);
  for (const [p, n] of [...parPersonne].sort()) {
    console.log(`  ${p.padEnd(10)} ${String(n).replace('.', ',').padStart(5)} j`);
  }

  if (!ECRIRE) {
    console.log('\n(simulation — relancer avec --ecrire pour appliquer)');
    return;
  }

  for (const id of aAjouter) {
    await prisma.congeMembre.create({ data: { userId: id, addedBy: id } });
  }

  let ecrits = 0;
  for (const d of donnees) {
    const userId = idParPrenom.get(d.prenom);
    await prisma.congeJour.upsert({
      where: { userId_date: { userId, date: d.date } },
      create: { userId, date: d.date, type: d.type, demi: d.demi, validated: d.validated, createdBy: userId },
      update: { type: d.type, demi: d.demi, validated: d.validated },
    });
    ecrits++;
  }

  const total = await prisma.congeJour.count();
  console.log(`\n${ecrits} cellule(s) écrite(s). Table CongeJour : ${total} ligne(s).`);
};

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
