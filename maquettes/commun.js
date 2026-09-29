/* =====================================================================
   GEARBOX — socle commun des maquettes (ressorts, icônes, données fictives,
   Spotlight ⌘K, barre de test). Aucune donnée réelle : tout est inventé.
   ===================================================================== */
const G = (window.G = {});

/* ---------- 1. Ressorts physiques → courbes CSS linear() ----------
   Même modèle que SwiftUI / framer-motion : masse-ressort-amortisseur.
   On simule, on échantillonne, et on pose le résultat dans une variable CSS :
   toute transition CSS devient un vrai ressort, sans JS à chaque frame. */
function springCurve({ stiffness = 300, damping = 30, mass = 1 }) {
  const dt = 1 / 240; let x = 0, v = 0, t = 0; const pts = [];
  while (t < 3) {
    const a = (-stiffness * (x - 1) - damping * v) / mass;
    v += a * dt; x += v * dt; t += dt; pts.push([t, x]);
    if (t > 0.1 && Math.abs(1 - x) < 0.0005 && Math.abs(v) < 0.01) break;
  }
  const total = t, step = Math.max(1, Math.floor(pts.length / 48));
  const out = ['0'];
  for (let i = step; i < pts.length; i += step) out.push(`${pts[i][1].toFixed(4)} ${(pts[i][0] / total * 100).toFixed(1)}%`);
  out.push('1');
  return { css: `linear(${out.join(', ')})`, ms: Math.round(total * 1000) };
}
G.springs = {
  snappy: springCurve({ stiffness: 420, damping: 36 }),
  soft:   springCurve({ stiffness: 190, damping: 24 }),
  bouncy: springCurve({ stiffness: 320, damping: 17 }),
};
try {
  if (CSS.supports('transition-timing-function', 'linear(0, 1)')) {
    for (const [k, s] of Object.entries(G.springs)) document.documentElement.style.setProperty(`--spring-${k}`, s.css);
  }
} catch (e) {}

/* ---------- 2. Icônes (trait, style lucide) ---------- */
const P = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  projects: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M8 13h8M8 16h5"/>',
  todo: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/>',
  digital: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  campaigns: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12"/>',
  material: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  agenda: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  budget: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2H5"/><circle cx="16" cy="14" r="1.2"/>',
  fixed: '<path d="M17 6.5A7 7 0 1 0 17 17.5"/><path d="M4 10h9M4 14h9"/>',
  export: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  conges: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  hello: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  games: '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 11v3M5.5 12.5h3M15.5 12h.01M18 14h.01"/>',
  archives: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  filter: '<path d="M4 5h16l-6 8v5l-4 2v-7z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
};
G.icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24">${P[name] || P.grid}</svg>`;

/* ---------- 3. Rubriques (miroir du routage réel d'App.tsx) ---------- */
G.apps = [
  { id: 'dashboard', name: 'Dashboard', tint: ['#f75632', '#c2185b'] },
  { id: 'projects',  name: 'Projets',   tint: ['#8f12ab', '#5b1bd1'] },
  { id: 'todo',      name: 'To-do',     tint: ['#3ecf8e', '#12806b'] },
  { id: 'digital',   name: 'Digital',   tint: ['#2f7cf6', '#293f74'] },
  { id: 'chat',      name: 'Chat',      tint: ['#34c7ff', '#1e6fd9'] },
  { id: 'campaigns', name: 'Campagnes', tint: ['#ff8a3d', '#f75632'] },
  { id: 'hello',     name: 'Hello Marketing', tint: ['#ff5fa2', '#8f12ab'] },
  { id: 'agenda',    name: 'Agenda',    tint: ['#ff5d5d', '#d62f5b'] },
  { id: 'budget',    name: 'Budget',    tint: ['#f5a524', '#f75632'] },
  { id: 'fixed',     name: 'Dépenses',  tint: ['#caa04b', '#8a5a1c'] },
  { id: 'material',  name: 'Matériel',  tint: ['#7c8aa5', '#3b4863'] },
  { id: 'conges',    name: 'Congés',    tint: ['#ffcc33', '#ff8a3d'] },
  { id: 'export',    name: 'Export',    tint: ['#22b573', '#146c43'] },
  { id: 'games',     name: 'Jeux',      tint: ['#b36bff', '#6a2bd9'] },
  { id: 'archives',  name: 'Archives',  tint: ['#8e8a99', '#4a4655'] },
  { id: 'settings',  name: 'Réglages',  tint: ['#9aa0ad', '#555b68'] },
];
G.app = (id) => G.apps.find((a) => a.id === id);
G.appIcon = (a, size = 48) =>
  `<span class="app-ico" style="--s:${size}px;background:linear-gradient(145deg,${a.tint[0]},${a.tint[1]})">${G.icon(a.id)}</span>`;

