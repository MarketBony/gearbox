# Besoins partagés — Hello Marketing (`hello`)

1. **Intégration** (hors de ce dossier) : ajouter `'hello'` à `PORTED_IDS` (`ui2/apps/ids.ts`) et
   `hello: HelloApp` à `PORTED_APPS` (`ui2/apps/registry.tsx`). Aucune écriture, aucune donnée nouvelle
   dans `ui2/store` (projets et utilisateurs = `useWorkspace`).
2. **Exporter les chargeurs de flux de `pages/HelloMarketing.tsx`.** Seuls `useWeatherData` et
   `computeBirthdays` sont exportés ; `parseRss`, `getThumbnail`, le chargement d'un fil (liste des
   sources + articles, cache 24 h) et celui de la piste du jour (cache 24 h) sont privés. Ils sont
   recopiés à l'identique dans `ui2/apps/hello/sources.ts` (marqués `// BESOIN:`). Signature proposée,
   exportée par la page : `loadFeed(cat: 'auto' | 'marketing', force: boolean): Promise<{ sources: FeedInfo[]; articles: RssArticle[]; at: number }>`
   et `loadTrackOfDay(force?: boolean): Promise<DeezerTrack>` — la page et la rubrique les partageraient,
   et `sources.ts` disparaîtrait.
3. **Couleur des sources en hexadécimal.** `/api/feeds` (`backend/src/routes/feeds.ts`) renvoie une
   classe Tailwind (`bg-emerald-600`…) ; la maquette veut une couleur (`--c`). Table de correspondance
   locale `TW_HEX` dans `sources.ts` (les 9 classes utilisées aujourd'hui, repli gris `#475569`). Proposition :
   ajouter `hex` à `FeedInfo` côté serveur.
4. **Météo lue deux fois.** `DataHub` appelle déjà `useWeatherData(uid)` (widget Météo) et la rubrique
   l'appelle aussi (il faut `refresh`, `loading`, `error`, que `GX.data.HELLO` ne porte pas). Le cache
   localStorage de 30 min évite en pratique le second appel, mais deux montages simultanés peuvent
   partir en parallèle. Proposition : une ressource `weather` dans `ui2/store` (état + `refresh`).
5. **Clé OpenWeather dans le client** (défaut §11 de l'inventaire) : héritée via `useWeatherData`, non
   recopiée ici. À traiter par un proxy serveur, hors lot.
6. **Avatar depuis un `User`** : `Avatar` du kit lit `GX.data.user(uid)` (rempli par DataHub dans un
   effet, donc parfois en retard d'un rendu sur l'espace de travail). La rubrique rend donc `.av` elle-même
   (couleur + initiales, même balisage). Proposition : `Avatar` accepte un `user` en option.
