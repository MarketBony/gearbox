/* =====================================================================
   GEARBOX OS — bureau personnalisable (widgets)
   Chaque utilisateur compose son propre tableau de bord sur le bureau :
   clic droit › « Modifier le bureau » → galerie de widgets par rubrique,
   glisser pour déplacer (grille aimantée), tailles S / M / L / XL,
   configuration (projet épinglé, indicateur, raccourcis…), retrait.
   La disposition est mémorisée par utilisateur. Les widgets respectent
   les droits du rôle (une rubrique interdite = widget indisponible).
   ===================================================================== */
(() => {
  const W = (GX.widgets = {});
  const D = GX.data, F = GX.fmt;
  const CELL = 84, GAP = 12, STEP = CELL + GAP;
  const SIZES = { S: [2, 2], M: [4, 2], L: [4, 4], XL: [6, 2], XXL: [6, 4] };
  const SIZE_L = { S: 'Petit', M: 'Moyen', L: 'Grand', XL: 'Bandeau', XXL: 'Très grand' };
  const today = () => GX.iso(GX.today());
  const act = () => D.PROJECTS.filter((p) => p.status !== 'Draft');
  const planned = () => D.BUDGET_LINES.reduce((s, l) => s + Object.values(l.planned).flat().reduce((a, b) => a + b, 0), 0);
  const spent = () => act().filter((p) => !p.brands.includes('Holding')).reduce((s, p) => s + D.projectActual(p), 0) + D.EXPENSES.filter((e) => !e.brands.includes('Holding')).reduce((s, e) => s + e.amount, 0);
  const head = (icon, t, extra = '') => `<div class="wt">${GX.appGlyph ? GX.appGlyph(icon) : GX.icon(icon, 'sm')}<span class="ellipsis grow">${t}</span>${extra}</div>`;
  const row = (l, r, s = '') => `<div class="wr"><span class="ellipsis grow">${l}</span>${r ? `<b class="num">${r}</b>` : ''}${s}</div>`;

  /* ---------------- Widget « Chat interactif » ----------------
     Liste compacte (Général, groupes, privés) + fil de la conversation choisie + saisie.
     Écrit réellement dans D.MESSAGES et prévient l'app Chat (GX.emit 'chat:message',
     from:'widget') : si elle est ouverte, elle prend la suite (« Vu par », réponse simulée) ;
     sinon le widget simule lui-même la réponse. Les clics dans le widget n'ouvrent PAS
     l'app (écoute en capture) — sauf le bouton « Ouvrir » et le titre, qui ouvrent la
     conversation dans l'app Chat (commande 'conv:<id>'). Rôles sans chat (Chef de site) :
     widget indisponible via allowed(). External : pas de Chat Général, projet cité neutre. */
  const CH_ME = 'me', CH_REACTS = ['👍', '❤️', '😂', '😮'], chDraft = {}, chPending = {};
  const chVisible = () => D.CONVS.filter((c) => c.members.includes(CH_ME) && !(c.kind === 'general' && GX.ctx.role === 'External'));
  const chMsgs = (c) => (D.MESSAGES[c.id] ||= []);
  const chLast = (c) => { const a = chMsgs(c); return a[a.length - 1]; };
  const chOther = (c) => c.members.find((u) => u !== CH_ME) || CH_ME;
  const chTitle = (c) => (c.kind === 'dm' ? D.user(chOther(c)).name : c.name);
  const chFirst = (u) => (u === CH_ME ? 'Vous' : D.user(u).name.split(' ')[0]);
  const chOrder = () => { const v = chVisible(), s = (a) => a.sort((x, y) => (y.pinned ? 1 : 0) - (x.pinned ? 1 : 0) || (chLast(y)?.at || 0) - (chLast(x)?.at || 0)); return [...v.filter((c) => c.kind === 'general'), ...s(v.filter((c) => c.kind === 'group')), ...s(v.filter((c) => c.kind === 'dm'))]; };
  const chConv = (cfg = {}) => { const v = chOrder(); return v.find((c) => c.id === cfg.conv) || v[0]; };
  const chHhmm = (at) => new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const chText = (m) => (!m ? '' : m.deleted ? 'Message supprimé' : m.expired ? '📎 Pièce jointe expirée' : ({ image: '📷 Image', file: '📎 ' + String(m.file || 'Pièce jointe').split(' · ')[0], voice: '🎤 Message vocal' + (m.dur ? ` (${m.dur})` : ''), project: '📋 ' + (GX.ctx.role === 'External' ? 'Projet cité' : D.project(m.project)?.name || 'Projet cité'), gif: '🎞️ GIF' + (m.gif ? ' · ' + m.gif : '') }[m.type] ?? (m.t || '')));
  const chPrev = (c, m) => (!m ? 'Aucun message' : m.type === 'sys' ? m.t : (m.u === CH_ME ? 'Vous : ' : c.kind !== 'dm' ? chFirst(m.u) + ' : ' : '') + chText(m));
  function chAv(c, s) {
    if (c.kind === 'dm') { const u = D.user(chOther(c)); return `<span class="av" style="--s:${s}px;--c:${u.color}">${u.initials}${u.online ? '<i class="pres"></i>' : ''}</span>`; }
    if (c.kind === 'general') return `<span class="wch-gav" style="--s:${s}px;background:var(--bony-grad)">#</span>`;
    if (c.photo) return `<span class="wch-gav" style="--s:${s}px;background:${c.photo}"></span>`;
    const us = c.members.filter((u) => u !== CH_ME).slice(0, 2).map((u) => D.user(u));
    return `<span class="wch-duo" style="--d:${s}px">${us.map((u) => `<span class="av" style="--c:${u.color}">${u.initials}</span>`).join('')}</span>`;
  }
  function chatLive(sz, cfg = {}, w) {
    const all = chOrder(), c = chConv(cfg), n = all.reduce((s, x) => s + (x.unread || 0), 0);
    if (!c) return `<div class="wch">${head('chat', 'Chat')}<div class="faint" style="margin:auto">Aucune conversation</div></div>`;
    const wide = sz !== 'L';
    const list = all.map((x) => `<button class="wch-it ${x.id === c.id ? 'on' : ''} ${x.unread ? 'unread' : ''}" data-wc="sel" data-conv-id="${x.id}"${wide ? '' : ` data-tip="${GX.esc(chTitle(x))}"`} aria-label="${GX.esc(chTitle(x))}">
        <span class="wch-avw">${chAv(x, wide ? 28 : 32)}${x.unread ? `<i class="count">${x.unread > 99 ? '99+' : x.unread}</i>` : ''}</span>
        ${wide ? `<span class="wch-itx"><b class="ellipsis">${GX.esc(chTitle(x))}</b>${sz === 'XXL' ? `<span class="ellipsis">${GX.esc(chPrev(x, chLast(x)))}</span>` : ''}</span>` : ''}</button>`).join('');
    const arr = chMsgs(c).slice(sz === 'XL' ? -8 : -16);
    const same = (a, b) => a && b && a.type !== 'sys' && b.type !== 'sys' && a.u === b.u && Math.abs(a.at - b.at) < 5 * 6e4;
    const th = arr.map((m, i) => {
      if (m.type === 'sys') return `<div class="wch-sys">${GX.esc(m.t)}</div>`;
      const mine = m.u === CH_ME, u = D.user(m.u), f = !same(arr[i - 1], m), rs = Object.entries(m.r || {}).filter(([, us]) => us.length);
      return `<div class="wch-m ${mine ? 'me' : ''} ${f ? 'first' : ''}" data-wmsg="${m.id}">
        ${mine ? '' : f ? `<span class="av" style="--s:22px;--c:${u.color}" data-tip="${GX.esc(u.name)}">${u.initials}</span>` : '<span class="wch-sp"></span>'}
        <div class="wch-mc">${f && !mine && c.kind !== 'dm' ? `<span class="wch-au" style="color:${u.color}">${GX.esc(chFirst(m.u))}</span>` : ''}
          <div class="wch-b ${m.deleted || m.expired ? 'del' : ''}">${GX.esc(chText(m))}${m.edited ? ' <span class="wch-h">(modifié)</span>' : ''}<span class="wch-h">${chHhmm(m.at)}</span></div>
          ${rs.length && !m.deleted ? `<div class="wch-rs">${rs.map(([e, us]) => `<button data-wc="react" data-e="${e}" class="${us.includes(CH_ME) ? 'mine' : ''}">${e}<span>${us.length}</span></button>`).join('')}</div>` : ''}
        </div>
        ${m.deleted ? '' : `<div class="wch-rx">${CH_REACTS.map((e) => `<button data-wc="react" data-e="${e}" aria-label="Réagir ${e}">${e}</button>`).join('')}</div>`}
      </div>`;
    }).join('') || '<div class="wch-empty">Aucun message — dites bonjour 👋</div>';
    const to = c.kind === 'dm' ? 'à ' + chFirst(chOther(c)) : 'dans ' + chTitle(c);
    return `<div class="wch sz-${sz}" data-wid="${w ? w.id : ''}">
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
    'budget-ring': { app: 'budget', name: 'Budget de l’année', sizes: ['S', 'M'], render(sz) {
      const p = planned(), s = spent(), pct = Math.round((s / p) * 100);
      if (sz === 'S') return `${head('budget', 'Budget ' + new Date().getFullYear())}<div class="row" style="margin-top:auto;gap:10px"><div class="ring" style="--p:${Math.min(100, pct)};--sz:62px;--th:8px"></div><div><div class="wv num" style="font-size:24px">${pct} %</div><div class="faint" style="font-size:11px">${F.eurK(s)}</div></div></div>`;
      const mix = Object.fromEntries(D.SERVICES.map((x) => [x, 0])); act().forEach((pr) => { const ss = pr.services.filter((x) => D.SERVICES.includes(x)); (ss.length ? ss : D.SERVICES).forEach((x, _, a) => (mix[x] += D.projectActual(pr) / a.length)); });
      return `${head('budget', 'Budget ' + new Date().getFullYear(), `<span class="faint">${pct} %</span>`)}<div class="row" style="gap:14px;margin-top:auto"><div class="ring" style="--p:${Math.min(100, pct)};--sz:84px;--th:10px"></div><div class="grow" style="display:grid;gap:5px">${D.SERVICES.map((x) => `<div class="row" style="gap:6px;font-size:12px"><i class="brand-dot" style="--c:${D.SERVICE_COLOR[x]}"></i><b style="width:30px">${x}</b><span class="grow"></span><span class="num muted">${F.eurK(mix[x])}</span></div>`).join('')}</div></div>`;
    } },
    'budget-sites': { app: 'budget', name: 'Top sites consommés', sizes: ['M', 'L'], render(sz) {
      const by = {}; act().filter((p) => !p.brands.includes('Holding')).forEach((p) => D.routeItem({ ...p, amount: D.projectActual(p) }).forEach(([k, v]) => (by[k] = (by[k] || 0) + v)));
      const items = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, sz === 'L' ? 8 : 3).map(([l, v]) => ({ label: l, value: v }));
      return `${head('budget', 'Top sites consommés')}<div style="margin-top:10px">${GX.chart.hbars({ items })}</div>`;
    } },
    kpi: { app: 'dashboard', name: 'Indicateur', sizes: ['S'], cfg: 'kpi', render(sz, c = {}) {
      const k = c.kpi || 'actifs', p = planned(), s = spent();
      const K = { actifs: ['Projets actifs', act().filter((x) => x.status === 'Active').length, 'en cours de réalisation', 'layers'], reste: ['Reste à engager', F.eurK(p - s), p - s < 0 ? 'dépassement' : 'disponible', 'target'],
        conso: ['Consommation', Math.round((s / p) * 100) + ' %', 'du budget annuel', 'percent'], campagnes: ['Campagnes programmées', act().flatMap((x) => x.tasks).filter((t) => ['SMS', 'E-mail'].includes(t.channel) && t.status === 'Programmed').length, 'SMS / e-mail', 'campaigns'],
        retard: ['Projets en retard', act().filter(D.projectLate).length, 'échéance dépassée', 'alert'] }[k];
      return `<div class="wt">${GX.icon(K[3], 'sm')}<span class="ellipsis grow">${K[0]}</span></div><div class="wv num">${K[1]}</div><div class="faint" style="font-size:12px">${K[2]}</div>`;
    } },
    late: { app: 'projects', name: 'Projets en retard', sizes: ['S', 'M'], accent: true, render(sz) {
      const L = act().filter(D.projectLate);
      if (sz === 'S') return `${head('projects', 'En retard')}<div class="wv num">${L.length}</div><div class="faint" style="font-size:12px">projets à reprendre</div>`;
      return `${head('projects', 'Projets en retard', `<b>${L.length}</b>`)}<div class="wl">${L.slice(0, 3).map((p) => `<div class="wr" data-proj="${p.id}"><span class="ellipsis grow">${GX.esc(p.name)}</span><span class="num" style="opacity:.85">${F.rel(p.endDate)}</span></div>`).join('') || '<div class="faint">Aucun retard 🎉</div>'}</div>`;
    } },
    deadlines: { app: 'projects', name: 'Prochaines échéances', sizes: ['M', 'L'], render(sz) {
      const L = act().filter((p) => p.status === 'Active' && p.endDate >= today()).sort((a, b) => a.endDate.localeCompare(b.endDate)).slice(0, sz === 'L' ? 7 : 3);
      return `${head('projects', 'Prochaines échéances')}<div class="wl">${L.map((p) => `<div class="wr" data-proj="${p.id}"><b class="num" style="width:52px">${F.date(p.endDate)}</b><span class="ellipsis grow">${GX.esc(p.name)}</span><span class="faint num">${D.projectProgress(p)} %</span></div>`).join('')}</div>`;
    } },
    'project-pin': { app: 'projects', name: 'Projet épinglé', sizes: ['M', 'L'], cfg: 'project', render(sz, c = {}) {
      const p = D.project(c.project) || act().find((x) => x.status === 'Active'); if (!p) return head('projects', 'Projet épinglé');
      const pr = D.projectProgress(p);
      return `${head('projects', 'Projet épinglé', GX.r.pStatus(p.status))}<div data-proj="${p.id}" style="cursor:pointer;margin-top:6px"><b style="font-size:15px" class="ellipsis" title="${GX.esc(p.name)}">${GX.esc(p.name)}</b><div class="faint ellipsis" style="font-size:12px">${p.sites.join(', ')} · ${F.date(p.startDate)} → ${F.date(p.endDate)}</div></div>
        <div class="row" style="margin-top:auto;gap:10px"><div class="grow"><div class="bar"><i style="width:${pr}%"></i></div><div class="row" style="font-size:11px;margin-top:4px"><span class="faint grow">${pr} % · ${p.tasks.length} tâches</span><b class="num">${F.eurK(D.projectActual(p))} / ${F.eurK(p.budgetPlanned)}</b></div></div></div>
        ${sz === 'L' ? `<div class="wl" style="margin-top:10px">${p.tasks.slice(0, 5).map((t) => `<div class="wr"><span class="ellipsis grow">${GX.esc(t.name)}</span>${GX.r.tStatus(t.status)}</div>`).join('')}</div>` : ''}`;
    } },
    'my-tasks': { app: 'todo', name: 'Mes tâches', sizes: ['M', 'L'], render(sz) {
      const T = D.PROJECTS.flatMap((p) => p.tasks.map((t) => ({ t, p }))).filter(({ t }) => t.assignee === 'me' && t.status !== 'Done').sort((a, b) => a.t.deadline.localeCompare(b.t.deadline)).slice(0, sz === 'L' ? 8 : 3);
      return `${head('todo', 'Mes tâches', `<span class="faint">${T.length}</span>`)}<div class="wl">${T.map(({ t, p }) => `<label class="wr" style="cursor:default"><input type="checkbox" class="check" data-task="${t.id}" /><span class="ellipsis grow">${GX.esc(t.name)} <span class="faint">· ${GX.esc(p.name)}</span></span><span class="num" style="font-size:11px;color:${t.deadline < today() ? 'var(--danger)' : 'var(--text-3)'}">${F.date(t.deadline)}</span></label>`).join('') || '<div class="faint">Rien à faire 🎉</div>'}</div>`;
    } },
    posts: { app: 'digital', name: 'Prochaines publications', sizes: ['M', 'L'], render(sz) {
      const L = D.POSTS.filter((p) => !p.archived && p.date >= today() && p.status !== 'Abandonné').sort((a, b) => a.date.localeCompare(b.date)).slice(0, sz === 'L' ? 7 : 3);
      return `${head('digital', 'Prochaines publications')}<div class="wl">${L.map((p) => `<div class="wr"><b class="num" style="width:52px">${F.date(p.date)}</b><span class="ellipsis grow">${GX.esc(p.title)}</span>${GX.r.sStatus(p.status)}</div>`).join('')}</div>`;
    } },
    'digital-week': { app: 'digital', name: 'Planning digital · semaine', sizes: ['XL'], render() {
      const t = GX.today(), mon = GX.addDays(t, -((t.getDay() + 6) % 7));
      return `${head('digital', 'Planning digital de la semaine')}<div class="wweek">${Array.from({ length: 7 }, (_, i) => { const d = GX.addDays(mon, i), iso = GX.iso(d), ps = D.POSTS.filter((p) => p.date === iso && !p.archived);
        return `<div class="wday ${iso === today() ? 'on' : ''}"><span class="faint">${F.day(d)}</span><b class="num">${d.getDate()}</b><div class="wdots">${ps.slice(0, 4).map((p) => `<i style="background:${D.socialStatus(p.status).c}" data-tip="${GX.esc(p.title)}"></i>`).join('')}</div><span class="faint" style="font-size:10px">${ps.length || ''}</span></div>`; }).join('')}</div>`;
    } },
    campaigns: { app: 'campaigns', name: 'Performance des campagnes', sizes: ['M'], render() {
      const c = act().flatMap((p) => p.tasks).filter((t) => ['SMS', 'E-mail'].includes(t.channel)), avg = (k) => (c.length ? c.reduce((s, t) => s + (t[k] || 0), 0) / c.length : 0);
      return `${head('campaigns', 'Campagnes', `<span class="faint">${c.length}</span>`)}<div class="wtiles"><div><span class="faint">Contacts</span><b class="num">${F.n(c.reduce((s, t) => s + (t.volume || 0), 0))}</b></div><div><span class="faint">Ouverture</span><b class="num">${avg('openRate').toFixed(0)} %</b></div><div><span class="faint">Clics</span><b class="num">${avg('clickRate').toFixed(1)} %</b></div></div>`;
    } },
    chat: { app: 'chat', name: 'Chat', sizes: ['S', 'M'], render(sz) {
      const n = D.CONVS.reduce((s, c) => s + c.unread, 0);
      if (sz === 'S') return `${head('chat', 'Chat')}<div class="wv num">${n}</div><div class="faint" style="font-size:12px">messages non lus</div>`;
      const last = D.CONVS.map((c) => ({ c, m: (D.MESSAGES[c.id] || []).slice(-1)[0] })).filter((x) => x.m).sort((a, b) => b.m.at - a.m.at).slice(0, 3);
      return `${head('chat', 'Derniers messages', n ? `<span class="count">${n}</span>` : '')}<div class="wl">${last.map(({ c, m }) => `<div class="wr" data-conv="${c.id}">${GX.r.av(m.u, 'sm')}<span class="ellipsis grow"><b>${GX.esc(c.name)}</b> <span class="muted">${GX.esc(m.t || (m.type === 'image' ? '📷 Photo' : '📎 Pièce jointe'))}</span></span></div>`).join('')}</div>`;
    } },
    'chat-live': { app: 'chat', name: 'Chat interactif', sizes: ['L', 'XXL', 'XL'], live: true, render: (sz, c = {}, w) => chatLive(sz, c, w) },
    birthdays: { app: 'hello', name: 'Anniversaires', sizes: ['S', 'M'], render(sz) {
      const t = GX.today(), L = D.USERS.map((u) => { const b = new Date(u.birthdate); let n = new Date(t.getFullYear(), b.getMonth(), b.getDate()); if (n < t) n = new Date(t.getFullYear() + 1, b.getMonth(), b.getDate()); return { u, n, days: Math.round((n - t) / 864e5) }; }).sort((a, b) => a.days - b.days);
      if (sz === 'S') { const x = L[0]; return `${head('hello', 'Anniversaire')}<div style="margin-top:auto">${GX.r.av(x.u.id, 'lg')}</div><b style="margin-top:6px">${GX.esc(x.u.name.split(' ')[0])}</b><div class="faint" style="font-size:12px">${x.days === 0 ? "aujourd'hui 🎂" : x.days === 1 ? 'demain' : 'dans ' + x.days + ' j'}</div>`; }
      return `${head('hello', 'Anniversaires')}<div class="wl">${L.slice(0, 3).map((x) => `<div class="wr">${GX.r.av(x.u.id, 'sm')}<span class="ellipsis grow">${GX.esc(x.u.name)}</span><span class="faint">${x.days === 0 ? "Auj. !" : x.days === 1 ? 'demain' : 'dans ' + x.days + ' j'}</span></div>`).join('')}</div>`;
    } },
    weather: { app: 'hello', name: 'Météo', sizes: ['S', 'M'], sky: true, render(sz) {
      const w = D.HELLO.weather;
      return `<div class="wt" style="color:rgba(255,255,255,.85)">${GX.icon('pin', 'sm')}${GX.esc(w.city)}</div><div class="row" style="margin-top:auto;align-items:flex-end"><div class="wv num" style="font-size:40px">${w.t}°</div><span class="grow"></span>${GX.icon(w.icon, 'xl')}</div><div style="font-size:12px;opacity:.85">${GX.esc(w.desc)} · ressenti ${w.feels}°</div>
        ${sz === 'M' ? `<div class="wfc">${D.HELLO.forecast.map(([d, ic, mx, mn]) => `<div><span>${d}</span>${GX.icon(ic, 'sm')}<b>${mx}°</b><span>${mn}°</span></div>`).join('')}</div>` : ''}`;
    } },
    music: { app: 'hello', name: 'Musique du jour', sizes: ['M'], render() {
      const t = D.HELLO.track;
      return `${head('hello', 'Musique du jour')}<div class="row" style="margin-top:auto;gap:12px"><div style="width:62px;height:62px;border-radius:12px;background:linear-gradient(135deg,${t.cover[0]},${t.cover[1]});display:grid;place-items:center;color:#fff">${GX.icon('music', 'lg')}</div><div class="grow"><b>${GX.esc(t.title)}</b><div class="faint" style="font-size:12px">${GX.esc(t.artist)}</div><div class="bar" style="margin-top:8px;height:4px"><i style="width:35%"></i></div></div><button class="icon-btn" data-play>${GX.icon('play')}</button></div>`;
    } },
    'conges-off': { app: 'conges', name: 'Absents cette semaine', sizes: ['S', 'M'], render(sz) {
      const e = GX.iso(GX.addDays(GX.today(), 6)), off = [...new Set(D.CONGES.filter((c) => c.date >= today() && c.date <= e).map((c) => c.u))];
      if (sz === 'S') return `${head('conges', 'Absents')}<div class="av-stack" style="margin-top:auto">${off.slice(0, 4).map((u) => GX.r.av(u)).join('')}</div><div class="faint" style="font-size:12px;margin-top:6px">${off.length} cette semaine</div>`;
      return `${head('conges', 'Absents cette semaine', `<span class="faint">${off.length}</span>`)}<div class="wl">${off.slice(0, 3).map((u) => { const c = D.CONGES.filter((x) => x.u === u && x.date >= today() && x.date <= e); const lt = D.leave(c[0].type); return `<div class="wr">${GX.r.av(u, 'sm')}<span class="ellipsis grow">${GX.esc(D.user(u).name)}</span><span class="badge" style="--c:${lt.c}">${lt.s}</span><span class="faint num">${c.length} j</span></div>`; }).join('') || '<div class="faint">Toute l’équipe est là</div>'}</div>`;
    } },
    'conges-solde': { app: 'conges', name: 'Mon solde de congés', sizes: ['S'], render() {
      const pris = D.CONGES.filter((c) => c.u === 'me' && c.type === 'CP').reduce((s, c) => s + (c.demi ? .5 : 1), 0), droit = D.CONGES_DROITS.me || 25, r = droit - pris;
      return `${head('conges', 'Solde CP')}<div class="wv num" style="color:${r < 0 ? 'var(--danger)' : r <= 3 ? 'var(--warn)' : 'inherit'}">${r}</div><div class="faint" style="font-size:12px">jours restants sur ${droit}</div><div class="bar" style="margin-top:6px"><i style="width:${Math.min(100, (pris / droit) * 100)}%;--c:var(--info)"></i></div>`;
    } },
    material: { app: 'material', name: 'Matériel disponible', sizes: ['M', 'L'], render(sz) {
      const t = today(), L = D.EQUIPMENT.map((e) => ({ e, used: D.BOOKINGS.filter((b) => b.eq === e.id && b.start <= t && b.end >= t).reduce((s, b) => s + b.qty, 0) })).slice(0, sz === 'L' ? 8 : 4);
      return `${head('material', 'Matériel disponible aujourd’hui')}<div class="wl">${L.map(({ e, used }) => `<div class="wr"><span class="ellipsis grow">${GX.esc(e.name)}</span><b class="num" style="color:${e.qty - used ? 'var(--ok)' : 'var(--danger)'}">${e.qty - used}/${e.qty}</b></div>`).join('')}</div>`;
    } },
    'agenda-week': { app: 'agenda', name: 'Agenda de la semaine', sizes: ['XL', 'L'], render(sz) {
      const t = GX.today(), mon = GX.addDays(t, -((t.getDay() + 6) % 7)), sun = GX.iso(GX.addDays(mon, 6));
      const P = act().filter((p) => p.startDate <= sun && p.endDate >= GX.iso(mon)).slice(0, sz === 'L' ? 8 : 3);
      return `${head('agenda', 'Agenda de la semaine', `<span class="faint">${P.length} projets</span>`)}<div class="wl">${P.map((p) => `<div class="wr" data-proj="${p.id}"><i class="brand-dot" style="--c:${D.SERVICE_COLOR[p.services[0]] || '#888'}"></i><span class="ellipsis grow">${GX.esc(p.name)}</span><span class="faint num">${F.date(p.startDate)} → ${F.date(p.endDate)}</span></div>`).join('')}</div>`;
    } },
    games: { app: 'games', name: 'Défis en attente', sizes: ['S'], render() {
      const n = D.GAMES.challenges.length;
      return `${head('games', 'Jeux')}<div class="wv num">${n}</div><div class="faint" style="font-size:12px">défi${n > 1 ? 's' : ''} en attente</div>`;
    } },
    'expenses-month': { app: 'fixed', name: 'Dépenses du mois', sizes: ['S'], render() {
      const m = today().slice(0, 7), L = D.EXPENSES.filter((e) => e.date.slice(0, 7) === m);
      return `${head('fixed', 'Dépenses du mois')}<div class="wv num" style="font-size:26px">${F.eurK(L.reduce((s, e) => s + e.amount, 0))}</div><div class="faint" style="font-size:12px">${L.length} ligne${L.length > 1 ? 's' : ''}</div>`;
    } },
    clock: { app: null, name: 'Horloge', sizes: ['S'], render() {
      const d = new Date(), h = d.getHours() % 12, mi = d.getMinutes();
      return `<svg viewBox="0 0 100 100" class="wclock"><circle cx="50" cy="50" r="46" />${Array.from({ length: 12 }, (_, i) => `<line x1="50" y1="8" x2="50" y2="${i % 3 ? 13 : 17}" transform="rotate(${i * 30} 50 50)" />`).join('')}
        <line class="hh" x1="50" y1="50" x2="50" y2="28" transform="rotate(${h * 30 + mi / 2} 50 50)" /><line class="mm" x1="50" y1="50" x2="50" y2="16" transform="rotate(${mi * 6} 50 50)" /><circle cx="50" cy="50" r="3.5" class="c" /></svg>`;
    } },
    note: { app: null, name: 'Note rapide', sizes: ['S', 'M', 'L'], render(sz, c = {}, w) {
      return `<div class="wt">${GX.icon('edit', 'sm')}<span class="grow">Note</span></div><textarea class="wnote" data-note placeholder="Écrire une note…">${GX.esc(c.text || '')}</textarea>`;
    } },
    shortcuts: { app: null, name: 'Raccourcis', sizes: ['M', 'S'], cfg: 'apps', render(sz, c = {}) {
      const ids = (c.apps || ['projects', 'digital', 'budget', 'conges']).filter((id) => GX.shell.canOpen(id)).slice(0, sz === 'S' ? 4 : 4);
      return `<div class="wsc ${sz}">${ids.map((id) => `<button data-open="${id}">${GX.appIcon(id, sz === 'S' ? 40 : 46)}<span>${GX.esc(GX.app(id).name)}</span></button>`).join('')}</div>`;
    } },
    news: { app: 'hello', name: 'Actu auto', sizes: ['M', 'L'], render(sz) {
      const L = D.HELLO.rss['Actu Auto'].slice(0, sz === 'L' ? 4 : 2);
      return `${head('hello', 'Actu auto')}<div class="wl">${L.map((t, i) => `<div class="wr" style="align-items:flex-start;gap:10px"><span class="wthumb" style="--a:${['#f75632', '#293f74', '#8f12ab', '#22b573'][i % 4]}">${GX.icon('car', 'sm')}</span><span class="grow" style="font-size:12px;line-height:1.35">${GX.esc(t)}<br><span class="faint">il y a ${i * 3 + 2} h</span></span></div>`).join('')}</div>`;
    } },
  };
  W.catalog = CAT;
  /* Accès pour la coque téléphone : même disposition, rendue en grille 2 colonnes */
  W.items = () => { if (!layout) load(); return layout.filter((w) => allowed(w.type)).sort((a, b) => a.y - b.y || a.x - b.x); };
  W.inner = (w) => { try { return CAT[w.type].render(w.size, w.cfg || {}, w); } catch (e) { return ''; } };
  W.kind = (w) => (CAT[w.type].accent ? 'accent' : CAT[w.type].sky ? 'sky' : 'glass') + (CAT[w.type].live ? ' live' : '');
  W.app = (w) => CAT[w.type].app;

  /* ---------------- Disposition ---------------- */
  const KEY = () => 'widgets.' + (GX.ctx.role === 'Master' ? 'me' : GX.ctx.role);
  const DEFAULT = [
    { type: 'budget-ring', size: 'S', x: 0, y: 0 }, { type: 'late', size: 'S', x: 2, y: 0 }, { type: 'posts', size: 'M', x: 0, y: 2 },
    { type: 'conges-off', size: 'S', x: 0, y: 4 }, { type: 'chat', size: 'S', x: 2, y: 4 }, { type: 'weather', size: 'S', x: 0, y: 6 }, { type: 'clock', size: 'S', x: 2, y: 6 },
    { type: 'chat-live', size: 'L', x: 4, y: 0 },   // n'affecte que les bureaux sans disposition sauvegardée (ou « Disposition par défaut »)
  ];
  let layout = null, box = null, editing = false;
  /* Disposition par défaut : un widget qui dépasserait d'un bureau étroit est replacé dans un emplacement libre */
  const fresh = () => { layout = []; DEFAULT.forEach((d) => { const w = { ...d, id: GX.uid('wg') }; if (w.x + SIZES[w.size][0] > cols() || layout.some((o) => overlap(rectOf(w), rectOf(o)))) Object.assign(w, freeSpot(w.size, w)); layout.push(w); }); return layout; };
  const load = () => { const saved = GX.store.get(KEY()); layout = (saved || fresh()).filter((w) => CAT[w.type]); };
  const save = () => GX.store.set(KEY(), layout);
  const rectOf = (w) => { const [cw, ch] = SIZES[w.size]; return { x: w.x, y: w.y, w: cw, h: ch }; };
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const cols = () => Math.max(4, Math.floor((innerWidth - 44 + GAP) / STEP));
  /* Zone du bureau : entre la barre du haut (0 si escamotable) et le haut du Dock. La grille y est
     CENTRÉE : même marge en haut qu'en bas (au-dessus du Dock), même marge à gauche qu'à droite. */
  const cssPx = (n) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n)) || 0;
  const area = () => { const top = cssPx('--mb-space'), bottom = (cssPx('--dock-icon') || 50) + 26 + 8; return { top, h: innerHeight - top - bottom }; };
  const rows = () => Math.max(4, Math.floor((area().h - 44 + GAP) / STEP));
  function freeSpot(size, ignore, near) {
    const [cw, ch] = SIZES[size], C = cols(), R = rows() + 20, cands = [];
    for (let y = 0; y < R; y++) for (let x = 0; x + cw <= C; x++) { const r = { x, y, w: cw, h: ch }; if (!layout.some((o) => o !== ignore && overlap(r, rectOf(o)))) cands.push(r); }
    if (!cands.length) return { x: 0, y: 0 };
    if (near) cands.sort((a, b) => Math.hypot(a.x - near.x, a.y - near.y) - Math.hypot(b.x - near.x, b.y - near.y));
    return cands[0];
  }
  const allowed = (type) => { const a = CAT[type].app; return !a || GX.shell.canOpen(a); };

  /* ---------------- Rendu ---------------- */
  let rzT; addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { if (box && box.isConnected && !editing) W.render(); }, 200); }); // la grille reste centrée
  W.render = (container) => {
    box = container || box; if (!box) return;
    if (!layout) load();
    if (GX.shell.prefs.widgets === false && !editing) { box.innerHTML = ''; return; }
    box.classList.toggle('editing', editing);
    const vis = layout.filter((w) => allowed(w.type));
    const maxY = Math.max(0, ...vis.map((w) => w.y + SIZES[w.size][1]));
    box.style.width = cols() * STEP - GAP + 'px'; box.style.left = Math.round((innerWidth - (cols() * STEP - GAP)) / 2) + 'px'; { const A = area(); box.style.top = Math.round(A.top + (A.h - (rows() * STEP - GAP)) / 2) + 'px'; } box.style.height = maxY * STEP + 'px';
    /* Le widget Chat se re-rend à chaque message : on garde le champ de saisie actif (focus + curseur) */
    const ae = document.activeElement, keep = ae && box.contains(ae) && ae.matches('[data-wc-in]') ? { id: ae.closest('.wch')?.dataset.wid, pos: ae.selectionStart } : null;
    box.innerHTML = vis.map((w, i) => {
      const c = CAT[w.type], [cw, ch] = SIZES[w.size];
      let inner = ''; try { inner = c.render(w.size, w.cfg || {}, w); } catch (e) { inner = `<div class="faint">${GX.esc(e.message)}</div>`; }
      return `<div class="wdg ${c.accent ? 'accent' : c.sky ? 'sky' : 'glass'}${c.live ? ' live' : ''} sz-${w.size}" data-id="${w.id}" data-app="${c.app || ''}" style="left:${w.x * STEP}px;top:${w.y * STEP}px;width:${cw * STEP - GAP}px;height:${ch * STEP - GAP}px;animation-delay:${i * 30}ms">
        ${inner}${editing ? `<button class="wx" data-rm title="Retirer">${GX.icon('minus', 'sm')}</button><button class="wsz" data-size title="Taille">${w.size}</button>` : ''}</div>`;
    }).join('');
    if (keep) { const i = box.querySelector(`.wch[data-wid="${keep.id}"] [data-wc-in]`); if (i) { i.focus({ preventScroll: true }); if (keep.pos != null) i.setSelectionRange(keep.pos, keep.pos); } }
    /* L'entrée « pop » ne se joue qu'à l'apparition du bureau, pas à chaque re-rendu (pastilles, messages…) */
    if (!box.classList.contains('settled')) { clearTimeout(W._st); W._st = setTimeout(() => box && box.classList.add('settled'), 900); }
    wire();
  };
  function wire() {
    box.onclick = (e) => {
      const el = e.target.closest('.wdg'); if (!el) return; const w = layout.find((x) => x.id === el.dataset.id);
      if (editing) {
        if (e.target.closest('[data-rm]')) { layout = layout.filter((x) => x !== w); save(); return W.render(); }
        if (e.target.closest('[data-size]')) { const s = CAT[w.type].sizes; w.size = s[(s.indexOf(w.size) + 1) % s.length]; if (layout.some((o) => o !== w && overlap(rectOf(w), rectOf(o)))) Object.assign(w, freeSpot(w.size, w, w)); save(); return W.render(); }
        return;
      }
      if (e.target.closest('input,textarea,button[data-play]')) return;
      const pr = e.target.closest('[data-proj]'); if (pr) { const p = D.project(pr.dataset.proj); return GX.wm.open('project', { id: p.id, title: p.name }, { origin: pr }); }
      const cv = e.target.closest('[data-conv]'); if (cv) { const win = GX.wm.open('chat', {}, { origin: cv }); return setTimeout(() => (win || GX.wm.active())?.inst?.command?.('conv:' + cv.dataset.conv), 420); }
      const op = e.target.closest('[data-open]'); if (op) return GX.wm.open(op.dataset.open, {}, { origin: op.querySelector('.app-ico') });
      if (el.dataset.app) { if (GX.wm.desktopShown?.()) GX.wm.showDesktop(false); GX.wm.open(el.dataset.app, {}, { origin: el }); }
    };
    box.onchange = (e) => {
      const cb = e.target.closest('[data-task]'); if (cb) { const t = D.PROJECTS.flatMap((p) => p.tasks).find((x) => x.id === cb.dataset.task); if (t) { t.status = 'Done'; GX.emit('data:projects'); GX.shell.hud('Tâche terminée ✓'); setTimeout(() => W.render(), 500); } }
    };
    box.oninput = (e) => { const n = e.target.closest('[data-note]'); if (n) { const w = layout.find((x) => x.id === n.closest('.wdg').dataset.id); w.cfg = { ...(w.cfg || {}), text: n.value }; save(); } };
    box.querySelectorAll('[data-play]').forEach((b) => (b.onclick = () => { const on = b.classList.toggle('on'); b.innerHTML = GX.icon(on ? 'pause' : 'play'); }));
    box.oncontextmenu = (e) => {
      const el = e.target.closest('.wdg'); if (!el) return; e.preventDefault(); e.stopPropagation(); const w = layout.find((x) => x.id === el.dataset.id), c = CAT[w.type];
      GX.menu.open([
        ...(c.app ? [{ label: 'Ouvrir ' + GX.app(c.app).name, icon: 'arrowr', action: () => GX.wm.open(c.app, {}, { origin: el }) }, '-'] : []),
        { header: 'Taille' }, ...c.sizes.map((s) => ({ label: SIZE_L[s], checked: w.size === s, action: () => { w.size = s; if (layout.some((o) => o !== w && overlap(rectOf(w), rectOf(o)))) Object.assign(w, freeSpot(s, w, w)); save(); W.render(); } })),
        ...(c.cfg ? ['-', { label: 'Configurer…', icon: 'sliders', action: () => configure(w, el) }] : []),
        '-', { label: 'Modifier le bureau…', icon: 'edit', action: () => W.edit(true) }, { label: 'Retirer ce widget', icon: 'trash', action: () => { layout = layout.filter((x) => x !== w); save(); W.render(); } },
      ], { x: e.clientX, y: e.clientY });
    };
    if (editing) box.querySelectorAll('.wdg').forEach((el) => el.addEventListener('pointerdown', dragStart));
  }
  function configure(w, el) {
    const c = CAT[w.type];
    if (c.cfg === 'kpi') GX.ui.pick(el, [{ items: [['actifs', 'Projets actifs'], ['reste', 'Reste à engager'], ['conso', 'Consommation'], ['campagnes', 'Campagnes programmées'], ['retard', 'Projets en retard']].map(([v, l]) => ({ v, l })) }], { multi: false, title: 'Indicateur', selected: [w.cfg?.kpi || 'actifs'], onChange: ([v]) => { w.cfg = { ...(w.cfg || {}), kpi: v }; save(); W.render(); } });
    if (c.cfg === 'project') GX.ui.pick(el, [{ items: act().map((p) => ({ v: p.id, l: p.name, hint: p.sites[0] })) }], { multi: false, title: 'Projet à épingler', selected: [w.cfg?.project], width: 320, onChange: ([v]) => { w.cfg = { ...(w.cfg || {}), project: v }; save(); W.render(); } });
    if (c.cfg === 'apps') GX.ui.pick(el, [{ items: [...GX.apps.values()].filter((a) => !a.hidden && !a.system && GX.shell.canOpen(a.id)).map((a) => ({ v: a.id, l: a.name })) }], { title: 'Raccourcis (4 max)', selected: w.cfg?.apps || ['projects', 'digital', 'budget', 'conges'], onChange: (v) => { w.cfg = { ...(w.cfg || {}), apps: v.slice(0, 4) }; save(); W.render(); } });
  }
  /* Glisser en mode édition : transform pendant le geste, grille aimantée au lâcher */
  function dragStart(e) {
    if (e.target.closest('button,textarea,input')) return;
    const el = e.currentTarget, w = layout.find((x) => x.id === el.dataset.id), sx = e.clientX, sy = e.clientY;
    el.setPointerCapture(e.pointerId); el.classList.add('drag'); let dx = 0, dy = 0;
    const ghost = document.createElement('div'); ghost.className = 'wghost'; Object.assign(ghost.style, { width: el.style.width, height: el.style.height, left: el.style.left, top: el.style.top }); box.append(ghost);
    const mv = (ev) => {
      dx = ev.clientX - sx; dy = ev.clientY - sy; el.style.transform = `translate(${dx}px,${dy}px) scale(1.03)`;
      const nx = Math.max(0, Math.min(cols() - SIZES[w.size][0], Math.round((w.x * STEP + dx) / STEP))), ny = Math.max(0, Math.round((w.y * STEP + dy) / STEP));
      const spot = layout.some((o) => o !== w && overlap({ x: nx, y: ny, w: SIZES[w.size][0], h: SIZES[w.size][1] }, rectOf(o))) ? freeSpot(w.size, w, { x: nx, y: ny }) : { x: nx, y: ny };
      Object.assign(ghost.style, { left: spot.x * STEP + 'px', top: spot.y * STEP + 'px' }); ghost.dataset.x = spot.x; ghost.dataset.y = spot.y;
    };
    const up = () => {
      el.removeEventListener('pointermove', mv); el.classList.remove('drag');
      if (ghost.dataset.x != null) { const first = el.getBoundingClientRect(); w.x = +ghost.dataset.x; w.y = +ghost.dataset.y; save(); el.style.transform = ''; el.style.left = w.x * STEP + 'px'; el.style.top = w.y * STEP + 'px'; GX.flip(el, first, { spring: 'bouncy' }); }
      else el.style.transform = '';
      ghost.remove(); setTimeout(() => W.render(), 450);
    };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up, { once: true });
  }

  /* ---------------- Mode édition + galerie ---------------- */
  let gal = null;
  W.edit = (on = !editing) => {
    editing = on; GX.menu.close();
    if (on) { if (!GX.wm.desktopShown?.()) GX.wm.showDesktop(true); openGallery(); }
    else { gal?.remove(); gal = null; if (GX.wm.desktopShown?.()) GX.wm.showDesktop(false); }
    document.body.classList.toggle('desk-editing', on);
    W.render();
  };
  function openGallery() {
    gal?.remove();
    gal = document.createElement('div'); gal.className = 'wgal glass glass-strong';
    const cats = [['all', 'Tous'], ...[...new Set(Object.values(CAT).map((c) => c.app).filter(Boolean))].filter((a) => GX.shell.canOpen(a)).map((a) => [a, GX.app(a).name]), ['misc', 'Divers']];
    gal.innerHTML = `<div class="row" style="padding:4px 4px 10px"><b style="font-size:16px">Widgets</b><span class="faint" style="font-size:12px">Cliquez pour ajouter · glissez sur le bureau pour ranger · clic droit pour configurer</span><span class="grow"></span><button class="btn sm ghost" data-reset>Disposition par défaut</button><button class="btn sm primary" data-done>Terminé</button></div>
      <div class="tabs" data-gtabs>${cats.map(([v, l], i) => `<button data-v="${v}" aria-selected="${i === 0}">${GX.esc(l)}</button>`).join('')}</div><div class="wgal-list scroll"></div>`;
    document.body.append(gal);
    const list = gal.querySelector('.wgal-list');
    const show = (cat) => {
      list.innerHTML = Object.entries(CAT).filter(([t, c]) => allowed(t) && (cat === 'all' || (cat === 'misc' ? !c.app : c.app === cat))).map(([t, c]) => `
        <button class="wgal-it" data-add="${t}"><div class="wgal-prev"><div class="wdg ${c.accent ? 'accent' : c.sky ? 'sky' : 'glass'} sz-${c.sizes[0]}" style="position:relative;width:${SIZES[c.sizes[0]][0] * STEP - GAP}px;height:${SIZES[c.sizes[0]][1] * STEP - GAP}px;animation:none">${(() => { try { return c.render(c.sizes[0], {}); } catch (e) { return ''; } })()}</div></div>
        <b>${GX.esc(c.name)}</b><span class="faint">${c.app ? GX.esc(GX.app(c.app).name) + ' · ' : ''}${c.sizes.map((s) => SIZE_L[s]).join(', ')}</span></button>`).join('');
      list.querySelectorAll('.wgal-prev .wdg').forEach((w) => { const s = Math.min(1, 150 / w.offsetWidth, 110 / w.offsetHeight); w.style.transform = `scale(${s})`; w.parentElement.style.height = w.offsetHeight * s + 'px'; w.parentElement.style.width = w.offsetWidth * s + 'px'; });
    };
    show('all');
    gal.querySelector('[data-gtabs]').addEventListener('change', (e) => show(e.detail));
    list.addEventListener('click', (e) => { const b = e.target.closest('[data-add]'); if (!b) return; const t = b.dataset.add, size = CAT[t].sizes[0]; const w = { id: GX.uid('wg'), type: t, size, ...freeSpot(size) }; layout.push(w); save(); W.render(); const el = box.querySelector(`[data-id="${w.id}"]`); el && GX.animate(el, [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'bouncy' }); });
    gal.querySelector('[data-done]').onclick = () => W.edit(false);
    gal.querySelector('[data-reset]').onclick = () => { fresh(); save(); W.render(); };
    GX.animate(gal, [{ transform: 'translate(-50%, 110%)' }, { transform: 'translate(-50%, 0)' }], { spring: 'snappy' });
  }
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && editing) W.edit(false); });
  GX.on('ctx', () => { layout = null; box?.classList.remove('settled'); W.render(); });
  GX.on('badges', () => W.render());
  GX.on('data:projects', () => !editing && W.render());
  setInterval(() => { if (box && !editing && box.querySelector('.wclock')) W.render(); }, 60000);

  /* ---------------- Widget Chat : interactions (bureau ET coque téléphone) ---------------- */
  const chItem = (el) => { const id = el?.closest('.wch')?.dataset.wid; if (!id) return null; if (!layout) load(); return layout.find((x) => x.id === id) || null; };
  /* Re-rend en place chaque widget Chat présent (bureau ou accueil mobile), sans toucher aux autres widgets */
  function chRefresh(focusId) {
    if (!layout) return;
    document.querySelectorAll('.wch[data-wid]').forEach((el) => {
      const w = layout.find((x) => x.id === el.dataset.wid); if (!w || !CAT[w.type]?.live) return;
      const ae = document.activeElement, had = ae && el.contains(ae) && ae.matches('[data-wc-in]'), pos = had ? ae.selectionStart : null;
      const sc = el.querySelector('.wch-list')?.scrollTop || 0;
      const tmp = document.createElement('div'); try { tmp.innerHTML = CAT[w.type].render(w.size, w.cfg || {}, w); } catch (e) { return; }
      const nu = tmp.firstElementChild; if (!nu) return; el.replaceWith(nu);
      const l = nu.querySelector('.wch-list'); if (l) l.scrollTop = sc;
      if (had || focusId === w.id) { const i = nu.querySelector('[data-wc-in]'); if (i) { i.focus({ preventScroll: true }); const p = pos ?? i.value.length; i.setSelectionRange(p, p); } }
    });
  }
  /* Un widget affiche-t-il cette conversation, visible (bureau non estompé par une fenêtre) ? */
  const chShown = (convId) => [...document.querySelectorAll('.wch[data-wid]')].some((el) => { const w = layout?.find((x) => x.id === el.dataset.wid); return w && chConv(w.cfg)?.id === convId && el.offsetParent && !el.closest('.dim'); });
  const chChatOpen = () => (GX.wm?.list?.() || []).some((x) => x.appId === 'chat' || x.app?.id === 'chat');
  function chOpen(c, origin) {
    if (!c) return;
    if (origin?.closest('#widgets') && GX.wm.desktopShown?.()) GX.wm.showDesktop(false);
    const win = GX.wm.open('chat', {}, { origin: origin?.closest('.wdg') || origin });
    const go = () => (win || GX.wm.active?.())?.inst?.command?.('conv:' + c.id);
    if (win?.inst?.command) go(); else setTimeout(go, 420);
  }
  function chSend(w, input) {
    const c = chConv(w.cfg), t = input?.value.trim(); if (!c || !t) return;
    const m = { id: GX.uid('m'), u: CH_ME, t, at: Date.now(), type: 'text', r: {}, seen: [] };
    chMsgs(c).push(m); delete chDraft[w.id + c.id]; input.value = '';
    w.cfg = { ...(w.cfg || {}), conv: c.id }; save();
    const hadUnread = !!c.unread; c.unread = 0;
    const det = { conv: c.id, msg: m, from: 'widget' };
    GX.emit('chat:message', det);                 // l'app Chat, si ouverte, pose det.handled et simule la suite
    if (!det.handled) chSimReply(c, m);
    if (hadUnread) { GX.emit('chat:read'); GX.emit('badges'); }
    chRefresh(w.id);
  }
  /* Réponse fictive quand l'app Chat est fermée (même logique que chat.js, en plus court) */
  function chSimReply(c, m) {
    if (c.kind === 'general' || chPending[c.id]) return;
    const pool = c.members.filter((u) => u !== CH_ME && D.user(u).role !== 'Site Manager'); if (!pool.length) return;
    const on = pool.filter((u) => D.user(u).online), src = on.length ? on : pool, who = c.kind === 'dm' ? pool[0] : src[Math.floor(Math.random() * src.length)];
    const t = (m.t || '').toLowerCase(), pick = (a) => a[Math.floor(Math.random() * a.length)];
    chPending[c.id] = true;
    setTimeout(() => { m.seen = c.members.filter((u) => u !== CH_ME); }, 1400);
    setTimeout(() => {
      delete chPending[c.id];
      const r = { id: GX.uid('m'), u: who, at: Date.now(), type: 'text', r: {}, t: t.includes('merci') ? pick(['Avec plaisir !', 'De rien 😊', 'Quand tu veux']) : t.includes('?') ? pick(['Oui, je regarde ça 👍', 'Je te dis ça dans l’heure', 'Bonne question, je vérifie avec la concession']) : pick(['Parfait, merci !', 'Ça marche 👌', 'Je m’en occupe', 'Noté ✅', 'Super, on en parle au point de jeudi']) };
      chMsgs(c).push(r);
      if (!chShown(c.id) && !chChatOpen()) c.unread = (c.unread || 0) + 1;
      GX.emit('chat:message', { conv: c.id, msg: r, from: 'widget-sim' }); GX.emit('badges');
    }, 2600 + Math.min(1800, t.length * 30));
  }
  /* Nouveau message (app, réponse simulée, autre widget) : le widget suit ; lu s'il est affiché */
  GX.on('chat:message', ({ conv, msg } = {}) => {
    if (!layout || !document.querySelector('.wch[data-wid]')) return;
    const c = D.CONVS.find((x) => x.id === conv);
    if (c && msg && msg.u !== CH_ME && c.unread && chShown(conv)) { c.unread = 0; setTimeout(() => GX.emit('chat:read')); }
    chRefresh();
  });
  /* Capture : les clics dans le widget ne remontent pas jusqu'à l'ouverture de l'app */
  document.addEventListener('click', (e) => {
    const root = e.target.closest?.('.wch'); if (!root || document.body.classList.contains('desk-editing')) return;
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
      if (x.unread) { x.unread = 0; GX.emit('chat:read'); GX.emit('badges'); }
      return chRefresh(w.id);
    }
    if (a === 'react') {
      const m = chMsgs(c).find((x) => x.id === b.closest('[data-wmsg]')?.dataset.wmsg); if (!m) return;
      const us = ((m.r ||= {})[b.dataset.e] ||= []), i = us.indexOf(CH_ME); i < 0 ? us.push(CH_ME) : us.splice(i, 1);
      GX.emit('chat:message', { conv: c.id, msg: m, from: 'widget-react' });
      chRefresh();
    }
  }, true);
  document.addEventListener('keydown', (e) => {
    const i = e.target.closest?.('.wch [data-wc-in]'); if (!i) return;
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); e.stopPropagation(); const w = chItem(i); if (w) chSend(w, i); }
    else if (e.key === 'Escape') { e.stopPropagation(); i.blur(); }
  });
  document.addEventListener('input', (e) => {
    const i = e.target.closest?.('.wch [data-wc-in]'); if (!i) return;
    const w = chItem(i), c = w && chConv(w.cfg); if (c) chDraft[w.id + c.id] = i.value;
  });

  GX.css(`
  #widgets{position:absolute;left:22px;top:calc(var(--menubar-h) + 22px);z-index:1;display:block;grid-template-columns:none;transition:filter var(--t-slow),opacity var(--t-slow)}
  #widgets .wdg{position:absolute;border-radius:24px;padding:14px 16px;display:flex;flex-direction:column;overflow:hidden;cursor:pointer;animation:ui-pop var(--t-slow) var(--spring-bouncy) both;transition:transform var(--t-med) var(--spring-bouncy),box-shadow var(--t-fast)}
  #widgets .wdg:not(.drag):hover{transform:scale(1.015)}
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
  .wfc{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-top:8px;font-size:11px;text-align:center}.wfc>div{display:grid;justify-items:center;gap:2px;opacity:.9}
  .wclock{width:100%;height:100%}.wclock circle{fill:none;stroke:var(--line-2);stroke-width:2}.wclock line{stroke:var(--text-3);stroke-width:2;stroke-linecap:round}
  .wclock .hh{stroke:var(--text);stroke-width:4}.wclock .mm{stroke:var(--text);stroke-width:3}.wclock .c{fill:var(--bony-orange);stroke:none}
  .wnote{flex:1;margin-top:8px;border:0;outline:0;resize:none;background:transparent;font:inherit;font-size:13px;line-height:1.5;color:var(--text)}
  .wsc{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;height:100%;align-items:center}.wsc.S{grid-template-columns:1fr 1fr}
  .wsc button{display:grid;justify-items:center;gap:5px;font-size:11px;font-weight:600}.wsc button span{max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .wthumb{width:40px;height:40px;border-radius:10px;flex:none;display:grid;place-items:center;color:#fff;background:linear-gradient(140deg,var(--a),#1b1822)}
  #widgets.settled:not(.editing) .wdg{animation:none}
  /* Chat interactif */
  .wdg.live{cursor:default}
  #widgets .wdg.live:not(.drag):hover{transform:none}
  .wch{flex:1;min-height:0;min-width:0;display:flex;flex-direction:column;gap:8px}
  .wch-t{cursor:pointer;min-width:0}
  .wch-t .wch-ct{color:var(--text)}
  .wch-t .count{flex:none}
  .wch-t .icon-btn{margin:-4px -6px -4px 0;color:var(--text-2)}
  .wch-body{flex:1;min-height:0;display:flex;gap:8px}
  .wch-list{flex:none;display:flex;flex-direction:column;gap:2px;padding:4px 3px;margin:-4px -3px;overflow-x:hidden}
  .wch.sz-L .wch-list{width:50px}.wch.sz-XL .wch-list{width:170px}.wch.sz-XXL .wch-list{width:200px}
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
  .wch.sz-XL{gap:6px}.wch.sz-XL .wch-conv{padding:4px 6px;gap:4px}.wch.sz-XL .wch-inner{padding-top:8px}
  .wch.sz-XL .wch-in{height:28px}.wch.sz-XL .wch-send{width:28px;height:28px}
  .m-wdg.live{aspect-ratio:auto;min-height:340px}
  .m-wdg.live.msz-XL{min-height:220px}
  .m-wdg.msz-XXL{grid-column:span 2}
  .m-wdg.live .wch-rx{display:none}
  /* édition */
  #widgets.editing .wdg{cursor:grab;animation:w-jiggle .32s ease-in-out infinite alternate}
  #widgets.editing .wdg:nth-child(2n){animation-delay:-.16s}
  #widgets.editing .wdg.drag{cursor:grabbing;animation:none;z-index:5;box-shadow:var(--shadow-3);transition:none}
  @keyframes w-jiggle{from{rotate:-.6deg}to{rotate:.6deg}}
  :root[data-effects="eco"] #widgets.editing .wdg{animation:none}
  .wx,.wsz{position:absolute;top:8px;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:10px;font-weight:800;z-index:3;box-shadow:0 2px 6px rgba(0,0,0,.4)}
  .wx{left:8px;background:#ff5f57;color:#fff}.wsz{right:8px;background:var(--surface-1);color:var(--text)}
  .wghost{position:absolute;border-radius:24px;border:2px dashed color-mix(in srgb,var(--bony-orange) 70%,transparent);background:color-mix(in srgb,var(--bony-orange) 10%,transparent);transition:left var(--t-fast) var(--ease-out),top var(--t-fast) var(--ease-out);pointer-events:none}
  .wgal{position:fixed;left:50%;bottom:14px;z-index:8500;width:min(1100px,calc(100vw - 28px));height:330px;border-radius:26px;padding:14px 16px;display:flex;flex-direction:column;transform:translateX(-50%)}
  .wgal-list{flex:1;min-height:0;display:flex;flex-wrap:wrap;gap:12px;padding:12px 2px;align-content:flex-start}
  .wgal-it{display:grid;justify-items:center;gap:3px;width:172px;padding:10px;border-radius:16px;text-align:center;transition:background var(--t-fast),transform var(--t-med) var(--spring-bouncy)}
  .wgal-it:hover{background:var(--line);transform:translateY(-2px)}.wgal-it:active{transform:scale(.96)}
  .wgal-it b{font-size:12.5px}.wgal-it .faint{font-size:11px}
  .wgal-prev{display:grid;place-items:start;margin-bottom:6px;pointer-events:none}.wgal-prev .wdg{transform-origin:0 0;border-radius:22px;padding:14px 16px;display:flex;flex-direction:column;overflow:hidden}
  body.desk-editing .dock-wrap{transform:translateY(calc(100% + 14px))}
  `);
})();
