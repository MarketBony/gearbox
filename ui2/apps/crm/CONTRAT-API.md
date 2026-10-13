# CRM — contrat d'API du lot 2 (12/10/2026)

Toutes les routes sont sous `/api/crm`, derrière `CRM_ROLES` (Master pendant la construction). Côté front, passer par
`db.*` de `services/dataService.ts` (méthodes `getCrm…`), jamais `fetch` direct. Dates au format `AAAA-MM-JJ`.
Aucune donnée n'est chargée en masse : la liste est paginée PAR LE SERVEUR (50 lignes).

## Types

```ts
type Source = 'VN' | 'VO' | 'BSO';                       // BSO = ancienne base Sud-Ouest (« Anc. base » à l'écran)
type Civilite = 'homme' | 'femme' | 'couple' | 'societe' | null;

interface ClientRow {
  id: number;
  type: 'particulier' | 'societe';
  civilite: Civilite;          // normalisée
  civilite_dcs: string | null; // libellé brut DCS (info-bulle)
  nom: string | null;          // particulier : nom ; société : raison sociale
  prenom: string | null;
  cp: string | null; ville: string | null;
  site: string | null;         // site de la dernière vente retenue
  sites: string[];             // tous les sites où il a acheté
  marques: string[];           // marques des véhicules achetés (RENAULT, DACIA, NISSAN, ALPINE…)
  derniere_vente: string | null;
  source_derniere: Source | null;
  vehicule: { marque: string | null; modele: string | null; immat: string | null } | null; // dernier véhicule
  nb_vehicules: number;
  vendeur: string | null;      // vendeur de la dernière vente (référent provisoire, lecture seule au lot 2)
  fin: { famille: string | null; organisme: string | null; fin: string } | null; // financement EN COURS le plus proche de son terme
  suspect: boolean;            // au moins une coordonnée suspecte
}
```

## Routes

- `GET /apercu` → `{ clients, societes, vehicules, fins_6_mois, a_arbitrer, suspects, imports: { source, id, statut, fin }[] }`
  (`imports` = dernier import de chaque source).
- `GET /clients?q=&sites=Clermont,Vichy&marques=RENAULT,DACIA&type=all|particulier|societe&vh=all|VN|VO|BSO&fam=LOA,LLD&ech=all|3|6|12&suspect=1&sort=recent|nom|fin&page=0`
  → `{ total, page, taille: 50, rows: ClientRow[] }`.
  - `q` : nom, prénom, raison sociale, ville, CP, téléphone (chiffres), e-mail, immatriculation (avec ou sans tirets/espaces),
    VIN (8 caractères ou plus). Le serveur détecte le type.
  - `ech` : financement en cours dont la fin tombe dans les N prochains mois.
- `GET /clients/:id` → fiche :
  ```ts
  {
    client: ClientRow & { num_rue: string | null; type_rue: string | null; rue: string | null };
    contacts: { type: 'portable' | 'fixe' | 'email'; valeur: string; etat: 'valide' | 'suspect'; motif: string | null; sources: Source[]; derniere_vue: string | null }[];
    vehicules: { id: number; vin: string | null; immat: string | null; marque: string | null; modele: string | null; version: string | null;
                 energie: string | null; genre: string | null; date_mec: string | null; ct_dernier: string | null; ct_prochain: string | null;
                 actuel: boolean; derniere_vente: string | null }[];
    ventes: { id: number; source: Source; type_vh: 'VN' | 'VO' | 'AUTRE'; date_commande: string | null; date_livraison: string | null;
              affaire: string | null; dossier: string | null; site: string | null; vendeurs: string[]; intermediaire: string | null;
              type_vente: string | null; montant_tarif: number | null; montant_reprise: number | null; vehicule_id: number | null;
              retenue: boolean; motif_exclusion: string | null; absente_depuis: string | null;
              fin: { organisme: string | null; famille: string | null; produit: string | null; debut: string | null; fin: string | null; duree: number | null; duree_calculee: boolean } | null;
              garantie: { code: string | null; libelle: string | null; km: number | null } | null }[];
    identites: { id: number; source: Source; societe: string; numero: string; nom: string | null; prenom: string | null;
                 cp: string | null; ville: string | null; regle: string }[];   // regle = pourquoi elle est rattachée
  }
  ```
  Client fusionné dans un autre : `{ redirect: <id> }`.
