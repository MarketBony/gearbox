#!/usr/bin/env node
// =============================================================================
// IMPORT DU CALENDRIER ÉDITORIAL (Excel -> /api/social)
//
// Écrit via la VRAIE API REST, jamais en Prisma direct ni en SQL : toutes les
// validations serveur s'appliquent, exactement comme pour l'import budgétaire du
// correctif 22 (cf. RAPPORT-IMPORT.md). Ce script-ci est COMMITÉ, contrairement à
// celui de 2026 qui a été perdu — c'est la seule trace exécutable de la façon dont
// ces lignes ont été fabriquées.
//
//   node scripts/import-edito.mjs --file "<x.xlsx>" [--api <url>] [--limit N]
//                                 [--commit] [--out <fichier.jsonl>]
//   node scripts/import-edito.mjs --rollback <fichier.jsonl> [--api <url>]
//
// ⚠️ LE MODE PAR DÉFAUT EST LE DRY-RUN : aucune écriture sans `--commit`.
// ⚠️ Le jeton vient de $GEARBOX_TOKEN, jamais d'un argument (la ligne de commande
//    atterrit dans l'historique PowerShell). Il n'est jamais journalisé.
// ⚠️ Le backend local écrit dans la base de PRODUCTION : il n'y a pas de base de dev.
// =============================================================================

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx-js-style'); // déjà présent (utilisé par pages/Export.tsx)

// -----------------------------------------------------------------------------
// Tables de référence — DUPLICATION ASSUMÉE ET JETABLE.
//
// Un `.mjs` ne peut pas importer `constants.ts`. Contrairement à PLAQUES_STRUCTURE
// recopié dans backend/src/auth/siteScope.ts, cette copie-ci n'a PAS vocation à être
// maintenue : le script ne tourne qu'une fois. NE PAS l'ajouter à
// scripts/check-plaques-sync.mjs — ce serait entretenir une copie morte.
// -----------------------------------------------------------------------------
const SITES = [
  'Clermont', 'Ussel', 'Mozac', 'Massagettes',
  'Vichy', 'Moulins', 'Thiers', 'Ambert', 'Ricoux',
  'Issoire', 'Brioude', 'Mende', 'Le Puy-en-Velay',
  'Albi', 'Rodez', 'Millau', 'Aurillac', 'Figeac', 'Gaillac', 'Villefranche', 'Carmaux', 'Lavaur',
  'Montluçon', 'Saint-Etienne',
];
const PERIMETRE_GLOBAL = 'GROUPE BONY';
const CONCESSIONS_VALIDES = new Set([...SITES, PERIMETRE_GLOBAL]);

const SOCIAL_NETWORKS = ['Instagram', 'Story Instagram', 'Facebook', 'Story Facebook', 'LinkedIn', 'GMB', 'TikTok', 'YouTube'];
const SOCIAL_SERVICES = ['VN', 'VO', 'APV', 'PR', 'Tous Services', 'RH'];
const LOI_LOM_OPTIONS = [
  'Au quotidien, prenez les transports en commun #SeDéplacerMoinsPolluer',
  'Pensez à covoiturer #SeDéplacerMoinsPolluer',
  'Pour les trajets courts privilégiez la marche ou le vélo #SeDéplacerMoinsPolluer',
  'Non nécessaire',
];

