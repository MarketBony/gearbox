// =====================================================================
// Bulles de discussion — PHYSIQUE (09/10/2026). Portée de la planche maquettes/ux/bulles.html, réglage
// « Apple » retenu par Théo : ressort façon SwiftUI (réponse 0,5 s, amortissement 0,82), vitesse réelle du geste
// transmise au lâcher (inertie), côté choisi par projection façon UIKit (décélération 0,99).
//
// Ce module ne connaît ni React ni le Chat : il crée un élément rond par bulle (React y rend l'avatar par
// portail), les fait glisser, les colle au bord, les range en ligne quand le volet est ouvert, et prévient
// l'hôte d'un toucher, d'une fermeture ou d'un déplacement.
// La boucle d'animation S'ENDORT dès que tout est immobile (aucun coût au repos).
// =====================================================================

export interface FieldOpts {
  size: number;
  max: number;
  /** Zone utile verticale (sous la barre du haut, au-dessus du Dock), en px de la fenêtre. */
  bounds: () => { top: number; bottom: number };
  /** Animations réduites (mode économe, « réduire les animations ») : ressorts courts, sans rebond. */
  calm: () => boolean;
  onTap: (id: string) => void;
  onDismiss: (ids: string[]) => void;
  onMoved: (side: 1 | -1, y: number) => void;
}

interface B { id: string; el: HTMLElement; x: number; y: number; vx: number; vy: number; tx: number; ty: number; sc: number; vsc: number; tsc: number; op: number; top: number }

const RESP = .5, DAMP = .82, DECEL = .99, MAGNET = 40, MARGIN = 8, GAP = 10;

function spring(o: any, k: string, target: number, resp: number, damp: number, dt: number) {
  const w = (2 * Math.PI) / resp, a = w * w * (target - o[k]) - 2 * damp * w * o['v' + k];
  o['v' + k] += a * dt; o[k] += o['v' + k] * dt;
}

export class BubbleField {
  private list: B[] = [];
  private side: 1 | -1 = 1;
  private anchorY = 140;
  private openId: string | null = null;
  private raf = 0;
  private last = 0;
  private drag: any = null;
  private x: HTMLElement;
  private alive = true;

  constructor(private layer: HTMLElement, private o: FieldOpts) {
    this.x = document.createElement('div'); this.x.className = 'gxb-x'; this.x.innerHTML = '<span>✕</span>'; layer.append(this.x);
    addEventListener('resize', this.onResize);
  }

  // ---------------------------------------------------------------- état
  ids() { return this.list.map((b) => b.id); }
  el(id: string) { return this.list.find((b) => b.id === id)?.el || null; }
  sideOf() { return this.side; }
  restore(side: 1 | -1, y: number) { this.side = side === -1 ? -1 : 1; this.anchorY = y; }
  private edgeX() { return this.side > 0 ? innerWidth - this.o.size - MARGIN : MARGIN; }
  private clampY(y: number) { const { top, bottom } = this.o.bounds(); return Math.max(top, Math.min(bottom - this.o.size, y)); }

