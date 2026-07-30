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
- Alpine disponible uniquement sur `ALPINE_SITES` (Clermont, Vichy, Le
  Puy-en-Velay, Rodez) — conservé par site à la demande explicite de Théo, même
  si ça diffère de Nissan.
- Nissan disponible sur `NISSAN_SITES` (liste plus large, bucket global non
  ventilé par site — asymétrie connue avec Alpine, pas un bug).
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
- Director = mêmes droits qu'Administrator, sauf Jeux.
- Jeux accessible uniquement à Master, Administrator, Coordinator, Digital
  Manager.

## Historique de contexte (pour comprendre le pourquoi, pas pour agir dessus)

Le fil "Déploiement VPS et configuration serveur" avec Bastien contient l'historique
des décisions de déploiement (deploy key, Docker, correctifs post-déploiement). En
cas de doute sur une décision passée, la réponse la plus fiable est dans le code et
dans `ETAT-PROJET.md`/`ETAT-BACKEND.md`, pas dans ta mémoire de la conversation.
