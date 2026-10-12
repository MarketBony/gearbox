import { Router } from 'express';
import { authenticateToken } from '../auth/middleware';

// ============================================================================
// MÉTÉO — relais OpenWeather (lot sécurité serveur, 12/10/2026).
//
// Deux défauts corrigés ensemble :
//  1. La clé était EN CLAIR dans le code client (`pages/HelloMarketing.tsx`), donc dans le bundle servi à tous.
//     Elle vit désormais dans `OPENWEATHER_API_KEY` (.env local et VPS) et ne quitte jamais le serveur.
//  2. « Les températures sont toujours en dessous du réel » (Théo, 12/10) : MESURÉ, c'est vrai. La requête par NOM
//     (`q=Clermont-Ferrand`) tombait sur un point arrondi à 45,667 / 3,000 — `grnd_level` 909 hPa, soit ~900 m
//     d'altitude, côté chaîne des Puys — au lieu de la ville (~400 m) : 6,6 °C contre 9,5 °C aux vraies coordonnées,
//     le même instant. Beaucoup d'autres noms tombaient sur le centroïde d'un « Arrondissement de … », et
//     « Le Puy-en-Velay » ne renvoyait rien. On interroge donc par COORDONNÉES du centre-ville de chaque site.
//
// Même principe que /api/feeds : le client n'envoie qu'une CLÉ (le nom du site), jamais une URL ni des coordonnées.
// ============================================================================

const router = Router();

const COORDS: Record<string, { label: string; lat: number; lon: number }> = {
  'Clermont':        { label: 'Clermont-Ferrand',         lat: 45.7772, lon: 3.0870 },
  'Clermont-Ferrand':{ label: 'Clermont-Ferrand',         lat: 45.7772, lon: 3.0870 },
  'Mozac':           { label: 'Mozac',                    lat: 45.8866, lon: 3.0913 },
  'Massagettes':     { label: 'Clermont-Ferrand',         lat: 45.7772, lon: 3.0870 },
  'Vichy':           { label: 'Vichy',                    lat: 46.1277, lon: 3.4260 },
  'Moulins':         { label: 'Moulins',                  lat: 46.5660, lon: 3.3326 },
  'Thiers':          { label: 'Thiers',                   lat: 45.8564, lon: 3.5475 },
  'Ricoux':          { label: 'Thiers',                   lat: 45.8564, lon: 3.5475 },
  'Ambert':          { label: 'Ambert',                   lat: 45.5497, lon: 3.7417 },
  'Ussel':           { label: 'Ussel',                    lat: 45.5480, lon: 2.3097 },
  'Issoire':         { label: 'Issoire',                  lat: 45.5443, lon: 3.2490 },
  'Brioude':         { label: 'Brioude',                  lat: 45.2944, lon: 3.3840 },
  'Le Puy-en-Velay': { label: 'Le Puy-en-Velay',          lat: 45.0434, lon: 3.8850 },
  'Mende':           { label: 'Mende',                    lat: 44.5181, lon: 3.5006 },
  'Albi':            { label: 'Albi',                     lat: 43.9289, lon: 2.1464 },
  'Rodez':           { label: 'Rodez',                    lat: 44.3506, lon: 2.5750 },
  'Millau':          { label: 'Millau',                   lat: 44.0980, lon: 3.0780 },
  'Aurillac':        { label: 'Aurillac',                 lat: 44.9264, lon: 2.4397 },
  'Figeac':          { label: 'Figeac',                   lat: 44.6086, lon: 2.0317 },
  'Gaillac':         { label: 'Gaillac',                  lat: 43.9016, lon: 1.8969 },
  'Villefranche':    { label: 'Villefranche-de-Rouergue', lat: 44.3517, lon: 2.0347 },
  'Carmaux':         { label: 'Carmaux',                  lat: 44.0510, lon: 2.1580 },
  'Lavaur':          { label: 'Lavaur',                   lat: 43.6985, lon: 1.8186 },
  'Saint-Etienne':   { label: 'Saint-Étienne',            lat: 45.4397, lon: 4.3872 },
  'Montluçon':       { label: 'Montluçon',                lat: 46.3402, lon: 2.6036 },
};
const DEFAULT_KEY = 'Clermont';

const TTL_MS = 10 * 60 * 1000;   // OpenWeather rafraîchit ses observations toutes les ~10 min
const TIMEOUT_MS = 8000;
const cache = new Map<string, { at: number; body: unknown }>();

const get = async (url: string) => {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
};

// GET /api/weather?city=<site> → { city, current, forecast } : réponses brutes d'OpenWeather (`weather` et
// `forecast`), mises en forme par le client comme avant. Site inconnu → Clermont (même défaut que l'interface).
router.get('/', authenticateToken, async (req, res) => {
  const key = process.env.OPENWEATHER_API_KEY?.trim();
  if (!key) return res.status(503).json({ error: 'Météo non configurée sur le serveur.' });

  const asked = typeof req.query.city === 'string' ? req.query.city : '';
  const site = COORDS[asked] ? asked : DEFAULT_KEY;
  const hit = cache.get(site);
  if (hit && Date.now() - hit.at < TTL_MS) return res.json(hit.body);

  const { label, lat, lon } = COORDS[site];
  const q = `lat=${lat}&lon=${lon}&appid=${encodeURIComponent(key)}&units=metric&lang=fr`;
  try {
    const [current, forecast] = await Promise.all([
      get(`https://api.openweathermap.org/data/2.5/weather?${q}`),
      get(`https://api.openweathermap.org/data/2.5/forecast?${q}&cnt=40`).catch(() => null),
    ]);
    const body = { city: label, current, forecast };
    cache.set(site, { at: Date.now(), body });
    res.json(body);
  } catch (e: any) {
    res.status(502).json({ error: `Météo indisponible (${e?.name === 'AbortError' ? 'délai dépassé' : e?.message || 'injoignable'}) — ${label}` });
  }
});

export default router;
