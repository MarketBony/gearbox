import { Router } from 'express';
import { authenticateToken } from '../auth/middleware';

const router = Router();

// =============================================================================
// APERÇU DE LIENS — liste blanche STRICTE de fournisseurs oEmbed.
//
// ⚠️⚠️ LE POINT DE SÉCURITÉ DE CETTE ROUTE. Contrairement à `/api/feeds`, celle-ci
// reçoit bien une URL du client — c'est inévitable, l'utilisateur colle ce qu'il
// veut dans une conversation. Tout le reste de la conception en découle :
//
//  1. L'hôte est validé contre `FOURNISSEURS` **avant toute requête sortante**. Un
//     domaine non listé rend 204 sans qu'aucun paquet ne quitte le VPS.
//  2. L'URL sortante n'est JAMAIS celle du client : on ne transmet que l'URL
//     validée, en paramètre d'un point d'entrée oEmbed **écrit en dur ici**. Le
//     serveur ne va donc jamais chercher un chemin choisi par un utilisateur.
//  3. Schéma limité à http/https, redirections coupées (`redirect: 'error'`), taille
//     de réponse plafonnée, timeout court. Sans `redirect: 'error'`, un fournisseur
//     compromis pourrait rediriger vers 169.254.169.254 (métadonnées cloud) ou vers
//     le réseau interne Docker, et la validation d'hôte serait contournée.
//
// C'est la même exigence que le proxy de flux (30/07/2026), adaptée au fait qu'ici
// une URL entre. **Ne pas élargir cette liste à « tous les domaines »** : ce serait
// rouvrir la SSRF que ce projet a explicitement décidé de fermer.
//
// Les autres domaines reconnus (réseaux sociaux, Google Photos, SharePoint…) sont
// traités CÔTÉ CLIENT, sans aucune requête : voir `lib/linkProviders.ts`. Ces
// plateformes exigent une authentification pour livrer leurs métadonnées, un fetch
// serveur ne rendrait rien d'utile — autant ne pas le tenter.
// =============================================================================

interface Fournisseur {
  nom: string;
  /** Construit l'URL oEmbed. Reçoit l'URL DÉJÀ validée. */
  oembed: (url: string) => string;
  /** Hôtes acceptés, comparés à l'identique ou en sous-domaine. */
  hotes: string[];
}

const FOURNISSEURS: Fournisseur[] = [
  {
    nom: 'YouTube',
    hotes: ['youtube.com', 'youtu.be', 'm.youtube.com'],
    oembed: u => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u)}`,
  },
  {
    nom: 'Vimeo',
    hotes: ['vimeo.com', 'player.vimeo.com'],
    oembed: u => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(u)}`,
  },
  {
    nom: 'Dailymotion',
    hotes: ['dailymotion.com', 'dai.ly'],
    oembed: u => `https://www.dailymotion.com/services/oembed?format=json&url=${encodeURIComponent(u)}`,
  },
  {
    nom: 'Spotify',
    hotes: ['open.spotify.com', 'spotify.com'],
    oembed: u => `https://open.spotify.com/oembed?url=${encodeURIComponent(u)}`,
  },
  {
    nom: 'SoundCloud',
    hotes: ['soundcloud.com'],
    oembed: u => `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(u)}`,
  },
];

const trouverFournisseur = (hostname: string): Fournisseur | null => {
  const h = hostname.toLowerCase().replace(/^www\./, '');
  return FOURNISSEURS.find(f => f.hotes.some(x => h === x || h.endsWith(`.${x}`))) ?? null;
};

// Cache mémoire : un même lien est réaffiché à chaque montage de la conversation et
// par chaque participant. Sans cache, un message populaire déclencherait une requête
// sortante par affichage. Perdu au redémarrage, sans conséquence.
const TTL_MS = 6 * 60 * 60 * 1000; // 6 h : un titre de vidéo ne bouge pas
const MAX_ENTREES = 500;           // borne mémoire : le cache ne doit pas croître sans fin
const cache = new Map<string, { at: number; data: any }>();

const TIMEOUT_MS = 5000;
const MAX_OCTETS = 256 * 1024; // une réponse oEmbed fait quelques centaines d'octets

// GET /api/link-preview?url=...
// 200 avec l'aperçu · 204 si le domaine n'est pas dans la liste blanche (cas normal,
// le client n'affiche alors pas d'aperçu) · 502 si le fournisseur est en faute.
router.get('/', authenticateToken, async (req, res) => {
  const brut = typeof req.query.url === 'string' ? req.query.url : '';
  if (!brut || brut.length > 2000) return res.status(204).end();

  let cible: URL;
  try {
    cible = new URL(brut);
  } catch {
    return res.status(204).end();
  }
  // Schéma : rien d'autre que http/https ne doit être fetché (file:, gopher:…).
  if (cible.protocol !== 'http:' && cible.protocol !== 'https:') return res.status(204).end();

  const fournisseur = trouverFournisseur(cible.hostname);
  // Hors liste blanche : AUCUNE requête sortante. C'est le garde-fou principal.
  if (!fournisseur) return res.status(204).end();

  const cle = cible.href;
  const enCache = cache.get(cle);
  if (enCache && Date.now() - enCache.at < TTL_MS) return res.json(enCache.data);

  const controller = new AbortController();
  const minuteur = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const amont = await fetch(fournisseur.oembed(cible.href), {
      signal: controller.signal,
      // ⚠️ Sans ça, une redirection contournerait la validation d'hôte ci-dessus.
      redirect: 'error',
      headers: { Accept: 'application/json' },
    });
    if (!amont.ok) return res.status(502).json({ error: `Aperçu indisponible (HTTP ${amont.status}).` });

    // Plafond de taille : on ne se fie pas à Content-Length, on borne la lecture.
    const texte = (await amont.text()).slice(0, MAX_OCTETS);
    const brutJson = JSON.parse(texte);

    // On ne renvoie que les champs utiles à l'affichage — jamais le JSON du tiers
    // tel quel (il contient du HTML d'iframe que le client n'a pas à recevoir).
    const data = {
      provider: fournisseur.nom,
      title: typeof brutJson.title === 'string' ? brutJson.title.slice(0, 200) : null,
      author: typeof brutJson.author_name === 'string' ? brutJson.author_name.slice(0, 100) : null,
      thumbnail: typeof brutJson.thumbnail_url === 'string' && /^https:\/\//i.test(brutJson.thumbnail_url)
        ? brutJson.thumbnail_url
        : null,
      url: cible.href,
    };

    if (cache.size >= MAX_ENTREES) cache.clear();
    cache.set(cle, { at: Date.now(), data });
    res.json(data);
  } catch (e: any) {
    const cause = e?.name === 'AbortError' ? 'délai dépassé' : 'injoignable';
    return res.status(502).json({ error: `Aperçu ${cause}.` });
  } finally {
    clearTimeout(minuteur);
  }
});

export default router;
