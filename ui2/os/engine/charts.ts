// @ts-nocheck — moteur de la maquette CONVERTI (maquettes/v2/js/charts.js), comportement identique.
// Typage fin : second temps, fichier par fichier, une fois le rendu validé identique à la maquette.
// Substitutions mécaniques : scripts/ui2-convert-engine.mjs. Retouches manuelles : balises [GEARBOX].
export function install(): void {
const GX = (window as any).GX; // lu au démarrage (le noyau l'a créé), pas à l'import
/* =====================================================================
   GEARBOX OS — graphiques partagés (SVG, animés, info-bulles data-tip).
   Un seul module pour Dashboard, Budget, Campagnes… au lieu d'un par écran.
   ===================================================================== */
(() => {
  const C = (GX.chart = {});
  let gid = 0;
  const nice = (m) => { if (m <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(m))); const n = m / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };

  /* Barres groupées + courbe optionnelle.
     Le SVG s'étire en largeur (preserveAspectRatio none) : AUCUN texte dedans,
     sinon il serait écrasé. Les libellés d'axes sont en HTML, à taille fixe. */
  C.bars = ({ labels, series, line = null, height = 190, fmt = GX.fmt.eurK, stacked = false }) => {
    const id = 'g' + ++gid, n = labels.length, W = n * 100, ih = 100;
    const totals = labels.map((_, i) => stacked ? series.reduce((s, se) => s + (se.values[i] || 0), 0) : Math.max(...series.map((se) => se.values[i] || 0)));
    const max = nice(Math.max(1, ...totals, ...(line ? line.values : [])));
    const bw = 100, gw = bw * .62, sw = stacked ? gw : gw / series.length;
    const y = (v) => ih - (v / max) * ih;
    const grid = [.25, .5, .75, 1].map((k) => `<line x1="0" x2="${W}" y1="${y(max * k)}" y2="${y(max * k)}" stroke="var(--line)" vector-effect="non-scaling-stroke" />`).join('');
    let bars = '';
    labels.forEach((l, i) => {
      let acc = 0;
      const tipLine = line ? ` · ${line.name} : ${fmt(line.values[i] || 0)}` : '';
      series.forEach((se, k) => {
        const v = se.values[i] || 0; if (!v) return;
        const x = i * bw + (bw - gw) / 2 + (stacked ? 0 : k * sw), h = (v / max) * ih, yy = stacked ? y(acc + v) : y(v); acc += v;
        bars += `<rect x="${x.toFixed(1)}" y="${yy.toFixed(2)}" width="${Math.max(2, sw - 3).toFixed(1)}" height="${h.toFixed(2)}" rx="4" fill="${se.color || `url(#${id}grad)`}" data-tip="${GX.esc(se.name)} · ${GX.esc(l)} : ${GX.esc(fmt(v))}${GX.esc(tipLine)}" style="transform-origin:0 ${ih}px;animation:ch-rise var(--t-slow) var(--spring-soft) both;animation-delay:${i * 25 + k * 40}ms" />`;
      });
    });
    const path = line ? line.values.map((v, i) => `${i ? 'L' : 'M'}${(i * bw + bw / 2).toFixed(1)},${y(v).toFixed(2)}`).join(' ') : '';
    const yl = [0, .5, 1].map((k) => `<span style="position:absolute;right:0;top:${(1 - k) * 100}%;transform:translateY(-50%);font-size:10px;color:var(--text-3);white-space:nowrap">${GX.esc(fmt(max * k))}</span>`).join('');
    return `<div class="gxc" style="display:grid;grid-template-columns:auto 1fr;grid-template-rows:${height - 18}px 18px;column-gap:8px">
      <div style="position:relative;min-width:34px">${yl}</div>
      <svg viewBox="0 0 ${W} ${ih}" preserveAspectRatio="none" style="width:100%;height:100%;overflow:visible;display:block">
        <defs><linearGradient id="${id}grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f75632"/><stop offset="1" stop-color="#8f12ab"/></linearGradient></defs>
        ${grid}<line x1="0" x2="${W}" y1="${ih}" y2="${ih}" stroke="var(--line-2)" vector-effect="non-scaling-stroke" />${bars}
        ${line ? `<path d="${path}" fill="none" stroke="${line.color || 'var(--text-2)'}" stroke-width="2" stroke-dasharray="5 4" vector-effect="non-scaling-stroke" style="animation:ch-fade 700ms var(--ease-out) both" />` : ''}</svg>
      <span></span><div style="display:flex">${labels.map((l) => `<span style="flex:1;text-align:center;font-size:10px;color:var(--text-3);padding-top:4px;white-space:nowrap;overflow:hidden">${GX.esc(l)}</span>`).join('')}</div></div>`;
  };

  /* Anneau */
  C.donut = ({ parts, size = 132, thickness = 16, center = '', sub = '' }) => {
    const total = parts.reduce((s, p) => s + p.value, 0) || 1, r = (size - thickness) / 2, c = 2 * Math.PI * r;
    let off = 0;
    const arcs = parts.map((p, i) => { const len = (p.value / total) * c; const s = `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${p.color}" stroke-width="${thickness}" stroke-dasharray="${Math.max(0, len - 2)} ${c}" stroke-dashoffset="${-off}" data-tip="${GX.esc(p.label)} : ${Math.round((p.value / total) * 100)} %" style="animation:ch-arc 800ms var(--ease-out) both;animation-delay:${i * 80}ms;--c:${c}" />`; off += len; return s; }).join('');
    return `<div style="position:relative;width:${size}px;height:${size}px;flex:none"><svg width="${size}" height="${size}" style="transform:rotate(-90deg)"><circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="var(--surface-3)" stroke-width="${thickness}" />${arcs}</svg>
      <div style="position:absolute;inset:0;display:grid;place-content:center;text-align:center"><b class="num" style="font-size:18px">${center}</b><span class="faint" style="font-size:11px">${sub}</span></div></div>`;
  };
  C.legend = (parts, fmt = GX.fmt.eurK) => { const t = parts.reduce((s, p) => s + p.value, 0) || 1; return `<div style="display:grid;gap:7px;min-width:0">${parts.map((p) => `<div class="row" style="gap:8px;font-size:12px;white-space:nowrap"><i class="brand-dot" style="--c:${p.color}"></i><b style="min-width:34px">${GX.esc(p.label)}</b><span class="muted num grow ellipsis" style="text-align:right">${fmt(p.value)}</span><span class="faint num" style="width:36px;text-align:right">${Math.round((p.value / t) * 100)} %</span></div>`).join('')}</div>`; };

  /* Barres horizontales */
  C.hbars = ({ items, fmt = GX.fmt.eurK, max }) => {
    const m = max || Math.max(1, ...items.map((i) => i.value));
    return `<div style="display:grid;gap:9px">${items.map((it, i) => `<div style="display:grid;gap:4px"><div class="row" style="font-size:12px"><span class="ellipsis grow">${it.icon || ''}${GX.esc(it.label)}</span><b class="num">${fmt(it.value)}</b></div>
      <div class="bar" style="height:7px"><i style="width:${(it.value / m) * 100}%;${it.color ? `--c:${it.color};` : ''}animation-delay:${i * 50}ms"></i></div></div>`).join('')}</div>`;
  };

  /* Mini-courbe */
  C.spark = (values, { w = 90, h = 26, color = 'var(--bony-orange)' } = {}) => {
    const mx = Math.max(...values), mn = Math.min(...values), k = (h - 4) / (mx - mn || 1);
    const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - (v - mn) * k).toFixed(1)}`).join(' ');
    return `<svg width="${w}" height="${h}" style="overflow:visible"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="animation:ch-draw 900ms var(--ease-out) both" /></svg>`;
  };

  GX.css(`
  @keyframes ch-rise{from{transform:scaleY(0)}}
  @keyframes ch-draw{from{stroke-dashoffset:600;stroke-dasharray:600}}
  @keyframes ch-fade{from{opacity:0}}
  @keyframes ch-arc{from{stroke-dasharray:0 var(--c)}}
  .gxc rect:hover{filter:brightness(1.2)}
  `);
})();

}
