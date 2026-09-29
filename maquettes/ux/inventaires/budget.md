# Inventaire fonctionnel — Budget (« Budget & Prévisionnel »)

Sources : `pages/Budget.tsx` (1127 lignes), `constants.ts`, `App.tsx`, `components/Sidebar.tsx`, `backend/src/routes/budget.ts`,
`backend/src/auth/siteScope.ts`. Composants importés : `components/Select.tsx`, `components/FloatingPanel.tsx`, `recharts`.
Sous-composants internes à la page : `BudgetSitePicker` (l.36), `BudgetBrandPicker` (l.140), `BudgetServicePicker` (l.174).

## 1. Accès et rôles

- [ ] Rubrique `budget` (`App.tsx:157`). Entrée de menu « Budget » (icône PiggyBank) : liste principale `Sidebar.tsx:220`, groupe « OUTILS » `Sidebar.tsx:346`.
- [ ] **Voient** : tous les rôles authentifiés sauf `External` (`EXTERNAL_ALLOWED_TABS = digital, chat, hello-marketing, settings`, `App.tsx:80`, `App.tsx:87`). Aucune garde de rôle propre à `budget` dans `App.tsx`.
- [ ] **Chef de site (`Site Manager`)** : `budget` figure dans `SITE_MANAGER_SECTIONS` (`constants.ts:720`) → rubrique visible, lecture seule.
- [ ] **Écriture (Provisions)** : `canEditProvisions` = `Master`, `Administrator`, `Director` (`Budget.tsx:209`). Aligné sur `EDIT_ROLES` de `backend/src/routes/budget.ts:8` (POST, PUT, DELETE). Coordinator, Digital Manager, Guest, Site Manager : lecture seule (par absence).
- [ ] Lecture seule : badge rouge « Lecture Seule » (icône Lock) dans l'en-tête de l'onglet Provisions (l.708) ; les 48 champs mensuels sont `disabled` et grisés (l.801-805) ; `updateBudgetEntry` sort tôt si `!canEditProvisions` (l.335).
- [ ] **Cloisonnement serveur** :
  - `GET /api/budget` → `budgetScopeOf(req)` + `stringScopeWhere('site', scope)` (`budget.ts:19-25`). Le chef de site reçoit ses concessions (`expandScope`) ET les buckets Alpine de ses sites (`expandBudgetScope`, `siteScope.ts:95`), **jamais** l'enveloppe globale `Nissan` (décision Théo).
  - Les projets (`db.getProjects`) et dépenses fixes (`db.getFixedExpenses`) que la page charge sont filtrés par leurs routes (`scopeOf` + `redactSiteFields`, cf. `routes/fixedExpenses.ts:70-80`). Le chef de site ne voit donc que sa part d'une répartition multi-sites.
- [ ] **Données fabriquées par le client** : la « migration silencieuse des buckets » de `loadData` (l.261-305) recrée les lignes `Alpine-*` + `Nissan` manquantes (montants à 0) et retire le bucket générique `Alpine`. Pour un rôle cloisonné (`allowedSitesFor(user) !== null`, l.212, l.271) la liste des buckets à recréer est **vide**. L'écriture en base (upsert + suppression du générique) n'a lieu que si `canEditProvisions && !silent` (l.294) ; sinon fusion **en mémoire seulement**.
- [ ] Le sélecteur de périmètre n'est **pas** borné à `perimetreImpose` (voir §11).

## 2. Structure

- [ ] Deux onglets, boutons en majuscules dans une pastille en haut à droite : **« Suivi Réalisé »** (défaut) et **« Provisions »** (l.1018-1029). Clé `useSessionState` `budget_activeTab` (type `'Provisions' | 'Suivi'`, défaut `'Suivi'`, l.196). L'ordre visuel est Suivi Réalisé puis Provisions.
- [ ] En-tête : titre « Budget & Prévisionnel », sous-titre « PILOTAGE FINANCIER PAR CONCESSION » (l.1007-1008). Indicateur « SAUVEGARDE AUTO... » (icône Save, pulsant) tant que `saving` (l.1011).
- [ ] Barre de filtres **commune** aux deux onglets (l.1034-1117), repliable sur mobile (clé `budget_showFilters`, défaut `false`).
- [ ] Onglet Provisions : bandeau récapitulatif + sections par plaque, chaque site est une carte dépliable. Dépliage persistant : clé `budget_expandedSites` (`string[]` de noms de lignes, défaut `[]`, l.204).
- [ ] Onglet Suivi : 4 KPI, graphique « Évolution Mensuelle » (gauche, 1/3), tableau « Répartition & Performance par Site » (droite).
- [ ] Défilement restauré via `useScrollRestore('budget', !loading)` (l.240) ; la ref n'est posée que sur le conteneur de l'onglet Provisions (l.701).

