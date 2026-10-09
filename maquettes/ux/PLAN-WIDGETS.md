# Plan — refonte des widgets de la v2 (contenu + interaction)

Rédigé le 08/10/2026, **à valider par Théo avant toute ligne de code**. Premier chantier du §3 (liste d'octobre),
avant les tâches multi-assignées. Le look et la mise en page ne changent pas (cadrage de Théo : « contenu,
interaction »).

Code concerné : `ui2/os/engine/widgets.ts` (catalogue `CAT`, 25 widgets, bureau ET accueil du téléphone),
données posées par `ui2/os/DataHub.tsx` (`GX.data`). Les montants passent par les portes uniques
(`services/dashboardStats.ts`, `constants.ts`), jamais recalculés dans un widget.

---

## 1. Constat (audit du code, 08/10)

### Widgets cassés ou factices
| Widget | Problème |
|---|---|
| **Musique du jour**, **Actu auto** | Aucune donnée : `DataHub` pose `track: null, rss: {}`. Le rendu plante et l'erreur est avalée : **widget vide**, toujours proposé dans la galerie. Les sources existent pourtant (`ui2/apps/hello/sources.ts`, Deezer et RSS de Hello Marketing). |
| **Mes tâches** | La case à cocher est **factice** : elle se décoche et ouvre la To-do. Ne montre que les tâches de projets, ni les tâches autonomes de la To-do ni les post-it. |
| **Absents cette semaine** | Compte d'**aujourd'hui à J+6**, pas la semaine : un CP de lundi disparaît dès mardi. C'est le bug « 0 cette semaine » noté le 08/10. |
| **Météo** | Plante (widget vide) tant que la météo n'est pas chargée. |
| **Anniversaires** | Un collègue sans date de naissance donne un calcul `NaN` qui fausse le tri. |
| **Performance des campagnes** | Un taux vide compte pour 0 % dans la moyenne (bug connu, `BUGS-CONNUS.md`). |
| **Matériel disponible** | Affiche les N premiers objets dans l'ordre de la base, sans tri. Le matériel épuisé peut être masqué. |

### Contenu pauvre
- **Prochaines échéances** : fins de projets seulement, aucune échéance de tâche.
- **Agenda de la semaine** : projets seulement (ni publications, ni absents).
- **Indicateur (KPI)** : 5 choix seulement.
- **Dépenses du mois** : somme brute. À vérifier contre les règles Holding et brouillon de `budgetStats` avant d'y toucher.

### Persistance
- La **disposition du bureau et le texte des notes** sont stockés dans le `localStorage` du navigateur (`GX.store`).
  Ils sont perdus en changeant de PC ou de navigateur, et le bureau et le téléphone ont deux dispositions séparées.

### Interactions existantes
- Ouvrir un projet, une conversation ou une rubrique.
- Chat interactif : envoyer et réagir.
- Note : saisie locale.
- mIAouss : poser une question.
- **Rien d'autre** : la plupart des widgets sont en lecture seule et ne mènent pas au bon endroit (une publication
  ouvre le Digital en général, pas la publication).

---

## 2. Plan RÉVISÉ le 09/10/2026 après les décisions de Théo
Décisions : **D1** brancher Musique et Actu auto sur les sources de Hello Marketing · **D3** bureau enregistré sur le
serveur, dans ce chantier · **D4** « Ma journée » et « Forms » oui · **D5** Horloge gardée.
**Nouvelles demandes** : un widget **réplique de la To-do, très grand et ajustable**, et **plus de formats pour TOUS les widgets**.

### Lot W0 — Fondations (`web`)
1. **Formats libres.** Aujourd'hui chaque widget a une courte liste de tailles nommées (S, M, L…), et la poignée de
   redimensionnement saute de l'une à l'autre. Demain : n'importe quelle taille **en cases** entre un minimum et un
   maximum propres au widget (par exemple de 2×2 à 10×8), la poignée s'aimante case par case. Les anciennes tailles
   nommées restent lues (les bureaux existants ne bougent pas). Chaque widget adapte son contenu à sa taille réelle
   (plus de lignes, plus de colonnes, plus de détails), au lieu de cas écrits taille par taille.
2. **Widgets en React** : un widget peut héberger un composant React par portail (comme les rubriques). C'est ce qui
   permet un widget To-do qui est **la même chose** que la rubrique, pas une copie dessinée à part.

