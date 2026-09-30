import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AppProps } from '../types';
import type { Project, User } from '../../../types';
import { hasSocialFeatures, canEditProjects } from '../../../constants';
import { useAuth } from '../../../contexts/AuthContext';
import { useWeatherData, computeBirthdays, type WeatherData, type ForecastDay } from '../../../pages/HelloMarketing';
import { parseLocalDate } from '../../../components/DateRangePicker';
import { useWorkspace } from '../../store/workspace';
import { gx, Icon, useEngineEvent } from '../ui/kit';
import { loadFeed, loadTrack, sourceHex, feedHex, type FeedCat, type FeedResult, type DeezerTrack } from './sources';

// =====================================================================
// Rubrique « Hello Marketing » — transposition de maquettes/v2/js/apps/hello.js (même balisage,
// mêmes classes `hel-*`), sur les VRAIES données. Parité : maquettes/ux/inventaires/hello-marketing.md.
//  - météo : `useWeatherData` de la page actuelle (ville du profil, cache 30 min, OpenWeather) ;
//  - prochains événements : projets de l'espace de travail, Actifs OU BROUILLONS (exception voulue,
//    CLAUDE.md), types événementiels, à partir d'aujourd'hui ; cloisonnement = serveur ;
//  - musique, viennoiseries, anniversaires : rituels d'équipe, masqués au chef de site
//    (`hasSocialFeatures`) ; utilisateurs = espace de travail (temps réel `users:*`) ;
//  - la veille : `/api/feeds` (mêmes sources, mêmes caches que la page), articles ouverts chez
//    l'éditeur dans un nouvel onglet.
// Rubrique de LECTURE : aucune écriture serveur.
// =====================================================================

/* EVENT_PROJECT_TYPES / EVENT_TYPE_COLORS de HelloMarketing.tsx (orange, bleu, émeraude, violet) */
const EVENT_TYPES: Record<string, string> = { 'Expo/Salon': '#f97316', 'Animation Co': '#3b82f6', 'OP Clients': '#10b981', Collaborateurs: '#a855f7' };
const VIENNOISERIES_ROLES = ['Master', 'Administrator', 'Coordinator', 'Digital Manager'];
const ACCROCHES = ["Et c'est...", 'Le grand gagnant est...', 'Roulement de tambour...', "Cette semaine le bonheur c'est..."];
const BADGES = ['Champion du croissant 🏆', 'Roi de la brioche 👑', 'Maître des pains au chocolat 🎖️', 'Légende du bureau 🌟'];
/* Ciels de la maquette (couleurs du temps qu'il fait, donnée météo et non charte) */
const SKY: Record<string, [string, string]> = { sun: ['#38bdf8', '#3b82f6'], cloudsun: ['#3b6fd8', '#1f3f8f'], cloud: ['#64748b', '#475569'], rain: ['#1d4ed8', '#334155'], night: ['#0c1636', '#2d3f7a'] };
const FEEDS: { k: FeedCat; t: string; icon: string; c: string }[] = [
  { k: 'auto', t: 'Actu auto', icon: 'car', c: '#ff7a52' },
  { k: 'marketing', t: 'Marketing & tech', icon: 'bolt', c: '#b98cff' },
];
const COVER: [string, string] = ['#f75632', '#8f12ab'];   // repli de pochette (dégradé de la maquette)

/* pictos absents du moteur : pluie (prévisions) — repris de la maquette */
const RAIN_PATHS = '<path d="M7 15h10a4 4 0 0 0 0-8 5 5 0 0 0-9.6 1.6A3.2 3.2 0 0 0 7 15z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>';
const WIcon: React.FC<{ ic: string; cls?: string }> = ({ ic, cls = '' }) => (ic === 'rain'
  ? <svg className={`i ${cls}`} viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: RAIN_PATHS }} />
  : <Icon name={ic} size={cls} />);   // `size` = classes ajoutées au <svg class="i …"> (GX.icon)

/** Code OpenWeather (`01d`, `10n`…) → picto de la maquette. */
const owmIcon = (code: string) => {
  const c = (code || '').slice(0, 2);
  return c === '01' ? 'sun' : c === '02' ? 'cloudsun' : c === '09' || c === '10' || c === '11' ? 'rain' : 'cloud';
};

