
import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles, RefreshCw, MapPin, Music, Cake, Play, Pause,
  Droplets, Wind, Cloud, ExternalLink, Loader2
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../services/dataService';
import Avatar from '../components/Avatar';
import { User } from '../types';

// =============================================================================
// OPENWEATHER API KEY
// Pour obtenir une clé gratuite :
// 1. Rendez-vous sur https://openweathermap.org/
// 2. Créez un compte (gratuit)
// 3. Allez dans "My API Keys" dans votre profil
// 4. Copiez votre clé API et remplacez la valeur ci-dessous
// =============================================================================
const OPENWEATHER_API_KEY = '6d5fe29fdd1253aae4c3b5fe1b7f1dcc';

const CORSPROXY = (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`;

const RSS_FEEDS = [
  { name: "L'Argus",    url: 'https://www.largus.fr/rss/actualites.xml' },
  { name: 'Caradisiac', url: 'https://www.caradisiac.com/rss/actualites.xml' },
  { name: 'AutoPlus',   url: 'https://www.autoplus.fr/feed' },
  { name: 'AutoMoto',   url: 'https://www.auto-moto.com/feed' },
];

const DEFAULT_WEATHER_CITY = 'Clermont-Ferrand';

const RSS_CACHE_KEY    = 'gearbox_rss_cache';
const DEEZER_CACHE_KEY = 'gearbox_deezer_cache';
const USER_PREFS_KEY   = (id: string) => `gearbox_user_prefs_${id}`;
const WEATHER_CACHE_KEY = (city: string) =>
  `gearbox_weather_cache_${city.toLowerCase().replace(/\s+/g, '_')}`;

const CACHE_24H = 24 * 60 * 60 * 1000;
const CACHE_30M = 30 * 60 * 1000;

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
    if ((encs[i].getAttribute('type') || '').startsWith('image')) {
      return encs[i].getAttribute('url') || '';
    }
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
      out.push({
        title,
        link,
        source,
        pubDate: getText(it, 'pubDate'),
        description: rawDesc.slice(0, 200),
        thumbnail: getThumbnail(it),
      });
    }
    return out;
  } catch {
    return [];
  }
};

const fmtDate = (dateStr: string): string => {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
};

const fmtTime = (s: number): string => {
  if (!s || isNaN(s)) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

const capitalizeFirst = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

// ─── Section card wrapper ─────────────────────────────────────────────────────

const SectionCard: React.FC<{
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ icon, iconBg, title, subtitle, action, children }) => (
  <div className="bg-white dark:bg-bony-panel border border-slate-200 dark:border-bony-border rounded-xl overflow-hidden shadow-sm dark:shadow-lg">
    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-bony-border">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg}`}>
          {icon}
        </div>
        <div>
          <h3 className="font-title text-sm font-bold text-slate-900 dark:text-bony-text tracking-widest uppercase">
            {title}
          </h3>
          {subtitle && <p className="text-[10px] text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
    {children}
  </div>
);

const Spinner: React.FC<{ label?: string }> = ({ label }) => (
  <div className="flex items-center justify-center py-12 gap-3 text-slate-400">
    <Loader2 size={20} className="animate-spin" />
    {label && <span className="text-sm">{label}</span>}
  </div>
);

// ─── 1. Newsletter RSS ────────────────────────────────────────────────────────

