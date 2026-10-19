import crypto from 'crypto';

/**
 * Lecture des extractions DCSNETneo (TXT tabulé) — fonctions PURES, sans base ni fichier.
 *
 * Format mesuré le 12/10/2026 (RCU-CADRAGE.md § 2) : cp1252, ligne 1 = titre, ligne 2 = en-têtes,
 * dernière ligne = total (VN, VO ; absente de l'ancienne base Sud-Ouest). Les colonnes sont lues
 * PAR LEUR NOM, sans casse ni accents, jamais par leur position : une colonne ajoutée ou déplacée
 * dans le Requêteur ne casse rien. Les guillemets sont du texte (pas de CSV).
 */

export type Source = 'VN' | 'VO' | 'BSO';

/** Colonnes du tampon que remplit une ligne de fichier. */
export interface Ligne {
  ligne: number; cle: string; type_vh: string;
  affaire: string | null; site_lib: string | null; dossier: string | null;
  marque: string | null; modele: string | null; version: string | null; energie: string | null; genre: string | null;
  date_commande: string | null; date_immat: string | null; date_mec: string | null; date_livraison: string | null;
  ct_dernier: string | null; ct_prochain: string | null;
  vin: string | null; immat: string | null; type_vente: string | null; vendeur: string | null; intermediaire: string | null;
  num_client: string | null; nom_client: string | null; civilite: string | null; nom: string | null; prenom: string | null;
  num_rue: string | null; type_rue: string | null; rue: string | null; cp: string | null; ville: string | null;
  tel_dom: string | null; tel_port: string | null; email: string | null;
  fin_code_org: string | null; fin_lib_org: string | null; fin_code_prod: string | null; fin_lib_prod: string | null;
  fin_debut: string | null; fin_fin: string | null; fin_duree: number | null;
  garantie_code: string | null; garantie_libelle: string | null; garantie_km: number | null;
  montant_tarif: number | null; montant_reprise: number | null;
  compte_evenement: string | null; empreinte: string;
}

/** Ordre des colonnes du tampon (sert à l'insertion par lots). */
export const COLONNES_TAMPON: (keyof Ligne)[] = [
  'ligne', 'cle', 'type_vh', 'affaire', 'site_lib', 'dossier', 'marque', 'modele', 'version', 'energie', 'genre',
  'date_commande', 'date_immat', 'date_mec', 'date_livraison', 'ct_dernier', 'ct_prochain',
  'vin', 'immat', 'type_vente', 'vendeur', 'intermediaire', 'num_client', 'nom_client', 'civilite', 'nom', 'prenom',
  'num_rue', 'type_rue', 'rue', 'cp', 'ville', 'tel_dom', 'tel_port', 'email',
  'fin_code_org', 'fin_lib_org', 'fin_code_prod', 'fin_lib_prod', 'fin_debut', 'fin_fin', 'fin_duree',
  'garantie_code', 'garantie_libelle', 'garantie_km', 'montant_tarif', 'montant_reprise', 'compte_evenement', 'empreinte',
];

// ─── Normalisation des valeurs ───────────────────────────────────────────────────

/** Clé de comparaison d'un en-tête : minuscules, sans accents, espaces réduits. */
export const cleEntete = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

/** Texte : espaces insécables et multiples réduits ; vide → null. */
export const texte = (s: string | undefined): string | null => {
  if (s == null) return null;
  const t = s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  return t === '' ? null : t;
};

/** `jj/mm/aaaa` → `aaaa-mm-jj`. Hors 1950–2100 ou date impossible → null (le 01/01/1997 de l'ancienne
 *  base n'est pas filtré ICI : seule la fin de financement a ce seuil, voir `dateFinancement`). */
