# Gearbox OS (maquette 2.0) — contrat d'une rubrique

Maquette HTML/JS **sans build**, servie par `python -m http.server` sur
`http://localhost:4173/v2/`. Données **fictives**, en mémoire, aucun appel réseau.
Une rubrique = **un fichier** `js/apps/<id>.js`, qui ne touche **à rien d'autre**.

Références à lire AVANT d'écrire : `js/apps/dashboard.js` et `js/apps/projects.js`
(qualité attendue), `css/ui.css` (primitives), `js/core.js` (API), `js/data.js`
(données), `js/charts.js` (graphiques).

## 1. Enregistrement

```js
(() => {
  const D = GX.data, F = GX.fmt;
  GX.css(`/* styles préfixés par la rubrique : .dig-… */`);
  GX.registerApp({
    id: 'digital', name: 'Digital', icon: 'digital', tint: ['#2f7cf6', '#293f74'],   // garder id/name/icon/tint du fichier provisoire
    size: [1240, 760], minSize: [360, 360],
    badge: () => 0,                                   // optionnel : pastille rouge sur l'icône du Dock
    mount(body, win) {                                // body = conteneur vide de la fenêtre (ou de l'écran mobile)
      body.innerHTML = `<div class="app">…</div>`;    // TOUJOURS une racine .app (conteneur de requêtes « app »)
      return {
        destroy() {},                                 // désabonner GX.on, observers, timers
        command(c) {},                                // actions venues de Spotlight/Launchpad/notifications (ex. 'new-post', 'post:sp3')
        menus: () => ({ 'Fichier': [ {label, icon, kbd, action, checked, disabled}, '-' ], 'Présentation': [] }),  // menus de la barre de menus
      };
    },
  });
})();
```

## 2. L'objet `win` reçu par `mount`

- `win.setTitle(titre, sousTitre)` — titre de la barre de fenêtre (ex. `win.setTitle('Digital', 'Planning')`).
- `win.sheet(html, { onClose(val) })` — **la** modale : feuille qui descend sous la barre de titre.
  Boutons de fermeture : `data-sheet="valeur"` (la valeur est passée à `onClose`). Jamais de `position:fixed` maison.
- `win.params` — paramètres d'ouverture. `win.open(appId, params, elementOrigine)` ouvre une autre fenêtre en zoomant depuis l'élément.
- `win.isCompact()` — largeur < 720 px.

## 3. Mise en page adaptative (OBLIGATOIRE : fenêtre étroite ET téléphone)

- La racine `.app` est un conteneur de requêtes : utiliser `@container app (max-width: 720px) { … }` (pas `@media`).
- Une rubrique liste → détail utilise `GX.ui.watchWidth(body, 760, compact => …)` :
  large = `.split` (barre latérale `.side` + `.main`), compact = `GX.ui.stack(host)` (`push(titre, html)` renvoie le conteneur, `pop()`).
- Les tableaux larges défilent horizontalement (`.scroll`) ou masquent leurs colonnes secondaires en compact.
- Viser **360 px de large** minimum : rien ne doit déborder ni se chevaucher.

## 4. Primitives CSS (ui.css) — ne jamais recoder

`.btn` (`.primary .ghost .sm .lg .pill`), `.icon-btn` (`.sm .on`), `.field` + `.label`, `.input .select .textarea`,
`.search`, `.check`, `.switch`, `.range`, `.badge` (`style="--c:…"`, `.solid`, `.dot`), `.chip` (`aria-pressed`, `data-toggle`),
`.brand-dot` (`--c`), `.count`, `.av` (`.sm .lg .xl`, `--c`), `.av-stack`, `.seg` (boutons `aria-pressed`, émet `change` avec `detail` = `data-v`),
`.tabs` (boutons `aria-selected`, émet `change`), `.list-row` (`.sel`), `.tbl` (`th` collant, `.r` à droite), `.bar > i` (`--c`), `.ring` (`--p --sz --th`),
`.empty`, `.skel`, `.card` (`.pad`), `.kpis .kpi .kpi-v`, `.grid2`, `.split .side .main .side-sec .side-it`, `.app-toolbar .app-body .app-pad`,
`.form-grid .full`, `.row .col .grow .wrap .ellipsis .num .muted .faint .scroll .hide`, `.enter` (entrée animée, `--i` = rang).
Les segmented/tabs placent leur curseur tout seuls. Tokens : `var(--surface-1..4) --line --line-2 --text --text-2 --text-3 --accent --ok --warn --danger --info --bony-grad --bony-orange --bony-violet --r-* --t-fast/med/slow --spring-snappy/soft/bouncy`.
**Aucune couleur en dur** sauf celles qui viennent des données (statuts, marques, services, types de congé).