- `GET /arbitrage?offset=0` → `{ total, paires: { a: Fiche, b: Fiche, raison: string }[] }` (5 paires max ; `Fiche` = la
  réponse de `GET /clients/:id`).
- `POST /arbitrage` `{ a: id, b: id, decision: 'fusion' | 'separation' }` → `{ ok: true, client: id }` (effet immédiat ; rejoué à
  chaque import).
- `POST /clients/:id/separer` `{ identite: id }` → `{ ok: true, client: <nouvel id> }`.
- Inchangées (lot 1) : `GET /imports`, `POST /imports/:id/forcer`, `POST /sites`.

---

# Lot 3 — Requêteur (12/10/2026)

Tout reste sous `/api/crm`, derrière `CRM_ROLES`. **Le navigateur n'envoie jamais de SQL** : il envoie une `Requete` (JSON),
que le serveur traduit à partir d'une liste FERMÉE de briques (`backend/src/rcu/requete.ts`). Une brique inconnue → 400.

## Format d'une requête

```ts
type Canal = 'tous' | 'email' | 'sms' | 'phoning' | 'courrier';
interface Requete {
  niveau: 'client' | 'vehicule';   // une ligne par client, ou une ligne par (client, véhicule)
  canal: Canal;                    // ajoute les garde-fous du canal CÔTÉ SERVEUR (voir plus bas)
  dedoublonnage: boolean;          // un envoi par e-mail (email), par portable (sms), par téléphone (phoning), par adresse (courrier)
  briques: Brique[];               // ET entre les briques ; OU entre les valeurs d'une même brique
}
interface Brique { id: string; type: TypeBrique; actif: boolean; sauf?: boolean; /* + paramètres ci-dessous */ }
```
`sauf: true` = la brique EXCLUT (« Sauf … »). Une brique `actif: false` est ignorée.

### Briques CLIENT (portent sur le client)
| type | paramètres | sens |
|---|---|---|
| `type_personne` | `valeurs: ('particulier'\|'societe')[]` | |
| `civilite` | `valeurs: ('homme'\|'femme'\|'couple'\|'societe')[]` | |
| `site_client` | `valeurs: string[]`, `mode: 'achat' \| 'dernier'` | a acheté sur l'un de ces sites / dernier achat sur l'un d'eux |
| `zone` | `concession: string` | domicilié dans les départements de la zone (GET `/requetes/referentiels` → `zones`) |
| `geo` | `departements?: string[]`, `cps?: string[]`, `villes?: string[]` | |
| `anciennete` | `min?: number`, `max?: number` (années depuis le 1er achat) | |
| `sans_achat_depuis` | `annees: number` | dernier achat il y a plus de N ans |
| `nb_vehicules` | `min?: number`, `max?: number` | |
| `vendeur_client` | `valeurs: string[]` | vendeur de la dernière vente |
| `flotte` | `min?: number`, `max?: number` | taille de flotte = véhicules ENCORE au parc (13/10/2026) |
| `sources` | `valeurs: ('VN'\|'VO'\|'BSO')[]` | |