const NewsSection: React.FC = () => {
  const [articles, setArticles] = useState<RssArticle[]>([]);
  const [loading, setLoading]   = useState(true);
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

      const fetchFeed = async (feed: { name: string; url: string }): Promise<RssArticle[]> => {
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
    // Vider le cache pour forcer un rechargement frais avec le nouveau proxy
    localStorage.removeItem(RSS_CACHE_KEY);
    load();
  }, []);

  return (
    <SectionCard
      icon={<ExternalLink size={16} className="text-bony-orange" />}
      iconBg="bg-bony-orange/10"
      title="Newsletter Auto du Jour"
      subtitle={lastFetch ? `Mis à jour à ${lastFetch}` : undefined}
      action={
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="p-2 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-400 hover:text-bony-orange transition disabled:opacity-40"
          title="Rafraîchir"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      }
    >
      {loading ? (
        <Spinner label="Chargement des flux RSS..." />
      ) : articles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
          <Cloud size={32} strokeWidth={1} />
          <p className="text-sm">Aucun article disponible.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          {articles.map((art, i) => (
            <a
              key={i}
              href={art.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-3 p-4 hover:bg-slate-50 dark:hover:bg-white/3 transition group border-b border-slate-100 dark:border-white/5 last:border-b-0"
            >
              {art.thumbnail ? (
                <img
                  src={art.thumbnail}
                  alt=""
                  className="w-16 h-16 rounded-lg object-cover shrink-0 bg-slate-100"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-bony-orange/10 shrink-0 flex items-center justify-center font-bold text-bony-orange text-xl">
                  {art.source.charAt(0)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[9px] font-bold uppercase text-bony-orange tracking-wider">{art.source}</span>
                  {art.pubDate && (
                    <span className="text-[9px] text-slate-400">· {fmtDate(art.pubDate)}</span>
                  )}
                </div>
                <p className="text-xs font-bold text-slate-900 dark:text-bony-text leading-snug line-clamp-2 group-hover:text-bony-orange transition-colors">
                  {art.title}
                </p>
                {art.description && (
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                    {art.description}
                  </p>
                )}
              </div>
            </a>
          ))}
        </div>
      )}
    </SectionCard>
  );
};

// ─── 2. Météo ─────────────────────────────────────────────────────────────────

const WeatherSection: React.FC<{ userId: string }> = ({ userId }) => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [city,    setCity]    = useState('');

  const load = async (cityName: string, force = false) => {
    setLoading(true);
    setError('');
    try {
      if (!force) {
        const cached = localStorage.getItem(WEATHER_CACHE_KEY(cityName));
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_30M) {
            setWeather(data);
            setLoading(false);
            return;
          }
        }
      }

      const res = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(cityName)}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=fr`
      );
      if (!res.ok) throw new Error('Ville introuvable ou clé invalide.');
      const d = await res.json();

      const wd: WeatherData = {
        city:        d.name,
        temp:        Math.round(d.main.temp),
        feelsLike:   Math.round(d.main.feels_like),
        description: d.weather[0]?.description || '',
        icon:        d.weather[0]?.icon || '',
        humidity:    d.main.humidity,
        wind:        Math.round((d.wind.speed ?? 0) * 3.6),
      };

      localStorage.setItem(WEATHER_CACHE_KEY(cityName), JSON.stringify({ data: wd, timestamp: Date.now() }));
      setWeather(wd);
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
    load(effective);
  }, [userId]);

  return (
    <SectionCard
      icon={<MapPin size={16} className="text-blue-500" />}
      iconBg="bg-blue-500/10"
      title="Météo de ma Concession"
    >
      <div className="p-5">
        {loading ? (
          <Spinner label="Chargement météo..." />
        ) : error ? (
          <div className="py-4 text-center space-y-1">
            <p className="text-sm text-red-500 font-bold">{error}</p>
            <p className="text-[11px] text-slate-400">Ville : {city}</p>
          </div>
        ) : weather ? (
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3 flex-1">
              {weather.icon && (
                <img
                  src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`}
                  alt={weather.description}
                  className="w-14 h-14 shrink-0"
                />
              )}
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-slate-900 dark:text-white">{weather.temp}°C</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{weather.description} · Ressenti {weather.feelsLike}°</p>
                <p className="text-[10px] text-bony-orange font-bold mt-0.5 flex items-center gap-1">
                  <MapPin size={9} /> {weather.city}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 text-sm shrink-0">
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                <Droplets size={14} className="text-blue-400" />
                <span><span className="font-bold text-slate-900 dark:text-white">{weather.humidity}%</span> humidité</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                <Wind size={14} className="text-slate-400" />
                <span><span className="font-bold text-slate-900 dark:text-white">{weather.wind} km/h</span> vent</span>
              </div>
            </div>
            <button
              onClick={() => load(city, true)}
              className="p-2 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-400 hover:text-bony-orange transition"
              title="Rafraîchir"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        ) : null}
      </div>
    </SectionCard>
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
          if (Date.now() - timestamp < CACHE_24H) {
            setTrack(data);
            setLoading(false);
            return;
          }
        }
      }

      const DEEZER_URL = 'https://api.deezer.com/playlist/15169024043/tracks?limit=100';
      let tracks: DeezerTrack[] = [];

      // Essai 1 : corsproxy.io
      try {
        console.log('[Deezer] Tentative via corsproxy.io...');
        const res = await fetch(CORSPROXY(DEEZER_URL));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        tracks = data?.data || [];
        console.log('[Deezer] corsproxy.io OK, pistes :', tracks.length);
      } catch (e1) {
        console.warn('[Deezer] corsproxy.io échoué :', e1, '— tentative directe...');
        // Essai 2 : direct (peut fonctionner selon les navigateurs)
        try {
          const res = await fetch(DEEZER_URL);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          tracks = data?.data || [];
          console.log('[Deezer] Appel direct OK, pistes :', tracks.length);
        } catch (e2) {
          console.error('[Deezer] Tous les essais ont échoué :', e2);
          throw new Error('Impossible de joindre l\'API Deezer.');
        }
      }

      if (tracks.length === 0) throw new Error('Playlist vide ou inaccessible.');

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
    else { a.play(); setPlaying(true); }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Number(e.target.value);
    setProgress(Number(e.target.value));
  };

  return (
    <SectionCard
      icon={<Music size={16} className="text-purple-500" />}
      iconBg="bg-purple-500/10"
      title="Musique du Jour"
    >
      <div className="p-5">
        {loading ? (
          <Spinner />
        ) : error ? (
          <p className="text-sm text-red-500 font-bold text-center py-4">{error}</p>
        ) : track ? (
          <div className="flex items-center gap-4">
            <img
              src={track.album.cover_medium}
              alt={track.album.title}
              className="w-16 h-16 rounded-xl object-cover shrink-0 shadow-md"
            />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-900 dark:text-white text-sm truncate">{track.title}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{track.artist.name}</p>
              <p className="text-[10px] text-slate-400 truncate">{track.album.title}</p>

              {track.preview ? (
                <div className="mt-2.5 flex items-center gap-2.5">
                  <button
                    onClick={togglePlay}
                    className="w-8 h-8 rounded-full bg-bony-gradient flex items-center justify-center text-white shadow hover:opacity-90 transition shrink-0"
                  >
                    {playing
                      ? <Pause size={13} />
                      : <Play size={13} className="ml-0.5" />}
                  </button>
                  <div className="flex-1">
                    <input
                      type="range"
                      min={0}
                      max={duration}
                      step={0.1}
                      value={progress}
                      onChange={handleSeek}
                      className="w-full accent-bony-orange"
                    />
                    <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
                      <span>{fmtTime(progress)}</span>
                      <span>{fmtTime(duration)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-slate-400 mt-2">Aperçu non disponible.</p>
              )}
            </div>

            {track.preview && (
              <audio
                ref={audioRef}
                src={track.preview}
                onTimeUpdate={() => {
                  const a = audioRef.current;
                  if (a) setProgress(a.currentTime);
                }}
                onLoadedMetadata={() => {
                  const a = audioRef.current;
                  if (a && a.duration) setDuration(a.duration);
                }}
                onEnded={() => setPlaying(false)}
              />
            )}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
};

// ─── 4. Anniversaires ─────────────────────────────────────────────────────────

const BirthdaysSection: React.FC = () => {
  const [entries,  setEntries]  = useState<BirthdayEntry[]>([]);
  const [loading,  setLoading]  = useState(true);

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
        const age = next.getFullYear() - bday.getFullYear();
        result.push({ user: u, daysUntil, age });
      }

      result.sort((a, b) => a.daysUntil - b.daysUntil);
      setEntries(result.slice(0, 5));
      setLoading(false);
    })();
  }, []);

  return (
    <SectionCard
      icon={<Cake size={16} className="text-pink-500" />}
      iconBg="bg-pink-500/10"
      title="Anniversaires de l'Équipe"
    >
      <div className="p-5">
        {loading ? (
          <Spinner />
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 gap-2 text-slate-400">
            <Cake size={28} strokeWidth={1} />
            <p className="text-sm">Aucun anniversaire renseigné dans l'équipe.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {entries.map(({ user, daysUntil, age }) => (
              <div
                key={user.id}
                className={`flex items-center gap-3 p-3 rounded-xl border transition ${
                  daysUntil === 0
                    ? 'bg-pink-50 dark:bg-pink-500/10 border-pink-200 dark:border-pink-500/30'
                    : 'border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/3'
                }`}
              >
                <Avatar userId={user.id} name={user.name} color={user.avatarColor} size={38} />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 dark:text-white text-xs truncate">{user.name}</p>
                  <p className="text-[10px] text-slate-400">{age} ans</p>
                </div>
                {daysUntil === 0 ? (
                  <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-pink-500 text-white text-[9px] font-bold animate-pulse shadow shadow-pink-500/30 shrink-0">
                    <Cake size={10} /> Auj.
                  </span>
                ) : (
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300 shrink-0">{daysUntil}j</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
};

// ─── Page principale ──────────────────────────────────────────────────────────

const HelloMarketing: React.FC = () => {
  const { user } = useAuth();
  if (!user) return null;

  const today = capitalizeFirst(
    new Date().toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
  );

  return (
    <div className="p-3 md:p-8 h-screen overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-bony-dark animate-fade-in pb-20">
      <div className="flex items-center gap-3 mb-8">
        <Sparkles className="text-bony-orange" size={32} />
        <div>
          <h2 className="text-xl md:text-3xl text-slate-900 dark:text-white font-title">Hello Marketing</h2>
          <p className="text-xs text-slate-400 mt-0.5">{today}</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto space-y-6">
        {/* Grille principale : News (2/3) + colonne droite (1/3) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <NewsSection />
          </div>
          <div className="flex flex-col gap-6">
            <WeatherSection userId={user.id} />
            <MusicSection />
          </div>
        </div>

        <BirthdaysSection />
      </div>
    </div>
  );
};

export default HelloMarketing;
