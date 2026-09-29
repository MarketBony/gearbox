# Inventaires fonctionnels — format commun

Un fichier par rubrique : c'est la **liste de contrôle de parité** du lot qui porte cette rubrique en interface v2.
Tiré du CODE (`pages/*.tsx`, `components/*`, `constants.ts`, `types.ts`), jamais de la maquette ni de la doc.
Chaque ligne se coche (`- [ ]`) au moment du portage. Citer la source (`fichier:ligne`) pour tout ce qui n'est pas évident.

## Sections (dans cet ordre, « aucun » si vide)

1. **Accès et rôles** — qui voit la rubrique (garde `App.tsx`, `Sidebar`, `constants.ts`), qui peut écrire
   (listes de rôles exactes), comportement lecture seule (chef de site, Guest), External, cloisonnement serveur
   concerné (route API + `siteScope`), ce que le client fabrique ou complète lui-même.
2. **Structure** — onglets / vues / sous-vues, avec leur état persistant (`useSessionState`, clé exacte, localStorage).
3. **Filtres et sélecteurs** — pour chacun : libellé exact, simple ou MULTIPLE, options exactes (ou leur source :
   constante, liste API), valeur par défaut, persistance, règle d'application (sur quel champ, quelle comparaison).
4. **Affichage** — colonnes / cartes / blocs : champ affiché, format (dates, €, %), tri par défaut et tris proposés,
   regroupements, couleurs porteuses de sens (statut, marque, service), compteurs, KPI et leur formule (fonction
   de `constants.ts` utilisée).
5. **Formulaires** — champ par champ : libellé, type, obligatoire, valeurs possibles, défaut, validation,
   dépendances entre champs (ex. curseur `alpineShare` visible si Alpine + RDM), liste blanche serveur concernée.
6. **Actions** — créer, éditer, dupliquer, supprimer (confirmation ?), archiver, exporter, glisser-déposer,
   raccourcis, actions en masse ; effet de bord notable (ex. recalcul `progress`/`budgetActual`).
7. **Temps réel et chargement** — événements `RT_EVENTS` écoutés, rechargements, états de chargement.
8. **États vides et erreurs** — textes exacts, cas 403 / erreur réseau.
9. **Règles métier touchées** — Brouillon, Holding, Alpine par site / Nissan global, curseurs de répartition,
   GROUPE BONY… et la fonction de `constants.ts` qui les applique (à réutiliser telle quelle en v2).
10. **Mobile** — ce qui change sous `md:`.
11. **Défauts et bizarreries relevés** — écarts avec les règles, code mort, renvois aux fiches du 29/09 de
    `BUGS-CONNUS.md`. Signaler, ne rien corriger.
