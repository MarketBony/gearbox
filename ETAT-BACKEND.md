# ÉTAT BACKEND — synthèse au 5 août 2026

Étape 7 (branchement frontend↔backend) **terminée**. Tous les modules de données **et** la
gestion des fichiers uploadés sont branchés sur le backend Express/Supabase et **vérifiés en
base réelle**. Le frontend ne lit/écrit **plus** `localStorage` pour ces entités.

**8 migrations Prisma** appliquées sur Supabase. La liste ne se recopie pas ici, où elle
devenait périmée à chaque lot : `ls backend/prisma/migrations`, ou le log de démarrage du
conteneur `api` qui annonce combien il en trouve. Les trois dernières, pour mémoire :
`add_chat_attachments`, `add_games`, `add_user_sites`.

`tsc --noEmit` backend : 0 erreur. Frontend : 12 lignes préexistantes (jeu de référence,
dans Budget/FixedExpenses/Projects — voir `ETAT-PROJET.md`).

> ⚠️ **Trois modules ont chacun leur « seule porte », à ne jamais contourner** :
> `utils/publicUser.ts` (jamais l'objet Prisma brut, il porte `passwordHash`),
> `utils/gameView.ts` (jamais une partie non redactée), et `auth/siteScope.ts`
> (jamais un `where` de site recopié dans une route). Détail dans les sections dédiées.

## ✅ Modules de données branchés (frontend → REST/Socket.IO, vérifiés en base)

1. **Auth** — `/api/auth` login (JWT 24h, bcrypt), GET/PUT `/me` (+ `avatarUrl`).
2. **Projets** — `/api/projects` CRUD (PUT = diff transactionnel des tâches, IDs préservés — Lot F corrigé).
3. **Budget** — `/api/budget` (lignes, upsert par site) + `/api/fixed-expenses` (dépenses fixes).
4. **Utilisateurs** — `/api/users` CRUD, mutations Master/Admin, validation des 7 rôles (+ `avatarUrl`).
5. **Matériel** — `/api/equipment` + `/api/equipment-bookings` (delete cascade FK).
   **Disponibilité contrôlée côté serveur** depuis le 30/07/2026 sur POST et PUT
   (`src/utils/availability.ts`) — voir la section dédiée plus bas.
6. **Campagnes** — `/api/campaigns` CRUD.
7. **Digital / Social** — `/api/social` CRUD ; `mediaFiles` = URLs de fichiers uploadés (voir Uploads).
8. **Journal d'activité** — `/api/activity-log` (GET plafonné 200, POST fire-and-forget, Master non journalisé).
9. **Chat** — `/api/chat` REST (chargement) + Socket.IO temps réel (`chat:message:send/edit/delete/react`,
   `chat:conversation:read`, **`chat:conversation:mute`**, **`chat:conversation:avatar`**
   → `chat:message:new/updated`,
   `chat:conversation:updated/created`). Chat Général = appartenance implicite
   (seed idempotent, non-External). Un message envoyé déclenche aussi les
   **notifications push** — voir la section dédiée plus bas.
10. **Notifications push** — `/api/push` (clé publique VAPID + abonnements) et
    `PushSubscription`. Voir la section dédiée.
11. **Tâches autonomes** — `/api/tasks` CRUD, **tâches sans projet uniquement**. Voir
    la section dédiée ci-dessous.

### ✅ Tâches AUTONOMES — `/api/tasks` (06/08/2026)

Migration `20260806160000_add_standalone_tasks` : `Task.projectId` devient **nullable**
(+ `deadline String?`, `sites/brands/service String[]`).

**Une tâche a désormais deux natures**, dans un **seul modèle** :
- **tâche de projet** (`projectId` renseigné) : hérite site, marques, service et
  échéance de son projet — d'où l'absence historique de ces colonnes ;
- **tâche autonome** (`projectId = null`), créée depuis la To-do : n'ayant aucun projet
  dont hériter, elle porte ces champs elle-même, plus une `deadline` propre.

⚠️ **Un seul modèle et pas deux**, volontairement : dupliquer aurait recréé « le second
chemin, plus pauvre, vers un besoin déjà couvert » du correctif 10 (rubrique Dépenses
Ponctuelles, créée puis retirée le même jour).

⚠️⚠️ **Deux chemins d'écriture, étanches, à ne jamais croiser.** Une tâche de projet
s'écrit **exclusivement** par le diff transactionnel de `PUT /api/projects/:id` ; une
tâche autonome **exclusivement** par `/api/tasks`. L'étanchéité n'est pas déclarative,
elle est structurelle des deux côtés :
- toutes les requêtes de `routes/tasks.ts` portent `projectId: null`, sans exception —
  le PUT et le DELETE utilisent `updateMany`/`deleteMany` **et non `update` par id**,
  de sorte qu'un id de tâche de projet envoyé là ne matche rien et rend 404 ;
- réciproquement, le `deleteMany` du diff de `projects.ts` est borné par
  `where: { projectId: id }`, que `null` ne matche jamais.

**Pas de budget** : `cost` est absent de la liste blanche d'écriture et forcé à `0`.
La colonne étant non-nullable, l'omettre laisserait une valeur non initialisée remonter
dans les agrégations.

⚠️ **Rôles** : `EDIT_ROLES` identique à celui de `projects.ts`. Le rôle « Site Manager »
en est absent — **pas** parce que l'interface lui masque la rubrique To-do
(`SITE_MANAGER_SECTIONS` ne contient pas `todo`), mais parce que masquer une rubrique
ne ferme pas une route. C'est la leçon qui a coûté deux passes au lot du chef de site.

Temps réel : `tasks:updated` / `tasks:deleted`, entrée `RT_EVENTS.tasks` distincte de
`projects` — une mutation de l'un ne concerne pas l'autre.

### 🎮 Jeux — modèles, règles serveur et anti-triche (05/08/2026)

Migration `20260805131643_add_games` : `GameChallenge` et `GameSession`. Deux tables
neuves, cinq index, aucun `ALTER` sur l'existant.

**Pourquoi ce module existe** : jusque-là, défis **et** parties vivaient dans le
`localStorage` du navigateur, et il n'y avait **aucun** modèle, route ni handler
socket pour les jeux. Défier un collègue était donc structurellement impossible — le
défi n'existait que chez l'émetteur — et le « classement global » ne classait que les
parties d'un seul poste.

⚠️ **On ne stocke QUE des `userId`**, jamais le nom ni la couleur du joueur.
L'ancienne version les recopiait dans chaque partie, si bien qu'un renommage laissait
l'ancien nom au classement. L'identité se résout par id au rendu.

`board` est en **`Json`** : la forme du plateau diffère par jeu et a vocation à
évoluer (la bataille navale est passée d'une grille de cellules anonymes à une liste
de navires identifiés) — la faire vivre là évite une migration à chaque ajustement.

#### ⚠️⚠️ `utils/gameView.ts` — la SEULE forme de session qui sort du backend

Même statut que `publicUser` pour `passwordHash` : **aucune route et aucun événement
socket ne renvoie une `GameSession` brute.** Elle contient la position des navires
des **deux** joueurs ; l'envoyer telle quelle suffirait à gagner toute bataille
navale en ouvrant l'onglet Réseau.

`projectSessionFor(userId, session)` produit la vue redactée. De la flotte adverse il
ne reste que : les tirs déjà portés, les navires **effectivement coulés** (découverts
à la loyale, donc plus secrets) et le **nombre** de navires restants avec leurs
tailles — jamais leurs positions. Ma propre flotte, elle, est complète.

⚠️ **Deux `emit` distincts par partie**, jamais un émetteur commun
(`io.to(a).to(b)`) : le payload **diffère par destinataire**, c'est toute la raison
d'être de la redaction. Un émetteur partagé renverrait à l'un les navires de l'autre.

`projectSessionSummary()` sert au classement : aucune donnée de plateau, donc rien de
secret — vérifié, la réponse du lobby ne contient pas de champ `board`.

#### ⚠️ `utils/gameRules.ts` — les règles vivent sur le serveur

C'était sans enjeu tant qu'on jouait seul contre soi-même en `localStorage`. Dès que
la partie est partagée, **tout ce qui n'est pas validé ici est falsifiable** :

- le tour (`currentTurn`), la légalité du coup, la case déjà jouée ;
- **le vainqueur est CALCULÉ par le serveur** — un `winnerId` envoyé par le client
  est purement ignoré ;
- `validateFleet()` contrôle intégralement une flotte reçue : nombre de navires,
  tailles, alignement, contiguïté, chevauchements, limites de grille. Sans ce
  contrôle, un client pourrait envoyer une flotte de deux cases et devenir imbattable.

Le frontend ne fait que proposer une case ; il ne décide de rien. Effets renvoyés à
l'auteur du tir uniquement (`miss` / `hit` / `sunk` + nom du navire) : l'adversaire
les déduit de sa grille.

**Bataille navale, règles retenues** (révisées le 06/08/2026, correctif 34) :

- **Toucher REDONNE la main** — on rejoue jusqu'à manquer, règle classique.
  ⚠️ Le lot 30 faisait l'inverse (« le tour passe à chaque tir, règle symétrique »),
  ce n'était **pas un bug mais un arbitrage**, revu à la demande de Théo. Une seule
  ligne dans `applyMove` (`nextTurn`) — ne pas le « rétablir » en croyant réparer.
- **Cases déduites vides, marquées `miss` automatiquement.** Deux cas, à ne pas
  confondre :
  - navire **coulé** → **pourtour complet** (les 8 voisines, via `neighboursOf`) ;
  - navire **touché mais pas coulé** → **les 4 DIAGONALES seulement**.
  ⚠️ Ne JAMAIS marquer les 4 cases orthogonales d'un simple touché : elles peuvent
  être la suite du navire qu'on vient de toucher, les griser le rendrait
  insubmersible. Une diagonale est sûre parce qu'un navire est une ligne droite (ce
  n'est donc pas sa suite) **et** que deux navires ne se touchent jamais (ce n'en est
  donc pas un autre).