export const dateFR = (s: string | undefined): string | null => {
  const t = texte(s);
  const m = t && /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  if (!m) return null;
  const [j, mo, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (a < 1950 || a > 2100 || mo < 1 || mo > 12 || j < 1) return null;
  const d = new Date(Date.UTC(a, mo - 1, j));
  if (d.getUTCMonth() !== mo - 1) return null;
  return `${a}-${String(mo).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
};

/** Dates de financement : avant 2000, c'est une date bidon (01/01/1997 × 2 597 dans l'ancienne base). */
export const dateFinancement = (s: string | undefined): string | null => {
  const d = dateFR(s);
  return d && d >= '2000-01-01' ? d : null;
};

/** Nombre à virgule (`19900,00`, `100,00 %`) → number ; illisible → null. */
export const nombreFR = (s: string | undefined): number | null => {
  const t = texte(s);
  if (!t) return null;
  const n = Number(t.replace(/\s/g, '').replace('%', '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export const entier = (s: string | undefined): number | null => {
  const n = nombreFR(s);
  return n == null ? null : Math.round(n);
};

/** Code postal : 5 chiffres (un CP lu comme nombre perd son zéro : `3000` → `03000`). */
export const codePostal = (s: string | undefined): string | null => {
  const t = texte(s);
  if (!t) return null;
  return /^\d{4}$/.test(t) ? `0${t}` : t;
};

/** Téléphone au format `0XXXXXXXXX` ; +33 / 0033 ramenés ; autre chose (étranger, tronqué) gardé tel quel. */
export const telephone = (s: string | undefined): string | null => {
  const t = texte(s);
  if (!t) return null;
  let d = t.replace(/\D/g, '');
  if (d.startsWith('0033')) d = '0' + d.slice(4);
  else if (d.startsWith('33') && d.length === 11) d = '0' + d.slice(2);
  else if (d.length === 9 && /^[1-9]/.test(d)) d = '0' + d;
  return d.length === 10 && d.startsWith('0') ? d : t;
};

export const email = (s: string | undefined): string | null => {
  const t = texte(s);
  return t ? t.toLowerCase() : null;
};

export const majuscules = (s: string | undefined): string | null => {
  const t = texte(s);
  return t ? t.toUpperCase() : null;
};

// ─── Découpage du fichier ────────────────────────────────────────────────────────

export interface FichierLu {
  source: Source;
  titre: string;
  entetes: string[];
  lignes: string[][];          // lignes de données, sans la ligne de total
  totalAnnonce: number | null; // nombre lu sur la ligne de total (VN, VO)
  complet: boolean;            // VN / VO : ligne de total présente ; BSO : toujours vrai (pas de total)
  mode: ModeImport;
}

/**
 * Mode d'un import (19/10/2026). Les requêtes DCS du vendredi soir ne renvoient plus la base entière (15 min de calcul
 * côté DCS, l'envoi du 16/10 n'est jamais parti) mais les **30 derniers jours** (filtre DCS sur la date de livraison).
 *  - `maj` (DÉFAUT des VN / VO) : ajoute et met à jour ; ne marque RIEN « disparu » (une vente hors fenêtre n'a pas
 *    disparu) ; pas de garde-fou de volume (le volume d'une fenêtre de 30 jours varie naturellement).
 *  - `complet` : base entière — marque les ventes absentes « disparues » et garde le garde-fou de volume. Plus aucun
 *    envoi automatique de ce type ; reconnu à un titre contenant « complet » (ex. « clients VN complet »), pour un
 *    rechargement manuel. L'ancienne base Sud-Ouest (BSO) est un import unique traité comme complet (sans disparues).
 */
export type ModeImport = 'maj' | 'complet';
export const modeDuTitre = (source: Source, titre: string): ModeImport =>
  source === 'BSO' || /\bcomplet\b/.test(cleEntete(titre)) ? 'complet' : 'maj';

/** Source déduite de la ligne de titre (« clients VN », « Clients VO », « CLIENTS VNVO - BSO »). */
export function sourceDuTitre(titre: string): Source | null {
  const t = cleEntete(titre);
  if (t.includes('bso')) return 'BSO';
  if (/\bvo\b/.test(t) && !/\bvn\b/.test(t)) return 'VO';
  if (/\bvn\b/.test(t) && !/\bvo\b/.test(t)) return 'VN';
  return null;
}

/** Ligne de total : aucun code d'affaire, et des champs non vides qui ne sont QUE des nombres ou des
 *  pourcentages. Sa place varie : 1re colonne au VN (`80522 · 100,00 % · 80522`), 16e au VO (`55104`). */
const estLigneTotal = (champs: string[]): boolean => {
  const pleins = champs.map((c) => c.trim()).filter((c) => c !== '');
  return pleins.length > 0 && pleins.some((c) => /^\d+$/.test(c)) && pleins.every((c) => /^[\d\s.,]+%?$/.test(c));
};
const valeurTotal = (champs: string[]): number => Number(champs.map((c) => c.trim()).find((c) => /^\d+$/.test(c)));

/** Découpe un fichier (déjà décodé) en titre, en-têtes et lignes. Lève une erreur lisible si le fichier
 *  n'a pas la forme attendue. */
export function decouper(contenu: string): FichierLu {
  const brutes = contenu.split(/\r?\n/);
  while (brutes.length && brutes[brutes.length - 1].trim() === '') brutes.pop();
  if (brutes.length < 2) throw new Error('Fichier vide ou sans en-têtes.');
  const titre = brutes[0].trim();
  const source = sourceDuTitre(titre);
  if (!source) throw new Error(`Ligne de titre non reconnue : « ${titre.slice(0, 60)} » (attendu : clients VN, Clients VO ou CLIENTS VNVO - BSO).`);
  const entetes = brutes[1].split('\t').map((h) => h.trim());
  let lignes = brutes.slice(2).map((l) => l.split('\t'));
  let totalAnnonce: number | null = null;
  const derniere = lignes[lignes.length - 1];
  if (derniere && estLigneTotal(derniere)) {
    totalAnnonce = valeurTotal(derniere);
    lignes = lignes.slice(0, -1);
  }
  return { source, titre, entetes, lignes, totalAnnonce, complet: source === 'BSO' || totalAnnonce != null, mode: modeDuTitre(source, titre) };
}

// ─── Colonnes par source ─────────────────────────────────────────────────────────

type Lecteur = (get: (nom: string) => string | undefined) => Omit<Ligne, 'ligne' | 'cle' | 'empreinte'>;

/** Colonnes OBLIGATOIRES par source : absente → import refusé, colonne nommée. */
export const OBLIGATOIRES: Record<Source, string[]> = {
  VN: ['Compte Affaire', 'Numéro dossier', 'VIN', 'Nom client', 'Nom (propriétaire)', 'Numéro du client (propriétaire)', 'Type de vente (Lib)'],
  VO: ['Compte Affaire', 'Numéro dossier', 'VIN', 'Nom client', 'Nom (propriétaire)', 'N° compte client'],
  BSO: ['Compte Affaire', 'Nom', 'Numéro de fiche', 'Immatriculation', 'Compte évènement (Veh)', 'Origine évènement (Veh)'],
};

const proprietaire = (get: (n: string) => string | undefined) => ({
  civilite: texte(get('Civilité propriétaire (long)')),
  nom: majuscules(get('Nom (propriétaire)')),
  prenom: majuscules(get('Prénom (propriétaire)')),
  num_rue: texte(get('Numéro de rue (propriétaire)')),
  type_rue: majuscules(get('Type de rue (propriétaire)')),
  rue: majuscules(get('Nom de rue (propriétaire)')),
  cp: codePostal(get('Code postal (propriétaire)')),
  ville: majuscules(get('Ville (propriétaire)')),
  tel_dom: telephone(get('Tel dom (propriétaire)')),
  tel_port: telephone(get('Tel portable (propriétaire)')),
  email: email(get('Email (propriétaire)')),
});

const vide = {
  date_mec: null, ct_dernier: null, ct_prochain: null, date_immat: null, compte_evenement: null,
  fin_code_prod: null, garantie_code: null, garantie_libelle: null, garantie_km: null,
  montant_tarif: null, montant_reprise: null, type_vente: null, energie: null, intermediaire: null,
};

const LECTEURS: Record<Source, Lecteur> = {
  VN: (get) => ({
    ...vide,
    type_vh: 'VN',
    affaire: majuscules(get('Compte Affaire')),
    site_lib: majuscules(get('Site (Lib)')),
    dossier: texte(get('Numéro dossier')),
    marque: majuscules(get('Libellé marque')),
    modele: texte(get('Libellé gamme')),
    version: texte(get('Libellé version')),
    energie: texte(get('Libellé énergie')),
    genre: texte(get('Genre')),
    date_commande: dateFR(get('Date de commande client')),
    date_immat: dateFR(get('Date immatriculation')),
    date_livraison: dateFR(get('Date livraison client')),
    vin: majuscules(get('VIN')),
    immat: majuscules(get('Immatriculation')),
    type_vente: majuscules(get('Type de vente (Lib)')),
    vendeur: majuscules(get('Nom vendeur1')),
    intermediaire: majuscules(get('Nom intermédiaire 1')),
    num_client: texte(get('Numéro du client (propriétaire)')),
    nom_client: majuscules(get('Nom client')),
    ...proprietaire(get),
    fin_code_org: majuscules(get('Code financier')),
    fin_lib_org: majuscules(get('Libellé financier')),
    fin_lib_prod: majuscules(get('Libellé financement')),
    fin_debut: dateFinancement(get('Date début du financement')),
    fin_fin: dateFinancement(get('Date fin du financement')),
    fin_duree: entier(get('Durée du financement')),
    garantie_code: texte(get('Extension de garantie (Code)')),
    garantie_libelle: texte(get('Extension de garantie (Lib.)')),
    garantie_km: entier(get('Extension de garantie (Km)')),
    montant_tarif: nombreFR(get('Montant tarif TTC')),
    montant_reprise: nombreFR(get('Montant Reprise')),
  }),
  VO: (get) => ({
    ...vide,
    type_vh: 'VO',
    affaire: majuscules(get('Compte Affaire')),
    site_lib: majuscules(get('Site (Lib)')),
    dossier: texte(get('Numéro dossier')),
    marque: majuscules(get('Libellé marque')),
    modele: texte(get('Libellé Modèle')),
    version: texte(get('Libellé version')),
    genre: texte(get('Genre VPVU')),
    date_commande: dateFR(get('Date commande client')),
    date_mec: dateFR(get('Date 1ère mise en circulation')),
    date_livraison: dateFR(get('Date de livraison (Vente)')),
    ct_dernier: dateFR(get('Date dernier CT')),
    ct_prochain: dateFR(get('Date prochain CT')),
    vin: majuscules(get('VIN')),
    immat: majuscules(get('Immatriculation')),
    // Le VO n'a pas de type de vente : la requête filtre déjà sur les particuliers (R9).
    type_vente: majuscules(get('Libellé destinataire de vente')),
    vendeur: majuscules(get('Nom Conseiller comm. principal')),
    intermediaire: majuscules(get('Nom intermédiaire 1')),
    num_client: texte(get('N° compte client')),
    nom_client: majuscules(get('Nom client')),
    ...proprietaire(get),
    fin_code_org: majuscules(get('Code financier')),
    fin_lib_org: majuscules(get('Libellé financier')),
    fin_code_prod: majuscules(get('Code financement')),
    fin_lib_prod: majuscules(get('Libellé financement')),
    fin_debut: dateFinancement(get('Date début du financement')),
    fin_fin: dateFinancement(get('Date fin du financement')),
    fin_duree: entier(get('Durée du financement')),
  }),
  BSO: (get) => {
    const origine = cleEntete(get('Origine évènement (Veh)') ?? '');
    return {
      ...vide,
      type_vh: origine.includes('neuf') ? 'VN' : origine.includes('occasion') ? 'VO' : 'AUTRE',
      affaire: majuscules(get('Compte Affaire')),
      site_lib: null,
      dossier: null,
      marque: majuscules(get('Libellé marque (Mrq)')),
      modele: texte(get('Libellé modèle (Mod)')),
      version: null,
      genre: null,
      date_commande: null,
      date_immat: dateFR(get('Date de carte grise')),
      date_livraison: dateFR(get('Date achat (date de livraison)')),
      vin: majuscules(get('VIN')),
      immat: majuscules(get('Immatriculation')),
      vendeur: majuscules(get('Nom vendeur')),
      intermediaire: majuscules(get('Intermediaire de vente VN')),
      num_client: texte(get('Numéro de fiche')),
      nom_client: null,
      civilite: texte(get('Civilité (long) (Civ)')),
      nom: majuscules(get('Nom')),
      prenom: majuscules(get('Prénom')),
      num_rue: null,
      type_rue: null,
      rue: majuscules(get('N° et Nom de la voie')),
      cp: codePostal(get('Code postal')),
      ville: majuscules(get('Ville')),
      tel_dom: telephone(get('Téléphone domicile')),
      tel_port: telephone(get('Téléphone portable')),
      email: email(get('Email')),
      fin_code_org: null,
      fin_lib_org: majuscules(get('Organisme de financement')),
      fin_lib_prod: null,
      fin_debut: dateFinancement(get('Date de début du financement')),
      fin_fin: dateFinancement(get('Date de fin du financement')),
      fin_duree: null,
      compte_evenement: majuscules(get('Compte évènement (Veh)')),
    };
  },
};

export interface Lecture {
  lignes: Ligne[];
  sansClient: number;          // lignes sans client : écartées d'office (R3)
  colonnesManquantes: string[];
}

/** Transforme les lignes brutes en lignes du tampon. Une ligne sans client (VN : « Nom client » vide,
 *  BSO : « Nom » vide ; VO : « Nom client » vide) est comptée et écartée. */
export function lire(f: FichierLu): Lecture {
  const index = new Map<string, number>();
  f.entetes.forEach((h, i) => { const k = cleEntete(h); if (!index.has(k)) index.set(k, i); });
  const colonnesManquantes = OBLIGATOIRES[f.source].filter((c) => !index.has(cleEntete(c)));
  if (colonnesManquantes.length) return { lignes: [], sansClient: 0, colonnesManquantes };

  const lecteur = LECTEURS[f.source];
  const lignes: Ligne[] = [];
  let sansClient = 0;
  f.lignes.forEach((champs, i) => {
    const get = (nom: string) => { const j = index.get(cleEntete(nom)); return j == null ? undefined : champs[j]; };
    const v = lecteur(get);
    const aUnClient = f.source === 'BSO' ? !!v.nom : !!v.nom_client;
    if (!aUnClient) { sansClient++; return; }
    const empreinte = crypto.createHash('sha1').update(JSON.stringify(v)).digest('hex');
    // Clé de la vente : affaire|dossier (unique, mesuré) ; l'ancienne base n'a pas de dossier → empreinte.
    const cle = f.source === 'BSO' ? empreinte : `${v.affaire ?? ''}|${v.dossier ?? `L${i + 3}`}`;
    lignes.push({ ligne: i + 3, cle, empreinte, ...v });
  });
  return { lignes, sansClient, colonnesManquantes };
}
