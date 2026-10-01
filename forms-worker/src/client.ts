// =====================================================================
// FORMS BONY — client du formulaire (navigateur du répondant), 01/10/2026.
// Compilé par esbuild (`npm run build:client`) puis INCLUS dans la page par le Worker.
// Même format et même validation que le serveur (shared/bonyform.ts) : un message d'erreur affiché
// ici est exactement celui que renverrait le serveur.
// Deux présentations : « page » (tout le formulaire) et « steps » (une question par écran).
// =====================================================================
import { validate, visibleFields, calcValue, type BonyFormDef, type Field, type Answers, type Value } from '../../shared/bonyform';

declare const turnstile: { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void } | undefined;
const BF = (window as any).__BF as { publicId: string; def: BonyFormDef; siteKey: string; taken: Record<string, Record<string, number>> };
const def = BF.def;
const app = document.getElementById('app')!;
const t0 = Date.now();
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- état
const answers: Answers = {};
const touched = new Set<string>();
let errors: Record<string, string> = {};
const params: Record<string, string> = {};
new URLSearchParams(location.search).forEach((v, k) => { params[k] = v; });
// Préremplissage depuis le lien de l'e-mailing (?email=…&concession=…).
def.fields.forEach((f) => {
  const p = f.param && params[f.param];
  if (!p) return;
  if (f.type === 'multi') answers[f.id] = p.split(',').map((x) => optId(f, x.trim())).filter(Boolean) as string[];
  else if (f.options) answers[f.id] = optId(f, p);
  else answers[f.id] = p;
});
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
      const wrap = h('div', { class: 'bf-opts', role: multi ? 'group' : 'radiogroup', 'aria-label': f.label });
      (f.options || []).forEach((o) => {
        const full = f.type === 'slot' && o.capacity !== undefined && (BF.taken[f.id]?.[o.id] || 0) >= o.capacity;
        const left = f.type === 'slot' && o.capacity !== undefined ? o.capacity - (BF.taken[f.id]?.[o.id] || 0) : null;
        const on = list.includes(o.id);
        wrap.append(h('label', { class: `bf-opt ${multi ? 'sq' : ''} ${on ? 'on' : ''}`, style: full ? 'opacity:.45;cursor:not-allowed' : null },
          h('input', { type: multi ? 'checkbox' : 'radio', name: f.id, checked: on, disabled: full || locked(f),
            onchange: () => { if (multi) set(on ? list.filter((x) => x !== o.id) : [...list.filter((x) => x !== o.id), o.id]); else set(o.id, true); } }),
          h('span', { class: 'bf-mk' }), h('span', { style: 'flex:1' }, o.label),
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
    default:
      return h('div', {}, '');
  }
}

/** Carte d'une question (intitulé, aide, contrôle, erreur). */
function card(f: Field, i: number, onDone?: () => void): HTMLElement {
  if (f.type === 'section') return h('div', { class: 'bf-sec bf-in', style: `--i:${i}`, 'data-f': f.id }, h('h2', {}, f.label), f.help ? h('p', { class: 'bf-help' }, f.help) : null);
  if (f.type === 'statement') return h('div', { class: 'bf-card bf-q bf-in', style: `--i:${i}`, 'data-f': f.id }, f.label ? h('label', { class: 'bf-l' }, f.label) : null, f.help ? h('div', { class: 'bf-stmt' }, f.help) : null);
  const err = touched.has(f.id) ? errors[f.id] : undefined;
  return h('div', { class: `bf-card bf-q bf-in ${err ? 'bad' : ''}`, style: `--i:${i}`, 'data-f': f.id },
    f.type === 'consent' ? null : h('label', { class: 'bf-l' }, f.label, f.required ? h('span', { class: 'bf-req', 'aria-hidden': 'true' }, '*') : null),
    f.help ? h('p', { class: 'bf-help' }, f.help) : null,
    control(f, onDone),
    err ? h('div', { class: 'bf-err', role: 'alert' }, '⚠ ', err) : null);
}

// ---------------------------------------------------------------- en-tête
function header(): HTMLElement {
  const t = def.theme, tpl = document.getElementById('bony-logo') as HTMLTemplateElement | null;
  const logo = t.logo === 'bony' && tpl ? h('div', { class: 'bf-logo', html: tpl.innerHTML }) : t.logo ? h('div', { class: 'bf-logo', style: 'font-weight:800;letter-spacing:.14em;text-transform:uppercase;font-size:18px' }, t.logo) : null;
  return h('div', { class: 'bf-card bf-head bf-in' },
    t.headerImage ? h('div', { class: 'bf-hero', style: `background-image:url("${encodeURI(t.headerImage)}")` }) : h('div', { class: 'bf-band' }),
    h('div', { class: 'bf-hin' }, logo, h('h1', {}, def.title), def.description ? h('p', { class: 'bf-desc' }, def.description) : null));
}

// ---------------------------------------------------------------- captcha + envoi
let tsToken = '', tsId: string | undefined;
function captcha(box: HTMLElement) {
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
  if (!tsToken) { gerr.textContent = 'Vérification anti-robot en cours… réessayez dans un instant.'; return; }
  sending = true; btn.disabled = true; btn.innerHTML = '<span class="bf-spin"></span>Envoi…'; gerr.textContent = '';
  try {
    const r = await fetch(location.pathname, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers, params, t0, token: tsToken, hp: (document.getElementById('bf-hp') as HTMLInputElement)?.value || '' }) });
    const j: any = await r.json().catch(() => ({}));
    if (r.ok) return thanks();
    if (j.errors) { errors = j.errors; Object.keys(errors).forEach((k) => touched.add(k)); render(); focusFirstError(); }
    gerr.textContent = j.error || 'L’envoi a échoué, réessayez.';
    if (j.captcha && tsId && typeof turnstile !== 'undefined') { tsToken = ''; turnstile.reset(tsId); }
    if (j.closed) setTimeout(() => location.reload(), 2500);
  } catch { gerr.textContent = 'Connexion impossible : vérifiez votre réseau et réessayez.'; }
  sending = false; btn.disabled = false; btn.textContent = 'Envoyer';
}
function focusFirstError() {
  const id = Object.keys(errors).find((k) => visibleFields(def, answers).some((f) => f.id === k)); if (!id) return;
  if (def.theme.layout === 'steps') { const i = steps().findIndex((f) => f.id === id); if (i >= 0) { step = i; render(); } }
  const el = app.querySelector<HTMLElement>(`[data-f="${id}"]`);
  el?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  el?.classList.remove('shake'); void el?.offsetWidth; el?.classList.add('shake');
}
function thanks() {
  const s = def.settings.thankYou;
  app.innerHTML = '';
  app.append(h('div', { class: 'bf-wrap' }, h('div', { class: 'bf-card bf-thanks bf-in' },
    h('div', { class: 'bf-check', html: '<svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="40"/><path d="M25 43 l12 12 l22 -24"/></svg>' }),
    h('h1', {}, s.title || 'Merci !'), h('p', { class: 'bf-desc' }, s.message || ''))));
  confetti();
  window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  if (s.redirectUrl && /^https?:\/\//.test(s.redirectUrl)) setTimeout(() => { location.href = s.redirectUrl!; }, 2600);
}
function confetti() {
  if (reduced) return;
  const box = h('div', { class: 'bf-conf' }), cols = [def.theme.primary, '#ffd166', '#06d6a0', '#118ab2', '#ef476f'];
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
  def.fields.forEach((f) => { if (f.type === 'hidden') return; sigs.set(f.id, sigOf(f)); const c = card(f, i++); list.append(h('div', { class: `bf-fold ${vis.has(f.id) ? '' : 'off'}`, 'data-w': f.id }, h('div', {}, c))); });
  const gerr = h('div', { class: 'bf-gerr', role: 'alert' });
  const btn = h('button', { class: 'bf-btn', type: 'button', onclick: () => send(btn, gerr) }, 'Envoyer') as HTMLButtonElement;
  const ts = h('div', { class: 'bf-ts' });
  app.innerHTML = '';
  app.append(h('main', { class: 'bf-wrap' }, header(), list, ts, h('input', { id: 'bf-hp', class: 'bf-hp', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' }),
    h('div', { class: 'bf-act' }, btn, gerr), h('div', { class: 'bf-foot' }, 'Formulaire Bony Automobiles')));
  captcha(ts);
}
/** Mise à jour sans tout reconstruire : visibilité (repli animé), erreurs, champs calculés. */
function refreshPage(typing: boolean) {
  const vis = new Set(visibleFields(def, answers).map((f) => f.id));
  errors = validate(def, answers, { taken: BF.taken }).errors;
  def.fields.forEach((f) => {
    const w = app.querySelector<HTMLElement>(`[data-w="${f.id}"]`); if (!w) return;
    w.classList.toggle('off', !vis.has(f.id));
    if (typing && document.activeElement && w.contains(document.activeElement)) return;   // ne pas casser la saisie en cours
    const sg = sigOf(f);
    if (sg !== sigs.get(f.id)) { sigs.set(f.id, sg); const fresh = card(f, 0); fresh.classList.remove('bf-in'); w.firstElementChild!.replaceChildren(fresh); }
  });
}

// ---------------------------------------------------------------- rendu « une question par écran »
let step = 0, dir = 1;
const steps = () => visibleFields(def, answers).filter((f) => f.type !== 'hidden' && f.type !== 'section');
const sectionOf = (f: Field) => { let s: Field | null = null; for (const x of def.fields) { if (x.type === 'section') s = x; if (x.id === f.id) break; } return s; };
function next() {
  const st = steps(), f = st[step]; if (!f) return;
  touched.add(f.id); errors = validate(def, answers, { taken: BF.taken }).errors;
  if (errors[f.id]) { render(); focusFirstError(); return; }
  if (step < st.length - 1) { dir = 1; step++; render(); }
}
/** Passage automatique à la question suivante après un choix (comme Typeform) ; Entrée pour les saisies. */
const AUTO = ['choice', 'scale', 'nps', 'rating', 'dropdown', 'concession', 'brand', 'slot'];
const stepDone = (f: Field, last: boolean) => (AUTO.includes(f.type) ? () => { if (!last) next(); } : next);
function renderSteps() {
  const st = steps(); step = Math.min(step, Math.max(0, st.length - 1));
  const f = st[step], last = step === st.length - 1, sec = f ? sectionOf(f) : null;
  const gerr = h('div', { class: 'bf-gerr', role: 'alert' });
  const btn = h('button', { class: 'bf-btn', type: 'button', onclick: () => (last ? send(btn, gerr) : next()) }, last ? 'Envoyer' : 'Suivant ↵') as HTMLButtonElement;
  const back = step > 0 ? h('button', { class: 'bf-btn ghost', type: 'button', onclick: () => { dir = -1; step--; render(); } }, '← Précédent') : null;
  const ts = h('div', { class: 'bf-ts' });
  app.innerHTML = '';
  app.append(h('div', { class: 'bf-prog' }, h('i', { style: `transform:scaleX(${st.length ? (step + (last ? 1 : 0)) / st.length : 0})` })),
    h('main', { class: 'bf-wrap' }, step === 0 ? header() : null,
      h('div', { class: `bf-step ${dir > 0 ? 'bf-slide-in' : 'bf-slide-back'}` },
        h('div', { class: 'bf-stepnav' }, `${step + 1} / ${st.length}${sec ? ` · ${sec.label}` : ''}`),
        f ? card(f, 0, stepDone(f, last)) : null,
        last ? ts : null, h('input', { id: 'bf-hp', class: 'bf-hp', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' }),
        h('div', { class: 'bf-act' }, back, btn, gerr))));
  if (last) captcha(ts);
  const inp = app.querySelector<HTMLElement>('.bf-step input.bf-t, .bf-step textarea, .bf-step select');
  if (inp && !reduced) setTimeout(() => inp.focus({ preventScroll: true }), 120);
}

// ---------------------------------------------------------------- cycle
function render() { if (def.theme.layout === 'steps') renderSteps(); else renderPage(); }
function refresh(typing = false) {
  if (def.theme.layout === 'steps') {
    // Une question par écran : seule la question courante se redessine (hors frappe).
    errors = validate(def, answers, { taken: BF.taken }).errors;
    if (!typing) { const st = steps(), f = st[step]; const w = app.querySelector<HTMLElement>('.bf-step [data-f]'); if (f && w) { const c = card(f, 0, stepDone(f, step === st.length - 1)); c.classList.remove('bf-in'); w.replaceWith(c); } }
    return;
  }
  refreshPage(typing);
}
render();