// ---------------------------------------------------------------- utilitaires (maquette + page)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const mmss = (s: number) => (!s || isNaN(s) ? '0:00' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);
const hhmm = (t: number) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** Jours restants, en date LOCALE (la page lisait `new Date('YYYY-MM-DD')`, en UTC). */
const daysTo = (d: Date) => Math.ceil((new Date(d).setHours(0, 0, 0, 0) - today0().getTime()) / 864e5);
const isoWeek = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())); const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - y0.getTime()) / 864e5 + 1) / 7);
};
const nextMonday = () => { const d = today0(); const k = d.getDay() === 1 ? 7 : (8 - d.getDay()) % 7; d.setDate(d.getDate() + k); return d; };
/* relativeDate() de HelloMarketing.tsx (espacements de la maquette) */
const relDate = (s: string) => {
  if (!s) return ''; const t = new Date(s).getTime(); if (isNaN(t)) return '';
  const mins = Math.floor((Date.now() - t) / 6e4);
  if (mins < 1) return 'à l’instant'; if (mins < 60) return `il y a ${mins} min`;
  const h = Math.floor(mins / 60); if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24); if (d === 1) return 'hier'; if (d < 7) return `il y a ${d} j`;
  return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};
const initials = (name: string) => name.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const Av: React.FC<{ u: User; cls?: string }> = ({ u, cls = '' }) => <span className={`av ${cls}`} style={{ '--c': u.avatarColor || '#8a8599' } as React.CSSProperties}>{initials(u.name)}</span>;
const sitesOf = (p: Project) => (p.sites && p.sites.length ? p.sites : p.site ? [p.site] : []);

/** 3 prochains événements (règles de NextEventSection) + périmètre global de la barre du haut. */
function upcoming(projects: Project[]) {
  const T = isoToday(), per = gx().ctx.perimetre;
  return projects.filter((p) => (p.status === 'Active' || p.status === 'Draft') && EVENT_TYPES[p.projectType] && (p.startDate || '') >= T
    && (!per || per === 'Tout le réseau' ? true : per === 'Nissan' ? (p.brands || []).includes('Nissan' as any) : sitesOf(p).includes(per)))
    .sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 3);
}
/** ViennoiseriesSection : graine = année × 100 + semaine ISO, modulo les rôles éligibles (ordre de `/users`). */
function viennoiseries(users: User[]) {
  const el = users.filter((u) => VIENNOISERIES_ROLES.includes(u.role)); if (!el.length) return null;
  const pick = (w: number, y: number) => el[(((y * 100 + w) % el.length) + el.length) % el.length];
  const now = new Date(), w = isoWeek(now), y = now.getFullYear();
  return { w, u: pick(w, y), hist: [1, 2, 3, 4].map((i) => { let ww = w - i, yy = y; if (ww <= 0) { ww += 52; yy -= 1; } return { label: `S${ww}`, u: pick(ww, yy) }; }) };
}