// --- Correspondances décidées par Théo (cf. plan du 02/09/2026) ---------------
const STATUTS = { 'A VENIR': 'À venir', 'VALIDÉ': 'Validé', 'VALIDE': 'Validé' };
const CIBLES = {
  'AUCUN': [],
  'INTERNET': ['Internet'],
  'COLLABORATEURS': ['Collaborateurs'],
  'LES DEUX': ['Internet', 'Collaborateurs'],
};
// ⚠️ « Groupe » -> Holding : c'est littéralement l'ancien nom du tag, renommé le
// 30/07/2026. Sans effet budgétaire — le Digital n'entre dans aucun budget.
const MARQUES = {
  'GROUPE': ['Holding'],
  'R&D': ['Renault', 'Dacia'],
  'RENAULT': ['Renault'],
  'DACIA': ['Dacia'],
  'NISSAN': ['Nissan'],
  'ALPINE': ['Alpine'],
  'MOBILIZE': ['Mobilize'],
};
// Jeton de la colonne Canal (après retrait du préfixe de marque) -> site réel.
const SITES_CANAL = {
  'AURILLAC': 'Aurillac', 'ISSOIRE': 'Issoire', 'VICHY': 'Vichy',
  'LE PUY': 'Le Puy-en-Velay', 'CLERMONT': 'Clermont', 'RODEZ': 'Rodez',
  'FIGEAC': 'Figeac', 'MOULINS': 'Moulins', 'MOZAC': 'Mozac',
  'MASSAGETTES': 'Massagettes', 'ALBI': 'Albi', 'THIERS': 'Thiers',
  'USSEL': 'Ussel', 'AMBERT': 'Ambert', 'RICOUX': 'Ricoux', 'BRIOUDE': 'Brioude',
  'MENDE': 'Mende', 'MILLAU': 'Millau', 'GAILLAC': 'Gaillac',
  'VILLEFRANCHE': 'Villefranche', 'CARMAUX': 'Carmaux', 'LAVAUR': 'Lavaur',
  'MONTLUÇON': 'Montluçon', 'SAINT-ETIENNE': 'Saint-Etienne',
  'RIOM': 'Mozac', // alias historique, cf. SITE_ALIASES dans constants.ts
};
const PREFIXES_MARQUE = ['RENAULT ', 'DACIA ', 'NISSAN ', 'ALPINE ', 'R/D ', 'R ', 'D ', 'N ', 'A '];

const FENETRE = { debut: '2026-09-01', fin: '2026-12-31' };

// -----------------------------------------------------------------------------
// Arguments
// -----------------------------------------------------------------------------
const argv = process.argv.slice(2);
const opt = (nom, defaut = null) => {
  const i = argv.indexOf(nom);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : defaut;
};
const flag = (nom) => argv.includes(nom);

// ⚠️ Le défaut DOIT être le local. Un défaut pointant la prod est un accident qui
// attend son heure.
const API = (opt('--api', 'http://localhost:3001/api')).replace(/\/$/, '');
const COMMIT = flag('--commit');
const LIMITE = opt('--limit') ? parseInt(opt('--limit'), 10) : null;
const ROLLBACK = opt('--rollback');

const TOKEN = process.env.GEARBOX_TOKEN;
if (!TOKEN) {
  console.error("\n✗ Jeton absent. Le script ne démarre pas.\n");
  console.error('  Récupère-le dans la console du navigateur, connecté :  localStorage.gearbox_token');
  console.error('  puis (PowerShell) :  $env:GEARBOX_TOKEN = "<le jeton>"');
  console.error('  Il dure 24 h. Il ne se passe JAMAIS en argument de ligne de commande.\n');
  process.exit(1);
}

