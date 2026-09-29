# Inventaire fonctionnel — Agenda

Sources : `pages/Agenda.tsx`, `components/calendar/CalendarGrid.tsx`, `EventBar.tsx`, `calendarShared.ts`, `components/ProjectSummary.tsx`, `App.tsx`, `components/Sidebar.tsx`, `backend/src/routes/projects.ts`.
Rubrique en LECTURE SEULE pour tout le monde : aucun formulaire, aucune écriture. Seule action : ouvrir la fiche projet.

## 1. Accès et rôles
- [ ] Rubrique `agenda` (`App.tsx:156`, menu `Sidebar.tsx:219` libellé « Agenda », icône CalendarDays). Visible pour tous les rôles sauf External.
- [ ] External : `EXTERNAL_ALLOWED_TABS = digital, chat, hello-marketing, settings` (`App.tsx:80`) → Agenda redirigé vers `digital` (`App.tsx:88`) ; menu filtré (`Sidebar.tsx:232`).
- [ ] Chef de site (`Site Manager`) : Agenda fait partie de la liste fermée `SITE_MANAGER_SECTIONS` (`constants.ts:720`). Lecture seule par absence de tout `EDIT_ROLES` (la page n'écrit de toute façon rien).
- [ ] Cloisonnement SERVEUR : la page appelle `db.getProjects()` → `GET /projects` (`dataService.ts:239`) qui filtre par `arrayScopeWhere('sites', scope)` puis `redactSiteFields` (`backend/src/routes/projects.ts:20-34`). Le commentaire de la route dit explicitement que l'Agenda en profite.
- [ ] Le client ne fabrique aucune donnée : il filtre uniquement (brouillons, marque, service, objet).
- [ ] Barre mobile du bas : `agenda` est dans `MOBILE_BAR_IDS` (`Sidebar.tsx:247`).

## 2. Structure
- [ ] 5 vues, sélecteur segmenté : `Semaine`, `Mois`, `Trimestre`, `Semestre`, `Année` (`Agenda.tsx:15, 397`). Vue active persistée : `useSessionState('agenda_view', 'Semaine')` (`:189`).
- [ ] Semaine et Mois : grille partagée `CalendarGrid` (`view="week"` / `"month"`, `:283-299`). Trimestre / Semestre / Année : timeline maison (`renderTimelineView(3|6|12)`, `:302-351, 452-454`).
- [ ] Date courante `currentDate` = `useState(new Date())` : NON persistée, retour à aujourd'hui à chaque montage (`:190`).
- [ ] Barre de navigation : `<` précédent, bouton `Aujourd'hui`, `>` suivant (`:377-381`). Pas = 7 j (Semaine), 1 mois, 3 mois, 6 mois, 1 an (`:224-242`).
- [ ] Bouton « Filtres » (icône Filter / X quand ouvert) affiche/masque la barre de filtres ; état `showFilters` local, non persisté, fermé par défaut (`:193, 385-395`).

## 3. Filtres et sélecteurs
Tous des `Select` simples (`components/Select`, `size="sm"`), dans la barre repliable (`:415-445`). Persistance `useSessionState` (session).
- [ ] **Marque** : options `Toutes` (`All`) + `BRANDS` = Renault, Dacia, Alpine, Nissan, Mobilize, Holding (`constants.ts:27`). Clé `agenda_filterBrand`, défaut `All`. Règle (`:216`) : garde le projet si `brands` contient la marque OU contient `Holding` (un projet Holding apparaît donc quelle que soit la marque filtrée).
- [ ] **Service** : options `Tous` + `SERVICES` = VN, VO, APV, PR, Tous Services (`constants.ts:25`). Clé `agenda_filterService`, défaut `All`. Règle (`:217`) : `service` (tableau) inclut la valeur OU inclut `Tous Services`.
- [ ] **Objet** : options `Tous` + `PROJECT_TYPES` = Partenariat, Expo/Salon, Animation Co, OP Clients, Contenu, Collaborateurs (`constants.ts:29`). Clé `agenda_filterType`, défaut `All`. Règle (`:218`) : égalité stricte sur `projectType`.
- [ ] Filtre implicite non modifiable : `status === 'Draft'` exclu (`:215`).
- [ ] Aucun filtre par site, statut, ni recherche texte.

## 4. Affichage
- [ ] Titre (`getTitle`, `:353-367`, `capitalize` CSS) : Semaine = « J MOIS - J MOIS ANNÉE » en majuscules (lundi→dimanche) ; Mois = « MOIS ANNÉE » ; Trimestre/Semestre = « TRIMESTRE - DÉBUT MOIS ANNÉE » (idem SEMESTRE) ; Année = l'année.
- [ ] Semaine commence le lundi (`getStartOfWeek`). En-têtes de jours : jour abrégé fr + numéro (`CalendarGrid.tsx:255-273`) ; mois : `LUN MAR MER JEU VEN SAM DIM` (`:23`).
- [ ] Jour courant : bordure/anneau orange + numéro orange (`CalendarGrid.tsx:47-52`). Jours hors mois grisés en vue Mois.
- [ ] Événement (Semaine/Mois) = `EventBar` : barre d'accent gauche colorée par service (`serviceAccent`, service[0] : VN bg-bony-blue, VO bg-bony-orange, APV bg-bony-violet, PR bg-cyan-500, Tous Services bg-slate-400 — `calendarShared.ts:124-131`), coins non arrondis côté coupé (`clipLeft`/`clipRight` si le projet déborde de la semaine).
  - Vue Mois : nom du projet seul, tronqué (`:276`). Barre 22 px, lane 24 px, hauteur de ligne mini 96 px, extensible.
  - Vue Semaine : nom + plage de dates `JJ/MM - JJ/MM` (ou une date si début = fin) + `progress %` + `budgetActual€` (sans espace) + mini barre de progression (`:259-274`). Lane 46 px, zone mini 480 px.
- [ ] Empilement : `calculateLayout` place chaque projet en « lanes » (tri par colonne de début puis durée décroissante, `calendarShared.ts`) ; les barres multi-jours s'étendent sur plusieurs colonnes.
- [ ] Tooltip au survol (EventBar, largeur 64) = `ProjectSummary` (`components/ProjectSummary.tsx`) : nom, `progress %`, pastille site (`project.site`), type (`projectType`), pastilles marques (`BRAND_COLORS`), Dates (`JJ/MM - JJ/MM`), Budget = `budgetActual €` (avec espace).
- [ ] Timeline Trimestre/Semestre/Année : en-tête de mois (`mois année` fr, majuscules), colonnes égales ; projets triés par `startDate` croissante, une ligne par projet (h-6, espacement 8), barre positionnée en % (`ProjectBarGantt`, largeur mini 4 px, durée mini 1 j) ; seuls les projets qui chevauchent la période sont montrés (`:313-319`). Couleur de barre = `getServiceColor` (service[0] : bleu/orange/émeraude/cyan selon `SERVICE_COLORS`, gris pour Tous Services/aucun). Pas de progression affichée (`showProgress=false`).
- [ ] Période de la timeline : Trimestre = trimestre civil contenant la date ; Semestre = semestre civil ; Année = janvier→décembre (`:303-310`).
- [ ] Aucun compteur, aucun KPI.

## 5. Formulaires
aucun

## 6. Actions
- [ ] Clic sur un projet (barre Semaine/Mois ou pilule timeline) : `sessionStorage.pendingProjectId = id` + événement `gearbox-navigate` `{tab:'projects', projectId}` → ouvre la fiche dans Projets (`:83-89`, `:254`). Effet : passe par la garde de rubrique de `App.tsx`.
- [ ] `onDayClick` non fourni : cliquer une cellule vide ne fait rien.
- [ ] Pas de glisser-déposer, création, export, raccourci clavier.

## 7. Temps réel et chargement
- [ ] Chargement initial unique `db.getProjects()` au montage (`:203-205`).
- [ ] Temps réel : `useRealtimeSync(RT_EVENTS.projects, loadProjects)` → recharge toute la liste (`:208`).
- [ ] Aucun état de chargement (liste vide tant que non reçue).

## 8. États vides et erreurs
- [ ] Mobile (< md) : « Aucun événement sur cette période. » (`CalendarGrid.tsx:95`) ; jour sans projet : « — ».
- [ ] Desktop : aucun texte de vue vide (grille vide) ; timeline sans projet : zone vide.
- [ ] Erreurs réseau / 403 : `loadProjects` n'a pas de try/catch (rejet non géré, écran vide).

## 9. Règles métier touchées
- [ ] Brouillon : exclu (`Agenda.tsx:215`) — règle CLAUDE.md respectée.
- [ ] Holding : projet Holding reste visible (tracké) et passe TOUS les filtres Marque (`:216`) ; cohérent (« tracké mais aucun budget »). Pas de budget agrégé ici.
- [ ] Archived : reste affiché (aucun filtre de statut hormis Draft).
- [ ] Alpine/Nissan, curseurs de répartition, GROUPE BONY : non applicables (aucune ventilation budgétaire).
- [ ] Cloisonnement chef de site : `sites` déjà redacté par le serveur (voir §1).

## 10. Mobile
- [ ] Semaine et Mois : les grilles 7 colonnes sont `hidden md:flex` ; sous `md`, `CalendarGrid` rend une LISTE verticale un bloc par jour (Semaine : 7 jours ; Mois : uniquement les jours occupés), événements pleine largeur, style semaine (avec progression) (`CalendarGrid.tsx:67-121`).
- [ ] Trimestre/Semestre/Année : timeline identique (pas de variante mobile).
- [ ] Boutons de 44 px mini ; sélecteur de vues défile horizontalement ; marges `p-3` → `md:p-6` ; titre `text-lg` → `md:text-3xl`.

## 11. Défauts et bizarreries relevés
- [ ] `ProjectPill` porte un tooltip et une prop `showProgress` (rendu progression) jamais utilisés en mode vrai ; `getServiceColor`, `getStartOfWeek`, `addDays`, `getMonthDays`, `isSameDay` de `Agenda.tsx` dupliquent `calendarShared.ts` (les 4 derniers : `addDays`/`getStartOfWeek` servent au titre, `getMonthDays`/`isSameDay` sont morts).
- [ ] `formatDateRange` dupliqué (Agenda.tsx:54 et ProjectSummary.tsx:22).
- [ ] Couleurs différentes entre grilles (accent `serviceAccent`) et timeline (`getServiceColor`).
- [ ] Format budget incohérent : `12€` en Semaine vs `12 €` dans le tooltip ; jamais formaté en milliers.
- [ ] Le tooltip de la timeline est positionné `absolute` par rapport à un parent non forcément `relative` (`Agenda.tsx:147-156`) ; à vérifier au portage.
- [ ] La date courante n'est pas persistée alors que la vue l'est.
- [ ] Trimestre/Semestre : `totalDays` calculé sans +1 (dernier jour exclu) — position en % très légèrement décalée.
- [ ] Pas de gestion d'erreur au chargement. Rien relevé dans `BUGS-CONNUS.md` pour cette rubrique (non vérifié dans la fiche du 29/09).
