# Inventaire fonctionnel — Dashboard (« Cockpit Général »)

Source principale : `pages/Dashboard.tsx` (1 646 lignes). Relevé par lecture du code le 29/09/2026, rien reproduit dans l'interface.
Fonctions de `constants.ts` à réutiliser telles quelles en v2 : `isDestinationInScope` (qui appelle `resolveBudgetLine`),
`splitShareToBuckets` (qui appelle `resolveSiteAlias`), `resolveSiteAlias`, `isHoldingBrand`, `hasSocialFeatures`, `allowedSitesFor`.

## 1. Accès et rôles

- [ ] Rubrique `dashboard` : onglet par défaut de l'application (`App.tsx:36`), rendue par `App.tsx:149`, et repli par défaut du `switch` pour tout non-External (`App.tsx:162`).
- [ ] Rubrique de repli des gardes de rôle : Jeux sans droit, Export sans droit, Congés sans droit, rubrique hors liste pour un chef de site → `dashboard` (`App.tsx:91-104`).
- [ ] Menu : entrée « Dashboard » (icône `LayoutDashboard`) pour tous les rôles sauf External (`components/Sidebar.tsx:212`, filtre External `:231-232`) ; groupe desktop sans titre en tête (`Sidebar.tsx:312-315`) ; 1re position de la barre du bas mobile (`MOBILE_BAR_IDS`, `Sidebar.tsx:247`).
- [ ] External : n'a pas la rubrique, redirigé vers `digital` (`EXTERNAL_ALLOWED_TABS`, `App.tsx:80,90`).
- [ ] Chef de site (`Site Manager`) : rubrique autorisée (`SITE_MANAGER_SECTIONS`, `constants.ts:719-721`).
- [ ] Écriture : **aucune**. La page ne fait que lire ; aucun rôle n'a d'action d'écriture ici (Guest et chef de site voient la même page en lecture que les autres).
- [ ] Blocs masqués au chef de site via `montrerBlocsMarketing = hasSocialFeatures(user?.role)` (`Dashboard.tsx:910`, `constants.ts:728`) :
  - [ ] « Performance des Campagnes » (`Dashboard.tsx:1482`)
  - [ ] « Top Consommateurs » (`Dashboard.tsx:1577`)
  - [ ] « Charge de l'Équipe » (`Dashboard.tsx:1607`)
- [ ] Sélecteur de périmètre borné par `perimetreImpose = allowedSitesFor(user)` (`Dashboard.tsx:912`, `constants.ts:738-739`) : `null` = voit tout ; tableau (éventuellement vide) = ses concessions seulement. Pur confort d'interface.
- [ ] Cloisonnement serveur des 6 lectures (`Dashboard.tsx:327-334`) :
  - [ ] `db.getProjects()` → `GET /api/projects` : `scopeOf` + `arrayScopeWhere` + `redactSiteFields` (`backend/src/routes/projects.ts:20-33`).
  - [ ] `db.getBudgets()` → `GET /api/budget` : `budgetScopeOf` + `stringScopeWhere` (buckets Alpine inclus) (`backend/src/routes/budget.ts:17-22`).
  - [ ] `db.getSocialPosts()` → `GET /api/social` : `scopeOf` + `redactSiteFields(…, 'concessions')` (`backend/src/routes/social.ts:163-175`).
  - [ ] `db.getFixedExpenses()` → `GET /api/fixed-expenses` : `scopeOf` + `redactSiteFields` (`backend/src/routes/fixedExpenses.ts:70-80`).
  - [ ] `db.getUsers()` → `GET /api/users` : liste réduite à soi-même pour un rôle sans `hasSocialFeatures` (`backend/src/routes/users.ts:38-45`).
  - [ ] `db.getCampaigns()` → `GET /api/campaigns` : **aucun cloisonnement** (`findMany()` brut, `backend/src/routes/campaigns.ts:10-13`) — voir §11.
- [ ] Ce que le client fabrique : rien n'est ajouté aux données serveur (pas de bucket recréé côté client, contrairement à l'ancien `Budget.tsx`). Tous les agrégats sont calculés côté client à partir des listes déjà filtrées par le serveur.

## 2. Structure

