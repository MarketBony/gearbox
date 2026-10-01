# CLAUDE.md — méthodologie de travail sur GEARBOX

Ce fichier décrit **comment on travaille sur ce projet**, pas l'état du code. Il est
chargé automatiquement à chaque session : c'est lui, et non un prompt de reprise
recopié, qui porte la méthode — un prompt vit dans un presse-papier et se périme, ce
fichier suit les lots.

Pour l'état du code :
- `ETAT-PROJET.md` — mémoire de référence globale. **Il fait ~270 Ko : ne le lis pas
  en entier.** En début de session, lis le bloc `## ▶ POINT DE REPRISE` (tout en haut :
  où on en est, où on va — à remettre à jour en fin de session), la section `## Déploiement`
  (dernier correctif en ligne) et `## Pièges connus qui font perdre du temps`. Le reste
  (historique, backlog) se consulte au besoin, par le graphe ou par recherche ciblée.
- `ETAT-BACKEND.md` — état détaillé du backend/API
- `BUGS-CONNUS.md` — bugs identifiés, corrigés ou non. ⚠️ Une cause écrite dans une
  fiche n'est pas forcément la bonne : plusieurs diagnostics étaient faux. Revérifier
  dans le code avant de coder dessus.
- `DEPLOIEMENT.md` — mode d'emploi technique du VPS (référence, pas à dupliquer ici)
- Ne pas se fier à `BACKEND-AUDIT.md` : document historique, il porte un bandeau.

Ne duplique jamais leur contenu ici : ce fichier ne parle que de méthode.

**Démarrage de session** : fais le point à Théo — dernier correctif en ligne, `master`
synchronisé ou non avec `origin` (`git fetch` d'abord), branchement graphify/ECU (voir
en bas) — puis attends le sujet. Fonctionnement attendu : tu audites, tu proposes un
plan, Théo valide, puis on attaque. Signale ce qui cloche même sans qu'on te le
demande, et dis franchement ce que tu n'as pas pu vérifier.

## Qui fait quoi

Théo cadre le besoin avec Claude (Anthropic, Cowork) en amont. Le prompt qui en
sort t'arrive déjà cadré — ce n'est pas à toi de re-négocier le besoin métier, mais
tu dois challenger si quelque chose ne colle pas avec le code réel ou les règles
métier ci-dessous.

## Pipeline standard, du prompt au code en ligne

1. **Modifs locales** dans ce dossier (`gearbox3backup`), sur une branche dédiée
   nommée `fix/...`, `feat/...` ou `chore/...` selon la nature du changement
   (convention déjà en place, voir `git log`).
