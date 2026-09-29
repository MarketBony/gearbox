# Inventaire fonctionnel — Matériel

Source : `pages/Material.tsx` (735 l.), `components/calendar/CalendarGrid.tsx`, `EventBar.tsx`, `calendarShared.ts`, `backend/src/routes/equipment.ts`, `backend/src/routes/equipmentBookings.ts`, `backend/src/utils/availability.ts`.
Titre de page : « Gestion Matériel » (`Material.tsx:372`). Libellé de menu : « Matériel » (`Sidebar.tsx:218`, `:348`).

## 1. Accès et rôles

- [ ] Rubrique visible pour tous les rôles **sauf** External et Site Manager : entrée `material` dans `allMainItems` (`Sidebar.tsx:218`), groupe « OUTILS » du menu desktop (`Sidebar.tsx:348`).
- [ ] External : menu filtré sur `digital`, `chat`, `hello-marketing` (`Sidebar.tsx:~232`) ; `App.tsx` redirige vers `digital` (`EXTERNAL_ALLOWED_TABS`, `App.tsx:78`).
- [ ] Chef de site (`Site Manager`) : `material` absent de `SITE_MANAGER_SECTIONS` (`constants.ts:719`) ; filtré du menu et redirigé vers `dashboard` (`App.tsx:107`).
- [ ] Guest : aucune restriction côté client ni serveur pour le Matériel (il voit et peut réserver, cf. section 11).
- [ ] **Réserver / modifier / supprimer une réservation : tout utilisateur authentifié** (`equipmentBookings.ts`, aucun `requireRole`). Aucun `EDIT_ROLES`, pas de notion de « propriétaire » de la réservation : tout le monde peut modifier/supprimer celle d'un autre.
- [ ] **Gérer le catalogue (ajouter / modifier / supprimer un matériel) : Master, Administrator, Director** uniquement (`canManageCatalog`, `Material.tsx:72` ; `MANAGE_ROLES`, `equipment.ts:9`). Les autres voient l'inventaire en lecture seule (colonne Actions vide, bouton d'ajout absent).
- [ ] Cloisonnement serveur : **aucun** (`siteScope` non utilisé). `GET /api/equipment` et `GET /api/equipment-bookings` renvoient tout à tout compte authentifié.
- [ ] Le client ne fabrique aucune donnée : listes issues de `db.getEquipment()` / `db.getEquipmentBookings()`. Le calcul de disponibilité est refait côté client (affichage) ET vérifié côté serveur (409).
- [ ] Ouverture depuis une notification/activité : les entités d'activité `equipment` et `booking` ouvrent l'onglet `material` (`Sidebar.tsx:163-166`).

## 2. Structure

- [ ] Deux onglets, boutons segmentés « Planning » / « Inventaire » — état `useSessionState` clé `material_activeTab`, défaut `planning` (`Material.tsx:73`).
- [ ] Sous-vue du Planning : boutons « SEMAINE » / « MOIS » — clé `material_viewMode`, défaut `week` (`:79`).
- [ ] Filtre matériel du Planning — clé `material_selectedEquipmentId`, défaut `All` (`:81`).
- [ ] Date affichée (`currentDate`) : `useState` simple, **non persistée**, défaut = aujourd'hui, réinitialisée à chaque montage.
- [ ] Position de défilement mémorisée : `useScrollRestore('material', !loading)` (`:83`), passée au `CalendarGrid` mois uniquement.
- [ ] Deux modales : réservation (`isBookingModalOpen`) et matériel (`isInventoryModalOpen`), non persistées.

## 3. Filtres et sélecteurs

- [ ] **Navigation temporelle** (Planning) : flèches précédent/suivant (pas = 1 semaine en vue Semaine, 1 mois en vue Mois), bouton « AUJOURD'HUI », libellé central = mois + année en majuscules (`MMMM yyyy`, locale fr) — identique pour semaine et mois (`:420`).
- [ ] **Sélecteur matériel** (icône entonnoir, sans libellé) : simple ; options « TOUT LE MATÉRIEL » (`All`) + chaque équipement (`e.name`, ordre alphabétique serveur) ; défaut `All` ; persisté en session ; règle : `bookings.filter(b => sel==='All' || b.equipmentId===sel)` (`:307`).
- [ ] Aucun filtre par site, service, marque ou période. L'Inventaire n'a ni filtre ni recherche ni tri (ordre serveur : `name` asc).
- [ ] Une valeur persistée qui ne correspond plus à aucun équipement (supprimé) n'est pas réinitialisée : le planning s'afficherait vide (cf. section 11).

