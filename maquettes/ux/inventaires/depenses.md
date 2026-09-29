# Inventaire fonctionnel — Dépenses (dépenses fixes / ponctuelles)

Sources : `pages/FixedExpenses.tsx` (876 lignes), `constants.ts`, `types.ts:287` (`FixedExpense`), `App.tsx`, `components/Sidebar.tsx`,
`backend/src/routes/fixedExpenses.ts`, `services/dataService.ts:385`. Composants importés : `components/Select.tsx`, `components/DatePicker.tsx`.
Titre affiché « Dépenses » ; libellé du menu « Dépenses » (icône Euro).

## 1. Accès et rôles

- [ ] Rubrique `fixed-expenses` (`App.tsx:158`). Menu : liste principale `Sidebar.tsx:221`, groupe « OUTILS » `Sidebar.tsx:347`.
- [ ] **Voient** : tous les rôles authentifiés sauf `External` (`EXTERNAL_ALLOWED_TABS`, `App.tsx:80, 87`) et sauf **`Site Manager`** : la rubrique n'est pas dans `SITE_MANAGER_SECTIONS` (`constants.ts:720`) → retirée du menu et redirigée vers `dashboard` par `App.tsx:100`.
- [ ] **Écriture** : `canEdit` = `Master`, `Administrator`, `Director`, `Coordinator`, `Digital Manager` (`FixedExpenses.tsx:15`), liste identique à `EDIT_ROLES` de `backend/src/routes/fixedExpenses.ts:10` (POST, PUT, DELETE). `Guest` : lecture seule (par absence).
- [ ] Lecture seule : le bouton « NOUVELLE DÉPENSE » et les boutons modifier/supprimer sont **absents** (pas grisés) ; `openModal` sort tôt si `!canEdit` (l.118). Le tableau, les filtres et le total restent utilisables.
- [ ] **Serveur** : `GET /api/fixed-expenses` est ouvert à tout compte authentifié (pas de `requireRole`), filtré par `scopeOf(req)` + `arrayScopeWhere('sites', scope)` et contenu redacté par `redactSiteFields` (`fixedExpenses.ts:70-80`). Un chef de site n'ouvre pas la rubrique mais ses dépenses alimentent sa page Budget (leur `sites[]`/`budgetDistribution` ne montrent que ses concessions).
- [ ] Données fabriquées côté client : à la lecture (`getFixedExpenses`), `migrateFixedExpensesIfNeeded` (`dataService.ts:399`) repousse vers l'API d'anciennes dépenses stockées en `localStorage` (clé `gearbox_migrated_fixed_expenses`) si l'API est vide, le drapeau absent et l'utilisateur stocké est admin. `normalizeFixedExpense` (`dataService.ts:110`) normalise la réponse.

## 2. Structure

