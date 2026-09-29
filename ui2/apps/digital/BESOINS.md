# Besoins partagés — rubrique Digital (lot 3)

Bouchons marqués `// BESOIN:` dans le code. À traiter à l'intégration (fichiers hors de ce dossier).

## 1. `updateSocialPost` doit passer par la file `fileSauvegardePublication` (store/collections.ts)

- **Quoi** : aujourd'hui `updateSocialPost` fait un `db.updateSocialPost` direct (un PUT par appel, sans ordre garanti).
  `pages/Digital.tsx` interdit ce chemin : tout passe par `fileSauvegardePublication.pousser` (UN seul PUT en vol par
  publication, coalescence), et la réponse serveur n'est réappliquée que si rien n'attend derrière.
- **Pourquoi** : deux champs modifiés à la suite (statut puis marques, ou un wording puis un dépôt de média) partent en
  deux PUT concurrents, chacun porteur de l'instantané complet ; si le premier arrive en second, il écrase le second.
  C'est la course fermée par le correctif 49. Le bouchon réduit le risque (sélecteurs multiples écrits à la fermeture ou
  après 800 ms, une seule écriture par geste) mais ne l'élimine pas.
- **Signature proposée** : inchangée, `updateSocialPost(p: SocialPost): Promise<SocialPost>`, implémentée comme
  `mutateProject` : optimiste → `fileSauvegardePublication.pousser(p, { onSucces, onEchec, onRepos })`, résolue par
  `onSucces` / `onRepos`, rejetée par `onEchec`. Pas de `reloadAll()` à chaque écriture réussie (une relecture complète
  de `/api/social` par champ modifié).
- **Messages** : reprendre `onEchecSauvegarde` de Digital.tsx (0 « Serveur injoignable. Vos modifications ne sont PAS
  perdues — ne fermez pas cet onglet. », 503, 403 « Droits insuffisants pour modifier cette publication. », 404
  « Cette publication n'existe plus (supprimée depuis un autre poste ?). »). Le message générique actuel les perd.

## 2. `socialPosts` doit aussi se recharger sur `RT_EVENTS.socialComments`

- **Pourquoi** : la pastille « commentaires » d'une ligne vient de `commentCount` (dérivé par `GET /api/social`).
  Digital.tsx recharge les publications sur `social-comment:*` ; la ressource `socialPosts` n'écoute que `RT_EVENTS.social`.
  Un commentaire posté par un collègue ne fait donc pas bouger la pastille. Pour mes propres commentaires, le bouchon
  appelle `socialPosts.reloadAll()` après l'envoi / la suppression.
- **Proposition** : `defineResource('socialPosts', …, [...RT_EVENTS.social, ...RT_EVENTS.socialComments], [])`.

## 3. Dépôt de fichier (`POST /api/uploads/calendar`) dans `ui2/store`

- **Quoi** : la modale Médias appelle `db.uploadFile('calendar', file)` directement (seul appel direct à dataService,
  une écriture, pas une lecture). Proposé : `uploadMedia(file: File): Promise<string>` dans `collections.ts`, avec le
  même message d'échec (« Échec de l'upload de "x". »).

## 4. Journal d'activité

- `db.logActivity` est appelé directement (« a créé / archivé / supprimé la publication »), comme `logActivity` privé de
  `workspace.ts`. Proposé : exporter un `logActivity(action, entity, { id, name })` partagé.
