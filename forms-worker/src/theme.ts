// =====================================================================
// FORMS BONY — rendu d'un thème (F2a, 01/10/2026), PARTAGÉ par la page servie (index.ts) et le
// client (client.ts, qui le réapplique à chaque changement de l'aperçu en direct de Gearbox).
// Thème → variables CSS (couleurs, polices, tailles…) + attributs sur <html> (fond, en-tête, style
// des champs, des boutons, mouvement). La feuille de style (index.ts, CSS) lit ces deux sources.
// =====================================================================
import { resolveTheme, onColor, isFamily, type Theme, type FullTheme, frameCss } from '../../shared/bonyform';

// Polices servies par Bunny Fonts (miroir de Google Fonts sans traceur). Syncopate : 400 et 700 seulement.
const FONTS: Record<string, { slug: string; w: string }> = {
  'Albert Sans': { slug: 'albert-sans', w: '400,500,600,700,800' }, 'Syncopate': { slug: 'syncopate', w: '400,700' },
  'Inter': { slug: 'inter', w: '400,500,600,700,800' }, 'Poppins': { slug: 'poppins', w: '400,500,600,700,800' },
  'Montserrat': { slug: 'montserrat', w: '400,500,600,700,800' }, 'Playfair Display': { slug: 'playfair-display', w: '400,600,700,800' },
  'Space Grotesk': { slug: 'space-grotesk', w: '400,500,600,700' },
  'Red Hat Display': { slug: 'red-hat-display', w: '400,500,600,700,800' }, 'Barlow': { slug: 'barlow', w: '300,400,500,600,700,800' },
  'Chakra Petch': { slug: 'chakra-petch', w: '400,500,600,700' },
};
/** Police de marque importée (FontFile) : la famille est-elle fournie par le thème ? */
const own = (t: FullTheme, f: string | null | undefined) => !!f && t.fontFiles.some((x) => x.family === f);
export function fontsHref(t: FullTheme) {
  // Une police importée n'a rien à charger chez Bunny ; Albert Sans reste le repli de secours.
  const body = (!own(t, t.font) && FONTS[t.font]) || FONTS['Albert Sans'], head = (t.headingFont && !own(t, t.headingFont) && FONTS[t.headingFont]) || null;
  const fam = [`${body.slug}:${body.w}`, ...(head && head !== body ? [`${head.slug}:${head.w}`] : [])].join('|');
  return `https://fonts.bunny.net/css?family=${fam}&display=swap`;
}
const FONT_FMT: Record<string, string> = { woff2: 'woff2', woff: 'woff', otf: 'opentype', ttf: 'truetype' };
/** Règles @font-face des polices de marque embarquées (adresses et noms filtrés : ils partent dans du CSS). */
export function fontFaces(t: FullTheme) {
  return t.fontFiles.filter((f) => isFamily(f.family) && safeUrl(f.url)).map((f) => {
    const w = clamp(Math.round(num(f.weight, 400) / 100) * 100, 100, 900), ext = (/\.(woff2|woff|otf|ttf)(?:$|\?)/i.exec(f.url)?.[1] || '').toLowerCase();
    return `@font-face{font-family:'${f.family}';src:url("${safeUrl(f.url)}")${FONT_FMT[ext] ? ` format("${FONT_FMT[ext]}")` : ''};font-weight:${w};font-style:${f.style === 'italic' ? 'italic' : 'normal'};font-display:swap}`;
  }).join('');
}