- [ ] Une seule vue : liste (tableau sur desktop, cartes sur mobile) + fenêtre modale de création/édition.
- [ ] En-tête : titre « Dépenses » (icône Euro), pastille « Total Période » (libellé masqué < sm) et bouton « NOUVELLE DÉPENSE » (libellé masqué < sm, icône Plus) si `canEdit`.
- [ ] Barre de recherche + filtres sous l'en-tête.
- [ ] Modale (`isModalOpen`, état local **non persistant**) : « Nouvelle dépense fixe » ou « Modifier la dépense » ; fermeture par la croix, « ANNULER » ou après enregistrement. La modale couvre la page (`absolute inset-0`, fond noir 80 %).
- [ ] État persistant en `sessionStorage` : `fixedexpenses_searchTerm`, `fixedexpenses_filterSite`, `fixedexpenses_filterService`, `fixedexpenses_filterStartDate`, `fixedexpenses_filterEndDate`, `fixedexpenses_sortField`, `fixedexpenses_sortOrder`. Défilement : `useScrollRestore('fixedexpenses')`.
- [ ] État local non persistant : `budgetDistMode` (`'%'`/`'€'`, défaut `'%'`, bascule d'affichage dans la modale, remis à `'%'` au rechargement), `showSiteDropdown`.

## 3. Filtres et sélecteurs

- [ ] **Recherche** (champ « Rechercher... ») — texte libre, clé `fixedexpenses_searchTerm`, défaut vide. Règle : sous-chaîne, insensible à la casse, sur `comment`, `site` **ou** `service` (l.220).
- [ ] **Site** — **simple** (`Select`), défaut `All`. Options : `All` « TOUS SITES », `GROUPE BONY`, puis tous les sites de `PLAQUES_STRUCTURE` (dans l'ordre CENTRE, NORD, SUD, SUD-OUEST, soit 4+5+4+9 = 22 sites, sans en-tête de plaque). Règle : **égalité exacte** `e.site === filterSite` (l.225) sur le libellé stocké (voir §11).
- [ ] **Service** — **simple**, défaut `All`. Options : `All` « TOUS SERVICES », puis `SERVICES` = `VN`, `VO`, `APV`, `PR`, `Tous Services` (`constants.ts:25`). Règle : `e.service === filterService`.
- [ ] **Du / Au** — deux `DatePicker` (taille sm), défaut vide (clés `fixedexpenses_filterStartDate` / `EndDate`). Règle : `new Date(e.date) >= new Date(début)` et `<= new Date(fin)` (bornes incluses ; comparaison de dates complètes).
- [ ] Les quatre filtres se cumulent (ET). Aucun bouton « Réinitialiser » ni compteur de filtres actifs.
- [ ] Aucun filtre par marque, PRO+, ni « annuelle / ponctuelle ».

## 4. Affichage

- [ ] **Total Période** = somme des `amount` des dépenses **filtrées** (`totalAmount`, l.252), affichée `toLocaleString()` + « € ». Somme brute des montants : ne tient compte ni du routage ni de la ventilation multi-sites ni de l'étalement annuel (c'est le Budget qui agrège).
- [ ] **Tableau desktop** (dès `md`, carte `gx-card`, en-tête collant) — colonnes :
  1. **Date** (triable) : `toLocaleDateString()` ; sous la date, pastille violette « Annuelle » si `isAnnual`.
  2. **Site / Plaque** (triable sur `site`) : pastille avec le libellé `site` stocké (multi-sites = liste concaténée, tronquée à 200 px, `title` = libellé complet). Pas de plaque réellement affichée malgré l'intitulé.
  3. **Service** (triable) : pastille colorée `SERVICE_COLORS[service]`.
  4. **Commentaire** (triable) : badge « PRO+ » (dégradé Bony) devant le texte si `proPlus`.
  5. **Montant (€)** (triable, aligné à droite) : `amount.toLocaleString()` + « € ».
  6. **Actions** (non triable) : icônes crayon (bleu) et corbeille (rouge), **visibles au survol** de la ligne (`opacity-0 group-hover:opacity-100`), seulement si `canEdit`.
- [ ] Tri par défaut : `date`, décroissant (`fixedexpenses_sortField='date'`, `sortOrder='desc'`). Clic sur un en-tête : même champ = inverse l'ordre ; nouveau champ = **décroissant** d'abord. Flèche haut/bas sur la colonne active. Chaînes comparées en minuscules ; sinon comparaison brute (`<`, `>`).
- [ ] **Cartes mobile** (sous `md`) : date + badge « Annuelle » ; montant à droite ; `site · service` ; badge « PRO+ » à droite ; commentaire tronqué sur une ligne ; boutons crayon/corbeille (toujours visibles) si `canEdit`.
- [ ] Les marques, `alpineShare`/`nissanShare` et la ventilation ne sont **pas** affichées dans la liste (uniquement dans la modale).
- [ ] Le serveur renvoie les dépenses triées `date desc` (`fixedExpenses.ts:75`) ; le tri client reprend la main.

## 5. Formulaires

Modale unique (création et édition). État `currentExpense: Partial<FixedExpense>`.

- [ ] **Valeurs par défaut à la création** (l.126) : `date` = aujourd'hui (`YYYY-MM-DD`), `service` = `VN`, `site` = `Clermont`, `sites` = `['Clermont']`, `budgetDistribution` = `{ Clermont: 100 }`, `amount` = 0, `comment` = `''`, `brand` = indéfini, `brands` = `[]`. `isAnnual`, `proPlus`, `alpineShare`, `nissanShare` absents (= faux / vide). En édition : copie de la dépense, `brands` repris de `brand` (legacy) si absent.
- [ ] **Date** (`DatePicker`, taille md) — obligatoire. Grisée et non cliquable (`opacity-50 pointer-events-none`) quand la dépense est annuelle ; message « Réparti sur toute l'année {année de la date} (montant total ci-contre). » sous le champ.
- [ ] **Nature** (sélecteur à deux boutons à droite du libellé Date) — booléen `isAnnual` : « Ponctuelle » (défaut ; infobulle « Montant imputé sur le seul mois de la date choisie. ») / « Annuelle » (infobulle « Montant total réparti sur les 12 mois de l'année (calcul au Budget uniquement). »).
- [ ] **Montant** (nombre, placeholder `0.00`) — obligatoire ; `Number(valeur)`. Validation : défini et non `NaN` (0 autorisé). Négatifs acceptés.
- [ ] **Site / Plaque** (liste déroulante à cases, sélection **multiple**) — obligatoire (`site` non vide). Contenu du menu :
  - « GROUPE BONY (GLOBAL) » → `updateSiteSelection('GROUPE BONY')` : `sites` = clés de `DISTRIBUTION_GROUPE_BONY`, `budgetDistribution` = copie de cette table, `site` = `GROUPE BONY`.
  - « GROUPE BONY (R/N) » → idem avec `DISTRIBUTION_GROUPE_BONY_RN`, `site` = `GROUPE BONY (R/N)`.
  - Puis, par plaque (PLAQUE CENTRE, NORD, SUD, SUD-OUEST) : cases à cocher par site.
  - Puis bloc « SITES NISSAN » : `Montluçon`, `Saint-Etienne` (codés en dur, l.616).
  - Comportement : cocher/décocher un site bascule sa présence dans `sites` ; partir d'un mode GROUPE BONY efface d'abord la sélection ; `site` = libellé (un seul site = son nom ; plusieurs = noms joints par « , » ; aucun = `''`) ; **la répartition est remise à parts égales** (100 / n) à chaque changement. Bouton du déclencheur : `site` ou « Sélectionner... ».
- [ ] **Service** (`Select`, taille md) — obligatoire, options `SERVICES` (`VN`, `VO`, `APV`, `PR`, `Tous Services`), défaut `VN`.
- [ ] **Marque(s) — routage budgétaire** — puces **multiples** = `BRANDS` (`Renault`, `Dacia`, `Alpine`, `Nissan`, `Mobilize`, `Holding`, `constants.ts:27`), couleurs `BRAND_COLORS`.
  - `Alpine` désactivée (opacité 40 %) si aucun site sélectionné ∈ `ALPINE_SITES` ; `Nissan` si aucun ∈ `NISSAN_SITES`.
  - **Holding exclusif** : le poser remplace toute autre marque (recliquer le retire) ; poser une autre marque retire Holding. `brand` (legacy) = première marque de `brands`.
  - Texte d'aide « Sélectionnez un site Alpine ou Nissan pour activer ces marques. » si aucun des deux n'est disponible.
- [ ] **Part {Alpine|Nissan} (%)** — curseur 0-100 (`alpineShare` / `nissanShare`). **Visible seulement** si (au moins une marque RDM parmi `RDM_BRANDS` = Renault, Dacia, Mobilize) ET la marque concernée est cochée (un curseur par marque, l.705-733). Valeur affichée `?? 100` (défaut 100 % = tout sur la marque). Texte d'aide « {n}% → {marque} · {100-n}% → compte RDM ». Le curseur n'est écrit en base que s'il est bougé.
- [ ] **Répartition Budgétaire** — bloc visible **seulement si plus d'un site** est sélectionné (`sites.length > 1`). Une ligne par site : nom (tronqué) + champ + montant/pourcentage équivalent. Bascule `%` / `€` (état local) :
  - mode `%` : champ numérique 0-100 (2 décimales affichées) → `budgetDistribution[site]` ; à droite le montant € équivalent (`Math.round(amount × pct / 100)`).
  - mode `€` : champ = montant arrondi ; la saisie est reconvertie en % stocké (`valeur / montant × 100`) ; désactivé si `montant ≤ 0` (message ambre « Montant = 0 € : saisie en € indisponible (utilisez le mode %). ») ; à droite le pourcentage équivalent.
  - Champs **désactivés** (`isFixed`) en mode GROUPE BONY / GROUPE BONY (R/N) (clés imposées).
  - Total : « Total: {somme arrondie}% », vert si égal à 100 exactement, rouge sinon. **Non bloquant** (on peut enregistrer avec un total ≠ 100).
- [ ] **Commentaire** — zone de texte libre, placeholder « Description de la dépense... », non obligatoire.
- [ ] **Type client** — bouton bascule « PRO+ (B2B) » (`proPlus`, infobulle « Marquer cette dépense comme PRO+ (B2B) »).
- [ ] Boutons : « ANNULER », « ENREGISTRER ».
- [ ] **Validation** (`handleSave`, l.52) : date, montant (défini, non NaN), site, service ; sinon `alert("Veuillez remplir tous les champs obligatoires (Date, Montant, Site, Service)")`. Aucune validation de la somme des parts, du signe du montant ni de la cohérence marques/sites côté client.
- [ ] **Charge utile** : l'objet complet `currentExpense` avec `brands` et `brand = brands[0]`. Côté serveur : champs obligatoires POST `date` (date valide), `service`, `site` (chaînes non vides), `amount` (nombre fini), sinon 400 ; optionnels typés (`sites`, `budgetDistribution`, `brand`, `brands`, `alpineShare`, `nissanShare`, `proPlus`, `isAnnual`, `comment`). Le POST écrit des champs nommés (défauts : `sites []`, `comment ''`, `brands []`, `proPlus false`, `isAnnual false`) ; le PUT n'écrit que les champs présents. Pas de liste blanche implicite, mais un champ inconnu du corps est ignoré sans erreur ; le client renvoie l'objet entier, `id` compris.

## 6. Actions

- [ ] **Créer** : « NOUVELLE DÉPENSE » → modale ; `db.createFixedExpense` (`POST /api/fixed-expenses`), la ligne créée est insérée en tête de liste locale.
- [ ] **Modifier** : crayon → modale ; `db.updateFixedExpense` (`PUT /api/fixed-expenses/:id`), remplacement local de la ligne.
- [ ] **Supprimer** : corbeille → `confirm('Êtes-vous sûr de vouloir supprimer cette dépense ?')` ; `db.deleteFixedExpense` (`DELETE`, 204) ; retrait local.
- [ ] Journal d'activité (`db.logActivity`) après création / modification (« a créé une dépense fixe » / « a modifié une dépense fixe ») et suppression (« a supprimé une dépense fixe »), entité `fixed-expense`, nom = commentaire, sinon site, sinon « Dépense fixe ».
- [ ] Échec d'enregistrement : `alert('Échec de la sauvegarde (serveur injoignable ou droits insuffisants ?).')` + rechargement ; **la modale reste ouverte** (saisie conservée). Échec de suppression : `alert('Échec de la suppression (serveur injoignable ou droits insuffisants ?).')`, rien n'est retiré.
- [ ] Trier (clic sur un en-tête), rechercher, filtrer.
- [ ] Pas de duplication, d'export CSV, d'archivage ni d'action en masse.
- [ ] Effet de bord : chaque écriture émet `fixed-expense:created|updated|deleted` (`fixedExpenses.ts`) → recalcul de la page Budget et du Dashboard chez tous les connectés.

## 7. Temps réel et chargement

- [ ] `useRealtimeSync(RT_EVENTS.fixedExpenses, () => loadExpenses())` (l.45) : `fixed-expense:created`, `fixed-expense:updated`, `fixed-expense:deleted` (`services/realtime.ts:56`).
- [ ] Chargement initial au montage (`loadExpenses`), sans indicateur de chargement ni squelette (le refetch est déjà « silencieux »).
- [ ] Un rechargement temps réel pendant qu'une modale est ouverte ne touche pas à `currentExpense` (mais remplace la liste).

## 8. États vides et erreurs

- [ ] Liste vide (ou filtres sans résultat) : icône loupe + « Aucune dépense fixe trouvée. » (tableau : une ligne à 6 colonnes ; mobile : bloc centré).
- [ ] Pas d'état de chargement : avant réponse, la page s'affiche comme vide (même texte, total 0 €).
- [ ] Échec de `loadExpenses` initial : non intercepté (pas de `try/catch`) ; au rechargement après échec d'enregistrement, l'erreur est absorbée (`.catch(() => {})`).
- [ ] 403 : si un rôle non éditeur forçait l'appel, il tombe dans l'`alert` d'échec (« droits insuffisants ? »).
- [ ] 404 serveur sur PUT/DELETE d'une dépense disparue : message « Dépense fixe introuvable. » (renvoyé par l'API, non affiché tel quel par l'interface).

## 9. Règles métier touchées

La page ne calcule aucun agrégat budgétaire ; elle **saisit les données que `Budget.tsx` et `Dashboard.tsx` routent**. Fonctions/constantes de `constants.ts` utilisées ou sous-jacentes :
- [ ] `HOLDING_BRAND` (l.53) — exclusivité du tag dans la modale. Une dépense Holding est trackée (visible dans la liste) mais exclue de tout budget par `isHoldingBrand` (Budget/Dashboard).
- [ ] `RDM_BRANDS` (`constants.ts:164`) — condition d'affichage des curseurs (marque RDM présente), même condition que `splitShareToBuckets`.
- [ ] `ALPINE_SITES` / `NISSAN_SITES` — disponibilité des puces Alpine / Nissan (Alpine par site : 4 concessions ; Nissan : 8 sites, une seule enveloppe globale, jamais ventilée).
- [ ] `splitShareToBuckets` / `resolveSiteAlias` / `isDestinationInScope` — appliquées **en aval** (Budget, Dashboard) : curseur vide = 100 % sur la marque ; lu seulement si RDM présent ; Alpine avant Nissan.
- [ ] `DISTRIBUTION_GROUPE_BONY`, `DISTRIBUTION_GROUPE_BONY_RN` (`constants.ts:546, 578`) — périmètre `GROUPE BONY` : ventilation pondérée légitime sur les concessions (à ne pas confondre avec le tag Holding).
- [ ] `isAnnual` : l'étalement ÷ 12 est fait **uniquement** à l'agrégation du Budget (`Budget.tsx:586`), jamais stocké dupliqué. Le montant total est saisi une seule fois.
- [ ] `proPlus` : marqueur métier B2B (change les chiffres Dashboard/Budget/Export), sans lien avec `expertMode`.
- [ ] Brouillon : sans objet (une dépense n'a pas de statut).
- [ ] Une dépense ponctuelle se saisit ici (`isAnnual = false`) ; la route `/api/expenses` (`OneOffExpense`) est dormante et n'a pas de couche client (`dataService.ts:378`).
- [ ] Cloisonnement chef de site : rubrique interdite (§1) ; ses chiffres passent par Budget.

## 10. Mobile

- [ ] Sous `md` : cartes à la place du tableau (voir §4) ; actions toujours visibles (pas de survol).
- [ ] En-tête : libellé « Total Période » masqué sous `sm`, bouton « NOUVELLE DÉPENSE » réduit à l'icône (hauteur mini 44 px).
- [ ] Filtres : barre `flex-wrap`, séparateurs verticaux masqués sous `md`, `DatePicker` de 144 px (`w-36`) puis 160 px (`md:w-40`).
- [ ] Modale : largeur max `max-w-lg` puis `md:max-w-2xl`, hauteur max 90vh avec défilement interne ; grille 2 colonnes conservée (Date/Montant, Site/Service, lignes de répartition).

## 11. Défauts et bizarreries relevés

- [ ] **Filtre Site à égalité exacte** (fiche du 29/09 de `BUGS-CONNUS.md`) : `e.site === filterSite`. Une dépense « Clermont, Vichy » ne sort pas sous « Clermont » ; « GROUPE BONY (R/N) » ne sort pas sous « GROUPE BONY ». `Montluçon`, `Saint-Etienne` et `GROUPE BONY (R/N)` sont proposés à la saisie mais absents des options du filtre.
- [ ] Colonne intitulée « Site / Plaque » : n'affiche que le libellé `site`, jamais la plaque.
- [ ] Le « Total Période » additionne les montants bruts filtrés : pas d'accord possible avec le Budget pour une dépense multi-sites ou annuelle (autre grandeur), et le libellé « Période » ne correspond qu'aux filtres Du / Au.
- [ ] Recherche sur `site`/`service`/`comment` uniquement ; pas sur le montant ni la marque.
- [ ] Le total des parts (≠ 100) n'est pas bloquant : on peut enregistrer une répartition fausse (montant perdu ou en trop dans le Budget).
- [ ] `budgetDistribution` et `sites` restent mémorisés si on décoche tous les sites (`sites = []`, `site = ''`) : l'enregistrement est bloqué par `!!currentExpense.site`.
- [ ] Au changement de sélection de sites, une répartition personnalisée est écrasée par un partage égal (sans avertissement).
- [ ] Une valeur `alpineShare`/`nissanShare` restée après retrait de la marque ou du tag RDM est renvoyée au serveur telle quelle (inoffensive : `splitShareToBuckets` l'ignore hors RDM).
- [ ] Les marques Alpine/Nissan déjà cochées ne sont pas décochées automatiquement si l'on retire le site éligible (la puce devient désactivée mais reste sélectionnée).
- [ ] Imports jamais utilisés : `SITES`, `PlaqueName`, `ActivityLog`, `Save` (à ne pas reporter).
- [ ] Format des nombres/dates : `toLocaleString()` et `toLocaleDateString()` sans locale explicite (dépend du navigateur), contrairement au Budget qui force `fr-FR`.
- [ ] Le GET n'a pas de `requireRole` : un `External` n'ouvre pas la rubrique mais la route n'exige aucun rôle (à vérifier : un éventuel garde-fou global d'`index.ts` n'a pas été lu).
