
import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles, RefreshCw, MapPin, Music, Cake, Play, Pause,
  Cloud, ExternalLink, Loader2, ArrowUpRight, CalendarDays, Cookie, Car, Lightbulb
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../services/dataService';
import Avatar from '../components/Avatar';
import { User, Project } from '../types';

// =============================================================================
// OPENWEATHER API KEY
// Pour obtenir une clé gratuite : https://openweathermap.org/ → My API Keys
// =============================================================================
const OPENWEATHER_API_KEY = '6d5fe29fdd1253aae4c3b5fe1b7f1dcc';

// Mapping noms sites Bony → noms compatibles OpenWeatherMap
const CITY_MAPPING: Record<string, string> = {
  'Clermont':        'Clermont-Ferrand',
  'Mozac':           'Clermont-Ferrand',
  'Massagettes':     'Clermont-Ferrand',
  'Vichy':           'Vichy',
  'Moulins':         'Moulins',
  'Ussel':           'Ussel',
  'Issoire':         'Issoire',
  'Brioude':         'Brioude',
  'Le Puy-en-Velay': 'Le Puy-en-Velay',
  'Mende':           'Mende',
  'Albi':            'Albi',
  'Rodez':           'Rodez',
  'Millau':          'Millau',
  'Aurillac':        'Aurillac',
  'Figeac':          'Figeac',
  'Gaillac':         'Gaillac',
  'Villefranche':    'Villefranche-de-Rouergue',
  'Carmaux':         'Carmaux',
  'Lavaur':          'Lavaur',
  'Ricoux':          'Thiers',
  'Thiers':          'Thiers',
  'Ambert':          'Ambert',
  'Alpine':          'Clermont-Ferrand',
  'Nissan':          'Clermont-Ferrand',
  'Saint-Etienne':   'Saint-Etienne',
  'Montluçon':       'Montlucon',
};