- [ ] Page unique, sans onglet. Racine `flex flex-col h-full overflow-hidden` (`Dashboard.tsx:953`).
- [ ] En-tête « barre de pilotage » (`Dashboard.tsx:956-1011`) : titre + filtres.
- [ ] Zone défilante (`ref={scrollRef}`, `Dashboard.tsx:1014`), dans l'ordre :
  1. [ ] 6 cartes KPI (`:1018-1165`)
  2. [ ] Trajectoire mensuelle (2/3) + Mix Activité (1/3) (`:1168-1285`)
  3. [ ] Prochaines Échéances (Projets) + Prochaines Publications (Digital) (`:1288-1397`)
  4. [ ] Pilotage projets : Écart Prévu / Réalisé + Projets en Retard (`:1400-1477`)
  5. [ ] Performance des Campagnes (`:1482-1540`, masqué chef de site)
  6. [ ] Budget par Canal + Top Consommateurs + Charge de l'Équipe (`:1543-1639`)
- [ ] Persistance (`sessionStorage`, préfixe `gearbox_session_`, vidé à la déconnexion — `hooks/useSessionState.ts:4-9`) :
  - [ ] `dashboard_dateStart`, `dashboard_dateEnd` (`Dashboard.tsx:313-314`)
  - [ ] `dashboard_filterContexts`, `dashboard_filterBrands`, `dashboard_filterServices`, `dashboard_filterProPlus` (`:316-319`)
  - [ ] `dashboard_filtersOpen` (état replié mobile, `components/CollapsibleFilters.tsx:45`, `storageKey="dashboard"`)
  - [ ] Position de défilement : `useScrollRestore('dashboard', !loading)` → clé `gearbox_session_scroll_dashboard` (`Dashboard.tsx:321`, `useSessionState.ts:40`).
- [ ] Aucun `localStorage`.

## 3. Filtres et sélecteurs

Titre de page : « Cockpit Général » (icône `Activity`), sous-titre « VUE CONSOLIDÉE ET ANALYSE DE LA PERFORMANCE » (`:959-964`).
Les 5 filtres se combinent (ET). Tous persistés en session (§2).

- [ ] **Période** (`DateRangePicker`, `components/DateRangePicker.tsx`) — deux déclencheurs « Du » / « Au » (date au format `toLocaleDateString('fr-FR', {day:'numeric', month:'short', year:'numeric'})`), un seul panneau.
  - [ ] Défaut : `${année courante}-01-01` → `${année courante}-12-31` (`Dashboard.tsx:312-314`).
  - [ ] Raccourcis exacts (`DateRangePicker.tsx:85-96`) : « Aujourd'hui », « Cette semaine » (lundi→dimanche), « Ce mois », « Ce trimestre », « Le trimestre dernier », « Ce semestre », « Le semestre dernier », « Cette année », « L'année dernière », « Personnalisé » (ouvre « Période personnalisée » : champs « Du » / « Au » en `DatePicker`, bouton « Appliquer »).
  - [ ] En mode personnalisé, chaque date est appliquée dès sa saisie ; « Appliquer » ne fait que fermer (`:119-128`).
  - [ ] Application : `dStart = new Date(dateStart)`, `dEnd = new Date(dateEnd)` (`Dashboard.tsx:428-429`) ; règles par agrégat en §4.
