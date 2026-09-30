# Réglages (v2) — besoins partagés à traiter à l'intégration

0. **Intégration** (hors de ce dossier) : ajouter `'settings'` à `PORTED_IDS` (`ui2/apps/ids.ts`) et
   `settings: SettingsApp` à `PORTED_APPS` (`ui2/apps/registry.tsx`). La rubrique lit `win.params.tab`
   (section d'ouverture) et répond aux commandes `tab:<section>` et `add-user`.

## 1. Écritures des comptes dans `ui2/store/workspace.ts`

**Quoi.** `createUser`, `updateUser`, `deleteUser`, `setUserAvatar` (et/ou un `reloadUsers` exporté).
Le serveur n'envoie pas `users:*` à l'onglet qui écrit : sans elles, la liste `useWorkspace(s => s.users)`
ne bougerait qu'au prochain événement d'un AUTRE poste.

**Signature proposée.**
`export async function saveUser(u: User | Omit<User,'id'>, isNew: boolean): Promise<User>`,
`export async function removeUser(id: string): Promise<void>`,
`export async function setUserAvatar(id: string, url: string | null): Promise<User>` — chacune applique la
réponse du serveur à `users`, puis `echo('users:updated' | 'users:deleted', …)`.

**Bouchon.** `UsersPanel.tsx`, `putUser` / `dropUser` / `setOtherAvatar` (marqués `BESOIN:`) : appellent
`db.createUser/updateUser/deleteUser/setUserAvatar` (mêmes fonctions que pages/Settings.tsx), puis
`workspace.setState` avec la RÉPONSE du serveur et `echo(...)`. Aucune valeur fabriquée côté client.

**Manque associé.** `reloadUsers` avale les erreurs : le message « Impossible de charger les
utilisateurs. » (ou le message `ApiError`) de la page actuelle ne peut pas s'afficher. Proposition : un
champ `usersError: string | null` dans `WorkspaceState`.

## 2. Ressource `storage` dans `ui2/store/collections.ts`

**Quoi.** `GET /api/storage` (`db.getStorage()`), lecture ouverte à tous. Pas d'événement temps réel.
**Signature.** `export const storage = defineResource<StorageInfo | null>('storage', () => db.getStorage(), [], null)`
+ `useStorage()`. ⚠️ `defineResource` avale l'erreur (valeur `empty`) : il faut pouvoir distinguer
« injoignable » (message « Impossible de lire l'espace disque (serveur injoignable ?). ») de « chargé ».
**Bouchon.** `AppPanels.tsx` `StoragePanel` : `db.getStorage()` au montage (seule lecture directe).

## 3. Listes de rôles dans `constants.ts`

`DIRECTOR_ASSIGNABLE`, `canManageUsers`, `canDeleteUsers` sont recopiés en dur dans pages/Settings.tsx et
ici (`common.tsx`, marqués `BESOIN:`) — risque de divergence avec `backend/src/auth/roles.ts`
(`DIRECTOR_ASSIGNABLE_ROLES`, `ADMIN_ROLES`, `USER_DELETE_ROLES`). Proposition : `USER_ADMIN_ROLES`,
`USER_DELETE_ROLES`, `DIRECTOR_ASSIGNABLE_ROLES` + `canManageUsers(role)` / `canDeleteUsers(role)` dans
`constants.ts`, utilisés par la page ET la v2.

## 4. Journal d'activité

Déjà exporté (`logActivity(entity, action, name, id?)`) : utilisé tel quel (« a créé / modifié / supprimé
l'utilisateur », entité `user`, sans `entityId` comme la page).

## 5. Moteur : `GX.widgets.reset()`

« Réinitialiser les widgets » : bouchon = geste de la maquette (`GX.store.del('widgets')` puis
`GX.emit('ctx')`, qui fait relire la disposition au moteur). Émettre `ctx` redessine aussi les autres
rubriques ouvertes ; une méthode `reset()` dans `engine/widgets.ts` (même code que le bouton
« Disposition par défaut » de la galerie) serait plus propre.

## 6. Notifications : interrupteurs fictifs de la maquette NON portés

« Autoriser les notifications » et « Notifications par rubrique » (Chat, Projets, Digital, Agenda,
Congés, Jeux) sont un état en mémoire dans la maquette : le moteur (`GX.shell.notify`) ne les lit pas.
Les porter aurait affiché des interrupteurs sans effet. Si on les veut : préférences `notifs` et
`notifPerApp` dans `GX.shell.prefs`, lues par `S.notify` (engine/shell.ts).
