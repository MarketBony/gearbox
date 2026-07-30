import { Router } from 'express';
import { authenticateToken } from '../auth/middleware';

const router = Router();

// =====================================================================
// MUSIQUE DU JOUR — passe-plat vers l'API Deezer
//
// Deezer n'envoie AUCUN en-tête Access-Control-Allow-Origin : son API est donc
// impossible à appeler depuis un navigateur, quel que soit l'environnement. Le
// frontend passait par corsproxy.io (réservé à localhost, d'où la panne en
// production le 30/07/2026) avec un repli en appel direct qui ne pouvait pas
// fonctionner. On proxifie donc côté serveur — là, aucune notion de CORS.
//
// L'id de playlist vit ici : le client ne choisit pas ce qu'on va chercher.
// =====================================================================

const PLAYLIST_ID = '15169024043';
const DEEZER_URL = `https://api.deezer.com/playlist/${PLAYLIST_ID}/tracks?limit=100`;

// La playlist bouge rarement, et le frontend ne tire qu'une piste par jour.
const TTL_MS = 30 * 60 * 1000;
let cache: { corps: any; at: number } | null = null;

const TIMEOUT_MS = 8000;

// GET /api/music/tracks — pistes de la playlist du jour.
router.get('/tracks', authenticateToken, async (req, res) => {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return res.json(cache.corps);
  }

  const controller = new AbortController();
  const minuteur = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const amont = await fetch(DEEZER_URL, { signal: controller.signal });
    if (!amont.ok) {
      return res.status(502).json({ error: `Deezer indisponible (HTTP ${amont.status}).` });
    }
    const corps = await amont.json();
    cache = { corps, at: Date.now() };
    res.json(corps);
  } catch (e: any) {
    const cause = e?.name === 'AbortError' ? 'délai dépassé' : 'injoignable';
    return res.status(502).json({ error: `Deezer ${cause}.` });
  } finally {
    clearTimeout(minuteur);
  }
});

export default router;