## 4. Affichage

- [ ] **Planning** : grille `CalendarGrid` partagée avec Agenda (vues `week` / `month`), items = réservations filtrées, clic sur un jour = nouvelle réservation pré-remplie à cette date, clic sur une barre = édition.
- [ ] Barre de réservation (`EventBar`) : couleur d'accent par **service** (`serviceAccent(booking.service)`) ; troncature gauche/droite quand la réservation déborde la vue (`clipLeft`/`clipRight`).
  - vue Semaine : « {quantité}x » + nom du matériel (« Inconnu » si introuvable) ; 2e ligne « {site} · {service} ».
  - vue Mois : « {quantité}x » + nom + « - {site} ».
- [ ] Infobulle au survol : nom du matériel, description, pastilles site et service, puis « dd MMM - dd MMM yyyy » (`BookingTooltipContent`, `:53`). La marque n'est pas affichée.
- [ ] **Inventaire** : tableau, colonnes « Nom du matériel », « Catégorie » (pastille), « Quantité Totale » (chiffre orange monospace), « Actions » (crayon + poubelle, visibles si `canManageCatalog`). Conteneur `max-w-5xl` centré. Tri : ordre serveur (nom asc), aucun tri utilisateur.
- [ ] Aucun compteur, KPI ni disponibilité résiduelle affichés dans l'Inventaire (la quantité restante n'apparaît que dans la modale de réservation).
- [ ] Disponibilité (`getAvailability`, `:134`) : pour la plage [début, fin], on ne retient que les réservations du même matériel qui chevauchent (hors la réservation éditée), puis on prend le **maximum journalier** de quantité utilisée ; disponible = `max(0, totalQuantity − maxUsed)`.

## 5. Formulaires

