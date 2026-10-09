// @ts-nocheck — moteur de la maquette CONVERTI (maquettes/v2/js/widgets.js), comportement identique.
// Typage fin : second temps, fichier par fichier, une fois le rendu validé identique à la maquette.
// Substitutions mécaniques : scripts/ui2-convert-engine.mjs. Retouches manuelles : balises [GEARBOX].
export function install(): void {
const GX = (window as any).GX; // lu au démarrage (le noyau l'a créé), pas à l'import
/* =====================================================================
   GEARBOX OS — bureau personnalisable (widgets)
   Chaque utilisateur compose son propre tableau de bord sur le bureau :
   clic droit › « Modifier le bureau » → galerie de widgets par rubrique.
   Manipulation directe, sans passer par le mode édition : appui long ou
   glisser pour soulever un widget (les voisins s'écartent en ressort),
   poignée en bas à droite pour le redimensionner (aimanté sur ses tailles
   autorisées), configuration (projet épinglé, indicateur, raccourcis…), retrait.
   La disposition est mémorisée par utilisateur. Les widgets respectent
   les droits du rôle (une rubrique interdite = widget indisponible).
   ===================================================================== */
(() => {
  const W = (GX.widgets = {});
  const D = GX.data, F = GX.fmt;
  const CELL = 84, GAP = 12, STEP = CELL + GAP;
  /* Tailles en cellules [colonnes, rangées]. Les noms historiques (S…XXL) restent valides pour les
     dispositions déjà mémorisées ; W, T, M3, X3, XXW sont les crans intermédiaires du redimensionnement. */
  const SIZES = { S: [2, 2], W: [3, 2], T: [2, 4], M: [4, 2], M3: [4, 3], L: [4, 4], XL: [6, 2], X3: [6, 3], XXL: [6, 4], XXW: [8, 4] };
  const SIZE_L = { S: 'Petit', W: 'Petit large', T: 'Colonne', M: 'Moyen', M3: 'Moyen haut', L: 'Grand', XL: 'Bandeau', X3: 'Bandeau haut', XXL: 'Très grand', XXW: 'Panorama' };
  /* [GEARBOX] Formats LIBRES (09/10/2026, refonte des widgets) : une taille est soit un nom historique (S…XXW), soit
     « LxH » en cases (« 5x3 »). La poignée s'aimante CASE PAR CASE entre les bornes du widget (CAT.min / CAT.max ; à
     défaut : la plus petite taille nommée et 12 × 8). Le nom historique est repris quand il correspond (téléphone). */
  const parseSz = (sz) => { const m = /^(\d+)x(\d+)$/.exec(sz || ''); return m ? [+m[1], +m[2]] : null; };
  const dim = (sz) => SIZES[sz] || parseSz(sz) || SIZES.S;
  const sizeOf = (cw, ch) => Object.keys(SIZES).find((k) => SIZES[k][0] === cw && SIZES[k][1] === ch) || `${cw}x${ch}`;
  const small = (sz) => { const [w, h] = dim(sz); return w <= 2 && h <= 2; };
  const bounds = (c) => { const ds = c.sizes.map(dim); return { min: c.min || [Math.min(...ds.map((d) => d[0])), Math.min(...ds.map((d) => d[1]))], max: c.max || [12, 8] }; };
  const resizable = (c) => { const b = bounds(c); return b.min[0] !== b.max[0] || b.min[1] !== b.max[1]; };
  const sizeName = (sz) => SIZE_L[sz] || 'Sur mesure';
  /* Un widget qui plante affiche « Indisponible » (et l'erreur part en console) au lieu d'un cadre vide. */
  const indispo = (e, name = '') => { console.error('[widget]', name, e); return `<div class="wt"><span class="ellipsis grow">${GX.esc(name)}</span></div><div class="faint" style="margin:auto;font-size:12.5px">Indisponible</div>`; };
  /* ---------------- Widgets en React (09/10/2026) ----------------
     Un widget peut héberger un composant React (To-do, Ma journée, Forms) : son rendu pose un emplacement
     `[data-wreact]`, remplacé après chaque rendu par un hôte PERSISTANT (une div par widget) dans lequel
     ui2/apps/widgets/ReactWidgets.tsx rend le composant par portail. L'hôte survit aux re-rendus du bureau (pastilles,
     messages…) : le composant garde son état (filtres, défilement). */
  const rHosts = new Map(), rListeners = new Set();
  let rSnap = [];
  const rEmit = () => { rSnap = [...rHosts.entries()].map(([wid, v]) => ({ wid, ...v })); rListeners.forEach((f) => f()); };
  const reactSlot = (w, kind, icon, title) => (w
    ? `<div class="wreact-slot" data-wreact="${kind}" data-wid="${w.id}"></div>`
    : `${head(icon, title)}<div class="wreact-prev"><i></i><i></i><i></i><i></i></div>`);   // aperçu de la galerie
  W.react = { snapshot: () => rSnap, subscribe(f) { rListeners.add(f); return () => rListeners.delete(f); } };
  W.adopt = (scope) => {
    if (!scope) return; let changed = false;
    scope.querySelectorAll('[data-wreact][data-wid]').forEach((ph) => {
      const wid = ph.dataset.wid, kind = ph.dataset.wreact; if (!wid) return;
      let r = rHosts.get(wid);
      if (!r || r.kind !== kind) { const host = document.createElement('div'); host.className = 'wreact'; host.dataset.wreact = kind; r = { host, kind }; rHosts.set(wid, r); changed = true; }
      ph.replaceWith(r.host);
    });
    if (layout) for (const wid of [...rHosts.keys()]) if (!layout.some((w) => w.id === wid)) { rHosts.delete(wid); changed = true; }
    if (changed) rEmit();
  };
  /* Tâches assignées (mêmes règles que la To-do : ui2/apps/todo/board.ts), fournies par le côté React (GX.todo). */
  const myTasks = () => (GX.todo?.items?.() || []).filter((it) => it.t.status !== 'Done').sort((a, b) => a.ref.localeCompare(b.ref));
  const urg = (it) => GX.todo?.urgency?.(it) || { txt: '', cls: '' };
  const dimL = (sz) => dim(sz).join(' × ');
  /* Nombre de lignes qui tiennent dans la hauteur du widget (ligne de `row` px, en-tête + marges = `extra`) */
  const fit = (sz, row = 30, extra = 64) => Math.max(1, Math.floor((dim(sz)[1] * STEP - GAP - extra) / row));
  const narrow = (sz) => dim(sz)[0] <= 2, wideSz = (sz) => dim(sz)[0] >= 6;
  const today = () => GX.iso(GX.today());
  const act = () => D.PROJECTS.filter((p) => p.status !== 'Draft');
  /* [GEARBOX] Montants : moteur du Dashboard (computeDashboardStats, réglages par défaut) — jamais recalculés ici.
     Listes (retards, échéances, publications) : les MÊMES que le Dashboard. */
  const planned = () => D.stats?.totalForecast || 0;
  const spent = () => D.stats?.totalActual || 0;
  const lateList = () => (D.stats?.projetsEnRetard || []).map((x) => D.project(x.id)).filter(Boolean);
  const deadlineList = () => (D.stats?.deadlines || []).map((x) => D.project(x.id)).filter(Boolean);
  const postList = () => (D.stats?.upcomingPosts || []).map((x) => D.POSTS.find((p) => p.id === x.id)).filter(Boolean);
  const head = (icon, t, extra = '') => `<div class="wt">${GX.appGlyph ? GX.appGlyph(icon) : GX.icon(icon, 'sm')}<span class="ellipsis grow">${t}</span>${extra}</div>`;
  const row = (l, r, s = '') => `<div class="wr"><span class="ellipsis grow">${l}</span>${r ? `<b class="num">${r}</b>` : ''}${s}</div>`;

  /* ---------------- Widget « Chat interactif » ----------------
     Liste compacte (Général, groupes, privés) + fil de la conversation choisie + saisie.
     [GEARBOX] Branché sur le serveur par GX.chatFeed (ui2/os/DataHub.tsx) : fil réel de la conversation
     affichée (chargé à l'affichage, suivi en direct), envoi et réactions par les mêmes événements socket que
     la rubrique Chat, conversation affichée marquée lue. Plus aucune réponse simulée (01/10/2026 ; avant :
     faux « dernier message » attribué à soi-même, envoi qui ouvrait le Chat). Les clics dans le widget n'ouvrent PAS
     l'app (écoute en capture) — sauf le bouton « Ouvrir » et le titre, qui ouvrent la
     conversation dans l'app Chat (commande 'conv:<id>'). Rôles sans chat (Chef de site) :
     widget indisponible via allowed(). External : pas de Chat Général, projet cité neutre. */
  /* [GEARBOX] utilisateur courant = id réel */
  const CH_REACTS = ['👍', '❤️', '😂', '😮'], chDraft = {};
  /* [GEARBOX] Chat Général : appartenance IMPLICITE côté serveur (participants vides) — visible de tous sauf External. */
  const chVisible = () => D.CONVS.filter((c) => (c.kind === 'general' ? GX.ctx.role !== 'External' : c.members.includes(GX.ctx.uid)));
  const chMsgs = (c) => D.MESSAGES[c.id] || [];
  /* Dernier message : celui du fil s'il est chargé, sinon l'aperçu serveur de la conversation (sans auteur). */
  const chLast = (c) => { const a = chMsgs(c); return a[a.length - 1] || (c.last ? { id: '', u: null, t: c.last, at: c.lastAt || 0, type: 'preview', r: {} } : undefined); };
  const chOther = (c) => c.members.find((u) => u !== GX.ctx.uid) || GX.ctx.uid;
  const chTitle = (c) => (c.kind === 'dm' ? D.user(chOther(c)).name : c.name);
  const chFirst = (u) => (u === GX.ctx.uid ? 'Vous' : D.user(u).name.split(' ')[0]);
  const chOrder = () => { const v = chVisible(), s = (a) => a.sort((x, y) => (y.pinned ? 1 : 0) - (x.pinned ? 1 : 0) || (chLast(y)?.at || 0) - (chLast(x)?.at || 0)); return [...v.filter((c) => c.kind === 'general'), ...s(v.filter((c) => c.kind === 'group')), ...s(v.filter((c) => c.kind === 'dm'))]; };
  const chConv = (cfg = {}) => { const v = chOrder(); return v.find((c) => c.id === cfg.conv) || v[0]; };
  const chHhmm = (at) => new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const chText = (m) => (!m ? '' : m.deleted ? 'Message supprimé' : m.expired ? '📎 Pièce jointe expirée' : ({ image: '📷 Image', file: '📎 ' + String(m.file || 'Pièce jointe').split(' · ')[0], voice: '🎤 Message vocal' + (m.dur ? ` (${m.dur})` : ''), project: '📋 ' + (GX.ctx.role === 'External' ? 'Projet cité' : D.project(m.project)?.name || 'Projet cité'), gif: '🎞️ GIF' + (m.gif ? ' · ' + m.gif : '') }[m.type] ?? (m.t || '')));
  const chPrev = (c, m) => (!m ? 'Aucun message' : m.type === 'sys' || m.type === 'preview' ? m.t : (m.u === GX.ctx.uid ? 'Vous : ' : c.kind !== 'dm' ? chFirst(m.u) + ' : ' : '') + chText(m));
  function chAv(c, s) {
    if (c.kind === 'dm') return GX.r.av(chOther(c), '', { s, pres: true, tip: false });
    if (c.kind === 'general') return `<span class="wch-gav" style="--s:${s}px;background:var(--bony-grad)">#</span>`;
    if (c.photo) return `<span class="wch-gav" style="--s:${s}px;background:${GX.esc(D.avBg(c.photo))}"></span>`;
    const us = c.members.filter((u) => u !== GX.ctx.uid).slice(0, 2).map((u) => D.user(u));
    return `<span class="wch-duo" style="--d:${s}px">${us.map((u) => GX.r.av(u.id, '', { tip: false })).join('')}</span>`;
  }
  /* ---------------- Widget mIAouss : bloc d'information (re-rendu seul, le champ de saisie n'est jamais touché) ---------------- */
  let awDraft = '';
  const awHhmm = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  function awInfo() {
    const v = GX.assistantFeed?.get();
    if (!v?.capacity) return `<div class="faint" style="font-size:12px">${GX.assistantFeed ? 'Chargement…' : 'Indisponible'}</div>`;
    const ps = (v.capacity.providers || []).filter((p) => p.configured);
    const pct = ps.length ? ps.reduce((s, p) => s + Math.max(0, Math.min(1, p.share || 0)), 0) / ps.length : 0;
    const col = pct > 0.5 ? 'var(--ok)' : pct >= 0.2 ? 'var(--warn)' : 'var(--danger)';
    const left = Math.max(0, Math.round(v.capacity.questionsLeft || 0));
    const rest = ps.length > 0 && ps.every((p) => p.resting), until = rest ? Math.min(...ps.map((p) => p.until || Infinity)) : 0;
    return `<div class="aw-gauge"><i style="width:${Math.round(pct * 100)}%;background:${col}"></i></div>
      <div class="aw-n"><b class="num">~${F.n(left)}</b> question${left > 1 ? 's' : ''} restante${left > 1 ? 's' : ''} aujourd’hui</div>
      ${rest && Number.isFinite(until) ? `<div class="faint" style="font-size:11.5px">Repart vers ${awHhmm(until)}</div>` : ''}`;
  }
  GX.on('assistant:usage', () => { GX.root.querySelectorAll('.aw[data-aw] .aw-info').forEach((el) => { el.innerHTML = awInfo(); }); });
  /* Au plus une lecture toutes les 2 min (le pont refuse en dessous de 30 s) ; rien si aucun widget affiché ou onglet caché. */
  const awTick = () => { if (!document.hidden && GX.root.querySelector('.aw[data-aw]')) GX.assistantFeed?.refresh(); };
  setInterval(awTick, 120000);
  GX.win(document, 'visibilitychange', awTick);
  GX.win(document, 'input', (e) => { const i = e.target.closest?.('.aw [data-aq]'); if (i) awDraft = i.value; });
  /* Un clic sur le widget (hors champ, hors mode édition) ouvre le volet de la mascotte. */
  GX.win(document, 'click', (e) => { const w = e.target.closest?.('.aw[data-aw]'); if (!w || e.target.closest('input') || w.closest('.editing')) return; GX.assistant?.open(); });
  GX.win(document, 'keydown', (e) => {
    const i = e.target.closest?.('.aw [data-aq]'); if (!i) return;
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault(); e.stopPropagation();
      const q = i.value.trim(); if (!q || !GX.assistant?.available) return;
      GX.assistant.open(q);   /* le volet de la mascotte (déjà ouvert : la question part tout de suite) */
      awDraft = ''; i.value = '';
    } else if (e.key === 'Escape') { e.stopPropagation(); i.blur(); }
  }, true);
  function chatLive(sz, cfg = {}, w) {
    const all = chOrder(), c = chConv(cfg), n = all.reduce((s, x) => s + (x.unread || 0), 0);
    if (!c) return `<div class="wch">${head('chat', 'Chat')}<div class="faint" style="margin:auto">Aucune conversation</div></div>`;
    const [dw, dh] = dim(sz), wide = dw >= 6;
    const list = all.map((x) => `<button class="wch-it ${x.id === c.id ? 'on' : ''} ${x.unread ? 'unread' : ''}" data-wc="sel" data-conv-id="${x.id}"${wide ? '' : ` data-tip="${GX.esc(chTitle(x))}"`} aria-label="${GX.esc(chTitle(x))}">
        <span class="wch-avw">${chAv(x, wide ? 28 : 32)}${x.unread ? `<i class="count">${x.unread > 99 ? '99+' : x.unread}</i>` : ''}</span>
        ${wide ? `<span class="wch-itx"><b class="ellipsis">${GX.esc(chTitle(x))}</b>${dh >= 4 ? `<span class="ellipsis">${GX.esc(chPrev(x, chLast(x)))}</span>` : ''}</span>` : ''}</button>`).join('');
    const feed = GX.chatFeed, ready = !feed || feed.isLoaded(c.id);
    if (feed && !ready) feed.load(c.id);           // [GEARBOX] fil réel, chargé une fois (puis suivi en direct)
    const arr = chMsgs(c).slice(dh <= 2 ? -8 : -16);
    const same = (a, b) => a && b && a.type !== 'sys' && b.type !== 'sys' && a.u === b.u && Math.abs(a.at - b.at) < 5 * 6e4;
    const th = arr.map((m, i) => {
      if (m.type === 'sys') return `<div class="wch-sys">${GX.esc(m.t)}</div>`;
      const mine = m.u === GX.ctx.uid, u = D.user(m.u), f = !same(arr[i - 1], m), rs = Object.entries(m.r || {}).filter(([, us]) => us.length);
      return `<div class="wch-m ${mine ? 'me' : ''} ${f ? 'first' : ''}" data-wmsg="${m.id}">
        ${mine ? '' : f ? GX.r.av(m.u, '', { s: 22 }) : '<span class="wch-sp"></span>'}
        <div class="wch-mc">${f && !mine && c.kind !== 'dm' ? `<span class="wch-au" style="color:${u.color}">${GX.esc(chFirst(m.u))}</span>` : ''}
          <div class="wch-b ${m.deleted || m.expired ? 'del' : ''}">${GX.esc(chText(m))}${m.edited ? ' <span class="wch-h">(modifié)</span>' : ''}<span class="wch-h">${chHhmm(m.at)}</span></div>
          ${rs.length && !m.deleted ? `<div class="wch-rs">${rs.map(([e, us]) => `<button data-wc="react" data-e="${e}" class="${us.includes(GX.ctx.uid) ? 'mine' : ''}">${e}<span>${us.length}</span></button>`).join('')}</div>` : ''}
        </div>
        ${m.deleted ? '' : `<div class="wch-rx">${CH_REACTS.map((e) => `<button data-wc="react" data-e="${e}" aria-label="Réagir ${e}">${e}</button>`).join('')}</div>`}
      </div>`;
    }).join('') || `<div class="wch-empty">${ready ? 'Aucun message — dites bonjour 👋' : 'Chargement…'}</div>`;
    const to = c.kind === 'dm' ? 'à ' + chFirst(chOther(c)) : 'dans ' + chTitle(c);
    return `<div class="wch sz-${sz} ${wide ? 'cw-w' : 'cw-n'} ${dh <= 2 ? 'ch-2' : dh >= 4 ? 'ch-4' : ''}" data-wid="${w ? w.id : ''}">
      <div class="wt wch-t">${GX.appGlyph ? GX.appGlyph('chat') : GX.icon('chat', 'sm')}<span class="ellipsis grow">Chat <span class="wch-ct">· ${GX.esc(chTitle(c))}</span></span>${n ? `<span class="count">${n > 99 ? '99+' : n}</span>` : ''}<button class="icon-btn sm" data-wc="open" data-tip="Ouvrir la conversation dans Chat">${GX.icon('maximize', 'sm')}</button></div>
      <div class="wch-body" data-wc-zone>
        <div class="wch-list scroll">${list}</div>
        <div class="wch-conv">
          <div class="wch-thread scroll"><div class="wch-inner">${th}</div></div>
          <div class="wch-comp"><input class="wch-in" data-wc-in placeholder="Message ${GX.esc(to)}…" value="${GX.esc(chDraft[(w ? w.id : '') + c.id] || '')}" autocomplete="off" maxlength="2000" /><button class="wch-send" data-wc="send" data-tip="Envoyer (Entrée)" aria-label="Envoyer">${GX.icon('arrowup', 'sm')}</button></div>
        </div>
      </div></div>`;
  }

  /* ---------------- Catalogue ---------------- */
  const CAT = {
    'budget-ring': { app: 'budget', name: 'Budget de l’année', sizes: ['S', 'M', 'M3'], render(sz) {
      const p = planned(), s = spent(), pct = p ? Math.round((s / p) * 100) : 0; /* [GEARBOX] pas de NaN pendant le chargement */
      if (small(sz)) return `${head('budget', 'Budget ' + new Date().getFullYear())}<div class="row" style="margin-top:auto;gap:10px"><div class="ring" style="--p:${Math.min(100, pct)};--sz:62px;--th:8px"></div><div><div class="wv num" style="font-size:24px">${pct} %</div><div class="faint" style="font-size:11px">${F.eurK(s)}</div></div></div>`;
      const mix = Object.fromEntries(D.SERVICES.map((x) => [x, (D.stats?.serviceChartData || []).find((d) => d.name === x)?.value || 0])); /* [GEARBOX] mix du Dashboard */
      return `${head('budget', 'Budget ' + new Date().getFullYear(), `<span class="faint">${pct} %</span>`)}<div class="row" style="gap:14px;margin-top:auto"><div class="ring" style="--p:${Math.min(100, pct)};--sz:84px;--th:10px"></div><div class="grow" style="display:grid;gap:5px">${D.SERVICES.map((x) => `<div class="row" style="gap:6px;font-size:12px"><i class="brand-dot" style="--c:${D.SERVICE_COLOR[x]}"></i><b style="width:30px">${x}</b><span class="grow"></span><span class="num muted">${F.eurK(mix[x])}</span></div>`).join('')}</div></div>
        ${dim(sz)[1] >= 3 ? `<div class="wtiles" style="margin-top:12px"><div><span class="faint">Prévu</span><b class="num">${F.eurK(p)}</b></div><div><span class="faint">Engagé</span><b class="num">${F.eurK(s)}</b></div><div><span class="faint">Reste</span><b class="num" style="color:${p - s < 0 ? 'var(--danger)' : 'inherit'}">${F.eurK(p - s)}</b></div></div>` : ''}`;
    } },
    'budget-sites': { app: 'budget', name: 'Top sites consommés', sizes: ['M', 'M3', 'L', 'X3'], render(sz) {
      const by = Object.fromEntries((D.stats?.topSites || []).map((x) => [x.name, x.value])); /* [GEARBOX] « Top consommateurs » du Dashboard (resolveSiteAlias, splitShareToBuckets) */
      const items = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, fit(sz, 36, 60) * (wideSz(sz) ? 2 : 1)).map(([l, v]) => ({ label: l, value: v }));
      if (wideSz(sz)) { const h = Math.ceil(items.length / 2); return `${head('budget', 'Top sites consommés')}<div class="wcols2" style="margin-top:10px">${GX.chart.hbars({ items: items.slice(0, h) })}${GX.chart.hbars({ items: items.slice(h), max: items[0]?.value })}</div>`; }
      return `${head('budget', 'Top sites consommés')}<div style="margin-top:10px">${GX.chart.hbars({ items })}</div>`;
    } },
    kpi: { app: 'dashboard', name: 'Indicateur', sizes: ['S'], max: [4, 3], cfg: 'kpi', render(sz, c = {}) {
      const k = c.kpi || 'actifs', p = planned(), s = spent();
      const t0 = today(), mon = GX.iso(GX.addDays(GX.today(), -((GX.today().getDay() + 6) % 7))), sun = GX.iso(GX.addDays(GX.today(), 6 - ((GX.today().getDay() + 6) % 7)));
      const K = { actifs: ['Projets actifs', D.stats?.activeProjectsCount ?? 0, 'en cours de réalisation', 'layers'],
        taches: ['Mes tâches en retard', myTasks().filter((it) => !it.noDate && it.ref < t0).length, 'échéance dépassée', 'todo'],
        posts: ['Publications', D.POSTS.filter((p) => !p.archived && p.date >= mon && p.date <= sun).length, 'cette semaine', 'digital'],
        absents: ['Absents', new Set(D.CONGES.filter((c) => c.date === t0).map((c) => c.u)).size, 'aujourd’hui', 'conges'], reste: ['Reste à engager', F.eurK(p - s), p - s < 0 ? 'dépassement' : 'disponible', 'target'],
        conso: ['Consommation', (p ? Math.round((s / p) * 100) : 0) + ' %', 'du budget annuel', 'percent'], campagnes: ['Campagnes programmées', D.stats?.activeCampaignsCount ?? 0, 'SMS / e-mail', 'campaigns'],
        retard: ['Projets en retard', lateList().length, 'échéance dépassée', 'alert'] }[k];
      return `<div class="wt">${GX.icon(K[3], 'sm')}<span class="ellipsis grow">${K[0]}</span></div><div class="wv num">${K[1]}</div><div class="faint" style="font-size:12px">${K[2]}</div>`;
    } },
    late: { app: 'projects', name: 'Projets en retard', sizes: ['S', 'M', 'M3', 'L'], accent: true, render(sz) {
      const L = lateList();
      if (small(sz)) return `${head('projects', 'En retard')}<div class="wv num">${L.length}</div><div class="faint" style="font-size:12px">projets à reprendre</div>`;
      return `${head('projects', 'Projets en retard', `<b>${L.length}</b>`)}<div class="wl">${L.slice(0, fit(sz)).map((p) => `<div class="wr" data-proj="${p.id}"><span class="ellipsis grow">${GX.esc(p.name)}</span><span class="num" style="opacity:.85">${F.rel(p.endDate)}</span></div>`).join('') || '<div class="faint">Aucun retard 🎉</div>'}</div>`;
    } },
    deadlines: { app: 'projects', name: 'Prochaines échéances', sizes: ['M', 'M3', 'L', 'X3'], max: [10, 8], cfg: 'deadlines', render(sz, c = {}) {
      /* [GEARBOX] 09/10/2026 : projets ET tâches (les miennes) — option du widget. Fins de projet : liste du Dashboard. */
      const mode = c.mode || 'both', t0 = today();
      const P = mode === 'task' ? [] : deadlineList().map((p) => ({ d: p.endDate, n: p.name, sub: p.sites.join(', '), proj: p.id, k: 'Projet' }));
      const T = mode === 'proj' ? [] : myTasks().filter((it) => !it.noDate && it.ref >= t0).map((it) => ({ d: it.ref, n: it.t.name, sub: it.p ? it.p.name : 'Tâche libre', proj: it.p?.id, k: 'Tâche' }));
      const L = [...P, ...T].sort((a, b) => a.d.localeCompare(b.d)).slice(0, fit(sz) * (dim(sz)[0] >= 8 ? 2 : 1));
      const rowH = (x) => `<div class="wr" ${x.proj ? `data-proj="${x.proj}"` : ''}><b class="num" style="width:52px">${F.date(x.d)}</b>${mode === 'both' && !narrow(sz) ? `<span class="wk ${x.k === 'Tâche' ? 't' : ''}">${x.k}</span>` : ''}<span class="ellipsis grow">${GX.esc(x.n)}</span>${wideSz(sz) ? `<span class="faint ellipsis" style="max-width:34%">${GX.esc(x.sub)}</span>` : ''}</div>`;
      const body = dim(sz)[0] >= 8 ? `<div class="wcols2">${[L.slice(0, Math.ceil(L.length / 2)), L.slice(Math.ceil(L.length / 2))].map((h) => `<div class="wl">${h.map(rowH).join('')}</div>`).join('')}</div>` : `<div class="wl">${L.map(rowH).join('')}</div>`;
      return `${head('projects', 'Prochaines échéances')}${L.length ? body : '<div class="faint" style="margin:auto">Aucune échéance à venir</div>'}`;
    } },
    'project-pin': { app: 'projects', name: 'Projet épinglé', sizes: ['M', 'M3', 'L'], cfg: 'project', render(sz, c = {}) {
      const p = D.project(c.project) || act().find((x) => x.status === 'Active'); if (!p) return head('projects', 'Projet épinglé');
      const pr = D.projectProgress(p);
      return `${head('projects', 'Projet épinglé', GX.r.pStatus(p.status))}<div data-proj="${p.id}" style="cursor:pointer;margin-top:6px"><b style="font-size:15px" class="ellipsis" title="${GX.esc(p.name)}">${GX.esc(p.name)}</b><div class="faint ellipsis" style="font-size:12px">${p.sites.join(', ')} · ${F.date(p.startDate)} → ${F.date(p.endDate)}</div></div>
        <div class="row" style="margin-top:auto;gap:10px"><div class="grow"><div class="bar"><i style="width:${pr}%"></i></div><div class="row" style="font-size:11px;margin-top:4px"><span class="faint grow">${pr} % · ${p.tasks.length} tâches</span><b class="num">${F.eurK(D.projectActual(p))} / ${F.eurK(p.budgetPlanned)}</b></div></div></div>
        ${dim(sz)[1] >= 3 ? `<div class="wl" style="margin-top:10px">${p.tasks.slice(0, dim(sz)[1] >= 4 ? 5 : 2).map((t) => `<div class="wr"><span class="ellipsis grow">${GX.esc(t.name)}</span>${GX.r.tStatus(t.status)}</div>`).join('')}</div>` : ''}`;
    } },
    'my-tasks': { app: 'todo', name: 'Mes tâches', sizes: ['M', 'M3', 'L', 'T'], max: [10, 8], render(sz) {
      /* [GEARBOX] 09/10/2026 : tâches de projets ET tâches libres (règles de la To-do), case à cocher RÉELLE. */
      const all = myTasks(), ro = !GX.todo?.canEdit?.(), L = all.slice(0, fit(sz) * (dim(sz)[0] >= 8 ? 2 : 1));
      const rowH = (it) => { const u = urg(it); return `<div class="wr wtask"><input type="checkbox" class="check" data-task="${it.id}" aria-label="Terminer « ${GX.esc(it.t.name)} »"${ro ? ' disabled' : ''} /><span class="ellipsis grow" ${it.p ? `data-tproj="${it.p.id}"` : ''}>${GX.esc(it.t.name)}${narrow(sz) ? '' : ` <span class="faint">· ${GX.esc(it.p ? it.p.name : 'Libre')}</span>`}</span>${u.txt && !narrow(sz) ? `<span class="wdl-u ${u.cls}">${GX.esc(u.txt)}</span>` : ''}</div>`; };
      const body = dim(sz)[0] >= 8 ? `<div class="wcols2">${[L.slice(0, Math.ceil(L.length / 2)), L.slice(Math.ceil(L.length / 2))].map((h) => `<div class="wl">${h.map(rowH).join('')}</div>`).join('')}</div>` : `<div class="wl">${L.map(rowH).join('')}</div>`;
      return `${head('todo', 'Mes tâches', `<span class="faint">${all.length}</span>`)}${all.length ? body : `<div class="faint" style="margin:auto">${GX.todo ? 'Aucune tâche en cours 🎉' : 'Chargement…'}</div>`}`;
    } },
    posts: { app: 'digital', name: 'Prochaines publications', sizes: ['M', 'M3', 'L', 'T'], max: [10, 8], render(sz) {
      const L = postList().slice(0, fit(sz));
      return `${head('digital', narrow(sz) ? 'Publications' : 'Prochaines publications')}<div class="wl">${L.map((p) => `<div class="wr" data-post="${p.id}"><b class="num" style="width:${narrow(sz) ? 40 : 52}px">${F.date(p.date)}</b><span class="ellipsis grow">${GX.esc(p.title)}</span>${narrow(sz) ? `<i class="brand-dot" style="--c:${D.socialStatus(p.status).c}"></i>` : GX.r.sStatus(p.status)}${wideSz(sz) && p.networks?.length ? `<span class="row" style="gap:4px">${p.networks.slice(0, 4).map((n) => GX.r.net(n)).join('')}</span>` : ''}</div>`).join('') || '<div class="faint">Aucune publication à venir</div>'}</div>`;
    } },
    'digital-week': { app: 'digital', name: 'Planning digital · semaine', sizes: ['XL', 'X3'], render(sz) {
      const t = GX.today(), mon = GX.addDays(t, -((t.getDay() + 6) % 7)), tall = dim(sz)[1] >= 3;
      return `${head('digital', 'Planning digital de la semaine')}<div class="wweek ${tall ? 'tall' : ''}">${Array.from({ length: 7 }, (_, i) => { const d = GX.addDays(mon, i), iso = GX.iso(d), ps = D.POSTS.filter((p) => p.date === iso && !p.archived);
        return `<div class="wday ${iso === today() ? 'on' : ''}"><span class="faint">${F.day(d)}</span><b class="num">${d.getDate()}</b>${tall ? `<div class="wdl">${ps.slice(0, 3).map((p) => `<span style="--c:${D.socialStatus(p.status).c}" data-tip="${GX.esc(p.title)}">${GX.esc(p.title)}</span>`).join('')}${ps.length > 3 ? `<span class="faint">+${ps.length - 3}</span>` : ''}</div>` : `<div class="wdots">${ps.slice(0, 4).map((p) => `<i style="background:${D.socialStatus(p.status).c}" data-tip="${GX.esc(p.title)}"></i>`).join('')}</div><span class="faint" style="font-size:10px">${ps.length || ''}</span>`}</div>`; }).join('')}</div>`;
    } },
    campaigns: { app: 'campaigns', name: 'Performance des campagnes', sizes: ['M', 'M3'], render(sz) {
      /* [GEARBOX] moyennes sur les SEULS taux renseignés (un taux vide comptait pour 0 %, BUGS-CONNUS.md) */
      const c = act().flatMap((p) => p.tasks).filter((t) => ['SMS', 'E-mail'].includes(t.channel));
      const avg = (k) => { const v = c.map((t) => t[k]).filter((x) => x != null && x !== '' && Number.isFinite(+x)).map(Number); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
      const top = dim(sz)[1] >= 3 ? [...c].sort((a, b) => (b.openRate || 0) - (a.openRate || 0)).slice(0, 3) : [];
      return `${head('campaigns', 'Campagnes', `<span class="faint">${c.length}</span>`)}${top.length ? `<div class="wl">${top.map((t) => `<div class="wr"><span class="badge" style="--c:var(--info)">${GX.esc(t.channel)}</span><span class="ellipsis grow">${GX.esc(t.name)}</span><b class="num">${(t.openRate || 0).toFixed(0)} %</b></div>`).join('')}</div>` : ''}<div class="wtiles"><div><span class="faint">Contacts</span><b class="num">${F.n(c.reduce((s, t) => s + (t.volume || 0), 0))}</b></div><div><span class="faint">Ouverture</span><b class="num">${avg('openRate').toFixed(0)} %</b></div><div><span class="faint">Clics</span><b class="num">${avg('clickRate').toFixed(1)} %</b></div></div>`;
    } },
    chat: { app: 'chat', name: 'Chat', sizes: ['S', 'M', 'M3'], render(sz) {
      const n = D.CONVS.reduce((s, c) => s + c.unread, 0);
      if (small(sz)) return `${head('chat', 'Chat')}<div class="wv num">${n}</div><div class="faint" style="font-size:12px">messages non lus</div>`;
      /* [GEARBOX] Dernier message de chaque conversation visible : fil réel si chargé, sinon aperçu serveur (sans
         auteur → avatar de la conversation). Avant le 01/10/2026 : faux message sans auteur, avatar de soi-même. */
      const last = chVisible().map((c) => ({ c, m: chLast(c) })).filter((x) => x.m).sort((a, b) => b.m.at - a.m.at).slice(0, fit(sz));
      return `${head('chat', 'Derniers messages', n ? `<span class="count">${n}</span>` : '')}<div class="wl">${last.map(({ c, m }) => `<div class="wr" data-conv="${c.id}">${m.u ? GX.r.av(m.u, 'sm') : chAv(c, 22)}<span class="ellipsis grow"><b>${GX.esc(c.name)}</b> <span class="muted">${GX.esc(m.t || (m.type === 'image' ? '📷 Photo' : '📎 Pièce jointe'))}</span></span></div>`).join('')}</div>`;
    } },
    /* [GEARBOX] Widget mIAouss (08/10/2026) : capacité de l'équipe du jour + champ de question. Données : GX.assistantFeed
       (DataHub, paresseux, 1 lecture / 2 min au plus). La question ouvre le VOLET de la mascotte (GX.assistant, P1). */
    assistant: { app: null, name: 'mIAouss', sizes: ['W', 'M', 'M3'], render() {
      return `<div class="aw" data-aw>${head('assistant', 'mIAouss')}<div class="aw-info">${awInfo()}</div>
        <input class="aw-in" data-aq placeholder="Pose ta question…" maxlength="2000" autocomplete="off" value="${GX.esc(awDraft)}" aria-label="Poser une question à mIAouss" /></div>`;
    } },
    'chat-live': { app: 'chat', name: 'Chat interactif', sizes: ['L', 'M3', 'XL', 'X3', 'XXL', 'XXW'], live: true, render: (sz, c = {}, w) => chatLive(sz, c, w) },
    birthdays: { app: 'hello', name: 'Anniversaires', sizes: ['S', 'M', 'M3', 'T'], max: [8, 8], render(sz) {
      /* [GEARBOX] collègue sans date de naissance : écarté (il faussait le tri, 09/10/2026) */
      const t = GX.today(), L = D.USERS.filter((u) => u.birthdate && !isNaN(new Date(u.birthdate))).map((u) => { const b = new Date(u.birthdate); let n = new Date(t.getFullYear(), b.getMonth(), b.getDate()); if (n < t) n = new Date(t.getFullYear() + 1, b.getMonth(), b.getDate()); return { u, n, days: Math.round((n - t) / 864e5) }; }).sort((a, b) => a.days - b.days);
      if (!L.length) return `${head('hello', 'Anniversaires')}<div class="faint" style="margin:auto">Aucune date renseignée</div>`;
      const when = (x) => (x.days === 0 ? "aujourd'hui 🎂" : x.days === 1 ? 'demain' : 'dans ' + x.days + ' j');
      if (small(sz)) { const x = L[0]; return `${head('hello', 'Anniversaire')}<div style="margin-top:auto">${GX.r.av(x.u.id, 'lg')}</div><b style="margin-top:6px">${GX.esc(x.u.name.split(' ')[0])}</b><div class="faint" style="font-size:12px">${when(x)}</div>`; }
      return `${head('hello', 'Anniversaires')}<div class="wl">${L.slice(0, fit(sz)).map((x) => `<div class="wr">${GX.r.av(x.u.id, 'sm')}<span class="ellipsis grow">${GX.esc(narrow(sz) ? x.u.name.split(' ')[0] : x.u.name)}</span>${wideSz(sz) ? `<span class="faint">${x.n.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</span>` : ''}<span class="faint">${x.days === 0 ? 'Auj. !' : when(x)}</span></div>`).join('')}</div>`;
    } },
    weather: { app: 'hello', name: 'Météo', sizes: ['S', 'M', 'M3', 'T'], sky: true, render(sz) {
      const w = D.HELLO.weather, [cw, ch] = dim(sz);
      if (!w) return `<div class="wt" style="color:rgba(255,255,255,.85)">${GX.icon('pin', 'sm')}Météo</div><div style="margin:auto;opacity:.85;font-size:12.5px">Chargement…</div>`;   /* [GEARBOX] avant : widget vide */
      const now = `<div class="wt" style="color:rgba(255,255,255,.85)">${GX.icon('pin', 'sm')}${GX.esc(w.city)}</div><div class="row" style="margin-top:${ch >= 4 && cw <= 2 ? '10px' : 'auto'};align-items:flex-end"><div class="wv num" style="font-size:${ch >= 3 ? 48 : 40}px">${w.t}°</div><span class="grow"></span>${GX.icon(w.icon, 'xl')}</div><div style="font-size:12px;opacity:.85">${GX.esc(w.desc)} · ressenti ${w.feels}°</div>`;
      if (cw <= 2 && ch >= 4) return `${now}<div class="wfv">${D.HELLO.forecast.map(([d, ic, mx, mn]) => `<div><span>${d}</span>${GX.icon(ic, 'sm')}<b>${mx}°</b><span>${mn}°</span></div>`).join('')}</div>`;
      return `${now}${cw >= 4 ? `<div class="wfc ${ch >= 3 ? 'lg' : ''}">${D.HELLO.forecast.map(([d, ic, mx, mn]) => `<div><span>${d}</span>${GX.icon(ic, ch >= 3 ? '' : 'sm')}<b>${mx}°</b><span>${mn}°</span></div>`).join('')}</div>` : ''}`;
    } },
    music: { app: 'hello', name: 'Musique du jour', sizes: ['M', 'W', 'M3'], max: [6, 4], render(sz) {
      /* [GEARBOX] 09/10/2026 : la VRAIE musique du jour de Hello Marketing (Deezer, ui2/apps/hello/sources.ts). */
      const t = D.HELLO.track;
      if (!t) return `${head('hello', 'Musique du jour')}<div class="faint" style="margin:auto">Chargement…</div>`;
      const cover = t.album?.cover_medium ? `background:center/cover url(${GX.esc(t.album.cover_medium)})` : 'background:var(--bony-grad)';
      return `${head('hello', 'Musique du jour')}<div class="row" style="margin-top:auto;gap:12px;min-width:0"><div style="width:62px;height:62px;flex:none;border-radius:12px;${cover}"></div><div class="grow" style="min-width:0"><b class="ellipsis" style="display:block">${GX.esc(t.title)}</b><div class="faint ellipsis" style="font-size:12px">${GX.esc(t.artist?.name || '')}</div>${dim(sz)[1] >= 3 ? `<div class="faint ellipsis" style="font-size:11.5px;margin-top:2px">${GX.esc(t.album?.title || '')}</div>` : ''}</div>${t.preview ? `<button class="icon-btn" data-play="${GX.esc(t.preview)}" aria-label="Écouter l’extrait">${GX.icon('play')}</button>` : ''}</div>`;
    } },
    'conges-off': { app: 'conges', name: 'Absents cette semaine', sizes: ['S', 'M', 'M3', 'L'], max: [10, 8], render(sz) {
      /* [GEARBOX] 09/10/2026 : la VRAIE semaine (lundi → dimanche). Avant : aujourd'hui → J+6, un CP de lundi
         disparaissait dès mardi (« 0 cette semaine », BUGS-CONNUS.md). Ceux qui sont déjà revenus sont estompés. */
      const t0 = today(), mon = GX.iso(GX.addDays(GX.today(), -((GX.today().getDay() + 6) % 7))), sun = GX.iso(GX.addDays(GX.today(), 6 - ((GX.today().getDay() + 6) % 7)));
      const wk = D.CONGES.filter((c) => c.date >= mon && c.date <= sun), off = [...new Set(wk.map((c) => c.u))];
      const back = (u) => !wk.some((c) => c.u === u && c.date >= t0);
      off.sort((a, b) => (back(a) ? 1 : 0) - (back(b) ? 1 : 0));
      if (small(sz)) return `${head('conges', 'Absents')}<div class="av-stack" style="margin-top:auto">${off.slice(0, 4).map((u) => GX.r.av(u)).join('')}</div><div class="faint" style="font-size:12px;margin-top:6px">${off.length} cette semaine</div>`;
      const span = (u) => { const ds = wk.filter((c) => c.u === u).map((c) => c.date).sort(); const a = ds[0], b = ds[ds.length - 1]; return a === b ? F.date(a) : `${F.date(a)} → ${F.date(b)}`; };
      return `${head('conges', 'Absents cette semaine', `<span class="faint">${off.length}</span>`)}<div class="wl">${off.slice(0, fit(sz)).map((u) => { const c = wk.find((x) => x.u === u), lt = D.leave(c.type); return `<div class="wr ${back(u) ? 'wback' : ''}">${GX.r.av(u, 'sm')}<span class="ellipsis grow">${GX.esc(D.user(u).name)}</span>${narrow(sz) ? '' : `<span class="faint num">${span(u)}</span>`}<span class="badge" style="--c:${lt?.c || 'var(--text-3)'}">${GX.esc(back(u) ? 'revenu' : lt?.l || c.type)}</span></div>`; }).join('') || '<div class="faint">Personne d’absent</div>'}</div>`;
    } },
    'conges-solde': { app: 'conges', name: 'Mon solde de congés', sizes: ['S'], max: [4, 3], render() {
      const pris = D.CONGES.filter((c) => c.u === GX.ctx.uid && D.leaveCountsCP(c)).reduce((s, c) => s + D.leaveValue(c), 0), droit = D.CONGES_DROITS[GX.ctx.uid] ?? 25 /* [GEARBOX] règles de constants.ts */, r = droit - pris;
      return `${head('conges', 'Solde CP')}<div class="wv num" style="color:${r < 0 ? 'var(--danger)' : r <= 3 ? 'var(--warn)' : 'inherit'}">${r}</div><div class="faint" style="font-size:12px">jours restants sur ${droit}</div><div class="bar" style="margin-top:6px"><i style="width:${Math.min(100, (pris / droit) * 100)}%;--c:var(--info)"></i></div>`;
    } },
    material: { app: 'material', name: 'Matériel disponible', sizes: ['M', 'M3', 'L', 'T'], max: [10, 8], render(sz) {
      /* [GEARBOX] trié par disponibilité : l'épuisé d'abord (09/10/2026) */
      const t = today(), all = D.EQUIPMENT.map((e) => ({ e, used: D.BOOKINGS.filter((b) => b.eq === e.id && b.start <= t && b.end >= t).reduce((s, b) => s + b.qty, 0) })).sort((a, b) => (a.e.qty - a.used) - (b.e.qty - b.used) || a.e.name.localeCompare(b.e.name));
      const L = all.slice(0, fit(sz, 30, 58) * (dim(sz)[0] >= 8 ? 2 : 1));
      const rowH = ({ e, used }) => `<div class="wr"><span class="ellipsis grow">${GX.esc(e.name)}</span>${wideSz(sz) && e.cat ? `<span class="faint ellipsis" style="max-width:30%">${GX.esc(e.cat)}</span>` : ''}<b class="num" style="color:${e.qty - used ? 'var(--ok)' : 'var(--danger)'}">${e.qty - used}/${e.qty}</b></div>`;
      const body = dim(sz)[0] >= 8 ? `<div class="wcols2">${[L.slice(0, Math.ceil(L.length / 2)), L.slice(Math.ceil(L.length / 2))].map((h) => `<div class="wl">${h.map(rowH).join('')}</div>`).join('')}</div>` : `<div class="wl">${L.map(rowH).join('')}</div>`;
      return `${head('material', narrow(sz) ? 'Matériel dispo' : 'Matériel disponible aujourd’hui', `<span class="faint">${all.filter((x) => x.e.qty - x.used <= 0).length} épuisé${all.filter((x) => x.e.qty - x.used <= 0).length > 1 ? 's' : ''}</span>`)}${body}`;
    } },
    'agenda-week': { app: 'agenda', name: 'Agenda de la semaine', sizes: ['XL', 'X3', 'XXL', 'M3', 'L'], max: [14, 8], render(sz) {
      /* [GEARBOX] 09/10/2026 : en grand, les 7 jours avec projets, publications et absents ; en étroit, la liste. */
      const t = GX.today(), mon = GX.addDays(t, -((t.getDay() + 6) % 7)), sun = GX.iso(GX.addDays(mon, 6));
      const P = act().filter((p) => p.startDate <= sun && p.endDate >= GX.iso(mon));
      const [cw, ch] = dim(sz);
      if (cw >= 6 && ch >= 3) {
        const per = Math.max(1, Math.floor((ch * STEP - 120) / 20));
        return `${head('agenda', 'Agenda de la semaine', `<span class="faint">${P.length} projets</span>`)}<div class="wweek tall">${Array.from({ length: 7 }, (_, i) => {
          const d = GX.addDays(mon, i), iso = GX.iso(d);
          const items = [
            ...P.filter((p) => p.startDate <= iso && p.endDate >= iso).map((p) => `<span style="--c:${D.SERVICE_COLOR[p.services[0]] || '#888'}" data-proj="${p.id}" data-tip="${GX.esc(p.name)}">${GX.esc(p.name)}</span>`),
            ...D.POSTS.filter((p) => p.date === iso && !p.archived).map((p) => `<span style="--c:${D.socialStatus(p.status).c}" data-post="${p.id}" data-tip="${GX.esc(p.title)}">✦ ${GX.esc(p.title)}</span>`),
          ];
          const off = [...new Set(D.CONGES.filter((c) => c.date === iso).map((c) => c.u))];
          return `<div class="wday ${iso === today() ? 'on' : ''}"><span class="faint">${F.day(d)}</span><b class="num">${d.getDate()}</b><div class="wdl">${items.slice(0, per).join('')}${items.length > per ? `<span class="faint" style="border:0;background:none">+${items.length - per}</span>` : ''}</div>${off.length ? `<div class="av-stack wday-off">${off.slice(0, 3).map((u) => GX.r.av(u, '', { s: 18 })).join('')}</div>` : ''}</div>`;
        }).join('')}</div>`;
      }
      return `${head('agenda', 'Agenda de la semaine', `<span class="faint">${P.length} projets</span>`)}<div class="wl">${P.slice(0, fit(sz)).map((p) => `<div class="wr" data-proj="${p.id}"><i class="brand-dot" style="--c:${D.SERVICE_COLOR[p.services[0]] || '#888'}"></i><span class="ellipsis grow">${GX.esc(p.name)}</span><span class="faint num">${F.date(p.startDate)} → ${F.date(p.endDate)}</span></div>`).join('') || '<div class="faint">Aucun projet cette semaine</div>'}</div>`;
    } },
    games: { app: 'games', name: 'Défis en attente', sizes: ['S', 'M', 'M3'], max: [6, 6], render(sz) {
      /* [GEARBOX] 09/10/2026 : en moyen, chaque défi avec « Jouer » / « Refuser » (GX.games, ReactWidgets.tsx). */
      const L = D.GAMES.challenges, n = L.length;
      if (small(sz) || !GX.games) return `${head('games', 'Jeux')}<div class="wv num">${n}</div><div class="faint" style="font-size:12px">défi${n > 1 ? 's' : ''} en attente</div>`;
      return `${head('games', 'Défis en attente', `<span class="faint">${n}</span>`)}<div class="wl">${L.slice(0, fit(sz, 34)).map((c) => `<div class="wr">${GX.r.av(c.from, 'sm')}<span class="ellipsis grow">${GX.esc(D.user(c.from).name.split(' ')[0])} <span class="faint">· ${GX.esc(GX.games.label?.(c.game) || c.game)}</span></span><button class="btn sm primary" data-game="accept:${c.id}">Jouer</button><button class="btn sm ghost" data-game="refuse:${c.id}">Refuser</button></div>`).join('') || '<div class="faint" style="margin:auto">Aucun défi en attente</div>'}</div>`;
    } },
    'expenses-month': { app: 'fixed', name: 'Dépenses du mois', sizes: ['S'], max: [4, 3], render() {
      const m = today().slice(0, 7), L = D.EXPENSES.filter((e) => e.date.slice(0, 7) === m);
      return `${head('fixed', 'Dépenses du mois')}<div class="wv num" style="font-size:26px">${F.eurK(L.reduce((s, e) => s + e.amount, 0))}</div><div class="faint" style="font-size:12px">${L.length} ligne${L.length > 1 ? 's' : ''}</div>`;
    } },
    clock: { app: null, name: 'Horloge', sizes: ['S'], max: [4, 4], render() {
      const d = new Date(), h = d.getHours() % 12, mi = d.getMinutes();
      return `<svg viewBox="0 0 100 100" class="wclock"><circle cx="50" cy="50" r="46" />${Array.from({ length: 12 }, (_, i) => `<line x1="50" y1="8" x2="50" y2="${i % 3 ? 13 : 17}" transform="rotate(${i * 30} 50 50)" />`).join('')}
        <line class="hh" x1="50" y1="50" x2="50" y2="28" transform="rotate(${h * 30 + mi / 2} 50 50)" /><line class="mm" x1="50" y1="50" x2="50" y2="16" transform="rotate(${mi * 6} 50 50)" /><circle cx="50" cy="50" r="3.5" class="c" /></svg>`;
    } },
    /* [GEARBOX] Retirée de la galerie le 09/10/2026 (remplacée par « Ma journée » et ses post-it) ; les notes déjà posées restent. */
    note: { app: null, name: 'Note rapide', hidden: true, sizes: ['S', 'W', 'M', 'M3', 'L', 'T'], render(sz, c = {}, w) {
      return `<div class="wt">${GX.icon('edit', 'sm')}<span class="grow">Note</span></div><textarea class="wnote" data-note placeholder="Écrire une note…">${GX.esc(c.text || '')}</textarea>`;
    } },
    shortcuts: { app: null, name: 'Raccourcis', sizes: ['M', 'S'], min: [2, 2], max: [8, 4], cfg: 'apps', render(sz, c = {}) {
      const [cw, ch] = dim(sz), n = small(sz) ? 4 : Math.min(8, cw * Math.max(1, Math.floor(ch / 2)));
      const ids = (c.apps || ['projects', 'digital', 'budget', 'conges']).filter((id) => GX.shell.canOpen(id)).slice(0, n);
      return `<div class="wsc ${small(sz) ? 'S' : ''}" style="${small(sz) ? '' : `grid-template-columns:repeat(${Math.min(cw, Math.max(1, ids.length))},1fr)`}">${ids.map((id) => `<button data-open="${id}">${GX.appIcon(id, small(sz) ? 40 : 46)}<span>${GX.esc(GX.app(id).name)}</span></button>`).join('')}</div>`;
    } },
    news: { app: 'hello', name: 'Actu auto', sizes: ['M', 'M3', 'L'], max: [10, 8], render(sz) {
      /* [GEARBOX] 09/10/2026 : les VRAIS articles des flux RSS de Hello Marketing (ui2/apps/hello/sources.ts). Avant :
         des titres de démonstration et un « il y a N h » inventé. Clic = l'article dans un nouvel onglet. */
      const A = D.HELLO.rss?.auto;
      if (!A) return `${head('hello', 'Actu auto')}<div class="faint" style="margin:auto">Chargement…</div>`;
      const ago = (d) => { const m = Math.round((Date.now() - new Date(d)) / 6e4); return !Number.isFinite(m) ? '' : m < 60 ? `il y a ${Math.max(1, m)} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
      const L = A.slice(0, fit(sz, 58, 58) * (dim(sz)[0] >= 8 ? 2 : 1));
      const rowH = (a) => `<div class="wr" data-href="${GX.esc(a.link)}" style="align-items:flex-start;gap:10px;cursor:pointer">${a.thumbnail ? `<span class="wthumb" style="background:center/cover url(${GX.esc(a.thumbnail)})"></span>` : `<span class="wthumb" style="--a:#f75632">${GX.icon('car', 'sm')}</span>`}<span class="grow" style="font-size:12px;line-height:1.35;min-width:0"><span class="wnews-t">${GX.esc(a.title)}</span><span class="faint">${GX.esc(a.source)}${a.pubDate ? ' · ' + ago(a.pubDate) : ''}</span></span></div>`;
      const body = dim(sz)[0] >= 8 ? `<div class="wcols2">${[L.slice(0, Math.ceil(L.length / 2)), L.slice(Math.ceil(L.length / 2))].map((h) => `<div class="wl">${h.map(rowH).join('')}</div>`).join('')}</div>` : `<div class="wl">${L.map(rowH).join('')}</div>`;
      return `${head('hello', 'Actu auto')}${L.length ? body : '<div class="faint" style="margin:auto">Aucun article</div>'}`;
    } },
    /* ---------------- Widgets React (09/10/2026, ui2/apps/widgets/) ---------------- */
    todo: { app: 'todo', name: 'To-do', sizes: ['XXL', 'L', 'XXW'], min: [4, 3], max: [14, 8], live: true, react: 'todo', render: (sz, c, w) => reactSlot(w, 'todo', 'todo', 'To-do') },
    myday: { app: 'todo', name: 'Ma journée', sizes: ['M3', 'L', 'X3', 'T'], min: [2, 3], max: [10, 8], live: true, react: 'myday', render: (sz, c, w) => reactSlot(w, 'myday', 'todo', 'Ma journée') },
    'forms-resp': { app: 'forms', name: 'Forms · réponses', sizes: ['M3', 'L', 'M', 'X3'], min: [3, 2], max: [10, 8], live: true, react: 'forms', render: (sz, c, w) => reactSlot(w, 'forms', 'forms', 'Forms') },
  };
  W.catalog = CAT;
  /* Accès pour la coque téléphone : même disposition, rendue en grille 2 colonnes */
  W.items = () => { if (!layout) load(); return layout.filter((w) => allowed(w.type)).sort((a, b) => a.y - b.y || a.x - b.x); };
  W.inner = (w) => { try { return CAT[w.type].render(w.size, w.cfg || {}, w); } catch (e) { return indispo(e, CAT[w.type].name); } };
  W.kind = (w) => (CAT[w.type].accent ? 'accent' : CAT[w.type].sky ? 'sky' : 'glass') + (CAT[w.type].live ? ' live' : '');
  W.app = (w) => CAT[w.type].app;

  /* ---------------- Disposition ---------------- */
  /* [GEARBOX] le stockage est déjà propre à chaque compte (GX.store). Coque TÉLÉPHONE (07/10/2026) : disposition
     à part (`widgets.m`), une simple LISTE ORDONNÉE (y = rang, x = 0) aux tailles du téléphone, éditée par W.m. */
  const isPhone = () => GX.host?.dataset.shell === 'mobile';
  const KEY = () => (isPhone() ? 'widgets.m' : 'widgets');
  const DEFAULT = [
    { type: 'budget-ring', size: 'S', x: 0, y: 0 }, { type: 'late', size: 'S', x: 2, y: 0 }, { type: 'posts', size: 'M', x: 0, y: 2 },
    { type: 'conges-off', size: 'S', x: 0, y: 4 }, { type: 'chat', size: 'S', x: 2, y: 4 }, { type: 'weather', size: 'S', x: 0, y: 6 }, { type: 'clock', size: 'S', x: 2, y: 6 },
    { type: 'chat-live', size: 'L', x: 4, y: 0 },   // n'affecte que les bureaux sans disposition sauvegardée (ou « Disposition par défaut »)
  ];
  let layout = null, box = null, editing = false;
  /* Disposition par défaut : un widget qui dépasserait d'un bureau étroit est replacé dans un emplacement libre */
  const fresh = () => { layout = []; DEFAULT.forEach((d) => { const w = { ...d, id: GX.uid('wg') }; if (w.x + dim(w.size)[0] > cols() || layout.some((o) => overlap(rectOf(w), rectOf(o)))) Object.assign(w, freeSpot(w.size, w)); layout.push(w); }); return layout; };
  /* Téléphone : budget et retards en petit, derniers messages du Chat, échéances, absents, météo. Un widget non
     autorisé au rôle reste masqué à l'affichage (allowed), comme au bureau. */
  const DEFAULT_M = [['budget-ring', 'S'], ['late', 'S'], ['chat', 'M'], ['deadlines', 'M'], ['conges-off', 'S'], ['weather', 'S']];
  const freshM = () => (layout = DEFAULT_M.map(([type, size], i) => ({ id: GX.uid('wg'), type, size, x: 0, y: i })));
  const load = () => { const saved = GX.store.get(KEY()); layout = (Array.isArray(saved) ? saved : isPhone() ? freshM() : fresh()).filter((w) => w && CAT[w.type]); };
  /* `widgets:saved` : l'accueil du téléphone se redessine (le bureau, lui, passe par W.render). */
  const save = () => { GX.store.set(KEY(), layout); GX.emit('widgets:saved'); };
  const rectOf = (w) => { const [cw, ch] = dim(w.size); return { x: w.x, y: w.y, w: cw, h: ch }; };
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  /* [GEARBOX] Marge du bureau PROPORTIONNELLE à l'écran (1,6 % de la largeur, bornée 10–28 px) au lieu
     de 22 px fixes, et grille ANCRÉE en haut à gauche au lieu d'être centrée : centrée, le reste de la
     division en cases (jusqu'à 48 px par côté) s'ajoutait à la marge et les widgets du bord semblaient
     loin du bord sur un écran réduit (retour de Théo, 30/09/2026). Cases de taille FIXE (96 px) : un
     premier essai les étirait pour remplir la zone — en plein écran les widgets se déformaient et
     débordaient sur le Dock (retour de Théo, même jour). SX()/SY() gardés comme points d'appel uniques. */
  const M = () => Math.round(Math.max(10, Math.min(28, innerWidth * 0.016)));
  const cols = () => Math.max(4, Math.floor((innerWidth - 2 * M() + GAP) / STEP));
  /* Pas HORIZONTAL : le reste de la division en cases est réparti ENTRE les colonnes (les widgets
     gardent leur taille, seuls les espaces entre eux s'élargissent de quelques px) — grille pleine
     largeur, marge identique à gauche et à droite (retour de Théo, 30/09/2026). */
  const SX = () => (innerWidth - 2 * M() + GAP) / cols();
  /* Zone du bureau : entre la barre du haut (0 si escamotable) et le haut du Dock. La grille y est
     CENTRÉE : même marge en haut qu'en bas (au-dessus du Dock), même marge à gauche qu'à droite. */
  const cssPx = (n) => parseFloat(getComputedStyle(GX.host).getPropertyValue(n)) || 0;
  const area = () => { const top = cssPx('--mb-space'), bottom = (cssPx('--dock-icon') || 50) + 26 + 8; return { top, h: innerHeight - top - bottom }; };
  const rows = () => Math.max(4, Math.floor((area().h - 2 * M() + GAP) / STEP));
  const SY = () => STEP;
  /* Abscisse d'un widget : un widget qui touche la dernière colonne est aligné sur le bord DROIT de la
     grille (sinon l'élargissement des espaces le laisserait quelques px en retrait). */
  const XL = (x, cw) => (x + cw >= cols() ? cols() * SX() - GAP - (cw * STEP - GAP) : x * SX());
  function freeSpot(size, ignore, near) {
    const [cw, ch] = dim(size), C = cols(), R = rows() + 20, cands = [];
    for (let y = 0; y < R; y++) for (let x = 0; x + cw <= C; x++) { const r = { x, y, w: cw, h: ch }; if (!layout.some((o) => o !== ignore && overlap(r, rectOf(o)))) cands.push(r); }
    if (!cands.length) return { x: 0, y: 0 };
    if (near) cands.sort((a, b) => Math.hypot(a.x - near.x, a.y - near.y) - Math.hypot(b.x - near.x, b.y - near.y));
    return cands[0];
  }
  const allowed = (type) => {
    const a = CAT[type].app; if (a && !GX.shell.canOpen(a)) return false;
    if (type === 'assistant' && !GX.assistant?.available) return false;   /* [GEARBOX] mIAouss : équipe marketing (MascotLayer) */
    /* [GEARBOX] mêmes règles que les pages */
    if (['budget-sites', 'campaigns'].includes(type) && GX.ctx.role === 'Site Manager') return false;
    if (CAT[type].react && !GX.reactWidgets) return false;   /* [GEARBOX] widgets React : leur calque doit être monté */
    if (['birthdays', 'music', 'chat-live'].includes(type) && !GX.bridge().showSocial) return false;
    return true;
  };

  /* ---------------- Moteur de disposition « poussée » ----------------
     Pendant un geste, le widget manipulé est prioritaire : ceux qu'il chevauche partent vers la place
     libre la plus proche de LEUR position de départ (instantané pris au début du geste → pas de
     ping-pong quand on repasse au même endroit). Les autres ne bougent pas. */
  const calm = () => GX.eco() || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const snap = () => Object.fromEntries(layout.map((w) => [w.id, rectOf(w)]));
  function nearestFree(cw, ch, occ, near) {
    const C = cols(), R = Math.max(rows(), ...occ.map((o) => o.y + o.h)) + ch + 1;
    let best = null, bd = Infinity;
    for (let y = 0; y < R; y++) for (let x = 0; x + cw <= C; x++) {
      const r = { x, y, w: cw, h: ch }; if (occ.some((o) => overlap(r, o))) continue;
      const d = Math.hypot(x - near.x, (y - near.y) * 1.15) + (y + ch > rows() ? 3 : 0);   // on évite de sortir de l'écran
      if (d < bd) { bd = d; best = r; }
    }
    return best || { x: 0, y: R, w: cw, h: ch };
  }
  function arrange(base, id, rect) {
    const out = { [id]: rect }, occ = [rect], movers = [];
    Object.entries(base).forEach(([k, r]) => { if (k === id) return; if (overlap(r, rect)) movers.push([k, r]); else { out[k] = r; occ.push(r); } });
    movers.sort((a, b) => a[1].y - b[1].y || a[1].x - b[1].x).forEach(([k, r]) => { const n = nearestFree(r.w, r.h, occ, r); out[k] = n; occ.push(n); });
    return out;
  }
  /* Aperçu en direct : les voisins glissent (transition ressort sur left/top, cf. CSS) */
  function preview(out, skipId) {
    box.querySelectorAll('.wdg').forEach((el) => { const r = out[el.dataset.id]; if (!r || el.dataset.id === skipId) return; el.style.left = XL(r.x, r.w) + 'px'; el.style.top = r.y * SY() + 'px'; });
    const vis = layout.filter((w) => allowed(w.type)).map((w) => out[w.id]).filter(Boolean);
    box.style.height = Math.max(0, ...vis.map((r) => r.y + r.h)) * SY() + 'px';
  }
  function mkGhost(r, over) { const g = document.createElement('div'); g.className = 'wghost' + (over ? ' over' : ''); placeGhost(g, r); box.append(g); return g; }
  function placeGhost(g, r) { Object.assign(g.style, { left: XL(r.x, r.w) + 'px', top: r.y * SY() + 'px', width: r.w * STEP - GAP + 'px', height: r.h * STEP - GAP + 'px' }); }
  const rects = () => Object.fromEntries([...(box?.querySelectorAll('.wdg') || [])].map((el) => [el.dataset.id, el.getBoundingClientRect()]));
  /* Après un re-rendu : chaque widget part de son ancienne boîte et rejoint la nouvelle en ressort
     (FLIP en translation si la taille n'a pas changé, sinon animation de la boîte elle-même) */
  function settle(before, mainId) {
    if (!before || !box || calm()) return;
    const b0 = box.getBoundingClientRect();
    box.querySelectorAll('.wdg').forEach((el) => {
      const f = before[el.dataset.id]; if (!f) return;
      const l = el.getBoundingClientRect(), spring = el.dataset.id === mainId ? 'bouncy' : 'snappy';
      if (Math.abs(f.width / l.width - 1) > .06 || Math.abs(f.height / l.height - 1) > .06) {
        GX.animate(el, [{ left: f.left - b0.left + 'px', top: f.top - b0.top + 'px', width: f.width + 'px', height: f.height + 'px' }, { left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height }], { spring });
      } else GX.flip(el, f, { spring });
    });
  }
  /* Valide une disposition (positions `out`, taille éventuelle) : sauvegarde + re-rendu + atterrissage */
  function commit(out, sized, mainId, before = rects()) {
    layout.forEach((w) => { const r = out && out[w.id]; if (r) { w.x = r.x; w.y = r.y; } });
    if (sized) sized.w.size = sized.size;
    save(); W.render(); settle(before, mainId);
  }
  function applySize(w, s) {
    const [cw, ch] = dim(s), x = Math.min(w.x, Math.max(0, cols() - cw));
    commit(arrange(snap(), w.id, { x, y: w.y, w: cw, h: ch }), { w, size: s }, w.id);
  }
  function removeW(w, el) {
    const done = () => { layout = layout.filter((x) => x !== w); save(); W.render(); };
    el = el || box?.querySelector(`.wdg[data-id="${w.id}"]`);
    if (!el || calm()) return done();
    el.style.pointerEvents = 'none';
    const a = GX.animate(el, [{ transform: 'none', opacity: 1 }, { transform: 'scale(.55)', opacity: 0 }], { spring: 'snappy', fill: 'forwards', duration: 260 });
    a.onfinish = done; a.oncancel = done;
  }
  /* Re-rend le contenu d'un widget en place (redimensionnement en cours), sans toucher aux commandes */
  function reInner(el, w) {
    [...el.children].forEach((n) => { if (!n.matches('.wx,.wsz,.wrz,.wtip')) n.remove(); });
    let inner = ''; try { inner = CAT[w.type].render(w.size, w.cfg || {}, w); } catch (e) { inner = indispo(e, CAT[w.type].name); }
    el.insertAdjacentHTML('afterbegin', inner);
    el.className = el.className.replace(/\bsz-\S+/, 'sz-' + w.size);
    W.adopt(el);
  }

  /* ---------------- Rendu ---------------- */
  let gesture = null, eatClick = 0, lastGesture = 0;
  let rzT; GX.win(window, 'resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { if (box && box.isConnected && !editing) W.render(); }, 200); }); // la grille reste centrée
  W.render = (container) => {
    box = container || box; if (!box) return;
    if (gesture) return;   // jamais de re-rendu sous le doigt : la fin du geste re-rend de toute façon
    if (!layout) load();
    if (GX.shell.prefs.widgets === false && !editing) { box.innerHTML = ''; return; }
    box.classList.toggle('editing', editing);
    const vis = layout.filter((w) => allowed(w.type));
    const maxY = Math.max(0, ...vis.map((w) => w.y + dim(w.size)[1]));
    const sx = SX(), sy = SY(); box.style.width = cols() * sx - GAP + 'px'; box.style.left = M() + 'px'; box.style.top = Math.round(area().top + M()) + 'px'; box.style.height = maxY * sy + 'px'; /* [GEARBOX] marge proportionnelle */
    /* Le widget Chat se re-rend à chaque message : on garde le champ de saisie actif (focus + curseur) */
    const ae = GX.root.activeElement, keep = ae && box.contains(ae) && ae.matches('[data-wc-in]') ? { id: ae.closest('.wch')?.dataset.wid, pos: ae.selectionStart } : null;
    const keepAw = ae && box.contains(ae) && ae.matches('[data-aq]') ? ae.selectionStart : null;   /* champ « Pose ta question… » de mIAouss */
    box.innerHTML = vis.map((w, i) => {
      const c = CAT[w.type], [cw, ch] = dim(w.size);
      let inner = ''; try { inner = c.render(w.size, w.cfg || {}, w); } catch (e) { inner = indispo(e, c.name); }
      return `<div class="wdg ${c.accent ? 'accent' : c.sky ? 'sky' : 'glass'}${c.live ? ' live' : ''} sz-${w.size}" data-id="${w.id}" data-app="${c.app || ''}" style="left:${XL(w.x, cw)}px;top:${w.y * sy}px;width:${cw * STEP - GAP}px;height:${ch * STEP - GAP}px;animation-delay:${i * 30}ms">
        ${inner}${editing ? `<button class="wx" data-rm title="Retirer">${GX.icon('minus', 'sm')}</button><button class="wsz" data-size title="Taille suivante">${dimL(w.size).replace(' × ', '×')}</button>` : ''}${resizable(c) ? '<button class="wrz" data-rz tabindex="-1" aria-label="Redimensionner" title="Tirer pour redimensionner"></button>' : ''}</div>`;
    }).join('');
    if (keepAw != null) { const i = box.querySelector('.aw [data-aq]'); if (i) { i.focus({ preventScroll: true }); i.setSelectionRange(keepAw, keepAw); } }
    if (keep) { const i = box.querySelector(`.wch[data-wid="${keep.id}"] [data-wc-in]`); if (i) { i.focus({ preventScroll: true }); if (keep.pos != null) i.setSelectionRange(keep.pos, keep.pos); } }
    W.adopt(box);   /* widgets en React : leurs hôtes persistants reprennent leur place */
    /* L'entrée « pop » ne se joue qu'à l'apparition du bureau, pas à chaque re-rendu (pastilles, messages…) */
    if (!box.classList.contains('settled')) { clearTimeout(W._st); W._st = setTimeout(() => box && box.classList.add('settled'), 900); }
    wire();
  };
  /* ---------------- Actions d'un widget (hors mode édition) — PARTAGÉES par le bureau et l'accueil du téléphone ---------------- */
  /* Clic dans le widget `el` (.wdg[data-id]) : projet, conversation, raccourci, sinon la rubrique du widget. */
  function actOn(e, el) {
    if (e.target.closest('.wreact')) return;   /* widget React : il gère ses clics lui-même */
    if (e.target.closest('input,textarea,button[data-play]')) return;
    const gm = e.target.closest('[data-game]'); if (gm) { const [act, id] = gm.dataset.game.split(':'); return GX.games?.[act]?.(id); }
    const ps = e.target.closest('[data-post]'); if (ps) return GX.shell.openWith('digital', 'post:' + ps.dataset.post);
    const hr = e.target.closest('[data-href]'); if (hr) return window.open(hr.dataset.href, '_blank', 'noopener');
    const tk = e.target.closest('[data-tproj]'); if (tk) return GX.openProject(tk.dataset.tproj);
    const pr = e.target.closest('[data-proj]'); if (pr) { const p = D.project(pr.dataset.proj); return p && GX.openProject(p.id); }
    const cv = e.target.closest('[data-conv]'); if (cv) { const win = GX.wm.open('chat', {}, { origin: cv }); if (!win) return; /* [GEARBOX] refusé : rien (pas la fenêtre active) */ return setTimeout(() => win.inst?.command?.('conv:' + cv.dataset.conv), 420); }
    const op = e.target.closest('[data-open]'); if (op) return GX.wm.open(op.dataset.open, {}, { origin: op.querySelector('.app-ico') });
    if (el.dataset.app) { if (GX.wm.desktopShown?.()) GX.wm.showDesktop(false); GX.wm.open(el.dataset.app, {}, { origin: el }); }
  }
  function onChange(e) {
    /* [GEARBOX] 09/10/2026 : vraie case à cocher — la tâche passe à « Terminé » par les routes normales (GX.todo,
       ui2/apps/widgets/ReactWidgets.tsx), avec annulation. Sans droit d'écriture : la To-do s'ouvre. */
    const cb = e.target.closest('[data-task]'); if (!cb) return;
    if (GX.todo?.canEdit?.()) GX.todo.complete(cb.dataset.task); else { cb.checked = false; GX.wm.open('todo'); }
  }
  function onInput(e) { const n = e.target.closest('[data-note]'); if (n) { const w = layout?.find((x) => x.id === n.closest('.wdg')?.dataset.id); if (!w) return; w.cfg = { ...(w.cfg || {}), text: n.value }; save(); } }
  /* [GEARBOX] Musique du jour : VRAI extrait (30 s, Deezer), un seul lecteur pour tout le bureau (09/10/2026). */
  let audio = null;
  const wirePlay = (scope) => scope.querySelectorAll('[data-play]').forEach((b) => (b.onclick = (ev) => {
    ev.stopPropagation(); const src = b.dataset.play; if (!src) return;
    if (!audio || audio.src !== src) { audio?.pause(); audio = new Audio(src); audio.onended = () => GX.root.querySelectorAll('[data-play].on').forEach((x) => { x.classList.remove('on'); x.innerHTML = GX.icon('play'); }); }
    const on = audio.paused; if (on) audio.play().catch(() => {}); else audio.pause();
    b.classList.toggle('on', on); b.innerHTML = GX.icon(on ? 'pause' : 'play');
  }));
  W.act = actOn; W.onChange = onChange; W.onInput = onInput; W.wirePlay = wirePlay;

  /* ---------------- Accueil du TÉLÉPHONE : édition de la liste (07/10/2026) ----------------
     Trois tailles côté téléphone, chacune servie par la PREMIÈRE taille du bureau que le widget accepte :
     Petit (½ largeur), Large (pleine largeur, bas), Grand (pleine largeur, haut). Le rendu reste celui du
     catalogue (CAT.render), avec la taille du bureau correspondante. */
  const TIERS = { P: ['S'], L: ['M', 'XL', 'W'], G: ['M3', 'L', 'T', 'X3', 'XXL', 'XXW'] };
  const TIER_L = { P: 'Petit', L: 'Large', G: 'Grand' };
  const tiersOf = (type) => Object.keys(TIERS).map((t) => [t, TIERS[t].find((s) => CAT[type]?.sizes.includes(s))]).filter(([, s]) => s);
  const tierOf = (size) => Object.keys(TIERS).find((t) => TIERS[t].includes(size)) || (() => { const [w, h] = dim(size); return w <= 2 && h <= 2 ? 'P' : h <= 2 ? 'L' : 'G'; })();
  const mList = () => { if (!layout) load(); return layout; };
  const mRank = () => { layout.sort((a, b) => a.y - b.y).forEach((w, i) => { w.x = 0; w.y = i; }); };
  W.m = {
    TIER_L,
    tierOf, tiers: tiersOf,
    /** Widgets visibles, dans l'ordre (rôle appliqué). */
    items: () => mList().filter((w) => allowed(w.type)).sort((a, b) => a.y - b.y),
    /** Catalogue autorisé au rôle : [type, nom, rubrique, tailles téléphone]. */
    catalog: () => Object.entries(CAT).filter(([t, c]) => allowed(t) && !c.hidden).map(([t, c]) => ({ type: t, name: c.name, app: c.app, tiers: tiersOf(t) })).filter((x) => x.tiers.length),
    add(type) { if (!CAT[type] || !allowed(type)) return null; mList(); const s = tiersOf(type)[0]; if (!s) return null; const w = { id: GX.uid('wg'), type, size: s[1], x: 0, y: layout.length ? Math.max(...layout.map((x) => x.y)) + 1 : 0 }; layout.push(w); mRank(); save(); return w; },
    remove(id) { mList(); layout = layout.filter((w) => w.id !== id); mRank(); save(); },
    /** Déplace d'un cran parmi les widgets VISIBLES (un widget masqué au rôle ne bloque pas). */
    move(id, dir) { const vis = W.m.items(), i = vis.findIndex((w) => w.id === id), j = i + dir; if (i < 0 || j < 0 || j >= vis.length) return; const a = vis[i], b = vis[j], y = a.y; a.y = b.y; b.y = y; mRank(); save(); },
    size(id, size) { const w = mList().find((x) => x.id === id); if (!w || !CAT[w.type].sizes.includes(size)) return; w.size = size; save(); },
    configurable: (type) => !!CAT[type]?.cfg,
    configure(id, el) { const w = mList().find((x) => x.id === id); if (w && CAT[w.type].cfg) configure(w, el); },
    reset() { freshM(); save(); },
  };

  function wire() {
    box.onclick = (e) => {
      const el = e.target.closest('.wdg'); if (!el || e.target.closest('[data-rz]')) return; const w = layout.find((x) => x.id === el.dataset.id); if (!w) return;
      if (editing) {
        if (e.target.closest('[data-rm]')) return removeW(w, el);
        if (e.target.closest('[data-size]')) { const s = CAT[w.type].sizes; return applySize(w, s[(s.indexOf(w.size) + 1) % s.length]); }
        return;
      }
      actOn(e, el);
    };
    box.onchange = onChange;
    box.oninput = onInput;
    wirePlay(box);
    box.oncontextmenu = (e) => {
      const el = e.target.closest('.wdg'); if (!el) return; e.preventDefault(); e.stopPropagation();
      if (gesture || Date.now() - lastGesture < 500) return;   // appui long tactile : c'est un déplacement, pas un menu
      const w = layout.find((x) => x.id === el.dataset.id), c = CAT[w.type];
      GX.menu.open([
        ...(c.app ? [{ label: 'Ouvrir ' + GX.app(c.app).name, icon: 'arrowr', action: () => GX.wm.open(c.app, {}, { origin: el }) }, '-'] : []),
        { header: 'Taille' }, ...(c.sizes.includes(w.size) ? [] : [{ label: `Sur mesure · ${dimL(w.size)}`, checked: true, action: () => {} }]), ...c.sizes.map((s) => ({ label: `${sizeName(s)} · ${dimL(s)}`, checked: w.size === s, action: () => applySize(w, s) })),
        ...(c.cfg ? ['-', { label: 'Configurer…', icon: 'sliders', action: () => configure(w, el) }] : []),
        '-', { label: 'Modifier le bureau…', icon: 'edit', action: () => W.edit(true) }, { label: 'Retirer ce widget', icon: 'trash', action: () => removeW(w, el) },
      ], { x: e.clientX, y: e.clientY });
    };
    box.onpointerdown = onDown;
  }
  function configure(w, el) {
    const c = CAT[w.type];
    if (c.cfg === 'deadlines') GX.ui.pick(el, [{ items: [['both', 'Projets et tâches'], ['proj', 'Projets seulement'], ['task', 'Mes tâches seulement']].map(([v, l]) => ({ v, l })) }], { multi: false, title: 'Échéances', selected: [w.cfg?.mode || 'both'], onChange: ([v]) => { w.cfg = { ...(w.cfg || {}), mode: v }; save(); W.render(); } });
    if (c.cfg === 'kpi') GX.ui.pick(el, [{ items: [['actifs', 'Projets actifs'], ['reste', 'Reste à engager'], ['conso', 'Consommation'], ['campagnes', 'Campagnes programmées'], ['retard', 'Projets en retard'], ['taches', 'Mes tâches en retard'], ['posts', 'Publications de la semaine'], ['absents', 'Absents aujourd’hui']].map(([v, l]) => ({ v, l })) }], { multi: false, title: 'Indicateur', selected: [w.cfg?.kpi || 'actifs'], onChange: ([v]) => { w.cfg = { ...(w.cfg || {}), kpi: v }; save(); W.render(); } });
    if (c.cfg === 'project') GX.ui.pick(el, [{ items: act().map((p) => ({ v: p.id, l: p.name, hint: p.sites[0] })) }], { multi: false, title: 'Projet à épingler', selected: [w.cfg?.project], width: 320, onChange: ([v]) => { w.cfg = { ...(w.cfg || {}), project: v }; save(); W.render(); } });
    if (c.cfg === 'apps') GX.ui.pick(el, [{ items: [...GX.apps.values()].filter((a) => !a.hidden && !a.system && GX.shell.canOpen(a.id)).map((a) => ({ v: a.id, l: a.name })) }], { title: 'Raccourcis (8 max)', selected: w.cfg?.apps || ['projects', 'digital', 'budget', 'conges'], onChange: (v) => { w.cfg = { ...(w.cfg || {}), apps: v.slice(0, 8) }; save(); W.render(); } });
  }

  /* ---------------- Gestes : déplacer / redimensionner (souris, stylet, doigt) ----------------
     Hors mode édition : appui long (350 ms) ou glisser > 6 px sur une zone non interactive du widget
     (sa tête, son fond) → il se soulève et suit le pointeur librement. Les zones interactives (champs,
     boutons, cases, liste / fil / saisie du Chat) ne lancent jamais de déplacement. En mode édition,
     tout le widget se saisit (seuil 3 px). Un simple clic ouvre toujours l'app. */
  const INTERACTIVE = 'input,textarea,select,button,a[href],label,[contenteditable],[data-wc-zone],[data-play]';
  /* Le clic qui suit un geste ne doit rien ouvrir : on l'avale AVANT la capture du widget Chat (window < document) */
  GX.win(window, 'click', (e) => { if (eatClick && Date.now() - eatClick < 400 && e.target.closest?.('#widgets')) { e.stopPropagation(); e.preventDefault(); eatClick = 0; } }, true);
  function onDown(e) {
    if (gesture || e.button !== 0 || !e.isPrimary) return;
    const el = e.target.closest('.wdg'); if (!el || el.parentElement !== box) return;
    const w = layout.find((x) => x.id === el.dataset.id); if (!w) return;
    if (e.target.closest('[data-rz]')) return resizeStart(e, el, w);
    if (editing ? e.target.closest('.wx,.wsz') : e.target.closest(INTERACTIVE)) return;
    moveStart(e, el, w);
  }
  function moveStart(e, el, w) {
    const sx = e.clientX, sy = e.clientY, pid = e.pointerId, thr = editing ? 3 : 6, x0 = w.x * SX(), y0 = w.y * SY(), [cw, ch] = dim(w.size);
    let lifted = false, ghost = null, base = null, key = '', out = null, lx = sx, ly = sy, raf = 0;
    const timer = setTimeout(() => lift(), 350);
    function lift() {
      if (lifted || !layout.includes(w)) return; lifted = true; clearTimeout(timer);
      gesture = { kind: 'move', id: w.id }; GX.menu.close?.();
      try { el.setPointerCapture(pid); } catch (err) { /* pointeur déjà relâché */ }
      base = snap(); out = base;
      el.classList.add('lift'); GX.host.classList.add('wdg-grabbing');
      ghost = mkGhost(base[w.id]);
      if (e.pointerType === 'touch') try { navigator.vibrate?.(8); } catch (err) { /* pas de vibreur */ }
      track();
    }
    function track() {
      const dx = lx - sx, dy = ly - sy;
      el.style.translate = `${dx}px ${dy}px`;
      const nx = clamp(Math.round((x0 + dx) / SX()), 0, Math.max(0, cols() - cw)), ny = clamp(Math.round((y0 + dy) / SY()), 0, Math.max(0, rows() - ch, w.y));
      const k = nx + ',' + ny; if (k === key) return; key = k;
      out = arrange(base, w.id, { x: nx, y: ny, w: cw, h: ch });
      placeGhost(ghost, out[w.id]); preview(out, w.id);
    }
    const mv = (ev) => {
      if (ev.pointerId !== pid) return; lx = ev.clientX; ly = ev.clientY;
      if (!lifted) { if (Math.hypot(lx - sx, ly - sy) > thr) lift(); if (!lifted) return; }
      ev.preventDefault();
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (gesture) track(); });
    };
    const off = () => { GX.unwin(window, 'pointermove', mv); GX.unwin(window, 'pointerup', end); GX.unwin(window, 'pointercancel', end); };
    function end(ev) {
      if (ev.pointerId !== pid) return; clearTimeout(timer); off();
      if (!lifted) return;                         // simple clic : il suit son cours (ouvre l'app)
      cancelAnimationFrame(raf); raf = 0; eatClick = lastGesture = Date.now();
      const before = rects();                      // boîte visuelle AVANT de lâcher (translation + soulèvement compris)
      ghost?.remove(); GX.host.classList.remove('wdg-grabbing'); gesture = null;
      if (ev.type === 'pointercancel' || !layout.includes(w)) return W.render();
      commit(out, null, w.id, before);
    }
    GX.win(window, 'pointermove', mv, { passive: false }); GX.win(window, 'pointerup', end); GX.win(window, 'pointercancel', end);
  }
  function resizeStart(e, el, w) {
    const c = CAT[w.type]; if (!resizable(c)) return;
    e.preventDefault(); e.stopPropagation();
    const pid = e.pointerId, sx = e.clientX, sy = e.clientY, orig = w.size, W0 = el.offsetWidth, H0 = el.offsetHeight, base = snap();
    let cur = null, out = base, raf = 0, lx = sx, ly = sy;
    gesture = { kind: 'size', id: w.id }; GX.menu.close?.();
    try { e.target.setPointerCapture(pid); } catch (err) { /* ignoré */ }
    el.classList.add('sizing'); GX.host.classList.add('wdg-sizing');
    el.insertAdjacentHTML('beforeend', '<span class="wtip"></span>');
    const tip = el.querySelector('.wtip'), ghost = mkGhost(base[w.id], true);
    function track() {
      const C = cols(), maxW = C * SX() - GAP, bd = bounds(c);   // au-delà du bord droit, l'aimantation décale le widget vers la gauche
      const fw = clamp(W0 + lx - sx, CELL * 1.2, Math.max(maxW, W0)), fh = clamp(H0 + ly - sy, CELL * 1.2, bd.max[1] * SY());
      el.style.width = fw + 'px'; el.style.height = fh + 'px';
      const tw = (fw + GAP) / STEP, th = (fh + GAP) / SY();
      /* [GEARBOX] formats libres : la case la plus proche, dans les bornes du widget (09/10/2026) */
      const best = sizeOf(clamp(Math.round(tw), bd.min[0], Math.max(bd.min[0], Math.min(bd.max[0], C))), clamp(Math.round(th), bd.min[1], bd.max[1]));
      if (best === cur) return; cur = best;
      const [cw, ch] = dim(best), nx = Math.min(base[w.id].x, Math.max(0, C - cw));
      out = arrange(base, w.id, { x: nx, y: base[w.id].y, w: cw, h: ch });
      placeGhost(ghost, out[w.id]); preview(out, null);
      if (w.size !== best) { w.size = best; reInner(el, w); }   // le contenu suit la taille aimantée
      tip.textContent = `${dimL(best)}${SIZE_L[best] ? ' · ' + SIZE_L[best] : ''}`;
    }
    const mv = (ev) => { if (ev.pointerId !== pid) return; lx = ev.clientX; ly = ev.clientY; ev.preventDefault(); if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (gesture) track(); }); };
    const off = () => { GX.unwin(window, 'pointermove', mv); GX.unwin(window, 'pointerup', end); GX.unwin(window, 'pointercancel', end); };
    function end(ev) {
      if (ev.pointerId !== pid) return; off(); cancelAnimationFrame(raf); raf = 0; eatClick = lastGesture = Date.now();
      const before = rects();
      ghost.remove(); GX.host.classList.remove('wdg-sizing'); gesture = null;
      if (ev.type === 'pointercancel' || !layout.includes(w)) { w.size = orig; return W.render(); }
      commit(out, { w, size: cur || orig }, w.id, before);
    }
    track();
    GX.win(window, 'pointermove', mv, { passive: false }); GX.win(window, 'pointerup', end); GX.win(window, 'pointercancel', end);
  }

  /* ---------------- Mode édition + galerie ---------------- */
  let gal = null;
  W.edit = (on = !editing) => {
    editing = on; GX.menu.close();
    if (on) { if (!GX.wm.desktopShown?.()) GX.wm.showDesktop(true); openGallery(); }
    else { gal?.remove(); gal = null; if (GX.wm.desktopShown?.()) GX.wm.showDesktop(false); }
    GX.host.classList.toggle('desk-editing', on);
    W.render();
  };
  function openGallery() {
    gal?.remove();
    gal = document.createElement('div'); gal.className = 'wgal glass glass-strong';
    const cats = [['all', 'Tous'], ...[...new Set(Object.values(CAT).map((c) => c.app).filter(Boolean))].filter((a) => GX.shell.canOpen(a)).map((a) => [a, GX.app(a).name]), ['misc', 'Divers']];
    gal.innerHTML = `<div class="row" style="padding:4px 4px 10px"><b style="font-size:16px">Widgets</b><span class="faint" style="font-size:12px">Cliquez pour ajouter · glissez pour ranger · tirez le coin pour redimensionner · clic droit pour configurer</span><span class="grow"></span><button class="btn sm ghost" data-reset>Disposition par défaut</button><button class="btn sm primary" data-done>Terminé</button></div>
      <div class="tabs" data-gtabs>${cats.map(([v, l], i) => `<button data-v="${v}" aria-selected="${i === 0}">${GX.esc(l)}</button>`).join('')}</div><div class="wgal-list scroll"></div>`;
    GX.body.append(gal);
    const list = gal.querySelector('.wgal-list');
    const show = (cat) => {
      list.innerHTML = Object.entries(CAT).filter(([t, c]) => allowed(t) && !c.hidden && (cat === 'all' || (cat === 'misc' ? !c.app : c.app === cat))).map(([t, c]) => `
        <button class="wgal-it" data-add="${t}"><div class="wgal-prev"><div class="wdg ${c.accent ? 'accent' : c.sky ? 'sky' : 'glass'} sz-${c.sizes[0]}" style="position:relative;width:${SIZES[c.sizes[0]][0] * STEP - GAP}px;height:${SIZES[c.sizes[0]][1] * STEP - GAP}px;animation:none">${(() => { try { return c.render(c.sizes[0], {}); } catch (e) { return ''; } })()}</div></div>
        <b>${GX.esc(c.name)}</b><span class="faint">${c.app ? GX.esc(GX.app(c.app).name) + ' · ' : ''}${resizable(c) ? `${dimL(bounds(c).min)} à ${dimL(bounds(c).max)}` : dimL(c.sizes[0])}</span></button>`).join('');
      list.querySelectorAll('.wgal-prev .wdg').forEach((w) => { const s = Math.min(1, 150 / w.offsetWidth, 110 / w.offsetHeight); w.style.transform = `scale(${s})`; w.parentElement.style.height = w.offsetHeight * s + 'px'; w.parentElement.style.width = w.offsetWidth * s + 'px'; });
    };
    show('all');
    gal.querySelector('[data-gtabs]').addEventListener('change', (e) => show(e.detail));
    list.addEventListener('click', (e) => { const b = e.target.closest('[data-add]'); if (!b) return; const t = b.dataset.add, size = CAT[t].sizes[0]; const w = { id: GX.uid('wg'), type: t, size, ...freeSpot(size) }; layout.push(w); save(); W.render(); const el = box.querySelector(`[data-id="${w.id}"]`); if (el && !calm()) GX.animate(el, [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'bouncy' }); });
    gal.querySelector('[data-done]').onclick = () => W.edit(false);
    gal.querySelector('[data-reset]').onclick = () => { const before = rects(); fresh(); save(); W.render(); settle(before); };
    GX.animate(gal, [{ transform: 'translate(-50%, 110%)' }, { transform: 'translate(-50%, 0)' }], { spring: 'snappy' });
  }
  GX.win(window, 'keydown', (e) => { if (e.key === 'Escape' && editing) W.edit(false); });
  GX.on('ctx', () => { layout = null; box?.classList.remove('settled'); W.render(); });
  GX.on('badges', () => W.render());
  GX.on('data:projects', () => !editing && W.render());
  GX.on('data:users', () => !editing && W.render());   /* [GEARBOX] photos de profil changées */
  GX.on('data:tasks', () => !editing && W.render());   /* [GEARBOX] tâches (To-do) changées : Mes tâches, échéances */
  GX.on('data:hello', () => !editing && W.render());   /* [GEARBOX] musique du jour, actus chargées */
  setInterval(() => { if (box && !editing && box.querySelector('.wclock')) W.render(); }, 60000);

  /* ---------------- Widget Chat : interactions (bureau ET coque téléphone) ---------------- */
  const chItem = (el) => { const id = el?.closest('.wch')?.dataset.wid; if (!id) return null; if (!layout) load(); return layout.find((x) => x.id === id) || null; };
  /* Re-rend en place chaque widget Chat présent (bureau ou accueil mobile), sans toucher aux autres widgets */
  function chRefresh(focusId) {
    if (!layout) return;
    GX.root.querySelectorAll('.wch[data-wid]').forEach((el) => {
      const w = layout.find((x) => x.id === el.dataset.wid); if (!w || !CAT[w.type]?.live) return;
      const ae = GX.root.activeElement, had = ae && el.contains(ae) && ae.matches('[data-wc-in]'), pos = had ? ae.selectionStart : null;
      const sc = el.querySelector('.wch-list')?.scrollTop || 0;
      const tmp = document.createElement('div'); try { tmp.innerHTML = CAT[w.type].render(w.size, w.cfg || {}, w); } catch (e) { return; }
      const nu = tmp.firstElementChild; if (!nu) return; el.replaceWith(nu);
      const l = nu.querySelector('.wch-list'); if (l) l.scrollTop = sc;
      if (had || focusId === w.id) { const i = nu.querySelector('[data-wc-in]'); if (i) { i.focus({ preventScroll: true }); const p = pos ?? i.value.length; i.setSelectionRange(p, p); } }
    });
  }
  /* Un widget affiche-t-il cette conversation, visible (bureau non estompé par une fenêtre) ? */
  const chShown = (convId) => [...GX.root.querySelectorAll('.wch[data-wid]')].some((el) => { const w = layout?.find((x) => x.id === el.dataset.wid); return w && chConv(w.cfg)?.id === convId && el.offsetParent && !el.closest('.dim') && !el.closest('.away'); });   /* .away : accueil du téléphone caché sous une rubrique */
  const chChatOpen = () => (GX.wm?.list?.() || []).some((x) => x.appId === 'chat' || x.app?.id === 'chat');
  function chOpen(c, origin) {
    if (!c) return;
    if (origin?.closest('#widgets') && GX.wm.desktopShown?.()) GX.wm.showDesktop(false);
    const win = GX.wm.open('chat', {}, { origin: origin?.closest('.wdg') || origin });
    if (!win) return;                                  // [GEARBOX] ouverture refusée : rien
    const go = () => win.inst?.command?.('conv:' + c.id);
    if (win?.inst?.command) go(); else setTimeout(go, 420);
  }
  function chSend(w, input) {
    const c = chConv(w.cfg), t = input?.value.trim(); if (!c || !t) return;
    /* [GEARBOX] Envoi RÉEL par GX.chatFeed (même événement que la rubrique Chat), sans optimisme : le message
       apparaît quand le serveur le diffuse. Le brouillon est vidé tout de suite (le re-rendu à l'arrivée du
       message ne doit pas le réafficher) et restauré si l'envoi échoue. */
    if (!GX.chatFeed) return chOpen(c, input);
    delete chDraft[w.id + c.id]; input.value = '';
    w.cfg = { ...(w.cfg || {}), conv: c.id }; save();
    GX.chatFeed.send(c.id, t).catch((e) => {
      chDraft[w.id + c.id] = t; chRefresh(w.id);
      GX.shell?.hud?.(e?.message || 'Échec de l’envoi du message.');
    });
  }
  /* Fil chargé ou message reçu (GX.chatFeed) : le widget suit ; la conversation affichée est marquée lue AU SERVEUR */
  GX.on('chat:message', ({ conv } = {}) => {
    if (!layout || !GX.root.querySelector('.wch[data-wid]')) return;
    const c = D.CONVS.find((x) => x.id === conv);
    if (c && c.unread && chShown(conv)) { c.unread = 0; GX.chatFeed?.read(conv); setTimeout(() => GX.emit('chat:read')); }
    chRefresh();
  });
  /* Capture : les clics dans le widget ne remontent pas jusqu'à l'ouverture de l'app */
  GX.win(document, 'click', (e) => {
    const root = e.target.closest?.('.wch'); if (!root || GX.host.classList.contains('desk-editing')) return;
    const w = chItem(root); if (!w) return;
    e.stopPropagation();
    const b = e.target.closest('[data-wc]'), c = chConv(w.cfg);
    if (!b) { if (!e.target.closest('[data-wc-zone]')) chOpen(c, root); return; }   // titre : ouvre la conversation
    const a = b.dataset.wc;
    if (a === 'open') return chOpen(c, b);
    if (a === 'send') return chSend(w, root.querySelector('[data-wc-in]'));
    if (a === 'sel') {
      const x = D.CONVS.find((y) => y.id === b.dataset.convId); if (!x) return;
      w.cfg = { ...(w.cfg || {}), conv: x.id }; save();
      if (x.unread && GX.chatFeed?.isLoaded(x.id)) { x.unread = 0; GX.chatFeed.read(x.id); GX.emit('chat:read'); GX.emit('badges'); }
      return chRefresh(w.id);
    }
    if (a === 'react') {
      /* [GEARBOX] Réaction RÉELLE (bascule gérée par le serveur, retour par chat:message:updated). */
      const id = b.closest('[data-wmsg]')?.dataset.wmsg;
      if (!id || !GX.chatFeed) return chOpen(c, b);
      return GX.chatFeed.react(id, b.dataset.e).catch((e2) => GX.shell?.hud?.(e2?.message || 'Échec de la réaction.'));
    }
  }, true);
  GX.win(document, 'keydown', (e) => {
    const i = e.target.closest?.('.wch [data-wc-in]'); if (!i) return;
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); e.stopPropagation(); const w = chItem(i); if (w) chSend(w, i); }
    else if (e.key === 'Escape') { e.stopPropagation(); i.blur(); }
  });
  GX.win(document, 'input', (e) => {
    const i = e.target.closest?.('.wch [data-wc-in]'); if (!i) return;
    const w = chItem(i), c = w && chConv(w.cfg); if (c) chDraft[w.id + c.id] = i.value;
  });

  GX.css(`
  #widgets{position:absolute;left:22px;top:calc(var(--menubar-h) + 22px);z-index:1;display:block;grid-template-columns:none;transition:filter var(--t-slow),opacity var(--t-slow)}
  #widgets .wdg{position:absolute;border-radius:24px;padding:14px 16px;display:flex;flex-direction:column;overflow:hidden;cursor:pointer;animation:ui-pop var(--t-slow) var(--spring-bouncy) both;transition:transform var(--t-med) var(--spring-bouncy),box-shadow var(--t-med),scale var(--t-med) var(--spring-bouncy),left 480ms var(--spring-snappy),top 480ms var(--spring-snappy);user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none}
  #widgets .wdg input,#widgets .wdg textarea,#widgets .wch-thread{user-select:text;-webkit-user-select:text}
  #widgets .wdg .scroll,#widgets .wdg textarea{touch-action:pan-y}
  #widgets .wdg:not(.lift):not(.sizing):hover{transform:scale(1.015)}
  .wdg .wt{display:flex;align-items:center;gap:7px;font-weight:700;font-size:12.5px;color:var(--text-2)}
  .wdg .wt svg.i{width:15px;height:15px}
  .wdg .gx-gl{stroke-width:2.2}
  .wdg .wv{font-size:36px;font-weight:700;letter-spacing:-.03em;margin-top:auto;line-height:1}
  .wdg .wl{display:grid;gap:2px;margin-top:8px;min-height:0;overflow:hidden}
  .wdg .wr{display:flex;align-items:center;gap:8px;font-size:12.5px;min-height:28px;padding:0 6px;margin:0 -6px;border-radius:8px}
  .wdg .wr:hover{background:var(--line)}
  .wdg.accent{background:var(--bony-grad);color:#fff;box-shadow:0 18px 40px -16px rgba(247,86,50,.7)}
  .wdg.accent .wt,.wdg.accent .faint{color:rgba(255,255,255,.82)}
  .wdg.sky{background:linear-gradient(160deg,#4d8dde,#2a4f9b 70%,#253d78);color:#fff;box-shadow:0 18px 40px -18px rgba(40,70,150,.8)}
  .wtiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:auto}
  .wtiles>div{display:grid;gap:2px;padding:8px;border-radius:12px;background:var(--line)}.wtiles b{font-size:17px}.wtiles .faint{font-size:11px}
  .wweek{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-top:auto}
  .wday{display:grid;justify-items:center;gap:3px;padding:8px 2px;border-radius:12px;background:var(--line);font-size:11px}
  .wday b{font-size:17px}.wday.on{background:var(--bony-grad);color:#fff}.wday.on .faint{color:rgba(255,255,255,.8)}
  .wdots{display:flex;gap:3px;height:6px}.wdots i{width:6px;height:6px;border-radius:50%}
  .wweek.tall{flex:1;min-height:0;margin-top:10px}.wweek.tall .wday{align-content:start;min-width:0}
  .wdl{display:grid;gap:3px;width:100%;margin-top:2px;min-width:0}.wdl span{display:block;font-size:10.5px;line-height:1.3;padding:2px 5px;border-radius:6px;border-left:3px solid var(--c,var(--line-2));background:color-mix(in srgb,var(--c,#888) 14%,transparent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left}
  .wday.on .wdl span{background:rgba(255,255,255,.18);color:#fff}
  .wfc{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-top:8px;font-size:11px;text-align:center}.wfc>div{display:grid;justify-items:center;gap:2px;opacity:.9}
  .wfc.lg{margin-top:14px;font-size:12.5px;gap:8px}.wfc.lg>div{padding:8px 2px;border-radius:12px;background:rgba(255,255,255,.12)}.wfc.lg b{font-size:15px}
  .wfv{display:grid;gap:4px;margin-top:auto;font-size:12px}.wfv>div{display:grid;grid-template-columns:1fr auto 30px 26px;align-items:center;gap:6px;padding:3px 0;border-top:1px solid rgba(255,255,255,.14)}.wfv>div>span:last-child{opacity:.7;text-align:right}.wfv b{text-align:right}
  .wcols2{display:grid;grid-template-columns:1fr 1fr;gap:18px}
  .wclock{width:100%;height:100%}.wclock circle{fill:none;stroke:var(--line-2);stroke-width:2}.wclock line{stroke:var(--text-3);stroke-width:2;stroke-linecap:round}
  .wclock .hh{stroke:var(--text);stroke-width:4}.wclock .mm{stroke:var(--text);stroke-width:3}.wclock .c{fill:var(--bony-orange);stroke:none}
  .wnote{flex:1;margin-top:8px;border:0;outline:0;resize:none;background:transparent;font:inherit;font-size:13px;line-height:1.5;color:var(--text)}
  .wsc{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;height:100%;align-items:center}.wsc.S{grid-template-columns:1fr 1fr}
  .wsc button{display:grid;justify-items:center;gap:5px;font-size:11px;font-weight:600}.wsc button span{max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .wthumb{width:40px;height:40px;border-radius:10px;flex:none;display:grid;place-items:center;color:#fff;background:linear-gradient(140deg,var(--a),#1b1822)}
  #widgets.settled:not(.editing) .wdg{animation:none}
  /* Chat interactif */
  .wdg.live{cursor:default}
  #widgets .wdg.live:not(.lift):hover{transform:none}
  .wch{flex:1;min-height:0;min-width:0;display:flex;flex-direction:column;gap:8px}
  .wch-t{cursor:pointer;min-width:0}
  .wch-t .wch-ct{color:var(--text)}
  .wch-t .count{flex:none}
  .wch-t .icon-btn{margin:-4px -6px -4px 0;color:var(--text-2)}
  .wch-body{flex:1;min-height:0;display:flex;gap:8px}
  .wch-list{flex:none;display:flex;flex-direction:column;gap:2px;padding:4px 3px;margin:-4px -3px;overflow-x:hidden}
  .wch.cw-n .wch-list{width:50px}.wch.cw-w .wch-list{width:170px}.wch.cw-w.ch-4 .wch-list{width:200px}
  .wch-it{display:flex;align-items:center;gap:8px;width:100%;min-width:0;padding:4px 5px;border-radius:12px;text-align:left;color:var(--text);flex:none;transition:background var(--t-fast)}
  .wch-it:hover{background:var(--line)}
  .wch-it.on{background:color-mix(in srgb,var(--accent) 16%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 45%,transparent)}
  .wch-avw{position:relative;flex:none;display:grid}
  .wch-avw .count{position:absolute;right:-6px;top:-5px;min-width:16px;height:16px;padding:0 4px;font-size:10px;font-style:normal;box-shadow:0 0 0 2px var(--surface-1)}
  .wch-itx{flex:1;min-width:0;display:grid;gap:1px;line-height:1.25}
  .wch-itx b{font-size:12.5px;font-weight:650}.wch-it.unread .wch-itx b{font-weight:800}
  .wch-itx span{font-size:11.5px;color:var(--text-2)}
  .wch-gav{width:var(--s);height:var(--s);border-radius:50%;flex:none;display:grid;place-items:center;color:#fff;font-weight:800;font-size:calc(var(--s) * .45)}
  .wch-duo{position:relative;width:var(--d);height:var(--d);flex:none;display:block}
  .wch-duo .av{position:absolute;--s:calc(var(--d) * .68)}
  .wch-duo .av:first-child{left:0;top:0}.wch-duo .av:last-child{right:0;bottom:0;box-shadow:0 0 0 2px var(--surface-2)}
  .wch-conv{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;gap:6px;padding:6px;border-radius:14px;background:color-mix(in srgb,var(--surface-0) 55%,transparent);box-shadow:inset 0 0 0 1px var(--line)}
  :root[data-theme="light"] .wch-conv{background:color-mix(in srgb,var(--surface-2) 70%,transparent)}
  /* column-reverse : le fil reste ancré sur le dernier message, sans script */
  .wch-thread{flex:1;min-height:0;display:flex;flex-direction:column-reverse;overflow-y:auto;overflow-x:hidden}
  .wch-inner{display:flex;flex-direction:column;gap:2px;padding:10px 2px 2px}
  .wch-m{position:relative;display:flex;align-items:flex-end;gap:6px;min-width:0}
  .wch-m.first{margin-top:6px}
  .wch-m.me{flex-direction:row-reverse}
  .wch-sp{width:22px;flex:none}
  .wch-mc{display:flex;flex-direction:column;align-items:flex-start;max-width:78%;min-width:0}
  .wch-m.me .wch-mc{align-items:flex-end}
  .wch-au{font-size:11px;font-weight:700;margin:0 0 1px 8px}
  .wch-b{max-width:100%;padding:5px 10px;border-radius:14px;font-size:12.5px;line-height:1.38;background:var(--surface-3);color:var(--text);box-shadow:inset 0 0 0 1px var(--line);overflow-wrap:anywhere;white-space:pre-wrap}
  :root[data-theme="light"] .wch-b{background:#fff;box-shadow:inset 0 0 0 1px var(--line-2)}
  .wch-m.me .wch-b{background:var(--bony-grad);color:#fff;box-shadow:none}
  .wch-b.del,.wch-m.me .wch-b.del{font-style:italic;color:var(--text-2);background:transparent;box-shadow:inset 0 0 0 1px var(--line-2)}
  .wch-h{font-size:10.5px;opacity:.7;margin-left:6px;white-space:nowrap;font-variant-numeric:tabular-nums;font-style:normal}
  .wch-rs{display:flex;flex-wrap:wrap;gap:3px;margin-top:2px}
  .wch-rs button{display:inline-flex;align-items:center;gap:3px;height:20px;padding:0 6px;border-radius:99px;font-size:11.5px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line-2)}
  .wch-rs button span{font-size:10.5px;font-weight:700;color:var(--text)}
  .wch-rs button.mine{box-shadow:inset 0 0 0 1px var(--accent)}.wch-rs button.mine span{color:var(--accent)}
  .wch-rx{position:absolute;top:-8px;z-index:2;display:flex;gap:1px;padding:2px;border-radius:99px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line-2),var(--shadow-2);opacity:0;pointer-events:none;transition:opacity var(--t-fast)}
  .wch-m:not(.me) .wch-rx{right:0}.wch-m.me .wch-rx{left:0}
  .wch-m:hover .wch-rx{opacity:1;pointer-events:auto;transition-delay:120ms}
  .wch-rx button{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:12.5px;transition:transform var(--t-fast)}
  .wch-rx button:hover{background:var(--surface-4);transform:scale(1.15)}
  .wch-sys,.wch-empty{align-self:center;margin:6px 0;font-size:11.5px;color:var(--text-2);text-align:center}
  .wch-comp{flex:none;display:flex;align-items:center;gap:6px}
  .wch-in{flex:1;min-width:0;height:32px;padding:0 12px;border:0;outline:0;border-radius:99px;background:var(--surface-3);color:var(--text);font:inherit;font-size:13px;box-shadow:inset 0 0 0 1px var(--line);transition:box-shadow var(--t-fast)}
  .wch-in::placeholder{color:var(--text-3)}
  :root[data-theme="light"] .wch-in{background:#fff;box-shadow:inset 0 0 0 1px var(--line-2)}
  .wch-in:focus{box-shadow:inset 0 0 0 1px var(--accent),0 0 0 3px var(--focus)}
  .wch-send{width:32px;height:32px;border-radius:50%;flex:none;display:grid;place-items:center;background:var(--bony-grad);color:#fff;transition:transform var(--t-med) var(--spring-bouncy)}
  .wch-send:active{transform:scale(.88)}.wch-send svg.i{stroke-width:2.4}
  .wch.ch-2{gap:6px}.wch.ch-2 .wch-conv{padding:4px 6px;gap:4px}.wch.ch-2 .wch-inner{padding-top:8px}
  .wch.ch-2 .wch-in{height:28px}.wch.ch-2 .wch-send{width:28px;height:28px}
  .m-wdg.live{aspect-ratio:auto;min-height:340px}
  .m-wdg.live.msz-XL{min-height:220px}
  .m-wdg.msz-XXL,.m-wdg.msz-XXW{grid-column:span 2}
  .m-wdg.msz-W,.m-wdg.msz-M3,.m-wdg.msz-X3,.m-wdg.msz-XXW{grid-column:span 2;aspect-ratio:auto;min-height:220px}
  .m-wdg.msz-W{min-height:150px}
  .m-wdg.msz-T{grid-row:span 2;aspect-ratio:auto}
  .m-wdg.live.msz-X3,.m-wdg.live.msz-M3{min-height:300px}
  .m-wdg .wrz,.m-wdg .wtip{display:none}
  .m-wdg.live .wch-rx{display:none}
  /* édition */
  #widgets.editing .wdg{cursor:grab;animation:w-jiggle .32s ease-in-out infinite alternate}
  #widgets.editing .wdg:nth-child(2n){animation-delay:-.16s}
  /* geste : soulèvement (déplacement) et cadre qui suit le pointeur (redimensionnement) */
  #widgets .wdg.lift{z-index:20;scale:1.03;cursor:grabbing;transform:none!important;animation:none!important;transition:scale var(--t-med) var(--spring-bouncy),box-shadow var(--t-med);box-shadow:0 34px 70px -22px rgba(0,0,0,.6),0 0 0 1px var(--line-2)}
  #widgets .wdg.sizing{z-index:20;transform:none!important;animation:none!important;transition:left 480ms var(--spring-snappy),top 480ms var(--spring-snappy),box-shadow var(--t-med);box-shadow:0 26px 60px -24px rgba(0,0,0,.55),0 0 0 1px var(--line-2)}
  body.wdg-grabbing,body.wdg-grabbing *{cursor:grabbing!important;user-select:none!important;-webkit-user-select:none!important}
  body.wdg-sizing,body.wdg-sizing *{cursor:nwse-resize!important;user-select:none!important;-webkit-user-select:none!important}
  .wrz{position:absolute;right:2px;bottom:2px;width:20px;height:20px;z-index:4;border-radius:0 0 22px 0;opacity:0;cursor:nwse-resize;touch-action:none;color:var(--text-2);transition:opacity var(--t-fast)}
  .wrz::before{content:'';position:absolute;right:6px;bottom:6px;width:9px;height:9px;border-right:2.5px solid currentColor;border-bottom:2.5px solid currentColor;border-bottom-right-radius:7px;opacity:.75}
  .wdg.accent .wrz,.wdg.sky .wrz{color:#fff}
  #widgets .wdg:hover .wrz,#widgets.editing .wrz,#widgets .wdg.sizing .wrz{opacity:1}
  @media (hover:none){#widgets .wrz{opacity:.6}}
  .wtip{position:absolute;left:50%;top:50%;translate:-50% -50%;z-index:5;padding:5px 12px;border-radius:99px;background:var(--surface-1);color:var(--text);font-size:12.5px;font-weight:800;white-space:nowrap;font-variant-numeric:tabular-nums;box-shadow:var(--shadow-2),0 0 0 1px var(--line-2);pointer-events:none}
  .wtip:empty{display:none}
  @keyframes w-jiggle{from{rotate:-.6deg}to{rotate:.6deg}}
  :root[data-effects="eco"] #widgets.editing .wdg{animation:none}
  .wx,.wsz{position:absolute;top:8px;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:10px;font-weight:800;z-index:3;box-shadow:0 2px 6px rgba(0,0,0,.4)}
  .wx{left:8px;background:#ff5f57;color:#fff}.wsz{right:8px;width:auto;min-width:22px;padding:0 7px;border-radius:99px;background:var(--surface-1);color:var(--text);font-variant-numeric:tabular-nums}
  .wghost{position:absolute;z-index:2;border-radius:24px;border:2px dashed color-mix(in srgb,var(--bony-orange) 70%,transparent);background:color-mix(in srgb,var(--bony-orange) 10%,transparent);transition:left 300ms var(--spring-snappy),top 300ms var(--spring-snappy),width 300ms var(--spring-snappy),height 300ms var(--spring-snappy);pointer-events:none}
  .wghost.over{z-index:21;background:color-mix(in srgb,var(--bony-orange) 6%,transparent)}
  @media (prefers-reduced-motion: reduce){#widgets .wdg,#widgets .wdg.lift,#widgets .wdg.sizing,.wghost{transition:none!important}#widgets .wdg{animation:none!important}}
  :root[data-effects="eco"] #widgets .wdg,:root[data-effects="eco"] .wghost{transition-duration:120ms!important;transition-timing-function:ease-out!important}
  :root[data-effects="eco"] #widgets .wdg.lift{scale:1;box-shadow:var(--shadow-3)}
  .wgal{position:fixed;left:50%;bottom:14px;z-index:8500;width:min(1100px,calc(100vw - 28px));height:330px;border-radius:26px;padding:14px 16px;display:flex;flex-direction:column;transform:translateX(-50%)}
  .wgal-list{flex:1;min-height:0;display:flex;flex-wrap:wrap;gap:12px;padding:12px 2px;align-content:flex-start}
  .wgal-it{display:grid;justify-items:center;gap:3px;width:172px;padding:10px;border-radius:16px;text-align:center;transition:background var(--t-fast),transform var(--t-med) var(--spring-bouncy)}
  .wgal-it:hover{background:var(--line);transform:translateY(-2px)}.wgal-it:active{transform:scale(.96)}
  .wgal-it b{font-size:12.5px}.wgal-it .faint{font-size:11px}
  .wgal-prev{display:grid;place-items:start;margin-bottom:6px;pointer-events:none}.wgal-prev .wdg{transform-origin:0 0;border-radius:22px;padding:14px 16px;display:flex;flex-direction:column;overflow:hidden}
  body.desk-editing .dock-wrap{transform:translateY(calc(100% + 14px))}
  `);
})();

}
