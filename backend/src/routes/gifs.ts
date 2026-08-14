import { Router } from 'express';
import { authenticateToken } from '../auth/middleware';

const router = Router();

// =============================================================================
// RECHERCHE DE GIF — proxy Giphy.
//
// Pourquoi cette route existe : le clavier GIF de Windows ne peut pas fonctionner
// dans un navigateur (il colle un CHEMIN LOCAL, illisible chez les autres et
// interdit d'accès à une page web — voir BUGS-CONNUS.md). Un sélecteur intégré est
// la seule façon d'offrir le geste.
//
// ℹ️ Giphy et non Tenor : Tenor ne délivre plus de clé d'API en libre-service
// (constaté le 06/08/2026 — son accès passe désormais par Google Cloud). Giphy
// fournit une clé immédiatement. Les deux services sont équivalents pour cet usage ;
// seule change la forme de la réponse, isolée dans ce fichier.
//
// ⚠️ LA CLÉ RESTE ICI. Elle n'est jamais envoyée au client : un appel Giphy depuis
// le navigateur l'exposerait à quiconque ouvre l'onglet Réseau, et n'importe qui
// pourrait alors consommer le quota du groupe. Même principe que le proxy de flux.
//
// ⚠️ CONFIGURATION EN DEUX TEMPS — le piège des clés VAPID (correctif 20) :
// `GIPHY_API_KEY` doit être valorisée dans le `.env` du VPS **ET** déclarée dans le
// bloc `environment:` du service `api` de `docker-compose.yml`. Absente de cette
// liste, elle n'atteint pas le conteneur et la recherche échoue en silence.
//
// Sans clé configurée, la route répond 503 et le bouton GIF est masqué côté client :
// la fonctionnalité s'éteint proprement au lieu de renvoyer des erreurs.
//
// ℹ️ La licence Giphy impose d'afficher la mention « Powered By GIPHY » — elle est
// dans `components/GifPicker.tsx`, ne pas la retirer.
// =============================================================================

const GIPHY = 'https://api.giphy.com/v1/gifs';
const TIMEOUT_MS = 6000;
// Gearbox est un outil de travail : on borne le contenu renvoyé. `g` serait très
// restrictif (peu de résultats), `pg-13` trop permissif — `pg` est l'équilibre.
// Ne pas monter au-dessus sans arbitrage explicite.
const RATING = 'pg';
const LIMITE = 24;

const cleGiphy = () => process.env.GIPHY_API_KEY?.trim() || '';

// GET /api/gifs/status — le bouton doit-il s'afficher ?
router.get('/status', authenticateToken, (_req, res) => {
  res.json({ disponible: !!cleGiphy() });
});

// GET /api/gifs?q=... — recherche, ou tendances si `q` est vide.
router.get('/', authenticateToken, async (req, res) => {
  const cle = cleGiphy();
  if (!cle) {
    return res.status(503).json({ error: 'Recherche de GIF non configurée (GIPHY_API_KEY absente).' });
  }

  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const params = new URLSearchParams({
    api_key: cle,
    limit: String(LIMITE),
    rating: RATING,
    lang: 'fr',
    bundle: 'messaging_non_clips', // formats adaptés à une messagerie
  });
  if (q) params.set('q', q);
  const url = `${GIPHY}/${q ? 'search' : 'trending'}?${params.toString()}`;

  const controller = new AbortController();
  const minuteur = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const amont = await fetch(url, { signal: controller.signal, redirect: 'error' });
    if (!amont.ok) {
      return res.status(502).json({ error: `Giphy indisponible (HTTP ${amont.status}).` });
    }
    const brut: any = await amont.json();
    // On ne renvoie QUE ce dont l'affichage a besoin, jamais la réponse du tiers
    // telle quelle (elle contient des dizaines de variantes, des URL de partage…).
    const gifs = (Array.isArray(brut?.data) ? brut.data : [])
      .map((r: any) => ({
        id: String(r?.id ?? ''),
        // `fixed_height_small` pour la grille (léger), `downsized_medium` pour
        // l'envoi : `original` peut peser plusieurs Mo et sera affiché en 240 px.
        apercu: r?.images?.fixed_height_small?.url ?? null,
        url: r?.images?.downsized_medium?.url ?? r?.images?.original?.url ?? null,
        description: typeof r?.title === 'string' ? r.title.slice(0, 120) : '',
      }))
      // Filtre de sûreté : on n'expose que des URL https de Giphy. Sans ça, une
      // réponse inattendue pourrait injecter une URL arbitraire dans un message,
      // qui serait ensuite rendue en `<img>` chez tous les participants.
      .filter((g: any) => g.url && /^https:\/\/[a-z0-9.-]*\.?giphy\.com\//i.test(g.url));
    res.json(gifs);
  } catch (e: any) {
    const cause = e?.name === 'AbortError' ? 'délai dépassé' : 'injoignable';
    return res.status(502).json({ error: `Giphy ${cause}.` });
  } finally {
    clearTimeout(minuteur);
  }
});

export default router;