const api = async (chemin, init = {}) => {
  const r = await fetch(`${API}${chemin}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...(init.headers || {}) },
  });
  if (r.status === 401 || r.status === 403) {
    const e = new Error('JETON_INVALIDE');
    e.jeton = true;
    throw e;
  }
  return r;
};

// -----------------------------------------------------------------------------
// Lecture du fichier
// -----------------------------------------------------------------------------
const norm = (v) => String(v ?? '').trim();
const maj = (v) => norm(v).toUpperCase();

/**
 * ⚠️⚠️ DATE — NE JAMAIS passer par `cellDates:true` ni par `toISOString()`.
 * Mesuré le 02/09/2026 sur ce fichier : la cellule « 01/09/26 » (série 46266) revient
 * en `2026-08-31T21:59:39.000Z` avec cellDates, et `.toISOString().slice(0,10)` donne
 * donc **2026-08-31** — les 43 posts seraient datés de la veille, silencieusement, au
 * bon format. On lit la SÉRIE brute et on la convertit sans fuseau horaire.
 */
const dateDeSerie = (v) => {
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = norm(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

const listeDe = (v) => norm(v).split(',').map((x) => x.trim()).filter(Boolean);

const normaliseReseau = (r) => {
  // Le fichier écrit « Youtube », Gearbox « YouTube ».
  const trouve = SOCIAL_NETWORKS.find((n) => n.toLowerCase() === r.toLowerCase());
  return trouve ?? r;
};

/** Un jeton de la colonne Canal -> une concession Gearbox, ou null si illisible. */
const concessionDeJeton = (jetonBrut) => {
  const j = maj(jetonBrut);
  if (!j) return null;
  if (j === 'GROUPE') return PERIMETRE_GLOBAL;
  // « FULL RENAULT », « FULL R », « FULL sauf Alpine »… = toutes les pages de la
  // marque, donc tout le réseau. La marque elle-même est déjà portée par la colonne
  // Marque : la remettre ici serait la compter deux fois.
  if (j.startsWith('FULL')) return PERIMETRE_GLOBAL;
  let reste = j;
  for (const p of PREFIXES_MARQUE) {
    if (reste.startsWith(p)) { reste = reste.slice(p.length).trim(); break; }
  }
  return SITES_CANAL[reste] ?? null;
};

const lire = (fichier) => {
  const wb = XLSX.read(fs.readFileSync(fichier), { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // range:1 -> les en-têtes sont en ligne 2. raw:true -> dates en série (voir ci-dessus).
  const brutes = XLSX.utils.sheet_to_json(ws, { range: 1, defval: '', raw: true });
  // ⚠️ Le `!ref` de la feuille va bien au-delà des données (A1:N322 sur ce fichier) et
  // deux lignes résiduelles suivent le tableau. On filtre sur « Nom », jamais sur un
  // numéro de ligne en dur — qui casserait si le fichier est réenregistré.
  return { toutes: brutes.length, lignes: brutes.filter((r) => norm(r['Nom'])) };
};

// -----------------------------------------------------------------------------
// Transformation + contrôles d'intégrité (AVANT tout accès réseau)
// -----------------------------------------------------------------------------
const transformer = (lignes) => {
  const erreurs = [];
  const residus = { fichiers: [], remarques: [], canalVide: [], statutVide: [] };

  const posts = lignes.map((r, i) => {
    const n = i + 3; // ligne réelle dans le classeur (en-têtes en 2, données dès 3)
    const titre = norm(r['Nom']);
    const ajoute = (m) => erreurs.push(`ligne ${n} « ${titre} » : ${m}`);

    // --- Statut
    const statutBrut = norm(r['Statut']);
    let status = 'À venir';
    if (statutBrut) {
      status = STATUTS[maj(statutBrut)];
      if (!status) ajoute(`statut inconnu « ${statutBrut} »`);
    } else {
      residus.statutVide.push({ n, titre });
    }

    // --- Date
    const date = dateDeSerie(r['Publication']);
    if (!date) ajoute(`date illisible « ${r['Publication']} »`);
    else if (date < FENETRE.debut || date > FENETRE.fin) ajoute(`date ${date} hors de la fenêtre ${FENETRE.debut} → ${FENETRE.fin}`);

    // --- Cibles (colonne « Sites » : Aucun / Internet / Collaborateurs / Les deux)
    const cibleBrute = norm(r['Sites']);
    const targets = CIBLES[maj(cibleBrute)];
    if (targets === undefined) ajoute(`cible inconnue « ${cibleBrute} »`);

    // --- Marques
    const marqueBrute = norm(r['Marque']);
    const brands = MARQUES[maj(marqueBrute)];
    if (brands === undefined) ajoute(`marque inconnue « ${marqueBrute} »`);

    // --- Service
    const service = norm(r['Service']);
    if (!SOCIAL_SERVICES.includes(service)) ajoute(`service inconnu « ${service} »`);

    // --- Réseaux
    const networks = listeDe(r['Réseaux']).map(normaliseReseau);
    networks.forEach((x) => { if (!SOCIAL_NETWORKS.includes(x)) ajoute(`réseau inconnu « ${x} »`); });

    // --- Concessions (colonne « Canal »)
    const jetons = listeDe(r['Canal']);
    const concessions = [];
    for (const j of jetons) {
      const c = concessionDeJeton(j);
      if (!c) { ajoute(`canal illisible « ${j} »`); continue; }
      if (!CONCESSIONS_VALIDES.has(c)) { ajoute(`concession hors référentiel « ${c} »`); continue; }
      if (!concessions.includes(c)) concessions.push(c);
    }
    if (jetons.length === 0) {
      // ⚠️ Sans concession, `arrayScopeWhere` utilise `hasSome` : ce post serait
      // INVISIBLE de tous les chefs de site. On retombe sur le périmètre global.
      concessions.push(PERIMETRE_GLOBAL);
      residus.canalVide.push({ n, titre });
    }

    // --- Médias : uniquement les URLs. Les noms de fichiers ne sont PAS inventés.
    const media = norm(r['Photo & Vidéo']);
    const mediaFiles = [];
    if (media) {
      if (/^https?:\/\//i.test(media)) mediaFiles.push(media);
      else residus.fichiers.push({ n, titre, media });
    }

    // --- Loi LOM
    const lom = norm(r['Loi LOM']);
    if (lom && !LOI_LOM_OPTIONS.includes(lom)) ajoute(`mention Loi LOM non reconnue « ${lom.slice(0, 40)}… »`);

    // --- Remarque : aucun champ d'accueil, va au rapport
    const remarque = norm(r['Remarque']);
    if (remarque) residus.remarques.push({ n, titre, remarque });

    // ⚠️ Exactement les 14 champs du modèle, ni plus ni moins : un champ inconnu fait
    // planter Prisma en 500, et un String non nul omis fait échouer le create.
    return {
      __ligne: n,
      payload: {
        title: titre,
        status,
        date: date ?? '',
        targets: targets ?? [],
        brands: brands ?? [],
        service,
        networks,
        concessions,
        mediaFiles,
        link: norm(r['Lien internet']),
        wording: norm(r['Wording']),
        lom,
        co2: norm(r['Graphe CO²']),
        archived: false,
      },
    };
  });

  return { posts, erreurs, residus };
};

// -----------------------------------------------------------------------------
// Rapport
// -----------------------------------------------------------------------------
const compter = (xs) => xs.reduce((m, x) => (m[x] = (m[x] || 0) + 1, m), {});
const tri = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);

const rapport = (posts, residus, collisions, existants) => {
  const P = posts.map((p) => p.payload);
  const L = [];
  L.push('# RAPPORT D\'IMPORT — CALENDRIER ÉDITORIAL');
  L.push('');
  L.push(`Mode : **${COMMIT ? 'COMMIT (écriture réelle)' : 'DRY-RUN (aucune écriture)'}**  ·  API : ${API}`);
  L.push(`Posts à importer : **${P.length}**${LIMITE ? ` (limité à ${LIMITE})` : ''}  ·  Déjà en base sur la fenêtre : ${existants}`);
  L.push('');

  L.push('## ⚠️ Contrôle de date à relire EN PREMIER');
  const d = P.map((p) => p.date).sort();
  L.push('');
  L.push(`Première date : **${d[0]}**  ·  dernière : **${d[d.length - 1]}**`);
  L.push(`Première ligne du fichier (« ${P[0].title} ») : **${P[0].date}**`);
  L.push('');
  L.push(P[0].date === '2026-09-01'
    ? '✓ La première ligne est bien au **1ᵉʳ septembre**. Pas de décalage d\'un jour.'
    : `✗ **ANOMALIE** : la première ligne devrait être au 2026-09-01, elle est au ${P[0].date}. Décalage de fuseau probable — NE PAS IMPORTER.`);
  L.push('');

  L.push('## Répartition');
  L.push('');
  L.push(`| Axe | Valeurs |`);
  L.push(`|---|---|`);
  L.push(`| Statut | ${tri(compter(P.map((p) => p.status))).map(([k, v]) => `${k} ${v}`).join(' · ')} |`);
  L.push(`| Service | ${tri(compter(P.map((p) => p.service))).map(([k, v]) => `${k} ${v}`).join(' · ')} |`);
  L.push(`| Marques | ${tri(compter(P.flatMap((p) => p.brands))).map(([k, v]) => `${k} ${v}`).join(' · ')} |`);
  L.push(`| Cibles | ${tri(compter(P.flatMap((p) => p.targets))).map(([k, v]) => `${k} ${v}`).join(' · ')} |`);
  L.push(`| Réseaux | ${tri(compter(P.flatMap((p) => p.networks))).map(([k, v]) => `${k} ${v}`).join(' · ')} |`);
  L.push(`| Concessions | ${tri(compter(P.flatMap((p) => p.concessions))).map(([k, v]) => `${k} ${v}`).join(' · ')} |`);
  L.push(`| Mois | ${tri(compter(P.map((p) => p.date.slice(0, 7)))).sort().map(([k, v]) => `${k} ${v}`).join(' · ')} |`);
  L.push('');
  L.push(`Renseignés : ${P.filter((p) => p.wording).length} wording · ${P.filter((p) => p.lom).length} Loi LOM · ${P.filter((p) => p.link).length} lien internet · ${P.filter((p) => p.mediaFiles.length).length} lien média · ${P.filter((p) => p.co2).length} classe CO²`);
  L.push('');

  if (residus.fichiers.length) {
    L.push('## 📎 À RATTACHER À LA MAIN — noms de fichiers sans fichier');
    L.push('');
    L.push('Ces cellules « Photo & Vidéo » désignent un fichier qui n\'est pas dans le classeur.');
    L.push('Rien n\'est inventé en base : à déposer toi-même dans la modale Médias du post.');
    L.push('');
    L.push('| Ligne | Publication | Fichier attendu |');
    L.push('|---|---|---|');
    residus.fichiers.forEach((f) => L.push(`| ${f.n} | ${f.titre} | \`${f.media}\` |`));
    L.push('');
  }
  if (residus.remarques.length) {
    L.push('## 🗒️ Remarques NON importées (aucun champ d\'accueil dans le modèle)');
    L.push('');
    L.push('| Ligne | Publication | Remarque |');
    L.push('|---|---|---|');
    residus.remarques.forEach((r) => L.push(`| ${r.n} | ${r.titre} | ${r.remarque} |`));
    L.push('');
  }
  if (residus.canalVide.length || residus.statutVide.length) {
    L.push('## ℹ️ Valeurs déduites (colonne vide dans le fichier)');
    L.push('');
    residus.statutVide.forEach((r) => L.push(`- ligne ${r.n} « ${r.titre} » : statut vide → **À venir**`));
    residus.canalVide.forEach((r) => L.push(`- ligne ${r.n} « ${r.titre} » : canal vide → concession **GROUPE BONY** (sinon le post serait invisible de tous les chefs de site)`));
    L.push('');
  }

  if (collisions.length) {
    L.push('## ✗ COLLISIONS — l\'import est REFUSÉ EN BLOC');
    L.push('');
    collisions.forEach((c) => L.push(`- « ${c.title} » au ${c.date} existe déjà en base`));
    L.push('');
  }

  L.push('## Détail des publications');
  L.push('');
  L.push('| # | Date | Publication | Statut | Serv. | Marques | Concessions | Réseaux | Cibles | Média |');
  L.push('|---|---|---|---|---|---|---|---|---|---|');
  posts.forEach((p, i) => {
    const x = p.payload;
    L.push(`| ${i + 1} | ${x.date} | ${x.title} | ${x.status} | ${x.service} | ${x.brands.join('+')} | ${x.concessions.join(', ')} | ${x.networks.join(', ')} | ${x.targets.join('+') || '—'} | ${x.mediaFiles.length ? '🔗' : ''} |`);
  });
  L.push('');
  return L.join('\n');
};