- ⚠️⚠️ **`validateFleet` interdit le CONTACT entre navires**, même diagonal (depuis le
  06/08/2026 ; elle ne testait que la superposition). Ce n'est pas du confort : c'est
  **l'invariant dont dépend tout le marquage automatique**. Sans lui, une flotte
  adjacente forgée hors interface rendait la partie **INGAGNABLE** — couler le navire
  A marque des cases du navire B en `miss`, et `applyMove` refuse ensuite de tirer sur
  une case déjà tirée, donc B ne pouvait plus jamais être coulé et `fleetSunk` jamais
  devenir vrai. Le client l'appliquait déjà (`canPlace`), le serveur non — alors que
  son propre commentaire annonce « on ne fait JAMAIS confiance au placement reçu ».

#### Routes et temps réel

| Chemin | Rôle |
|---|---|
| `GET /api/games/lobby` | défis, mes parties (redactées), historique global |
| `GET /api/games/sessions/:id` | une partie, redactée pour l'appelant (403 si tiers) |
| `POST /api/games/challenges` | défier — 400 sur soi-même, jeu inconnu, cible sans accès |
| `POST /api/games/challenges/:id/accept` | **seul le destinataire** peut accepter (403 sinon) |
| `POST /api/games/challenges/:id/refuse` | refus par le destinataire, annulation par l'émetteur |

Socket (`realtime/games.ts`) : `game:fleet:place`, `game:move`, `game:forfeit`, avec
accusé de réception. Diffusion **ciblée** vers la room personnelle de chaque joueur
(`user:<id>`, convention du chat) — jamais de `io.emit` global, une partie ne concerne
que deux personnes. Les handlers ne sont **pas enregistrés** pour un rôle sans accès
aux Jeux : la porte est fermée au transport, pas seulement dans l'interface.

**Notification de défi** : événement socket ciblé + push via `sendPushToUsers`,
**sautée si la personne est déjà sur la rubrique Jeux** (`getUserIdsOnSection`, qui
renvoie un `Set` et non un tableau — piège rencontré). C'est le manque exact signalé :
« il ne reçoit jamais l'invitation ».

ℹ️ `GAMES_ROLES` vit dans `auth/roles.ts`. **Director en est exclu volontairement** —
seule exception à sa parité avec Administrator, commenté sur place pour qu'on ne
« corrige » pas cette incohérence apparente.

### 🏢 Rôle « Chef de site » — cloisonnement par concession (05/08/2026)

Migration `20260805190033_add_user_sites` : `sites String[] @default([])` sur `User`.
Premier champ de Gearbox qui porte un **droit d'accès** et non une préférence.

⚠️ **Liste VIDE = ne voit RIEN** (fail closed). Un chef de site sans concession
rattachée ne doit pas hériter d'un accès complet par accident.

#### ⚠️⚠️ `auth/siteScope.ts` — SEULE porte du cloisonnement