### Lot W1 — Réparer et enrichir (`web`)
Comme prévu au § 1 : Absents (vraie semaine), Mes tâches (projets + tâches libres), échéances avec les tâches, agenda
de la semaine enrichi, Météo et Anniversaires robustes, Campagnes (taux vides), Matériel trié, Indicateur enrichi,
**Musique du jour et Actu auto branchées** sur `ui2/apps/hello/sources.ts`, « Indisponible » au lieu d'un cadre vide.

### Lot W2 — Agir depuis le bureau + nouveaux widgets (`web`)
1. **Widget To-do (très grand, ajustable)** : le tableau de la rubrique, extrait en composant commun (même principe que
   la conversation du Chat pour les bulles). Colonnes À faire / En cours / Programmé / Terminé, cartes avec urgence,
   déplacement entre colonnes, ouverture de la tâche ou du projet, filtres essentiels. De 6×4 à toute la largeur ;
   petit, il passe en liste.
2. **Ma journée** : post-it du jour, tâches dues aujourd'hui, publications du jour ; ajout d'un post-it en une ligne.
3. **Forms** : réponses reçues (aujourd'hui / 7 jours) par formulaire, clic vers les réponses (équipe marketing).
4. Vraie case à cocher dans « Mes tâches » (avec annulation 5 s), clics qui ouvrent au bon endroit, défis
   acceptés / refusés depuis le widget.

### Lot W3 — Bureau retrouvé sur tous les postes (`api` + `web`, migration additive, hotspot)
Disposition et réglages des widgets enregistrés sur le serveur par utilisateur, route à liste blanche dans le même
lot, reprise automatique de la disposition locale au premier chargement.

## 3. Règles à tenir (vérifiées widget par widget)
- **Brouillons** : exclus partout, sauf la To-do et les événements de Hello Marketing (règle de `CLAUDE.md`).
- **Holding** : tracké, jamais compté dans un montant.
- **Chef de site** : uniquement les widgets de ses rubriques et uniquement ses sites. Les données arrivent déjà
  filtrées par le serveur ; un widget ne doit **rien fabriquer** côté client.
- **Accès** : un widget n'est proposé et affiché que si sa rubrique est ouverte au rôle (`GX.shell.canOpen`). Une
  action ne s'affiche que si `GX.shell.canAction` l'autorise.
- **Écritures** : uniquement par les routes et listes blanches existantes (`TASK_FIELDS`, `POSTIT_FIELDS`…).

## 4. Méthode
1. **Planche d'abord** (`maquettes/ux/widgets.html`) avec les **vrais champs** (inventaire `types.ts` et de la
   rubrique avant de dessiner, cf. leçon « maquettes = champs réels ») : les widgets modifiés et les nouveaux, avec
   leurs actions. Théo valide.
2. Code lot par lot (W1, puis W2, puis W3), branche dédiée chacun.
3. Test sur localhost avec le compte de Théo : bureau et téléphone. Écritures sur une tâche et un post-it de test
   **clairement nommés**, supprimés ensuite (le backend local écrit en prod).
4. Recette de Théo, `.md` à jour, push, déploiement (`web` ; `api` aussi pour W3).

## 5. Décisions attendues de Théo
- **D1 — Musique du jour et Actu auto** : les brancher sur les sources de Hello Marketing (recommandé, ce sont les
  mêmes services), ou les retirer ?
- **D2 — Note rapide** (widget de la galerie : un bloc de texte libre posé sur le bureau, enregistré dans le
  navigateur) : en faire un post-it, ou la retirer au profit de « Ma journée » ? En attente.
- **D3 — Lot W3** (bureau enregistré sur le serveur, avec migration) : on le fait maintenant, ou plus tard ?
- **D4 — Nouveaux widgets** : « Ma journée » et « Forms », d'accord ? D'autres idées ?
- **D5 — Horloge** : la garder ? Elle fait doublon avec l'heure de la barre du haut.

## 6. Suite du §3 après les widgets (rappel, ordre validé)
Tâches multi-assignées → prestataire sur les dépenses → répartitions personnalisées (question ouverte : une
répartition déjà utilisée reste-t-elle modifiable ?) → fichiers maison (sauvegarde du volume à régler AVANT) →
mIAouss P2 puis P3. Et le **lot sécurité serveur (§2) avant la bascule**, dans une semaine.
