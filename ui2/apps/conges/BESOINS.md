# Besoins partagés — Congés (`conges`)

1. **Intégration** (hors de ce dossier) : ajouter `'conges'` à `PORTED_IDS` (`ui2/apps/ids.ts`) et
   `conges: CongesApp` à `PORTED_APPS` (`ui2/apps/registry.tsx`).
2. **Visibilité de l'icône** dans la coque (lanceur, Dock, Spotlight) : elle doit suivre
   `useCongesAcces().visible` (membres du périmètre + gestionnaires), comme `Sidebar.tsx` / `App.tsx:96`.
   La rubrique se protège elle-même (écran « Accès restreint » sans aucun appel réseau pour les rôles
   hors `CONGES_LECTURE_ROLES`, écran « Vous ne faites pas partie du planning » pour un non-membre),
   mais l'icône ne devrait pas apparaître. Elle resynchronise `congesAccesStore.set(...)` après chaque
   lecture, comme la page actuelle.
3. **Primitive `Tabs`** (kit) : onglets `.tabs` + trait `.ink`, pendant de `Seg`, logique React (sans quoi la
   délégation globale du moteur et React se disputent `aria-selected`). Signature proposée :
   `Tabs<T extends string>({ value, options: [T, ReactNode][], onChange, className })`.
   Bouchon local : `ui2/apps/conges/common.tsx` (`// BESOIN:`), à déplacer dans `ui/kit.tsx`.
4. **Écriture « Poser une période » avec demi-journée** : non demandé ici (la page actuelle n'en envoie
   pas) ; `setCongePeriode` l'accepte déjà si on veut l'ouvrir plus tard.