// ---------------------------------------------------------------- météo
const Weather: React.FC<{ current: WeatherData | null; forecast: ForecastDay[]; loading: boolean; error: string; onRefresh: () => void; i: number }> = ({ current, forecast, loading, error, onRefresh, i }) => {
  const tempRef = useRef<HTMLSpanElement>(null), shown = useRef<number | null>(null);
  // Compteur de température (maquette : +6° → valeur réelle, 900 ms), coupé en mode économie.
  useLayoutEffect(() => {
    const el = tempRef.current; if (!el || !current) return;
    const to = current.temp; if (shown.current === to) return; shown.current = to;
    if (gx().eco?.()) { el.textContent = `${to}°`; return; }
    const from = to - 6, t0 = performance.now();
    const step = (now: number) => { const k = Math.min(1, (now - t0) / 900), e = 1 - Math.pow(1 - k, 3); el.textContent = `${Math.round(from + (to - from) * e)}°`; if (k < 1 && el.isConnected) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }, [current]);
  const style = { '--i': i } as React.CSSProperties;
  if (!current && loading) return <article className="hel-card hel-in" style={style}><div className="hel-load"><Icon name="refresh" size="sm" />Chargement météo…</div></article>;
  if (error || !current) return (
    <article className="hel-card hel-in" style={style}><h2 className="hel-h"><Icon name="cloudsun" />Météo<span className="grow" /><button className={`icon-btn sm ${loading ? 'spin' : ''}`} aria-label="Rafraîchir" data-tip="Rafraîchir" disabled={loading} onClick={onRefresh}><Icon name="refresh" size="sm" /></button></h2>
      <div className="hel-none" style={{ color: 'var(--danger)', fontWeight: 700 }}>{error || 'Données météo indisponibles.'}</div></article>
  );
  const night = /n$/.test(current.icon), ic = owmIcon(current.icon);
  const sky = night ? SKY.night : SKY[ic] || SKY.cloudsun, icon = night && ic !== 'cloud' ? 'moon' : ic;
  const todayLbl = cap(new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }));
  return (
    <article className={`hel-card hel-wx hel-in ${loading ? 'loading' : ''}`} style={style}>
      <div className="hel-sky" style={{ '--s1': sky[0], '--s2': sky[1] } as React.CSSProperties}>{!night && ic !== 'cloud' ? <span className="glow" /> : null}
        <div className="hel-where"><Icon name="pin" /><span>{current.city} · {todayLbl}</span><button className={`icon-btn sm ${loading ? 'spin' : ''}`} aria-label="Rafraîchir" data-tip="Rafraîchir" onClick={onRefresh}><Icon name="refresh" size="sm" /></button></div>
        <div className="hel-now"><span className="hel-temp num" ref={tempRef}>{current.temp}°</span><WIcon ic={icon} /><div><div className="d">{cap(current.description)}</div><div className="f">Ressenti {current.feelsLike}°</div></div></div>
      </div>
      {forecast.length ? <div className="hel-fc"><span className="hel-sub">Prévisions 5 jours</span>
        <div className="hel-fcg">{forecast.map((f) => { const fi = owmIcon(f.icon); return <div key={f.day} className="hel-fcd"><span className="n">{f.day}</span><WIcon ic={fi} cls={fi === 'sun' ? 'sun' : ''} /><span className="t num"><b>{f.tempMax}°</b> <span>{f.tempMin}°</span></span></div>; })}</div>
      </div> : null}
    </article>
  );
};
// ---------------------------------------------------------------- prochains événements
const Events: React.FC<{ list: Project[]; canCreate: boolean; i: number }> = ({ list, canCreate, i }) => (
  <article className="hel-card hel-in" style={{ '--i': i } as React.CSSProperties}><h2 className="hel-h"><Icon name="agenda" />Prochains événements</h2>
    {list.length ? list.map((p) => {
      const n = daysTo(parseLocalDate(p.startDate)), c = EVENT_TYPES[p.projectType];
      return (
        <button key={p.id} className="hel-ev" style={{ '--c': c } as React.CSSProperties} onClick={(e) => gx().wm.open('project', { id: p.id, title: p.name }, { origin: e.currentTarget })}>
          <div className="hel-j"><b>{n === 0 ? 'Auj.' : `J-${n}`}</b>{n > 0 ? <span>jours</span> : null}</div>
          <div style={{ minWidth: 0, flex: 1 }}><div className="nm" title={p.name}>{p.name}</div>
            <div className="mt"><span className="hel-type" style={{ '--c': c } as React.CSSProperties}>{p.projectType}</span>{p.status === 'Draft' ? <span className="badge" style={{ '--c': 'var(--text-3)' } as React.CSSProperties}>Brouillon</span> : null}<span>{sitesOf(p)[0] || ''} · {gx().fmt.date(parseLocalDate(p.startDate))}</span></div></div>
        </button>
      );
    }) : <div className="hel-none"><Icon name="agenda" /><span>Aucun événement à venir.{canCreate ? <><br /><span className="faint">Créez un projet pour commencer.</span></> : null}</span></div>}
  </article>
);