## 5. Helpers

- `GX.icon(nom, 'sm'|'lg')` — noms disponibles dans `core.js` (objet `I`).
- `GX.fmt.eur / eurK / n / pct / date / dateY / dateLong / day / time / rel / ago`, `GX.esc(texte)` (échapper TOUT texte injecté), `GX.iso(date)`, `GX.addDays`, `GX.today()`, `GX.uid()`.
- `GX.r.av(uid,'sm')`, `GX.r.brandDots(brands)`, `GX.r.brandChips`, `GX.r.pStatus`, `GX.r.tStatus`, `GX.r.sStatus(statutDigital)`, `GX.r.service(s)`, `GX.r.proPlus()`, `GX.r.net(réseau)`.
- `GX.chart.bars({labels, series:[{name, values, color?}], line?, height, fmt, stacked})`, `GX.chart.donut({parts:[{label,value,color}], center, sub})`, `GX.chart.legend(parts)`, `GX.chart.hbars({items})`, `GX.chart.spark(values)`.
- `GX.menu.open(items, élément | {x,y})` — menus déroulants et contextuels (clic droit : `contextmenu` + `preventDefault`).
- `GX.shell.notify({ app, title, body, u?, actions?:[{label, action}], onClick?, silent? })`, `GX.shell.quickLook({ title, html, origin })`, `GX.shell.hud(texte)`.
- `GX.animate(el, keyframes, { spring:'snappy'|'soft'|'bouncy' })`, `GX.flip(el, ancienRect)`.
- Bus : `GX.on(type, fn)` renvoie une fonction de désabonnement ; `GX.emit(type, detail)`.
  Événements : `ctx` (rôle / périmètre changé → re-rendre), `data:projects`, `chat:message` ({conv, msg}), `badges` (recalculer les pastilles du Dock).

## 6. Contexte et cloisonnement (règles réelles de Gearbox)

`GX.ctx = { role, site, perimetre, readOnly }` — le rôle se change dans le Centre de contrôle (« Voir comme »).
- `readOnly` (Chef de site, Invité) : aucun bouton de création/édition actif, badge « Lecture seule ».
- `site` (Chef de site) : ne montrer QUE les données de son site, et masquer les autres sites dans le contenu (« +N masqués »).
- `perimetre` ('Tout le réseau' | un site | 'Nissan') : filtre global de la barre de menus — à appliquer quand la rubrique a une notion de site.
- Règles métier : brouillons (Draft) exclus partout sauf To-do ; Holding (GROUPE BONY) tracké mais jamais imputé à un budget ;
  Alpine = par site (Alpine-Clermont, -Vichy, -Le Puy, -Rodez), Nissan = une seule enveloppe globale ; Renault + Dacia + Mobilize = compte RDM.

## 7. Qualité attendue

