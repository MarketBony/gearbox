# Inventaire fonctionnel — Campagnes

Sources : `pages/Campaigns.tsx` (896 l.), `components/ChampDiffere.tsx` (`ChampTexte`, `ChampNombre`), `components/DateRangePicker.tsx`, `services/fileSauvegardeProjet.ts`, `utils/projet.ts`, `App.tsx`, `components/Sidebar.tsx`, `constants.ts`. Voir `_FORMAT.md`.

Nature de la page : il n'y a PAS d'entité « campagne » gérée ici. Une campagne est une **tâche de projet dont le canal est `SMS` ou `E-mail`** (`Campaigns.tsx:140`). Le modèle `Campaign` / la route `/api/campaigns` existent mais ne sont pas utilisés par cet écran (voir section 11).

## 1. Accès et rôles

- [ ] Entrée de menu « Campagnes » (icône Megaphone) : `Sidebar.tsx:217`, regroupée sous « COM DIGITALE » à côté de Digital (`Sidebar.tsx:326-327`). Aucun masquage par rôle dans la Sidebar pour Guest.
- [ ] `External` : `campaigns` absent de `EXTERNAL_ALLOWED_TABS` → redirigé vers `digital` (`App.tsx:80,90`).
- [ ] `Site Manager` : `campaigns` absent de `SITE_MANAGER_SECTIONS` (`constants.ts:719`) → redirigé vers `dashboard` (`App.tsx:102`) et retiré de la navigation (`Sidebar.tsx:230`). ⚠️ Côté serveur, la donnée lue est `GET /api/projects` (cloisonné par `scopeOf` / `redactSiteFields`, `projects.ts:20-33`) : le cloisonnement serveur existe, mais la rubrique elle-même n'est fermée que par le routage client.
- [ ] Visible en lecture par : Master, Administrator, Director, Coordinator, Digital Manager, Guest.
- [ ] Écriture (`canEdit`) : `Master`, `Administrator`, `Director`, `Coordinator` (`Campaigns.tsx:91`). ⚠️ `Digital Manager` peut écrire sur `PUT /api/projects/:id` (`EDIT_ROLES` de `projects.ts:18`) mais les champs sont grisés pour lui sur cet écran.
- [ ] Lecture seule (Guest, Digital Manager) : mêmes cellules rendues en `disabled` (`opacity-50`), `updateTaskField` sort immédiatement si `!canEdit` (l.170).
- [ ] Le client ne fabrique aucune donnée : tout dérive de `db.getProjects()`. Les valeurs coût, facturation, indicateurs viennent des tâches.

## 2. Structure

- [ ] Une seule vue, verticale : (a) barre de période + bouton graphiques, (b) barre de recherche + bouton « Filtres Liste » + panneau de filtres, (c) zone défilante contenant les 3 graphiques (repliables), l'en-tête de colonnes collant (desktop) et la liste.
- [ ] Panneau de filtres : `showFilters`, état local (non persistant). Ouvert par le bouton « Filtres Liste ».
- [ ] Graphiques repliables : `useSessionState('campaigns_chartsOuverts', true)`.
- [ ] Défilement restauré : `useScrollRestore('campaigns')`.
- [ ] Clés `useSessionState` (sessionStorage, préfixe `gearbox_session_`, `useSessionState.ts:9`) :
  - `campaigns_start` (défaut `<année courante>-01-01`)
  - `campaigns_end` (défaut `<année courante>-12-31`)
  - `campaigns_filterChannel` (défaut `'All'`)
  - `campaigns_c2Metric` (défaut `'Volume'`)
  - `campaigns_chartsOuverts` (défaut `true`)
  - `campaigns_searchTerm` (défaut `''`)
  - `campaigns_filterContext` (défaut `'All'`)
  - `campaigns_filterService` (défaut `'All'`) — clé écrite mais AUCUN contrôle ne la pilote (voir défauts)
  - `campaigns_filterBrand` (défaut `'All'`)
  - `campaigns_sortOrder` (défaut `'desc'`)

## 3. Filtres et sélecteurs

Le canal et la période pilotent à la fois les graphiques ET la liste ; les autres filtres ne pilotent que la liste (refonte du 30/07/2026, commentaires l.93-97, 388-393).

