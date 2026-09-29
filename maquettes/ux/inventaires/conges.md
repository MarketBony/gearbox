# Inventaire fonctionnel — Congés

Sources : `pages/Conges.tsx` (1241 l.), `services/congesAcces.ts`, `constants.ts:741-837`, `backend/src/routes/conges.ts`, `App.tsx`, `components/Sidebar.tsx`.

## 1. Accès et rôles

- [ ] Rubrique `conges` (icône Palmtree, libellé « Congés »). Visible dans la navigation **seulement si** `useCongesAcces().visible` (`components/Sidebar.tsx:207,223`) ; garde de routage `App.tsx:96` (`resolvedTab === 'conges' && !voitConges` → retombe sur `dashboard`).
- [ ] `visible = membres.includes(user.id) || peutGererConges(role)` (`services/congesAcces.ts:60,73`). Donc : il faut être **membre du périmètre** ou gestionnaire. Tous les comptes Gearbox ne sont pas du marketing.
- [ ] Défaut prudent `visible: false` tant que la lecture n'a pas abouti (`congesAcces.ts:32`) : la rubrique n'apparaît qu'après réponse, jamais l'inverse (pas de clignotement).
- [ ] Un 403 du GET n'est pas une erreur : traité en « pas visible », sans log console (`congesAcces.ts:63-67`). Toute autre erreur : `console.error('Congés : accès non déterminé')`.
- [ ] Rafraîchissement du store : au chargement de l'utilisateur (`App.tsx:57`) et sur l'événement `conges:updated` (`App.tsx:59`). Le sonde utilise une fenêtre d'un jour (`getConges(aujourd'hui, aujourd'hui)`, `congesAcces.ts:56-57`) pour ne récupérer que le périmètre.
- [ ] Listes de rôles (copies d'affichage, la vérité est `backend/src/routes/conges.ts`) — `constants.ts:749-762` :
  - Lecture `CONGES_LECTURE_ROLES` = Master, Administrator, Director, Coordinator, Digital Manager, Guest. **Site Manager et External absents.**
  - Gestion `CONGES_GESTION_ROLES` = Master, Administrator, Director (gèrent le périmètre, les droits CP, posent pour autrui).
  - Validation `CONGES_VALIDATION_ROLES` = Master, Director. **Administrator exclu** (décision de Théo, `constants.ts:754-758`).
- [ ] Écriture : chacun modifie **sa** ligne, les gestionnaires celle de tout le monde — `peutEcrirePour(userId)` (`Conges.tsx:115`), miroir de `routes/conges.ts:95`. Guest est dans LECTURE_ROLES, donc peut écrire sur sa propre ligne s'il est membre (la route `PUT /jour` n'exige que LECTURE_ROLES + soi-même).
- [ ] Cloisonnement serveur : `requireRole(LECTURE_ROLES)` même sur le GET (`routes/conges.ts:130`) ; le chef de site est refusé (403). Pas de `siteScope` : la rubrique n'a pas de notion de site, le cloisonnement est par rôle + périmètre (`CongeMembre`).
- [ ] Ce que le client complète : la fiche utilisateur de chaque ligne vient de `db.getUsers()` (`Conges.tsx:135`, échec toléré → liste vide, donc lignes filtrées `!!l.user`). Le calendrier des fériés/week-ends est **côté client seulement** (`lib/joursFeries.ts`) ; le serveur ne le connaît pas (`routes/conges.ts:120-127`).

## 2. Structure

- [ ] Trois onglets (barre de segments, `Conges.tsx:335`), clé `useSessionState` **`conges_onglet`**, défaut `'planning'` :
  - « Planning » (icône Rows3)
  - « Agenda » (icône CalendarDays)
  - « Tableau de bord » (icône LayoutDashboard)
  Sous `sm` seule l'icône s'affiche (libellé `hidden sm:inline`).
- [ ] État persistant de session : `conges_annee` (défaut année courante), `conges_mois` (défaut mois courant 0-11), `conges_periode` (défaut `periodeCongesDe(aujourd'hui)`, année de DÉBUT de la période juin→mai).
- [ ] En-tête : titre « Congés », sous-titre `{n} collaborateur(s) · {Mois Année}` (onglet Planning) ou `· période Juin AAAA – Mai AAAA+1` (Agenda et Tableau de bord) (`Conges.tsx:329-331`).
- [ ] Boutons d'en-tête : « Participants » (gestionnaires seulement, `title` « Choisir qui apparaît dans la rubrique », libellé masqué sous `md`) ; « Poser une période » (visible dès qu'il y a au moins une ligne, libellé masqué sous `sm`).
- [ ] Modales : Participants (`ModaleParticipants`), Poser une période (`ModalePeriode`). Panneaux flottants (`FloatingPanel`) : cellule du planning (largeur 250, hauteur max 440), jour de l'agenda (largeur 260, hauteur max 320).

