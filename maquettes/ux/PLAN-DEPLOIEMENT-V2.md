# Plan de déploiement — « Gearbox OS » (interface v2)

Décidé avec Théo le 29/09/2026. Référence pour toutes les sessions du chantier.

## Décisions
- **Option retenue : reconstruire l'interface DANS l'appli React actuelle**, rubrique par rubrique.
  La maquette `maquettes/v2/` est le **modèle visuel et fonctionnel validé**, pas du code à copier
  (sa logique métier est simplifiée — `routeItem` de `js/data.js` — et ses données sont fictives).
- **Rien ne change sous l'interface** : `services/dataService.ts`, temps réel (`services/realtime.ts`),
  `contexts/AuthContext.tsx`, règles métier de `constants.ts` (`resolveBudgetLine`, `splitShareToBuckets`,
  `isHoldingBrand`, `resolveSiteAlias`…) et tout le backend. **Aucune seconde logique métier.**
- **Interrupteur « Nouvelle interface (bêta) » dans les Réglages (Paramètres)**, disponible pour
  **TOUS les utilisateurs** pendant le chantier (chacun choisit ; l'ancienne interface reste celle par défaut
  tant que la bascule finale n'est pas faite). Les rubriques pas encore portées s'ouvrent dans leur version
  actuelle à l'intérieur de la nouvelle coque (ou via un repli clair vers l'ancienne interface).
- Le nouveau code a **sa propre feuille de style** (jetons de `maquettes/v2/css/*`, sans Tailwind) : aucun
  conflit avec les contraintes du Tailwind CDN Play.

- **⚠️ Révisé le 29/09 (lot 1) : la COQUE n'est pas reconstruite en React.** Les premières réécritures étaient
  lentes et infidèles. La coque (bureau, fenêtres, Dock, barre du haut, widgets, fonds, Centre de contrôle,
  coque mobile) est le **moteur de la maquette converti tel quel en TypeScript** (`ui2/os/engine/`), dans une
  racine fantôme, branché sur les vraies données et les vrais droits (`ui2/os/bridge.ts`, `ui2/os/data.ts`).
  Seules les **rubriques** sont réécrites en React (lots 2 → 16), avec le balisage et la CSS de la maquette.
  La règle « aucune seconde logique métier » tient : la logique simplifiée de `js/data.js` n'est pas reprise.

- **⚠️ 29/09 (lot 2) : rubriques en React (décision Théo)**, rendues par portail dans la fenêtre du moteur, balisage
  et CSS de la maquette, données par `ui2/store/workspace.ts` (Zustand). Modèle : `ui2/apps/todo/TodoApp.tsx`.

## État au 01/10/2026 — BÊTA OUVERTE À TOUS, EN PRODUCTION (correctif 59, déployé le 30/09)
- **Faits** : lot 0, lot 1 (coque), lots 2 à 4 (les **16 rubriques portées en React**, regroupées en 4 lots au lieu
  de 15), navigation gestuelle (balayage 2 doigts entre fenêtres), audit des droits des 16 rubriques corrigé,
  bascule `UI2_BETA_ROLES = null` (tous les rôles). Détail : `ETAT-PROJET.md` (chantier, puis correctif 59).
- **Toujours vrai** : l'ancienne interface reste celle PAR DÉFAUT ; chacun bascule dans Paramètres › Application.
- **Prochaine étape = retours de la bêta** (groupe du Chat créé par Théo), puis **bascule** (v2 par défaut) quand :
  rôles restreints vus en vrai (chef de site, External, Guest), mobile testé (Théo), retours bloquants traités,
  arbitrages de `BUGS-CONNUS.md` (30/09) tranchés. Puis cohabitation ~2 semaines et **lot de nettoyage** (retrait
  des `pages/*` et des copies temporaires `ui2/apps/hello/sources.ts`, `games/logic.ts`, `chat/voice.ts`).
- Écart au plan : pas de migration `User.uiPrefs` (préférences de coque en localStorage, par compte et par poste).

## Lots (chacun : branche dédiée → test localhost avec les vrais rôles → 🛑 recette Théo → .md → déploiement `web`)
- **Lot 0 — préparation (aucun déploiement)** : interrupteur bêta (préférence utilisateur, localStorage
  d'abord), dossier du nouveau code (ex. `ui2/`), point d'entrée dans `App.tsx`, feuille de jetons,
  et **inventaires fonctionnels des 16 rubriques écrits en fichiers** (`maquettes/ux/inventaires/<rubrique>.md`,
  à partir des `pages/*.tsx` : champs, filtres et options exactes, colonnes, tris, actions, états vides, rôles) —
  ils servent de liste de contrôle de parité à chaque lot.
- **Lot 1 — socle** : coque (fenêtres, Dock, barre du haut escamotable, centre de contrôle, notifications
  branchées sur le vrai journal d'activité), widgets sur vraies données, fonds WebGL (+ mode économe automatique
  si la machine peine), coque mobile, contrôles chartés (calendrier, sélecteurs, plaques repliables), matières
  Pixel / Liquid Glass / Opaque, réglages de coque. Optionnel : migration additive `User.uiPrefs Json?`
  (+ route) pour retrouver sa disposition d'un poste à l'autre — sinon localStorage (migration = hotspot 4G,
  `db execute` puis `migrate resolve --applied`).
- **Lots 2 → 16 — une rubrique par lot** : Dashboard · Projets (+ Archives + mode Expert) · To-do · Digital ·
  Budget · Dépenses · Agenda · Campagnes · Hello Marketing · Congés · Matériel · Chat · Export · Jeux ·
  Réglages (compte, utilisateurs). Test avec Master, Chef de site, Invité, Externe.
- **Lot final** : bascule (v2 par défaut), cohabitation ~2 semaines, puis lot de nettoyage (retrait ancienne UI).

## Points d'attention
- Perf des PC du bureau (cf. audit perf lot 2) : pas de backdrop-filter sur les petits contrôles, passes WebGL
  basse résolution, mode économe automatique, fonds fixes proposés par défaut sur les postes faibles.
- Cloisonnement des rôles : reste CÔTÉ SERVEUR (`siteScope.ts`), rien ne change ; un filtrage frontend ne
  cloisonne rien. Vérifier chaque rubrique en naviguant avec le vrai rôle.
- Défauts du vrai Gearbox relevés à l'inventaire (fin de `BUGS-CONNUS.md`, 29/09) : à trancher un par un
  (corriger ou reproduire), jamais en silence.

## Estimation (tokens, toutes lectures comprises, cache inclus)
Lot 0 : 0,3–0,5 M · Lot 1 : 2–3 M · Lots 2–16 : 9–18 M · bascule + nettoyage : 0,5–1 M · marge recette +20 %
→ **≈ 15 à 27 M, probable ≈ 18 M** ; 12 à 18 séances ; 4 à 6 semaines calendaires (rythmées par la recette).