// -----------------------------------------------------------------------------
// Rollback
// -----------------------------------------------------------------------------
const demander = (question) =>
  new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (a) => { rl.close(); res(a); });
  });

const rollback = async (fichier) => {
  if (!fs.existsSync(fichier)) { console.error(`✗ Fichier introuvable : ${fichier}`); process.exit(1); }
  const lignes = fs.readFileSync(fichier, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  console.log(`\n${lignes.length} publication(s) à SUPPRIMER de ${API} :\n`);
  lignes.forEach((l) => console.log(`  · ${l.date}  ${l.title}`));
  if (!process.stdin.isTTY) {
    console.error('\n✗ Confirmation impossible : stdin n\'est pas un terminal. Relance depuis un vrai terminal.\n');
    process.exit(1);
  }
  const rep = await demander('\nTape SUPPRIMER en toutes lettres pour confirmer : ');
  if (rep.trim() !== 'SUPPRIMER') { console.log('Annulé, rien n\'a été supprimé.'); process.exit(0); }
  let ok = 0;
  for (const l of lignes) {
    const r = await api(`/social/${l.id}`, { method: 'DELETE' });
    if (r.status === 204 || r.status === 404) ok++;
    else console.error(`  ✗ ${l.title} → HTTP ${r.status}`);
  }
  console.log(`\n✓ ${ok}/${lignes.length} supprimée(s).\n`);
};

// -----------------------------------------------------------------------------
// Programme principal
// -----------------------------------------------------------------------------
const main = async () => {
  if (ROLLBACK) return rollback(ROLLBACK);

  const fichier = opt('--file');
  if (!fichier) { console.error('✗ --file <chemin du .xlsx> est obligatoire.'); process.exit(1); }
  if (!fs.existsSync(fichier)) { console.error(`✗ Fichier introuvable : ${fichier}`); process.exit(1); }

  const { toutes, lignes } = lire(fichier);
  console.error(`[lecture] ${lignes.length} ligne(s) retenue(s) sur ${toutes} (filtre : « Nom » non vide)`);

  const { posts, erreurs, residus } = transformer(lignes);
  if (erreurs.length) {
    console.error(`\n✗ ${erreurs.length} anomalie(s) — RIEN n'a été envoyé :\n`);
    erreurs.forEach((e) => console.error('  · ' + e));
    console.error('\nCorrige le fichier source ou les tables de correspondance, puis relance.\n');
    process.exit(1);
  }

  // Anti-doublon sur la paire title+date. ⚠️ JAMAIS sur le titre seul : le fichier
  // contient « DACIA CAMP AURILLAC » deux fois, à deux dates différentes.
  const r = await api('/social');
  if (!r.ok) { console.error(`✗ GET /social → HTTP ${r.status}`); process.exit(1); }
  const enBase = await r.json();
  const surFenetre = enBase.filter((p) => {
    const d = String(p.date).slice(0, 10);
    return d >= FENETRE.debut && d <= FENETRE.fin;
  });
  const cle = (t, d) => `${norm(t).toLowerCase()}@${d}`;
  const dejaLa = new Set(surFenetre.map((p) => cle(p.title, String(p.date).slice(0, 10))));
  const collisions = posts.map((p) => p.payload).filter((x) => dejaLa.has(cle(x.title, x.date)));

  const aTraiter = LIMITE ? posts.slice(0, LIMITE) : posts;
  process.stdout.write(rapport(aTraiter, residus, collisions, surFenetre.length) + '\n');

  if (collisions.length) {
    console.error(`\n✗ ${collisions.length} collision(s) : import REFUSÉ EN BLOC. Un import partiel est pire.\n`);
    process.exit(1);
  }
  if (!COMMIT) {
    console.error('\n— DRY-RUN — aucune écriture. Relance avec --commit quand le rapport est validé.\n');
    return;
  }

  const sortie = opt('--out', path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Downloads',
    `import-edito-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`));
  fs.mkdirSync(path.dirname(sortie), { recursive: true });
  console.error(`\n[commit] ${aTraiter.length} publication(s) → ${API}`);
  console.error(`[commit] ids écrits au fil de l'eau dans ${sortie}\n`);

  let n = 0;
  for (const p of aTraiter) {
    let res;
    try {
      res = await api('/social', { method: 'POST', body: JSON.stringify(p.payload) });
    } catch (e) {
      if (e.jeton) {
        console.error(`\n✗ JETON EXPIRÉ après ${n} création(s). Les ids sont dans ${sortie}.`);
        console.error(`  Régénère $GEARBOX_TOKEN, puis relance en sautant les ${n} premières.\n`);
        process.exit(1);
      }
      throw e;
    }
    if (!res.ok) {
      let corps = ''; try { corps = JSON.stringify(await res.json()); } catch {}
      console.error(`\n✗ Échec sur « ${p.payload.title} » (ligne ${p.__ligne}) → HTTP ${res.status} ${corps}`);
      console.error(`  ${n} création(s) faite(s), ids dans ${sortie}. Arrêt immédiat.\n`);
      process.exit(1);
    }
    const cree = await res.json();
    // Écriture ligne par ligne, PAS un JSON.stringify final : si le script meurt au
    // 30ᵉ post, on doit garder de quoi annuler les 29 premiers.
    fs.appendFileSync(sortie, JSON.stringify({ id: cree.id, title: cree.title, date: String(cree.date).slice(0, 10) }) + '\n');
    n++;
    console.error(`  ✓ ${String(n).padStart(2)}/${aTraiter.length}  ${p.payload.date}  ${p.payload.title}`);
    // 43 POST = 43 emitEvent('social:updated') = autant de rechargements chez chaque
    // client connecté. On espace, et on importe hors heures de bureau.
    await new Promise((r) => setTimeout(r, 300));
  }
  console.error(`\n✓ ${n} publication(s) créée(s).`);
  console.error(`  Pour tout annuler :  node scripts/import-edito.mjs --rollback "${sortie}"\n`);
};

main().catch((e) => {
  if (e && e.jeton) { console.error('\n✗ Jeton invalide ou expiré (401/403). Régénère $GEARBOX_TOKEN.\n'); process.exit(1); }
  console.error('\n✗ ' + (e && e.stack ? e.stack : e) + '\n');
  process.exit(1);
});