// ---------------------------------------------------------------- musique du jour
interface Player { toggle: () => void; restart: () => void; playing: boolean }
const Music = React.forwardRef<Player, { i: number; onState: () => void }>(function Music({ i, onState }, ref) {
  const [track, setTrack] = useState<DeezerTrack | null>(null), [err, setErr] = useState(''), [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false), [pos, setPos] = useState(0), [dur, setDur] = useState(30);
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => { let live = true; loadTrack().then((t) => live && setTrack(t)).catch((e) => live && setErr(e.message)).finally(() => live && setLoading(false)); return () => { live = false; }; }, []);
  const toggle = useCallback(() => {
    const a = audio.current; if (!a) return;
    if (playing) { a.pause(); setPlaying(false); } else { a.play().then(() => setPlaying(true)).catch(() => setPlaying(false)); }
  }, [playing]);
  const seekTo = (s: number) => { const a = audio.current; if (!a) return; const v = Math.max(0, Math.min(dur - 0.1, s)); a.currentTime = v; setPos(v); };
  React.useImperativeHandle(ref, () => ({ toggle, restart: () => seekTo(0), playing }), [toggle, playing, dur]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onState(); }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps
  const pc = dur > 0 ? (pos / dur) * 100 : 0;
  const onBar = (e: React.PointerEvent<HTMLSpanElement>) => { const r = e.currentTarget.getBoundingClientRect(); seekTo(((e.clientX - r.left) / r.width) * dur); };
  const onBarKey = (e: React.KeyboardEvent) => { if (e.key === 'ArrowRight') { e.preventDefault(); seekTo(pos + 5); } if (e.key === 'ArrowLeft') { e.preventDefault(); seekTo(pos - 5); } };
  return (
    <article className={`hel-card hel-in ${playing ? 'playing' : ''}`} style={{ '--i': i } as React.CSSProperties}><h2 className="hel-h"><Icon name="music" />Musique du jour</h2>
      {loading ? <div className="hel-load"><Icon name="refresh" size="sm" /></div>
        : err || !track ? <div className="hel-none" style={{ color: 'var(--danger)', fontWeight: 700 }}>{err || 'Impossible de charger la musique du jour.'}</div>
        : <>
          <div className="hel-trk"><div className="hel-cover" style={{ '--c1': COVER[0], '--c2': COVER[1], overflow: 'hidden' } as React.CSSProperties}>
            {track.album?.cover_medium ? <img src={track.album.cover_medium} alt={track.album.title || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <Icon name="music" />}</div>
            <div style={{ minWidth: 0 }}><div className="tt ellipsis">{track.title}</div><div className="ar ellipsis">{track.artist?.name}</div><div className="pl">{track.preview ? 'Playlist Deezer · même piste pour toute l’équipe' : 'Aperçu non disponible.'}</div></div></div>
          {track.preview ? <>
            <div className="hel-player"><button className="hel-play" aria-label={playing ? 'Pause' : 'Lecture'} onClick={toggle}><Icon name={playing ? 'pause' : 'play'} /></button><span className="tm">{mmss(pos)}</span>
              <span className="hel-bar" role="slider" tabIndex={0} aria-label="Position de lecture" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(pos)} onPointerDown={onBar} onKeyDown={onBarKey}><i style={{ width: `${pc}%` }} /><b style={{ left: `${pc}%` }} /></span><span className="tm">{mmss(dur)}</span></div>
            <audio ref={audio} src={track.preview} preload="none"
              onTimeUpdate={() => { const a = audio.current; if (a) setPos(a.currentTime); }}
              onLoadedMetadata={() => { const a = audio.current; if (a && a.duration && isFinite(a.duration)) setDur(a.duration); }}
              onEnded={() => { setPlaying(false); setPos(0); }} />
          </> : null}
        </>}
    </article>
  );
});

