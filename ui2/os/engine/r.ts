// @ts-nocheck — rendus partagés de la maquette (maquettes/v2/js/data.js, fin du fichier), repris TELS QUELS.
// Seule adaptation : ils lisent l'adaptateur de vraies données (GX.data) au lieu des tableaux fictifs.
export function install(): void {
const GX = (window as any).GX; // lu au démarrage (le noyau l'a créé), pas à l'import
  /* Petits rendus partagés, pour que toutes les apps disent la même chose de la même façon */
  GX.r = {
    /* [GEARBOX] PORTE UNIQUE des avatars du moteur : la photo si la personne en a une (data.ts `photoOf`),
       sinon les initiales sur sa couleur. o.s = taille en px (--s), o.pres = pastille « en ligne », o.tip = false
       pour taire l'infobulle. Avant le 01/10/2026 : initiales en dur, aucune photo dans la v2. */
    av: (uid, cls = '', o = {}) => {
      const u = GX.data.user(uid), st = `--c:${u.color}${o.s ? `;--s:${o.s}px` : ''}${u.photo ? `;background:${GX.esc(GX.data.avBg(u.photo))}` : ''}`;
      return `<span class="av ${cls}" style="${st}"${o.tip === false ? '' : ` data-tip="${GX.esc(u.name)}"`}>${u.photo ? '' : u.initials}${o.pres && u.online ? '<i class="pres"></i>' : ''}</span>`;
    },
    /* Pastilles de présence (Dock, pilule, grille) : 2 avatars max puis « +N » ; infobulle = tous les noms. */
    presStack: (uids, max = 2) => {
      if (!uids?.length) return '';
      const names = uids.map((id) => GX.data.user(id).name).join(', ');
      const more = uids.length > max ? `<span class="gx-pres-more">+${uids.length - max}</span>` : '';
      return `<span class="gx-pres" data-tip="${GX.esc(names)}">${uids.slice(0, max).map((id) => GX.r.av(id, '', { tip: false })).join('')}${more}</span>`;
    },
    /* Empreinte d'une pile : ids ET rendu (initiales, photo). La présence arrive souvent AVANT la liste des
       utilisateurs : une pile dessinée trop tôt (« ? », Ancien membre) doit être redessinée quand ils arrivent. */
    presKey: (uids) => (uids || []).map((id) => { const u = GX.data.user(id); return `${id}:${u.initials}:${u.photo || ''}:${u.color}`; }).join(','),
    brandDots: (brands) => brands.map((b) => `<i class="brand-dot" style="--c:${GX.data.brand(b)?.hex}" data-tip="${b}"></i>`).join(''),
    /* Étiquettes de marque PLEINES comme dans Gearbox (lisibilité) : texte foncé sur Renault */
    brandChips: (brands) => brands.map((b) => `<span class="badge brand" style="--c:${GX.data.brand(b)?.hex};${b === 'Renault' ? 'color:#1b1604' : ''}">${b}</span>`).join(' '),
    pStatus: (s) => `<span class="badge" style="--c:${GX.data.PROJECT_STATUS[s].c}"><i class="dot"></i>${GX.data.PROJECT_STATUS[s].l}</span>`,
    tStatus: (s) => `<span class="badge" style="--c:${GX.data.TASK_STATUS[s].c}">${GX.data.TASK_STATUS[s].l}</span>`,
    sStatus: (id) => { const s = GX.data.socialStatus(id); return `<span class="badge ${s.solid ? 'solid' : ''}" style="--c:${s.c};${s.strike ? 'text-decoration:line-through;--c:var(--text-3)' : ''}">${id}</span>`; },
    service: (s) => `<span class="badge svc" style="--c:${GX.data.SERVICE_COLOR[s] === '#293f74' ? '#5b7fd6' : GX.data.SERVICE_COLOR[s] || '#8a8599'}">${s}</span>`,
    proPlus: () => `<span class="badge solid" style="--c:var(--bony-violet)">PRO+</span>`,
    net: (id, s = 'sm') => { const n = GX.data.network(id); return n ? `<span style="color:${n.c}" data-tip="${n.id}">${GX.icon(n.icon, s)}</span>` : ''; },
  };
}