/* ---------- 4. Données fictives ---------- */
G.projects = [
  { id: 'p1', name: 'Portes ouvertes Renault 5', site: 'Clermont', service: 'VN', brands: ['Renault'], status: 'En cours', progress: 64, budget: 18000, spent: 11520, due: '2026-10-11', owner: 'Camille R.', tasks: ['Réserver le traiteur', 'Kakémonos 2×', 'Emailing J-7', 'Jeu concours'] },
  { id: 'p2', name: 'Salon de l’auto — Rodez', site: 'Rodez', service: 'VN', brands: ['Renault', 'Alpine'], status: 'En retard', progress: 38, budget: 26500, spent: 14200, due: '2026-09-30', owner: 'Hugo M.', tasks: ['Stand 36 m²', 'Transport véhicules', 'Hôtesses'] },
  { id: 'p3', name: 'Campagne APV hiver', site: 'Réseau', service: 'APV', brands: ['Renault', 'Dacia'], status: 'En cours', progress: 22, budget: 42000, spent: 6100, due: '2026-11-15', owner: 'Léa B.', tasks: ['Brief agence', 'Spots radio', 'Affichage 4×3'] },
  { id: 'p4', name: 'Alpine A290 — soirée clients', site: 'Vichy', service: 'VN', brands: ['Alpine'], status: 'Planifié', progress: 8, budget: 12000, spent: 0, due: '2026-12-04', owner: 'Camille R.', tasks: ['Lieu', 'Invitations', 'Photographe'] },
  { id: 'p5', name: 'Dacia Bigster — essais', site: 'Le Puy', service: 'VN', brands: ['Dacia'], status: 'En cours', progress: 81, budget: 9000, spent: 7650, due: '2026-10-02', owner: 'Hugo M.', tasks: ['Parcours', 'Assurance', 'Relance leads'] },
  { id: 'p6', name: 'Nissan Qashqai — digital', site: 'Réseau', service: 'VN', brands: ['Nissan'], status: 'En cours', progress: 55, budget: 15000, spent: 8900, due: '2026-10-20', owner: 'Léa B.', tasks: ['Meta Ads', 'Landing page', 'Retargeting'] },
  { id: 'p7', name: 'VO — week-end reprise', site: 'Moulins', service: 'VO', brands: ['Renault', 'Dacia'], status: 'Terminé', progress: 100, budget: 6000, spent: 5870, due: '2026-09-14', owner: 'Tom D.', tasks: ['Radio locale', 'Flyers', 'SMS'] },
  { id: 'p8', name: 'Signalétique atelier', site: 'Thiers', service: 'APV', brands: ['Renault'], status: 'En retard', progress: 45, budget: 21000, spent: 12400, due: '2026-09-22', owner: 'Tom D.', tasks: ['Relevé', 'BAT', 'Pose'] },
  { id: 'p9', name: 'Mobilize — lancement', site: 'Clermont', service: 'VN', brands: ['Mobilize'], status: 'Planifié', progress: 0, budget: 8000, spent: 0, due: '2027-01-12', owner: 'Léa B.', tasks: ['Kit presse', 'Vidéo'] },
];
G.months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
G.plan = [120, 110, 140, 130, 150, 125, 95, 80, 160, 170, 150, 120];
G.real = [118, 96, 151, 124, 139, 131, 88, 71, 172, 0, 0, 0];
G.eur = (n) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n) + ' €';
G.statusBadge = (s) => `<span class="badge ${s === 'En retard' ? 'danger' : s === 'Terminé' ? 'ok' : s === 'Planifié' ? '' : 'warn'}"><i class="dot"></i>${s}</span>`;
G.date = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