const CORSPROXY = (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`;

const RSS_FEEDS = [
  { name: "L'Argus",    url: 'https://www.largus.fr/rss/actualites.xml',     color: 'bg-red-500' },
  { name: 'Caradisiac', url: 'https://www.caradisiac.com/rss/actualites.xml', color: 'bg-blue-600' },
  { name: 'AutoPlus',   url: 'https://www.autoplus.fr/feed',                  color: 'bg-emerald-600' },
  { name: 'AutoMoto',   url: 'https://www.auto-moto.com/feed',                color: 'bg-purple-600' },
];

const SOURCE_COLOR: Record<string, string> = Object.fromEntries(
  RSS_FEEDS.map(f => [f.name, f.color])
);

const RSS_FEEDS_MARKETING = [
  { name: 'Influencia',     url: 'https://www.influencia.net/fr/rss',         color: 'bg-pink-600' },
  { name: 'BDM',            url: 'https://www.blogdumoderateur.com/feed/',     color: 'bg-blue-500' },
  { name: 'JDN',            url: 'https://www.journaldunet.com/rss/',          color: 'bg-indigo-600' },
  { name: 'Usine Digitale', url: 'https://www.usine-digitale.fr/rss',          color: 'bg-cyan-700' },
];

const SOURCE_COLOR_MARKETING: Record<string, string> = Object.fromEntries(
  RSS_FEEDS_MARKETING.map(f => [f.name, f.color])
);

const RSS_MARKETING_CACHE_KEY = 'gearbox_rss_marketing_cache';

const DEFAULT_WEATHER_CITY = 'Clermont-Ferrand';

const RSS_CACHE_KEY      = 'gearbox_rss_cache';
const DEEZER_CACHE_KEY   = 'gearbox_deezer_cache';
const USER_PREFS_KEY     = (id: string) => `gearbox_user_prefs_${id}`;
const WEATHER_CACHE_KEY  = (city: string) => `gearbox_weather_cache_${city.toLowerCase().replace(/\s+/g, '_')}`;
const FORECAST_CACHE_KEY = (city: string) => `gearbox_forecast_cache_${city.toLowerCase().replace(/\s+/g, '_')}`;

const CACHE_24H = 24 * 60 * 60 * 1000;
const CACHE_30M = 30 * 60 * 1000;

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface RssArticle {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  description: string;
  thumbnail: string;
}

interface WeatherData {
  city: string;
  temp: number;
  feelsLike: number;
  description: string;
  icon: string;
  humidity: number;
  wind: number;
  pressure: number;
}

interface ForecastDay {
  day: string;
  icon: string;
  tempMax: number;
  tempMin: number;
}

interface DeezerTrack {
  id: number;
  title: string;
  preview: string;
  artist: { name: string };
  album: { title: string; cover_medium: string };
}

interface BirthdayEntry {
  user: User;
  daysUntil: number;
  age: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getDayOfYear = (): number => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
};

/** Gradient de fond selon l'icône météo OWM */
const getWeatherBg = (icon: string): string => {
  const code = icon.slice(0, 2);
  switch (code) {
    case '01': return 'from-sky-400 to-blue-500';
    case '02': return 'from-sky-300 to-blue-400';
    case '03': return 'from-slate-400 to-blue-300';
    case '04': return 'from-slate-500 to-slate-600';
    case '09': return 'from-blue-500 to-slate-600';
    case '10': return 'from-blue-700 to-slate-700';
    case '11': return 'from-slate-700 to-purple-800';
    case '13': return 'from-sky-200 to-slate-300';
    case '50': return 'from-slate-400 to-slate-500';
    default:   return 'from-blue-500 to-blue-600';
  }
};

const getText = (item: Element, tag: string): string =>
  item.getElementsByTagName(tag)[0]?.textContent?.trim() || '';

const getThumbnail = (item: Element): string => {
  const mt = item.getElementsByTagName('media:thumbnail')[0];
  if (mt?.getAttribute('url')) return mt.getAttribute('url')!;

  const mc = item.getElementsByTagName('media:content')[0];
  if (mc) {
    const t = mc.getAttribute('type') || '';
    const m = mc.getAttribute('medium') || '';
    if (t.startsWith('image') || m === 'image') {
      const u = mc.getAttribute('url');
      if (u) return u;
    }
  }

  const encs = item.getElementsByTagName('enclosure');
  for (let i = 0; i < encs.length; i++) {
    if ((encs[i].getAttribute('type') || '').startsWith('image'))
      return encs[i].getAttribute('url') || '';
  }

  const desc = getText(item, 'description');
  const m = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : '';
};

const parseRss = (xml: string, source: string): RssArticle[] => {
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const items = doc.getElementsByTagName('item');
    const out: RssArticle[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const title = getText(it, 'title');
      const link  = getText(it, 'link');
      if (!title || !link) continue;
      const rawDesc = getText(it, 'description').replace(/<[^>]*>/g, '').trim();
      out.push({ title, link, source, pubDate: getText(it, 'pubDate'), description: rawDesc.slice(0, 180), thumbnail: getThumbnail(it) });
    }
    return out;
  } catch { return []; }
};

const relativeDate = (dateStr: string): string => {
  if (!dateStr) return '';
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)  return "à l'instant";
    if (mins < 60) return `il y a ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `il y a ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'hier';
    if (days < 7)   return `il y a ${days}j`;
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  } catch { return ''; }
};

const fmtTime = (s: number): string => {
  if (!s || isNaN(s)) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

const capitalizeFirst = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

const Spinner: React.FC<{ label?: string; small?: boolean }> = ({ label, small }) => (
  <div className={`flex items-center justify-center gap-3 text-slate-400 ${small ? 'py-4' : 'py-10'}`}>
    <Loader2 size={small ? 15 : 18} className="animate-spin" />
    {label && <span className="text-sm">{label}</span>}
  </div>
);

// ─── 1. Newsletter RSS ────────────────────────────────────────────────────────

const NewsSection: React.FC = () => {
  const [articles,  setArticles]  = useState<RssArticle[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [lastFetch, setLastFetch] = useState('');

  const load = async (force = false) => {
    setLoading(true);
    try {
      if (!force) {
        const cached = localStorage.getItem(RSS_CACHE_KEY);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_24H) {
            setArticles(data);
            setLastFetch(new Date(timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
            setLoading(false);
            return;
          }
        }
      }

      const fetchFeed = async (feed: typeof RSS_FEEDS[0]): Promise<RssArticle[]> => {
        try {
          const res = await fetch(CORSPROXY(feed.url));
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const xml = await res.text();
          const parsed = parseRss(xml, feed.name);
          console.log(`[RSS] ${feed.name} : ${parsed.length} articles`);
          return parsed;
        } catch (e) {
          console.warn(`[RSS] ${feed.name} échoué :`, e);
          return [];
        }
      };

      const results = await Promise.allSettled(RSS_FEEDS.map(fetchFeed));
      const all: RssArticle[] = [];
      results.forEach(r => { if (r.status === 'fulfilled') all.push(...r.value); });
      all.sort((a, b) => {
        const ta = a.pubDate ? new Date(a.pubDate).getTime() : 0;
        const tb = b.pubDate ? new Date(b.pubDate).getTime() : 0;
        return tb - ta;
      });

      const top12 = all.slice(0, 12);
      const now = Date.now();
      localStorage.setItem(RSS_CACHE_KEY, JSON.stringify({ data: top12, timestamp: now }));
      setArticles(top12);
      setLastFetch(new Date(now).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    localStorage.removeItem(RSS_CACHE_KEY);
    load();
  }, []);

  return (
    <div className="gx-card p-0 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-bony-border shrink-0">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
            <Car size={14} className="text-bony-orange" /> Actu Auto
          </h3>
          {lastFetch && <p className="text-[10px] text-slate-400 mt-0.5">Mis à jour à {lastFetch}</p>}
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="p-1.5 rounded-lg text-slate-400 hover:text-bony-orange hover:bg-slate-100 dark:hover:bg-white/5 transition disabled:opacity-40"
          title="Rafraîchir"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <Spinner label="Chargement des flux RSS..." />
      ) : articles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
          <Cloud size={36} strokeWidth={1} />
          <p className="text-sm">Aucun article disponible.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((art, i) => (
            <a
              key={i}
              href={art.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col border-b border-r border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-all duration-200"
            >
              {/* Thumbnail */}
              <div className="relative overflow-hidden" style={{ height: 140 }}>
                {art.thumbnail ? (
                  <img
                    src={art.thumbnail}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    onError={e => {
                      const el = e.target as HTMLImageElement;
                      el.parentElement!.style.background = 'linear-gradient(135deg,#f9731640,#8b5cf640)';
                      el.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-bony-orange/20 to-bony-violet/20 flex items-center justify-center text-3xl font-bold text-bony-orange/30">
                    {art.source.charAt(0)}
                  </div>
                )}
                <span className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-bold text-white tracking-wider ${SOURCE_COLOR[art.source] || 'bg-slate-600'}`}>
                  {art.source.toUpperCase()}
                </span>
              </div>

              {/* Body */}
              <div className="flex flex-col flex-1 p-3 gap-1.5">
                <p className="text-[13px] font-semibold text-slate-900 dark:text-white leading-snug line-clamp-2 group-hover:text-bony-orange transition-colors">
                  {art.title}
                </p>
                {art.description && (
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed flex-1">
                    {art.description}
                  </p>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-white/5 mt-auto">
                  <span className="text-[9px] text-slate-400">{relativeDate(art.pubDate)}</span>
                  <span className="text-[9px] font-semibold text-bony-orange flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    Voir <ArrowUpRight size={9} />
                  </span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── 1b. Newsletter Marketing & Tech ─────────────────────────────────────────

const MarketingNewsSection: React.FC = () => {
  const [articles,  setArticles]  = useState<RssArticle[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [lastFetch, setLastFetch] = useState('');

  const load = async (force = false) => {
    setLoading(true);
    try {
      if (!force) {
        const cached = localStorage.getItem(RSS_MARKETING_CACHE_KEY);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_24H) {
            setArticles(data);
            setLastFetch(new Date(timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
            setLoading(false);
            return;
          }
        }
      }

      const fetchFeed = async (feed: typeof RSS_FEEDS_MARKETING[0]): Promise<RssArticle[]> => {
        try {
          const res = await fetch(CORSPROXY(feed.url));
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const xml = await res.text();
          const parsed = parseRss(xml, feed.name);
          console.log(`[RSS Marketing] ${feed.name} : ${parsed.length} articles`);
          return parsed;
        } catch (e) {
          console.warn(`[RSS Marketing] ${feed.name} échoué :`, e);
          return [];
        }
      };

      const results = await Promise.allSettled(RSS_FEEDS_MARKETING.map(fetchFeed));
      const all: RssArticle[] = [];
      results.forEach(r => { if (r.status === 'fulfilled') all.push(...r.value); });
      all.sort((a, b) => {
        const ta = a.pubDate ? new Date(a.pubDate).getTime() : 0;
        const tb = b.pubDate ? new Date(b.pubDate).getTime() : 0;
        return tb - ta;
      });

      const top12 = all.slice(0, 12);
      const now = Date.now();
      localStorage.setItem(RSS_MARKETING_CACHE_KEY, JSON.stringify({ data: top12, timestamp: now }));
      setArticles(top12);
      setLastFetch(new Date(now).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="gx-card p-0 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-bony-border shrink-0">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
            <Lightbulb size={14} className="text-bony-violet" /> Marketing & Tech
          </h3>
          {lastFetch && <p className="text-[10px] text-slate-400 mt-0.5">Mis à jour à {lastFetch}</p>}
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="p-1.5 rounded-lg text-slate-400 hover:text-bony-violet hover:bg-slate-100 dark:hover:bg-white/5 transition disabled:opacity-40"
          title="Rafraîchir"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <Spinner label="Chargement des flux RSS..." />
      ) : articles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
          <Cloud size={36} strokeWidth={1} />
          <p className="text-sm">Aucun article disponible.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((art, i) => (
            <a
              key={i}
              href={art.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col border-b border-r border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-all duration-200"
            >
              {/* Thumbnail */}
              <div className="relative overflow-hidden" style={{ height: 140 }}>
                {art.thumbnail ? (
                  <img
                    src={art.thumbnail}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    onError={e => {
                      const el = e.target as HTMLImageElement;
                      el.parentElement!.style.background = 'linear-gradient(135deg,#7c3aed40,#0ea5e940)';
                      el.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-bony-violet/20 to-bony-blue/20 flex items-center justify-center text-3xl font-bold text-bony-violet/30">
                    {art.source.charAt(0)}
                  </div>
                )}
                <span className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-bold text-white tracking-wider ${SOURCE_COLOR_MARKETING[art.source] || 'bg-slate-600'}`}>
                  {art.source.toUpperCase()}
                </span>
              </div>

              {/* Body */}
              <div className="flex flex-col flex-1 p-3 gap-1.5">
                <p className="text-[13px] font-semibold text-slate-900 dark:text-white leading-snug line-clamp-2 group-hover:text-bony-violet transition-colors">
                  {art.title}
                </p>
                {art.description && (
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed flex-1">
                    {art.description}
                  </p>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-white/5 mt-auto">
                  <span className="text-[9px] text-slate-400">{relativeDate(art.pubDate)}</span>
                  <span className="text-[9px] font-semibold text-bony-violet flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    Voir <ArrowUpRight size={9} />
                  </span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── 2. Météo — hook + deux composants d'affichage ───────────────────────────

const useWeatherData = (userId: string) => {
  const [current,  setCurrent]  = useState<WeatherData | null>(null);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [city,     setCity]     = useState('');
  const cityRef = useRef('');

  const load = async (rawCity: string, force = false) => {
    setLoading(true);
    setError('');
    const mapped = CITY_MAPPING[rawCity] || rawCity;

    try {
      // ── Météo actuelle ──
      let wd: WeatherData | null = null;
      if (!force) {
        const cached = localStorage.getItem(WEATHER_CACHE_KEY(mapped));
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_30M) wd = data;
        }
      }
      if (!wd) {
        const res = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(mapped)}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=fr`
        );
        if (!res.ok) throw new Error(`Météo indisponible (${res.status}) — ${mapped}`);
        const d = await res.json();
        wd = {
          city:        d.name,
          temp:        Math.round(d.main.temp),
          feelsLike:   Math.round(d.main.feels_like),
          description: d.weather[0]?.description || '',
          icon:        d.weather[0]?.icon || '01d',
          humidity:    d.main.humidity,
          wind:        Math.round((d.wind.speed ?? 0) * 3.6),
          pressure:    d.main.pressure ?? 0,
        };
        localStorage.setItem(WEATHER_CACHE_KEY(mapped), JSON.stringify({ data: wd, timestamp: Date.now() }));
      }
      setCurrent(wd);

      // ── Prévisions 5 jours ──
      let days: ForecastDay[] = [];
      if (!force) {
        const cached = localStorage.getItem(FORECAST_CACHE_KEY(mapped));
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_30M) days = data;
        }
      }
      if (days.length === 0) {
        const res = await fetch(
          `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(mapped)}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=fr&cnt=40`
        );
        if (res.ok) {
          const d = await res.json();
          const list: any[] = d.list || [];
          const byDay: Record<string, any[]> = {};
          list.forEach(item => {
            const key = item.dt_txt.slice(0, 10);
            if (!byDay[key]) byDay[key] = [];
            byDay[key].push(item);
          });
          const todayKey = new Date().toISOString().slice(0, 10);
          days = Object.entries(byDay)
            .filter(([k]) => k > todayKey)
            .slice(0, 5)
            .map(([date, items]) => {
              const noon = items.find(i => i.dt_txt.includes('12:00:00')) || items[Math.floor(items.length / 2)];
              return {
                day:     capitalizeFirst(new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short' })).replace('.', ''),
                icon:    noon.weather[0]?.icon || '01d',
                tempMax: Math.round(Math.max(...items.map((i: any) => i.main.temp_max))),
                tempMin: Math.round(Math.min(...items.map((i: any) => i.main.temp_min))),
              };
            });
          localStorage.setItem(FORECAST_CACHE_KEY(mapped), JSON.stringify({ data: days, timestamp: Date.now() }));
        }
      }
      setForecast(days);
    } catch (e: any) {
      setError(e.message || 'Erreur météo.');
    }
    setLoading(false);
  };

  useEffect(() => {
    const prefs = localStorage.getItem(USER_PREFS_KEY(userId));
    const c = prefs ? (JSON.parse(prefs).city || '') : '';
    const effective = c || DEFAULT_WEATHER_CITY;
    setCity(effective);
    cityRef.current = effective;
    load(effective);
  }, [userId]);

  return { current, forecast, loading, error, city, refresh: () => load(cityRef.current, true) };
};

// ── Météo du jour (card compacte, contenu centré) ─────────────────────────────

const WeatherTodayCard: React.FC<{
  current: WeatherData;
  onRefresh: () => void;
}> = ({ current, onRefresh }) => {
  const bg = getWeatherBg(current.icon);
  const todayLabel = capitalizeFirst(
    new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  );
  return (
    <div className={`relative rounded-2xl overflow-hidden shadow-lg bg-gradient-to-br ${bg} text-white h-full flex flex-col`}>
      <button
        onClick={onRefresh}
        className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition text-white"
        title="Rafraîchir"
      >
        <RefreshCw size={13} />
      </button>
      <div className="p-5 flex flex-col flex-1 justify-center gap-3">
        {/* Ville + date */}
        <div className="flex items-center gap-1.5">
          <MapPin size={12} className="opacity-80 shrink-0" />
          <span className="text-sm font-bold opacity-90 truncate">{current.city}</span>
          <span className="text-[10px] opacity-60 ml-1 shrink-0">· {todayLabel}</span>
        </div>
        {/* Température + icône */}
        <div className="flex items-center gap-3">
          <div className="text-[36px] font-bold leading-none drop-shadow-sm">{current.temp}°</div>
          {current.icon && (
            <img
              src={`https://openweathermap.org/img/wn/${current.icon}@2x.png`}
              alt={current.description}
              className="w-16 h-16 drop-shadow-md"
            />
          )}
        </div>
        {/* Description + ressenti */}
        <div>
          <p className="text-sm font-medium capitalize opacity-90">{current.description}</p>
          <p className="text-[11px] opacity-70 mt-0.5">Ressenti {current.feelsLike}°</p>
        </div>
      </div>
    </div>
  );
};

// ── Prévisions 5 jours (colonne verticale) ────────────────────────────────────

const WeatherForecastCard: React.FC<{ forecast: ForecastDay[] }> = ({ forecast }) => {
  if (forecast.length === 0) return null;
  return (
    <div className="gx-card p-0 overflow-hidden h-full flex flex-col">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-bony-border shrink-0">
        <h3 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
          <Cloud size={13} className="text-sky-500" /> Prévisions 5 jours
        </h3>
      </div>
      <div className="flex flex-col divide-y divide-slate-100 dark:divide-white/5 flex-1">
        {forecast.map((day, i) => (
          <div key={i} className="flex items-center justify-between px-4 flex-1 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-10 shrink-0">{day.day}</span>
            <div className="flex-1 flex justify-center">
              <img src={`https://openweathermap.org/img/wn/${day.icon}.png`} alt="" className="w-9 h-9" />
            </div>
            <div className="flex items-baseline gap-2 shrink-0">
              <span className="text-sm font-bold text-slate-900 dark:text-white">{day.tempMax}°</span>
              <span className="text-xs text-slate-400">{day.tempMin}°</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── 3. Musique du jour ───────────────────────────────────────────────────────

const MusicSection: React.FC = () => {
  const [track,    setTrack]    = useState<DeezerTrack | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [playing,  setPlaying]  = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(30);
  const audioRef = useRef<HTMLAudioElement>(null);

  const load = async (force = false) => {
    setLoading(true);
    setError('');
    try {
      if (!force) {
        const cached = localStorage.getItem(DEEZER_CACHE_KEY);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_24H) { setTrack(data); setLoading(false); return; }
        }
      }

      const DEEZER_URL = 'https://api.deezer.com/playlist/15169024043/tracks?limit=100';
      let tracks: DeezerTrack[] = [];
      try {
        console.log('[Deezer] Tentative via corsproxy.io...');
        const res = await fetch(CORSPROXY(DEEZER_URL));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        tracks = data?.data || [];
        console.log('[Deezer] OK, pistes :', tracks.length);
      } catch (e1) {
        console.warn('[Deezer] corsproxy.io échoué :', e1, '— tentative directe...');
        try {
          const res = await fetch(DEEZER_URL);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          tracks = data?.data || [];
        } catch (e2) {
          console.error('[Deezer] Tous les essais ont échoué :', e2);
          throw new Error("Impossible de joindre l'API Deezer.");
        }
      }

      if (tracks.length === 0) throw new Error('Playlist vide.');
      const picked = tracks[getDayOfYear() % tracks.length];
      console.log('[Deezer] Piste du jour :', picked.title, '—', picked.artist.name);
      localStorage.setItem(DEEZER_CACHE_KEY, JSON.stringify({ data: picked, timestamp: Date.now() }));
      setTrack(picked);
    } catch (err) {
      console.error('[Deezer] Erreur finale :', err);
      setError('Impossible de charger la musique du jour.');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else         { a.play(); setPlaying(true); }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Number(e.target.value);
    setProgress(Number(e.target.value));
  };

  const pct = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <div className="gx-card p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-bony-border">
        <h3 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
          <Music size={13} className="text-purple-500" /> Musique du Jour
        </h3>
      </div>
      <div className="p-4">
        {loading ? <Spinner small /> : error ? (
          <p className="text-xs text-red-500 font-bold text-center py-2">{error}</p>
        ) : track ? (
          <div className="flex items-start gap-3">
            <img src={track.album.cover_medium} alt={track.album.title} className="w-[72px] h-[72px] rounded-xl object-cover shrink-0 shadow-md" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-900 dark:text-white text-xs truncate">{track.title}</p>
              <p className="text-[10px] text-slate-400 truncate mt-0.5">{track.artist.name}</p>
              {track.preview ? (
                <div className="mt-2.5">
                  <div className="relative mb-2">
                    <div className="h-1 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full bg-bony-gradient" style={{ width: `${pct}%` }} />
                    </div>
                    <input type="range" min={0} max={duration} step={0.1} value={progress} onChange={handleSeek}
                      className="absolute inset-0 w-full opacity-0 cursor-pointer" />
                  </div>
                  <div className="flex items-center gap-2.5">
                    <button onClick={togglePlay}
                      className="w-7 h-7 rounded-full bg-bony-gradient flex items-center justify-center text-white shadow hover:opacity-90 transition shrink-0">
                      {playing ? <Pause size={11} /> : <Play size={11} className="ml-0.5" />}
                    </button>
                    <div className="flex justify-between flex-1 text-[9px] text-slate-400">
                      <span>{fmtTime(progress)}</span>
                      <span>{fmtTime(duration)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-[9px] text-slate-400 mt-1.5">Aperçu non disponible.</p>
              )}
            </div>
            {track.preview && (
              <audio ref={audioRef} src={track.preview}
                onTimeUpdate={() => { const a = audioRef.current; if (a) setProgress(a.currentTime); }}
                onLoadedMetadata={() => { const a = audioRef.current; if (a && a.duration) setDuration(a.duration); }}
                onEnded={() => setPlaying(false)} />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

// ─── 4. Anniversaires ─────────────────────────────────────────────────────────

const BirthdaysSection: React.FC = () => {
  const [entries, setEntries] = useState<BirthdayEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const users = await db.getUsers();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const result: BirthdayEntry[] = [];
      for (const u of users) {
        const raw = localStorage.getItem(USER_PREFS_KEY(u.id));
        const birthdate = raw ? (JSON.parse(raw).birthdate || '') : '';
        if (!birthdate) continue;
        const bday = new Date(birthdate);
        const next = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
        if (next < today) next.setFullYear(today.getFullYear() + 1);
        const daysUntil = Math.ceil((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        result.push({ user: u, daysUntil, age: next.getFullYear() - bday.getFullYear() });
      }

      result.sort((a, b) => a.daysUntil - b.daysUntil);
      setEntries(result);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="gx-card p-0 overflow-hidden h-48 flex flex-col">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-bony-border shrink-0">
        <h3 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
          <Cake size={13} className="text-pink-500" /> Anniversaires
        </h3>
      </div>
      <div className="p-3 overflow-hidden flex-1 flex items-center">
        {loading ? <Spinner small /> : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center w-full gap-1.5 text-slate-400">
            <Cake size={20} strokeWidth={1} />
            <p className="text-[10px]">Aucun anniversaire renseigné.</p>
          </div>
        ) : (
          <div className="flex flex-row gap-3 overflow-x-auto w-full pb-1 custom-scrollbar">
            {entries.map(({ user, daysUntil, age }) => (
              <div key={user.id} className="flex flex-col items-center gap-1 min-w-[72px] shrink-0">
                {/* Avatar avec badge si aujourd'hui */}
                <div className="relative">
                  <Avatar userId={user.id} name={user.name} color={user.avatarColor} size={36} />
                  {daysUntil === 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-pink-500 rounded-full flex items-center justify-center shadow">
                      <Cake size={8} className="text-white" />
                    </span>
                  )}
                </div>
                {/* Prénom seulement */}
                <p className="text-[10px] font-semibold text-slate-900 dark:text-white text-center truncate w-full leading-tight">
                  {user.name.split(' ')[0]}
                </p>
                <p className="text-[9px] text-slate-400 leading-none">{age} ans</p>
                {daysUntil === 0 ? (
                  <span className="text-[8px] font-bold text-pink-500 animate-pulse">Auj. !</span>
                ) : (
                  <span className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">
                    {daysUntil === 1 ? 'demain' : `dans ${daysUntil}j`}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── 5. Prochain événement ────────────────────────────────────────────────────

const EVENT_PROJECT_TYPES = ['Expo/Salon', 'Animation Co', 'OP Clients', 'Collaborateurs'];

const EVENT_TYPE_COLORS: Record<string, string> = {
  'Expo/Salon':    'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  'Animation Co':  'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  'OP Clients':    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  'Collaborateurs':'bg-purple-500/10 text-purple-600 dark:text-purple-400',
};

const NextEventSection: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [, setTick] = useState(0); // force re-render pour compteur live

  const computeDays = (startDate: string): number => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    return Math.ceil((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  useEffect(() => {
    (async () => {
      const all = await db.getProjects();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const upcoming = all
        .filter(p => {
          const start = new Date(p.startDate);
          start.setHours(0, 0, 0, 0);
          return (
            (p.status === 'Active' || p.status === 'Draft') &&
            EVENT_PROJECT_TYPES.includes(p.projectType) &&
            start.getTime() >= today.getTime()
          );
        })
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
        .slice(0, 3);

      setProjects(upcoming);
      setLoading(false);
    })();
  }, []);

  // Rafraîchit le compteur chaque minute
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="gx-card p-0 overflow-hidden h-full flex flex-col">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-bony-border shrink-0">
        <h3 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
          <CalendarDays size={13} className="text-bony-orange" /> Prochains Événements
        </h3>
      </div>
      <div className="flex flex-col divide-y divide-slate-100 dark:divide-white/5 flex-1">
        {loading ? (
          <div className="p-3"><Spinner small /></div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-2 text-slate-400 p-4">
            <CalendarDays size={22} strokeWidth={1} />
            <p className="text-[10px] text-center leading-relaxed">
              Aucun événement à venir.<br />
              <span className="opacity-70">Créez un projet pour commencer.</span>
            </p>
          </div>
        ) : (
          projects.map(project => {
            const days = computeDays(project.startDate);
            return (
              <div key={project.id} className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition flex-1">
                {/* Compteur J- */}
                <div className="shrink-0 w-9 text-center pt-0.5">
                  <div className="text-sm font-bold text-bony-orange leading-none">
                    {days === 0 ? 'Auj.' : `J-${days}`}
                  </div>
                  {days > 0 && <div className="text-[8px] text-slate-400 mt-0.5">jours</div>}
                </div>
                {/* Infos */}
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-slate-900 dark:text-white leading-snug truncate">{project.name}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-bold ${EVENT_TYPE_COLORS[project.projectType] || 'bg-slate-100 dark:bg-white/10 text-slate-600'}`}>
                      {project.projectType}
                    </span>
                    <span className="text-[9px] text-slate-400 flex items-center gap-0.5">
                      <MapPin size={8} className="shrink-0" />{project.site}
                    </span>
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1">
                    {capitalizeFirst(new Date(project.startDate + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }))}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

// ─── 6. Viennoiseries de la semaine ──────────────────────────────────────────

const VIENNOISERIES_ROLES = ['Master', 'Administrator', 'Coordinator', 'Digital Manager'];

const ACCROCHE_LIST = [
  "Et c'est...",
  'Le grand gagnant est...',
  'Roulement de tambour...',
  'Cette semaine le bonheur c\'est...',
];

const BADGE_LIST = [
  'Champion du croissant 🏆',
  'Roi de la brioche 👑',
  'Maître des pains au chocolat 🎖️',
  'Légende du bureau 🌟',
];

/** Numéro de semaine ISO 8601 */
const getWeekNumber = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

const nextMondayLabel = (): string => {
  const d = new Date();
  const day = d.getDay();
  const daysUntil = day === 1 ? 7 : (8 - day) % 7;
  d.setDate(d.getDate() + daysUntil);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
};

const ViennoiseriesSection: React.FC = () => {
  const [designated,   setDesignated]   = useState<User | null>(null);
  const [history,      setHistory]      = useState<{ label: string; user: User }[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [showHistory,  setShowHistory]  = useState(false);
  const [bouncing,     setBouncing]     = useState(false);
  const [weekNumber,   setWeekNumber]   = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const users = await db.getUsers();
      const eligible = users.filter(u => VIENNOISERIES_ROLES.includes(u.role));
      if (eligible.length === 0) { setLoading(false); return; }

      const pick = (week: number, year: number): User => {
        const seed = year * 100 + week;
        return eligible[((seed % eligible.length) + eligible.length) % eligible.length];
      };

      const now = new Date();
      const currentWeek = getWeekNumber(now);
      const year = now.getFullYear();
      setWeekNumber(currentWeek);
      setDesignated(pick(currentWeek, year));

      // 4 semaines précédentes
      const hist: { label: string; user: User }[] = [];
      for (let i = 1; i <= 4; i++) {
        let w = currentWeek - i;
        let y = year;
        if (w <= 0) { w += 52; y -= 1; }
        hist.push({ label: `S${w}`, user: pick(w, y) });
      }
      setHistory(hist);
      setLoading(false);
    })();
  }, []);

  // Bounce à l'apparition
  useEffect(() => {
    if (!designated) return;
    setBouncing(true);
    const t = setTimeout(() => setBouncing(false), 1000);
    return () => clearTimeout(t);
  }, [designated]);

  // Ferme le dropdown au clic extérieur
  useEffect(() => {
    if (!showHistory) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setShowHistory(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showHistory]);

  const accroche = ACCROCHE_LIST[weekNumber % ACCROCHE_LIST.length];
  const badge    = BADGE_LIST[weekNumber % BADGE_LIST.length];

  return (
    <div className="relative rounded-2xl overflow-hidden shadow-sm flex flex-col flex-1 border border-orange-200/60 dark:border-orange-500/20 bg-gradient-to-br from-orange-50 to-white dark:from-orange-500/10 dark:to-bony-panel">
      {loading ? (
        <div className="flex items-center justify-center flex-1 p-8"><Spinner /></div>
      ) : !designated ? (
        <div className="flex items-center justify-center flex-1 p-8 text-slate-400">
          <p className="text-[10px]">Aucun utilisateur éligible.</p>
        </div>
      ) : (
        <div className="flex flex-col flex-1 p-5">

          {/* Bannière titre */}
          <div className="flex flex-col items-center text-center mb-5">
            <span className="text-[48px] leading-none mb-2 drop-shadow-sm">🥐</span>
            <h3 className="font-title font-bold text-slate-900 dark:text-white text-sm leading-tight tracking-wide">
              Viennoiseries de la semaine
            </h3>
            <p className="text-[10px] text-slate-400 mt-1.5 italic">{accroche}</p>
          </div>

          {/* Zone principale */}
          <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center">
            {/* Spotlight + avatar */}
            <div className="relative flex items-center justify-center">
              <div className="absolute w-36 h-36 rounded-full bg-orange-400/15 dark:bg-orange-400/20 blur-md" />
              <div className="absolute w-28 h-28 rounded-full bg-orange-400/10 dark:bg-orange-400/15" />
              <div className={`relative z-10 ${bouncing ? 'animate-bounce' : ''}`}>
                <Avatar userId={designated.id} name={designated.name} color={designated.avatarColor} size={96} />
              </div>
            </div>

            {/* Nom + rôle + badge */}
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-xl font-bold text-slate-900 dark:text-white leading-tight">{designated.name}</p>
              <p className="text-xs font-semibold text-bony-orange">{designated.role}</p>
              <span className="mt-1 px-3 py-1 rounded-full bg-amber-500/10 dark:bg-amber-400/15 text-amber-700 dark:text-amber-300 text-[11px] font-bold border border-amber-200/50 dark:border-amber-400/20">
                {badge}
              </span>
            </div>
          </div>

          {/* Pied de card */}
          <div className="mt-4 pt-3 border-t border-black/5 dark:border-white/10 flex items-center justify-between gap-2">
            <p className="text-[9px] text-slate-400 leading-tight">
              Semaine {weekNumber} · Change le {nextMondayLabel()}
            </p>
            <div className="relative shrink-0" ref={dropdownRef}>
              <button
                onClick={() => setShowHistory(v => !v)}
                className="text-[10px] text-slate-400 hover:text-bony-orange transition font-medium whitespace-nowrap"
              >
                4 sem. précédentes
              </button>
              {showHistory && (
                <div className="absolute bottom-full right-0 mb-2 w-52 glass-menu rounded-xl p-2 z-20">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1.5">Historique</p>
                  {history.map(({ label, user }) => (
                    <div key={label} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 transition">
                      <Avatar userId={user.id} name={user.name} color={user.avatarColor} size={22} />
                      <span className="text-[11px] text-slate-800 dark:text-slate-200 flex-1 truncate">{user.name}</span>
                      <span className="text-[9px] text-slate-400 shrink-0 font-semibold">{label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

// ─── Page principale ──────────────────────────────────────────────────────────

const WeatherSkeleton: React.FC = () => (
  <div className="gx-card">
    <Spinner label="Chargement météo..." />
  </div>
);

const HelloMarketing: React.FC = () => {
  const { user } = useAuth();
  if (!user) return null;

  const weather = useWeatherData(user.id);

  const today = capitalizeFirst(
    new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  );

  return (
    <div className="h-screen overflow-y-auto custom-scrollbar pb-20">
      {/* Header */}
      <div className="px-5 md:px-8 pt-6 pb-5 border-b border-slate-200 dark:border-bony-border bg-white dark:bg-bony-panel">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-title text-slate-900 dark:text-white flex items-center gap-2.5">
            <Sparkles size={28} className="text-bony-orange" />
            Hello Marketing
          </h2>
          <p className="text-xs text-slate-400 mt-1">{today}</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-5 space-y-5">

        {/* ── Zone haute (hero) — grille 2×2 ────────────────────────────────
              • Mobile  : 1 colonne, tout empilé
              • ≥ md    : 2 colonnes, 2 lignes
              items-stretch : cards de même hauteur par ligne
        */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">

          {/* Haut gauche — Météo du jour (compacte) */}
          <div className="flex flex-col">
            {weather.loading ? <WeatherSkeleton /> : weather.error || !weather.current ? (
              <div className="gx-card p-5 h-full">
                <p className="text-xs text-red-500 font-bold text-center">{weather.error || 'Données météo indisponibles.'}</p>
              </div>
            ) : (
              <WeatherTodayCard current={weather.current} onRefresh={weather.refresh} />
            )}
          </div>

          {/* Haut droite — Prévisions 5 jours */}
          <div className="flex flex-col">
            {weather.loading ? <WeatherSkeleton /> : (
              <WeatherForecastCard forecast={weather.forecast} />
            )}
          </div>

          {/* Bas gauche — Musique du jour + Viennoiseries de la semaine */}
          <div className="flex flex-col gap-4 h-full">
            <div className="h-40 shrink-0">
              <MusicSection />
            </div>
            <ViennoiseriesSection />
          </div>

          {/* Bas droite — Anniversaires + Prochains événements */}
          <div className="flex flex-col gap-3 h-full">
            <BirthdaysSection />
            <NextEventSection />
          </div>

        </div>

        {/* ── Zone basse — Newsletters en deux colonnes ──────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <NewsSection />
          <MarketingNewsSection />
        </div>

      </div>
    </div>
  );
};

export default HelloMarketing;
