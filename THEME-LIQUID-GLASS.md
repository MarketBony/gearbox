# Couche Liquid Glass — recolorée charte Bony (référence de fusion)

Ce fichier contient la couche visuelle "liquid glass" à porter dans `index.html`.
Tout est **déjà recoloré en charte Bony** (`#f75632` orange / `#8f12ab` violet / `#293f74` bleu).

## RÈGLES (à respecter strictement)

- La charte Bony déjà en place dans `index.html` est correcte : **ne pas la modifier**.
  Couleurs de marque, polices (Syncopate / Albert Sans) et `bony-gradient` actuels restent tels quels.
- Cette couche est **purement additive** : on ajoute des tokens, ombres et classes.
  On n'écrase aucune valeur existante de `bony.*`, ni `fontFamily`, ni `bony-gradient`.
- **NE PAS toucher à `pages/Login.tsx`** : son fond animé sur `<canvas>` doit rester strictement intact.
  N'y appliquer aucune classe glass, ne pas y injecter de fond CSS.
- Aucune police rose/cyan, aucune Orbitron/Nunito : on reste sur la charte.

---

## BLOC 1 — à FUSIONNER dans `tailwind.config` → `theme.extend`

Ajouter ces clés à l'objet `extend` existant. **Ne pas toucher** à `fontFamily`, `colors`,
ni `backgroundImage` qui sont déjà bons. On ajoute seulement `boxShadow`,
`borderRadius` et `transitionTimingFunction` :

```js
borderRadius: {
  '4xl': '2rem',
  '5xl': '2.5rem',
},
boxShadow: {
  // Ombres douces et diffuses (jamais dures)
  'soft':    '0 1px 2px rgba(16,18,32,0.04), 0 4px 16px rgba(16,18,32,0.06)',
  'soft-lg': '0 2px 8px rgba(16,18,32,0.05), 0 16px 40px -8px rgba(16,18,32,0.12)',
  'soft-xl': '0 4px 12px rgba(16,18,32,0.06), 0 32px 64px -16px rgba(16,18,32,0.18)',
  'glass':    '0 8px 32px -4px rgba(16,18,32,0.12), inset 0 1px 0 0 rgba(255,255,255,0.45)',
  'glass-lg': '0 24px 64px -12px rgba(16,18,32,0.22), inset 0 1px 0 0 rgba(255,255,255,0.5)',
  // Glow recolorés charte Bony (orange + violet)
  'glow':        '0 8px 28px -6px rgba(247,86,50,0.45)',
  'glow-violet': '0 8px 28px -6px rgba(143,18,171,0.40)',
},
transitionTimingFunction: {
  'apple':  'cubic-bezier(0.25, 0.1, 0.25, 1)',
  'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
},
```

---

## BLOC 2 — à FUSIONNER dans `:root` et `html.dark` (variables glass)

Ajouter ces variables **à la fin** des blocs `:root` et `html.dark` existants,
sans modifier les tokens `--bg-*`, `--border-color`, `--text-*` déjà présents.

Dans `:root` (mode clair) :

```css
/* Verre */
--glass-bg:        rgba(255,255,255,0.60);
--glass-bg-strong: rgba(255,255,255,0.78);
--glass-border:    rgba(255,255,255,0.70);
--glass-blur:      22px;

/* Washes d'accent du fond (charte Bony : orange + violet) */
--wash-1: rgba(247,86,50,0.06);
--wash-2: rgba(143,18,171,0.07);
```

Dans `html.dark` (mode sombre) :

```css
/* Verre — glassmorphism sombre cohérent (pas un simple inverse) */
--glass-bg:        rgba(28,28,36,0.55);
--glass-bg-strong: rgba(30,30,38,0.78);
--glass-border:    rgba(255,255,255,0.10);
--glass-blur:      22px;

--wash-1: rgba(247,86,50,0.10);
--wash-2: rgba(143,18,171,0.09);
```

---

## BLOC 3 — fond "spatial" diffus (optionnel mais recommandé)

Donne au verre un fond légèrement coloré qui le rend lisible. À fusionner dans la règle
`body` existante (en complétant `background-image`, sans retirer le reste).
Ce fond est global et ne s'affiche pas sur le Login (recouvert par son canvas) :

```css
body {
  background-color: var(--bg-main);
  background-image:
    radial-gradient(ellipse 90% 70% at 12% -5%,   var(--wash-1), transparent 55%),
    radial-gradient(ellipse 80% 70% at 105% 105%, var(--wash-2), transparent 55%);
  background-attachment: fixed;
}
```

---

## BLOC 4 — classes utilitaires à AJOUTER dans `<style>`

Coller tel quel (déjà recoloré charte). Le `.gx-gradient` utilise le dégradé Bony :

