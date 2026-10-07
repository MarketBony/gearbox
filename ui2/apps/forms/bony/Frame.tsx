import React, { useRef, useState } from 'react';
import { Icon } from '../../ui/kit';
import { frameCss, isFramed, type Frame } from '../../../../shared/bonyform';

// =====================================================================
// Forms Bony F5 (07/10/2026) — cadrage d'une image dans son cadre imposé.
// À gauche l'image ENTIÈRE : on clique (ou glisse) le point à garder en vue ; à droite le RENDU dans le cadre du
// formulaire (même calcul que le Worker : frameCss, porte unique). Zoom centré sur le point, « remplir » / « contenir ».
// Rien n'est écrit tant que le cadrage ne change rien (isFramed) : un formulaire non retouché garde son aspect d'avant.
// =====================================================================

type Change = (f: Frame | null, soon?: boolean) => void;

/** Aperçu cadré (aussi utilisable seul, ex. vignette). */
export function Framed({ url, frame, ratio, className = '' }: { url: string; frame?: Frame | null; ratio: number; className?: string }) {
  const c = frameCss(frame);
  return (
    <div className={`bfr-box ${className}`} style={{ aspectRatio: String(ratio) }}>
      <i style={{ backgroundImage: `url("${url}")`, backgroundPosition: c.pos, backgroundSize: c.size, transform: `scale(${c.zoom})`, transformOrigin: c.pos }} />
    </div>
  );
}

export function FrameEditor({ url, frame, ratio, label, onChange, onClose }: { url: string; frame?: Frame | null; ratio: number; label?: string; onChange: Change; onClose?: () => void }) {
  const f: Frame = frame || {};
  const pick = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const emit = (n: Frame, soon = false) => onChange(isFramed(n) ? n : null, soon);
  const at = (e: React.PointerEvent, soon = false) => {
    const r = pick.current!.getBoundingClientRect();
    const x = Math.round(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)));
    const y = Math.round(Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100)));
    emit({ ...f, x, y }, soon);
  };
  const zoom = Math.round((f.zoom ?? 1) * 100);
  return (
    <div className="bfr">
      <div className="bfr-head"><b>{label || 'Cadrage'}</b>{onClose ? <button className="icon-btn sm" aria-label="Fermer" onClick={onClose}><Icon name="close" size="sm" /></button> : null}</div>
      <div className="bfr-cols">
        <div className="bfr-col">
          <span className="faint">Image entière — cliquez le point à garder</span>
          <div ref={pick} className="bfr-pick" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag(true); at(e); }}
            onPointerMove={(e) => { if (drag) at(e); }} onPointerUp={(e) => { setDrag(false); at(e, true); }}>
            <img src={url} alt="" draggable={false} />
            <span className="bfr-dot" style={{ left: `${f.x ?? 50}%`, top: `${f.y ?? 50}%` }} />
          </div>
        </div>
        <div className="bfr-col">
          <span className="faint">Rendu dans le formulaire</span>
          <Framed url={url} frame={f} ratio={ratio} />
        </div>
      </div>
      <div className="bst-chips" role="radiogroup">
        {([['cover', 'Remplir le cadre'], ['contain', 'Image entière']] as const).map(([k, l]) => (
          <button key={k} role="radio" aria-checked={(f.fit || 'cover') === k} className={(f.fit || 'cover') === k ? 'on' : ''} onClick={() => emit({ ...f, fit: k === 'cover' ? undefined : k }, true)}>{l}</button>))}
      </div>
      <label className="bfe-f"><span>Zoom : <b>{zoom} %</b></span>
        <input type="range" min={100} max={300} step={5} value={zoom} onChange={(e) => emit({ ...f, zoom: Number(e.target.value) / 100 })} /></label>
      <div className="bsh-acts"><button className="btn sm" disabled={!isFramed(frame)} onClick={() => emit({}, true)}>Réinitialiser (centré)</button></div>
    </div>
  );
}

/** Bouton « Cadrer » + panneau dépliable juste en dessous (pas de fenêtre flottante : la coque v2 est en Shadow DOM). */
export function FrameToggle({ url, frame, ratio, label, onChange }: { url: string | null; frame?: Frame | null; ratio: number; label?: string; onChange: Change }) {
  const [open, setOpen] = useState(false);
  if (!url) return null;
  return open ? <FrameEditor url={url} frame={frame} ratio={ratio} label={label} onChange={onChange} onClose={() => setOpen(false)} />
    : <button className="btn sm bfr-btn" onClick={() => setOpen(true)}><Icon name="target" size="sm" />{isFramed(frame) ? 'Cadrage modifié — ajuster' : 'Cadrer l’image'}</button>;
}

/** Rapport largeur / hauteur du cadre d'en-tête selon le style (bannière 720 × 200, plein écran, écran partagé). */
export const headerRatio = (style: string) => (style === 'hero' ? 16 / 9 : style === 'split' ? 3 / 4 : 3.6);
