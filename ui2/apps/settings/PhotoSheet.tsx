import React, { useRef, useState } from 'react';
import { db, ApiError } from '../../../services/dataService';
import { avatarKey } from '../../../components/Avatar';
import { Icon } from '../ui/kit';
import { photoOf } from './common';

// =====================================================================
// Photo de profil — `AvatarUploadModal` de pages/Settings.tsx, au balisage de la maquette
// (`photoSheet` : .set-drop, .set-crop, .set-zoom). Même règles : jpg/png/gif/webp, 5 Mo max,
// recadrage rond 1:1, zoom 1 → 3 (pas 0,05), sortie 200 × 200 JPEG 0,88, dépôt
// `db.uploadFile('avatar')` (POST /api/uploads/avatar), puis `onSave(url)` fourni par l'appelant
// (profil propre : PUT /me ; autre compte : PUT /users/:id).
// Le recadrage est fait ici (glisser pour cadrer) : `react-easy-crop` rendrait un autre balisage.
// =====================================================================

const TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const C = 200;   // diamètre du cercle de recadrage (= sortie 200 × 200)

export function PhotoSheet({ target, onSave, close }: {
  target: { id: string; name: string; avatarUrl?: string | null };
  onSave: (url: string | null) => Promise<void>;
  close: (v?: unknown) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [img, setImg] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [err, setErr] = useState('');
  const [over, setOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasPhoto = !!photoOf(target);

  const scale = img ? (C / Math.min(img.w, img.h)) * zoom : 1;
  const W = img ? img.w * scale : C, H = img ? img.h * scale : C;
  const clamp = (p: { x: number; y: number }, w = W, h = H) => ({ x: Math.min(0, Math.max(C - w, p.x)), y: Math.min(0, Math.max(C - h, p.y)) });

  const take = (f?: File | null) => {
    if (!f) return;
    if (!TYPES.includes(f.type)) { setErr('Format non supporté. Utilisez jpg, png, gif ou webp.'); return; }
    if (f.size > 5 * 1024 * 1024) { setErr('Fichier trop lourd (max 5 Mo).'); return; }
    setErr('');
    const rd = new FileReader();
    rd.onload = () => {
      const url = rd.result as string, im = new Image();
      im.onload = () => { const s = C / Math.min(im.width, im.height); setImg({ w: im.width, h: im.height }); setZoom(1); setPos({ x: (C - im.width * s) / 2, y: (C - im.height * s) / 2 }); setSrc(url); };
      im.src = url;
    };
    rd.readAsDataURL(f);
  };

  // Zoom autour du centre du cercle.
  const onZoom = (z: number) => {
    if (!img) return setZoom(z);
    const s0 = scale, s1 = (C / Math.min(img.w, img.h)) * z;
    const cx = (C / 2 - pos.x) / s0, cy = (C / 2 - pos.y) / s0;
    setZoom(z); setPos(clamp({ x: C / 2 - cx * s1, y: C / 2 - cy * s1 }, img.w * s1, img.h * s1));
  };
  const drag = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget, sx = e.clientX, sy = e.clientY, p0 = pos;
    el.setPointerCapture(e.pointerId); el.style.cursor = 'grabbing';
    const mv = (ev: PointerEvent) => setPos(clamp({ x: p0.x + ev.clientX - sx, y: p0.y + ev.clientY - sy }));
    const up = () => { el.removeEventListener('pointermove', mv); el.style.cursor = ''; };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up, { once: true }); el.addEventListener('pointercancel', up, { once: true });
  };

  const validate = async () => {
    if (!src || !img || saving) return;
    setSaving(true);
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        const im = new Image();
        im.onload = () => {
          const cv = document.createElement('canvas'); cv.width = cv.height = C;
          const ctx = cv.getContext('2d'); if (!ctx) return reject(new Error('No canvas context'));
          ctx.beginPath(); ctx.arc(C / 2, C / 2, C / 2, 0, Math.PI * 2); ctx.clip();
          ctx.drawImage(im, -pos.x / scale, -pos.y / scale, C / scale, C / scale, 0, 0, C, C);
          cv.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', 0.88);
        };
        im.onerror = reject; im.src = src;
      });
      const url = await db.uploadFile('avatar', new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
      await onSave(url);
      try { localStorage.removeItem(avatarKey(target.id)); } catch { /* purge d'une photo base64 legacy */ }
      close('ok');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Erreur lors de l\'enregistrement. Réessayez.');
      setSaving(false);
    }
  };
  const remove = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(null);
      try { localStorage.removeItem(avatarKey(target.id)); } catch { /* purge legacy locale */ }
      close('rm');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Échec de la suppression.');
      setSaving(false);
    }
  };
  return (
    <>
      <h3>Photo de profil</h3><div className="muted">{target.name}</div>
      {!src
        ? <div className={`set-drop ${over ? 'over' : ''}`} tabIndex={0} onClick={() => fileRef.current?.click()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files[0]); }}>
            <Icon name="upload" /><b>Glisser une photo ici</b><span className="muted" style={{ fontSize: 12.5 }}>ou cliquer pour parcourir</span><span className="faint" style={{ fontSize: 11.5 }}>jpg, png, gif, webp — max 5 Mo</span>
          </div>
        : <>
            <div className="set-crop"><div className="c" onPointerDown={drag} style={{ backgroundImage: `url('${src}')`, backgroundSize: `${W}px ${H}px`, backgroundPosition: `${pos.x}px ${pos.y}px`, touchAction: 'none' }} /></div>
            <div className="set-zoom"><Icon name="search" size="sm" /><input type="range" min={1} max={3} step={0.05} value={zoom} aria-label="Zoom" onChange={(e) => onZoom(+e.target.value)} /></div>
            <button className="set-link" style={{ marginTop: 8 }} onClick={() => { setSrc(null); setImg(null); }}>Choisir une autre photo</button>
          </>}
      <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/gif,image/webp" onChange={(e) => { take(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="set-err" style={{ marginTop: 8 }}>{err}</div>
      <div className="foot">
        {src ? <button className="btn primary" disabled={saving} onClick={validate}><Icon name="check" size="sm" />Valider</button> : null}
        {hasPhoto ? <button className="btn danger" disabled={saving} onClick={remove}><Icon name="trash" size="sm" />Supprimer la photo</button> : null}
        {!src && !hasPhoto ? <button className="btn" onClick={() => close()}>Annuler</button> : null}
      </div>
    </>
  );
}