```css
/* ===================== VERRE (liquid glass) ===================== */
* { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }

/* Surface translucide premium — sidebar, navbars, modales, dropdowns, cartes flottantes */
.glass {
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(180%);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(180%);
  border: 1px solid var(--glass-border);
}
/* Variante plus opaque — quand la lisibilité du texte par-dessus est requise */
.glass-strong {
  background: var(--glass-bg-strong);
  backdrop-filter: blur(var(--glass-blur)) saturate(180%);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(180%);
  border: 1px solid var(--glass-border);
}
/* Reflet lumineux supérieur (combiner avec position:relative + overflow-hidden) */
.glass-sheen::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 45%;
  background: linear-gradient(to bottom, rgba(255,255,255,0.35), transparent);
  pointer-events: none;
  opacity: 0.6;
}
html.dark .glass-sheen::before {
  background: linear-gradient(to bottom, rgba(255,255,255,0.08), transparent);
}

/* Carte de contenu standard (opaque, douce) — le verre reste un accent, pas le fond partout */
.gx-card {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 1.25rem; /* 20px */
  box-shadow: 0 1px 2px rgba(16,18,32,0.04), 0 4px 16px rgba(16,18,32,0.06);
}
html.dark .gx-card { box-shadow: 0 1px 2px rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.35); }

/* Élévation au survol — uniquement transform/box-shadow (60fps) */
.gx-hover-lift {
  transition: transform 0.3s cubic-bezier(0.25,0.1,0.25,1), box-shadow 0.3s cubic-bezier(0.25,0.1,0.25,1);
  will-change: transform;
}
.gx-hover-lift:hover {
  transform: translateY(-3px);
  box-shadow: 0 2px 8px rgba(16,18,32,0.05), 0 16px 40px -8px rgba(16,18,32,0.14);
}
html.dark .gx-hover-lift:hover { box-shadow: 0 16px 40px -8px rgba(0,0,0,0.5); }

/* Pill / CTA dégradé — charte Bony (orange → violet) */
.gx-gradient { background-image: linear-gradient(to right, #f75632, #8f12ab); }
.gx-gradient:not(.bg-clip-text) { background-clip: padding-box; -webkit-background-clip: padding-box; }

/* ===================== SCROLLBAR ===================== */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: rgba(120,120,128,0.3);
  border-radius: 99px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(120,120,128,0.5);
  border: 2px solid transparent;
  background-clip: padding-box;
}
.custom-scrollbar { scrollbar-width: thin; scrollbar-color: rgba(120,120,128,0.3) transparent; }

/* ===================== ANIMATIONS UTILITAIRES ===================== */
@keyframes gx-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes gx-fade-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes gx-scale-in { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
.animate-fade-in  { animation: gx-fade-in 0.5s cubic-bezier(0.25,0.1,0.25,1) both; }
.animate-fade-up  { animation: gx-fade-up 0.5s cubic-bezier(0.25,0.1,0.25,1) both; }
.animate-scale-in { animation: gx-scale-in 0.4s cubic-bezier(0.25,0.1,0.25,1) both; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}
```

---

## BLOC 5 — Transitions de changement de page (framer-motion)

Les transitions page → page reposent sur framer-motion. Le Full résout actuellement ses
dépendances via un **importmap esm.sh** (react, lucide-react, recharts) — PAS via le bundle Vite.
framer-motion doit donc être ajouté à l'importmap, **en partageant l'instance React de l'app**,
sinon "Invalid hook call" au démarrage.

### 5.1 — Ajouter framer-motion à l'importmap (`index.html`)

Ajouter cette entrée dans le bloc `<script type="importmap">`. Le `?external=react,react-dom`
est le point CRITIQUE (React doit être partagé, pas dupliqué) :

```json
"framer-motion": "https://esm.sh/framer-motion@^12.40.0?external=react,react-dom"
```

Ajouter aussi `"framer-motion": "^12.40.0"` aux dependencies de `package.json` (cohérence + types).

### 5.2 — Créer `lib/motion.ts` (le dossier lib/ n'existe pas encore)

Presets partagés (easing Apple, variants de page, stagger, modales). À créer tel quel :

```ts
// Variants & presets Framer Motion partagés — animation cohérente sur toute l'app.
import type { Variants, Transition } from 'framer-motion';

export const easeApple: [number, number, number, number] = [0.25, 0.1, 0.25, 1];
export const springSoft: Transition = { type: 'spring', stiffness: 400, damping: 30 };

// ---- Transitions de page (App.tsx avec AnimatePresence mode="wait") ----
export const pageTransition: Transition = { duration: 0.35, ease: easeApple };
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 12, scale: 0.992 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit:    { opacity: 0, y: -8, scale: 0.992 },
};

// ---- Apparition en cascade (listes/grilles) ----
export const staggerContainer: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};
export const fadeUpItem: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: easeApple } },
};
export const scaleInItem: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.35, ease: easeApple } },
};

// ---- Micro-interaction « lift » au survol ----
export const hoverLift = {
  whileHover: { y: -4, scale: 1.01 },
  whileTap: { scale: 0.985 },
  transition: springSoft,
};

// ---- Modales / overlays ----
export const overlayVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.25, ease: easeApple } },
  exit:    { opacity: 0, transition: { duration: 0.2, ease: easeApple } },
};
export const modalVariants: Variants = {
  initial: { opacity: 0, scale: 0.95, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.3, ease: easeApple } },
  exit:    { opacity: 0, scale: 0.97, y: 8, transition: { duration: 0.2, ease: easeApple } },
};
```

### 5.3 — Câbler dans `App.tsx`

Dans `App.tsx`, le `<main>` rend `{renderContent()}` directement. Pour la transition,
envelopper le contenu dans `AnimatePresence mode="wait"` + un `motion.div` **keyé sur l'onglet
résolu** (le `tab` calculé dans renderContent, pas activeTab brut, pour que les redirections
de rôle ne cassent pas le `key`). Importer `AnimatePresence, motion` depuis 'framer-motion' et
`pageVariants, pageTransition` depuis './lib/motion'. Le `key` qui change déclenche la transition.

Ne PAS envelusser le `<Login />` (early return) dans cette transition : le Login garde son
propre fond canvas intact.

---

## Application aux surfaces

Une fois la couche en place, appliquer le verre aux éléments **structurants flottants** :
sidebar, barres de navigation, modales, dropdowns, cartes flottantes (via `.glass` /
`.glass-strong` + `.glass-sheen` quand pertinent). Les cartes de contenu standard
utilisent `.gx-card` (+ `.gx-hover-lift` si interactives). Le verre est un **accent**,
pas le fond de toutes les pages. Vérifier le rendu en **dark ET light** + **responsive
mobile/tablette**. Ne jamais appliquer ces classes au Login.
