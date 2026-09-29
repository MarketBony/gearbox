// @ts-nocheck — moteur de la maquette CONVERTI (maquettes/v2/js/pickers.js), comportement identique.
// Typage fin : second temps, fichier par fichier, une fois le rendu validé identique à la maquette.
// Substitutions mécaniques : scripts/ui2-convert-engine.mjs. Retouches manuelles : balises [GEARBOX].
export function install(): void {
const GX = (window as any).GX; // lu au démarrage (le noyau l'a créé), pas à l'import
/* =====================================================================
   v2.1 — SÉLECTEURS PARTAGÉS (multi-sélection fidèle à Gearbox)
   Une rubrique n'écrit jamais son propre menu de filtre : elle appelle
   GX.ui.pick / GX.ui.sitePicker / GX.ui.dateRange / GX.ui.chips.
   ===================================================================== */
(() => {
  let openPick = null;
  GX.ui.closePick = () => {
    if (!openPick) return; const p = openPick; openPick = null; p.cleanup();
    p.el.style.pointerEvents = 'none';
    if (document.hidden) return p.el.remove();
    p.el.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.97)' }], { duration: 110 }).onfinish = () => p.el.remove();
    setTimeout(() => p.el.remove(), 250); // filet : onfinish ne vient pas toujours
  };
  const place = (el, anchor) => {
    const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;
    const x = Math.max(6, Math.min(r.left, innerWidth - el.offsetWidth - 6));
    let y = r.bottom + 6; if (y + el.offsetHeight > innerHeight - 6) y = Math.max(6, r.top - el.offsetHeight - 6);
    Object.assign(el.style, { left: x + 'px', top: y + 'px' });
  };

  /* groups : [{ label?, toggleAll?, items: [{ v, l, color?, hint? }] }]
     opts : { multi=true, search=auto, selected=[], allLabel, title, onChange(values), width, noneLabel } */
  GX.ui.pick = (anchor, groups, opts = {}) => {
    GX.ui.closePick(); GX.menu.close();
    const multi = opts.multi !== false;
    let sel = new Set(opts.selected || []);
    const all = groups.flatMap((g) => g.items);
    // Groupes repliables (plaques) : repliés par défaut, sauf s'ils contiennent déjà une sélection partielle
    const open = new Set(groups.map((g, i) => (g.collapsible && g.items.some((it) => sel.has(it.v)) && !g.items.every((it) => sel.has(it.v)) ? i : -1)).filter((i) => i >= 0));
    const useSearch = opts.search ?? all.length > 8;
    const el = document.createElement('div'); el.className = 'pick glass glass-strong';
    if (opts.width) el.style.width = opts.width + 'px';
    el.innerHTML = `${opts.title ? `<div class="pick-t">${GX.esc(opts.title)}</div>` : ''}${useSearch ? `<label class="search pick-s">${GX.icon('search', 'sm')}<input placeholder="Rechercher…" /></label>` : ''}
      ${multi ? `<div class="pick-top"><button data-all>${GX.esc(opts.allLabel || 'Tout')}</button><button data-every>Tout sélectionner</button></div><div class="faint pick-n"></div>` : ''}
      <div class="pick-list scroll"></div>`;
    GX.body.append(el);
    const list = el.querySelector('.pick-list'), q = el.querySelector('.pick-s input');
    const render = () => {
      const t = (q?.value || '').trim().toLowerCase();
      list.innerHTML = groups.map((g, gi) => {
        const items = g.items.filter((it) => !t || (it.l + ' ' + (g.label || '')).toLowerCase().includes(t));
        if (!items.length) return '';
        const allIn = items.every((it) => sel.has(it.v)), someIn = items.some((it) => sel.has(it.v));
        if (g.collapsible) {
          const isOpen = t || open.has(gi);
          return `<div class="pick-g coll ${isOpen ? 'open' : ''}" data-x="${gi}"><span class="pick-chev">${GX.icon('chevron', 'sm')}</span><span class="grow">${GX.esc(g.label)}</span>${someIn ? `<span class="pick-gn">${items.filter((it) => sel.has(it.v)).length}/${items.length}</span>` : ''}${multi ? `<span class="pick-ck ${allIn ? 'on' : someIn ? 'part' : ''}" data-g="${gi}" role="checkbox" aria-label="Toute la plaque"></span>` : ''}</div>` +
            (isOpen ? `<div class="pick-sub">${items.map((it) => `<div class="pick-it ${sel.has(it.v) ? 'on' : ''}" data-v="${GX.esc(it.v)}"><span class="ellipsis grow">${GX.esc(it.l)}</span>${it.hint ? `<span class="faint" style="font-size:11px">${GX.esc(it.hint)}</span>` : ''}${multi ? `<span class="pick-ck ${sel.has(it.v) ? 'on' : ''}"></span>` : `<span class="pick-rd">${sel.has(it.v) ? GX.icon('check', 'sm') : ''}</span>`}</div>`).join('')}</div>` : '');
        }
        return `${g.label ? `<div class="pick-g ${g.toggleAll && multi ? 'tog' : ''}" data-g="${gi}">${g.toggleAll && multi ? `<span class="pick-ck ${allIn ? 'on' : someIn ? 'part' : ''}"></span>` : ''}${GX.esc(g.label)}</div>` : ''}` +
          items.map((it) => `<div class="pick-it ${sel.has(it.v) ? 'on' : ''}" data-v="${GX.esc(it.v)}">${multi ? `<span class="pick-ck ${sel.has(it.v) ? 'on' : ''}"></span>` : `<span class="pick-rd">${sel.has(it.v) ? GX.icon('check', 'sm') : ''}</span>`}${it.color ? `<i class="brand-dot" style="--c:${it.color}"></i>` : ''}<span class="ellipsis grow">${GX.esc(it.l)}</span>${it.hint ? `<span class="faint" style="font-size:11px">${GX.esc(it.hint)}</span>` : ''}</div>`).join('');
      }).join('') || `<div class="empty" style="padding:16px">Aucun résultat</div>`;
      const n = el.querySelector('.pick-n'); if (n) n.textContent = sel.size ? `${sel.size} sélectionné${sel.size > 1 ? 's' : ''}` : '';
      el.querySelector('[data-all]')?.classList.toggle('on', !sel.size);
    };
    const emit = () => opts.onChange && opts.onChange([...sel]);
    list.addEventListener('click', (e) => {
      const x = e.target.closest('.pick-g.coll'), ck = e.target.closest('.pick-g.coll [data-g]');
      if (x && !ck) { const i = +x.dataset.x; open.has(i) ? open.delete(i) : open.add(i); return render(); }
      const it = e.target.closest('.pick-it'), g = ck || e.target.closest('.pick-g.tog');
      if (it) {
        const v = all.find((x) => String(x.v) === it.dataset.v)?.v;
        if (!multi) { sel = new Set([v]); render(); emit(); return GX.ui.closePick(); }
        sel.has(v) ? sel.delete(v) : sel.add(v);
      }
      if (g) { const items = groups[+g.dataset.g].items; const allIn = items.every((x) => sel.has(x.v)); items.forEach((x) => (allIn ? sel.delete(x.v) : sel.add(x.v))); }
      if (it || g) { render(); emit(); }
    });
    el.querySelector('[data-all]')?.addEventListener('click', () => { sel = new Set(); render(); emit(); });
    el.querySelector('[data-every]')?.addEventListener('click', () => { sel = new Set(all.map((x) => x.v)); render(); emit(); });
    q?.addEventListener('input', render);
    render(); place(el, anchor);
    setTimeout(() => q?.focus(), 30);
    const away = (e) => { if (e.target.closest?.('.gx-datecal')) return; if (!el.contains(e.target) && !(anchor.contains && anchor.contains(e.target))) GX.ui.closePick(); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); GX.ui.closePick(); } };
    setTimeout(() => { GX.win(window, 'pointerdown', away, true); GX.win(window, 'keydown', key, true); });
    openPick = { el, cleanup: () => { GX.unwin(window, 'pointerdown', away, true); GX.unwin(window, 'keydown', key, true); opts.onClose && opts.onClose([...sel]); } };
    return el;
  };

  /* Résumé d'une sélection pour le bouton déclencheur */
  GX.ui.summary = (values, { all = 'Tout', max = 2 } = {}) => !values?.length ? all : values.length <= max ? values.join(', ') : `${values.slice(0, max - 1).join(', ')} +${values.length - max + 1}`;
  /* Bouton déclencheur standard (.picker-btn) */
  GX.ui.pickerBtn = (attr, icon, label, active) => `<button class="picker-btn ${active ? 'active' : ''}" ${attr}>${icon ? GX.icon(icon, 'sm') : ''}<span class="v">${GX.esc(label)}</span>${GX.icon('chevdown', 'sm')}</button>`;

  /* Sélecteur de sites de Gearbox : plaques (★ = tout cocher), sites, entités.
     variant : 'filter' (Dashboard, Budget, To-do…) | 'project' (GROUPE BONY GLOBAL / R/N + sites Nissan) | 'digital' (concessions du Digital) */
  /* opts.entities (défaut true en 'filter') : ajoute « Hors plaque » + l'entité Nissan ; à couper quand le vrai filtre ne les propose pas (To-do). */
  GX.ui.sitePicker = (anchor, selected, onChange, { variant = 'filter', multi = true, title, entities = true } = {}) => {
    const D = GX.data, groups = [];
    if (variant === 'digital') {
      // Concessions du Digital (DIGITAL_CONCESSIONS) : global, sites des plaques sauf Ricoux, sites Nissan, Yssingeaux
      groups.push({ label: 'Global', items: ['GROUPE BONY', 'FULL RENAULT', 'FULL DACIA', 'FULL NISSAN', 'FULL ALPINE'].map((v) => ({ v, l: v })) });
      Object.entries(D.PLAQUES).forEach(([pl, sites]) => groups.push({ label: pl, collapsible: true, toggleAll: true, items: sites.filter((x) => x !== 'Ricoux').map((x) => ({ v: x, l: x })) }));
      groups.push({ label: 'Autres', items: [...D.NISSAN_ONLY, 'Yssingeaux'].map((x) => ({ v: x, l: x })) });
      const known = new Set(groups.flatMap((g) => g.items.map((i) => i.v)));
      const legacy = (selected || []).filter((v) => !known.has(v));
      if (legacy.length) groups.push({ label: 'Anciennes valeurs', items: legacy.map((v) => ({ v, l: v, hint: 'hors liste' })) });
      return GX.ui.pick(anchor, groups, { multi, selected, onChange, allLabel: 'Aucun', title: title || 'Sites', width: 310 });
    }
    if (variant === 'project') groups.push({ label: 'Périmètres groupés', items: [{ v: 'GROUPE BONY (GLOBAL)', l: 'GROUPE BONY (GLOBAL)', hint: 'répartition verrouillée' }, { v: 'GROUPE BONY (R/N)', l: 'GROUPE BONY (R/N)', hint: '16 sites' }] });
    Object.entries(D.PLAQUES).forEach(([pl, sites]) => groups.push({ label: pl, collapsible: true, toggleAll: true, items: sites.map((s) => ({ v: s, l: s, hint: [D.ALPINE_SITES.includes(s) && 'Alpine', D.NISSAN_SITES.includes(s) && 'Nissan'].filter(Boolean).join(' · ') })) }));
    if (variant !== 'filter' || entities) groups.push({ label: variant === 'filter' ? 'Hors plaque' : 'Sites Nissan', items: D.NISSAN_ONLY.map((s) => ({ v: s, l: s, hint: 'Nissan' })) });
    if (variant === 'filter' && entities) groups.push({ label: 'Entités spécifiques', items: [{ v: 'Nissan', l: 'Nissan', hint: 'enveloppe globale' }] });
    return GX.ui.pick(anchor, groups, { multi, selected, onChange, allLabel: variant === 'filter' ? 'Tout le réseau' : 'Aucun', title: title || 'Périmètre', width: 310 });
  };

  /* Période : raccourcis + du / au */
  GX.ui.dateRange = (anchor, { from, to }, onChange) => {
    GX.ui.closePick(); GX.menu.close();
    const T = GX.today(), y = T.getFullYear(), m = T.getMonth(), iso = GX.iso;
    const q0 = Math.floor(m / 3) * 3, s0 = m < 6 ? 0 : 6, dow = (T.getDay() + 6) % 7;
    const P = [['Cette semaine', GX.addDays(T, -dow), GX.addDays(T, 6 - dow)], ['Ce mois', new Date(y, m, 1), new Date(y, m + 1, 0)], ['Ce trimestre', new Date(y, q0, 1), new Date(y, q0 + 3, 0)],
      ['Ce semestre', new Date(y, s0, 1), new Date(y, s0 + 6, 0)], ['Cette année', new Date(y, 0, 1), new Date(y, 11, 31)], ['Année dernière', new Date(y - 1, 0, 1), new Date(y - 1, 11, 31)], ['12 derniers mois', GX.addDays(T, -365), T]];
    const el = document.createElement('div'); el.className = 'pick glass glass-strong'; el.style.width = '330px';
    el.innerHTML = `<div class="pick-t">Période</div><div class="dr-pre">${P.map((p, i) => `<button data-p="${i}" class="${iso(p[1]) === from && iso(p[2]) === to ? 'on' : ''}">${p[0]}</button>`).join('')}</div>
      <div class="row" style="padding:10px 6px 4px;gap:6px"><label class="field grow"><span class="label">Du</span><input type="date" class="input" data-f value="${from || ''}" /></label><label class="field grow"><span class="label">Au</span><input type="date" class="input" data-t value="${to || ''}" /></label></div>`;
    GX.body.append(el);
    const done = (f, t) => onChange && onChange({ from: f, to: t });
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) { const p = P[+b.dataset.p]; done(iso(p[1]), iso(p[2])); GX.ui.closePick(); } });
    el.addEventListener('change', () => done(el.querySelector('[data-f]').value, el.querySelector('[data-t]').value));
    place(el, anchor);
    const away = (e) => { if (e.target.closest?.('.gx-datecal')) return; if (!el.contains(e.target) && !(anchor.contains && anchor.contains(e.target))) GX.ui.closePick(); };
    setTimeout(() => GX.win(window, 'pointerdown', away, true));
    openPick = { el, cleanup: () => GX.unwin(window, 'pointerdown', away, true) };
    return el;
  };
  GX.ui.periodLabel = (from, to) => { const f = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }); return from && to ? `${f(from)} → ${f(to)}` : 'Toute la période'; };

  /* Groupe de puces MULTI : <div class="chips" data-multi> ; le bouton data-v="" (« Toutes ») est exclusif.
     Émet 'change' avec detail = tableau des valeurs cochées (vide = toutes). */
  GX.win(document, 'click', (e) => {
    const b = e.target.closest('.chips[data-multi] > button'); if (!b) return;
    const g = b.parentElement, btns = [...g.querySelectorAll(':scope > button')];
    if (b.dataset.v === '') btns.forEach((x) => x.setAttribute('aria-pressed', x === b));
    else {
      b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true');
      const any = btns.some((x) => x.dataset.v !== '' && x.getAttribute('aria-pressed') === 'true');
      btns.filter((x) => x.dataset.v === '').forEach((x) => x.setAttribute('aria-pressed', !any));
    }
    g.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: btns.filter((x) => x.dataset.v !== '' && x.getAttribute('aria-pressed') === 'true').map((x) => x.dataset.v) }));
  });
  GX.ui.chips = (values, selected = [], { all = 'Toutes', colors = {}, attr = '' } = {}) =>
    `<div class="chips" data-multi ${attr}><button class="chip" data-v="" aria-pressed="${!selected.length}">${GX.esc(all)}</button>${values.map((v) => `<button class="chip" data-v="${GX.esc(v)}" aria-pressed="${selected.includes(v)}">${colors[v] ? `<i class="brand-dot" style="--c:${colors[v]}"></i>` : ''}${GX.esc(v)}</button>`).join('')}</div>`;

  GX.css(`
  .pick{position:fixed;z-index:20500;width:260px;max-height:min(70vh,520px);display:flex;flex-direction:column;padding:8px;border-radius:16px;animation:ui-menu var(--t-med) var(--spring-snappy) both}
  .pick-t{font-weight:700;padding:4px 6px 8px}
  .pick-s{margin:0 2px 6px}
  .pick-top{display:flex;gap:6px;align-items:center;padding:0 2px 6px}
  .pick-top button{flex:1;height:32px;padding:0 10px;border-radius:9px;font-size:12.5px;font-weight:700;color:var(--text-2);background:transparent;box-shadow:inset 0 0 0 1px var(--line-2);transition:background var(--t-fast),color var(--t-fast)}
  .pick-top button:hover{background:var(--surface-3);color:var(--text)}
  .pick-top button.on{background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 55%,transparent)}
  .pick-n{font-size:11.5px;padding:0 6px 6px;min-height:0}.pick-n:empty{display:none}
  .pick-top + .pick-n + .pick-list, .pick-top + .pick-n:empty + .pick-list{border-top:1px solid var(--line);padding-top:4px}
  .pick-g.coll{cursor:pointer;border-radius:9px;padding:9px 8px;margin-top:1px;font-size:11.5px;letter-spacing:.08em;color:var(--text-2)}
  .pick-g.coll:hover{background:var(--surface-3);color:var(--text)}
  .pick-chev{display:grid;place-items:center;transition:transform var(--t-med) var(--spring-snappy)}
  .pick-g.coll.open .pick-chev{transform:rotate(90deg)}
  .pick-g.coll.open{color:var(--text)}
  .pick-gn{font-size:11px;font-weight:700;letter-spacing:0;color:var(--accent);text-transform:none}
  .pick-sub{padding:0 0 4px 20px;animation:ui-fade-up var(--t-med) var(--ease-out) both}
  .pick-sub .pick-it{min-height:32px}
  .pick-list{flex:1;min-height:0}
  .pick-g{display:flex;align-items:center;gap:8px;padding:8px 8px 4px;font-size:11px;font-weight:700;letter-spacing:.04em;color:var(--text-3);text-transform:uppercase}
  .pick-g.tog{cursor:pointer;border-radius:8px}.pick-g.tog:hover{color:var(--text);background:var(--surface-3)}
  .pick-it{display:flex;align-items:center;gap:9px;min-height:30px;padding:0 8px;border-radius:9px;cursor:default}
  .pick-it:hover{background:var(--surface-3)}
  .pick-it.on{font-weight:600}
  .pick-ck{width:16px;height:16px;border-radius:5px;flex:none;box-shadow:inset 0 0 0 1.5px var(--line-3);display:grid;place-items:center;transition:background var(--t-fast)}
  .pick-ck.on{background:var(--bony-grad);box-shadow:none}.pick-ck.on::after{content:"";width:8px;height:4px;border:solid #fff;border-width:0 0 2px 2px;transform:translateY(-1px) rotate(-45deg)}
  .pick-ck.part{background:var(--surface-4)}.pick-ck.part::after{content:"";width:8px;height:2px;background:var(--text)}
  .pick-rd{width:16px;display:grid;place-items:center;color:var(--accent)}
  .dr-pre{display:flex;flex-wrap:wrap;gap:5px;padding:0 4px}
  .dr-pre button{height:26px;padding:0 10px;border-radius:99px;font-size:12px;font-weight:600;background:var(--surface-3)}
  .dr-pre button:hover{background:var(--surface-4)}.dr-pre button.on{background:var(--sel);color:var(--accent)}
  .chips{display:inline-flex;flex-wrap:wrap;gap:5px}
  .picker-btn{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 10px 0 11px;border-radius:var(--r-sm);background:var(--surface-3);box-shadow:inset 0 0 0 1px var(--line);font-weight:600;font-size:var(--fs-13);max-width:260px;white-space:nowrap;transition:background var(--t-fast)}
  .picker-btn:hover{background:var(--surface-4)}
  .picker-btn .v{overflow:hidden;text-overflow:ellipsis}
  .picker-btn.active{background:var(--sel);color:var(--accent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 40%,transparent)}
  .picker-btn svg.i:last-child{opacity:.6}
  /* En-tête compact d'une rubrique : UNE ligne (titre + onglets + filtres) */
  .app-head{display:flex;align-items:center;gap:8px 14px;flex-wrap:wrap;padding:10px 16px;border-bottom:1px solid var(--line);flex:none;background:var(--surface-1)}
  .app-head .ah-t{display:flex;align-items:baseline;gap:10px;min-width:0}
  .app-head .ah-t h1{font-size:18px;letter-spacing:-.02em;white-space:nowrap}
  .app-head .ah-t .sub{color:var(--text-3);font-size:12px;white-space:nowrap}
  .app-head .ah-tabs{display:flex;gap:2px}
  .app-head .ah-f{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-left:auto}
  .app-head2{display:flex;align-items:center;gap:6px 10px;flex-wrap:wrap;padding:8px 16px;border-bottom:1px solid var(--line);flex:none;background:var(--surface-0)}
  @container app (max-width:720px){.app-head{padding:8px 12px}.app-head .ah-f{margin-left:0;width:100%}.app-head2{padding:8px 12px}}
  `);
})();

}
