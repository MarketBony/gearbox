import { Router } from 'express';
import { authenticateToken } from '../auth/middleware';

const router = Router();

// =====================================================================
// PROXY DE FLUX RSS — remplace le proxy tiers corsproxy.io
//
// Pourquoi cette route existe : le frontend passait par https://corsproxy.io,
// dont l'offre gratuite est réservée à localhost. Depuis l'origine de production
// le service répondait :
//   403 {"error":"Free usage is limited to localhost and development environments"}
// D'où des flux qui fonctionnaient en local et jamais en ligne (30/07/2026).
// En proxifiant nous-mêmes, l'appel devient same-origin : plus de CORS, plus de
// dépendance à un tiers, et plus de trafic de lecture envoyé chez un inconnu.
//
// ⚠️ RÈGLE DE SÉCURITÉ : le client n'envoie JAMAIS d'URL, seulement une CLÉ de ce
// registre. Un proxy acceptant une URL arbitraire permettrait de faire appeler
// n'importe quoi par le serveur — y compris le réseau interne Docker ou des
// endpoints de métadonnées cloud (SSRF). Ne pas introduire de paramètre `?url=`.
//
// Les URL vivent ici et non dans le frontend : un flux RSS meurt régulièrement
// (4 sur 8 étaient morts le 30/07/2026), et le corriger ne demande alors qu'un
// redéploiement de `api`, sans toucher au frontend.
// =====================================================================

interface FeedDef {
  name: string;
  color: string;              // classe Tailwind du badge, côté affichage
  category: 'auto' | 'marketing';
  url: string;                // jamais exposée au client
}

const FEEDS: Record<string, FeedDef> = {
  // --- Actus auto ---
  autoplus:   { name: 'AutoPlus',       color: 'bg-emerald-600', category: 'auto',      url: 'https://www.autoplus.fr/feed' },
  automoto:   { name: 'AutoMoto',       color: 'bg-purple-600',  category: 'auto',      url: 'https://www.auto-moto.com/feed' },
  // Corrigé le 30/07/2026 : l'ancienne URL /rss/actualites.xml renvoyait 410 Gone.
  caradisiac: { name: 'Caradisiac',     color: 'bg-blue-600',    category: 'auto',      url: 'https://www.caradisiac.com/rss.xml' },
  // Remplace L'Argus, qui a abandonné son RSS (404 sur toutes les variantes testées).
  // Autoactu couvre l'actu de la DISTRIBUTION auto : plus proche du métier.
  autoactu:   { name: 'Autoactu',       color: 'bg-red-500',     category: 'auto',      url: 'https://www.autoactu.com/rss' },

  // --- Actus marketing / tech ---
  bdm:        { name: 'BDM',            color: 'bg-blue-500',    category: 'marketing', url: 'https://www.blogdumoderateur.com/feed/' },
  jdn:        { name: 'JDN',            color: 'bg-indigo-600',  category: 'marketing', url: 'https://www.journaldunet.com/rss/' },
  // Corrigé : l'ancienne URL contenait un /fr/ qui renvoyait 404.
  influencia: { name: 'Influencia',     color: 'bg-pink-600',    category: 'marketing', url: 'https://www.influencia.net/feed' },
  // Corrigé : slash final requis, et 403 sans en-têtes de navigateur (voir plus bas).
  usinedigi:  { name: 'Usine Digitale', color: 'bg-cyan-700',    category: 'marketing', url: 'https://www.usine-digitale.fr/rss/' },
};

// Cache mémoire : 8 flux × chaque utilisateur × chaque montage de page, ce serait
// du gaspillage (et lent). Un flux RSS n'a pas besoin d'être plus frais que ça.
// Perdu au redémarrage du conteneur, sans conséquence.
const TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { corps: string; type: string; at: number }>();

// Certains éditeurs (Usine Digitale) renvoient 403 à un client qui ne ressemble
// pas à un navigateur. En-têtes vérifiés le 30/07/2026 sur les 8 flux.
const OUTGOING_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Accept': 'application/rss+xml, application/xml, text/xml, */*'
};

const TIMEOUT_MS = 8000;

// GET /api/feeds — liste pour l'affichage. N'expose PAS les URL.
router.get('/', authenticateToken, (req, res) => {
  res.json(
    Object.entries(FEEDS).map(([key, f]) => ({
      key,
      name: f.name,
      color: f.color,
      category: f.category
    }))
  );
});

// GET /api/feeds/:key — contenu brut du flux.
router.get('/:key', authenticateToken, async (req, res) => {
  const feed = FEEDS[req.params.key];
  // Clé inconnue : 404 immédiat, AUCUNE requête sortante.
  if (!feed) return res.status(404).json({ error: 'Flux inconnu.' });

  const enCache = cache.get(req.params.key);
  if (enCache && Date.now() - enCache.at < TTL_MS) {
    return res.type(enCache.type).send(enCache.corps);
  }

  // `fetch` reste dans le handler async : couvert par express-async-errors +
  // middleware/errorHandler (règle de ETAT-BACKEND.md). Un flux injoignable ne
  // doit jamais tuer l'API.
  const controller = new AbortController();
  const minuteur = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const amont = await fetch(feed.url, { headers: OUTGOING_HEADERS, signal: controller.signal });
    if (!amont.ok) {
      // 502 : c'est la source qui est en faute, pas notre API. Le frontend
      // dégrade déjà proprement (Promise.allSettled, flux ignoré).
      return res.status(502).json({ error: `Flux ${feed.name} indisponible (HTTP ${amont.status}).` });
    }
    const corps = await amont.text();
    const type = amont.headers.get('content-type') || 'application/xml';
    cache.set(req.params.key, { corps, type, at: Date.now() });
    res.type(type).send(corps);
  } catch (e: any) {
    const cause = e?.name === 'AbortError' ? 'délai dépassé' : 'injoignable';
    return res.status(502).json({ error: `Flux ${feed.name} ${cause}.` });
  } finally {
    clearTimeout(minuteur);
  }
});

export default router;
