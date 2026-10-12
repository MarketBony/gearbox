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
