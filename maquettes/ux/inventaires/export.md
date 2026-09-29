# Inventaire fonctionnel — Export

Sources : `pages/Export.tsx` (277 l.), `components/DatePicker.tsx` (importé), `components/Sidebar.tsx:203,222,350`, `App.tsx:87,92,159`.

## 1. Accès et rôles

- [ ] Constante `EXPORT_ALLOWED_ROLES = ['Master', 'Administrator', 'Director', 'Coordinator']` (`pages/Export.tsx:8`). Digital Manager, Site Manager, External, Guest : **exclus**.
- [ ] Navigation : `Sidebar.tsx:203` **réécrit la liste en dur** (`role === 'Master' || 'Administrator' || 'Director' || 'Coordinator'`) au lieu d'importer `EXPORT_ALLOWED_ROLES` ; entrée « Export » (icône FileSpreadsheet) dans `allMainItems` (l.222) et dans le groupe OUTILS de la nav groupée (l.350).
- [ ] Routage : `App.tsx:87` importe la constante ; `App.tsx:92` `resolvedTab === 'export' && !canExport` → retombe sur `dashboard`.
- [ ] Défense en profondeur dans la page : si `!canExport`, écran « Accès restreint » (`Export.tsx:41-51`).
- [ ] Lecture seule / chef de site : Site Manager n'a pas la rubrique (liste fermée de rubriques) ; les rôles autorisés ne sont pas cloisonnés par site, `db.getProjects()` et `db.getFixedExpenses()` renvoient donc les données complètes.
- [ ] Pas d'appel API dédié : l'export est fabriqué **entièrement côté client** à partir de `getProjects()` et `getFixedExpenses()` (aucune route d'export, aucune écriture).

## 2. Structure

- [ ] Page unique, une carte : en-tête (icône FileSpreadsheet sur dégradé Bony, titre « Export Excel », sous-titre « Projets et dépenses fixes sur une période, au format .xlsx ») puis carte de configuration (`gx-card`) contenant la période, le bouton de génération et les retours.
- [ ] Aucun onglet, aucun état de session persistant (`useState` seulement : `from`, `to`, `loading`, `result`, `message`). Rien n'est mémorisé d'une visite à l'autre.
- [ ] Largeur `max-w-2xl` centrée, page défilante (`h-full overflow-y-auto`).

## 3. Filtres et sélecteurs

- [ ] **Période — « Du »** : `DatePicker` (size `sm`, placeholder « Début »), valeur `YYYY-MM-DD`, défaut **1er janvier de l'année courante** (`${year}-01-01`). Modifier « Du » à une date > « Au » repousse « Au » à la même date (`Export.tsx:214`).
- [ ] **Période — « Au »** : `DatePicker` (size `sm`, placeholder « Fin », `minDate = from`), défaut **31 décembre de l'année courante**.
- [ ] Application (`Export.tsx:67-85`) :
  - **Projets** : conservés si `status !== 'Draft'`, `startDate` renseignée et `from <= startDate <= to` (filtrés sur la **date de début**).
  - **Dépenses fixes** : conservées si `date` renseignée et `from <= date <= to` (filtrées sur leur date).
  - Bornes vides : `-Infinity` / `+Infinity` (les DatePicker ne les vident pas par défaut, mais le code le prévoit).
  - Comparaison en temps local via `parseLocalDate` (anti-décalage J+1), pas d'`ISO` direct.
- [ ] Aucun filtre par site, marque, service, statut (hors exclusion des brouillons) : le périmètre n'est pas paramétrable.
- [ ] Texte d'aide sous la période : « Les projets sont filtrés sur leur date de début, les dépenses sur leur date. Le fichier contient 2 onglets : Projets et Dépenses. »

## 4. Affichage

- [ ] Écran : uniquement le formulaire, le bouton et le retour ; aucun aperçu des données, aucun tableau.
- [ ] Retour succès (vert) : « Export généré avec succès. » puis « {n} projet(s) · {m} dépense(s) fixe(s). » (accords au pluriel).
- [ ] Retour info/erreur : bandeau ambre (`info`) ou rouge (`error`) avec icône AlertCircle.

### Contenu du fichier `.xlsx`
Nom : `GEARBOX_Export_{from|debut}_{to|fin}.xlsx`. Bibliothèque `xlsx-js-style` importée dynamiquement (`import('xlsx-js-style')`). En-têtes : gras, blanc, fond `#293F74`, bordure basse `#F75632`, centré, retour à la ligne. Filtre automatique sur l'en-tête, largeurs de colonnes fixes.

- [ ] Onglet **« Projets »** (13 colonnes) : Nom · Site(s) · Marque(s) · Service(s) · Type · Statut · PRO+ · Date début · Date fin · Budget prévisionnel · Budget réalisé · Avancement (%) · Description.
  - Site(s) = `p.sites` si non vide sinon `[p.site]`, joint par « , » ; Marque(s) = `p.brands` ; Service(s) = `p.service` ; Type = `projectType`.
  - Statut traduit : Draft→« Brouillon », Active→« Actif », Done→« Terminé », Archived→« Archivé » (Draft n'apparaît jamais, exclu).
  - PRO+ = « Oui » / « Non » (`p.proPlus`).
  - Dates au format `toLocaleDateString('fr-FR')`.
  - Budgets et avancement en nombres (`Number(...||0)`), format `#,##0` sur les colonnes indices 9 et 10 (budgets) ; avancement non formaté en milliers.
  - Largeurs : 34, 22, 18, 16, 16, 12, 8, 12, 12, 18, 16, 14, 50. **Pas de tâches** dans l'export.
  - Ordre des lignes : celui de `db.getProjects()` (aucun tri appliqué).
- [ ] Onglet **« Dépenses »** (7 colonnes) : Date · Site(s) · Marque(s) · Service · Commentaire · Montant · PRO+.
  - Site(s) = `e.sites` si non vide sinon `[e.site]` ; Marque(s) = `e.brands` sinon `[e.brand]` ; Montant en nombre, format `#,##0` sur la colonne 5 ; PRO+ « Oui »/« Non ».
  - Largeurs : 12, 22, 18, 14, 50, 16, 8. Aucun tri appliqué.
- [ ] L'export ne contient ni répartition (`alpineShare`/`nissanShare`), ni `budgetDistribution`, ni calcul de budget : ce sont les valeurs brutes des enregistrements.

## 5. Formulaires

- [ ] Deux champs : « Du » et « Au » (voir §3). Aucun champ obligatoire bloquant (bornes vides tolérées).
- [ ] Validation : si `from > to` (comparaison sur dates locales) → erreur « La date de début doit précéder la date de fin. » (`Export.tsx:57-60`), aucun chargement.
- [ ] Aucune liste blanche serveur (rien n'est envoyé).

## 6. Actions

- [ ] Bouton unique pleine largeur **« Générer le fichier Excel »** (icône Download) ; pendant l'opération : « Génération en cours… » avec spinner, bouton désactivé.
- [ ] Séquence : réinitialise `message` et `result` → valide la période → charge projets + dépenses en parallèle (`Promise.all`) → filtre → si rien, message info → importe `xlsx-js-style` → construit les deux feuilles → `XLSX.writeFile` (téléchargement navigateur) → affiche le résumé.
- [ ] Aucun effet de bord sur les données (lecture seule, deux GET). Pas de confirmation, pas de raccourci, pas d'action en masse.

## 7. Temps réel et chargement

- [ ] Aucun `RT_EVENTS` écouté, aucun chargement à l'ouverture : les données sont lues **à la demande**, au clic, donc toujours fraîches.
- [ ] État de chargement unique : `loading` (bouton désactivé + spinner + « Génération en cours… »).

## 8. États vides et erreurs

- [ ] Aucune donnée sur la période : bandeau ambre « Aucune donnée (projet ou dépense fixe) sur la période sélectionnée. » ; aucun fichier généré. Le test porte sur les deux listes ensemble (un onglet vide est produit si l'autre a des données).
- [ ] Erreur inattendue (réseau, import, écriture) : `console.error('Export error:', err)` et bandeau rouge « Une erreur est survenue lors de la génération du fichier. »
- [ ] Rôle non autorisé : écran « Accès restreint » — « L'export des données est réservé aux rôles de gestion (Master, Administrateur, Directeur, Coordinateur). »

## 9. Règles métier touchées

- [ ] **Brouillon (`Draft`) exclu** des projets exportés (`Export.tsx:76`), conformément à « ne remonte nulle part » (correction du 30/07/2026). Les dépenses n'ont pas de statut.
- [ ] **Holding, Alpine par site, Nissan global, curseurs** : **non appliqués**. L'export livre les enregistrements bruts (tags, sites, montants), sans routage budgétaire ni `resolveBudgetLine`/`splitShareToBuckets`/`isHoldingBrand`. Un projet Holding est donc exporté comme les autres (conforme : « tracké » reste dans l'Export).
- [ ] **PRO+ (`proPlus`)** exporté en clair (« Oui »/« Non ») ; c'est le marqueur métier, à ne pas confondre avec `expertMode` (non exporté).
- [ ] Rôles cloisonnés : Site Manager exclu par la liste de rôles ; pas de `redactSiteFields`, car aucun rôle restreint n'accède à la page.
- [ ] Périmètre `GROUPE BONY` : les sites d'un projet sont écrits tels quels (« GROUPE BONY » apparaît dans la colonne Site(s) si présent), sans ventilation.

## 10. Mobile

- [ ] Peu de différences : padding `p-4 md:p-8` de la page, carte `p-5 md:p-6`, les deux DatePicker passent d'1 colonne (`grid-cols-1`) à 2 colonnes dès `sm`.
- [ ] Le fichier se télécharge via le navigateur du téléphone (comportement non testé ici).

## 11. Défauts et bizarreries relevés

- [ ] **Liste de rôles dupliquée** : `Sidebar.tsx:203` recopie en dur les quatre rôles au lieu d'utiliser `EXPORT_ALLOWED_ROLES` (risque de divergence, cf. remarque déjà écrite dans la Sidebar pour Jeux).
- [ ] Pas de garde serveur propre à l'export : la restriction repose sur le frontend ; les lectures `getProjects`/`getFixedExpenses` sont accessibles à d'autres rôles par leurs propres routes (à vérifier au lot de portage si l'on veut un contrôle serveur).
- [ ] Aucun tri : l'ordre des lignes est celui de l'API.
- [ ] Le test « aucune donnée » exporte quand même un onglet vide si une seule des deux listes est vide (comportement voulu ? à confirmer).
- [ ] Le filtre projets porte sur `startDate` seule : un projet commencé avant la période mais actif pendant n'est pas exporté (libellé d'aide explicite, mais surprenant).
- [ ] Ni les tâches ni le détail de ventilation budgétaire ne sont exportés (commentaire « sans les tâches »).
- [ ] Un lien « fiche » de `BUGS-CONNUS.md` : la seule mention pertinente est la correction du 30/07/2026 (brouillons, ligne 25) ; le halo `shadow-glow` reste toléré sur Export (`BUGS-CONNUS.md:103`).