## 3. Filtres et sélecteurs

Aucun filtre de données. Sélecteurs de navigation et de saisie :

- [ ] **Mois du planning** : flèches précédent/suivant, libellé `{MOIS_FR[mois]} {annee}` ; passage décembre→janvier incrémente l'année. Persistance `conges_mois` / `conges_annee`.
- [ ] **Période de référence** (Agenda et Tableau de bord, chacun avec ses flèches ± 1 an) : libellé `Juin AAAA – Mai AAAA+1` (`libellePeriodeConges`). Persistance `conges_periode`. Distincte du mois du planning (on peut voir juillet au planning et le solde d'une autre période).
- [ ] Bouton **« Aujourd’hui »** (Agenda) : bascule sur la période contenant aujourd'hui puis cale le défilement sur le mois courant (`allerAujourdhui`).
- [ ] Fenêtre de chargement (non visible) : `debut = {min(annee, periode)}-01-01`, `fin = {max(annee, periode+1)}-12-31` — années pleines pour ne pas relancer de requête à chaque changement de mois (`Conges.tsx:127-130`).
- [ ] **Participants — recherche** : champ texte « Rechercher… », filtre par nom, sous-chaîne insensible à la casse. Liste = utilisateurs dont le rôle est dans `CONGES_LECTURE_ROLES`, tri alphabétique (`localeCompare`).
- [ ] **Poser une période — Collaborateur** : `Select` (affiché seulement si `cibles.length > 1`), options = lignes sur lesquelles l'utilisateur peut écrire ; défaut = soi si dans la liste, sinon le premier.
- [ ] **Poser une période — Type** : `Select`, options = `CONGES_TYPES` dans l'ordre : Congé payé (CP), RTT, Heures de récup (HR), Congé sans solde (CSS), Congé révision (CR) ; défaut `CP`.
- [ ] **Poser une période — Du / Au** : `DatePicker` ; « Au » a `minDate = début`. Choisir « Du » aligne « Au » dessus tant qu'il est vide ou antérieur (`Conges.tsx:1202`).

## 4. Affichage

- [ ] Lignes = membres du périmètre (`membres` de l'API) joints aux fiches utilisateur, filtrées sur `!!user`, **tri alphabétique par nom** (`Conges.tsx:166-172`). Une seule liste à plat : les « équipes » de la maquette Excel ont été abandonnées.
- [ ] Types de congé (`CONGES_TYPES`, `constants.ts:775`) — libellé / court / couleur / décompte solde :
  - CP « Congé payé » / CP / `#3b82f6` / **oui**
  - RTT « RTT » / RTT / `#8b5cf6` / non
  - HR « Heures de récup » / HR / `#f59e0b` / non
  - CSS « Congé sans solde » / SS / `#64748b` / non
  - CR « Congé révision » / CR / `#10b981` / non
- [ ] Demi-journées (`CONGES_DEMI`) : `AM` « Matin » (court « matin »), `PM` « Après-midi » (court « a.-m. »). `null` = jour entier. Valable pour **toutes** les familles (correctif 55).
- [ ] Valeur d'une cellule : `valeurJourConge` = 0,5 si demi, sinon 1 (seule porte du comptage). Jours chômés (week-end/férié via `estChome`) exclus de tous les totaux.
- [ ] Nombres formatés à la virgule française (`fmtJours` : « 1,5 »).
- [ ] Légende (`Conges.tsx:367-380`) : une pastille couleur par type + « Week-end / férié » ; à partir de `md` : « Plein = validé · pâle = en attente ».
- [ ] Badge de cellule : **plein = validé, pâle (couleur + `33`) = en attente** ; demi-journée = case remplie à moitié (dégradé 90deg pour AM, 270deg pour PM) ; contenu = libellé court du type ; `title` = `{libellé} — matin|après-midi — validé|en attente`.

### Planning (desktop)
- [ ] Table lignes × jours du mois (`table-fixed w-full`, `minWidth = 220 + jours*30 + 62`). Colonne « Collaborateur » (220 px, sticky gauche, fond opaque, avatar 24 + nom), une colonne par jour (numéro + lettre `D L M M J V S`), colonne « Total » (60 px).
- [ ] En-tête de jour : numéro en orange si férié (avec `title` = nom du férié), gris si week-end/férié (fond grisé), filet plus marqué le lundi.
- [ ] Total de ligne = `totalMois` (tous types, demi comprises), « — » si 0.
- [ ] Pied « Absents / jour » : nombre de lignes avec un congé ce jour (0 les jours chômés) ; couleur rouge si ≥ 4, orange si > 0, atténué sinon.
- [ ] Cellules cliquables seulement si `peutEcrirePour(ligne) && !chômé` (curseur pointer + survol orange).

### Agenda
- [ ] Douze sections, juin → mai de la période (`moisDeLaPeriode`), en-tête de mois sticky opaque : `{Mois Année}` + `{total} jour(s) posé(s)` ou « personne d’absent » (total = somme des `totalMoisDe` de toutes les lignes).
- [ ] Grille 7 colonnes **lundi → dimanche** (`L M M J V S D`), décalage `(getDay()+6)%7`. Case : numéro du jour (orange si férié), nom du férié tronqué, compteur d'absents (rouge si ≥ 4), anneau orange pour aujourd'hui, fond grisé si chômé.
- [ ] Desktop (`md` et +) : avatars 16 px des absents (4 max, liseré de la couleur du type, `title` `{nom} — {type} ({matin|a.-m.})`) puis « +N ». Mobile : petits points colorés (8 max).
- [ ] Au passage sur l'agenda (ou changement de période contenant aujourd'hui), calage sur le mois courant (`data-mois="YYYY-MM"`, `offsetTop`, jusqu'à 5 images de recalage).
- [ ] Clic sur un jour avec au moins 1 absent → panneau en lecture (voir Actions). Jour sans absent : `cursor-default`, aucun effet.

### Tableau de bord (période de référence)
- [ ] Texte : « Période de référence légale : du 1er juin AAAA au 31 mai AAAA+1. »
- [ ] 4 KPI (`Conges.tsx:756-759`) :
  - « Jours posés » = somme des totaux de période, indice « sur N collaborateur(s) » (bleu `#3b82f6`)
  - « Moyenne / personne » = grand total / nb lignes, arrondi au dixième, indice « jours sur la période » (vert `#10b981`)
  - « Mois le plus chargé » = nom du mois max, indice « N jours posés » ou « aucun congé » (ambre `#f59e0b`)
  - « Pic d’absences » = max de personnes absentes le même jour (jours chômés exclus, membres seuls), indice « le JJ/MM/AAAA » ou « aucun congé » (rose `#f43f5e`)
- [ ] « Solde de congés payés » : en-tête « {25} jours ouvrés par défaut » (+ « · modifiable au crayon » si gestionnaire). Une barre par membre, **tri par restant croissant** ; barre `cp/droit` plafonnée à 100 % ; couleur rouge `#ef4444` si restant < 0, ambre `#f59e0b` si ≤ 3, bleu `#3b82f6` sinon ; texte `cp / droit · restant rest.` (restant en rouge gras si négatif). `cp` = jours de type CP uniquement (`congeDecompteSolde`), `droit` = ligne `CongeDroit` de la période sinon 25 (`CONGES_DROIT_DEFAUT`). Vide : « Aucun participant. »
- [ ] « Répartition mensuelle » : 12 barres verticales juin→mai (hauteur proportionnelle au mois max, min 3 % si > 0, ambre pour le mois le plus chargé, bleu sinon), valeur au-dessus, mois court dessous (`Jan … Déc`), `title` `{Mois Année} : N jours`. Clic sur une barre → règle `annee`/`mois` et bascule sur l'onglet Planning.
- [ ] « Jours posés par collaborateur » : barres dégradées, tri décroissant par total, nom aligné à droite, valeur à droite. Vide : « Aucun participant. »
- [ ] « Journées les plus chargées » : jours à **≥ 3 absents**, tri décroissant, 8 max ; date longue `weekday jour mois année` + noms séparés par des virgules + nombre en orange. Vide : « Aucune journée à 3 absents ou plus. »

### Mobile (voir §10)

## 5. Formulaires

### Panneau d'une cellule (clic sur un jour du planning, si autorisé)
- [ ] Titre : nom de la personne + date longue `weekday jour mois`.
- [ ] Liste des types (mêmes libellés que `CONGES_TYPES`, pastille couleur, ✓ sur le type courant). Cliquer un type pose/remplace le congé ; **la demi-journée existante est conservée** en changeant de famille.
- [ ] Si un congé existe : segments **« Journée » / « Matin » / « Après-midi »** (valeurs `null`/`AM`/`PM`, actif en plein orange).
- [ ] Si `validateur` (Master, Director) : bouton « Valider ✓ » / « Retirer la validation » (bascule `validated`).
- [ ] Si un congé existe : « Retirer ce congé » (rouge, corbeille) → `type = null`, ferme le panneau.
- [ ] Boutons désactivés pendant l'enregistrement.

### Poser une période (modale)
- [ ] Titre « Poser une période ». Champs : Collaborateur (si > 1 cible), Du, Au (obligatoires de fait), Type (défaut CP). Pas de choix de demi-journée (la route l'accepte, l'écran n'envoie rien : jour entier).
- [ ] Message : « N jour(s) ouvré(s) seront posés. Week-ends et jours fériés sont automatiquement ignorés. » ou « Choisissez une date de début et une date de fin. » Les jours ouvrés sont calculés **côté client** (`joursOuvres`), envoyés en liste exacte (`db.setCongePeriode(userId, jours, type)`).
- [ ] Boutons « Annuler » (bloqué pendant l'envoi) et « Poser » (désactivé si 0 jour ouvré ou en cours ; libellé « Enregistrement… »).

### Droit à CP (crayon, gestionnaires)
- [ ] Input numérique texte (largeur 14), valeur gardée en chaîne pendant la frappe ; virgule acceptée (`replace(',', '.')`). Validé à la perte de focus ou Entrée ; Échap annule. Envoi seulement si `Number.isFinite(v) && v >= 0 && v !== droit`. Serveur : période entière 2000-2100, jours 0-366, cible membre ; si `jours === 25` la ligne est supprimée (retour au défaut).

### Participants (modale)
- [ ] Titre « Participants », sous-titre « Qui apparaît dans le planning des congés. » ; champ « Rechercher… » ; ligne par compte éligible (avatar, nom, rôle, case cochée si membre) ; pied : « Retirer quelqu'un ne supprime pas ses congés : il disparaît du planning, ses jours restent enregistrés. »
- [ ] Liste blanche serveur : `POST /membres` refuse (400) un rôle hors `LECTURE_ROLES` (`routes/conges.ts:189`).

## 6. Actions

- [ ] Poser / changer le type d'un jour (`PUT /jour`, `db.setCongeJour(userId, date, type, demi)`), changer la demi-journée, retirer (`type null`) — puis `charger()` complet.
- [ ] Poser une période (`PUT /periode`, transaction d'upserts).
- [ ] Valider / retirer la validation (`db.setCongeValidation`, `PUT /jour/validation`, Master/Director). Le serveur laisse `validated` en l'état lors d'un changement de type (cf. commentaire `routes/conges.ts` ~l.215).
- [ ] Modifier le droit à CP d'une personne pour la période affichée (`db.setCongeDroit`, `PUT /droit`).
- [ ] Ajouter / retirer un participant (`db.ajouterMembreConges` / `db.retirerMembreConges`). Retrait avec `window.confirm` : « Retirer {nom} du planning ? Ses congés déjà posés sont CONSERVÉS : il suffit de le rajouter pour les revoir. »
- [ ] Clic sur un jour d'agenda → panneau lecture : date longue, `{férié · }N absent(s) sur M`, liste avatar + nom + badge court (`CP`, `RTT`…, suffixé `matin`/`a.-m.`). Aucune saisie depuis l'agenda.
- [ ] Clic sur une barre de « Répartition mensuelle » → navigation vers le planning de ce mois.
- [ ] Pas de suppression en masse, pas de glisser-déposer, pas d'export.
- [ ] Effet de bord : après chaque écriture `congesAccesStore.set(...)` met à jour la visibilité de la rubrique (`Conges.tsx:142`).

## 7. Temps réel et chargement

- [ ] `useRealtimeSync([...RT_EVENTS.conges, ...RT_EVENTS.users], charger)` (`Conges.tsx:151`) : `RT_EVENTS.conges = ['conges:updated']` (`services/realtime.ts:67`) + événements utilisateurs.
- [ ] Chargement : `Promise.all([db.getConges(debut, fin), db.getUsers().catch(() => [])])` ; réponse `{ jours, membres, droits }`. Pendant le chargement initial : texte « Chargement… » centré. Les rechargements suivants ne remettent pas l'écran en chargement.
- [ ] Un changement d'année/période qui sort de la fenêtre relance `charger` (dépendances `fenetre.debut/fin`).

## 8. États vides et erreurs

- [ ] Aucun membre : « Personne dans la rubrique pour l'instant. » + sous-texte « Utilisez « Participants » pour choisir qui apparaît dans le planning. » (gestionnaire) ou « Un administrateur doit vous ajouter au planning. » (autres).
- [ ] Mobile, personne sans congé : « Aucun congé ce mois-ci. »
- [ ] Erreur de chargement : `console.error('Congés : chargement échoué')` seulement, aucun message à l'écran (l'écran reste vide/obsolète).
- [ ] Erreur d'écriture : `alert(e.message)` si `ApiError`, sinon « Enregistrement impossible. » / « Validation impossible. » / « Modification impossible. » selon l'action. Messages serveur : « Vous ne pouvez modifier que vos propres congés. » (403), « Cette personne ne fait pas partie de la rubrique Congés. » (400), « Type de congé inconnu. », « Demi-journée inconnue (AM, PM ou rien). », « Date invalide (attendu YYYY-MM-DD). », « Aucun jour valide dans la période. », « Période invalide (année de début attendue). », « Nombre de jours invalide. ».
- [ ] Rôle sans accès : 403 → rubrique masquée, pas d'écran d'erreur (redirection Dashboard par `App.tsx:96`).

## 9. Règles métier touchées

- [ ] **Période de référence juin → mai** (art. L3141-3), pas l'année civile : `periodeCongesDe`, `bornesPeriodeConges`, `libellePeriodeConges`, `CONGES_MOIS_DEBUT = 5`, `CONGES_DROIT_DEFAUT = 25` (`constants.ts:801-837`). Seule porte : `debutPeriodeConges`/ces helpers. Les totaux ne recoupent donc pas le fichier Excel d'origine (voulu).
- [ ] **Solde CP** : seuls les CP décomptent (`congeDecompteSolde`, `solde: true`) ; RTT, HR, CSS, CR sont suivis mais hors solde.
- [ ] **Comptage** : `valeurJourConge` seule porte (0,5 demi / 1) ; jours chômés (`estChome`, `lib/joursFeries.ts`) exclus partout.
- [ ] **Rôles cloisonnés** : Site Manager et External refusés (nav + routage + API). Pas de règle marque/site (Alpine, Nissan, Holding, Brouillon) : rubrique sans budget.
- [ ] Guest a un droit de lecture et peut modifier sa propre ligne s'il est membre.

## 10. Mobile

- [ ] Planning : sous `md` la table est remplacée par une **liste de cartes** (une par personne : avatar, nom, total « N j » en orange) avec des boutons-jour `« {jour} {mois court} · {court}{ demi} »` (plein si validé, teinte `22` sinon) ; tap = ouverture du panneau de cellule si autorisé. Le pied « Absents / jour » n'existe pas.
- [ ] Agenda : avatars remplacés par des points colorés (max 8), case `min-h-[58px]` (74 px à partir de `md`).
- [ ] Flèches de navigation 44 px (`w-11 h-11`) sous `md`, 36 px au-dessus (sauf Tableau de bord : toujours 36 px).
- [ ] Libellés d'onglets et de boutons masqués sous `sm`/`md` (icônes seules) ; en-tête `px-3` puis `md:px-6`.
- [ ] Tableau de bord : KPI en 2 colonnes (4 à partir de `lg`), largeur du nom dans le solde 28 puis `md:w-36`.
- [ ] Sidebar : « Congés » figure en dur dans le groupe COMMUNAUTÉ de la nav groupée (`Sidebar.tsx:338`), filtrée ensuite par `idsAutorises` dérivé de `mainItems`.

## 11. Défauts et bizarreries relevés

- [ ] Le « Total » du planning et le « pied » comptent **tous les types** (HR, CSS…) ; seul le solde du Tableau de bord filtre sur CP. Intentionnel mais peut surprendre.
- [ ] Aucune interface de demi-journée dans « Poser une période » (la route `PUT /periode` accepte `demi`, l'écran ne l'envoie pas).
- [ ] Une erreur de chargement n'affiche rien à l'utilisateur (console seulement).
- [ ] `basculer` (Participants) et `alert()` natifs : pas de composant de dialogue commun.
- [ ] `CONGES_LECTURE_ROLES` inclut Guest, qui peut donc poser sur sa propre ligne : à confirmer comme voulu.
- [ ] Ouvert dans `BUGS-CONNUS.md:146` : le lundi de Pentecôte est tenu pour chômé, des congés posés ce jour restent en base mais invisibles et non comptés (à trancher par Théo).
- [ ] La rubrique fait plusieurs `getUsers()` complets (liste de tous les comptes) juste pour afficher noms/avatars des membres.
- [ ] `Conges.tsx` importe `peutValiderConges` et `CONGES_LECTURE_ROLES` ; `bornesPeriodeConges` n'est utilisé que dans le tableau de bord (pic), pas pour borner l'agenda.