## 3. Filtres et sélecteurs

Tous persistés en `sessionStorage` via `useSessionState` (clés `budget_*`). Compteur `activeFilterCount` = nb sites + nb marques + nb services + 1 si année ≠ année courante + 1 si période ≠ Jan→Déc + 1 si PRO+ ≠ « all » (l.224). Bouton « Réinitialiser » (visible si compteur > 0) remet tout à la valeur par défaut (l.230).

- [ ] **Périmètre** (`BudgetSitePicker`, l.36) — **MULTIPLE**. Clé `budget_filterSites`, défaut `[]` = « Tout le réseau ».
  - Déclencheur : « Tout le réseau » ou 2 pastilles supprimables (×) + « +N ».
  - Panneau flottant (`FloatingPanel`, largeur 256, hauteur max 340) : champ « Rechercher un site… » ; boutons « Tout le réseau » (vide la sélection) et « Tout sélectionner » (tous les sites de plaques + `Nissan`, l.54).
  - Options : les 4 plaques de `PLAQUES_STRUCTURE` (repliables, toutes dépliées au départ ; case de plaque = tout/rien, état partiel) avec leurs sites : PLAQUE CENTRE (Clermont, Ussel, Mozac, Massagettes), PLAQUE NORD (Vichy, Moulins, Thiers, Ambert, Ricoux), PLAQUE SUD (Issoire, Brioude, Mende, Le Puy-en-Velay), PLAQUE SUD-OUEST (Albi, Rodez, Millau, Aurillac, Figeac, Gaillac, Villefranche, Carmaux, Lavaur) ; puis bloc « Entités Spécifiques » = `BUDGET_SPECIAL_SITES = ['Nissan']` (l.29).
  - Cocher une plaque **éclate** en sites : la sélection ne contient jamais « PLAQUE ... ».
  - Montluçon et Saint-Etienne (dans `SITES`, pas dans `PLAQUES_STRUCTURE`) ne sont pas proposés.
  - Règle d'application : `isDestinationInScope(ligne.site, filterSites)` (`constants.ts:152`) — Provisions (l.685) et Suivi (l.626). Vide = tout ; bucket coché directement = oui ; sinon site réel de la ligne coché ; `Nissan` (global) **exclu tant qu'il n'est pas nommé**.
