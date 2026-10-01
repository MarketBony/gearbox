# Forms Bony — Worker Cloudflare (`forms`)

Formulaires maison de Gearbox, servis au public : `https://forms.bonyauto-mobile.workers.dev/<publicId>`.
Créés et modifiés dans Gearbox (rubrique Forms › Forms Bony), **déployés une seule fois** ici :
publier un formulaire = Gearbox dépose sa définition dans le KV du Worker, sans rebuild.

## Fonctionnement
- **Format partagé** : `../shared/bonyform.ts` (copie à l'identique dans `backend/src/bonyforms/schema.ts`,
  contrôlée par `scripts/check-bonyform-sync.mjs`). Validation identique dans le navigateur, le Worker et Gearbox.
- **Gearbox → Worker** : `POST /__gearbox/publish` et `/__gearbox/remove`, signés (HMAC-SHA256 du corps +
  horodatage ±5 min, secret `GEARBOX_SECRET` = `FORMS_WORKER_SECRET` de Gearbox).
- **Répondant → Worker** : `GET /<publicId>` (page + client `src/client.ts` inclus), `POST /<publicId>`
  (réponse). Filtres AVANT Gearbox : 8 envois / minute / IP / formulaire, champ piège, délai minimal 1,5 s,
  captcha Turnstile vérifié côté serveur, validation complète.
- **Worker → Gearbox** : `POST /api/bony-forms/ingest` (signé). Si Gearbox ne répond pas : la réponse est
  gardée dans le KV (`q:<id>`, 30 jours) et renvoyée **chaque minute** (cron). Aucune réponse perdue ;
  l'identifiant de réponse est fixé par le Worker, un renvoi ne crée jamais de doublon.
- Le Worker n'a **aucun accès à la base** de Gearbox.
- **Thème** (correctif 64) : `src/theme.ts` (thème → variables CSS + attributs, FILTRÉS : couleurs, polices,
  nombres, adresses — ils partent dans une balise `<style>`) et `src/styles.ts` (feuille unique). Partagés par la
  page servie et le client.
- **Aperçu du Studio** : `GET /__preview` (intégrable seulement depuis `PREVIEW_ORIGINS`), piloté par
  `postMessage` (`bonyform:def`, `bonyform:screen`, `bonyform:highlight` ; le client répond `bonyform:ready`,
  `bonyform:focus`, `bonyform:screen`). Ni captcha ni envoi en aperçu.
- **Fichiers** : `POST /__gearbox/asset` (signé ; images WebP/PNG/JPEG/GIF et polices WOFF2/WOFF/OTF/TTF, 3 Mo
  max, pas de SVG) → servis par `GET /a/<id>` (cache d'un an, CSP `sandbox`).

## KV `FORMS` (id `48950e3fde4e4e82a923880278b1d766`)
`form:<publicId>` (définition publiée + statut), `asset:<empreinte>` (images et polices), `q:<id>` (file d'attente), `st:<publicId>` (places des
créneaux, cache 60 s), `rl:…` (limitation de débit, 2 min).

## Développement local
```
cd forms-worker && npm install
npm run dev            # http://localhost:8787 (KV local, clés Turnstile de TEST)
```
`.dev.vars` (non commité) : `GEARBOX_URL=http://localhost:3001`, `GEARBOX_SECRET=<FORMS_WORKER_SECRET de backend/.env>`,
`TURNSTILE_SECRET=1x0000000000000000000000000000000AA` (clé de test officielle, toujours valide).
Côté Gearbox local : `FORMS_WORKER_URL=http://localhost:8787` dans `backend/.env`.
Cron en local : `curl http://127.0.0.1:8787/cdn-cgi/local/scheduled`.
Vérification des types : `npm run check` (Worker et client, deux tsconfig : les types Cloudflare redéfinissent
une partie du DOM).

## Déploiement (production)
1. Turnstile : créer un widget (tableau de bord Cloudflare › Turnstile) pour le nom d'hôte
   `forms.bonyauto-mobile.workers.dev`, mode « Managed » ; reporter la **clé de site** dans `wrangler.jsonc`
   (`TURNSTILE_SITE_KEY`) et la **clé secrète** en secret.
2. Secrets (une fois, ou à chaque rotation) :
   `npx wrangler secret put GEARBOX_SECRET` (= `FORMS_WORKER_SECRET` du `.env` du VPS) et
   `npx wrangler secret put TURNSTILE_SECRET`.
3. `npm run deploy` (compile le client puis publie le Worker).
4. Gearbox (VPS) : `FORMS_WORKER_URL=https://forms.bonyauto-mobile.workers.dev` et `FORMS_WORKER_SECRET`
   dans `~/gearbox/.env` (déclarés dans `docker-compose.yml`).

⚠️ Les formulaires publiés en LOCAL (KV local de `wrangler dev`) n'existent pas en production : republier
depuis la prod.