2. **Test réel sur localhost** — jamais un `tsc` seul :
   - serveurs **par nom** depuis `.claude/launch.json` : `gearbox-web` (Vite,
     port 3000) et `gearbox-api` (nodemon, port 3001) ;
   - vrai test dans le navigateur, avec le vrai rôle concerné (voir « Rôles
     cloisonnés ») ; `curl` en complément quand c'est pertinent. Aucun compte de
     test et pas de jeton fabriqué : c'est Théo qui se connecte (son JWT dure
     24 h — s'il a expiré, demande-lui de se reconnecter) ;
   - **pas de base de dev : le backend local écrit dans la base de PRODUCTION.**
     Créer une entité clairement nommée, vérifier, supprimer, contrôler qu'il ne
     reste aucun résidu. Sur un VRAI projet, rester en lecture seule (onglet
     réseau : que des GET). Une page ouverte sur l'entité testée est un écrivain
     concurrent : en sortir avant de mesurer ;
   - **schéma Prisma** : jamais `prisma migrate dev` (il vise la base de prod).
     On écrit la migration à la main dans `backend/prisma/migrations/`, puis on
     l'applique avec `prisma db execute` **puis** `prisma migrate resolve
     --applied` (sans la seconde étape, le conteneur `api` rejoue la migration au
     démarrage et ne démarre plus). Toujours additive tant que possible. Hotspot
     4G obligatoire (ports 5432/6543) — signale-le dès le plan.
3. **🛑 RECETTE PAR THÉO — tu t'arrêtes ici et tu montres.** Ce n'est pas une
   demande de permission, c'est une étape de recette qui lui appartient.
   ⚠️ **Une autorisation de push vaut pour LE lot en cours, jamais pour le
   suivant.** Le mode Expert (correctif 43) est parti en prod sans recette parce
   que le « push and deploy » du lot précédent avait été reconduit tout seul :
   quatre modules à jeter, et le correctif 44 entièrement consacré à réparer.
4. **Après la validation de Théo** :
   - **RÈGLE D'OR — mettre à jour les `.md` de suivi AVANT de pousser.**
     `ETAT-PROJET.md` (dernier correctif, historique, backlog),
     `ETAT-BACKEND.md` si le backend bouge, `BUGS-CONNUS.md` (cocher ce qui est
     corrigé, ajouter ce qui a été découvert), `DEPLOIEMENT.md` si la procédure
     change. La doc fait partie du lot déployé — **jamais** « je documenterai
     après », c'est trop tard : un déploiement non documenté fait repartir la
     session suivante sur de fausses bases. Vérifie la date du jour (`date`)
     avant de dater une entrée.
   - commit, merge sur `master` en local,
   - **`git pull` avant tout push** : un workflow GitHub pousse un dump Supabase
     dans `backups/` chaque semaine, le local est vite en retard,
   - push GitHub (HTTPS, voir « Garde-fous »), migration Supabase si besoin
     (étape 2), puis VPS.
5. **Déploiement VPS — autonome, via SSH direct.** Clé `~/.ssh/id_ed25519` sur ce
   poste : `ssh ubuntu@51.83.75.181` — **l'alias `gearbox-vps` n'existe pas**
   (voir `ACCES-INFRA-SECRET.md`, hors dépôt git, pour le détail des accès). Accès
   complet décidé explicitement par Théo, différent de la deploy key GitHub
   lecture seule installée sur le VPS. Concrètement :
   - `cd ~/gearbox && git pull && sudo docker compose up -d --build <service>`,
   - **quel service ?** Décide-le avec `git diff --name-only <avant>..<après>`, ne
     le suppose pas : un fichier sous `backend/` → `api` ; un fichier hors de
     `backend/` (pages, composants, `constants.ts`, `types.ts`, `index.html`…) →
     `web` ; les deux si le lot touche les deux côtés. L'image `web` ne compile
     pas `backend/`, et le client Prisma est généré au build de l'image `api`,
   - `prisma migrate deploy` tourne au démarrage du conteneur `api` : la migration
     doit donc déjà être appliquée **et** inscrite (étape 2). Contrôle : ligne
     `No pending migrations to apply.` dans `sudo docker compose logs api`,
   - **vérifie systématiquement après coup** : `sudo docker compose ps` (3
     conteneurs Up) et un `curl` sur le domaine public (200) avant de
     considérer le déploiement terminé,
   - **rends compte à Théo de ce que tu as exécuté et du résultat** — l'accès
     est autonome, le compte-rendu ne l'est pas : il doit toujours savoir ce
     qui a tourné sur la prod, même a posteriori.
   - Si le SSH échoue : c'est très probablement le réseau bureau (port 22
     bloqué), pas un problème de droits — dis-le explicitement, ne réessaie pas
     en boucle, demande à Théo de basculer sur le hotspot 4G.

## Contrainte réseau (toujours active)

Le réseau du bureau bloque le port **22** (SSH vers le VPS) et les ports
**5432/6543** (Supabase). Toute opération touchant le VPS ou la base doit se
faire depuis le hotspot 4G. Si tu ne peux pas y accéder, dis-le clairement plutôt
que de supposer que ça va passer.

## Garde-fous

- Ne jamais committer `.env`, `backend/.env`, ni aucun secret.
- Ne jamais réactiver ou appeler `/api/seed` en production (bloqué à dessein,
  réinitialise les mots de passe).
- Le repo GitHub est **privé** — la deploy key installée sur le VPS est en
  **lecture seule** par design ; ce n'est pas la clé que tu utilises pour push
  depuis ce poste, ne pas les confondre.
- **Deux accès distincts, ne jamais les mélanger** :
  1. deploy key SSH sur le VPS → lecture seule, sert au VPS pour tirer GitHub,
     tu ne l'utilises jamais toi-même ;
  2. push GitHub depuis ce poste → **remote en HTTPS, pas en SSH**
     (`https://github.com/MarketBony/gearbox.git`). L'authentification passe
     par Git Credential Manager (identifiant Windows en cache) ou, si ce cache
     est absent/expiré, par un Personal Access Token GitHub fine-grained scopé
     sur ce repo. Si `git push` échoue en authentification, dis-le explicitement
     à Théo plutôt que de chercher une solution de contournement (ne bascule
     pas le remote en SSH sans qu'il le demande).
  3. clé `~/.ssh/id_ed25519` (sur ce poste) → accès SSH complet au VPS pour
     déployer (mot de passe en fallback, à ne plus utiliser), ne donne aucun
     accès GitHub.
- **Secrets d'infra** (IP/mot de passe VPS, détail des accès) : voir
  `ACCES-INFRA-SECRET.md` à la racine — fichier gitignoré, **jamais** commité,
  jamais recopié ailleurs. Si ce fichier n'existe pas ou semble périmé,
  demande confirmation à Théo avant d'agir sur sa base.
- Avant un chantier structurant (refonte, changement de modèle de données),
  vérifie l'existant réel dans le code (pas seulement la doc) et signale les
  divergences plutôt que de les corriger sans validation.
- Commiter en **nommant les fichiers**, pas `git add -A` (il a déjà embarqué
  `budget market 2026.xlsx` et `PRESENTATION-EQUIPE.html`, volontairement non suivis).

## Pièges d'environnement (ceux qui font perdre du temps)

- **Tailwind est en CDN Play** : pas de variantes `md:` / `hover:` sur les classes
  custom `gx-*` / `glass-*`, pas de valeur arbitraire contenant `repeat(...)`, et
  racines de pages en `h-full`, jamais `h-screen`.
- **nodemon surveille `*.*`** : écrire un script de test dans `backend/` redémarre
  l'API. Les scripts jetables vont hors de `backend/`.
- **`prisma generate` échoue en EPERM si l'API tourne** (DLL verrouillée) : arrêter
  `gearbox-api`, générer, **relancer**.
- **`tsc --noEmit` : 9 erreurs de référence à la racine** (et non plus 12, chiffre
  resté dans les vieilles entrées), **0 au backend**. On compare à ça, pas à zéro.
  Et `strictNullChecks` est désactivé : `tsc` ne rattrape pas un prop oublié chez
  un appelant, il faut relire les sites d'appel.
- **L'horloge de ce poste a déjà semblé décalée** : vérifier la date avant de dater
  une entrée de doc.

## Leçons payées cher, à ne pas repayer

- **Un test HTTP ne remplace pas un test dans l'interface avec le vrai rôle.** Deux
  fois les 403 étaient exacts et l'écran mentait quand même.
- **Mesurer, pas deviner.** Deux lots de suite refaits pour ça : les colonnes du
  tableau des tâches (944 px de colonnes fixes pour un `min-width` de 920) et les
  étiquettes du Gantt (largeur de texte estimée au lieu d'être mesurée au canvas,
  puis crans ignorant la diagonale d'un losange). On mesure dans le navigateur.
- **Un indicateur qui ne regarde que le « reste à faire » est aveugle sur un projet
  avancé** : les KPI du mode Expert affichaient 0 € partout et masquaient les
  95 700 € portés par une personne.
- **Piège de vocabulaire : `Project.proPlus` ≠ `Project.expertMode`.** `proPlus`
  (PRO+ B2B) est un marqueur MÉTIER qui change des chiffres dans Dashboard, Budget
  et Export ; `expertMode` (mode Expert) est un marqueur d'INTERFACE qui ne change
  aucun montant. Ils se suivent dans le schéma et n'ont aucun rapport — c'est pour
  ça que le mode ne s'appelle pas « PRO ».

## Règles métier non négociables (rappel — source de vérité : `constants.ts`, `types.ts`)

- Renault + Dacia + Mobilize = un seul compte d'exploitation, pas de distinction
  budgétaire entre elles.
- **Alpine est PAR SITE, Nissan est GLOBAL.** Asymétrie voulue, elle reflète la
  réalité du groupe — ce n'est pas un bug, et c'est la règle la plus souvent
  cassée par inadvertance (5 défauts corrigés le 03/08/2026, cf. `BUGS-CONNUS.md`) :
  - Alpine n'existe que sur `ALPINE_SITES` (Clermont, Vichy, Le Puy-en-Velay,
    Rodez), avec **une enveloppe par site** : `Alpine-Clermont`, `Alpine-Vichy`,
    `Alpine-Le Puy`, `Alpine-Rodez`. **Il n'y a PAS d'entité « Alpine » globale** —
    on l'obtient en croisant le tag marque Alpine avec le périmètre. Un pseudo-site
    `Alpine` a existé dans les sélecteurs et ne correspondait à aucune ligne : il a
    été retiré.
  - Nissan couvre `NISSAN_SITES` (liste plus large) mais n'a **qu'une seule
    enveloppe globale**, jamais ventilée par site. Elle n'entre dans un périmètre
    que si `Nissan` y est **explicitement** sélectionné : la rattacher à chacun de
    ses sites éligibles la compterait autant de fois.
- **Éléments mixtes : les curseurs `alpineShare` / `nissanShare`.** Un projet ou
  une dépense taggué Alpine (ou Nissan) **et** une marque RDM porte un curseur de
  répartition, en pourcentage, entre l'enveloppe de la marque et le compte RDM.
  Trois règles :
  1. **Curseur vide = 100 % sur la marque**, jamais 50/50. C'est le comportement
     historique, et c'est ce qui a permis d'activer la fonction sans déplacer un
     euro. Les formulaires doivent donc afficher **100** par défaut — afficher 50
     laissait croire à une répartition qui n'avait pas lieu.
  2. **Le curseur n'est lu que si une marque RDM est présente**, même condition que
     son affichage. Sinon une valeur restée en base après le retrait du tag Renault
     scinderait en douce un élément Alpine pur.
  3. **Alpine passe avant Nissan** sur l'improbable Alpine + Nissan + RDM : Alpine
     gagne, `nissanShare` est ignoré. Une part ne va jamais dans deux buckets marque.
- ⚠️ **Tout routage budgétaire passe par `constants.ts`** — `resolveBudgetLine()`,
  `splitShareToBuckets()`, `resolveSiteAlias()`. Ne jamais réimplémenter cette
  logique dans un écran : c'est exactement ce qui a fait diverger Budget et
  Dashboard **quatre fois** (ventilation des dépenses, des projets, exclusion des
  brouillons, routage Alpine/Nissan). Et ne jamais en ajouter une **seconde** à
  côté : `splitShareToBuckets` a REMPLACÉ `routeShareToBucket`, elle ne s'est pas
  posée en plus. Deux propriétés à préserver si tu y touches :
  - elle rend **toujours au moins une destination** — une part non éligible reste
    sur son site au lieu de disparaître (c'est ce qui récupère les 2 870 € perdus) ;
  - **les ratios somment toujours à 1**, donc la conservation des montants est
    garantie par construction et non par la vigilance de l'appelant.
- **Holding = un TAG MARQUE** (`BrandType`), anciennement nommé `Groupe`, renommé
  le 30 juillet 2026. Deux règles indissociables :
  1. **Tag exclusif** : quand Holding est posé, aucune autre marque ne peut
     l'être — et poser une autre marque retire Holding.
  2. **Jamais dans aucun budget** : un projet ou une dépense taggué Holding est
     **tracké** (il reste dans les listes, l'Agenda, l'Export, le compteur
     « projets actifs ») mais n'est imputé à **aucun** budget, **quels que soient
     les sites sélectionnés**. Test unique : `isHoldingBrand()` dans
     `constants.ts`, appliqué aux 4 blocs d'agrégation (projets et dépenses
     fixes, dans `Budget.tsx` et `Dashboard.tsx`).
  ⚠️ **Ne pas confondre avec le périmètre `GROUPE BONY`**, qui est une valeur de
  *site* et déclenche une ventilation pondérée légitime sur les concessions
  (`DISTRIBUTION_GROUPE_BONY` / `_RN` dans `constants.ts`). Le tag marque et le
  périmètre sont deux notions distinctes ; les confondre est exactement ce qui a
  laissé ce bug en place des mois.
- **Statut `Draft` (brouillon) : ne remonte NULLE PART.** Ni budget, ni Dashboard
  (consommé, trajectoire, mix, campagnes live), ni Agenda, ni Campagnes, ni
  Export. Seul `Budget.tsx` l'excluait ; corrigé le 30 juillet 2026. Restent
  volontairement inclus, car c'est un choix explicite pour préparer un projet :
  la **To-do** et les **prochains événements de Hello Marketing**.
  À ne pas confondre avec `Archived`, qui reste compté dans le budget
  (l'archivage est un classement visuel, pas une annulation comptable).
- Director = mêmes droits qu'Administrator, sauf Jeux.
- Jeux accessible uniquement à Master, Administrator, Coordinator, Digital
  Manager.

## ⚠️ Rôles CLOISONNÉS — à vérifier à CHAQUE nouvelle feature

Depuis le 5 août 2026, Gearbox a un rôle dont les droits dépendent d'une **donnée du
compte** et non seulement de son nom : **`Site Manager` (chef de site)**. Il est
rattaché à une ou plusieurs concessions (`User.sites`), ne voit **que** les données de
ses sites, et est en **lecture seule** partout.

**Deux questions à se poser pour toute nouvelle rubrique, tout nouveau bloc et toute
nouvelle route :**

1. **Est-ce visible par un chef de site ?** Ses rubriques sont une liste **fermée** :
   Dashboard, Projets, Digital (onglet Planning uniquement), Hello Marketing, Budget,
   Agenda. Tout le reste lui est refusé — côté navigation **et** côté routage
   (`App.tsx`) **et** côté API.
2. **Les données sont-elles filtrées par son périmètre, CÔTÉ SERVEUR ?** Un filtrage
   frontend ne cloisonne rien : les autres concessions resteraient lisibles dans
   l'onglet Réseau du navigateur.

**La seule porte : `backend/src/auth/siteScope.ts`.** Toute route qui renvoie des
données rattachées à un site doit passer par `scopeOf()` / `budgetScopeOf()` et les
helpers de clause associés. **Ne jamais recopier un `where` de site dans une route** —
c'est le même principe que `constants.ts` pour le routage budgétaire et `publicUser`
pour `passwordHash`.

**Les autres portes uniques du backend, à connaître avant d'écrire une route :**
`utils/publicUser.ts` (jamais l'objet Prisma brut d'un `User`), `utils/gameView.ts`
(jamais une partie non redactée), `db.ts` (une seule instance de `PrismaClient`), et les
deux listes blanches d'écriture — `TASK_FIELDS` dans `routes/projects.ts` et, depuis le
10/09/2026, **`SOCIAL_FIELDS` dans `routes/social.ts`**. ⚠️ Ces listes jettent **en
silence** tout champ qui n'y figure pas : la valeur part, le serveur répond 200, elle a
disparu au rechargement, et il n'y a d'erreur ni côté client ni dans les logs. Une colonne
ajoutée au schéma s'ajoute à la liste **dans le même lot**. Corollaire découvert au
correctif 50 : **enrichir la réponse d'une route dont l'écriture n'a pas de liste blanche
est un piège à retardement** — le client renvoie l'objet entier, champ dérivé compris, et
Prisma refuse l'argument inconnu.

⚠️ **Filtrer les lignes ne suffit pas : il faut aussi redacter leur CONTENU.** Un
projet multi-sites qui inclut sa concession passe légitimement le filtre, mais son
`sites[]` et son `budgetDistribution` nommeraient toutes les autres avec leurs
montants. `redactSiteFields()` est là pour ça.

⚠️ **Un rôle en lecture seule l'est par ABSENCE** : il ne figure dans aucun
`EDIT_ROLES`. Ne l'y ajoutez jamais « pour faire propre ». En revanche, toute route
d'écriture **sans** `requireRole` est une porte ouverte — c'était le cas d'`/api/uploads`.

⚠️ **Attention aux données FABRIQUÉES côté client.** `Budget.tsx` recréait les buckets
Alpine et Nissan quoi que renvoie l'API, annulant le cloisonnement. Une page qui
complète les données du serveur doit se demander si elle a le droit de le faire.

**Et surtout : un rôle ne se vérifie pas sans parcourir son interface.** Des contrôles
d'API exacts ont laissé passer deux fois une navigation complète visible à un rôle
restreint. Tester avec un vrai compte, dans le navigateur.

## Interface v2 (Gearbox OS) — portes uniques côté front

En bêta en production depuis le correctif 59. Avant de toucher `ui2/`, lis `ui2/apps/PORTAGE.md`.
Mêmes principes que `constants.ts` : **une seule porte, jamais de copie locale.**
- Montants et règles : `services/dashboardStats.ts`, `services/budgetStats.ts`, `services/exportXlsx.ts`,
  `utils/projet.ts`, `constants.ts` — partagés avec l'ancienne interface (un changement touche les deux).
- Données : `ui2/store/workspace.ts` et `ui2/store/collections.ts`, chargées par rôle dans `ui2/os/DataHub.tsx`.
- Droits dans la coque : `GX.shell.canOpen` / `GX.shell.canAction` (lisent `computeNav` et les listes de
  `constants.ts`) ; une commande vers une rubrique passe par `GX.shell.openWith`.
- Balayage au pavé : `bindSwipeWheel` / `GX.gesture.register` (porte `ui2/os/engine/gesture.ts`).
- Tout enfant d'`OsHost.tsx` est figé (`React.memo`) — sinon chaque changement de fenêtre re-rend tout.

## Historique de contexte (pour comprendre le pourquoi, pas pour agir dessus)

Le fil "Déploiement VPS et configuration serveur" avec Bastien contient l'historique
des décisions de déploiement (deploy key, Docker, correctifs post-déploiement). En
cas de doute sur une décision passée, la réponse la plus fiable est dans le code et
dans `ETAT-PROJET.md`/`ETAT-BACKEND.md`, pas dans ta mémoire de la conversation.

## ECU (réseau graphify des projets Bony)

gearbox est branché sur **ECU**, le graphe global des projets Bony (dépôt
`C:\Users\Operateur\Documents\ECU`, mode d'emploi : `ECU\NOUVEAU-PROJET-BONY.md`).
- **Pour travailler sur gearbox, interroge l'index LOCAL** (`graphify-out/`, section
  suivante) : le hook `post-commit` le reconstruit à chaque commit, gratuitement. Le
  graphe global (`graphify query … --graph ~/.graphify/global-graph.json`) sert aux
  questions qui traversent plusieurs projets.
- Les nœuds tirés des **documents** (`.md`, PDF) ne se rafraîchissent que par une
  passe `/graphify .`, qui coûte des tokens (~20 000 par fichier) : le graphe peut
  ignorer les derniers correctifs. Il ne remplace pas la lecture de l'en-tête
  d'`ETAT-PROJET.md`. Ne lance jamais cette passe sans annoncer le coût à Théo.
- **Après un push de gearbox : RIEN côté ECU.** Aucun commit dans le dépôt ECU
  depuis une session gearbox (~5 Mo par commit, tout se régénère). Seule exception,
  après une passe documents : `ECU.ps1 -Rafraichir` puis commit de
  `global-graph.json`, seule sauvegarde des nœuds payés en tokens.
- Au démarrage de session, vérifie le branchement : `graphify-out/graph.json`
  daté du dernier commit, hook `post-commit` présent avec un interpréteur épinglé
  qui existe, `graphify global list` qui liste `gearbox`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