/** Adresse d'image sûre pour un `url("…")` CSS (http(s) ou chemin du Worker /a/…), sinon vide. */
const safeUrl = (u?: string | null) => (u && (/^https?:\/\/[^\s"'()<>]+$/.test(u) || /^\/a\/[a-z0-9]+$/.test(u)) ? u : '');
const num = (x: unknown, d: number) => (x !== null && x !== '' && Number.isFinite(Number(x)) ? Number(x) : d);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** Couleur sûre (#hex ou rgb[a](…)) : tout le reste est remplacé. Elle part dans une balise <style> : une
 *  valeur libre pourrait la refermer et injecter du HTML dans la page publique. */
const safeCol = (c: unknown, d: string) => (typeof c === 'string' && (/^#[0-9a-f]{3,8}$/i.test(c) || /^rgba?\([\d.,\s%]+\)$/i.test(c)) ? c : d);

// Motifs (SVG en data URI) : couleur injectée, très faible opacité.
const svg = (s: string) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
function patternCss(kind: string, c: string) {
  switch (kind) {
    case 'dots': return `radial-gradient(${c} 1.3px, transparent 1.6px) 0 0/22px 22px`;
    case 'grid': return `linear-gradient(${c} 1px, transparent 1px) 0 0/32px 32px, linear-gradient(90deg, ${c} 1px, transparent 1px) 0 0/32px 32px`;
    case 'chevrons': return `${svg(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="24"><path d="M0 18 L20 6 L40 18" fill="none" stroke="${c}" stroke-width="2"/></svg>`)} 0 0/40px 24px`;
    case 'waves': return `${svg(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="20"><path d="M0 10 Q20 0 40 10 T80 10" fill="none" stroke="${c}" stroke-width="1.6"/></svg>`)} 0 0/80px 20px`;
  }
  return 'none';
}
const alpha = (hex: string, a: number) => { const m = /^#([0-9a-f]{6})$/i.exec(hex); if (!m) return hex; const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

export interface Rendered { vars: string; attrs: Record<string, string>; t: FullTheme }

/** Variables CSS et attributs d'un thème. */
export function renderTheme(theme: Partial<Theme> | null | undefined): Rendered {
  const t = resolveTheme(theme);
  t.primary = safeCol(t.primary, '#f75632'); t.background = safeCol(t.background, '#f6f4fa'); t.surface = safeCol(t.surface, '#ffffff'); t.text = safeCol(t.text, '#1d1a24');
  t.fontFiles = (t.fontFiles || []).filter((f) => f && isFamily(f.family) && !!safeUrl(f.url)).slice(0, 8);
  if (!FONTS[t.font] && !own(t, t.font)) t.font = 'Albert Sans';
  if (t.headingFont && !FONTS[t.headingFont] && !own(t, t.headingFont)) t.headingFont = null;
  t.logoImage = safeUrl(t.logoImage) || null;
  const b = t.bg, h = t.header, ty = t.typo;
  const cols = (b.colors && b.colors.length ? b.colors : [t.primary, t.background]).slice(0, 3).map((c) => safeCol(c, t.primary));
  let bgLayer = t.background;
  if (b.kind === 'gradient') bgLayer = `linear-gradient(${num(b.angle, 160)}deg, ${(cols.length > 1 ? cols : [cols[0], t.background]).join(', ')})`;
  const patt = b.kind === 'pattern' ? patternCss(b.pattern || 'dots', alpha(cols[0] || t.primary, 0.14)) : 'none';
  const img = b.kind === 'image' ? safeUrl(b.image) : '';
  const himg = safeUrl(h.image);
  const hf = frameCss(h.frame), bf = frameCss(b.frame);   // F5 : cadrage (valeurs bornées, sûres)
  const shadows = ['none', '0 1px 2px rgba(0,0,0,.06),0 12px 32px -18px rgba(0,0,0,.35)', '0 2px 6px rgba(0,0,0,.08),0 24px 48px -20px rgba(0,0,0,.45)', `0 0 0 1px ${alpha(t.primary, 0.35)},0 18px 50px -14px ${alpha(t.primary, 0.55)}`];
  const glass = /rgba?\(/.test(t.surface) && !/,\s*1\)$/.test(t.surface);
  const v: Record<string, string> = {
    '--p': t.primary, '--on-p': onColor(t.primary), '--bg': t.background, '--sf': t.surface, '--tx': t.text,
    '--r': `${clamp(Number(t.radius) || 0, 0, 40)}px`,
    '--font': `'${t.font}',system-ui,-apple-system,'Segoe UI',sans-serif`, '--hfont': `'${t.headingFont || t.font}','${t.font}',system-ui,sans-serif`,
    '--scale': String(clamp(num(ty.scale, 1), 0.85, 1.3)), '--hw': String(clamp(Math.round(num(ty.headingWeight, 700) / 100) * 100, 300, 900)), '--hcase': ty.headingCase === 'upper' ? 'uppercase' : ty.headingCase === 'lower' ? 'lowercase' : 'none',
    '--bcase': (() => { const c = t.buttons.case || ty.headingCase; return c === 'upper' ? 'uppercase' : c === 'lower' ? 'lowercase' : 'none'; })(),
    '--bls': `${clamp(num(t.buttons.spacing, num(ty.headingSpacing, 0) * 0.5), -0.05, 0.3)}em`,
    '--hls': `${clamp(num(ty.headingSpacing, 0), -0.05, 0.25)}em`,
    '--shadow': shadows[num(t.shadow, 1)] || shadows[1],
    '--bg-layer': bgLayer, '--bg-pattern': patt, '--bg-img': img ? `url("${img}")` : 'none', '--bg-pos': bf.pos, '--bg-size': bf.size, '--bg-zoom': bf.zoom,
    '--bg-overlay': String(clamp(num(b.overlay, 0.35), 0, 0.92)), '--bg-blur': `${clamp(num(b.blur, 0), 0, 24)}px`,
    '--c1': cols[0] || t.primary, '--c2': cols[1] || t.primary, '--c3': cols[2] || cols[0] || t.primary,
    '--h-img': himg ? `url("${himg}")` : 'none', '--h-pos': hf.pos, '--h-size': hf.size, '--h-zoom': hf.zoom,
    '--logo-h': `${clamp(num(t.logoSize, 30), 18, 90)}px`, '--h-overlay': String(clamp(num(h.overlay, 0.45), 0, 0.92)),
    '--grad': `linear-gradient(120deg, ${t.primary}, ${cols[1] && cols[1] !== t.primary ? cols[1] : `color-mix(in srgb, ${t.primary} 55%, #ff3d8b)`})`,
  };
  const vars = Object.entries(v).map(([k, x]) => `${k}:${x}`).join(';');
  const attrs: Record<string, string> = {
    'data-bg': b.kind, 'data-anim': b.kind === 'animated' ? b.animation || 'aurora' : '', 'data-header': (h.style === 'banner' || h.style === 'hero' || h.style === 'split') && !himg ? 'band' : h.style,
    'data-logo': h.logoAlign || 'left', 'data-fields': t.fields, 'data-inputs': t.inputs, 'data-btn': t.buttons.style,
    'data-motion': t.motion.level, 'data-enter': t.motion.entrance, 'data-glass': glass ? '1' : '', 'data-layout': t.layout, 'data-rq': t.bonyFooter ? '1' : '',
  };
  return { vars, attrs, t };
}
