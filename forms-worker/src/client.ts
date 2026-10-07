// =====================================================================
// FORMS BONY — client du formulaire (navigateur du répondant), 01/10/2026.
// Compilé par esbuild (`npm run build:client`) puis INCLUS dans la page par le Worker.
// Même format et même validation que le serveur (shared/bonyform.ts) : un message d'erreur affiché
// ici est exactement celui que renverrait le serveur.
// Deux présentations : « page » (tout le formulaire) et « steps » (une question par écran).
// MODE APERÇU (/__preview, F2a) : la définition arrive de l'éditeur de Gearbox par postMessage (origines
// autorisées seulement) et se redessine à chaque réglage ; aucun envoi, clic sur une question = la
// sélectionner dans l'éditeur.
// =====================================================================
import { validate, visibleFields, calcValue, resolveTheme, isLayout, endingOf, parseDrive, driveDays, driveTimes, driveLeft, driveOpen, type BonyFormDef, type Field, type Answers, type Value } from '../../shared/bonyform';
import { renderTheme, fontsHref, fontFaces } from './theme';

declare const turnstile: { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void } | undefined;
const BF = (window as any).__BF as { publicId: string; def: BonyFormDef | null; siteKey: string; taken: Record<string, Record<string, number>>; preview?: boolean; origins?: string[] };
const PREVIEW = !!BF.preview;
/** Intégré dans un autre site (embed.js) : l'iframe n'a pas de défilement propre, c'est la page HÔTE qui défile. */
const EMBED = document.documentElement.hasAttribute('data-embed');
/** Amène le point `y` de la page (0 = haut du formulaire) dans la vue — dans l'iframe, demandé à l'hôte. */
const bringTo = (y: number) => { if (EMBED) parent.postMessage({ type: 'bonyform:scroll', y: Math.max(0, Math.round(y)) }, '*'); else window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' }); };
/** Message vers l'éditeur de Gearbox (aperçu seulement ; branché plus bas). */
let tellParent: (msg: unknown) => void = () => {};
let def = BF.def as BonyFormDef;
const app = document.getElementById('app')!;
const t0 = Date.now();
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- état
const answers: Answers = {};
const touched = new Set<string>();
let errors: Record<string, string> = {};
const params: Record<string, string> = {};
/** F2b : l'écran d'accueil a-t-il été passé ? (aperçu : piloté par l'éditeur) */
let started = false;
const welcomeOn = () => !!def?.settings.welcome?.enabled && !started;
/** Lettre de raccourci d'une option (A, B, C…), une question par écran seulement. */
const KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const stepsMode = () => def?.theme.layout === 'steps';
/** Adresse d'image sûre (http(s) ou /a/<id> du Worker). */
const safeImg = (u?: string | null) => (u && (/^https?:\/\/[^\s"'()<>]+$/.test(u) || /^\/a\/[a-z0-9]+$/.test(u)) ? u : '');
new URLSearchParams(location.search).forEach((v, k) => { params[k] = v; });
// Préremplissage depuis le lien de l'e-mailing (?email=…&concession=…).
const prefill = () => def.fields.forEach((f) => {
  const p = f.param && params[f.param];
  if (!p || answers[f.id] !== undefined) return;
  if (f.type === 'multi') answers[f.id] = p.split(',').map((x) => optId(f, x.trim())).filter(Boolean) as string[];
  else if (f.options) answers[f.id] = optId(f, p);
  else answers[f.id] = p;
});
if (def) prefill();
const theme = () => resolveTheme(def.theme);
/** Thème → variables et attributs sur <html> (rappelé à chaque changement de l'aperçu). */
function applyTheme() {
  const { vars, attrs, t } = renderTheme(def.theme);
  const st = document.getElementById('bf-vars'); if (st) st.textContent = `:root{${vars}}`;
  const ff = document.getElementById('bf-faces'), faces = fontFaces(t); if (ff && ff.textContent !== faces) ff.textContent = faces;
  for (const [k, v] of Object.entries(attrs)) { if (v) document.documentElement.setAttribute(k, v); else document.documentElement.removeAttribute(k); }
  const fl = document.getElementById('bf-fonts') as HTMLLinkElement | null; const href = fontsHref(t);
  if (fl && fl.getAttribute('href') !== href) fl.setAttribute('href', href);
  if (PREVIEW) document.documentElement.setAttribute('data-preview', '1');
}
function optId(f: Field, v: string) { const o = f.options?.find((x) => x.id === v || x.label.toLowerCase() === v.toLowerCase()); return o ? o.id : f.options ? null : v; }

// ---------------------------------------------------------------- utilitaires DOM
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...kids: (Node | string | null | undefined | false)[]) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v; else if (k.startsWith('on')) (el as any)[k] = v; else if (k === 'html') el.innerHTML = v; else el.setAttribute(k, v === true ? '' : String(v));
  }
  kids.forEach((c) => { if (c !== null && c !== undefined && c !== false) el.append(c); });
  return el;
};
const locked = (f: Field) => !!(f.lockPrefill && f.param && params[f.param]);

// ---------------------------------------------------------------- champs
function control(f: Field, onDone?: () => void): HTMLElement {
  const v = answers[f.id];
  const set = (x: Value, done = false) => { answers[f.id] = x; touched.add(f.id); refresh(); if (done && onDone) setTimeout(onDone, reduced ? 0 : 320); };
  const input = (type: string, extra: Record<string, any> = {}) => h('input', {
    class: 'bf-t', type, value: v ?? '', placeholder: f.placeholder || '', disabled: locked(f), 'aria-label': f.label,
    oninput: (e: any) => { answers[f.id] = e.target.value; refresh(true); },
    onblur: () => { touched.add(f.id); refresh(); },
    onkeydown: (e: KeyboardEvent) => { if (e.key === 'Enter' && onDone) { e.preventDefault(); touched.add(f.id); onDone(); } },
    ...extra,
  });
  switch (f.type) {
    case 'short': return input('text', { maxlength: f.maxLength || 500 });
    case 'email': return input('email', { autocomplete: 'email', inputmode: 'email' });
    case 'phone': return input('tel', { autocomplete: 'tel', inputmode: 'tel' });
    case 'postal': return input('text', { inputmode: 'numeric', maxlength: 5, autocomplete: 'postal-code' });
    case 'number': return input('number', { min: f.min, max: f.max, step: f.step || 'any', inputmode: 'decimal' });
    case 'date': return input('date');
    case 'time': return input('time');
    case 'long': return h('textarea', { class: 'bf-t', placeholder: f.placeholder || '', maxlength: f.maxLength || 5000, disabled: locked(f),
      oninput: (e: any) => { answers[f.id] = e.target.value; refresh(true); }, onblur: () => { touched.add(f.id); refresh(); } }, String(v ?? ''));
    case 'dropdown': case 'concession': case 'brand':
      return h('select', { class: 'bf-t', disabled: locked(f), onchange: (e: any) => set(e.target.value || null, true) },
        h('option', { value: '' }, f.placeholder || 'Choisir…'), ...(f.options || []).map((o) => h('option', { value: o.id, selected: v === o.id }, o.label)));
    case 'choice': case 'slot': case 'multi': {
      const multi = f.type === 'multi', list = Array.isArray(v) ? v : v ? [String(v)] : [];
      const tiles = f.display === 'tiles' && f.type !== 'slot', keys = stepsMode();
      const wrap = h('div', { class: `bf-opts ${tiles ? 'tiles' : ''}`, role: multi ? 'group' : 'radiogroup', 'aria-label': f.label, style: tiles ? `--cols:${Math.min(4, Math.max(1, f.columns || 2))}` : null });
      (f.options || []).forEach((o, k) => {
        const full = f.type === 'slot' && o.capacity !== undefined && (BF.taken[f.id]?.[o.id] || 0) >= o.capacity;
        const left = f.type === 'slot' && o.capacity !== undefined ? o.capacity - (BF.taken[f.id]?.[o.id] || 0) : null;
        const on = list.includes(o.id);
        wrap.append(h('label', { class: `bf-opt ${multi ? 'sq' : ''} ${on ? 'on' : ''}`, style: full ? 'opacity:.45;cursor:not-allowed' : null },
          h('input', { type: multi ? 'checkbox' : 'radio', name: f.id, checked: on, disabled: full || locked(f),
            onchange: () => { if (multi) set(on ? list.filter((x) => x !== o.id) : [...list.filter((x) => x !== o.id), o.id]); else set(o.id, true); } }),
          tiles ? (safeImg(o.image) ? h('span', { class: 'bf-tmedia', style: `background-image:url("${safeImg(o.image)}")` }) : o.emoji ? h('span', { class: 'bf-temoji', 'aria-hidden': 'true' }, o.emoji) : null) : null,
          keys && k < 26 ? h('span', { class: 'bf-key', 'aria-hidden': 'true' }, KEYS[k]) : h('span', { class: 'bf-mk' }),
          h('span', { class: 'bf-ol' }, o.label),
          left !== null ? h('span', { style: 'font-size:13px;opacity:.7' }, full ? 'Complet' : `${left} place${left > 1 ? 's' : ''}`) : null));
      });
      if (f.allowOther && f.type !== 'slot') {
        const cur = list.find((x) => x.startsWith('other:'));
        const on = cur !== undefined;
        wrap.append(h('label', { class: `bf-opt ${multi ? 'sq' : ''} ${on ? 'on' : ''}` },
          h('input', { type: multi ? 'checkbox' : 'radio', name: f.id, checked: on, onchange: () => { if (multi) set(on ? list.filter((x) => !x.startsWith('other:')) : [...list, 'other: ']); else set('other: '); } }),
          h('span', { class: 'bf-mk' }), h('span', {}, 'Autre')));
        if (on) wrap.append(h('input', { class: 'bf-t bf-other', placeholder: 'Précisez…', value: cur!.slice(6).trim(),
          oninput: (e: any) => { const t = `other:${e.target.value}`; answers[f.id] = multi ? [...list.filter((x) => !x.startsWith('other:')), t] : t; refresh(true); } }));
      }
      return wrap;
    }
    case 'scale': case 'nps': {
      const lo = f.type === 'nps' ? 0 : f.min ?? 1, hi = f.type === 'nps' ? 10 : f.max ?? 5;
      const row = h('div', { class: 'bf-scale', role: 'radiogroup', 'aria-label': f.label });
      for (let n = lo; n <= hi; n++) row.append(h('button', { type: 'button', class: Number(v) === n && v !== null && v !== '' ? 'on' : '', 'aria-pressed': Number(v) === n, onclick: () => set(n, true) }, String(n)));
      return h('div', {}, row, (f.minLabel || f.maxLabel || f.type === 'nps') ? h('div', { class: 'bf-scale-l' }, h('span', {}, f.minLabel || (f.type === 'nps' ? 'Pas du tout probable' : '')), h('span', {}, f.maxLabel || (f.type === 'nps' ? 'Très probable' : ''))) : null);
    }
    case 'rating': {
      const n = f.max || 5, g = f.icon === 'heart' ? '♥' : f.icon === 'thumb' ? '👍' : '★';
      const row = h('div', { class: 'bf-stars', role: 'radiogroup', 'aria-label': f.label });
      for (let i = 1; i <= n; i++) row.append(h('button', { type: 'button', class: Number(v) >= i ? 'on' : '', 'aria-label': `${i} sur ${n}`, onclick: () => set(i, true) }, g));
      return row;
    }
    case 'consent':
      return h('label', { class: `bf-consent ${v ? 'on' : ''}` },
        h('input', { type: 'checkbox', class: 'bf-hp', checked: !!v, onchange: (e: any) => set(e.target.checked) }),
        h('span', { class: 'bf-mk', style: v ? 'background:var(--p);border-color:var(--p)' : '' }),
        h('span', { style: 'white-space:pre-wrap' }, f.consentText || 'J’accepte que mes données soient utilisées pour traiter ma demande.'));
    case 'calc':
      return h('div', { class: 'bf-t', style: 'font-weight:700;font-size:20px' }, String(calcValue(f, def, answers)));
    case 'testdrive': return testdrive(f, onDone);
    case 'signature': return signature(f);
    case 'file': return fileField(f);
    default:
      return h('div', {}, '');
  }
}

// ---------------------------------------------------------------- prise d'essai : voiture → jour → créneau (F3)
const FR = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { ...o, timeZone: 'UTC' });
const pick: Record<string, { car?: string; day?: string }> = {};
function testdrive(f: Field, onDone?: () => void): HTMLElement {
  const d = f.drive!, box = h('div', { class: 'bf-drive' }), taken = () => BF.taken?.[f.id] || {};
  const cur = parseDrive(answers[f.id]);
  const st = (pick[f.id] = pick[f.id] || (cur ? { car: cur.car, day: cur.date } : {}));
  const freeIn = (car: string, day: string) => driveTimes(d, day).some((t) => driveOpen(d, day, t) && driveLeft(d, car, `${day}T${t}`, taken()) > 0);
  const draw = () => {
    box.replaceChildren();
    // 1. voiture
    box.append(h('div', { class: 'bf-dstep' }, h('b', {}, '1'), 'Le modèle'),
      h('div', { class: 'bf-opts tiles bf-dcars', style: `--cols:${Math.min(3, Math.max(1, d.cars.length))}` }, ...d.cars.map((c) =>
        h('label', { class: `bf-opt ${st.car === c.id ? 'on' : ''}` },
          h('input', { type: 'radio', name: `${f.id}-car`, checked: st.car === c.id, onchange: () => { st.car = c.id; if (st.day && !freeIn(c.id, st.day)) st.day = undefined; if (cur && cur.car !== c.id) { answers[f.id] = null; } draw(); } }),
          c.image ? h('span', { class: 'bf-tmedia', style: `background-image:url("${c.image}")` }) : h('span', { class: 'bf-temoji', 'aria-hidden': 'true' }, '🚗'),
          h('span', { class: 'bf-mk' }), h('span', { class: 'bf-ol' }, c.label)))));
    if (!st.car) return;
    // 2. jour
    const days = driveDays(d);
    box.append(h('div', { class: 'bf-dstep' }, h('b', {}, '2'), 'Le jour'));
    if (!days.length) { box.append(h('p', { class: 'bf-help' }, 'Aucun jour disponible pour le moment.')); return; }
    box.append(h('div', { class: 'bf-days', role: 'radiogroup' }, ...days.map((day) => {
      const free = freeIn(st.car!, day);
      return h('button', { type: 'button', class: `bf-day ${st.day === day ? 'on' : ''}`, disabled: !free, 'aria-pressed': st.day === day,
        onclick: () => { st.day = day; draw(); setTimeout(() => box.querySelector('.bf-times')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' }), 30); } },
        h('span', {}, FR(day, { weekday: 'short' })), h('b', {}, FR(day, { day: 'numeric' })), h('span', {}, free ? FR(day, { month: 'short' }) : 'complet'));
    })));
    if (!st.day) return;
    // 3. créneau
    const times = driveTimes(d, st.day).filter((t) => driveOpen(d, st.day!, t));
    box.append(h('div', { class: 'bf-dstep' }, h('b', {}, '3'), 'L’heure'),
      h('div', { class: 'bf-times', role: 'radiogroup' }, ...times.map((t) => {
        const left = driveLeft(d, st.car!, `${st.day}T${t}`, taken()), v = `${st.car}@${st.day}T${t}`, on = answers[f.id] === v;
        return h('button', { type: 'button', class: `bf-time ${on ? 'on' : ''}`, disabled: left <= 0, 'aria-pressed': on, title: left <= 0 ? 'Complet' : `${left} voiture${left > 1 ? 's' : ''} disponible${left > 1 ? 's' : ''}`,
          onclick: () => { answers[f.id] = v; touched.add(f.id); draw(); refresh(true); if (onDone) setTimeout(onDone, reduced ? 0 : 320); } }, t.replace(':', 'h'));
      })));
    const end = typeof answers[f.id] === 'string' ? parseDrive(answers[f.id]) : null;
    if (end && end.car === st.car && end.date === st.day) box.append(h('div', { class: 'bf-dok' }, '✓ ', `${d.cars.find((c) => c.id === end.car)?.label} · ${FR(end.date, { weekday: 'long', day: 'numeric', month: 'long' })} à ${end.time.replace(':', 'h')} (${d.slot} min)`));
  };
  draw();
  return box;
}

// ---------------------------------------------------------------- signature au doigt (F3)
function signature(f: Field): HTMLElement {
  const cv = h('canvas', { class: 'bf-sig', width: '600', height: '200', 'aria-label': 'Zone de signature' }) as HTMLCanvasElement;
  const g = cv.getContext('2d')!, tx = getComputedStyle(document.documentElement).getPropertyValue('--tx').trim() || '#111';
  g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = tx;
  if (typeof answers[f.id] === 'string') { const im = new Image(); im.onload = () => g.drawImage(im, 0, 0, 600, 200); im.src = answers[f.id] as string; }
  let drawing = false, last: [number, number] | null = null;
  const at = (e: PointerEvent): [number, number] => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 600, ((e.clientY - r.top) / r.height) * 200]; };
  cv.onpointerdown = (e: PointerEvent) => { e.preventDefault(); cv.setPointerCapture(e.pointerId); drawing = true; last = at(e); g.beginPath(); g.arc(last[0], last[1], 1.2, 0, 7); g.fillStyle = tx; g.fill(); };
  cv.onpointermove = (e: PointerEvent) => { if (!drawing || !last) return; const p = at(e); g.beginPath(); g.moveTo(last[0], last[1]); g.lineTo(p[0], p[1]); g.stroke(); last = p; };
  cv.onpointerup = cv.onpointercancel = () => { if (!drawing) return; drawing = false; last = null; answers[f.id] = cv.toDataURL('image/png'); touched.add(f.id); sigs.set(f.id, sigOf(f)); refresh(true); };
  const clear = h('button', { type: 'button', class: 'bf-btn ghost bf-sm', onclick: () => { g.clearRect(0, 0, 600, 200); answers[f.id] = null; sigs.set(f.id, sigOf(f)); refresh(true); } }, 'Effacer');
  return h('div', { class: 'bf-sigw' }, cv, h('div', { class: 'bf-sigf' }, h('span', {}, 'Signez avec le doigt ou la souris'), clear));
}

// ---------------------------------------------------------------- dépôt de fichiers (F3) : relayés à Gearbox
const fileNames: Record<string, string> = {};
function fileField(f: Field): HTMLElement {
  const list = () => (Array.isArray(answers[f.id]) ? (answers[f.id] as string[]) : []), max = f.maxFiles || 1;
  const box = h('div', { class: 'bf-files' }), msg = h('div', { class: 'bf-err', role: 'alert', style: 'display:none' });
  const inp = h('input', { type: 'file', class: 'bf-hp', accept: (f.accept?.length ? f.accept : ['image/*', 'application/pdf']).join(','), multiple: max > 1 }) as HTMLInputElement;
  const draw = () => {
    box.replaceChildren(...list().map((t) => h('div', { class: 'bf-file' }, h('span', { class: 'bf-ol' }, '📎 ', fileNames[t] || 'Fichier envoyé'),
      h('button', { type: 'button', class: 'bf-btn ghost bf-sm', 'aria-label': 'Retirer', onclick: () => { answers[f.id] = list().filter((x) => x !== t); touched.add(f.id); sigs.set(f.id, sigOf(f)); draw(); refresh(true); } }, '✕'))),
      ...(list().length < max ? [h('button', { type: 'button', class: 'bf-btn ghost bf-drop', onclick: () => inp.click() }, `＋ Ajouter un fichier${max > 1 ? ` (${list().length}/${max})` : ''}`)] : []), inp, msg);
  };
  inp.onchange = async () => {
    msg.style.display = 'none';
    for (const file of Array.from(inp.files || []).slice(0, max - list().length)) {
      const row = h('div', { class: 'bf-file busy' }, h('span', { class: 'bf-spin' }), h('span', { class: 'bf-ol' }, file.name)); box.insertBefore(row, box.firstChild);
      try {
        let token: string;
        if (PREVIEW) token = `${'a'.repeat(24)}.${Math.random().toString(16).slice(2).padEnd(32, '0').slice(0, 32)}`;   // aperçu : rien n'est envoyé
        else {
          const fd = new FormData(); fd.append('field', f.id); fd.append('file', file);
          const r = await fetch(`${location.pathname}/file`, { method: 'POST', body: fd }), j: any = await r.json().catch(() => ({}));
          if (!r.ok || !j.token) throw new Error(j.error || 'Envoi impossible.');
          token = j.token;
        }
        fileNames[token] = file.name; answers[f.id] = [...list(), token]; touched.add(f.id);
      } catch (e: any) { msg.textContent = `⚠ ${file.name} : ${e?.message || 'envoi impossible.'}`; msg.style.display = ''; }
    }
    inp.value = ''; sigs.set(f.id, sigOf(f)); draw(); refresh(true);
  };
  draw();
  return box;
}

/** Carte d'une question (intitulé, aide, contrôle, erreur). */
function card(f: Field, i: number, onDone?: () => void): HTMLElement {
  if (f.type === 'section') return h('div', { class: 'bf-sec bf-in', style: `--i:${i}`, 'data-f': f.id }, h('h2', {}, f.label), f.help ? h('p', { class: 'bf-help' }, f.help) : null);
  if (f.type === 'calc' && f.calcHidden) return h('div', { 'data-f': f.id, hidden: true });
  if (f.type === 'statement') return h('div', { class: 'bf-card bf-q bf-in', style: `--i:${i}`, 'data-f': f.id }, f.label ? h('label', { class: 'bf-l' }, f.label) : null, f.help ? h('div', { class: 'bf-stmt' }, f.help) : null);
  const err = touched.has(f.id) ? errors[f.id] : undefined;
  return h('div', { class: `bf-card bf-q bf-in ${err ? 'bad' : ''}`, style: `--i:${i}`, 'data-f': f.id },
    f.type === 'consent' ? null : h('label', { class: 'bf-l' }, f.label, f.required ? h('span', { class: 'bf-req', 'aria-hidden': 'true' }, '*') : null),
    f.help ? h('p', { class: 'bf-help' }, f.help) : null,
    control(f, onDone),
    err ? h('div', { class: 'bf-err', role: 'alert' }, '⚠ ', err) : null);
}

// ---------------------------------------------------------------- en-tête
/**
 * En-tête selon son style : `outside` (plein écran, au-dessus du formulaire) ou `inside` (carte en tête).
 * band = liseré ; banner = image en tête de carte ; hero = photo plein écran, titre posé dessus ;
 * split = photo à gauche (calque .bf-side, CSS) ; none = titre sans carte.
 */
function header(): { outside: HTMLElement | null; inside: HTMLElement | null } {
  const t = theme(), tpl = document.getElementById('bony-logo') as HTMLTemplateElement | null;
  const style = document.documentElement.getAttribute('data-header') || 'band';
  const logo = t.logoImage ? h('div', { class: 'bf-logo img' }, h('img', { src: t.logoImage, alt: '' })) : t.logo === 'bony' && tpl ? h('div', { class: 'bf-logo', html: tpl.innerHTML }) : t.logo ? h('div', { class: 'bf-logo txt' }, t.logo) : null;
  const hin = h('div', { class: 'bf-hin' }, logo, h('h1', {}, def.title), def.description ? h('p', { class: 'bf-desc' }, def.description) : null);
  if (style === 'hero') return { outside: h('header', { class: 'bf-hero bf-in' }, hin), inside: null };
  return { outside: null, inside: h('div', { class: 'bf-card bf-head bf-in' }, style === 'banner' ? h('div', { class: 'bf-ban' }) : style === 'band' ? h('div', { class: 'bf-band' }) : null, hin) };
}

// ---------------------------------------------------------------- captcha + envoi
let tsToken = '', tsId: string | undefined;
function captcha(box: HTMLElement) {
  if (PREVIEW) return;                                       // aperçu : pas de captcha, pas d'envoi
  const go = () => { if (typeof turnstile === 'undefined') return setTimeout(go, 200); tsId = turnstile.render(box, { sitekey: BF.siteKey, callback: (t: string) => { tsToken = t; }, 'expired-callback': () => { tsToken = ''; }, theme: 'auto', language: 'fr', appearance: 'interaction-only' }); };
  go();
}
let sending = false;
async function send(btn: HTMLButtonElement, gerr: HTMLElement) {
  if (sending) return;
  const vis = visibleFields(def, answers);
  vis.forEach((f) => touched.add(f.id));
  errors = validate(def, answers, { taken: BF.taken }).errors;
  if (Object.keys(errors).length) { render(); focusFirstError(); return; }
  if (PREVIEW) return thanks();                               // aperçu : écran de fin, rien n'est envoyé
  if (!tsToken) { gerr.textContent = 'Vérification anti-robot en cours… réessayez dans un instant.'; return; }
  sending = true; btn.disabled = true; btn.innerHTML = '<span class="bf-spin"></span>Envoi…'; gerr.textContent = '';
  try {
    const r = await fetch(location.pathname, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers, params, ref: (() => { try { return document.referrer ? new URL(document.referrer).hostname : ''; } catch { return ''; } })(), t0, token: tsToken, hp: (document.getElementById('bf-hp') as HTMLInputElement)?.value || '' }) });
    const j: any = await r.json().catch(() => ({}));
    if (r.ok) return thanks();
    if (j.taken) BF.taken = j.taken;                         // places relues : un créneau pris entre-temps apparaît complet
    if (j.errors) { errors = j.errors; Object.keys(errors).forEach((k) => touched.add(k)); render(); focusFirstError(); }
    gerr.textContent = j.error || 'L’envoi a échoué, réessayez.';
    if (j.captcha && tsId && typeof turnstile !== 'undefined') { tsToken = ''; turnstile.reset(tsId); }
    if (j.closed) setTimeout(() => location.reload(), 2500);
  } catch { gerr.textContent = 'Connexion impossible : vérifiez votre réseau et réessayez.'; }
  sending = false; btn.disabled = false; btn.textContent = theme().buttons.label || 'Envoyer';
}
function focusFirstError() {
  const id = Object.keys(errors).find((k) => visibleFields(def, answers).some((f) => f.id === k)); if (!id) return;
  if (def.theme.layout === 'steps') { const i = steps().findIndex((f) => f.id === id); if (i >= 0) { step = i; render(); } }
  const el = app.querySelector<HTMLElement>(`[data-f="${id}"]`);
  if (EMBED) { if (el) bringTo(el.getBoundingClientRect().top + window.scrollY - 80); }
  else el?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  el?.classList.remove('shake'); void el?.offsetWidth; el?.classList.add('shake');
}
function thanks() {
  const e = endingOf(def, answers), s = e ? { ...def.settings.thankYou, ...e } : def.settings.thankYou;
  app.innerHTML = '';
  app.append(h('div', { class: 'bf-wrap' }, h('div', { class: 'bf-card bf-thanks bf-in' },
    h('div', { class: 'bf-check', html: '<svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="40"/><path d="M25 43 l12 12 l22 -24"/></svg>' }),
    safeImg(s.image) ? h('div', { class: 'bf-endimg', style: `background-image:url("${safeImg(s.image)}")` }) : null,
    h('h1', {}, s.title || 'Merci !'), h('p', { class: 'bf-desc' }, s.message || ''),
    s.button?.label && /^https?:\/\//.test(s.button.url || '') ? h('div', { class: 'bf-act', style: 'justify-content:center' }, h('a', { class: 'bf-btn', href: s.button.url, target: '_top', rel: 'noopener' }, s.button.label)) : null,
    PREVIEW ? h('div', { class: 'bf-act', style: 'justify-content:center' }, h('button', { class: 'bf-btn ghost', type: 'button', onclick: () => { render(); tellParent({ type: 'bonyform:screen', screen: 'form' }); } }, '← Revenir au formulaire')) : null)));
  confetti();
  bringTo(0);
  // Intégré : la redirection est faite par la page hôte (sinon le site visé s'ouvrirait DANS l'iframe).
  if (!PREVIEW && s.redirectUrl && /^https?:\/\//.test(s.redirectUrl)) setTimeout(() => { if (EMBED) parent.postMessage({ type: 'bonyform:redirect', url: s.redirectUrl }, '*'); else location.href = s.redirectUrl!; }, 2600);
}
function confetti() {
  const t = theme();
  if (reduced || !t.motion.confetti || t.motion.level === 'none') return;
  const box = h('div', { class: 'bf-conf' }), cols = t.motion.confettiColors?.length ? t.motion.confettiColors : [t.primary, '#ffd166', '#06d6a0', '#118ab2', '#ef476f'];
  for (let i = 0; i < 90; i++) box.append(h('i', { style: `left:${Math.random() * 100}%;background:${cols[i % cols.length]};--dx:${(Math.random() - 0.5) * 220}px;--rot:${Math.random() * 720}deg;animation-duration:${1.8 + Math.random() * 1.6}s;animation-delay:${Math.random() * 0.4}s` }));
  document.body.append(box); setTimeout(() => box.remove(), 4200);
}

// ---------------------------------------------------------------- rendu « page »
/**
 * Empreinte de l'état AFFICHÉ d'une carte. ⚠️ Une carte ne se redessine que si son empreinte change :
 * redessiner les autres (perte de focus d'un champ voisin, par exemple) remplaçait l'option sous le
 * pointeur entre l'appui et le relâchement — le clic était perdu (constaté au test du 01/10/2026).
 */
const sigs = new Map<string, string>();
const sigOf = (f: Field) => JSON.stringify([answers[f.id] ?? null, touched.has(f.id) ? errors[f.id] || null : null, f.type === 'calc' ? calcValue(f, def, answers) : null]);
function renderPage() {
  sigs.clear();
  const vis = new Set(visibleFields(def, answers).map((f) => f.id));
  const list = h('div', { class: 'bf-list' });
  let i = 1;
  def.fields.forEach((f) => { if (f.type === 'hidden') return; sigs.set(f.id, sigOf(f)); const c = card(f, i++); list.append(h('div', { class: `bf-fold ${vis.has(f.id) ? '' : 'off'} ${f.width === 'half' && f.type !== 'section' ? 'half' : ''}`, 'data-w': f.id }, h('div', {}, c))); });
  const gerr = h('div', { class: 'bf-gerr', role: 'alert' });
  const btn = h('button', { class: 'bf-btn', type: 'button', onclick: () => send(btn, gerr) }, theme().buttons.label || 'Envoyer') as HTMLButtonElement;
  const ts = h('div', { class: 'bf-ts' });
  const hd = header();
  app.innerHTML = '';
  if (hd.outside) app.append(hd.outside);
  app.append(h('main', { class: 'bf-wrap' }, hd.inside, list, ts, h('input', { id: 'bf-hp', class: 'bf-hp', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' }),
    h('div', { class: 'bf-act' }, btn, gerr), h('div', { class: 'bf-foot' }, 'Formulaire Bony auto-mobile')));
  captcha(ts);
}
/** Mise à jour sans tout reconstruire : visibilité (repli animé), erreurs, champs calculés. */
function refreshPage(typing: boolean) {
  const vis = new Set(visibleFields(def, answers).map((f) => f.id));
  errors = validate(def, answers, { taken: BF.taken }).errors;
  def.fields.forEach((f) => {
    const w = app.querySelector<HTMLElement>(`[data-w="${f.id}"]`); if (!w) return;
    // Repli animé : la découpe (overflow:hidden) n'est posée que replié ou PENDANT l'animation. Au repos, une
    // carte ouverte n'est pas découpée, sinon son ombre l'était aussi (carrés dans les coins, recette du 01/10).
    const off = !vis.has(f.id);
    if (w.classList.contains('off') !== off) {
      w.classList.add('anim'); w.classList.toggle('off', off);
      window.clearTimeout(Number(w.dataset.t || 0)); w.dataset.t = String(window.setTimeout(() => w.classList.remove('anim'), reduced ? 0 : 520));
    }
    if (typing && document.activeElement && w.contains(document.activeElement)) return;   // ne pas casser la saisie en cours
    const sg = sigOf(f);
    if (sg !== sigs.get(f.id)) { sigs.set(f.id, sg); const fresh = card(f, 0); fresh.classList.remove('bf-in'); w.firstElementChild!.replaceChildren(fresh); }
  });
}

// ---------------------------------------------------------------- rendu « une question par écran »
let step = 0, dir = 1;
const steps = () => visibleFields(def, answers).filter((f) => f.type !== 'hidden' && f.type !== 'section' && !(f.type === 'calc' && f.calcHidden));
const sectionOf = (f: Field) => { let s: Field | null = null; for (const x of def.fields) { if (x.type === 'section') s = x; if (x.id === f.id) break; } return s; };
function next() {
  const st = steps(), f = st[step]; if (!f) return;
  touched.add(f.id); errors = validate(def, answers, { taken: BF.taken }).errors;
  if (errors[f.id]) { render(); focusFirstError(); return; }
  if (step < st.length - 1) { dir = 1; step++; render(); if (EMBED) bringTo(0); }
}
/** Passage automatique à la question suivante après un choix (comme Typeform) ; Entrée pour les saisies. */
const AUTO = ['choice', 'scale', 'nps', 'rating', 'dropdown', 'concession', 'brand', 'slot', 'testdrive'];
const stepDone = (f: Field, last: boolean) => (AUTO.includes(f.type) ? () => { if (!last) next(); } : next);
function renderSteps() {
  const st = steps(); step = Math.min(step, Math.max(0, st.length - 1));
  const f = st[step], last = step === st.length - 1, sec = f ? sectionOf(f) : null;
  const gerr = h('div', { class: 'bf-gerr', role: 'alert' });
  const lb = theme().buttons;
  const btn = h('button', { class: 'bf-btn', type: 'button', onclick: () => (last ? send(btn, gerr) : next()) }, last ? lb.label || 'Envoyer' : `${lb.nextLabel || 'Suivant'} ↵`) as HTMLButtonElement;
  const back = step > 0 ? h('button', { class: 'bf-btn ghost', type: 'button', onclick: () => { dir = -1; step--; render(); if (EMBED) bringTo(0); } }, '← Précédent') : null;
  const ts = h('div', { class: 'bf-ts' });
  const hd = step === 0 ? header() : { outside: null, inside: null };
  app.innerHTML = '';
  app.append(h('div', { class: 'bf-prog' }, h('i', { style: `transform:scaleX(${st.length ? (step + (last ? 1 : 0)) / st.length : 0})` })));
  if (hd.outside) app.append(hd.outside);
  app.append(
    h('main', { class: 'bf-wrap' }, hd.inside,
      h('div', { class: `bf-step ${dir > 0 ? 'bf-slide-in' : 'bf-slide-back'}` },
        h('div', { class: 'bf-stepnav' }, `${step + 1} / ${st.length}${sec ? ` · ${sec.label}` : ''}`),
        f ? card(f, 0, stepDone(f, last)) : null,
        last ? ts : null, h('input', { id: 'bf-hp', class: 'bf-hp', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' }),
        h('div', { class: 'bf-act' }, back, btn, gerr))));
  if (last) captcha(ts);
  const inp = app.querySelector<HTMLElement>('.bf-step input.bf-t, .bf-step textarea, .bf-step select');
  if (inp && !reduced) setTimeout(() => inp.focus({ preventScroll: true }), 120);
}

// ---------------------------------------------------------------- écran d'accueil (F2b)
function renderWelcome() {
  const w = def.settings.welcome!, hd = header();
  const go = () => { started = true; render(); };
  app.innerHTML = '';
  if (hd.outside) app.append(hd.outside);
  app.append(h('main', { class: 'bf-wrap' }, hd.inside,
    h('div', { class: 'bf-card bf-welcome bf-in' },
      safeImg(w.image) ? h('div', { class: 'bf-endimg', style: `background-image:url("${safeImg(w.image)}")` }) : null,
      h('h2', {}, w.title || def.title), w.message ? h('p', { class: 'bf-desc' }, w.message) : null,
      h('div', { class: 'bf-act', style: 'justify-content:center' }, h('button', { class: 'bf-btn', type: 'button', onclick: go }, `${w.button || 'Commencer'}${stepsMode() ? ' ↵' : ''}`)),
      (() => { const n = def.fields.filter((f) => !isLayout(f) && f.type !== 'hidden' && f.type !== 'consent').length; return h('div', { class: 'bf-hint' }, `${n} question${n > 1 ? 's' : ''} · environ ${Math.max(1, Math.round(n * 0.25))} min`); })()),
    h('div', { class: 'bf-foot' }, 'Formulaire Bony auto-mobile')));
}

// ---------------------------------------------------------------- clavier (une question par écran, façon Typeform)
// Lettres = options, chiffres = échelles et notes, Entrée = suivant / envoyer. Jamais pendant une saisie.
document.addEventListener('keydown', (e) => {
  if (!def || e.ctrlKey || e.metaKey || e.altKey) return;
  const tgt = e.target as HTMLElement, typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tgt?.tagName || '') && (tgt as HTMLInputElement).type !== 'radio' && (tgt as HTMLInputElement).type !== 'checkbox';
  if (welcomeOn()) { if (e.key === 'Enter') { e.preventDefault(); started = true; render(); } return; }
  if (!stepsMode() || typing) return;
  const st = steps(), f = st[step]; if (!f) return;
  const last = step === st.length - 1;
  if (e.key === 'Enter') {
    e.preventDefault();
    const btn = app.querySelector<HTMLButtonElement>('.bf-step .bf-act .bf-btn:not(.ghost)');
    if (last) btn?.click(); else next();
    return;
  }
  const k = e.key.toUpperCase();
  if (['choice', 'multi', 'slot'].includes(f.type) && /^[A-Z]$/.test(k)) {
    const o = f.options?.[KEYS.indexOf(k)]; if (!o) return;
    const lab = app.querySelectorAll<HTMLLabelElement>('.bf-step .bf-opt')[KEYS.indexOf(k)];
    lab?.querySelector('input')?.click(); lab?.classList.add('kick'); e.preventDefault();
  } else if (['scale', 'nps', 'rating'].includes(f.type) && /^[0-9]$/.test(e.key)) {
    const b = [...app.querySelectorAll<HTMLButtonElement>('.bf-step .bf-scale button, .bf-step .bf-stars button')].find((x, i) => (f.type === 'rating' ? String(i + 1) : x.textContent) === e.key);
    b?.click(); e.preventDefault();
  }
});

// ---------------------------------------------------------------- cycle
function render() {
  if (!def) { app.innerHTML = '<main class="bf-notice"><div class="bf-card"><p>Aperçu en attente du formulaire…</p></div></main>'; return; }
  if (welcomeOn()) return renderWelcome();
  if (def.theme.layout === 'steps') renderSteps(); else renderPage();
}
function refresh(typing = false) {
  if (def.theme.layout === 'steps') {
    // Une question par écran : seule la question courante se redessine (hors frappe).
    errors = validate(def, answers, { taken: BF.taken }).errors;
    if (!typing) { const st = steps(), f = st[step]; const w = app.querySelector<HTMLElement>('.bf-step [data-f]'); if (f && w) { const c = card(f, 0, stepDone(f, step === st.length - 1)); c.classList.remove('bf-in'); w.replaceWith(c); } }
    return;
  }
  refreshPage(typing);
}
// ---------------------------------------------------------------- aperçu en direct (éditeur de Gearbox)
if (PREVIEW) {
  const allowed = BF.origins || [];
  let parentOrigin = '';
  const tell = (msg: unknown) => { if (parentOrigin) window.parent.postMessage(msg, parentOrigin); else allowed.forEach((o) => { try { window.parent.postMessage(msg, o); } catch { /* origine différente */ } }); };
  window.addEventListener('message', (e) => {
    if (!allowed.includes(e.origin) || !e.data || typeof e.data !== 'object') return;
    parentOrigin = e.origin;
    const m = e.data as { type: string; def?: BonyFormDef; screen?: string; id?: string };
    if (m.type === 'bonyform:def' && m.def) {
      const first = !def; def = m.def; applyTheme(); if (first) { prefill(); started = true; }
      if (def.theme.layout !== 'steps') step = 0;
      render();
    } else if (m.type === 'bonyform:screen') {
      if (m.screen === 'thanks') { started = true; thanks(); }
      else { started = m.screen !== 'welcome'; render(); }
    }
    else if (m.type === 'bonyform:highlight') {
      app.querySelectorAll('.pv-on').forEach((x) => x.classList.remove('pv-on'));
      if (!m.id || !def) return;
      if (def.theme.layout === 'steps') { const i = steps().findIndex((f) => f.id === m.id); if (i >= 0 && i !== step) { dir = i > step ? 1 : -1; step = i; render(); } }
      const el = app.querySelector<HTMLElement>(`[data-f="${m.id}"]`);
      if (el) { el.classList.add('pv-on'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }
  });
  // Clic sur une question de l'aperçu : la sélectionner dans l'éditeur.
  app.addEventListener('click', (e) => { const f = (e.target as HTMLElement).closest<HTMLElement>('[data-f]'); if (f) tell({ type: 'bonyform:focus', id: f.dataset.f }); }, true);
  tellParent = tell;
  tell({ type: 'bonyform:ready' });
}
if (def) applyTheme();
render();
