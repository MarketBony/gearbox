import { useEffect, useMemo, useRef, useState } from 'react';
import { mapProject, mapPost, mapUser, GXData } from './data';
import { useBridge, appOf } from './bridge';
import { db } from '../../services/dataService';
import { chatStore } from '../../services/chatStore';
import { usePresence } from '../../services/presenceStore';
import { useRealtimeSync, RT_EVENTS } from '../../services/realtime';
import { computeDashboardStats } from '../../services/dashboardStats';
import { useWorkspace, startWorkspace } from '../store/workspace';
import { useWeatherData } from '../../pages/HelloMarketing';
import { canSeeGames } from '../../constants';
import type { Project, BudgetLine, SocialPost, FixedExpense, User, Equipment, EquipmentBooking } from '../../types';

// =====================================================================
// <DataHub/> — remplit GX.data (adaptateur, data.ts) avec les VRAIES données et
// le tient à jour (mêmes événements temps réel que les pages), puis émet
// 'data' (+ les 'data:<source>' de la maquette) pour que les ports se re-rendent.
// Toutes les lectures passent par dataService : cloisonnement SERVEUR inchangé.
// =====================================================================

// Le moteur (engine/boot.ts) a créé GX.data AVANT d'installer ses modules : on remplit CET objet.
const gx = () => (window as any).GX;

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Le pont est publié par OsHost AVANT le montage de DataHub ; ce garde ne sert qu'aux cas limites
// (rechargement à chaud du module du pont) — sans lui, la bêta se coupait sur un `null`.
export default function DataHub() {
  return useBridge() ? <DataHubInner /> : null;
}