// ---------------------------------------------------------------- viennoiseries
const Viennoiseries: React.FC<{ users: User[]; i: number }> = ({ users, i }) => {
  const v = useMemo(() => viennoiseries(users), [users]);
  const title = <h2 className="hel-h">🥐 Viennoiseries de la semaine</h2>;
  if (!v) return <article className="hel-card hel-vien hel-in" style={{ '--i': i } as React.CSSProperties}>{title}<div className="hel-none">Aucun utilisateur éligible.</div></article>;
  const role = (r: string) => gx().data.ROLES?.[r]?.l || r;
  const hist = (el: HTMLElement) => gx().menu.open([{ header: 'Historique' }, ...v.hist.map((x) => ({ label: `${x.u.name} · ${x.label}`, icon: 'croissant', action: () => {} }))], el, { align: 'right' });
  return (
    <article className="hel-card hel-vien hel-in" style={{ '--i': i } as React.CSSProperties}>{title}
      <span className="hel-acc">{ACCROCHES[v.w % ACCROCHES.length]}</span>
      <div className="hel-spot"><span key={v.u.id} className="av hel-bounce" style={{ '--c': v.u.avatarColor || '#8a8599' } as React.CSSProperties}>{initials(v.u.name)}</span></div>
      <div><div className="nm">{v.u.name}</div><div className="rl">{role(v.u.role)}</div></div>
      <span className="hel-award">{BADGES[v.w % BADGES.length]}</span>
      <div className="hel-vfoot"><span>Semaine {v.w} · change le {nextMonday().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span><button onClick={(e) => hist(e.currentTarget)}>4 sem. précédentes ▴</button></div>
    </article>
  );
};

// ---------------------------------------------------------------- anniversaires
const Birthdays: React.FC<{ users: User[]; i: number }> = ({ users, i }) => {
  const B = useMemo(() => computeBirthdays(users), [users]);
  return (
    <section className="hel-card hel-bdl hel-in" style={{ '--i': i } as React.CSSProperties}><h2 className="hel-h"><Icon name="gift" />Anniversaires</h2>
      <div className="hel-bds">{B.length ? B.map((b) => (
        <div key={b.user.id} className={`hel-bd ${b.daysUntil === 0 ? 'today' : b.daysUntil === 1 ? 'soon' : ''}`}><Av u={b.user} />
          <div><div className="n">{b.user.name.split(' ')[0]} <span>· {b.age} ans</span></div><div className="w">{b.daysUntil === 0 ? 'Auj. !' : b.daysUntil === 1 ? 'demain' : `dans ${b.daysUntil} j`}</div></div></div>
      )) : <span className="faint">Aucun anniversaire renseigné.</span>}</div>
    </section>
  );
};

// ---------------------------------------------------------------- la veille
interface FeedState { loading: boolean; data: FeedResult | null; fresh: string }
const Thumb: React.FC<{ src: string; ini: string; c: string }> = ({ src, ini, c }) => {
  const [ko, setKo] = useState(false);
  return src && !ko
    ? <img className="hel-art" src={src} alt="" loading="lazy" style={{ objectFit: 'cover' }} onError={() => setKo(true)} />
    : <span className="hel-ini" style={{ '--sc': c } as React.CSSProperties}>{ini}</span>;
};
const Feed: React.FC<{ f: typeof FEEDS[number]; st: FeedState; onRefresh: () => void; i: number }> = ({ f, st, onRefresh, i }) => {
  const d = st.data, sources = d?.sources || [];
  return (
    <article className="hel-card hel-feed hel-in" style={{ '--i': i, '--c': f.c } as React.CSSProperties}>
      <div className="row" style={{ gap: 12 }}><h2 className="hel-h"><Icon name={f.icon} />{f.t}</h2><span className="grow" /><span className="hel-upd">{st.loading || !d ? '' : `Mis à jour à ${hhmm(d.at)}`}</span>
        <button className={`icon-btn sm ${st.loading ? 'spin' : ''}`} aria-label="Rafraîchir" data-tip="Rafraîchir" disabled={st.loading} onClick={onRefresh}><Icon name="refresh" size="sm" /></button></div>
      <div className="hel-srcs">{sources.map((s) => <span key={s.key} className="hel-src" style={{ '--c': feedHex(s) } as React.CSSProperties}>{s.name}</span>)}<span className="x">12 derniers articles, toutes sources</span></div>
      <div className="hel-items">
        {st.loading ? <div className="hel-load"><Icon name="refresh" size="sm" />Chargement des flux RSS…</div>
          : !d?.articles.length ? <div className="hel-none"><Icon name="cloud" />Aucun article disponible.</div>
          : d.articles.map((a, j) => { const sc = sourceHex(sources, a.source); return (
            <a key={`${a.link}|${j}`} className={`hel-art-row ${st.fresh && st.fresh === a.link ? 'hel-new' : ''}`} href={a.link} target="_blank" rel="noopener noreferrer" style={{ '--c': f.c } as React.CSSProperties}>
              <div className="hel-img"><Thumb src={a.thumbnail} ini={a.source.charAt(0)} c={sc} /></div>
              <div className="hel-ab"><div className="m"><span className="hel-src" style={{ '--c': sc } as React.CSSProperties}>{a.source}</span><span className="ago">{relDate(a.pubDate)}</span><span className="go">Voir ↗</span></div>
                <div className="tt">{a.title}</div>{a.description ? <div className="x">{a.description}</div> : null}</div>
            </a>); })}
      </div>
    </article>
  );
};

// ---------------------------------------------------------------- rubrique
export default function HelloApp({ inst }: AppProps) {
  const { user } = useAuth();
  const role = user?.role;
  const team = hasSocialFeatures(role);                      // chef de site : ni musique, ni viennoiseries, ni anniversaires
  const weather = useWeatherData(user?.id || '');
  const projects = useWorkspace((s) => s.projects);
  const users = useWorkspace((s) => s.users);
  const [, setTick] = useState(0);
  useEngineEvent('ctx', () => setTick((n) => n + 1));        // périmètre global changé
  // Les « J-n » et les dates relatives suivent l'heure : compteur rafraîchi chaque minute (comme la page).
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 60000); return () => clearInterval(t); }, []);

  const events = useMemo(() => upcoming(projects), [projects, gx().ctx.perimetre]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- fils d'actus (chargés indépendamment, rafraîchissement forcé = cache ignoré)
  const [feeds, setFeeds] = useState<Record<FeedCat, FeedState>>({ auto: { loading: true, data: null, fresh: '' }, marketing: { loading: true, data: null, fresh: '' } });
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const refreshFeed = useCallback((k: FeedCat, force = true) => {
    if (feeds[k].loading && feeds[k].data) return;             // déjà en cours
    setFeeds((F) => ({ ...F, [k]: { ...F[k], loading: true } }));
    const before = feeds[k].data?.articles[0]?.link;
    loadFeed(k, force).then((data) => {
      if (!alive.current) return;
      const top = data.articles[0]?.link || '';
      setFeeds((F) => ({ ...F, [k]: { loading: false, data, fresh: force && before && top && top !== before ? top : '' } }));
    }).catch(() => { if (alive.current) setFeeds((F) => ({ ...F, [k]: { ...F[k], loading: false } })); });
  }, [feeds]);
  useEffect(() => { refreshFeed('auto', false); refreshFeed('marketing', false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- lecteur (menus de la barre du haut)
  const player = useRef<Player>(null);
  const [, setPlayTick] = useState(0);

  inst.command = (c: string) => {
    if (c === 'play' && team) player.current?.toggle();
    if (c === 'refresh') FEEDS.forEach((f) => refreshFeed(f.k));
  };
  inst.menus = () => ({
    'Présentation': [{ label: 'Rafraîchir la météo', icon: 'cloudsun', action: weather.refresh }, { label: 'Rafraîchir Actu auto', icon: 'car', action: () => refreshFeed('auto') }, { label: 'Rafraîchir Marketing & tech', icon: 'bolt', action: () => refreshFeed('marketing') }],
    ...(team ? { 'Musique': [{ label: player.current?.playing ? 'Pause' : 'Lecture de l’extrait', icon: player.current?.playing ? 'pause' : 'play', disabled: !player.current, action: () => player.current?.toggle() }, { label: 'Revenir au début', icon: 'back', disabled: !player.current, action: () => player.current?.restart() }] } : {}),
  });

  const dateLbl = cap(new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  return (
    <div className="app hel">
      <div className="app-head"><div className="ah-t"><span className="ah-eye">Communauté</span><h1>Hello Marketing</h1><span className="sub">{dateLbl}</span></div></div>
      <div className="app-body scroll hel-scroll"><div className="hel-wrap">
        <div className="hel-sec">{team ? 'L’équipe aujourd’hui' : 'Aujourd’hui'}</div>
        <section className={`hel-top ${team ? '' : 'sm'}`}>
          <Weather current={weather.current} forecast={weather.forecast} loading={weather.loading} error={weather.error} onRefresh={weather.refresh} i={0} />
          <Events list={events} canCreate={canEditProjects(role)} i={1} />
          {team ? <><Music ref={player} i={2} onState={() => setPlayTick((n) => n + 1)} /><Viennoiseries users={users} i={3} /></> : null}
        </section>
        {team ? <Birthdays users={users} i={4} /> : null}
        <div className="hel-sec">La veille</div>
        <section className="hel-veille">{FEEDS.map((f, k) => <Feed key={f.k} f={f} st={feeds[f.k]} onRefresh={() => refreshFeed(f.k)} i={5 + k} />)}</section>
      </div></div>
    </div>
  );
}
