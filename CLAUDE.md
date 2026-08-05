# CLAUDE.md — méthodologie de travail sur GEARBOX

Ce fichier décrit **comment on travaille sur ce projet**, pas l'état du code. Pour
l'état du code, lis d'abord :
- `ETAT-PROJET.md` — mémoire de référence globale (déploiement, historique des
  correctifs, backlog en cours)
- `ETAT-BACKEND.md` — état détaillé du backend/API
- `BUGS-CONNUS.md` — bugs identifiés, corrigés ou non
- `DEPLOIEMENT.md` — mode d'emploi technique du VPS (référence, pas à dupliquer ici)

Ne duplique jamais leur contenu ici : ce fichier ne parle que de méthode.

## Qui fait quoi

Théo cadre le besoin avec Claude (Anthropic, Cowork) en amont. Le prompt qui en
sort t'arrive déjà cadré — ce n'est pas à toi de re-négocier le besoin métier, mais
tu dois challenger si quelque chose ne colle pas avec le code réel ou les règles
métier ci-dessous.

## Pipeline standard, du prompt au code en ligne

1. **Modifs locales** dans ce dossier (`gearbox3backup`), sur une branche dédiée
   nommée `fix/...`, `feat/...` ou `chore/...` selon la nature du changement
   (convention déjà en place, voir `git log`).
2. **Vérification locale avant tout commit** :
   - frontend : `npm run dev` (Vite, port 3000)
   - backend : `cd backend && npm run dev` (nodemon)
   - Utilise le PowerShell embarqué pour lancer ces serveurs et vérifier
     concrètement (pas juste `tsc --noEmit`, un vrai test dans le navigateur/via
     `curl` quand c'est pertinent).
   - Si le changement touche le schéma Prisma : migration en local d'abord
     (`npx prisma migrate dev`), jamais direct en prod.
3. **Si les tests locaux sont OK** :
   - **RÈGLE D'OR — mettre à jour les `.md` de suivi AVANT de pousser.**
     `ETAT-PROJET.md` (SHA courant, historique des correctifs, backlog),
     `ETAT-BACKEND.md` si le backend bouge, `BUGS-CONNUS.md` (cocher ce qui est
     corrigé, ajouter ce qui a été découvert), `DEPLOIEMENT.md` si la procédure
     change. La doc fait partie du lot déployé — **jamais** « je documenterai
     après », c'est trop tard : un déploiement non documenté fait repartir la
     session suivante sur de fausses bases.
   - commit, merge sur `master` en local,
   - **STOP avant le push** : montre à Théo le diff / le résumé du commit et
     attends son OK explicite. Ne lance `git push` qu'après confirmation — ne
     jamais pousser sur GitHub sans validation, même si les tests locaux sont
     verts.
4. **Déploiement VPS — autonome, via SSH direct.** Tu as un accès SSH complet au
   VPS (clé `~/.ssh/id_ed25519` sur ce poste, `ssh ubuntu@51.83.75.181` ou
   l'alias `gearbox-vps` si configuré — voir `ACCES-INFRA-SECRET.md`, hors
   dépôt git, pour le détail des accès). Accès complet décidé explicitement par
   Théo, différent de la deploy key GitHub lecture seule installée sur le VPS.
   Concrètement :
   - une fois le push GitHub validé et fait, connecte-toi (`ssh gearbox-vps`
     ou `ssh ubuntu@51.83.75.181`) et lance
     `cd ~/gearbox && git pull && sudo docker compose up -d --build <service>`,
     en ciblant `api` ou `web` seul plutôt qu'un rebuild complet quand c'est
     possible,
   - si une migration Prisma est nécessaire, applique-la (`prisma migrate
     deploy` tourne de toute façon au démarrage du conteneur `api`, mais
     vérifie l'ordre si la migration doit précéder un autre changement),
   - **vérifie systématiquement après coup** : `sudo docker compose ps` (3
     conteneurs Up) et un `curl` sur le domaine public (200) avant de
     considérer le déploiement terminé,
   - **rends compte à Théo de ce que tu as exécuté et du résultat** — l'accès
     est autonome, le compte-rendu ne l'est pas : il doit toujours savoir ce
     qui a tourné sur la prod, même a posteriori.
   - Si `ssh gearbox-vps` échoue : c'est très probablement le réseau bureau
     (port 22 bloqué), pas un problème de droits — dis-le explicitement, ne
     réessaie pas en boucle, demande à Théo de basculer sur le hotspot 4G.
5. **Supabase** : toute migration de schéma nécessite d'être sur le réseau qui
   sort vers les ports 5432/6543 (voir contrainte réseau ci-dessous) — signale-le
   explicitement si le prompt implique un changement de schéma.

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

## Historique de contexte (pour comprendre le pourquoi, pas pour agir dessus)

Le fil "Déploiement VPS et configuration serveur" avec Bastien contient l'historique
des décisions de déploiement (deploy key, Docker, correctifs post-déploiement). En
cas de doute sur une décision passée, la réponse la plus fiable est dans le code et
dans `ETAT-PROJET.md`/`ETAT-BACKEND.md`, pas dans ta mémoire de la conversation.
