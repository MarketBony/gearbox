import { db } from '../../../services/dataService';
import type { FeedInfo } from '../../../types';

// =====================================================================
// Flux de Hello Marketing (actus RSS, musique du jour) — MÊMES services que la page actuelle
// (`db.getFeeds`, `db.getFeedContent`, `db.getMusicTracks`), MÊMES clés de cache localStorage,
// MÊMES règles (12 articles, tri par date décroissante, piste = jour de l'année % nb pistes).
//
// BESOIN: `parseRss`, `getThumbnail` et le chargement des fils / de la piste du jour sont des
// fonctions PRIVÉES de pages/HelloMarketing.tsx (seuls `useWeatherData` et `computeBirthdays`
// sont exportés). Elles sont reprises ici À L'IDENTIQUE, faute de pouvoir les importer : à
// remplacer par un import dès qu'elles seront exportées (voir BESOINS.md, point 2).
// =====================================================================

export interface RssArticle { title: string; link: string; source: string; pubDate: string; description: string; thumbnail: string }
export type FeedCat = 'auto' | 'marketing';

const CACHE_24H = 24 * 60 * 60 * 1000;
/** Clés de la page actuelle : les deux interfaces partagent le même cache sur un poste. */
const CACHE_KEY: Record<FeedCat, string> = { auto: 'gearbox_rss_cache', marketing: 'gearbox_rss_marketing_cache' };
const DEEZER_CACHE_KEY = 'gearbox_deezer_cache';

const readCache = <T,>(key: string): { data: T; timestamp: number } | null => {
  try { const raw = localStorage.getItem(key); if (!raw) return null; const v = JSON.parse(raw); return Date.now() - v.timestamp < CACHE_24H ? v : null; } catch { return null; }
};
const writeCache = (key: string, data: unknown, timestamp: number) => { try { localStorage.setItem(key, JSON.stringify({ data, timestamp })); } catch { /* stockage plein ou bloqué */ } };

// ---------------------------------------------------------------- RSS (copie de HelloMarketing.tsx)
const getText = (item: Element, tag: string): string => item.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
const getThumbnail = (item: Element): string => {
  const mt = item.getElementsByTagName('media:thumbnail')[0];
  if (mt?.getAttribute('url')) return mt.getAttribute('url')!;
  const mc = item.getElementsByTagName('media:content')[0];
  if (mc) {
    const t = mc.getAttribute('type') || '', m = mc.getAttribute('medium') || '';
    if (t.startsWith('image') || m === 'image') { const u = mc.getAttribute('url'); if (u) return u; }
  }
  const encs = item.getElementsByTagName('enclosure');
  for (let i = 0; i < encs.length; i++) if ((encs[i].getAttribute('type') || '').startsWith('image')) return encs[i].getAttribute('url') || '';
  const m = getText(item, 'description').match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : '';
};
const parseRss = (xml: string, source: string): RssArticle[] => {
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const items = doc.getElementsByTagName('item'), out: RssArticle[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i], title = getText(it, 'title'), link = getText(it, 'link');
      if (!title || !link) continue;
      const rawDesc = getText(it, 'description').replace(/<[^>]*>/g, '').trim();
      out.push({ title, link, source, pubDate: getText(it, 'pubDate'), description: rawDesc.slice(0, 180), thumbnail: getThumbnail(it) });
    }
    return out;
  } catch { return []; }
};

/** Couleur du badge : l'API donne une classe Tailwind (`feeds.ts`) ; la maquette veut une couleur.
 *  BESOIN: que `/api/feeds` renvoie aussi la couleur en hexadécimal (BESOINS.md, point 3). */
const TW_HEX: Record<string, string> = {
  'bg-emerald-600': '#059669', 'bg-purple-600': '#9333ea', 'bg-blue-600': '#2563eb', 'bg-red-500': '#ef4444',
  'bg-blue-500': '#3b82f6', 'bg-indigo-600': '#4f46e5', 'bg-pink-600': '#db2777', 'bg-cyan-700': '#0e7490', 'bg-slate-600': '#475569',
};
export const sourceHex = (sources: FeedInfo[], name: string) => TW_HEX[sources.find((s) => s.name === name)?.color || ''] || '#475569';
export const feedHex = (f: FeedInfo) => TW_HEX[f.color] || '#475569';

export interface FeedResult { sources: FeedInfo[]; articles: RssArticle[]; at: number }
/**
 * Un fil (auto ou marketing). La liste des sources est lue D'ABORD, même quand les articles
 * viennent du cache (elle colore les badges) ; un flux en échec est ignoré, les autres s'affichent.
 */
export async function loadFeed(cat: FeedCat, force: boolean): Promise<FeedResult> {
  let sources: FeedInfo[] = [];
  try { sources = (await db.getFeeds()).filter((f) => f.category === cat); } catch (e) { console.warn(`[RSS ${cat}] liste des sources indisponible :`, e); }
  if (!force) { const c = readCache<RssArticle[]>(CACHE_KEY[cat]); if (c) return { sources, articles: c.data, at: c.timestamp }; }
  const results = await Promise.allSettled(sources.map(async (f) => {
    try { return parseRss(await db.getFeedContent(f.key), f.name); } catch (e) { console.warn(`[RSS ${cat}] ${f.name} échoué :`, e); return []; }
  }));
  const all: RssArticle[] = [];
  results.forEach((r) => { if (r.status === 'fulfilled') all.push(...r.value); });
  all.sort((a, b) => (b.pubDate ? new Date(b.pubDate).getTime() : 0) - (a.pubDate ? new Date(a.pubDate).getTime() : 0));
  const articles = all.slice(0, 12), at = Date.now();
  writeCache(CACHE_KEY[cat], articles, at);
  return { sources, articles, at };
}

// ---------------------------------------------------------------- musique du jour (copie de MusicSection)
export interface DeezerTrack { id: number; title: string; preview: string; artist: { name: string }; album: { title: string; cover_medium: string } }
const dayOfYear = () => { const n = new Date(); return Math.floor((n.getTime() - new Date(n.getFullYear(), 0, 0).getTime()) / 864e5); };

/** Piste du jour (proxy `/api/music/tracks`, cache 24 h). Rejette avec le message à afficher. */
export async function loadTrack(force = false): Promise<DeezerTrack> {
  if (!force) { const c = readCache<DeezerTrack>(DEEZER_CACHE_KEY); if (c) return c.data; }
  let tracks: DeezerTrack[] = [];
  try { tracks = ((await db.getMusicTracks())?.data as DeezerTrack[]) || []; }
  catch (e) { console.error('[Deezer] échec :', e); throw new Error('Impossible de charger la musique du jour.'); }
  if (!tracks.length) throw new Error('Impossible de charger la musique du jour.');   // « Playlist vide. » : même message final que la page
  const picked = tracks[dayOfYear() % tracks.length];
  writeCache(DEEZER_CACHE_KEY, picked, Date.now());
  return picked;
}