- [ ] **Période** (en-tête) : `DateRangePicker` (composant du Dashboard), début et fin. Raccourcis : « Aujourd'hui », « Cette semaine », « Ce mois », « Ce trimestre », « Le trimestre dernier », « Ce semestre », « Le semestre dernier », « Cette année », « L'année dernière », « Personnalisé » (`DateRangePicker.tsx:85-95`). Défaut : année courante. Règle : sur `parentStartDate` (date de DÉBUT du projet parent, PAS une date de la tâche) — liste : `>= start` et `<= end` en comparaison de chaînes (l.350-351) ; graphiques : `Date` début inclus / fin jusqu'à 23:59:59 (l.218-228).
- [ ] **Recherche** : placeholder « Filtrer la liste... », texte libre. Règle : `name` de la tâche OU `parentProjectName`, insensible à la casse (l.320-323). Liste seulement.
- [ ] **Canal** (panneau) : trois boutons exclusifs « TOUT » / « E-MAIL » / « SMS » (`All`, `E-mail`, `SMS`), défaut TOUT. Pilote liste ET graphiques (`t.channel === filterChannel`).
- [ ] **Plaque / Site** (panneau) : `Select` simple, options : « TOUT LE RÉSEAU » (`All`), puis pour chaque plaque de `PLAQUES_STRUCTURE` « ★ <PLAQUE> » suivie de ses sites (l.461-472). Règle (l.326-338) : si `filterContext` est `'GROUPE BONY'` → aucun filtre (mais cette valeur n'est pas dans les options) ; si plaque → `parentProjectSite === plaque` OU site du projet dans la plaque ; sinon `parentProjectSite === site`. ⚠️ Compare `p.site` (site principal) et jamais `p.sites[]` : un projet multi-sites n'est retrouvé que par son site principal.
- [ ] **Marque** (panneau) : boutons exclusifs « TOUT » + `BRANDS` sans Holding (Renault, Dacia, Alpine, Nissan, Mobilize) (l.482). Règle : `parentBrands` contient la marque OU contient `Holding` (l.345-348). Donc un projet Holding remonte pour toute marque sélectionnée.
- [ ] **Service** : état `filterService` existant avec règle (`parentServices` contient le service OU `'Tous Services'`, l.340-343) mais AUCUN contrôle d'interface : filtre mort (voir section 11).
- [ ] **Métrique du graphique 2** : `Select` « Volume » / « Ouverture » / « Clics » (petit sélecteur à droite du titre « Performance »), affichage seulement.
- [ ] Bouton « RÉINITIALISER TOUT » (panneau) : recherche, contexte, service, marque, canal → `All`/vide ; période → année courante ; tri → `desc`. Ne touche pas `c2Metric` ni le repli des graphiques (l.363-374). Compteur « N RÉSULTAT(S) » à côté.

## 4. Affichage

- [ ] **Source des lignes** : pour chaque projet dont `status !== 'Draft'`, chaque tâche de canal `SMS` ou `E-mail` (l.132-154). Champs hérités du projet : `parentProjectName`, `parentProjectSite` (= `p.site`), `parentBrands`, `parentServices`, `parentStartDate`.
- [ ] **Tri** : par `parentStartDate`, ascendant/descendant ; défaut DESC (le plus récent en haut). Un seul tri proposé, via clic sur l'en-tête « Date » (flèche haut/bas) (l.672-678). Desktop uniquement.
- [ ] **Graphique 1 « Nb Campagnes »** (barres orange `#f75632`) : nombre de tâches filtrées (période + canal) regroupées par date de début de projet ; libellé d'axe = mois court si plage > 60 jours, sinon `jj/mm` (l.230-253). Étiquettes au sommet.
- [ ] **Graphique 2 « Performance »** (violet `#8f12ab`) : par date, Volume = SOMME de `volumetry` (barres) ; Ouverture = MOYENNE arrondie de `openRate` ; Clics = MOYENNE arrondie de `clickRate` (courbe, axe et étiquettes en %). Valeur manquante comptée 0 dans la moyenne (l.256-281).
- [ ] **Graphique 3 « Facturé / Svc »** (anneau + légende) : montant = `billedAmount || cost || 0` ; service = PREMIER de `parentServices` (sinon « Tous Services ») ; « Tous Services » réparti à parts égales (÷4) sur VN, VO, APV, PR ; total et pourcentage arrondis ; entrées à 0 masquées ; tri décroissant. Couleurs : VN orange, VO violet, APV bleu nuit `#293f74`, PR cyan `#06b6d4`. Légende « <valeur>€ » et « <pct>% ». Texte vide : « Aucune donnée » (l.284-314, 659). ⚠️ Un service de type autre que VN/VO/APV/PR/Tous Services est ignoré du groupe mais compté dans le total.
- [ ] **En-tête de colonnes collant (desktop)** : Date (triable) · « Campagne / Projet » · Coût (2 colonnes) · Vol. · Ouv. · NPAI · STOP · Clics · COD TXT · Factu (grille 9 colonnes) (l.671-690).
- [ ] **Ligne desktop** (l.719-880) : date `jj/mm/aa` (`formatDateCompact`, `-` si absente/invalide) ; icône Mail (orange) pour E-mail ou MessageSquare (bleu) pour SMS ; ligne 1 = nom du projet ; ligne 2 = nom de la tâche + puce du site + puces des marques (`BRAND_COLORS`) ; Coût `N €` en lecture seule (`task.cost`, non formaté) ; puis les 7 champs saisissables (voir section 5). Bordure au survol : orange (E-mail) / bleu (SMS).
- [ ] **Carte mobile** (l.694-709) : date `fr-FR` complète, canal, nom (`c.name || c.parentProjectName`), site, `Vol: N` si renseigné, coût `N€` si renseigné. Lecture seule.
- [ ] Aucun KPI chiffré global ; le seul compteur est « N RÉSULTAT(S)».

## 5. Formulaires

Pas de formulaire ni de modale. Édition en ligne, par cellule, sur les tâches du projet (desktop uniquement), via `ChampNombre` / `ChampTexte` : brouillon local, **commit au blur** (aussi au démontage, onglet caché et fermeture, `ChampDiffere.tsx`). Écrit via `updateTaskField` → `PUT /api/projects/:id` (projet entier, mise en file par `fileSauvegardeProjet`).

- [ ] **Coût** : lecture seule (affiché, non éditable).
- [ ] **Vol.** (`volumetry`) : nombre, placeholder « 0 », `videVaut="null"` (vide = non renseigné), sans borne.
- [ ] **Ouv.** (`openRate`), **NPAI** (`npaiRate`), **STOP** (`stopRate`), **Clics** (`clickRate`) : nombre, placeholder « - », `videVaut="null"`, borné 0-100 au commit (pas à la frappe).
- [ ] **COD TXT** (`codTxt`) : texte, placeholder « Code... », centré.
- [ ] **Factu** (`billedAmount`) : nombre, placeholder « 0 », `videVaut="null"`, suffixe « € », gras, focus orange.
- [ ] Liste blanche serveur `TASK_FIELDS` (`projects.ts:~66`) contient `volumetry, openRate, npaiRate, stopRate, clickRate, codTxt, billedAmount` : vérifié pour ces 7 champs. Champs `Float?` en base, donc une chaîne vide écrit `null`.
- [ ] Aucune création ni suppression de campagne depuis cet écran : le message vide renvoie vers les projets.

## 6. Actions

- [ ] Modifier un des 7 champs (rôles `canEdit`) : recalcul local par `recalculerProjet` (progression, budget réel), miroir `projetsRef` mis à jour immédiatement, puis `fileSauvegardeProjet.pousser` (un seul PUT en vol par projet). Réponse serveur appliquée seulement si aucune écriture en attente et aucun champ focalisé (l.185-192).
- [ ] Refus d'écrire si la tâche ou le projet n'existe plus dans l'état courant (l.172-175), pour ne pas ressusciter une ligne au flush du démontage.
- [ ] Journal d'activité : seulement si `field === 'status'` (`db.logActivity`, « a changé le statut de la tâche ») — ne se déclenche JAMAIS ici car aucun des 7 champs n'est `status` (code mort, voir défauts).
- [ ] Trier par date (clic sur l'en-tête Date). Masquer/afficher les graphiques. Réinitialiser les filtres.
- [ ] Pas d'export, de suppression, de duplication, d'archivage, de glisser-déposer, de raccourci ni d'action en masse (malgré le titre historique « LISTING & ÉDITION EN MASSE » cité en commentaire).

## 7. Temps réel et chargement

- [ ] `useRealtimeSync(RT_EVENTS.projects, loadData)` : `projects:updated`, `projects:deleted` uniquement (l.123). Pas d'écoute de `tasks:*` ni `campaigns:*` (inutile ici : les tâches de projet transitent par `projects`).
- [ ] Chargement initial : `loadData()` au montage ; AUCUN état de chargement affiché (liste et graphiques vides puis remplis, donc l'état vide « AUCUNE CAMPAGNE TROUVÉE » clignote avant les données).
- [ ] Indicateur d'écriture : « ENREGISTREMENT... » (icône Save, orange, clignotant), desktop seulement (`hidden md:flex`).
- [ ] Protection de saisie : compteur `champsFocalisesRef` empêche un rechargement d'écraser un champ en cours d'édition.

## 8. États vides et erreurs

- [ ] Liste vide : icône Megaphone, « AUCUNE CAMPAGNE TROUVÉE », « Ajoutez des tâches "SMS" ou "E-mail" dans vos projets. » (l.885-889).
- [ ] Graphique 3 sans donnée : « Aucune donnée ». Graphiques 1 et 2 vides : simplement sans barres.
- [ ] Erreurs d'écriture (`onEchec`, l.196-205), toutes par `alert` : non-`ApiError` « Échec inattendu de la sauvegarde. » ; statut 0 « Serveur injoignable. Vos modifications ne sont PAS perdues — ne fermez pas cet onglet. » ; 503 « La base est momentanément saturée. Réessayez dans une minute. » ; 401 silencieux (déconnexion déjà déclenchée) ; 403 « Droits insuffisants pour modifier cette campagne. » ; 404/409 message serveur ou « Données périmées : rechargement. » puis `loadData()` ; autre : message serveur ou « Échec de la sauvegarde. ».
- [ ] Échec de `loadData` (lecture) : aucun traitement (pas de `try/catch`).

## 9. Règles métier touchées

- [ ] **Brouillon** : les projets `Draft` sont exclus (`if (p.status === 'Draft') return`, l.138) — règle appliquée EN LOCAL, sans passer par `constants.ts`. Les projets `Archived` restent comptés.
- [ ] **Holding** : le filtre Marque fait remonter un projet taggué Holding pour n'importe quelle marque (l.346) ; l'option « Holding » elle-même est retirée du filtre. Pas d'imputation budgétaire ici. `isHoldingBrand()` n'est pas utilisé.
- [ ] **Alpine / Nissan / curseurs `alpineShare`/`nissanShare`** : NON appliqués. Le graphique 3 « Facturé / Svc » ne répartit pas par marque ni par site ; `resolveBudgetLine` / `splitShareToBuckets` / `resolveSiteAlias` ne sont pas appelés.
- [ ] **GROUPE BONY** : la valeur est prévue dans le filtre de site (`isGroup`, l.327) mais absente des options ; `DISTRIBUTION_GROUPE_BONY` non utilisée.
- [ ] Montant de campagne : `billedAmount || cost` (jamais `budgetActual`) ; « Tous Services » divisé en 4.
- [ ] Recalcul projet (`recalculerProjet`, `utils/projet.ts`) à chaque saisie : à réutiliser tel quel en v2.

## 10. Mobile

- [ ] Sous `md:` : l'en-tête de colonnes collant est masqué ; les lignes deviennent des cartes LECTURE SEULE (aucun champ éditable, pas de tri par date, pas de NPAI/STOP/Clics/COD TXT/Factu/Ouv.).
- [ ] Graphiques : grille 1 colonne (`grid-cols-1 md:grid-cols-3`, hauteur auto en mobile, `md:h-64`). Le libellé du bouton « Masquer/Afficher l'analyse » disparaît (`hidden sm:inline`), l'icône reste ; le bouton « Filtres Liste » perd son libellé sous `sm`.
- [ ] Panneau de filtres : grille 2 colonnes mobile, 4 en `md:`. Boutons 44 px de haut (`min-h-[44px]`).
- [ ] Le témoin « ENREGISTREMENT... » est masqué sur mobile (sans importance : pas d'édition).

## 11. Défauts et bizarreries relevés

1. **Filtre Service mort** : `filterService` (`campaigns_filterService`) est lu par le filtre de liste, remis à `All` par la réinitialisation, mais aucun contrôle ne le modifie. Le composant `FilterSelect` n'est utilisé que pour la métrique du graphique 2.
2. **Code mort** : le journal `db.logActivity` sur `status` (l.209-211) ne peut plus se produire ; imports `Legend`, `Calendar`, `ArrowUpDown` non utilisés dans le JSX lu (non vérifié par outil) ; commentaire « Simplified for brevity » (l.214-215).
3. **Digital Manager** : autorisé en écriture sur `PUT /api/projects/:id` mais grisé ici (`canEdit` sans lui) — incohérence de listes de rôles.
4. **Filtre Site** : compare `p.site` uniquement, ignore `p.sites[]` ; option `GROUPE BONY` gérée en code mais non proposée.
5. **Période sur `parentStartDate`** (début du projet), pas sur une date de campagne : deux campagnes d'un même projet partagent la même date ; les tâches n'ont pas de date d'envoi propre ici.
6. **Absence d'état de chargement** : l'état vide s'affiche avant l'arrivée des données ; pas de gestion d'erreur de lecture.
7. **Graphique 2 (moyennes)** : une valeur non renseignée compte pour 0 dans la moyenne d'ouverture/clics, ce qui tire le taux vers le bas.
8. **Graphique 3** : `amount = billedAmount || cost` ; un facturé à 0 explicite retombe sur le coût. Un service hors liste est compté dans le total mais pas dans les parts.
9. **Cartes mobiles** : `{c.volumetry && …}` / `{c.cost && …}` : un `0` s'afficherait comme « 0 » brut (rendu React d'un nombre 0).
10. **Route `/api/campaigns` et `db.getCampaigns` (`dataService.ts:290`) existent** (utilisées par le Dashboard, `Dashboard.tsx:329`) mais l'écran Campagnes ne s'en sert pas : deux notions de « campagne » coexistent.
11. Le ticket historique de cette fiche dans `BUGS-CONNUS.md` du 29/09 n'a pas été relu pour ce lot ; aucun renvoi précis n'est donné ici.
