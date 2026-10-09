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

## 2. Proposition, en trois lots

### Lot W1 — Réparer et enrichir le contenu (`web` seul, aucune migration)
1. **Absents** : vraie semaine du lundi au dimanche, avec le motif et les dates, et l'avatar barré pour ceux qui
   sont déjà revenus.
2. **Mes tâches** : tâches de projets **et** tâches autonomes de la To-do, triées par échéance, avec le retard en
   rouge. Prévu pour accepter plusieurs assignés (lot suivant du §3) sans réécriture.
3. **Prochaines échéances** : projets **et** tâches à échéance (option du widget : « projets », « tâches » ou « les deux »).
4. **Agenda de la semaine** : bande de 7 jours avec projets, publications et absents (pastilles par type).
5. **Météo, Anniversaires** : état « chargement » ou « aucune date » au lieu d'un widget vide.
6. **Campagnes** : moyennes calculées sur les seuls taux renseignés.
7. **Matériel** : tri par disponibilité, l'épuisé en premier en rouge, option « seulement ce qui est réservé aujourd'hui ».
8. **Musique du jour et Actu auto** : branchées sur `ui2/apps/hello/sources.ts`, la même porte que Hello Marketing
   (une seule source, pas de copie). Sinon retirées de la galerie (décision D1).
9. **Indicateur** : nouveaux choix (publications de la semaine, tâches en retard, réponses Forms du jour, absents
   aujourd'hui).
10. **Garde générale** : un widget qui plante affiche « Indisponible » au lieu d'un cadre vide, et l'erreur part en
    console. Aujourd'hui elle est avalée en silence.

### Lot W2 — Agir depuis le widget (`web`, routes d'écriture EXISTANTES, aucune migration)
1. **Mes tâches : vraie case à cocher.** Elle passe la tâche à « Terminé » par la route normale (`TASK_FIELDS` pour
   une tâche de projet, la route des tâches autonomes sinon), avec une annulation possible 5 s (« Annuler »).
   Masquée pour un rôle en lecture seule.
2. **Ouvrir au bon endroit** : une publication s'ouvre sur elle-même dans le Digital, un absent sur la bonne semaine
   des Congés, un objet de matériel sur sa fiche (réservation pré-remplie si le rôle le permet), une tâche sur son
   projet, onglet des tâches.
3. **Défis en attente** : accepter ou refuser depuis le widget (mêmes appels que la rubrique Jeux).
4. **Nouveau widget « Ma journée »** : post-it du jour, tâches dues aujourd'hui, publications du jour, réunions. On peut
   cocher et ajouter un post-it en une ligne (route `/api/postits` existante, `POSTIT_FIELDS`).
5. **Nouveau widget « Forms »** : réponses reçues (aujourd'hui / 7 jours) par formulaire, clic pour ouvrir les réponses.
   Sous réserve du rôle (Forms est réservé à l'équipe marketing).
6. **Note rapide** : décision D2.

### Lot W3 — Bureau retrouvé sur tous les postes (`api` + `web`, **migration additive**)
- Disposition des widgets (bureau et téléphone) et réglages par widget enregistrés **sur le serveur, par
  utilisateur** : colonne JSON sur `User` ou petite table. Une route avec liste blanche, à ajouter **dans le même
  lot**, sinon le piège de la valeur jetée en silence.
- Reprise : au premier chargement, la disposition locale existante est envoyée au serveur. Personne ne perd son bureau.
- Hotspot 4G obligatoire (migration Supabase). Décision D3.

---

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
- **D2 — Note rapide** : la garder locale au navigateur, ou en faire un **post-it** (enregistré sur le serveur,
  retrouvé partout, visible dans la To-do) ? Recommandé : post-it.
- **D3 — Lot W3** (bureau enregistré sur le serveur, avec migration) : on le fait maintenant, ou plus tard ?
- **D4 — Nouveaux widgets** : « Ma journée » et « Forms », d'accord ? D'autres idées ?
- **D5 — Horloge** : la garder ? Elle fait doublon avec l'heure de la barre du haut.

## 6. Suite du §3 après les widgets (rappel, ordre validé)
Tâches multi-assignées → prestataire sur les dépenses → répartitions personnalisées (question ouverte : une
répartition déjà utilisée reste-t-elle modifiable ?) → fichiers maison (sauvegarde du volume à régler AVANT) →
mIAouss P2 puis P3. Et le **lot sécurité serveur (§2) avant la bascule**, dans une semaine.