- [ ] **Périmètre** (`SiteContextPicker`, `Dashboard.tsx:73-194`) — MULTIPLE.
  - [ ] Libellé « Périmètre » ; déclencheur : « Tout le réseau » (vide), le nom du site (1), « N sites » (>1) (`:99-103`).
  - [ ] Panneau 256 px : recherche « Rechercher un site… » ; boutons « Tout le réseau » (vide la sélection) et « Tout sélectionner » (`restrictTo ?? [...tous les sites des plaques, 'Nissan']`, `:94`).
  - [ ] Options = `PLAQUES_STRUCTURE` (`constants.ts:5-10`) : PLAQUE CENTRE (Clermont, Ussel, Mozac, Massagettes), PLAQUE NORD (Vichy, Moulins, Thiers, Ambert, Ricoux), PLAQUE SUD (Issoire, Brioude, Mende, Le Puy-en-Velay), PLAQUE SUD-OUEST (Albi, Rodez, Millau, Aurillac, Figeac, Gaillac, Villefranche, Carmaux, Lavaur). Plaques dépliées par défaut, repliables ; case de plaque = tout / partiel / rien, un clic éclate la plaque en ses sites (la plaque elle-même n'est jamais stockée).
  - [ ] Section « Entités Spécifiques » : `SPECIAL_SITES = ['Nissan']` (`:60`) — **jamais proposée à un chef de site** (`:182`). Pas de pseudo-site « Alpine » (retiré le 03/08/2026, `:55-59`).
  - [ ] Chef de site : plaques filtrées sur `restrictTo`, plaque vide masquée (`:146-147`).
  - [ ] Défaut `[]` = tout le réseau.
  - [ ] Application : `isSiteInScope(site) = isDestinationInScope(site, filterContexts)` (`Dashboard.tsx:442`, `constants.ts:152-158`) — testé sur la DESTINATION budgétaire (site réel ou bucket `Alpine-<site>` / `Nissan`), Nissan jamais implicite.
- [ ] **Marque** (`BrandPicker`, `:197-235`) — MULTIPLE, puces. « Toutes » puis `['Renault', 'Dacia', 'Alpine', 'Nissan', 'Mobilize']` (Holding non proposé). Puce active colorée `BRAND_COLORS[b]`.
  - [ ] Défaut `[]`. Application `isBrandInScope` (`:444-447`) : vide = tout ; sinon passe si l'élément porte `Holding` **ou** au moins une marque cochée.
- [ ] **Service** (`ServicePicker`, `:238-276`) — MULTIPLE, puces. « Tous » puis `['VN', 'VO', 'APV', 'PR']` (« Tous Services » non proposé). Puce active `SERVICE_COLORS[s]`.
  - [ ] Défaut `[]`. Application `isServiceInScope` (`:449-453`) : vide = tout ; un élément « Tous Services » passe toujours ; sinon intersection. Pour les lignes de budget, filtre service par service (`:472`).
- [ ] **PRO+ (B2B)** (`Select`, `:995-1007`) — SIMPLE, options exactes : `all` « Tout », `standard` « Sans PRO+ », `pro` « PRO+ uniquement ». Défaut `all`.
  - [ ] Application `isProPlusInScope` (`:456-457`) sur `Project.proPlus` / `FixedExpense.proPlus` ; absent = non-PRO+. Non appliqué aux lignes de budget ni aux publications.
- [ ] Compteur de filtres actifs (pastille mobile) : +1 par périmètre, marque, service non vides et PRO+ ≠ `all` ; la période ne compte pas (`:918-922`).
- [ ] Résumé replié (`:927-939`) : période (`AAAA` si année civile pleine, sinon `JJ/MM → JJ/MM`) · périmètre ou « Tout le réseau » · marques · services · « PRO+ seul » / « Sans PRO+ » ; au-delà de 2 valeurs : `premier +N`. Séparateur « · ».

## 4. Affichage

Format monétaire : `toLocaleString('fr-FR', {style:'currency', currency:'EUR', maximumFractionDigits:0})` (`:896`).

### 4.1 Moteur d'agrégation (`stats`, `useMemo`, `:378-893`)

- [ ] **Prévu `totalForecast`** — lignes de budget (`:462-481`) : ligne retenue si `isSiteInScope(b.site)` ET `isBrandInScope(b.brands)` ; pour chaque service VN/VO/PR/APV retenu par le filtre service, chaque valeur mensuelle est ajoutée si le 15 du mois de `chartYear` (= année de `dateStart`, `:460`) tombe dans [dStart, dEnd].
- [ ] **Consommé `totalActual`** = projets + dépenses fixes :
  - [ ] Projets (`:484-647`) : exclus si `status === 'Draft'` (`:492`), hors PRO+ (`:494`). Parts par site = `budgetDistribution` si `sites` non vide, sinon `{[p.site]: 100}` (`:503-506`). Chaque part est éclatée par **`splitShareToBuckets(rawSite, p.brands, null, {alpineShare, nissanShare})`** puis filtrée par `isSiteInScope(d.site)` (`:517-525`) ; aucune part → projet ignoré (ni montant ni compteur). Puis filtres marque et service. **`isHoldingBrand(p.brands)` → sortie des montants APRÈS les compteurs** (`:566`). Coût = `budgetActual × Σ(parts en périmètre)/100` (`:571-575`), daté à `startDate` ; compté si `startDate ∈ [dStart, dEnd]` (`:582`).
  - [ ] Dépenses fixes (`:669-749`) : hors PRO+ exclues ; **`isHoldingBrand(e.brands, e.brand)`** exclues (champ legacy inclus, `:673`) ; marque sur `e.brands || [e.brand]` ; service sur `[e.service]` ; montant 0 ignoré. Parts comme les projets ; fraction en périmètre = Σ ratios de **`splitShareToBuckets(rawSite, e.brands, e.brand, {alpineShare, nissanShare})`** filtrés par `isSiteInScope` (`:707-712`) ; coût = `amount × part% × fraction`. Annuelle (`isAnnual`) : 1/12 sur chacun des 12 mois, testé au 15 du mois ; mensuelle : tout sur le mois de `date`, testée à sa date.
- [ ] **Engagé à date `totalEngageADate`** : sous-ensemble de `totalActual` dont la date de référence ≤ aujourd'hui minuit (`:587`, `:739`).

### 4.2 Cartes KPI (grille 1 / 2 / 3 colonnes, `:1018`)

- [ ] **« Budget Consommé »** (icône `Wallet`) : `formatCurrency(totalActual)` ; barre `min(burnRate,100)%` (rouge si > 100, dégradé sinon) ; « Sur {totalForecast} (Période) » ; pourcentage `burnRate = totalActual / totalForecast × 100`, 1 décimale, rouge si > 100 sinon vert (`:898`, `:1020-1037`).
- [ ] **« Reste à Engager »** (icône `Target`) : `remaining = totalForecast − totalActual`, rouge si < 0 ; texte « Dépassement budgétaire sur la période. » si < 0, sinon « Disponible pour nouveaux projets. » (`:899`, `:1040-1055`).
- [ ] **« Projets Actifs »** (icône `Layers`) : nombre de projets `status === 'Active'` passant périmètre/marque/service/PRO+, **Holding inclus**, compté une fois par projet (`:536`) ; mention « En cours de réalisation » avec pastille verte pulsante. Pas de filtre de période.
- [ ] **« Campagnes Programmées »** (icône `Megaphone`) : nombre de TÂCHES `channel ∈ {SMS, E-mail}` et `status === 'Programmed'` des projets retenus (Holding inclus, sans filtre de période) (`:558-560`) ; texte « Envois SMS / E-mail au statut « programmé ». ».
- [ ] **« Projets en Retard »** (icône `AlertTriangle`) : nombre de projets retenus, `status !== 'Archived'`, `endDate` < aujourd'hui (via `parseLocalDate`), `progress < 100` (`:546-548`) ; rouge si > 0, vert sinon ; texte « Échéance dépassée, avancement < 100 %. ». Holding inclus, pas de filtre de période.
- [ ] **« Avance / Retard de Budget »** (icône `Gauge`, `:1110-1164`) :
  - [ ] `pctTempsEcoule = round(clamp(now − dStart, 0, dEnd − dStart) / (dEnd − dStart) × 100)` (`:828-830`)
  - [ ] `pctEngageADate = round(totalEngageADate / totalForecast × 100)` ; `pctEngagePeriode = round(totalActual / totalForecast × 100)` (`:831-832`)
  - [ ] Valeur affichée `ecartRythme = pctEngageADate − pctTempsEcoule` en « points », signe `+` si > 0 ; rouge si > 10, ambre si < −10, vert sinon (`:904`, `:1118-1120`).
  - [ ] Barres : « Engagé à date » (orange, `pctEngageADate %`), « Période écoulée » (gris, `pctTempsEcoule %`) ; ligne sans barre « Engagé sur la période » `pctEngagePeriode %` (volontairement sans barre, `:1147-1155`).
  - [ ] Texte : > 10 « Vous engagez plus vite que le temps ne passe : le budget risque de manquer avant la fin de la période. » ; < −10 « Vous engagez moins vite que le temps ne passe : du budget risque de rester non engagé. » ; sinon « Engagements au rythme du calendrier. » (`:1158-1162`).

### 4.3 Graphiques

- [ ] **« Trajectoire Mensuelle ({année de dateStart}) »** (`:1171-1210`, hauteur 400 px) — Recharts `ComposedChart` sur 12 mois (`toLocaleString('fr-FR',{month:'short'})`) :
  - [ ] `prevu` = somme des lignes de budget retenues sur **tous les mois de `chartYear`** (sans filtre de période), en aire dégradée bleue `#293f74` — légende « Budget Mensuel ».
  - [ ] `reel` = coût projets (mois de `startDate` si année = `chartYear`) + dépenses fixes (mois ou 1/12), barres orange `#f75632` 16 px — légende « Réalisé Mensuel ».
  - [ ] Arrondis à l'euro ; axe Y en `${val/1000}k` ; infobulle `val.toLocaleString() + ' €'` ; couleurs d'axe/grille selon thème.
  - [ ] `cumulReel` calculé (`:751-757`) mais non tracé.
- [ ] **« Mix Activité »** (`:1213-1284`) — camembert (60 %) + légende (40 %) :
  - [ ] Projets : coût réparti à parts égales sur leurs services VN/VO/APV/PR (« Tous Services » → les 4) ; dépenses : idem par mois (`:631-645`, `:740-745`). Dans la période seulement ; Holding et brouillons exclus.
  - [ ] Valeurs arrondies, zéros retirés, tri décroissant (`:759-762`). Étiquette `%` dans la part si ≥ 5 %. Légende : service, montant, `%` du total.
  - [ ] Couleurs `PIE_COLORS` : VN `#f75632`, VO `#8f12ab`, APV `#293f74`, PR `#06b6d4` (`:289-294`).

### 4.4 Listes et blocs

- [ ] **« Prochaines Échéances (Projets) »** (`:1296-1335`) : projets `Active`, `isSiteInScope(p.site)`, PRO+, `endDate` ≥ aujourd'hui ; tri par `endDate` croissante ; 10 max (`:838-842`). Carte : pavé date (mois court + jour), nom, badge site `p.site`, badge « Multi » si « Tous Services » sinon 1er service en `SERVICE_COLORS`, flèche. Clic → fiche projet.
- [ ] **« Prochaines Publications (Digital) »** (`:1343-1396`) : publications non archivées, statut ≠ « Publié » / « Abandonné », `date` ≥ aujourd'hui ; périmètre sur `concessions` (passe si contient « GROUPE BONY » ou un site coché) ; marque (passe si « Holding » ou marque cochée) ; tri par date ; 10 max (`:849-867`). Carte : pavé date, titre, 2 premières marques en `BRAND_COLORS`, statut brut (`post.status`), jusqu'à 3 icônes réseau + « +N » (`getNetworkIcon` : instagram, facebook, linkedin, youtube, gmb, tiktok, sinon globe, `:941-950`). Clic → rubrique Digital.
- [ ] **« Écart Prévu / Réalisé »** (icône `Briefcase`, `:1403-1444`) : projets de la période avec `budgetPlanned > 0` ; `ecart = budgetActual − budgetPlanned` (montants **entiers**, non proratisés au périmètre) ; tri par |écart| décroissant, 6 max ; `ecartPct = round(ecart/prevu × 100)` (`:592-597`, `:778-780`). Sous-titre « Projets dont un budget prévisionnel a été saisi. Avancement moyen des projets actifs : **N %** » (`avancementMoyen` = moyenne arrondie de `progress` des projets actifs retenus, Holding inclus, `:782-783`). Deux barres par projet (gris = prévu, rouge si dépassement / vert sinon = réalisé), pourcentage rouge si > 0. Légende « Barre grise : prévu · barre colorée : réalisé ».
- [ ] **« Projets en Retard »** (liste, `:1447-1476`) : sous-titre « Échéance dépassée et avancement incomplet. Triés du plus ancien retard. » ; tri `fin` croissante ; boutons 44 px : nom, « {site} · échéance JJ/MM/AAAA », « {avancement} % avancé ». Hauteur max 18 rem défilante. Clic → fiche projet.
- [ ] **« Performance des Campagnes »** (icône `Send`, `:1483-1539`, non chef de site) : sous-titre « Envois SMS et e-mail du périmètre. **Taux pondérés par la volumétrie** — une moyenne simple des taux serait faussée par les écarts de volume entre envois. »
  - [ ] Source : tâches `SMS` / `E-mail` des projets de la période avec `volumetry > 0` ; coût tâche × part en périmètre ; numérateurs = `volumetry × taux / 100` (`:617-628`).
  - [ ] Taux = `num / volume × 100`, 1 décimale (`tauxPondere`, `:787`) ; coût/contact = `coût / volume`, 3 décimales.
  - [ ] 6 tuiles : « Contacts touchés » (volume fr-FR, sous « N envois »), « Taux d'ouverture » (« pondéré »), « Taux de clic » (« pondéré »), « Coût / contact » (`x.xxx €`, sous coût total), « NPAI » (« adresses invalides »), « Désabonnements » (« STOP / désinscrits ») (`:1493-1500`).
  - [ ] Tableau par canal (canaux à volume > 0) : Canal, Envois, Contacts, Ouverture, Clic, Coût, Coût / contact (orange gras).
- [ ] **« Budget par Canal »** (icône `Radio`, `:1546-1573`) : « Coûts des tâches, par canal de diffusion. » ; somme `task.cost × part en périmètre` par `channel`, période, top 8 décroissant (`:769`) ; barre relative au 1er, opacité décroissante `1 − i×0.09`.
- [ ] **« Top Consommateurs »** (icône `MapPin`, `:1578-1601`, non chef de site) : « Sites et prestataires, montants ventilés. »
  - [ ] « Sites » : `budgetActual × pct/100` par site RÉEL via **`resolveSiteAlias(rawSite)`** (Thiers/Ambert → Ricoux, Riom → Mozac ; une part Alpine reste sur sa concession), top 5 (`:602-605`, `:770`).
  - [ ] « Prestataires » : somme des coûts de tâche par `provider` et nombre de tâches « (N) », top 5 (`:612-616`, `:771-773`).
- [ ] **« Charge de l'Équipe »** (icône `Users`, `:1608-1637`, non chef de site) : « Tâches encore ouvertes (à faire ou en cours), par personne. » ; nombre de tâches `Todo` / `InProgress` avec `assignedUserId`, projets retenus (Holding inclus, sans période), tri décroissant (`:550-554`, `:775-776`). Avatar 26 px, nom (ou « Utilisateur inconnu »), barre bleue relative, compteur.

## 5. Formulaires

Aucun (hors sélecteurs de filtres du §3).

## 6. Actions

- [ ] Clic sur une échéance ou un projet en retard : `sessionStorage.pendingProjectId = id` puis événement `gearbox-navigate` `{tab: 'projects', projectId}` (`:362-368`).
- [ ] Clic sur une publication : événement `gearbox-navigate` `{tab: 'digital'}` (`:370-375`) — n'ouvre pas la publication elle-même.
- [ ] Aucune création, édition, suppression, export, glisser-déposer ni raccourci clavier.

## 7. Temps réel et chargement

- [ ] Chargement initial : 6 appels en parallèle (`Promise.all`, `:327-334`), `loading = true` pendant l'appel.
- [ ] Temps réel `useRealtimeSync` (`:350-359`) sur `RT_EVENTS.projects` (`projects:updated`, `projects:deleted`), `.campaigns` (`campaigns:updated`, `campaigns:deleted`), `.budget` (`budget:updated`, `budget:deleted`), `.social` (`social:updated`, `social:deleted`), `.fixedExpenses` (`fixed-expense:created`, `fixed-expense:updated`, `fixed-expense:deleted`) (`services/realtime.ts:31-57`) → `load(true)` silencieux : recharge **les 6 ressources**, sans état de chargement.
- [ ] Les utilisateurs ne sont pas écoutés en temps réel.
- [ ] `loading` ne pilote que la restauration du défilement : **aucun squelette ni indicateur visible** n'est rendu.

## 8. États vides et erreurs

- [ ] Mix Activité : « Aucune donnée » (`:1218`).
- [ ] Échéances : « Aucune échéance à venir. » (`:1331`).
- [ ] Publications : « Aucune publication planifiée. » (`:1392`).
- [ ] Écart Prévu / Réalisé : « Aucun budget prévisionnel saisi sur les projets du périmètre. » (`:1441`).
- [ ] Projets en retard : « Aucun projet en retard. 👌 » (vert, `:1473`).
- [ ] Performance : « Aucune volumétrie saisie. Renseignez volumétrie et taux dans les tâches SMS / E-mail des projets pour activer ces indicateurs. » (`:1536`).
- [ ] Budget par canal : « Aucun canal renseigné sur les tâches. » (`:1570`).
- [ ] Top Consommateurs : « Aucune donnée. » (sites, `:1590`) ; « Aucun prestataire renseigné sur les tâches. » (`:1599`).
- [ ] Charge de l'équipe : « Aucune tâche ouverte assignée. » (`:1634`).
- [ ] Trajectoire : pas d'état vide (graphe à zéro).
- [ ] Erreur réseau / 403 : **aucun traitement** — `load` n'a pas de `try/catch` ; un appel en échec fait échouer tout `Promise.all`, aucune donnée n'est posée et aucun message n'est affiché.

## 9. Règles métier touchées

- [ ] **Brouillon** : projet `Draft` exclu de tout (montants, trajectoire, mix, compteurs, retards, performance) (`:492`). Échéances : seul `Active` passe.
- [ ] **Archivé** : reste compté dans les montants et « Projets actifs » ne le compte pas (statut ≠ Active) ; exclu des retards (`:546`).
- [ ] **Holding** : `isHoldingBrand(p.brands)` (projets, `:566`) et `isHoldingBrand(e.brands, e.brand)` (dépenses, `:673`, alias legacy `Groupe` inclus, `constants.ts:59-65`). Projet Holding : TRACKÉ dans « Projets Actifs », « Campagnes Programmées », « Projets en Retard », avancement moyen, charge d'équipe et échéances ; EXCLU de tous les montants. Le filtre marque laisse toujours passer Holding (`:446`, `:859`).
- [ ] **Alpine par site / Nissan global** : périmètre testé par `isDestinationInScope` (`constants.ts:152-158`, qui utilise `resolveBudgetLine`) sur les lignes de budget et sur les destinations de `splitShareToBuckets` ; `Alpine-Clermont` répond au périmètre « Clermont » ; `Nissan` ne répond que s'il est coché explicitement. Pas de pseudo-site Alpine.
- [ ] **Curseurs `alpineShare` / `nissanShare`** : lus uniquement par `splitShareToBuckets` (vide = 100 % marque, lu seulement si RDM présente, Alpine avant Nissan) (`:519-522`, `:707-710`).
- [ ] **RDM = un seul compte** : aucune distinction dans les agrégats (le filtre marque ne fait qu'inclure/exclure des éléments).
- [ ] **Alias de sites** : `resolveSiteAlias` via `splitShareToBuckets`, et directement pour « Top Consommateurs / Sites » (`:603`).
- [ ] **GROUPE BONY** : pour les publications seulement, une publication ciblant « GROUPE BONY » passe tout filtre de périmètre (`:854`). Côté projets/dépenses, aucune ventilation `DISTRIBUTION_GROUPE_BONY` n'est faite ici : la ventilation vient déjà de `budgetDistribution`.
- [ ] **PRO+ (`proPlus`)** : marqueur métier filtrable ; `expertMode` n'est pas utilisé ici.
- [ ] Parts de ventilation utilisées telles quelles, sans renormalisation (comme `Budget.tsx`, `:668`).

## 10. Mobile (sous `md:`)

- [ ] Filtres repliés derrière une barre « Filtres » (44 px, pastille du nombre de filtres actifs, résumé tronqué) (`CollapsibleFilters.tsx:51-76`) ; ouverts, les contrôles s'affichent en dessous ; dès `md`, rendu inchangé sans barre.
- [ ] En-tête en colonne (`flex-col md:flex-row`), titre `text-lg` (→ `md:text-2xl`) ; séparateurs verticaux masqués sous `sm`.
- [ ] Zone de contenu `p-3` (→ `md:p-6`), `pb-20` (barre du bas).
- [ ] KPI sur 1 colonne (2 dès `md`, 3 dès `lg`) ; graphiques, listes, pilotage et bloc 6 sur 1 colonne (multi-colonnes dès `lg`).
- [ ] Rangée Échéances / Publications : hauteur fixe 400 px seulement à partir de `md` (`md:h-[400px]`, `:1288`) ; hauteur libre sur mobile.
- [ ] Tuiles performance en 2 colonnes (3 en `md`, 6 en `lg`) ; tableau par canal `min-w-[520px]` avec défilement horizontal.
- [ ] Déclencheurs de période agrandis à 44 px tactiles (`DateRangePicker.tsx:134-151`).

## 11. Défauts et bizarreries relevés (signaler, ne rien corriger)

Aucune fiche du 29/09 de `BUGS-CONNUS.md` ne vise le Dashboard (`BUGS-CONNUS.md:157-165`). Relevés ici, non reproduits :

- [ ] **`GET /api/campaigns` chargé sans cloisonnement, y compris pour un chef de site** (`Dashboard.tsx:329`, `backend/src/routes/campaigns.ts:10-13`) alors que `campaigns` n'est **jamais utilisé** dans la page : toutes les campagnes sont lisibles dans l'onglet Réseau d'un chef de site. Le rôle n'a pas la rubrique Campagnes. À vérifier : le modèle `Campaign` porte-t-il des données de site ?
- [ ] **Échéances : périmètre testé sur `p.site` brut** (`:839`) — un projet multi-sites (« Clermont, Vichy… ») disparaît dès qu'un périmètre est coché ; c'est exactement le défaut corrigé ailleurs le 30/07/2026. Et ni filtre marque ni filtre service ne s'y appliquent.
- [ ] **Publications : filtres service et PRO+ ignorés, période ignorée** (toujours « à partir d'aujourd'hui ») ; statut affiché brut (`Programmed` en anglais, `libelleStatutSocial` non utilisé) ; « Holding » affiché « Holding » et non « GROUPE BONY » comme dans Digital.
- [ ] **Montluçon et Saint-Etienne** (présents dans `SITES`, `constants.ts:12-17`, et dans `NISSAN_SITES`) ne sont pas proposés par le sélecteur de périmètre (`ALL_PLAQUE_SITES` = plaques seulement, `:54`) : impossible de les isoler ; « Tout sélectionner » ne les inclut pas (et devient donc plus restrictif que « Tout le réseau »).
- [ ] **Période à cheval sur deux années** : prévu et trajectoire ne regardent que `chartYear` = année de `dateStart` (`:460`, `BudgetLine` n'a pas d'année, `types.ts:374-384`) — la partie de l'année suivante n'a aucun prévu alors que son consommé est compté.
- [ ] **Dates de filtre parsées en UTC** (`new Date('AAAA-MM-DD')`, `:428-429`, et `new Date(p.startDate)`, `:570`) alors que le reste de la page utilise `parseLocalDate` : risque de décalage aux bornes (élément du dernier jour exclu si l'heure est postérieure à minuit UTC). À vérifier selon le format stocké.
- [ ] **Mix Activité vs filtre service** : un projet VN + VO passe le filtre « VN » mais sa part VO apparaît quand même dans le camembert (`:631-645`).
- [ ] **Écart Prévu / Réalisé non proratisé au périmètre** (montants entiers, `:593-596`) contrairement à tous les autres montants ; clé React `e.nom` (doublon possible si deux projets ont le même nom, `:1415`).
- [ ] **Compteurs sans période** : « Projets Actifs », « Campagnes Programmées », « Projets en Retard », avancement moyen et charge d'équipe ignorent la période sélectionnée.
- [ ] **Chef de site sans site rattaché** : `restrictTo = []` → libellé « Tout le réseau » et aucune plaque proposée (le serveur ne renvoie rien de toute façon) ; le libellé « Tout le réseau » est aussi trompeur pour un chef de site qui a des sites.
- [ ] **Couleurs de service incohérentes** : camembert VN orange / VO violet / APV bleu (`PIE_COLORS`, `:289-294`) contre VN bleu / VO orange / APV violet dans les badges (`SERVICE_COLORS`, `constants.ts:33-39`).
- [ ] **Aucun état de chargement ni d'erreur** (§7, §8) ; le commentaire `:323-324` parle d'un « squelette » qui n'existe pas.
- [ ] Code mort : `campaigns` (état), `BRANDS`, `Campaign`, `PlaqueName`, `Site`, `toLocalIso`, `getPeriodRanges` importés sans usage ; `COLORS.violet/green/grid/bgPanel` inutilisés ; `cumulReel` calculé non affiché.
- [ ] Rafraîchissement temps réel : chaque événement recharge les 6 ressources en entier (y compris la ressource inutilisée) — cf. mémoire « Audit perf lot 2 : Dashboard qui recharge même masqué ».