- [ ] **Marque** (`BudgetBrandPicker`, l.140) — **MULTIPLE**, puces : « Toutes » (vide) + `Renault`, `Dacia`, `Alpine`, `Nissan`, `Mobilize` (`BUDGET_BRAND_CHIPS`, l.138 ; **Holding n'est pas proposé**). Clé `budget_filterBrands`, défaut `[]`. Couleurs = `BRAND_COLORS`.
  - `Alpine` grisée (30 %, non cliquable) si des sites sont cochés et qu'aucun n'est dans `ALPINE_SITES` (Clermont, Le Puy-en-Velay, Vichy, Rodez). `Nissan` grisée si aucun site coché dans `NISSAN_SITES` (Clermont, Montluçon, Moulins, Le Puy-en-Velay, Saint-Etienne, Rodez, Albi, Aurillac). Disponible d'office si aucun site coché (l.142-143).
  - Application aux **enveloppes** : `isBudgetLineBrandInScope` (l.409) via `resolveBudgetLine()` : ligne avec marque (`Alpine-*`, `Nissan`) gardée si cette marque est cochée ; ligne sans marque (`null` = compte RDM) gardée si Renault, Dacia ou Mobilize est coché.
  - Application aux **projets et dépenses** : `isBrandInScope` (l.400) : aucun filtre = tout ; élément portant `Holding` = passe (mais il est exclu plus haut du budget) ; sinon au moins une marque de l'élément dans le filtre (champ `brands` + `brand` legacy pour les dépenses).
- [ ] **Service** (`BudgetServicePicker`, l.174) — **MULTIPLE**, puces : « Tous » (vide) + `VN`, `VO`, `APV`, `PR` (`BUDGET_SERVICE_CHIPS` = `['VN','VO','APV','PR']`, l.172 ; « Tous Services » n'est pas une puce). Clé `budget_filterServices`, défaut `[]`. Couleurs = `SERVICE_COLORS`.
  - Application : `servicesToProcess` (l.386) = les 4 services si vide ; limite à la fois les enveloppes (`b.entries[svc]`) et le réalisé. Dans le tableau, les colonnes de services non filtrés sont estompées (opacité 20 %, l.962).
- [ ] **PRO+ (B2B)** — **simple** (composant `Select`, largeur 40) : options `all` « Tout » (défaut), `standard` « Sans PRO+ », `pro` « PRO+ uniquement ». Clé `budget_filterProPlus`. Application (`isProPlusInScope`, l.440) : **au réalisé seulement** (projets `p.proPlus`, dépenses `exp.proPlus`, absent = non-PRO+). Les enveloppes ne sont pas concernées.
- [ ] **Année** — **simple** (`Select`), options `YEARS = [2024, 2025, 2026]` (l.20, en dur). Clé `budget_filterYear`, défaut année courante (`new Date().getFullYear()`). Application au **réalisé seulement** : année de `startDate` du projet (l.473), de `date` de la dépense (l.554). Les enveloppes n'ont pas d'année.
- [ ] **Période** — deux `Select` « mois de début → mois de fin », options `MONTHS` = Jan, Fév, Mar, Avr, Mai, Juin, Juil, Août, Sep, Oct, Nov, Déc (valeurs 0-11). Clés `budget_filterMonthStart` (défaut 0) et `budget_filterMonthEnd` (défaut 11). Garde-fou : changer le début au-delà de la fin (ou la fin en deçà du début) aligne l'autre borne (l.1095, 1104). Application : mois de l'enveloppe (index du tableau), mois de `startDate` du projet, mois de la dépense (une dépense annuelle : chacun des 12 mois testé séparément).
- [ ] Les filtres Provisions : seul le **Périmètre** agit sur l'affichage des cartes (l.685). Les autres filtres (marque, service, PRO+, année, période) n'ont **aucun effet** sur l'onglet Provisions.
- [ ] Mobile : bouton « Filtres » (icône Filter, pastille du compteur) qui déplie le panneau (voir §10).

## 4. Affichage

### Onglet Provisions (`renderProvisions`, l.667)
- [ ] Bandeau : « Budget Prévisionnel Groupe (Annuel) » = somme de **toutes** les valeurs de **toutes** les lignes chargées (`budgets`, avant filtre de périmètre, l.670), format `fr-FR` € ; pastille « Calculé sur {N} sites » (N = `budgets.length`) ; badge « Lecture Seule » si non éditeur.
- [ ] Lignes groupées par plaque dans l'ordre de `PLAQUES_STRUCTURE`, puis « ENTITÉS SPÉCIFIQUES » (`getPlaqueForSite`, l.357). Toute ligne hors `PLAQUES_STRUCTURE` (Alpine-*, Nissan, Montluçon, Saint-Etienne...) tombe dans « ENTITÉS SPÉCIFIQUES ». Plaque vide = section absente. Lignes triées par nom (`localeCompare`, l.308).
- [ ] Carte de site : chevron, nom en majuscules, pastille de plaque, pastilles de marque (`budget.brands` colorées par `BRAND_COLORS`), « Mensuel Moy. » (total/12, masqué < sm), « Annuel Prévu » (total annuel, dégradé Bony). Clic = déplier/replier.
- [ ] Carte dépliée : tableau 4 lignes (VN, VO, PR, APV — dans cet ordre, l.786) × 12 mois, colonne « Service » (pastille `SERVICE_COLORS`), colonne « Total Annuel » (somme de la ligne, €). Champs numériques modifiables (voir §5).

### Onglet Suivi (`renderSuivi`, l.832)
- [ ] Libellé de période : « Annuel {année} » si Jan→Déc, sinon « Période {mois début} - {mois fin} {année} ».
- [ ] **KPI 1 « Budget Prévu (période) »** = `totalForecast` : somme des enveloppes (services filtrés, mois de la période) des lignes passant `isBudgetLineBrandInScope` puis `isDestinationInScope`. € sans décimale.
- [ ] **KPI 2 « Réalisé (période) »** = `totalActual` : projets + dépenses fixes ventilés (voir §9), orange, décor Coins.
- [ ] **KPI 3 « Reste à Engager »** = `totalForecast - totalActual` ; rouge si négatif, vert sinon.
- [ ] **KPI 4 « Consommation »** = `totalActual / totalForecast × 100` (0 si prévu = 0), 1 décimale ; rouge + icône AlertTriangle si > 100 % ; barre de progression plafonnée à 100 %.
- [ ] **Graphique « Évolution Mensuelle »** (recharts `ComposedChart`) : barres « Réalisé » (`#f75632`), courbe « Budget Prévu » (`#293f74`), axe Y en « k », un point par mois de la période. Couleurs de grille/tooltip suivant le thème (`useTheme`).
- [ ] **Tableau « Répartition & Performance par Site »** : sous-titre « Données filtrées : {période}. Services : ... » ou « Tous services. » ; colonnes Site / Plaque, VN, VO, PR, APV, « Réalisé Période », « % » ; une ligne par destination budgétaire dans le périmètre (y compris `Alpine-*` et `Nissan`). Ordre des lignes = ordre des clés de `siteStats`, donc tri par nom de ligne (pas de tri utilisateur). En-tête collant.
  - Cellule de service : réalisé arrondi (ou « - » si 0) et, dessous en petit, le prévu arrondi s'il est > 0. Couleur : rouge gras > 100 %, orange > 80 %, vert sinon (gris si prévu = 0).
  - Colonne « % » : `consommation` de la ligne, 0 décimale ; rouge > 100, orange > 80 et ≤ 100, vert sinon.
- [ ] Pas de ligne de total dans le tableau.

## 5. Formulaires

- [ ] Aucun formulaire modal. Seule saisie : les **48 champs `<input type="number">`** de chaque carte de site (service × mois), onglet Provisions, modifiables uniquement si `canEditProvisions`.
  - Pas de validation ni de bornes ; `Number(e.target.value)` : un champ vidé devient 0 ; décimales et négatifs acceptés.
  - Chaque frappe déclenche `updateBudgetEntry(site, service, mois, valeur)` (l.334) → `handleSave` (l.317) → mise à jour **optimiste** de l'état local + **un** `POST /api/budget` par frappe (upsert par `site`, `db.upsertBudget`, envoie `{ site, entries, brands }`). Pas d'anti-rebond.
- [ ] Contrat serveur (`routes/budget.ts:30`) : `site` chaîne non vide, `entries` objet obligatoires (400 sinon) ; `brands` défaut `[]`. Aucune liste blanche de champs (route à corps explicite : `site`, `entries`, `brands`).

## 6. Actions

- [ ] Déplier/replier un site (persisté).
- [ ] Modifier une valeur de provision (éditeurs seulement) — sauvegarde automatique, indicateur « SAUVEGARDE AUTO... » pendant ~800 ms (`setTimeout`, l.331).
- [ ] Filtrer / réinitialiser (voir §3).
- [ ] Échec d'enregistrement : `alert('Échec de la sauvegarde du prévisionnel (serveur injoignable ?). Rechargement des données.')` puis relecture `db.getBudgets()` (l.324).
- [ ] Pas de création, suppression, duplication ni export de ligne de budget depuis l'interface (les routes `PUT /:id` et `DELETE /:id` existent côté serveur ; le client n'appelle `deleteBudget` que pour purger le bucket générique `Alpine` lors de la migration).
- [ ] Effet de bord au montage (éditeurs) : création en base des buckets `Alpine-Clermont`, `Alpine-Vichy`, `Alpine-Le Puy`, `Alpine-Rodez`, `Nissan` s'ils manquent (marque `Alpine` ou `Nissan`, 4 services × 12 mois à 0) et suppression de la ligne `Alpine` générique.

## 7. Temps réel et chargement

- [ ] `useRealtimeSync([...RT_EVENTS.budget, ...RT_EVENTS.projects, ...RT_EVENTS.fixedExpenses], () => loadData(true))` (l.248). `RT_EVENTS.budget` = `budget:updated`, `budget:deleted` (`services/realtime.ts:43`) ; `fixedExpenses` = `fixed-expense:created|updated|deleted` (l.56) ; `projects` : voir `realtime.ts`.
- [ ] Rechargement « silencieux » (`silent = true`) : pas de squelette, et **pas** de migration de buckets (elle émettrait `budget:updated` et bouclerait).
- [ ] Premier chargement : `loading` ; Provisions affiche « Chargement des données budgétaires... » ; l'onglet Suivi n'a pas de message de chargement (il s'affiche avec des totaux à 0 pendant le chargement).
- [ ] Chargement en parallèle : `db.getBudgets()`, `db.getProjects()`, `db.getFixedExpenses()` (l.255). `getBudgets` exécute aussi `migrateBudgetsIfNeeded` (localStorage → API, `dataService.ts:432`).
- [ ] Les propres sauvegardes de l'utilisateur déclenchent `budget:updated` donc un rechargement silencieux de la page (et de celles des autres onglets).

## 8. États vides et erreurs

- [ ] Provisions sans ligne dans le périmètre : rien n'est rendu sous le bandeau (aucun texte d'état vide).
- [ ] Suivi sans ligne : tableau vide (en-têtes seuls), KPI à 0 €, consommation 0,0 %.
- [ ] Échec de sauvegarde : `alert` (voir §6). Échec de chargement : **non géré** (pas de `try/catch` autour du `Promise.all` de `loadData`, l.255) → `loading` peut rester à `true`. Échec de la migration de buckets : `console.error('Bucket migration failed:', ...)` seulement.
- [ ] 403 serveur sur POST (rôle non éditeur) : l'interface l'empêche en amont ; si contourné, même `alert` que l'échec.

## 9. Règles métier touchées

Fonctions de `constants.ts` à réutiliser telles quelles en v2 :
- [ ] `isHoldingBrand(brands, legacyBrand?)` (l.59) — projets (l.452) et dépenses (l.534) taggués Holding : **exclus du réalisé, tous périmètres**.
- [ ] **Brouillon** : `if (p.status === 'Draft') return` (l.446) — projets en brouillon exclus du réalisé. Archivé reste compté. (Les dépenses n'ont pas de statut.)
- [ ] `splitShareToBuckets(rawSite, brands, legacyBrand, { alpineShare, nissanShare })` (l.508 projets, l.575 dépenses) — destinations pondérées (ratios sommant à 1), alias de site inclus (`resolveSiteAlias` : Thiers, Ambert → Ricoux ; Riom → Mozac). Curseur vide = 100 % sur la marque ; lu seulement si une marque RDM est présente ; Alpine avant Nissan. Une destination absente de `siteStats` est ignorée (l.512, 596).
- [ ] `resolveBudgetLine(site)` (l.412, `constants.ts:119`) — décompose une ligne (`Alpine-Clermont` → site Clermont / Alpine ; `Nissan` → global).
- [ ] `isDestinationInScope(site, filterSites)` (l.626, 685) — **Alpine par site, Nissan global**.
- [ ] `ALPINE_BUCKETS`, `NISSAN_BUCKET` (`constants.ts:86, 94`) — buckets migrés au montage.
- [ ] `allowedSitesFor(user)` (`constants.ts:738`) — sert à couper la migration de buckets pour un chef de site.
- [ ] **Ventilation multi-sites** : `p.budgetDistribution` (si `p.sites` non vide) sinon `{ [p.site]: 100 }` ; idem dépenses ; part `≤ 0` ignorée ; coût du site = `budgetActual × pct / 100` (projets) ou `amount × pct / 100` (dépenses).
- [ ] **Réalisé projet** : coût = `p.budgetActual` (0 → ignoré) ; **daté sur `startDate`** (année et mois, pas la date de fin) ; répartition sur les services : `Tous Services` → VN, VO, PR, APV ; sinon services du projet parmi ces quatre ; coût réparti à parts égales entre les services touchés (`/ servicesToHit.length`). Un projet sans service valide n'est pas compté.
- [ ] **Réalisé dépense** : `Tous Services` → 4 services, sinon le service s'il est dans VN, VO, PR, APV. **Dépense annuelle** (`isAnnual`) : coût du site étalé à parts égales (÷ 12) sur les 12 mois de l'année de `date` ; le filtre de période s'applique mois par mois. Dépense ponctuelle : sur le mois de `date`.
- [ ] Le prévu (enveloppes) n'est pas soumis au filtre PRO+ ni au filtre d'année.
- [ ] Renault + Dacia + Mobilize = un seul compte : ligne sans marque, filtrée par n'importe laquelle des trois (`isBudgetLineBrandInScope`).
- [ ] Périmètre `GROUPE BONY` : aucun traitement dans cette page (une dépense « GROUPE BONY » arrive ventilée par `budgetDistribution` déjà éclatée sur les sites).
- [ ] `proPlus` (marqueur métier B2B) : seul filtre PRO+ ; ne pas confondre avec `expertMode`.

## 10. Mobile

- [ ] Filtres masqués par défaut sous `md` ; bouton « Filtres » (icône, pastille du nombre de filtres actifs) et lien « Réinitialiser » au-dessus ; état `budget_showFilters` (l.1037-1050).
- [ ] Onglet Provisions : conteneur avec marge `p-3` ; « Mensuel Moy. » masqué sous `sm` ; le tableau mois est dans un `overflow-x-auto` (colonnes de 80 px min.).
- [ ] Onglet Suivi : KPI en grille 2 colonnes (4 dès `lg`) ; graphique et tableau empilés en colonne ; le panneau du tableau prend `h-[70vh]` sous `md` (`md:h-auto md:flex-1`) — correctif du 05/08/2026 (un `flex-1` seul donnait 2 px de haut) ; tableau `min-w-[560px]` avec défilement horizontal interne.
- [ ] Bouton « Réinitialiser » desktop séparé, aligné à droite (`hidden md:flex`).

## 11. Défauts et bizarreries relevés

- [ ] **Sélecteur de périmètre non borné pour le chef de site** : `perimetreImpose` est calculé (l.212) mais jamais transmis à `BudgetSitePicker` ; fiche du 29/09 de `BUGS-CONNUS.md`. Le serveur cloisonne bien (pas de fuite), défaut d'interface seulement.
- [ ] Filtre Marque/Service/Année/Période/PRO+ **sans effet sur l'onglet Provisions**, alors que la barre est affichée sur les deux onglets.
- [ ] Le bandeau « Budget Prévisionnel Groupe (Annuel) » et « Calculé sur N sites » ignorent le filtre de périmètre (calculés sur `budgets` entier), alors que la liste en dessous est filtrée.
- [ ] Les enveloppes n'ont **pas d'année** : le même prévu s'affiche quelle que soit l'année choisie, tandis que le réalisé est filtré par année. Changer l'année ne change donc que le réalisé.
- [ ] `YEARS = [2024, 2025, 2026]` codé en dur (l.20) : à étendre à la main.
- [ ] Code mort / reste historique dans `BudgetBrandPicker` : `filterSites.includes('Alpine')` (l.142) — le pseudo-site `Alpine` a été retiré ; `BUDGET_SPECIAL_SITES` ne contient que `Nissan`. Imports importés mais jamais utilisés (`TrendingDown`, `Calendar`, `SITES`, `SERVICES`) : à ne pas reporter.
- [ ] Une sauvegarde par frappe (pas d'anti-rebond) : un POST + un événement `budget:updated` + un rechargement complet (3 requêtes) à chaque caractère tapé, chez tous les utilisateurs connectés.
- [ ] `Number(e.target.value)` : champ vidé → 0 ; saisie non numérique ignorée par le navigateur.
- [ ] Échec du chargement initial non intercepté (pas de `try/catch`).
- [ ] Résidu documenté (`BUGS-CONNUS.md`, 03/08) : avec MARQUE = Renault, `Alpine-Clermont` et `Nissan` peuvent afficher du réalisé sans enveloppe (élément multi-marques) — lecture « consommé sans budget ».
- [ ] Le tableau du Suivi affiche aussi les lignes à prévu et réalisé nuls (pas de masquage des lignes vides).
- [ ] Le graphique donne `Prevu` et `Reel` = 0 hors période (déjà tranché par `.slice`), champ `amt` calculé mais inutilisé.
- [ ] Format des € du tableau : `Math.round(...).toLocaleString()` (locale du navigateur) alors que les KPI utilisent `fr-FR` explicite.