Même statut que `publicUser` pour `passwordHash` : **aucune route ne recopie un
`where` de site.** Avant ce lot, tous les `GET` renvoyaient l'intégralité des données
et c'était le frontend qui triait — acceptable tant que tous les rôles voyaient tout,
inacceptable pour un rôle cloisonné (les autres concessions restaient lisibles dans
l'onglet Réseau).

- `scopeOf(req)` → `null` (aucune restriction) ou la liste des valeurs autorisées.
- `budgetScopeOf(req)` → variante pour `BudgetLine.site`, qui peut être un **bucket**.
- `arrayScopeWhere` / `stringScopeWhere` → clauses Prisma, `{}` s'il n'y a pas de
  restriction (composables sans condition).

**Ce que le périmètre englobe**, et pourquoi :

| Valeur | Incluse ? | Raison |
|---|---|---|
| Ses sites | oui | évident |
| Sa **plaque** (`PLAQUE CENTRE`…) | **oui** | une opération de plaque couvre son site ; la manquer rendrait invisible une dépense qui pèse sur son budget |
| `GROUPE BONY` / `(R/N)` | **oui** | ventilé sur toutes les concessions, donc il en porte une part |
| `Alpine-<son site>` | oui | c'est sa concession |
| `Nissan` | **NON** | enveloppe globale, ventilée sur aucun site — elle n'est à personne |

⚠️ **`redactSiteFields()` — filtrer les lignes NE SUFFIT PAS.** Découvert en vérifiant
l'API : un projet multi-sites incluant Mozac passe légitimement le filtre, mais son
`sites[]` et son `budgetDistribution` nommaient **toutes les autres concessions avec
leurs pourcentages**. On ne garde que ses clés. Effet exploité : le frontend ventilant
déjà par `budgetDistribution`, il calcule naturellement **sa part** sans qu'on touche
aux montants — donc sans risque de double application d'un ratio. Le libellé legacy
`site` (concaténé) est recomposé, sans quoi il annulait tout le reste.

⚠️ **Le périmètre n'est PAS dans le JWT**, volontairement : le jeton vit 24 h, donc
retirer un site ne prendrait effet qu'à la reconnexion. Il est mis en cache et
invalidé par `notifyUserChanged()`, déjà appelé après chaque modification de compte —
effet immédiat, sans requête base à chaque appel.

⚠️ **`PLAQUES_STRUCTURE` est DUPLIQUÉ** dans `siteScope.ts` : le backend ne peut pas
importer le `constants.ts` racine, compilé seulement dans le bundle frontend. À garder
synchronisé à la main.

#### Portes fermées dans le même lot

- **`/api/uploads` n'avait AUCUN contrôle de rôle** — tout compte authentifié pouvait
  déposer un fichier. C'aurait été la seule écriture possible d'un rôle en lecture
  seule, et la plus coûteuse pour le disque.
- **Chat et présence** : `joinUserRooms` / `registerChatHandlers` /
  `registerPresenceHandlers` ne sont plus enregistrés pour ces rôles. Fermé au
  **transport**, donc les autres ne le voient pas non plus.
- **`emitEvent` diffusait l'objet Prisma brut à TOUS** : le projet d'une autre
  concession arrivait en clair dans son socket alors que la route venait de le
  filtrer. Les rôles cloisonnés reçoivent l'événement **sans sa charge** — le frontend
  ignore déjà le payload (stratégie d'invalidation), donc rien ne casse.
- **`/api/activity-log`** → 403. **`/api/users`** → réduit à son propre compte (plutôt
  qu'un 403, pour que la résolution des noms continue de fonctionner).

ℹ️ **La lecture seule est acquise par ABSENCE** : le rôle ne figure dans aucun
`EDIT_ROLES`. Ne l'y ajouter nulle part. Il n'est pas non plus dans
`DIRECTOR_ASSIGNABLE_ROLES` — Master et Administrator seuls peuvent le donner.

### 🔐 Droits par rôle — `src/auth/roles.ts` est la SOURCE UNIQUE (05/08/2026)

Toutes les règles de rôle vivent dans ce fichier : `VALID_ROLES`, `isValidRole`,
`canAssignRole`, `DIRECTOR_ASSIGNABLE_ROLES`, `USER_DELETE_ROLES`. Même principe que
`constants.ts` pour le routage budgétaire — **jamais de demi-règle recopiée par écran**.
Les listes équivalentes du frontend (`Settings.tsx`, `Projects.tsx`) ne sont que des
commodités d'affichage : elles évitent de proposer un bouton que l'API refusera, elles
ne protègent rien.

**Qui peut quoi sur `/api/users`** :

| Acteur | Peut attribuer | Peut supprimer |
|---|---|---|
| Master | les 7 rôles | oui |
| Administrator | les 7 rôles | oui |
| **Director** | **Coordinator, Digital Manager, Guest, External** | **non** |
| autres rôles | — (bloqués par `requireRole(ADMIN_ROLES)`) | non |

⚠️ **Le défaut corrigé** : `isValidRole` vérifiait que le rôle demandé **existe**, jamais
que l'auteur avait le droit de le donner. Un Director s'attribuait donc Administrator ou
Master en un PUT sur son propre id. `canAssignRole` est appliqué au **POST et au PUT** —
les deux, sinon on créait directement le compte voulu. Et le DELETE, ouvert à
`ADMIN_ROLES`, ne regardait **ni qui supprime ni qui est supprimé**.

⚠️ **Interdire seulement l'auto-promotion aurait été décoratif** : un Director promouvait
un complice qui le promouvait en retour. Le contrôle porte donc sur le rôle **demandé**,
quelle que soit la cible.

⚠️ **Conséquence volontaire** : l'interface envoyant l'objet utilisateur complet, un
Director qui modifierait seulement le nom d'un compte Administrator enverrait quand même
`role: 'Administrator'` et sera refusé. Un Director ne peut donc pas éditer un compte de
niveau supérieur ou égal au sien — ce qui ferme une **seconde voie d'escalade** :
s'approprier un compte Administrator en changeant son identifiant et son mot de passe.

ℹ️ `PUT /api/auth/me` ne déstructure **pas** `role` : on ne peut pas changer son rôle par
son propre profil. `routes/seed.ts` est verrouillé sur Master/Administrator. Ce sont, avec
`routes/users.ts`, les seuls chemins qui touchent au rôle — vérifié par recherche
exhaustive.

ℹ️ **Le rôle vient du JWT**, émis à la connexion et valable 24 h : une promotion ou une
rétrogradation ne prend effet pour l'intéressé qu'à sa prochaine connexion.

### Curseurs de répartition marque / RDM — `alpineShare` et `nissanShare` (04/08/2026)

Migration `20260804110458_add_nissan_share` : `nissanShare Float?` ajouté sur
`Project` **et** `FixedExpense`, à côté d'`alpineShare` qui existait déjà. Deux
colonnes nullables, purement additives — aucune donnée touchée, `migrate deploy`
après relecture du SQL généré en `--create-only` (ne pas lancer `migrate dev` sur
la base de prod).

Sémantique : **`null` = 100 % sur la marque**, pas 50/50. C'est ce qui permet
d'activer la fonction sans déplacer un euro des données existantes. Tout le calcul
vit côté frontend dans `splitShareToBuckets` (`constants.ts`) ; le backend ne fait
que stocker et valider.

Côté routes, deux comportements distincts à connaître :
- `projects.ts` fait `const { tasks, ...projectData } = req.body` puis passe le
  reste à Prisma → **un nouveau champ transite sans modification de code**, mais
  n'est pas validé non plus.
- `fixedExpenses.ts` **déstructure explicitement** chaque champ → il a fallu
  ajouter `nissanShare` en **trois** endroits : `optionalFieldsError` (validation
  `isFiniteNumber`), le `create` et le `update`. Oublier l'un des trois fait
  disparaître la valeur silencieusement.

Le frontend utilise la couche unique `services/dataService.ts` (`apiFetch` + JWT). Résidus
`localStorage` **assumés et hors périmètre** (pas des données serveur) : overlay client-only chat
(épingle / renommage / membres de groupe), avatars de groupe du chat, **ville de l'utilisateur**
(elle pilote la météo de son propre poste dans Hello Marketing), et fallback des anciennes photos
de profil base64 (avant bascule uploads).

⚠️ **Cette liste mentionnait l'anniversaire jusqu'au 04/08/2026 — c'était une erreur de
classement, pas un choix.** Un anniversaire est par nature une donnée d'équipe : le laisser en
`localStorage` faisait que personne ne voyait celui des autres. Il est passé en base, voir la
section dédiée ci-dessous. La ville, elle, reste bien locale.

### Date de naissance — `User.birthdate` (04/08/2026)

Migration `20260804152533_add_user_birthdate` : `birthdate String?` sur `model User`.
Une seule colonne nullable, purement additive — aucune donnée touchée. SQL relu en
`--create-only` avant `migrate deploy` (ne jamais lancer `migrate dev` sur la base de
prod).

**`String` et non `DateTime`, volontairement** : une date de naissance n'a ni heure ni
fuseau. En `DateTime` on rouvrirait la classe de bug J+1 que le projet combat déjà
avec `parseLocalDate`. Au format `'YYYY-MM-DD'` la valeur traverse l'API sans
normalisation — c'est pourquoi `dataService.getUsers` (simple passe-plat) n'a rien eu
à changer.

**Pourquoi ce changement** : la valeur vivait dans le `localStorage` du poste. Or
`BirthdaysSection` (Hello Marketing) bouclait sur les utilisateurs de l'API en
relisant ce `localStorage` pour chacun — un poste ne connaissait donc que les
anniversaires saisis **sur lui**. Même défaut sur la colonne « Anniversaire » de la
Gestion des Utilisateurs.

⚠️ **`routes/users.ts` déstructure explicitement chaque champ** : `birthdate` a dû
être ajouté à **quatre** endroits — `publicUser`, le body du POST, le body du PUT et
`updateData`. En oublier un fait disparaître la valeur en silence : c'est exactement
le piège rencontré avec `nissanShare`. Convention retenue, identique à `avatarUrl` :
`undefined` = champ absent (non modifié), chaîne vide ou `null` = effacement.

**`publicUser` vit désormais dans `src/utils/publicUser.ts`** et est partagé par
`routes/users.ts` et `routes/auth.ts` (login, `GET /me`, `PUT /me`). L'invariant est
inchangé et doit le rester : **ne jamais renvoyer ni émettre l'objet Prisma brut**, il
contient `passwordHash`. Un seul helper plutôt que deux projections à garder
synchronisées. Effet de bord assumé : `GET /me` renvoie maintenant aussi `loginId`, la
donnée de l'utilisateur lui-même, déjà présente dans `/api/users`.

## 🔒 Disponibilité du matériel — anti sur-réservation (30/07/2026)

`src/utils/availability.ts`, appelé par le POST et le PUT de
`routes/equipmentBookings.ts`. Deux règles indissociables, à ne pas simplifier :

1. **Le besoin se mesure en pic jour par jour, pas en somme des chevauchements.**
   Deux réservations qui croisent la période demandée sans se croiser entre elles
   ne s'additionnent pas. Sommer naïvement refuserait des réservations
   légitimes — vérifié : une demande de 1 sur 01→11, avec 1 unité prise sur
   01→02 et 1 sur 10→11 pour un stock de 2, passe (pic = 1) alors qu'une somme
   donnerait 2 et refuserait. Même règle que `getAvailability()` dans
   `pages/Material.tsx`, volontairement : le serveur est le garde-fou, pas une
   seconde règle divergente.
   Optimisation : seuls les **jours critiques** sont testés (début de la période
   + premier jour de chaque réservation qui y entre), l'utilisation ne pouvant
   monter qu'à ces dates — une réservation d'un an ne coûte pas 365 itérations.

2. **Verrou consultatif transactionnel par matériel**, sinon le contrôle est
   décoratif. `pg_advisory_xact_lock(1, hash32(equipmentId))` en tête de la
   transaction : en isolation Read Committed, deux transactions lisent le même
   état et valident toutes les deux. **Mesuré** sur 6 requêtes simultanées avec
   un stock de 2 : sans le verrou **6 acceptées et 6 unités engagées**
   (sur-réservation de 300 %) ; avec, exactement **2 acceptées, 4 refusées**.
   - Verrou `_xact_` (relâché au commit) et **non** de session : le pooler
     Supabase est en mode transaction (`pgbouncer=true`, port 6543), un verrou de
     session n'y survivrait pas.
   - `$executeRaw` et non `$queryRaw` : la fonction renvoie `void`, que Prisma ne
     sait pas désérialiser (P2010 « Failed to deserialize column of type 'void' »).

Réponses : **409** en cas de dépassement, avec un message reprenant demandé /
disponible / stock — affiché tel quel à l'utilisateur (`alert` dans
`Material.tsx`, qui lit déjà `ApiError.message`, aucun changement frontend requis).
Le POST conserve **400** pour un `equipmentId` inconnu (statut d'avant, quand
c'était la violation de clé étrangère qui le produisait).

Corrigé au passage : un **PUT partiel ne portant que `endDate`** pouvait la placer
avant `startDate`, le contrôle croisé n'existant que dans le POST. La
disponibilité est désormais évaluée sur les valeurs **effectives après fusion**,
et non sur le corps de la requête.

## 🔔 Notifications push (Web Push) — 30/07/2026

`/api/push` (`src/routes/push.ts`) + `src/utils/pushSender.ts`. Fonctionne sur
Windows/Mac (Chrome, Edge), Android, et **iOS 16.4+ mais uniquement si l'app est
ajoutée à l'écran d'accueil** — contrainte d'Apple, pas un choix. Le payload est
chiffré avec les clés de l'abonnement : Apple et Google relaient sans pouvoir lire.

**Modèle `PushSubscription`** : un abonnement appartient à un **navigateur**, pas à
un utilisateur (autant de lignes que d'appareils installés). `endpoint` est
`@unique` — c'est la clé naturelle, un navigateur qui se réabonne renvoie le même
endpoint. Sans cette contrainte, chaque rechargement créerait un doublon et
l'utilisateur recevrait N fois la même notification.

**Routes** : `GET /public-key` (non authentifiée, la clé publique l'est par
nature), `POST /subscribe` (upsert sur `endpoint`, réaffecte le `userId` — un poste
partagé change de titulaire), `DELETE /subscribe` (idempotent).

**Configuration — piège à deux temps.** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` et
`VAPID_SUBJECT` doivent être **à la fois** :
1. valorisées dans `~/gearbox/.env` sur le VPS (hors git, permissions `600`) ;
2. **déclarées dans le bloc `environment:` du service `api`** de
   `docker-compose.yml`.
Une variable présente dans le `.env` mais absente de cette liste **n'atteint pas le
conteneur**. `pushSender.ts` trace un avertissement au démarrage si les clés
manquent — sans lui, un push non configuré est indiscernable d'un push qui
n'intéresse personne.

**Qui reçoit quoi** : `resolvePushRecipients()` (dans `pushSender.ts`, extrait pour
être testable) applique trois exclusions à `unreadTargets` — l'émetteur, ceux qui
ont mis la conversation en sourdine (`ChatConversation.mutedBy`), et ceux que
`presence.ts` voit sur la rubrique `chat`. Limite assumée : la présence connaît la
rubrique, pas la conversation ouverte ; quelqu'un dans une autre conversation ne
reçoit pas de push mais voit le compteur non-lu.

**Nettoyage automatique** : un envoi qui répond **404 ou 410** (navigateur
désinstallé, abonnement expiré) supprime la ligne. Sans ça la table se remplit de
fantômes et chaque envoi retente dans le vide. Toute autre erreur est tracée sans
faire échouer l'envoi du message lui-même.

**Sourdine — `chat:conversation:mute`** (`{conversationId, muted}`), calqué sur
`chat:conversation:read` : même contrôle d'appartenance, puis
`chat:conversation:updated`. ⚠️ Ne pas confondre avec `pinnedBy`, qui existe en
colonne mais **n'est jamais écrit** (l'épinglage est un overlay `localStorage` côté
client). La sourdine, elle, est bien en base : c'est le serveur qui décide d'envoyer
le push. Elle coupe le push, **pas** le compteur non-lu (comportement Messenger).

### 🔗 Aperçu de liens — `/api/link-preview` (06/08/2026)

⚠️⚠️ **La seule route du projet qui fetch une URL VENANT DU CLIENT.** C'est
inévitable (un utilisateur colle ce qu'il veut), donc toute la conception est
défensive. Quatre garde-fous, tous nécessaires :
1. **Liste blanche d'hôtes validée AVANT toute requête sortante** (YouTube, Vimeo,
   Dailymotion, Spotify, SoundCloud). Hors liste → `204`, aucun paquet ne quitte le VPS.
2. **L'URL sortante n'est jamais celle du client** : seul un point d'entrée oEmbed
   **écrit en dur** est appelé, avec l'URL validée en paramètre.
3. **`redirect: 'error'`** — sans lui, un fournisseur compromis redirigerait vers
   `169.254.169.254` (métadonnées cloud) ou le réseau Docker interne, et la validation
   d'hôte serait **contournée**.
4. Schéma http/https seulement, timeout 5 s, taille de réponse plafonnée, et on ne
   renvoie au client que les champs utiles — jamais le JSON du tiers (il contient du
   HTML d'iframe).

**Vérifié sur 14 cas** : métadonnées cloud, `localhost`, IP privées, `api:3000`
(réseau Docker), `file://`, `gopher://`, et les pièges de sous-domaine
(`youtube.com.evil.com`, `youtube.com@evil.com`) → tous en `204` sans requête.

⚠️ **Ne pas élargir à « tous les domaines »** : ce serait rouvrir la SSRF que ce
projet a explicitement décidé de fermer. Les autres domaines reconnus (X, Instagram,
SharePoint, Google Photos…) sont habillés **côté client sans aucune requête**
(`lib/linkProviders.ts`) — ces plateformes exigent une authentification pour livrer
leurs métadonnées, un fetch ne rendrait qu'une page de connexion.

### 🎞️ Recherche de GIF — `/api/gifs` (06/08/2026)

Proxy **Giphy**. ℹ️ Tenor était le choix initial mais **ne délivre plus de clé en
libre-service** (constaté le 06/08/2026, son accès passe par Google Cloud).

⚠️ **La clé ne quitte jamais le serveur** : un appel depuis le navigateur l'exposerait
dans l'onglet Réseau et n'importe qui pourrait consommer le quota du groupe.
⚠️ **Configuration en DEUX temps** (piège des clés VAPID, correctif 20) :
`GIPHY_API_KEY` doit être dans le `.env` du VPS **ET** déclarée dans le bloc
`environment:` du service `api` de `docker-compose.yml`. Sans la seconde, elle
n'atteint pas le conteneur.
Sans clé : `503` et le bouton est **masqué** côté client (`/api/gifs/status`) — la
fonction s'éteint proprement au lieu d'afficher un bouton qui échoue.

`rating=pg` : outil de travail. `g` ne renverrait presque rien, `pg-13` laisse passer
trop. Les URL renvoyées sont **filtrées sur `https://…giphy.com/`** — sans ça une
réponse inattendue injecterait une URL arbitraire, rendue en `<img>` chez tous les
participants. Mention « Powered By GIPHY » imposée par la licence.

ℹ️ Un GIF choisi est envoyé comme message **`text`** portant son URL, pas comme
`image` : la purge marque « expiré » tout `image`/`file`/`audio` après 180 j, or un
GIF Giphy n'est pas un fichier de notre disque — il serait marqué expiré alors que
l'URL distante fonctionne toujours.

### 💬 Types de message — liste FERMÉE côté serveur (06/08/2026)

`chat:message:send` normalisait ainsi : `type === 'image' ? 'image' : type === 'file' ?
'file' : 'text'`. **Tout type inconnu retombait silencieusement sur `'text'`** — un type
ajouté côté client sans l'être ici était stocké et affiché comme du texte brut, sans la
moindre erreur. Remplacé par une liste explicite `TYPES_CONNUS`.

Types actuels : `text`, `image`, `file`, **`project`** (citation d'un projet ;
`content` porte l'**id** du projet, résolu à l'affichage), **`audio`** (message vocal ;
`content` = URL du fichier, et **`fileName` porte la DURÉE formatée** « 0:12 » — le
modèle n'a pas de champ de durée, et ce champ est inutilisé par ce type, donc aucune
migration).

⚠️ **Quatrième point de passage pour un type porteur d'un FICHIER** : le filtre
`type: { in: [...] }` de `purgeOldChatFiles` (`jobs/purge.ts`). Un type absent de cette
liste n'est **jamais purgé**, silencieusement — le fichier reste sur le disque du VPS
indéfiniment. `'audio'` y a été ajouté. `'project'` n'y est pas et ne doit pas y être :
son `content` est un id, pas un fichier.

⚠️ Les extensions **audio** ont été ajoutées à `EXT_AFFICHABLES` (`index.ts`) : servi
en `Content-Disposition: attachment`, un enregistrement est téléchargé au lieu d'être
lu, et un `<audio>` ne peut rien en faire. Formats **passifs**, sans le risque du
`.svg` ; `nosniff` continue de s'appliquer.

⚠️ **Trois points de passage obligés pour tout nouveau type**, sinon l'échec est muet :
1. `TYPES_CONNUS` (`realtime/chat.ts`) — sans quoi le type est écrasé en `text` ;
2. l'union de `ChatMessage.type` dans `types.ts` ;
3. **`apercu` / `lastMessage`** — qui sert AUSSI de corps aux **notifications push**.
   Le repli est `content.slice(0, 60)` : un type non traité affiche donc le contenu
   brut, c'est-à-dire l'URL d'un fichier ou, pour `project`, **l'id du projet** dans la
   liste des conversations et sur le téléphone. D'où la résolution du nom du projet en
   base au moment de l'envoi.

Aucune migration : `ChatMessage.type` est un `String` libre, pas un enum Prisma.

### 🖼️ Photo de groupe — `chat:conversation:avatar` (06/08/2026)

Migration `20260806103000_add_chat_conversation_avatar` : `avatarUrl String?` sur
`ChatConversation`. Une colonne nullable, sans `DEFAULT` — opération de catalogue
Postgres, ni réécriture de table ni verrou long.

**Pourquoi ce handler existe** : la photo d'un groupe vivait en **base64 dans le
`localStorage`** du poste qui l'avait déposée (clé `gearbox_conv_avatar_<id>`), donc
invisible de tous les autres **par construction**. **Troisième occurrence** du même
piège après la date de naissance et les jeux — le réflexe à avoir devant « X ne
s'affiche que chez moi » est de chercher *où la valeur est stockée* avant de chercher
un bug d'affichage.

`chat:conversation:avatar` (`{conversationId, avatarUrl}`) est calqué sur
`chat:conversation:mute` : même contrôle d'appartenance, même
`io.to(convRoom(id)).emit('chat:conversation:updated', …)`, même `reply(ack, …)`.
Convention du projet : `null` = suppression.

⚠️ **On stocke une URL de fichier uploadé, jamais du base64** : la conversation est
relue en entier à chaque `GET /conversations`, une image encodée dedans la ferait
grossir sans fin. Le type d'upload réutilisé est **`avatar`** (liste blanche d'images,
5 Mo) et non `chat`, qui accepte tout format — `uploads.ts` est inchangé.

⚠️⚠️ **`AVATAR_UPLOAD_PATH` — le point de sécurité de ce lot.** La valeur est écrite
par un utilisateur et **rendue dans un `<img>` chez tous les autres** : elle ne peut
pas être crue sur parole. Le handler n'accepte donc **que** la forme
`/uploads/avatar/<uuid v4>.<jpg|png|gif|webp>`. Sans ce contrôle, un participant
pourrait pointer la photo vers une **URL externe** que le navigateur de chaque membre
irait charger (fuite d'IP, pixel de traçage, accusé de lecture involontaire), ou vers
`/uploads/chat/…` où **aucun format n'est filtré à l'entrée**. Les 4 extensions sont
exactement celles que produit `EXT_BY_MIME` pour la liste blanche `avatar` (pas de
`.jpeg` possible).
ℓ **Écart préexistant assumé** : `PUT /api/auth/me` ne valide **pas** la forme de
`avatarUrl` pour un utilisateur — même trou, pas encore fermé. Le regex est
réutilisable tel quel, voir `BUGS-CONNUS.md`.

**Trois contrôles, dans cet ordre** : forme de l'URL → `type === 'group'` →
appartenance. Le filtre `type` passe **avant** l'appartenance parce qu'une conversation
privée affiche l'avatar de l'autre utilisateur et le Chat Général son icône `#` : y
écrire `avatarUrl` créerait un état en base que rien n'affiche jamais. C'est aussi
pourquoi la branche `type === 'general'` du test d'appartenance de `mute` **n'a pas
d'équivalent ici** — elle serait du code mort, ce n'est pas un oubli à « rétablir ».

⚠️ **Droit volontairement ouvert à TOUS les participants** (arbitrage de Théo), et non
aux seuls `adminIds` comme le renommage et la gestion des membres. « Ouvert aux
participants » n'est pas « ouvert à tous » : le contrôle d'appartenance reste
indispensable, c'est lui qui empêche un tiers d'écrire.

**Chef de site** : rien à ajouter, il est bloqué par trois portes préexistantes —
`joinUserRooms` **et** `registerChatHandlers` sont tous deux sous `if (social)`
(`realtime/index.ts`), donc il ne rejoint aucune room de conversation et le listener
n'existe même pas pour lui ; `chat` est absent de ses rubriques ; et `UPLOAD_ROLES`
lui refuse l'upload. Ne pas l'ajouter à une liste « pour faire propre ».

**Service worker** (`public/sw.js`, servi par le front) : `push` +
`notificationclick` uniquement, **aucun gestionnaire `fetch`**. C'est délibéré et à
ne pas modifier — un service worker qui met en cache fige les utilisateurs sur une
vieille version qu'on ne peut plus corriger à distance. Sans `fetch`, les en-têtes
`Cache-Control` de nginx pilotent seuls la fraîcheur.

## ⚠️ Route DORMANTE — `/api/expenses` (modèle `OneOffExpense`)

Route CRUD complète et fonctionnelle (émissions `expense:*` incluses), mais
**aucun écran ne l'utilise et la table est vide**. Les dépenses ponctuelles se
saisissent comme une `FixedExpense` avec `isAnnual = false` : le montant n'est
imputé que sur le mois de sa date, et ce modèle offre en plus le multi-sites, la
répartition %/€, les marques et PRO+.

Une rubrique dédiée a été créée puis retirée le 29 juillet 2026 : c'était un
second chemin plus pauvre vers un besoin déjà couvert (voir correctif 10 dans
`ETAT-PROJET.md`). **Ne pas rebrancher sans arbitrage produit.** Route et modèle
conservés en l'état, sans migration.

## ✅ Uploads de fichiers (`feat/backend-uploads`) — vérifiés en base + sur disque

- **`POST /api/uploads/:type`** (`chat|avatar|calendar`), auth JWT, `multer` disque, nom **uuid**,
  renvoie `{ url: "/uploads/<type>/<uuid>.<ext>" }`. **`GET /uploads/...`** en `express.static`.
  Monté sur l'entrypoint `backend/src/index.ts`, proxy Vite `/uploads`.
- **OÙ VIVENT LES FICHIERS** (audit du 05/08/2026) : volume Docker **nommé**
  `gearbox_uploads_data`, monté sur `/app/uploads` dans le conteneur `api`,
  physiquement `/var/lib/docker/volumes/gearbox_uploads_data/_data` sur le VPS.
  **Rien dans Supabase** (qui ne stocke que les URL relatives), **aucun S3**. Le volume
  étant nommé, il survit aux `docker compose up --build`. Relevé à l'audit : 4,6 Mo
  pour 16 fichiers, disque de 193 Go dont 186 libres.
- Formats/tailles **figés** : avatar jpeg/png/gif/webp 5 Mo · **chat TOUS FORMATS 100 Mo**
  (depuis le 05/08/2026) · calendar jpeg/png/webp/mp4/mov 2 Go.
  Refus → 415 (format) / 413 (taille) / 400 (type) / 401 (sans token).
  ⚠️ **La limite de multer est ATTEINTE dès l'égalité**, pas dépassée : mesuré,
  104 857 599 octets passaient mais 104 857 600 (100 Mio pile) partait en 413 alors que
  le message annonce « max 100 Mo ». On passe donc `fileSize: maxBytes + 1` pour que
  `maxBytes` soit un maximum **inclusif**. Ne pas « simplifier » ce `+ 1`.
- ⚠️⚠️ **SÉCURITÉ — les en-têtes de `express.static` sont load-bearing.** Le chat
  acceptant tous les formats, les fichiers sont servis **depuis le domaine de Gearbox** :
  sans en-tête, un `.html` ou un `.svg` déposé dans une conversation puis ouvert dans
  l'onglet s'exécute **dans la session de celui qui l'ouvre** (XSS stocké, vol de jeton).
  `index.ts` pose donc, via l'option `setHeaders` :
  `X-Content-Type-Options: nosniff` **partout**, et `Content-Disposition: attachment`
  **sauf** pour `.jpg .jpeg .png .gif .webp .pdf`. `.svg` en est **volontairement
  absent** (format actif). La liste porte sur l'**extension du fichier sur le disque**,
  jamais sur un type MIME — c'est le client qui le déclare.
- ⚠️ **Le nom d'origine n'entre JAMAIS dans un chemin.** Le fichier sur disque porte un
  uuid ; l'extension vient du MIME quand il est connu, sinon d'une extraction assainie
  du nom fourni (`[a-z0-9]{1,8}`, via `safeExtFromName`). Vérifié : un fichier nommé
  `../../evil.sh` atterrit sous un uuid dans `chat/`. Le nom réel vit en base
  (`ChatMessage.fileName`), pas sur le disque.
- **Purges automatiques** (`backend/src/jobs/purge.ts`, un **seul** timer : +15 s au
  démarrage puis 24 h, les deux fonctions enchaînées dans `runSafe`) :
  | Type | Rétention | Ancre |
  |---|---|---|
  | `calendar` | 30 j | `SocialPost.archivedAt` |
  | `chat` | **180 j** (05/08/2026) | `ChatMessage.timestamp` |
  | `avatar` | aucune | — (volontaire) |
  - ⚠️ « Archivé » pour calendar = une **PUBLICATION Digital**, pas un projet. Confusion
    fréquente. `archivedAt` est renseigné serveur à la bascule `archived` false→true et
    remis à `null` au désarchivage, ce qui **annule le décompte**.
  - Pour le chat, le fichier est supprimé mais **le MESSAGE RESTE** : `fileExpiredAt` est
    renseigné et l'interface affiche « pièce jointe expirée ». On ne réécrit pas
    l'historique d'une conversation pour libérer de la place.
  - `fileExpiredAt: null` dans le filtre est ce qui rend le job **idempotent** — sans
    lui, chaque passage retenterait des suppressions déjà faites.
  - ⚠️ **PIÈGE : lancer la purge en local agit sur la base de PROD avec le disque
    LOCAL.** Un message de plus de 180 jours serait marqué « expiré » alors que son
    fichier vit toujours sur le VPS. Vérifier l'âge des messages avant tout test.
  - `DELETE /api/social/:id` nettoie aussi les fichiers du post supprimé.

## ✅ Espace disque — `GET /api/storage` (05/08/2026)

`src/routes/storage.ts`. Renvoie l'état du système de fichiers qui **porte** les uploads
(`fs.statfsSync`, disponible depuis Node 18.15 — l'image est en `node:20-slim`) et le
poids des uploads **par type**, avec le nombre de fichiers.

- **Lecture ouverte à TOUS les rôles authentifiés** (demande explicite de Théo) : savoir
  si le serveur sature concerne tout le monde. Aucune donnée sensible n'y transite — ni
  chemin absolu, ni nom de fichier, seulement des volumes agrégés. 401 sans jeton.
- `bavail` et non `bfree` : `bfree` inclut la réserve root et surestimerait l'espace
  réellement exploitable.
- **Cache mémoire 60 s**, même motif que le proxy de flux : sans lui, chaque ouverture
  des Paramètres reparcourrait toute l'arborescence.
- Côté interface, la barre porte sur le **disque**, pas sur « uploads / disque » — ce
  dernier resterait à 0 % et ne dirait rien du risque réel de saturation.
- Branchements front : Chat (upload → URL dans le message socket), Settings (upload → PUT avatarUrl),
  Digital (upload → `mediaFiles`). Plus de base64 pour ces médias.
- Vérifié en base réelle (8/8) : `User.avatarUrl` persisté, `SocialPost.mediaFiles` persisté,
  `archivedAt` set à l'archivage / null au désarchivage, purge supprime fichier disque + référence
  base, taille > limite → 413. Données de test nettoyées.

## ✅ Diffusion temps réel des mutations (29 juillet 2026)

Chaque route métier émet un événement Socket.IO via `emitEvent` (`src/realtime/index.ts`,
`io.emit` = **broadcast global**, tous clients authentifiés confondus) :

| Ressource | Événements |
|---|---|
| projects · campaigns · budget · contacts · social | `<res>:updated`, `<res>:deleted` |
| users | `users:updated`, `users:deleted` |
| equipment · equipment-booking · expense · fixed-expense | `<res>:created`, `:updated`, `:deleted` |
| tags | `tags:updated` |
| activity | `activity:created` |

Nommage volontairement laissé hétérogène (pluriel/singulier, `created` présent ou non) :
le front ignore le payload et ne se sert que du nom, la table de référence côté
consommateur est `services/realtime.ts` (`RT_EVENTS`).

⚠️ **`users.ts` : ne jamais émettre l'objet Prisma brut** — il contient `passwordHash`,
qui serait diffusé à tous les clients connectés. Le helper `publicUser` est la seule
forme qui sort du module, réponse HTTP comme événement socket.

✅ **L'auteur d'une mutation est EXCLU de la diffusion** (depuis le 30/07/2026). Le
client envoie son `socket.id` dans l'en-tête `x-socket-id` ; `withEmitterContext`
(monté avant les routes dans `index.ts`) le mémorise pour la durée de la requête via
`AsyncLocalStorage` ; `emitEvent` diffuse alors en `io.except(socketId)`. Les ~35
sites d'appel sont inchangés et aucune route n'a besoin de connaître le socket.

✅ **`PUT /me` émet enfin, lui aussi** (depuis le 04/08/2026). Cette route ne
diffusait **aucun** événement et n'appelait pas `notifyUserChanged`, alors que
`routes/users.ts` faisait les deux : modifier **son propre** profil (nom, avatar, et
désormais anniversaire) ne rafraîchissait donc ni les autres clients ni le cache de
présence — il fallait un F5. Manque préexistant, corrigé parce que le bloc
« Anniversaires » de Hello Marketing en dépend directement. Vérifié à deux onglets :
l'onglet spectateur est passé de « 29 ans / dans 224 j » à « 28 ans / Auj. ! » **sans
rechargement**.

Pourquoi : sans exclusion, l'auteur refetchait sa propre écriture 300 ms plus tard
(`services/realtime.ts`) et écrasait son état local — une puce de marque cliquée dans
`Projects.tsx` se dé-sélectionnait. Dégradation sûre : sans en-tête (curl, outil
externe, client hors socket), on retombe sur une diffusion à tous.

## ✅ Présence en temps réel (29 juillet 2026)

`src/realtime/presence.ts` — état **en mémoire uniquement**, aucune table Prisma : la
présence est éphémère et liée à la durée de vie d'une connexion socket.

| Sens | Événement | Charge |
|---|---|---|
| client → serveur | `presence:set` | `{ section: string }` (borné à 40 caractères, pas de liste blanche pour ne pas resynchroniser ce fichier à chaque nouvelle rubrique du frontend) |
| serveur → tous | `presence:state` | instantané complet `{ [section]: PresenceUser[] }` |

- **Un utilisateur = une seule rubrique** : plusieurs onglets produisent plusieurs
  entrées `socket.id`, l'instantané ne retient que la plus récente (`at`).
- **Identité résolue serveur** (`name`, `avatarColor`, `avatarUrl`) et mise en cache :
  le JWT ne porte que `{ id, role }`, insuffisant pour rendre un avatar.
  `routes/users.ts` appelle `notifyUserChanged(userId)` après PUT et DELETE →
  recharge le cache, ou purge les présences si le compte n'existe plus.
- **Pas de persistance volontaire** : au redémarrage du conteneur `api` l'état est
  vide, les clients se réannoncent sur leur événement `connect`.
- Pas de diffs, uniquement des instantanés complets : à l'échelle d'une dizaine
  d'utilisateurs c'est moins coûteux à raisonner qu'une synchro incrémentale.

## ✅ Déploiement VPS — FAIT (8 juillet 2026, en production depuis)

En ligne sur https://gearbox.bonyauto-mobile.com. Détail de l'architecture ci-dessous,
procédure opérationnelle dans `DEPLOIEMENT.md`, état global dans `ETAT-PROJET.md`.

- Architecture conteneurisée split : `api`
  (backend/Dockerfile multi-stage, `prisma migrate deploy` au démarrage) + `web` (nginx servant
  le build Vite) + `caddy` (reverse-proxy `/api`, `/socket.io`, `/uploads` → api, reste → web,
  HTTPS auto). Volume persistant `uploads_data` pour les uploads, variables dans `.env` racine
  (voir `.env.example`). `server.ts` (ancien monolithe racine) supprimé — code mort.

## ✅ Proxy de contenus externes — `/api/feeds` et `/api/music` (30 juillet 2026)

Hello Marketing a besoin de contenus que le navigateur **ne peut pas** aller chercher
lui-même (CORS) : flux RSS et playlist Deezer. Le frontend passait par le proxy tiers
`corsproxy.io`, dont l'offre gratuite est réservée à localhost — d'où des blocs qui
ne fonctionnaient jamais en production. On proxifie donc nous-mêmes.

| Route | Rôle |
|---|---|
| `GET /api/feeds` | liste `[{ key, name, color, category }]` — **jamais les URL** |
| `GET /api/feeds/:key` | contenu brut du flux, `Content-Type` d'origine |
| `GET /api/music/tracks` | passe-plat JSON de la playlist Deezer |

⚠️ **RÈGLE : jamais de proxy acceptant une URL fournie par le client.** Le registre
des flux (`backend/src/routes/feeds.ts`) est la seule source des URL, et le client
n'envoie qu'une **clé**. Un paramètre `?url=` transformerait l'API en relais capable
d'atteindre le réseau interne Docker ou des endpoints de métadonnées cloud (SSRF).
Clé inconnue → 404 **sans aucune requête sortante**. Routes protégées par
`authenticateToken` pour ne pas offrir un relais anonyme.

Autres garde-fous : cache mémoire (15 min les flux, 30 min Deezer), timeout 8 s via
`AbortController`, en-têtes sortants de navigateur (`User-Agent` + `Accept`) — sans
eux, Usine Digitale renvoie 403. Échec amont → **502**, le frontend dégrade déjà
proprement (`Promise.allSettled`).

Bénéfice opérationnel : un flux RSS meurt régulièrement (4 sur 8 l'étaient le
30/07/2026). Le corriger ne demande plus qu'un redéploiement de `api`, sans toucher
au frontend.

## ⚠️ Règle de robustesse — accès base et rappels détachés

**Ne JAMAIS faire d'accès base (ni aucun `await` susceptible d'échouer) dans un
rappel passé à une API qui ne l'attend pas** : `jwt.verify(token, secret, cb)`,
`setTimeout`, `setInterval`, un handler Socket.IO sans `try/catch`.

Pourquoi : un tel rappel s'exécute **après** que le handler Express a rendu la
main. La promesse qu'il renvoie n'est attendue par personne — ni Express, ni
`express-async-errors`, ni `middleware/errorHandler.ts` ne peuvent la voir. Node
la classe en *unhandled rejection* et **termine le process** (défaut depuis Node
15). Une coupure Supabase de deux secondes a ainsi tué l'API le 30/07/2026, et
chaque redémarrage coupe **toutes** les connexions Socket.IO des utilisateurs.

Formes correctes :
- `jwt.verify` **synchrone** dans un `try/catch` (voir le helper `decodeToken` de
  `routes/auth.ts`), puis l'accès base dans le handler async ;
- handler Socket.IO : `try/catch` couvrant tout le corps (c'est déjà le cas des
  5 handlers de `realtime/chat.ts` et de `realtime/presence.ts`) ;
- timer : encapsuler dans une fonction qui gère ses erreurs (`runSafe` de
  `jobs/purge.ts`).

Filet de dernier recours dans `index.ts` : `process.on('unhandledRejection')`
journalise sans tuer le process. **Ce n'est pas une excuse** pour ne pas traiter
l'erreur à la source. Pas de handler `uncaughtException` volontairement : une
exception synchrone non rattrapée laisse un état imprévisible, et là redémarrer
est le bon comportement (`restart: always` côté Docker).

## Rappels d'environnement (contrainte TOUJOURS active)

- **Réseau bureau : ports PostgreSQL 5432/6543 bloqués → hotspot 4G obligatoire** pour toucher
  Supabase (migrations, seed, tout accès DB). Ouverture des ports par l'IT toujours en attente.
- `DIRECT_URL` = Session pooler (5432, requis par `prisma migrate`) ; `DATABASE_URL` = transaction
  pooler (6543, `?pgbouncer=true`, utilisé par le client Prisma à l'exécution).
- `backend/.env` non versionné : si absent après une manœuvre git → `cp .env backend/.env`.
- `backend/uploads/` gitignoré (données runtime, recréées au démarrage par la route uploads).
