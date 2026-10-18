# Bowling Gearbox — prototype v2 : contrat entre modules

Refonte demandée par Théo le 16/10/2026 après le premier prototype (`../bowling.html`, jugé « éteint ») :
« des effets (effet Magnus léger), une vraie impression de simu de piste de bowling, qu'on ait vraiment l'impression
de tirer », graphismes et décors au niveau, thème Bony **à la charte du groupe**, thème Grève CGT avec **les décors et
idées du minigolf**, bruitages réalistes. Référence d'ambiance : **Wii Sports Bowling** (lumineux, propre, lisible,
joyeux), mais en plus soigné.

Servi par le serveur `maquettes` (`python -m http.server 4173 --directory maquettes`) :
**http://localhost:4173/jeux/bowling/index.html**. Aucun build : modules ES natifs, dépendances par CDN (versions
EXACTES ci-dessous). Plus tard, la physique deviendra `shared/bowling.ts` exécuté AUSSI par le serveur Node (le serveur
rejoue chaque lancer et fait foi, comme le minigolf) : **la physique doit être déterministe et tourner sous Node**.

## Fichiers et propriétaires (un module = un agent ; ne jamais écrire dans le module d'un autre)

| Fichier | Rôle |
|---|---|
| `physique.js` | Simulation Rapier déterministe d'un lancer → images + contacts + résultat. Aucun DOM. |
| `rendu.js` | Scène three.js : piste, quilles, boule, joueur façon Mii, décors Bony / CGT, caméra, effets. |
| `son.js` | Moteur sonore Web Audio : roulement, chocs, quilles, foule, ambiance par thème. |
| `index.html` + `jeu.js` | Assemblage : contrôles (le geste de lancer), HUD, déroulé de partie, appels aux 3 modules. |
| `regles.js` | Score officiel (`tableau`, `position`) — existant, testé, ne pas modifier. |
| `cgt.js`, `assets/` | Slogans / pancartes CGT, logos (Bony couleur / mono / blanc, CGT officiel). Lecture seule. |

Dépendances CDN autorisées (versions figées) :
- three : `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js` + addons
  `https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/...` (import map dans `index.html` : `"three"` et `"three/addons/"`).
- Rapier déterministe : paquet npm `@dimforge/rapier3d-deterministic-compat@0.21.0` (WASM embarqué, même API que
  `@dimforge/rapier3d-compat`). Dans le navigateur : `https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-deterministic-compat@0.21.0/<fichier ES>`
  (vérifier le nom exact du fichier ES dans le paquet). Sous Node : le même paquet installé dans un dossier de test
  HORS du dépôt (scratchpad), jamais dans `package.json` du projet à ce stade.

## Repère commun (UNE seule convention, celle de three.js)