- Texte d'interface en **français**, vocabulaire exact de Gearbox (libellés de la spec fournie).
- Interactions réelles en mémoire (créer, éditer, déplacer, filtrer) : la maquette doit se **manipuler**, pas seulement se regarder.
- Mouvement : entrées `.enter`, transitions par `GX.animate` / ressorts CSS ; rien qui fasse attendre l'utilisateur.
- Au moins une entrée de `menus()` utile et, si pertinent, `command()` (actions Spotlight : 'new-post', 'conge', 'book', 'expense', 'post:<id>', 'conv:<id>', 'dm:<uid>').
- Pas de dépendance externe, pas de `fetch`, pas de `localStorage` (sauf préférences d'affichage via `GX.store`).

## 8. Vérifier

1. `node --check js/apps/<id>.js`
2. Ouvrir `http://localhost:4173/v2/index.html?app=<id>` dans **son propre onglet** du navigateur intégré (`tabs_create` puis `navigate`) :
   aucune erreur console, rendu correct large ET étroit (réduire la fenêtre via `GX.wm.unsnap(GX.wm.active())` puis
   `GX.wm.active().el.style.width='380px'`), interactions principales qui marchent. Ne pas redimensionner le viewport,
   ne pas toucher aux autres onglets, fermer son onglet à la fin.

---

# v2.1 — règles ajoutées après la revue de Théo (25/09/2026)

Retours à corriger partout : **lisibilité** (sombre ET clair), **hauteur utile**, **parité fonctionnelle**.

## A. Parité fonctionnelle (priorité 1)
- Lire la VRAIE page (`../../pages/<Page>.tsx`, `../../components/...`, `../../constants.ts`, `../../types.ts`) et reproduire **chaque**
  filtre, sélecteur, bouton, colonne, onglet, statut et action. Un sélecteur **multiple** dans Gearbox reste **multiple** ici.
- Ne JAMAIS ouvrir l'onglet du vrai Gearbox (`localhost:3000`) : il écrit dans la base de PRODUCTION. Lire le code source uniquement.
- Lister dans le compte rendu ce qui reste absent (et pourquoi).

## B. Sélecteurs partagés (js/pickers.js) — ne jamais recoder un menu de filtre
- `GX.ui.sitePicker(bouton, sélection[], onChange(values), { variant: 'filter'|'project'|'digital', multi })` : plaques ★ (cocher toute la plaque), sites, Nissan.
- `GX.ui.pick(bouton, groupes, { multi, selected, onChange, title, allLabel, search })` : tout autre choix (marques, services, statuts, utilisateurs, types…).
- `GX.ui.dateRange(bouton, { from, to }, onChange)` + `GX.ui.periodLabel(from, to)`.
- `GX.ui.chips(valeurs, sélection, { all:'Toutes', colors })` : puces multi (« Toutes » exclusif) ; écouter `change` (detail = tableau).
- `GX.ui.pickerBtn('data-x', icône, libellé, actif)` + `GX.ui.summary(valeurs, { all })` pour le bouton déclencheur.

## C. Hauteur utile
- Une fenêtre agrandie n'a plus de barre de titre (fusion avec la barre de menus) et le Dock s'efface : **ne pas regagner ce qu'on a
  libéré avec un gros en-tête**. Plus de titre `.display` géant ni de sur-titre en capitales : utiliser **`.app-head`** (UNE ligne :
  `<div class="app-head"><div class="ah-t"><h1>Titre</h1><span class="sub">contexte</span></div><div class="ah-tabs">onglets</div><div class="ah-f">filtres, actions</div></div>`)
  et, si besoin, **une** seconde ligne `.app-head2` pour les filtres (repliable).
- Utiliser **toute la largeur** : pas de `max-width` sur le contenu principal ; répartir en colonnes plutôt que laisser du vide.

## D. Lisibilité (constat : l'ancien Gearbox était plus lisible)
- Texte courant ≥ 13,5 px, titres d'éléments 14–15 px gras ; plus de texte à 10 px sauf micro-libellés.
- Marques en étiquettes **pleines** : `GX.r.brandChips(brands)` (jaune Renault à texte foncé, Dacia olive, Alpine bleu…). Services : `GX.r.service(s)` (contour).
- Cartes nettement détachées du fond (surface-2 sur surface-1 + bord `--line`), séparateurs visibles, survols marqués.
- **Couleurs de fond porteuses de sens** (ce que Théo a regretté) : colonnes Kanban teintées de leur couleur de statut
  (`background: color-mix(in srgb, <couleur> 9%, var(--surface-0))` + en-tête coloré), liseré gauche coloré sur les cartes en retard / par statut,
  lignes de tableau zébrées légèrement. Garder l'identité : la police **Syncopate** (`.display`) pour les titres d'éléments phares comme dans Gearbox,
  mais en taille raisonnable (13–15 px).
- Vérifier en **thème clair** aussi : `GX.shell.setPref('theme','light')` puis revenir à `'dark'`.

## E. Rappels
- Icônes d'app : `GX.appIcon(id, taille)` ; pictogramme seul au style maison : `GX.appGlyph(id)`.
- Données : `js/data.js` peut être lu, pas modifié (si une donnée manque, la créer localement dans la rubrique).