/* ---------- 5. Contenus partagés (même contenu, coques différentes) ---------- */
G.kpis = () => [
  { k: 'Budget consommé', v: G.eur(1041540), sub: 'sur 1 480 800 € · 70 %', bar: 70 },
  { k: 'Projets actifs', v: '31', sub: '12 en retard', tone: 'warn' },
  { k: 'Reste à engager', v: G.eur(439260), sub: 'jusqu’au 31 déc.' },
  { k: 'Posts planifiés', v: '18', sub: 'sur les 14 prochains jours' },
];
G.renderChart = () => {
  const max = Math.max(...G.plan, ...G.real);
  return `<div class="chart-bars">${G.months.map((m, i) => `
    <div><div class="pair"><div class="b plan" style="height:${(G.plan[i] / max) * 100}%;animation-delay:${i * 22}ms"></div><div class="b real" style="height:${(G.real[i] / max) * 100}%;animation-delay:${80 + i * 22}ms"></div></div>
    <span>${m}</span></div>`).join('')}</div>`;
};
G.renderDonut = () => {
  const parts = [['VN', 44, 'var(--bony-orange)'], ['VO', 21, 'var(--bony-violet)'], ['APV', 24, '#2f7cf6'], ['PR', 11, 'var(--text-3)']];
  let acc = 0; const stops = parts.map(([, v, c]) => { const s = `${c} ${acc}% ${acc + v}%`; acc += v; return s; }).join(',');
  return `<div style="display:flex;align-items:center;gap:20px">
    <div class="donut" style="width:120px;height:120px;border-radius:50%;background:conic-gradient(${stops});-webkit-mask:radial-gradient(circle,transparent 54%,#000 55%);mask:radial-gradient(circle,transparent 54%,#000 55%);animation:spin-in var(--t-slow) var(--spring-soft) both"></div>
    <div style="display:grid;gap:8px">${parts.map(([n, v, c]) => `<div style="display:flex;align-items:center;gap:8px"><i class="dot" style="color:${c};width:8px;height:8px"></i><b style="width:36px">${n}</b><span class="muted num">${v} %</span></div>`).join('')}</div></div>`;
};
G.renderUpcoming = () => G.projects.filter((p) => p.status !== 'Terminé').sort((a, b) => a.due.localeCompare(b.due)).slice(0, 4).map((p) => `
  <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--line)">
    <div style="width:40px;text-align:center"><div class="label" style="font-size:10px">${G.date(p.due).split(' ')[1]}</div><div style="font-size:18px;font-weight:700" class="num">${G.date(p.due).split(' ')[0]}</div></div>
    <div style="flex:1;min-width:0"><div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div><div class="faint">${p.site} · ${p.owner}</div></div>
    ${G.statusBadge(p.status)}</div>`).join('');

G.renderProjectDetail = (p) => `
  <div class="pd-head">
    <div class="label">${p.site} · ${p.service} · ${p.brands.join(' / ')}</div>
    <h2 class="pd-title" style="font-size:26px;margin:6px 0 10px;font-weight:700;letter-spacing:-.02em">${p.name}</h2>
    <div style="display:flex;gap:8px;align-items:center">${G.statusBadge(p.status)}<span class="badge">${G.icon('clock')} ${G.date(p.due)}</span><span class="badge">${G.icon('user')} ${p.owner}</span></div>
  </div>
  <div class="pd-grid">
    <div class="card" style="padding:16px"><div class="label">Avancement</div><div style="font-size:28px;font-weight:700;margin:6px 0 10px" class="num">${p.progress} %</div><div class="bar"><i style="width:${p.progress}%"></i></div></div>
    <div class="card" style="padding:16px"><div class="label">Budget</div><div style="font-size:28px;font-weight:700;margin:6px 0 4px" class="num">${G.eur(p.spent)}</div><div class="faint">sur ${G.eur(p.budget)}</div></div>
  </div>
  <div class="card" style="padding:6px 16px 10px;margin-top:12px"><div class="label" style="padding:10px 0 4px">Tâches</div>
    ${p.tasks.map((t, i) => `<div class="task" style="--i:${i}"><span class="chk ${i < Math.round(p.tasks.length * p.progress / 100) ? 'on' : ''}"></span>${t}</div>`).join('')}
  </div>`;