function DataHubInner() {
  const b = useBridge();
  const uid = b.user.id, role = b.user.role;
  const presence = usePresence(uid);
  // Projets et utilisateurs : l'espace de travail partagé (ui2/store/workspace.ts), le même que
  // les rubriques portées — un seul chargement, mises à jour entrée par entrée.
  useEffect(() => {
    startWorkspace({ id: b.user.id, name: b.user.name, role: b.user.role, avatarColor: b.user.avatarColor },
      (msg) => { const GX = gx(); GX?.shell?.notify ? GX.shell.notify({ app: 'projects', title: 'Sauvegarde', body: msg }) : console.warn(msg); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const projects = useWorkspace(s => s.projects);
  const projectsReady = useWorkspace(s => s.ready);
  const users = useWorkspace(s => s.users);
  const [rest, setRest] = useState<{ budgets: BudgetLine[]; socialPosts: SocialPost[]; fixedExpenses: FixedExpense[] } | null>(null);
  const core = useMemo(() => (rest && projectsReady ? { ...rest, projects } : null), [rest, projects, projectsReady]);
  const [equip, setEquip] = useState<{ eq: Equipment[]; bk: EquipmentBooking[] } | null>(null);
  const [conges, setConges] = useState<Awaited<ReturnType<typeof db.getConges>> | null>(null);
  const [lobby, setLobby] = useState<any>(null);
  const weather = useWeatherData(uid);

  const allowed = b.nav.allowedIds;
  const loadCore = () => {
    Promise.all([db.getBudgets(), db.getSocialPosts(), db.getFixedExpenses()])
      .then(([budgets, socialPosts, fixedExpenses]) => setRest({ budgets, socialPosts, fixedExpenses }))
      .catch(() => { /* best-effort : les widgets restent vides */ });
  };
  const loadEquip = () => { if (!allowed.has('material')) return; Promise.all([db.getEquipment(), db.getEquipmentBookings()]).then(([eq, bk]) => setEquip({ eq, bk })).catch(() => {}); };
  const loadConges = () => {
    if (!allowed.has('conges')) { setConges(null); return; }
    const t = new Date(), fin = new Date(t); fin.setDate(t.getDate() + 60);
    const debut = new Date(t.getMonth() >= 5 ? t.getFullYear() : t.getFullYear() - 1, 5, 1);
    db.getConges(iso(debut), iso(fin)).then(setConges).catch(() => setConges(null));
  };
  const loadLobby = () => { if (!canSeeGames(role, allowed.has('games'))) return; db.getGamesLobby().then(setLobby).catch(() => {}); };

  useEffect(() => { loadCore(); loadEquip(); loadConges(); loadLobby(); }, [uid, role, allowed.has('conges'), allowed.has('material'), allowed.has('games')]); // eslint-disable-line react-hooks/exhaustive-deps
  useRealtimeSync([...RT_EVENTS.budget, ...RT_EVENTS.social, ...RT_EVENTS.fixedExpenses], loadCore);
  useRealtimeSync(RT_EVENTS.conges, loadConges);
  useRealtimeSync(RT_EVENTS.games, loadLobby);

  // Chat : le store temps réel de l'appli (le même que la Sidebar).
  const [chatTick, setChatTick] = useState(0);
  useEffect(() => chatStore.subscribe(() => setChatTick(n => n + 1)), []);

  const stats = useMemo(() => {
    if (!core) return null;
    const y = new Date().getFullYear();
    // Réglages PAR DÉFAUT du Dashboard : année en cours, tout le réseau, tout PRO+.
    return computeDashboardStats({ ...core, dateStart: `${y}-01-01`, dateEnd: `${y}-12-31`, filterContexts: [], filterBrands: [], filterServices: [], filterProPlus: 'all' });
  }, [core]);

  const first = useRef(true);
  const prev = useRef<{ core: any; badges: string }>({ core: null, badges: '' });
  useEffect(() => {
    const GX = gx(); const D: GXData = GX.data;
    D.ME = uid;
    GX.ctx.uid = uid; GX.ctx.role = role;
    GX.ctx.readOnly = ['Site Manager', 'Guest'].includes(role);
    GX.ctx.site = role === 'Site Manager' ? (b.user.sites || [])[0] || null : null;
    D.USERS = users.map(u => mapUser(u, !!presence && Object.values(presence as any).some((arr: any) => Array.isArray(arr) && arr.some((x: any) => x?.userId === u.id || x === u.id))));
    if (core) {
      // Brouillons : présents dans PROJECTS (la To-do les montre), exclus par les widgets comme par les pages.
      D.PROJECTS = core.projects.map(mapProject);
      D.POSTS = core.socialPosts.map(mapPost);
      D.EXPENSES = core.fixedExpenses.map(e => ({ id: e.id, date: e.date, sites: e.sites && e.sites.length ? e.sites : [e.site], service: e.service, brands: e.brands || (e.brand ? [e.brand] : []), comment: e.comment, amount: e.amount, annual: !!e.isAnnual, proPlus: !!e.proPlus, raw: e }));
      D.BUDGET_LINES = core.budgets.map(l => ({ id: l.site, plaque: D.plaqueOf(l.site), brands: l.brands, planned: l.entries as any, raw: l }));
      D.PROVIDERS = [...new Set<string>(core.projects.flatMap(p => (p.tasks || []).map(t => t.provider || "").filter(Boolean)))];
    }
    if (equip) {
      D.EQUIPMENT = equip.eq.map(e => ({ id: e.id, name: e.name, cat: e.category || '', qty: e.totalQuantity, raw: e }));
      D.BOOKINGS = equip.bk.map(x => ({ id: x.id, eq: x.equipmentId, qty: x.quantity, start: x.startDate, end: x.endDate, site: x.site, service: x.service, note: x.description, raw: x }));
    }
    if (conges) {
      D.CONGES = conges.jours.map(j => ({ u: j.userId, date: j.date, type: j.type, demi: j.demi === 'AM' ? 'matin' : j.demi === 'PM' ? 'apres-midi' : null, ok: j.validated, raw: j }));
      D.CONGES_MEMBERS = conges.membres;
      D.congesDroits = conges.droits;
      const t = new Date(); const periode = t.getMonth() >= 5 ? t.getFullYear() : t.getFullYear() - 1;
      D.periodStart = new Date(periode, 5, 1);
      D.CONGES_DROITS = Object.fromEntries(conges.membres.map(m => [m, conges.droits.find(d => d.userId === m && d.periode === periode)?.jours ?? 25]));
    } else { D.CONGES = []; D.CONGES_MEMBERS = []; D.CONGES_DROITS = {}; }
    const convs = chatStore.getConversations();
    D.CONVS = convs.map(c => ({
      id: c.id, kind: c.type === 'private' ? 'dm' : c.type, raw: c,
      name: c.type === 'general' ? 'Chat Général' : c.name || users.find(u => u.id === c.participants.find(p => p !== uid))?.name || 'Message privé',
      members: c.participants, unread: c.unreadCounts?.[uid] || 0, admins: c.adminIds || [], pinned: (c.pinnedBy || []).includes(uid), muted: (c.mutedBy || []).includes(uid),
      last: c.lastMessage, lastAt: c.lastMessageAt ? new Date(c.lastMessageAt).getTime() : undefined,
    }));
    // Messages : le dernier de chaque conversation (le fil complet est lu par la rubrique Chat).
    D.MESSAGES = Object.fromEntries(D.CONVS.filter(c => c.last).map(c => [c.id, [{ id: c.id + '-last', u: '', t: c.last!, at: c.lastAt || 0, type: 'text', r: {} }]]));
    D.GAMES = { challenges: (lobby?.challenges || []).filter((x: any) => x.toUserId === uid && x.status === 'pending').map((x: any) => ({ from: x.fromUserId, game: x.gameType || x.game || '', at: new Date(x.createdAt || Date.now()).getTime() })), running: [], board: [] };
    D.FEED = b.feed.entries.map(e => ({ id: e.id, u: e.userId, a: e.action, o: e.entityName, app: appOf(D.tabOfEntity(e.entity)), at: new Date(e.timestamp).getTime(), unread: b.feed.isUnread(e), raw: e }));
    D.HELLO = {
      weather: weather.current ? { city: weather.current.city, t: weather.current.temp, feels: weather.current.feelsLike, desc: weather.current.description, icon: weather.current.icon, owm: true } : null,
      forecast: weather.forecast.map(f => [f.day, f.icon, f.tempMax, f.tempMin]),
      track: null, rss: {},
    };
    D.stats = stats;
    D.ready = !!core;
    // Événements de la maquette, émis seulement quand leur source a changé (pas à chaque tic de
    // présence ou de chat) : c'est ce qui évite de redessiner bureau, Dock et widgets pour rien.
    GX.emit('data');
    if (core && core !== prev.current.core) { prev.current.core = core; GX.emit('data:projects'); }
    const badges = `${chatTick}|${lobby ? JSON.stringify(D.GAMES.challenges.length) : ''}|${b.feed.unreadCount}|${b.chatUnread}|${b.gamesChallenges}`;
    if (badges !== prev.current.badges) { prev.current.badges = badges; GX.emit('badges'); }
    if (first.current && core) { first.current = false; GX.emit('ctx'); }
  }, [core, users, equip, conges, lobby, stats, chatTick, weather.current, weather.forecast, b.feed.entries, b.feed.unreadCount, presence, uid, role]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