  /** Arrivée d'un message. Nouvelle bulle : elle GLISSE depuis le bord de la pile (pas de bond). Déjà là : un
   *  battement, et elle repasse en tête de pile. Rend `true` si la bulle vient d'être créée. */
  receive(id: string): boolean {
    let b = this.list.find((x) => x.id === id), fresh = false;
    if (!b) {
      fresh = true;
      const el = document.createElement('div'); el.className = 'gxb'; el.style.setProperty('--bs', this.o.size + 'px');
      el.setAttribute('role', 'button'); el.tabIndex = 0;
      b = { id, el, x: this.side > 0 ? innerWidth + 12 : -this.o.size - 12, y: this.clampY(this.anchorY), vx: -this.side * 300, vy: 0, tx: 0, ty: 0, sc: 1, vsc: 0, tsc: 1, op: 1, top: 0 };
      const bb = b;
      el.addEventListener('pointerdown', (e) => this.down(e, bb));
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.o.onTap(bb.id); } });
      this.layer.append(el);
      this.list.unshift(b);
      if (this.list.length > this.o.max) this.drop([this.list[this.list.length - 1]], false);
    } else {
      if (!this.openId && this.list[0] !== b) this.list = [b, ...this.list.filter((x) => x !== b)];
      if (this.openId !== id) b.vsc += 2.6;   // battement
    }
    this.layout(); this.kick();
    return fresh;
  }
  remove(id: string) { const b = this.list.find((x) => x.id === id); if (b) { this.drop([b], false); this.layout(); this.kick(); } }
  setOpen(id: string | null) { this.openId = id; this.layout(); this.kick(); }

  /** Rectangle du volet : sous la ligne de bulles, collé au bord de la pile. */
  panelRect() {
    const { top, bottom } = this.o.bounds(), w = Math.min(390, innerWidth - 2 * MARGIN), y = top + 4 + this.o.size + 12;
    return { left: this.side > 0 ? innerWidth - MARGIN - w : MARGIN, top: y, width: w, height: Math.max(260, Math.min(620, bottom - y - 8)), side: this.side };
  }

  destroy() {
    this.alive = false; cancelAnimationFrame(this.raf); removeEventListener('resize', this.onResize);
    this.list.forEach((b) => b.el.remove()); this.list = []; this.x.remove();
  }

  // ---------------------------------------------------------------- disposition (cibles des ressorts)
  private layout() {
    const s = this.o.size;
    if (this.openId) {   // en ligne en haut, côté de la pile ; la conversation ouverte bien visible, les autres en retrait
      const n = this.list.length, top = this.o.bounds().top + 4;
      const right = this.side > 0 ? innerWidth - MARGIN : MARGIN + n * (s + GAP) - GAP;
      this.list.forEach((b, i) => { b.tx = right - (n - i) * (s + GAP) + GAP; b.ty = top; b.tsc = b.id === this.openId ? 1 : .9; });
    } else {             // pile collée au bord : la tête devant, les autres juste derrière, un peu plus bas et plus petites
      const y = this.clampY(this.anchorY);
      this.list.forEach((b, i) => { b.tx = this.edgeX(); b.ty = y + i * 5; b.tsc = 1 - i * .04; });
    }
    this.list.forEach((b, i) => { b.el.style.zIndex = String(10 + this.list.length - i); b.el.classList.toggle('sel', b.id === this.openId); b.el.classList.toggle('dim', !!this.openId && b.id !== this.openId); });
  }
  private onResize = () => { this.layout(); this.kick(); };

  // ---------------------------------------------------------------- boucle (s'endort au repos)
  private kick() { if (!this.raf && this.alive) { this.last = performance.now(); this.raf = requestAnimationFrame(this.tick); } }
  private tick = (now: number) => {
    this.raf = 0;
    const calm = this.o.calm(), resp = calm ? .22 : RESP, damp = calm ? 1 : DAMP;
    let left = Math.min(.05, (now - this.last) / 1000); this.last = now;
    const d = this.drag;
    while (left > 1e-6) {
      const dt = Math.min(1 / 240, left); left -= dt;
      this.list.forEach((b, i) => {
        spring(b, 'sc', b.tsc * (d && d.b === b ? (d.moved ? 1.06 : .92) : 1), .32, calm ? 1 : .62, dt);
        if (d && d.b === b) {
          // Sous le pointeur : suit à l'identique ; aimantée par la cible ✕ : glisse vers elle, sans rebond.
          if (d.hot) { spring(b, 'x', d.hx, .18, 1, dt); spring(b, 'y', d.hy, .18, 1, dt); } else { b.x = d.px; b.y = d.py; b.vx = b.vy = 0; }
          return;
        }
        let tx = b.tx, ty = b.ty;
        if (d && d.stack && i > 0) { const prev = this.list[i - 1]; tx = prev.x; ty = prev.y + 5; }   // la pile suit en chaîne
        const r = d && d.stack && i > 0 ? resp * .55 : resp;
        spring(b, 'x', tx, r, damp, dt); spring(b, 'y', ty, r, damp, dt);
      });
    }
    let moving = !!d;
    for (const b of this.list) {
      b.el.style.transform = `translate3d(${b.x}px, ${b.y}px, 0) scale(${b.sc})`;
      if (Math.abs(b.tx - b.x) > .2 || Math.abs(b.ty - b.y) > .2 || Math.abs(b.vx) + Math.abs(b.vy) > 1 || Math.abs(b.vsc) > .01 || Math.abs(b.sc - b.tsc) > .002) moving = true;
    }
    if (moving) { this.raf = requestAnimationFrame(this.tick); }
    else this.list.forEach((b) => { b.x = b.tx; b.y = b.ty; b.sc = b.tsc; b.el.style.transform = `translate3d(${b.x}px, ${b.y}px, 0) scale(${b.sc})`; });
  };

  // ---------------------------------------------------------------- glisser
  private xCenter() { const r = this.x.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }
  private down(e: PointerEvent, b: B) {
    if (e.button !== 0) return;
    e.preventDefault(); b.el.setPointerCapture(e.pointerId);
    if (!this.openId && b !== this.list[0]) this.list = [b, ...this.list.filter((x) => x !== b)];   // saisir une bulle de la pile = la tête
    this.drag = { b, stack: !this.openId, sx: e.clientX, sy: e.clientY, ox: e.clientX - b.x, oy: e.clientY - b.y, px: b.x, py: b.y, moved: false, hot: false, hx: 0, hy: 0, hist: [[e.clientX, e.clientY, e.timeStamp]] };
    b.el.classList.add('drag');
    const move = (ev: PointerEvent) => this.move(ev), up = (ev: PointerEvent) => { b.el.removeEventListener('pointermove', move); b.el.removeEventListener('pointerup', up); b.el.removeEventListener('pointercancel', up); this.up(ev); };
    b.el.addEventListener('pointermove', move); b.el.addEventListener('pointerup', up); b.el.addEventListener('pointercancel', up);
    this.kick();
  }
  private move(e: PointerEvent) {
    const d = this.drag; if (!d) return;
    // Événements fusionnés : toutes les positions réelles du pointeur, pour une vitesse juste.
    for (const ev of ((e as any).getCoalescedEvents?.() || [e]) as PointerEvent[]) d.hist.push([ev.clientX, ev.clientY, ev.timeStamp]);
    while (d.hist.length > 2 && e.timeStamp - d.hist[0][2] > 90) d.hist.shift();
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 4) { d.moved = true; this.x.classList.add('on'); }
    d.px = e.clientX - d.ox; d.py = e.clientY - d.oy;
    if (d.moved) {
      const [cx, cy] = this.xCenter(), hot = Math.hypot(e.clientX - cx, e.clientY - cy) < MAGNET + this.o.size / 2;
      if (hot !== d.hot) { d.hot = hot; this.x.classList.toggle('hot', hot); if (!hot) { d.b.vx = d.b.vy = 0; } }
      d.hx = cx - this.o.size / 2; d.hy = cy - this.o.size / 2;
    }
    this.kick();
  }
  private up(e: PointerEvent) {
    const d = this.drag; if (!d) return; this.drag = null;
    d.b.el.classList.remove('drag'); this.x.classList.remove('on', 'hot');
    if (!d.moved) { this.layout(); this.kick(); this.o.onTap(d.b.id); return; }
    if (d.hot) { const ids = (d.stack ? [...this.list] : [d.b]); this.drop(ids, true); this.layout(); this.kick(); this.o.onDismiss(ids.map((b) => b.id)); return; }
    // Vitesse réelle du geste (px/s) sur les ~90 dernières ms, transmise telle quelle au ressort : c'est l'inertie.
    const h = d.hist, a = h[0], z = h[h.length - 1], t = Math.max(.008, (z[2] - a[2]) / 1000);
    const vx = (z[0] - a[0]) / t, vy = (z[1] - a[1]) / t;
    d.b.vx = vx; d.b.vy = vy;
    if (!this.openId) {
      // Projection façon UIKit : où la bulle s'arrêterait si on la laissait glisser.
      const k = DECEL / (1 - DECEL) / 1000;
      this.side = d.b.x + this.o.size / 2 + vx * k > innerWidth / 2 ? 1 : -1;
      this.anchorY = this.clampY(d.b.y + vy * k);
      this.o.onMoved(this.side, this.anchorY);
    }
    this.layout(); this.kick();
  }
  private drop(bs: B[], animate: boolean) {
    bs.forEach((b) => {
      const el = b.el;
      if (animate) el.animate([{ opacity: 1 }, { opacity: 0, transform: el.style.transform + ' scale(.25)' }], { duration: 200, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }).onfinish = () => el.remove();
      else el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }).onfinish = () => el.remove();
    });
    this.list = this.list.filter((b) => !bs.includes(b));
  }
}
