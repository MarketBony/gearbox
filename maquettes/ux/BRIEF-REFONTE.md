# Brief — application du modèle UX validé à la maquette 2.0

Maquette : `C:\Users\Operateur\Documents\gearbox3backup\maquettes\v2` (vanilla HTML/JS/CSS, aucun build).
Contrat d'une rubrique : `maquettes/v2/APPS.md` (lis-le d'abord). Chaque rubrique = un fichier `js/apps/<id>.js`
qui appelle `GX.registerApp({ id, mount(body, win) → { destroy, command, menus } })`.

Vrai Gearbox (source de vérité fonctionnelle) : `C:\Users\Operateur\Documents\gearbox3backup\pages\*.tsx`,
`types.ts`, `constants.ts`, `components/`. **Avant de lire le code source du dépôt, lance `graphify query "<question>"`
depuis la racine du dépôt** (index `graphify-out/graph.json`, règle obligatoire), puis lis les fichiers utiles.

## Le modèle validé par Théo (à reproduire)
Maquettes validées (HTML lisible, markup + styles inline) : `maquettes/ux/project/`
- `Main.dc.html` Dashboard · `Projets.dc.html` Projets (liste + filtres complets + fiche pleine largeur + tâches)
- `Digital.dc.html` éditos COMPACTS 3 colonnes (contenu | réglages sur 2 lignes | médias/actions), ~120 px par édito
- `Todo.dc.html` · `Hello.dc.html` · `Budget.dc.html` + `BudgetProvisions.dc.html` · `Depenses.dc.html` (saisie en panneau latéral)

Principes : **aéré** (cartes padding 20–24 px, écarts 20–24 px), **contrasté** (texte principal presque blanc,
secondaire gris clair lisible), titres de section en Syncopate capitales (14 px, .08em), gros chiffres,
**dense là où la densité sert** (éditos Digital, tableaux), **pleine largeur** (jamais de grand vide à droite).
Dégradé Bony orange → violet pour les sélections / actions principales.

## Ce qui est DÉJÀ fourni (ne le refais pas, ne le restyle pas)
- En-tête : `.app-head` avec `.ah-t` (h1 + `.sub`), `.ah-tabs`, `.ah-f`. Le CSS partagé (js/controls.js) donne le look
  validé (catégorie orange au-dessus, titre Syncopate 24 px, sous-titre) et ajoute la catégorie tout seul.
- Panneau de filtres : `.app-head2`. Chaque groupe = `<div><span class="label">Libellé</span> contrôle</div>`
  (libellé au-dessus, rendu en carte automatiquement). Séparateur : un élément dont la classe finit par `-sep`.
- Sélecteurs partagés (js/pickers.js) : `GX.ui.pick`, `GX.ui.sitePicker`, `GX.ui.dateRange`, `GX.ui.chips`,
  `GX.ui.pickerBtn`, `GX.ui.summary`. **Aucun menu maison.**
- `<input type="date">`, `<select class="select">`, cases à cocher et curseurs : js/controls.js les remplace/dessine
  à la charte automatiquement (calendrier Gearbox, menu Gearbox). Utilise-les librement.
- Jetons : `var(--surface-0..4)`, `--text`, `--text-2`, `--text-3`, `--line`, `--line-2`, `--accent`, `--bony-grad`,
  `--r-*`. **Pas de couleur sombre en dur** (le thème clair doit marcher) sauf couleurs de marque/service/statut.

## Exigences
1. **100 % des fonctionnalités et caractéristiques de la rubrique réelle** : inventorie la page `.tsx` (champs, filtres
   et leurs options exactes, colonnes, tris, actions, états vides, règles de rôle) et ajoute dans la maquette tout ce
   qui manque. N'invente pas de fonction qui n'existe pas (sauf si la maquette validée la montre).
2. Règles métier (CLAUDE.md du dépôt) : Alpine PAR SITE, Nissan GLOBAL, Holding exclusif et jamais imputé,
   Brouillon exclu partout sauf To-do et prochains événements de Hello, rôles cloisonnés (Site Manager lecture seule).
3. Doit marcher de 380 px de large (conteneur `@container app`, `GX.ui.watchWidth`) jusqu'au plein écran 1920,
   en thème sombre ET clair, et en mobile (js/mobile.js monte les mêmes apps).
4. **Ne modifie QUE tes fichiers attribués.** Interdit : css/*, js/core.js, pickers.js, controls.js, wm.js, shell.js,
   widgets.js, data.js, mobile.js, index.html, les apps d'un autre agent. Données manquantes → mock local dans ton fichier.
5. Termine par `node --check` sur chacun de tes fichiers. **N'utilise pas le navigateur** (un autre agent/la session
   principale s'en sert ; la vérification visuelle est faite ensuite).
6. Rapport final (en français, concis) : ce que tu as changé, les fonctionnalités ajoutées pour la parité, ce qui
   manque encore ou que tu n'as pas pu faire, et tout écart repéré entre le vrai Gearbox et la maquette.
