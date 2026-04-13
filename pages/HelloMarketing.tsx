
import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles, RefreshCw, MapPin, Music, Cake, Play, Pause,
  Droplets, Wind, Cloud, ExternalLink, Loader2, ArrowUpRight, Gauge
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../services/dataService';
import Avatar from '../components/Avatar';
import { User } from '../types';

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
    <div className="bg-white dark:bg-bony-panel border border-slate-200 dark:border-bony-border rounded-2xl overflow-hidden shadow-sm dark:shadow-xl flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-bony-border shrink-0">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
            <ExternalLink size={14} className="text-bony-orange" /> Actu Auto du Jour
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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
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

// ── Météo du jour (grande card dégradée) ──────────────────────────────────────

const WeatherTodayCard: React.FC<{
  current: WeatherData;
  onRefresh: () => void;
}> = ({ current, onRefresh }) => {
  const bg = getWeatherBg(current.icon);
  const todayLabel = capitalizeFirst(
    new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  );
  return (
    <div className={`relative rounded-2xl overflow-hidden shadow-lg bg-gradient-to-br ${bg} text-white`}>
      <button
        onClick={onRefresh}
        className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition text-white"
        title="Rafraîchir"
      >
        <RefreshCw size={13} />
      </button>
      <div className="p-5">
        <div className="flex items-center gap-1.5 mb-3">
          <MapPin size={12} className="opacity-80" />
          <span className="text-sm font-bold opacity-90">{current.city}</span>
          <span className="text-[10px] opacity-60 ml-1">· {todayLabel}</span>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <div className="text-[64px] font-bold leading-none drop-shadow-sm">{current.temp}°</div>
          {current.icon && (
            <img
              src={`https://openweathermap.org/img/wn/${current.icon}@2x.png`}
              alt={current.description}
              className="w-20 h-20 drop-shadow-md"
            />
          )}
        </div>
        <p className="text-sm font-medium capitalize opacity-90 mb-1">{current.description}</p>
        <p className="text-[11px] opacity-70">Ressenti {current.feelsLike}°</p>
        <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/20">
          <div className="flex items-center gap-1.5 text-xs opacity-80">
            <Droplets size={12} />
            <span>{current.humidity}%</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs opacity-80">
            <Wind size={12} />
            <span>{current.wind} km/h</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs opacity-80">
            <Gauge size={12} />
            <span>{current.pressure} hPa</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Prévisions 5 jours (colonne verticale) ────────────────────────────────────

const WeatherForecastCard: React.FC<{ forecast: ForecastDay[] }> = ({ forecast }) => {
  if (forecast.length === 0) return null;
  return (
    <div className="bg-white dark:bg-bony-panel border border-slate-200 dark:border-bony-border rounded-2xl shadow-sm overflow-hidden h-full">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-bony-border">
        <h3 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
          <Cloud size={13} className="text-sky-500" /> Prévisions 5 jours
        </h3>
      </div>
      <div className="flex flex-col divide-y divide-slate-100 dark:divide-white/5">
        {forecast.map((day, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-10 shrink-0">{day.day}</span>
            <img src={`https://openweathermap.org/img/wn/${day.icon}.png`} alt="" className="w-9 h-9 shrink-0" />
            <div className="flex items-baseline gap-2 ml-auto">
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
    <div className="bg-white dark:bg-bony-panel border border-slate-200 dark:border-bony-border rounded-2xl overflow-hidden shadow-sm">
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
        const daysUntil = Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        result.push({ user: u, daysUntil, age: next.getFullYear() - bday.getFullYear() });
      }

      result.sort((a, b) => a.daysUntil - b.daysUntil);
      setEntries(result.slice(0, 5));
      setLoading(false);
    })();
  }, []);

  return (
    <div className="bg-white dark:bg-bony-panel border border-slate-200 dark:border-bony-border rounded-2xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-bony-border">
        <h3 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
          <Cake size={13} className="text-pink-500" /> Anniversaires
        </h3>
      </div>
      <div className="p-3">
        {loading ? <Spinner small /> : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-4 gap-1.5 text-slate-400">
            <Cake size={20} strokeWidth={1} />
            <p className="text-[10px]">Aucun anniversaire renseigné.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {entries.map(({ user, daysUntil, age }) => (
              <div key={user.id}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition ${
                  daysUntil === 0
                    ? 'bg-pink-50 dark:bg-pink-500/10 border border-pink-200 dark:border-pink-500/20'
                    : 'hover:bg-slate-50 dark:hover:bg-white/3'
                }`}
              >
                <Avatar userId={user.id} name={user.name} color={user.avatarColor} size={30} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-slate-900 dark:text-white truncate">{user.name}</p>
                  <p className="text-[9px] text-slate-400">{age} ans</p>
                </div>
                {daysUntil === 0 ? (
                  <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-pink-500 text-white text-[8px] font-bold animate-pulse shadow-sm shadow-pink-500/40 shrink-0">
                    <Cake size={8} /> Auj. !
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 shrink-0">
                    {daysUntil === 1 ? 'demain' : `${daysUntil}j`}
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

// ─── Page principale ──────────────────────────────────────────────────────────

const WeatherSkeleton: React.FC = () => (
  <div className="bg-white dark:bg-bony-panel border border-slate-200 dark:border-bony-border rounded-2xl shadow-sm">
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
    <div className="h-screen overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-bony-dark pb-20">
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

        {/* ── Zone haute (hero) — 3 colonnes desktop ─────────────────────── */}
        {/*
          • Mobile   : tout empilé verticalement
          • Tablette : météo | prévisions côte à côte, puis musique+anniv en dessous
          • Desktop  : météo (lg:col-span-3 ≈40%) | prévisions (lg:col-span-3 ≈35%) | musique+anniv (lg:col-span-2 ≈25%)
        */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-8 gap-5 items-start">

          {/* Météo du jour — ~40% */}
          <div className="md:col-span-1 lg:col-span-3">
            {weather.loading ? <WeatherSkeleton /> : weather.error || !weather.current ? (
              <div className="bg-white dark:bg-bony-panel border border-slate-200 dark:border-bony-border rounded-2xl p-5 shadow-sm">
                <p className="text-xs text-red-500 font-bold text-center">{weather.error || 'Données météo indisponibles.'}</p>
              </div>
            ) : (
              <WeatherTodayCard current={weather.current} onRefresh={weather.refresh} />
            )}
          </div>

          {/* Prévisions 5 jours — ~35% */}
          <div className="md:col-span-1 lg:col-span-3">
            {weather.loading ? <WeatherSkeleton /> : (
              <WeatherForecastCard forecast={weather.forecast} />
            )}
          </div>

          {/* Musique + Anniversaires — ~25% */}
          <div className="md:col-span-2 lg:col-span-2 flex flex-col gap-5">
            <MusicSection />
            <BirthdaysSection />
          </div>

        </div>

        {/* ── Zone basse — Newsletter pleine largeur ─────────────────────── */}
        <NewsSection />

      </div>
    </div>
  );
};

export default HelloMarketing;