Mètres, secondes. **y vers le haut. z le long de la piste** : 0 = ligne de faute, quille 1 à z = 18,29.
**x positif = à GAUCHE du joueur** (la caméra regarde vers +z, donc +x apparaît à gauche de l'écran). Pour parler au
joueur (« à droite ») : `xJoueur = -x`. Quaternions three.js `[x, y, z, w]`.

Dimensions réglementaires : piste 1,054 m de large (demi 0,527), gouttières 0,235 m, quilles espacées de 0,3048 m
(rangées à 0,264 m), quille 0,381 m de haut / 1,53 kg / diamètre max 0,121 m, boule rayon 0,1085 m / 6,8 kg.
Emplacements numérotés comme au bowling (vu du joueur) : 1 devant ; 2-3 ; 4-5-6 ; 7-8-9-10, de GAUCHE à DROITE
→ la quille 7 a le x le plus GRAND (gauche), la 10 le plus petit.

## `physique.js`

```js
export const DIMENSIONS;                       // les constantes ci-dessus (+ zones d'huile, fosse, murs)
export async function initPhysique();          // charge Rapier (WASM) une fois ; à attendre avant simuler()
export function emplacements();                // [{ n, x, y, z }] des 10 quilles debout (y = 0 : base au sol)
export function simuler(debout, lancer, opts?) // synchrone, déterministe
// debout : [{ n, x, z, rot? }] quilles debout (positions réelles : une quille poussée sans tomber reste où elle est)
// lancer : { position, angle, vitesse, effet, lacher? }
//   position : m, xJoueur (positif = droite du joueur) au lâcher, ∈ [-0,45 ; 0,45]
//   angle    : rad, direction initiale, positif = vers la droite du joueur, ∈ [-0,08 ; 0,08]
//   vitesse  : m/s au lâcher, ∈ [3 ; 10,5]  (pro ≈ 8–9)
//   effet    : -1..1 ; rotation latérale donnée par le poignet. Positif = la boule crochète vers la GAUCHE du joueur
//              (lancer de droitier). 0 = boule droite (rotation avant seulement).
//   lacher   : facultatif, 0..1 qualité du lâcher (1 = parfait) ; < 1 → la boule « tombe » un peu (petit rebond,
//              perte de vitesse) — sert au ressenti, ne doit jamais rendre le jeu aléatoire.
// Retour :
// { images: [{ t, boule: [x,y,z, qx,qy,qz,qw], quilles: [[x,y,z, qx,qy,qz,qw], ...] /* ordre de `debout` */ }],
//   contacts: [{ t, type, force, x, y, z, n? }],
//      type ∈ 'boule-piste' (rebond au lâcher) | 'boule-quille' | 'quille-quille' | 'quille-piste' | 'quille-mur'
//             | 'boule-gouttiere' | 'boule-fosse' | 'quille-fosse' ; force = intensité du choc (N, brute)
//   roulement: [{ t, vitesse, glisse, zone }]  /* 1 échantillon par image : pour le son du roulement */
//   restent: [{ n, x, z, rot }],   // quilles encore DEBOUT à la fin (inclinaison < 10°, sur l'aire, pas dans la fosse)
//   tombees, gouttiere: bool, duree, impactT /* t du 1er choc boule-quille, ou null */ }
```
Images à 60 par seconde (pas de simulation fixe, ex. 1/240 s, une image tous les 4 pas). Fin : boule dans la fosse
ou la gouttière passée ET plus rien ne bouge (ou 9 s max).

## `rendu.js`

```js
export async function creerRendu(canvas, { theme })  // → R
R.setTheme('bony' | 'cgt')
R.poserQuilles(debout)                 // place les quilles debout (et cache les autres), hors animation
R.joueur.placer(xJoueur, angle)        // position et orientation du bowler pendant la visée (aperçu de visée inclus)
R.joueur.elan(phase, t)                // phase ∈ 'attente' | 'approche' | 'arriere' | 'avant' | 'suivi' ; t ∈ 0..1
                                       // (piloté par jeu.js à chaque image pendant le geste)
R.joueur.reaction('strike' | 'spare' | 'bon' | 'rate' | 'gouttiere')
R.boule.enMain(bool)                   // la boule suit la main du joueur
R.lecture(images, impactT)             // prépare la lecture d'un lancer simulé
R.image(img, dt)                       // affiche une image du moteur (jeu.js choisit laquelle : ralenti possible)
R.camera(mode)                         // 'visee' | 'suivi' | 'quilles' | 'celebration' (transitions douces)
R.effet(nom, opts)                     // 'secousse' {force} | 'eclats' {x,y,z,force} | 'strike' | 'spare' | 'confettis'
R.rendre(dt)                           // une image : animations du décor, particules, caméra
R.redimensionner(w, h)
```

## `son.js`

```js
export function creerSon()  // → S (AudioContext créé au premier geste de l'utilisateur)
S.activer(bool); S.theme('bony' | 'cgt')
S.ambiance(bool)                       // fond de salle (Bony) / manif (CGT) en boucle, discret
S.lacher(force)                        // la boule touche la piste au lâcher
S.roulement({ vitesse, glisse, zone }) // appelé à chaque image pendant la lecture ; zone ∈ 'piste'|'gouttiere'|null
S.contact(c)                           // un contact de physique.js (type, force) → choc adapté
S.resultat('strike' | 'spare' | 'bon' | 'rate' | 'gouttiere' | 'turkey')
S.machine()                            // balayage / remise des quilles (le râteau)
```

## Règles de la charte du groupe (thème Bony) — NON NÉGOCIABLES

Source : brandbook v01 (`brandbook.pdf` à la racine du dépôt, chapitre 02 p. 12–30) résumé dans
`C:\Users\Operateur\Documents\Partenariat Bony x Limagrain\CONTEXTE-PROJET.md` § 6.
- Dégradé identitaire `linear-gradient(90deg, #f75632 0%, #8f12ab 100%)` ; bleu nuit `#293f74` ; noir.
- Titres **Syncopate Bold** (avec parcimonie, en bas de casse), textes **Albert Sans** (Google Fonts).
- Logo : `assets/logo-bony-color.svg`, `logo-bony-mono.svg`, `logo-bony-white.svg` — jamais déformé ni recoloré
  autrement qu'en blanc / mono.
- Écriture : **« Bony auto-mobile »** (jamais « Bony » seul, ni « Bony Automobiles »), « le Groupe Bony » ;
  signature **« Génération auto-mobile »**.

## Thème Grève CGT — reprendre l'univers du minigolf

`ui2/apps/games/minigolf/rendu.ts` (thème `manif`) et `ui2/apps/games/cgt.ts` : logo CGT officiel
(`assets/logo-cgt.svg`), banderoles (`cgt.js` → `SLOGANS`), pancartes (`PANCARTES`), drapeaux rouges au logo,
chasubles rouges à bande blanche, barrières Vauban, ballons CGT, foule de manifestants, confettis rouges, annonces :
le TITRE reste toujours le terme de bowling (« STRIKE ! », « SPARE ! », « SPLIT ! »…) et la blague CGT s'affiche EN
DESSOUS ; les textes vivent dans `cgt.js` (`ANNONCES`), seule source (Théo, 17/10/2026). Aucune voix synthétisée dans
son.js (chœurs, cris, mégaphone retirés le 17/10/2026). Décor de manif additionnel : `decor-manif.js`, facultatif,
monté par rendu.js en thème CGT seulement.
