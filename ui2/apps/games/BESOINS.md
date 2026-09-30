# Besoins partagés — Jeux (`games`)

1. **Intégration** (hors de ce dossier) : ajouter `'games'` à `PORTED_IDS` (`ui2/apps/ids.ts`) et
   `games: GamesApp` à `PORTED_APPS` (`ui2/apps/registry.tsx`). L'accès reste `canSeeGames(rôle,
   gamesEnabled)` (`GX.shell.canOpen('games')` suit la même règle via `computeNav`).
2. **Exporter les calculs privés.** `computeStats`, `computeRivalries`, `computeStreak`
   (`pages/Games.tsx`) et `FLEET`, `cellsFor`, `canPlace`, `randomFleet` (`components/games/Battleship.tsx`)
   ne sont pas exportés : copiés à l'identique dans `ui2/apps/games/logic.ts`. Proposition : les déplacer
   dans `components/games/gameLogic.ts` (exporté), importé par la page, le composant et la rubrique.
   Aucune règle de jeu côté client (coups, victoire, tirs, validation de flotte : serveur).
3. **Lobby partagé.** `DataHub` charge déjà `db.getGamesLobby()` (badge et `GX.data.GAMES`) et la
   rubrique le charge aussi, comme la page actuelle : deux requêtes par événement `game:*`. Proposition :
   ressource `gamesLobby` dans `ui2/store/collections.ts` (`RT_EVENTS.games`, `useWhen(canSeeGames…)`),
   plus la mise à jour directe par la charge de `game:session:updated`.
4. **Commande `play:<jeu>:<userId>`** (notifications du moteur) : la rubrique attend les identifiants
   SERVEUR (`morpion`, `connect4`, `battleship`), pas ceux de la maquette (`p4`, `naval`).
5. **Présence** : « · en ligne » lu dans `GX.data.USERS[].online` (rempli par DataHub). Pas de source
   de présence dans `ui2/store`.