### Briques VÉHICULE / ACHAT / FINANCEMENT (portent toutes sur LE MÊME véhicule acheté)
| type | paramètres |
|---|---|
| `marque` | `valeurs: string[]` (RENAULT, DACIA…) |
| `modele` | `valeurs: string[]` (contient, sans casse : « CLIO » trouve « CLIO V ») |
| `energie` | `valeurs: ('Essence'\|'Diesel'\|'Hybride'\|'Électrique'\|'GPL')[]` (déduite de la version quand DCS ne la donne pas) |
| `genre` | `valeurs: ('VP'\|'VU')[]` |
| `age_vehicule` | `min?: number`, `max?: number` (années depuis la mise en circulation) |
| `au_parc` | `valeur: boolean` (le client en est le dernier acheteur connu) |
| `ct` | `dans_min_mois?: number`, `dans_max_mois?: number` (prochain contrôle technique) |
| `achat_type` | `valeurs: ('VN'\|'VO'\|'BSO')[]` |
| `livraison` | `de?: 'AAAA-MM-JJ'`, `a?: …`, `il_y_a_min_mois?: number`, `il_y_a_max_mois?: number` |
| `anniversaire` | `annees: number`, `fenetre_jours: number` (livré il y a N ans, à ± fenêtre) |
| `type_vente` | `valeurs: string[]` |
| `montant` | `min?: number`, `max?: number` (montant tarif TTC) |
| `reprise` | `valeur: boolean` |
| `site_achat` | `valeurs: string[]` |
| `vendeur_achat` | `valeurs: string[]` |
| `agent` | `mode: 'sans' \| 'tous' \| 'liste'`, `valeurs?: string[]` (intermédiaire R2) |
| `fin_organisme` | `valeurs: ('DIAC'\|'Autre banque'\|'Aucun')[]` |
| `fin_famille` | `valeurs: string[]` (LOA, LLD, Crédit, Crédit-bail, Crédit ballon…) |
| `fin_echeance` | `dans_min_mois?: number`, `dans_max_mois?: number`, `de?`, `a?` |
| `fin_duree` | `min?: number`, `max?: number` (mois) |
| `fin_ecoule` | `min?: number`, `max?: number` (% du contrat écoulé) |
| `garantie` | `valeur: boolean` |

### Briques COORDONNÉES
`a_email` · `a_portable` · `a_telephone` (portable ou fixe) · `a_adresse` · `a_portable_ou_email` — sans paramètre.
Une coordonnée SUSPECTE ne compte jamais comme valide.

### Garde-fous du canal (appliqués PAR LE SERVEUR, quoi qu'envoie le navigateur)
email → e-mail valide · sms → portable valide · phoning → portable ou fixe · courrier → adresse complète. Les identités
génériques ne sont jamais des clients.

## Routes
- `GET /requetes/referentiels` → `{ zones: { concession, departements: string[] }[], agents: string[], vendeurs: string[],
  marques: string[], familles: string[], types_vente: string[], sites: string[], colonnes: Colonne[] }`
  (`Colonne = { cle, libelle, groupe }` : colonnes exportables).
- `POST /requetes/compter` `{ requete }` → `{ clients, vehicules, lignes, entonnoir: { total, email, portable, telephone,
  adresse }, avant_canal: number, doublons_retires: number, par_site: {cle,n}[], par_marque: {cle,n}[],
  par_mois_echeance: {cle:'AAAA-MM',n}[], par_energie: {cle,n}[], ms: number }`.
  `avant_canal` = clients avant garde-fous du canal (l'écart = ceux sans coordonnée valide pour ce canal).
- `POST /requetes/apercu` `{ requete }` → `{ lignes: Ligne[] }` (20 lignes). `Ligne` = objet `{ client_id, <cle de colonne>: valeur, … }`
  avec les colonnes « par défaut ».
- `POST /requetes/export` `{ requete, colonnes: string[], format: 'excel'|'sarbacane'|'allmysms'|'phoning'|'courrier',
  fichier: string, requete_id?: number, requete_nom?: string }` → `{ export_id, colonnes: Colonne[], lignes: Ligne[] }`
  (100 000 lignes au plus). Le navigateur fabrique le fichier. CHAQUE appel est inscrit au journal.
- `POST /requetes/lignes` `{ requete, page, tri? }` → `{ page, taille: 50, tri, colonnes, lignes }` — vue « Voir les clients » ;
  `tri` ∈ recent | flotte | echeance | nom.
- `GET /exports` → `{ id, cree_le, auteur, format, fichier, requete_nom, nb_lignes }[]` (200 derniers).
- `GET /requetes` → requêtes enregistrées (les miennes + les partagées) :
  `{ id, nom, requete, partagee, auteur, auteur_id, cree_le, maj_le, dernier_compte, dernier_lancement }[]`.
- `POST /requetes` `{ nom, requete, partagee }` → `{ id }` · `PUT /requetes/:id` (même corps, auteur seulement) ·
  `DELETE /requetes/:id` (auteur seulement).