/* ---------- 6. Spotlight ⌘K ---------- */
G.onOpenApp = () => {}; G.onOpenProject = () => {};
function buildSpotlight() {
  const veil = document.createElement('div'); veil.className = 'spot-veil';
  const box = document.createElement('div'); box.className = 'spot glass';
  box.innerHTML = `<span class="ico">${G.icon('search')}</span><input placeholder="Rechercher une rubrique, un projet…" /><ul class="scroll"></ul>`;
  document.body.append(veil, box);
  const input = box.querySelector('input'), ul = box.querySelector('ul');
  let items = [], sel = 0;
  const render = () => {
    const q = input.value.trim().toLowerCase();
    const apps = G.apps.filter((a) => !q || a.name.toLowerCase().includes(q)).map((a) => ({ t: 'app', a }));
    const pr = G.projects.filter((p) => q && (p.name + p.site).toLowerCase().includes(q)).map((p) => ({ t: 'proj', p }));
    items = [...pr, ...apps].slice(0, 9); sel = Math.min(sel, items.length - 1);
    ul.innerHTML = (pr.length ? '<div class="group label">Projets</div>' : '') +
      items.map((it, i) => (it.t === 'app' && i === pr.length ? '<div class="group label">Rubriques</div>' : '') +
        (it.t === 'app'
          ? `<li data-i="${i}" aria-selected="${i === sel}">${G.appIcon(it.a, 26)}<span>${it.a.name}</span><span class="kbd">↵</span></li>`
          : `<li data-i="${i}" aria-selected="${i === sel}">${G.icon('projects')}<span>${it.p.name}</span><span class="faint">${it.p.site}</span></li>`)).join('');
  };
  const pick = (i) => { const it = items[i]; if (!it) return; close(); it.t === 'app' ? G.onOpenApp(it.a.id) : G.onOpenProject(it.p.id); };
  const open = () => { input.value = ''; sel = 0; render(); veil.classList.add('open'); box.classList.add('open'); setTimeout(() => input.focus(), 10); };
  const close = () => { veil.classList.remove('open'); box.classList.remove('open'); input.blur(); };
  G.spotlight = { open, close };
  input.addEventListener('input', () => { sel = 0; render(); });
  ul.addEventListener('click', (e) => { const li = e.target.closest('li'); if (li) pick(+li.dataset.i); });
  veil.addEventListener('click', close);
  addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); box.classList.contains('open') ? close() : open(); }
    if (!box.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowDown') { sel = (sel + 1) % items.length; render(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = (sel - 1 + items.length) % items.length; render(); e.preventDefault(); }
    if (e.key === 'Enter') pick(sel);
  });
}

/* ---------- 7. Barre de test : FPS, effets, thème ---------- */
function buildDevbar() {
  const bar = document.createElement('div'); bar.className = 'devbar glass';
  bar.innerHTML = `<a href="index.html">← Maquettes</a><span class="fps num">— fps</span><button data-k="fx">Effets : complets</button><button data-k="th">Thème</button>`;
  document.body.append(bar);
  const root = document.documentElement, fx = bar.querySelector('[data-k=fx]');
  const saved = (k) => { try { return localStorage.getItem('gx-maq-' + k); } catch (e) { return null; } };
  const save = (k, v) => { try { localStorage.setItem('gx-maq-' + k, v); } catch (e) {} };
  const setFx = (v) => { root.dataset.effects = v; fx.textContent = 'Effets : ' + (v === 'eco' ? 'économes' : 'complets'); save('fx', v); };
  setFx(saved('fx') || 'full');
  if (saved('th')) root.dataset.theme = saved('th');
  fx.onclick = () => setFx(root.dataset.effects === 'eco' ? 'full' : 'eco');
  bar.querySelector('[data-k=th]').onclick = () => {
    const apply = () => { root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light'; save('th', root.dataset.theme); };
    if (document.startViewTransition) document.startViewTransition(apply).ready.catch(() => {}); else apply();
  };
  // Compteur d'images par seconde : ce que ressentiront les PC du réseau
  const el = bar.querySelector('.fps'); let n = 0, last = performance.now();
  const loop = (t) => { n++; if (t - last >= 500) { const f = Math.round((n * 1000) / (t - last)); el.textContent = f + ' fps'; el.style.color = f < 45 ? 'var(--danger)' : f < 55 ? 'var(--warn)' : 'var(--ok)'; n = 0; last = t; } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}

document.addEventListener('DOMContentLoaded', () => { buildSpotlight(); buildDevbar(); });

/* Styles partagés des contenus (icône d'app, tâches, détail projet) */
document.head.insertAdjacentHTML('beforeend', `<style>
.app-ico{width:var(--s);height:var(--s);border-radius:calc(var(--s)*.26);display:grid;place-items:center;color:#fff;flex:none;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.35),inset 0 -1px 0 rgba(0,0,0,.15),0 4px 10px -4px rgba(0,0,0,.5)}
.app-ico svg{width:calc(var(--s)*.5);height:calc(var(--s)*.5);stroke-width:1.9}
.task{display:flex;align-items:center;gap:10px;height:38px;border-top:1px solid var(--line);animation:fade-up var(--t-med) var(--spring-soft) both;animation-delay:calc(var(--i)*40ms)}
.chk{width:16px;height:16px;border-radius:5px;box-shadow:inset 0 0 0 1.5px var(--line-2)}
.chk.on{background:var(--bony-grad);box-shadow:none}
.pd-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px}
@keyframes fade-up{from{opacity:0;transform:translateY(8px)}}
@keyframes spin-in{from{transform:rotate(-90deg) scale(.8);opacity:0}}
</style>`);