### Réservation (modale « Nouvelle réservation » / « Modifier la réservation », `Material.tsx:515`)
- [ ] **Matériel** — Select, obligatoire ; options « {nom} (Total: {totalQuantity}) » ; défaut = matériel filtré, sinon le premier de la liste ; **désactivé en édition**.
- [ ] **Date de début** — DatePicker, obligatoire ; défaut = jour cliqué ou aujourd'hui (`yyyy-MM-dd`).
- [ ] **Date de fin** — DatePicker, obligatoire ; même défaut. Aucune validation client fin ≥ début (contrôle serveur seulement en POST/PUT, cf. section 11).
- [ ] **Quantité** — nombre, min 1, obligatoire, défaut 1. Affiche « Disponible : N » (rouge si 0, vert sinon) dès que matériel + dates sont renseignés ; `max` = disponible ; la saisie supérieure au disponible est ignorée silencieusement (`:573`).
- [ ] **Site** — Select ; options : `GROUPE BONY`, puis tous les sites de `PLAQUES_STRUCTURE` (Centre, Nord, Sud, Sud-Ouest, dans l'ordre des plaques), puis `Alpine`, `Nissan` ; défaut `GROUPE BONY`. (Ne contient PAS Montluçon ni Saint-Etienne, absents de `PLAQUES_STRUCTURE`.)
- [ ] **Service** — Select, options = `SERVICES` (`VN`, `VO`, `APV`, `PR`, `Tous Services`) ; défaut `Tous Services`.
- [ ] **Description / Détail OP** — textarea (placeholder « Détails de l'événement... »), facultatif.
- [ ] Marque : le champ `brand` existe (`types.ts:275`), est initialisé à `Holding` à la création (`:286`) mais **n'a aucun champ dans le formulaire**.
- [ ] Validation client : « Veuillez remplir tous les champs obligatoires. » (matériel, dates, quantité) ; « Stock insuffisant ! Disponible : X / Y » (alerte navigateur).
- [ ] Validation serveur : matériel/quantité entier positif/dates valides ; fin ≥ début ; chaînes pour site/service/brand/description ; disponibilité recalculée dans une transaction avec verrou (409 « Stock insuffisant : N demandé(s), X disponible(s) sur Y pour cette période. Quelqu'un vient peut-être de réserver ce matériel — rechargez pour voir les réservations à jour. »).
- [ ] Pas de liste blanche d'écriture sur ces routes : champs lus explicitement (`equipmentId, quantity, startDate, endDate, site, service, brand, description`).

### Matériel (modale « Nouveau matériel » / « Modifier le matériel », `:671`)
- [ ] **Nom du matériel** — texte, obligatoire (placeholder « Ex: Enceinte JBL »).
- [ ] **Catégorie** — texte libre, facultatif (placeholder « Ex: Son, Mobilier, PLV... ») ; défaut à la création `Autre`.
- [ ] **Quantité Totale** — nombre, min 1, obligatoire, défaut 1 ; entier positif côté serveur.
- [ ] Validation client : « Veuillez remplir le nom et la quantité. »
- [ ] Aucun contrôle qu'une baisse de `totalQuantity` reste compatible avec les réservations existantes (cf. section 11).

## 6. Actions

- [ ] Créer une réservation : bouton « RÉSERVER » (icône +, libellé masqué sous `sm`) visible sur l'onglet Planning ; ou clic sur un jour de la grille.
- [ ] Modifier une réservation : clic sur la barre → modale ; bouton « Enregistrer » / « Annuler ».
- [ ] Supprimer une réservation : bouton rouge « Supprimer » (édition seulement) → confirmation en ligne « Confirmer ? » + « OUI » / « NON » ; pas de `confirm()` navigateur.
- [ ] Ajouter un matériel : bouton « AJOUTER MATÉRIEL » (onglet Inventaire, `canManageCatalog`).
- [ ] Modifier un matériel : icône crayon (ligne du tableau, `canManageCatalog`).
- [ ] Supprimer un matériel : icône poubelle → `confirm()` navigateur « Êtes-vous sûr de vouloir supprimer ce matériel ? Les réservations liées seront aussi supprimées. » ; cascade FK côté serveur (les réservations liées disparaissent aussi, et sont retirées de l'état local).
- [ ] Pas de duplication, d'export, de glisser-déposer, d'actions en masse ni de raccourci clavier.
- [ ] Journal d'activité (`db.logActivity`) à chaque action : « a ajouté le matériel », « a modifié le matériel », « a supprimé le matériel », « a créé une réservation matériel », « a modifié une réservation matériel », « a supprimé une réservation matériel » (entités `equipment` / `booking`).
- [ ] Événements serveur émis : `equipment:created|updated|deleted`, `equipment-booking:created|updated|deleted`.

## 7. Temps réel et chargement

- [ ] Chargement initial : `loadData()` au montage (équipements puis réservations, séquentiel), état `loading` (n'affiche pas de squelette dédié visible dans le JSX ; sert au `useScrollRestore`).
- [ ] `useRealtimeSync([...RT_EVENTS.equipment, ...RT_EVENTS.equipmentBookings], () => loadData(true))` — rechargement silencieux, sans indicateur (`:129`). Critique : la disponibilité est calculée sur `bookings`.
- [ ] La modale de réservation recalcule la disponibilité quand `bookings` change (`:114`), y compris pendant qu'elle est ouverte.
- [ ] Pas de polling.

## 8. États vides et erreurs

- [ ] Aucun texte d'état vide : planning sans réservation = grille vide ; inventaire sans matériel = tableau vide (en-têtes seuls).
- [ ] Erreurs d'écriture : `alert()` navigateur avec le message de l'`ApiError`, sinon « Échec de l'enregistrement (serveur injoignable ?). » / « Échec de la suppression (serveur injoignable ?). »
- [ ] `loadData` n'a pas de try/catch : un échec réseau au chargement laisse `loading = true` ou lève une promesse rejetée non gérée (cf. section 11).
- [ ] Erreurs serveur : 400 (champ invalide, dates incohérentes), 404 « Matériel introuvable. » / « Réservation introuvable (ou equipmentId invalide). » / « Réservation introuvable. », 403 (catalogue, rôle non autorisé), 409 stock insuffisant.

## 9. Règles métier touchées

- [ ] Le Matériel n'entre dans aucun budget : `site`/`brand` d'une réservation sont purement informatifs. Aucun usage de `resolveBudgetLine`, `splitShareToBuckets`, `isHoldingBrand`.
- [ ] Brouillon : sans objet (pas de statut).
- [ ] Périmètre `GROUPE BONY` : simple valeur de `site` (défaut), sans ventilation ici. Options « Alpine » / « Nissan » proposées comme sites, en contradiction avec la règle « Alpine par site, Nissan global » qui ne s'applique cependant pas à ce module (pas de budget).
- [ ] Marque par défaut `Holding` posée en silence (`:286`) : sans effet budgétaire ici, mais à ne pas propager si un jour la réservation alimente le budget.
- [ ] Chef de site : règle de cloisonnement respectée seulement par la navigation, pas par l'API (section 11).

## 10. Mobile

- [ ] En-tête en `flex-wrap`, bouton principal à `min-h-[44px]` ; libellés « RÉSERVER » / « AJOUTER MATÉRIEL » masqués sous `sm` (icône + seule).
- [ ] Barre de contrôles du Planning en `flex-wrap` ; sélecteur matériel `min-w-[200px]`.
- [ ] Modales plein écran avec `p-4`, largeur `max-w-lg` (réservation) / `max-w-md` (matériel) ; grilles 2 colonnes conservées (dates, site/service).
- [ ] Inventaire : tableau `w-full` sans version cartes ni défilement horizontal explicite (`p-6`) — risque de débordement sur 320 px.
- [ ] Marges `p-3 md:p-6`, `p-2 md:p-4` (Planning).

## 11. Défauts et bizarreries relevés

- [ ] **Site Manager et External : API ouverte.** Menu et `App.tsx` les bloquent, mais `GET/POST/PUT/DELETE /api/equipment-bookings` et `GET /api/equipment` n'ont ni `requireRole` ni `siteScope` : un chef de site (lecture seule partout) peut créer/modifier/supprimer des réservations par appel direct. Écart avec « lecture seule par absence de rôle dans un EDIT_ROLES » du CLAUDE.md. À trancher avant le portage v2.
- [ ] Guest peut réserver et supprimer (aucun `EDIT_ROLES` sur les réservations).
- [ ] Le sélecteur Site propose `Alpine` et `Nissan` comme « sites » alors que `PLAQUES_STRUCTURE` n'inclut ni Montluçon ni Saint-Etienne (présents dans `SITES`) : liste incohérente avec `SITES`.
- [ ] Marque non éditable (`brand` reste `Holding` à la création ; conservée telle quelle en édition).
- [ ] `getAvailability` compte par jour en O(jours × réservations) et le serveur fait la vérification faisant foi ; deux écrans peuvent diverger jusqu'au prochain rechargement temps réel.
- [ ] Validation fin ≥ début absente côté client (`Date de fin` antérieure acceptée par l'UI, refusée par le serveur avec un message générique via `alert`). Dans `getAvailability`, `eachDayOfInterval` avec fin < début lève une exception dans le `useEffect` (modale ouverte).
- [ ] Modification de `totalQuantity` à la baisse sans contrôle des réservations existantes ; suppression d'un matériel avec cascade et simple `confirm()`.
- [ ] Filtre `material_selectedEquipmentId` persistant sur un matériel supprimé : planning vide sans message.
- [ ] `loadData` sans gestion d'erreur ; l'état `loading` n'a pas de rendu d'attente visible.
- [ ] Le champ `quantity` ignore la saisie au-delà du disponible (aucun message) ; la valeur `NaN` est possible si le champ est vidé (`parseInt('')`).
- [ ] Le libellé du mois est identique en Semaine et en Mois (ternaire redondant `:420`), la semaine visée n'est pas indiquée dans l'en-tête.
- [ ] Aucune fiche `BUGS-CONNUS.md` du 29/09 relevée pour ce module (non vérifié fiche par fiche).
