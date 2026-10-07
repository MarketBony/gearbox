import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { BonyKit, BonyFont } from '../../../../types';
import { db } from '../../../../services/dataService';
import { getSocket } from '../../../../services/socket';
import { gx, hud, Icon, Seg } from '../../ui/kit';
import { THEMES, FONTS, applyAmbiance, resolveTheme, contrast, onColor, type BonyFormDef, type Theme } from '../../../../shared/bonyform';
import { FrameToggle, headerRatio } from './Frame';

const norm = (f: string) => f.toLowerCase().replace(/[^a-z0-9]/g, '');
/** Famille de la bibliothèque qui correspond à un nom de police officielle (casse et espaces ignorés). */
const inLib = (lib: BonyFont[], name?: string | null) => (name ? lib.find((f) => norm(f.family) === norm(name))?.family || null : null);
/** Le thème EMBARQUE les fichiers des polices de marque qu'il utilise : le formulaire publié n'en dépend plus. */
function embed(x: Theme, lib: BonyFont[]) {
  const used = lib.filter((f) => f.family === x.font || f.family === x.headingFont);
  x.fontFiles = used.map(({ family, weight, style, url }) => ({ family, weight, style, url }));
}

// =====================================================================
// Studio de personnalisation Forms Bony (lot F2a, 01/10/2026).
// - Aperçu EN DIRECT : la vraie page du Worker (/__preview) dans une iframe, alimentée par postMessage
//   à chaque retouche. Rien n'est envoyé ni publié : l'aperçu n'a ni captcha ni envoi.
// - Réglages : ambiances, couleurs (avec alerte de lisibilité), fond, en-tête, typographie, champs,
//   boutons, mouvement, et kits de marque partagés par l'équipe.
// - Images : compressées ICI (WebP, 1920 px au plus), puis stockées chez Cloudflare (KV du Worker).
// =====================================================================

type Update = (mut: (d: BonyFormDef) => void, soon?: boolean) => void;

// ---------------------------------------------------------------- aperçu en direct
export function StudioPreview({ def, workerUrl, onEditField }: { def: BonyFormDef; workerUrl: string | null; onEditField: (id: string) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  const [screen, setScreen] = useState<'welcome' | 'form' | 'thanks'>('form');
  const [picked, setPicked] = useState<string | null>(null);
  // « Ordinateur » = une vraie page de DESK px, réduite pour tenir dans la scène (mesurée, pas devinée) :
  // sinon l'aperçu prendrait la largeur du panneau et montrerait la mise en page mobile.
  const stage = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = stage.current; if (!el) return;
    const ro = new ResizeObserver(() => { const cs = getComputedStyle(el); setBox({ w: el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), h: el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) }); });
    ro.observe(el); return () => ro.disconnect();
  }, [workerUrl]);
  const origin = (() => { try { return workerUrl ? new URL(workerUrl).origin : ''; } catch { return ''; } })();
  const send = useCallback((msg: unknown) => { const w = frame.current?.contentWindow; if (w && origin) w.postMessage(msg, origin); }, [origin]);

  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== origin || e.source !== frame.current?.contentWindow || !e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'bonyform:ready') setReady(true);
      else if (e.data.type === 'bonyform:focus' && typeof e.data.id === 'string') setPicked(e.data.id);
      else if (e.data.type === 'bonyform:screen' && e.data.screen === 'form') setScreen('form');
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [origin]);
  // Chaque retouche part dans l'aperçu (regroupée à l'image suivante).
  useEffect(() => {
    if (!ready) return;
    const r = requestAnimationFrame(() => { send({ type: 'bonyform:def', def }); if (screen === 'thanks') send({ type: 'bonyform:screen', screen: 'thanks' }); });
    return () => cancelAnimationFrame(r);
  }, [def, ready, send]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ready) send({ type: 'bonyform:screen', screen }); }, [screen, ready, send]);

  const pickedField = picked ? def.fields.find((f) => f.id === picked) : null;
  if (!workerUrl) return <div className="bst-pv"><div className="frm-err">Aperçu indisponible : le Worker Cloudflare n’est pas configuré sur ce serveur.</div></div>;
  return (
    <div className="bst-pv">
      <div className="bst-pvbar">
        <Seg value={device} onChange={setDevice} options={[['desktop', 'Ordinateur'], ['phone', 'Mobile']]} />
        <Seg value={screen} onChange={setScreen} options={[...(def.settings.welcome?.enabled ? [['welcome', 'Accueil'] as ['welcome', string]] : []), ['form', 'Formulaire'], ['thanks', 'Remerciement']]} />
        <span className="grow" />
        {pickedField ? <button className="btn sm bst-pick" onClick={() => { onEditField(pickedField.id); setPicked(null); }}><Icon name="edit" size="sm" /><span className="ellipsis">Modifier « {pickedField.label || 'question'} »</span></button>
          : <span className="faint bst-pvhint">Aperçu en direct · rien n’est envoyé</span>}
        <button className="icon-btn sm" aria-label="Recharger l’aperçu" data-tip="Recharger l’aperçu" onClick={() => { setReady(false); setScreen('form'); if (frame.current) frame.current.src = `${workerUrl}/__preview?r=${Date.now()}`; }}><Icon name="refresh" size="sm" /></button>
      </div>
      <div className={`bst-stage ${device}`} ref={stage}>
        <div className="bst-dev" style={device === 'desktop' && box.w ? desk(box) : undefined}>
          <iframe ref={frame} title="Aperçu du formulaire" src={`${workerUrl}/__preview`} onLoad={() => setReady(true)} /* le script du client a tourné avant « load » : signal fiable, même si son « ready » est parti avant notre écoute */ />
          {!ready ? <div className="bst-wait"><i className="spin" />Chargement de l’aperçu…</div> : null}
        </div>
      </div>
      {device === 'desktop' && box.w && box.w < DESK ? <span className="bst-scale">{Math.round((box.w / DESK) * 100)} %</span> : null}
    </div>
  );
}

const DESK = 1280;
function desk(b: { w: number; h: number }): React.CSSProperties {
  const k = Math.min(1, b.w / DESK);
  return { width: DESK, height: b.h / k, transform: `scale(${k})`, transformOrigin: '0 0', marginRight: -DESK * (1 - k), marginBottom: -(b.h / k) * (1 - k) };
}

// ---------------------------------------------------------------- outils couleur / image
const isHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c);
function rgbaToHex(c: string): string {
  if (isHex(c)) return c;
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(c || '');
  return m ? `#${[m[1], m[2], m[3]].map((x) => Math.min(255, +x).toString(16).padStart(2, '0')).join('')}` : '#ffffff';
}
const alphaOf = (c: string) => { const m = /rgba\([^)]*,\s*([\d.]+)\s*\)$/i.exec(c || ''); return m ? Number(m[1]) : 1; };
/** Couleur VUE d'une carte translucide posée sur le fond (mélange pondéré par sa transparence). */
const seen = (surface: string, bg: string) => {
  const a = alphaOf(surface), x = parseInt(rgbaToHex(surface).slice(1), 16), y = parseInt(rgbaToHex(bg).slice(1), 16);
  const ch = (n: number, s: number) => Math.round(((x >> s) & 255) * a + ((y >> s) & 255) * (1 - a));
  return `#${[ch(0, 16), ch(0, 8), ch(0, 0)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};
const withAlpha = (hex: string, a: number) => { const n = parseInt(rgbaToHex(hex).slice(1), 16); return a >= 1 ? rgbaToHex(hex) : `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

/** Compresse une image (WebP, côté le plus long ≤ max) et la renvoie en base64 sans préfixe. */
export async function compress(file: File, max = 1920): Promise<{ type: string; data: string; size: number }> {
  const toB64 = (b: Blob) => new Promise<string>((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => ko(r.error); r.readAsDataURL(b); });
  // GIF animé : gardé tel quel s'il est assez léger (le recompresser figerait l'animation).
  if (file.type === 'image/gif' && file.size <= 1_300_000) return { type: 'image/gif', data: await toB64(file), size: file.size };
  const bmp = await createImageBitmap(file);
  let side = max, q = 0.84, blob: Blob | null = null;
  for (let k = 0; k < 6; k++) {
    const s = Math.min(1, side / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/webp', q));
    if (blob && blob.size <= 1_000_000) break;
    q = Math.max(0.55, q - 0.1); side = Math.round(side * 0.85);
  }
  bmp.close?.();
  if (!blob) throw new Error('Image illisible.');
  if (blob.size > 1_400_000) throw new Error('Image trop lourde, même compressée.');
  return { type: blob.type || 'image/webp', data: await toB64(blob), size: blob.size };
}

/** Choisir une image, la compresser et la déposer chez Cloudflare : renvoie son adresse (null si annulé). */
export function pickImage(max = 1600): Promise<string | null> {
  return new Promise((done) => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp,image/gif';
    inp.onchange = async () => {
      const file = inp.files?.[0]; if (!file) return done(null);
      try { const img = await compress(file, max); const { url } = await db.uploadBonyAsset(img.type, img.data); hud(`Image envoyée (${Math.round(img.size / 1024)} Ko)`); done(url); }
      catch (e: any) { hud(e?.message || 'Envoi de l’image impossible.'); done(null); }
    };
    inp.click();
  });
}

// ---------------------------------------------------------------- panneau de réglages
export function StudioPanel({ def, update }: { def: BonyFormDef; update: Update }) {
  const raw = def.theme, t = resolveTheme(raw);
  /** Retouche du thème : marque l'ambiance comme personnalisée. */
  const th = (mut: (x: Theme) => void, soon = false) => update((d) => { mut(d.theme); d.theme.preset = 'perso'; }, soon);
  const sub = <K extends 'bg' | 'header' | 'typo' | 'buttons' | 'motion'>(k: K, patch: Partial<NonNullable<Theme[K]>>, soon = false) =>
    th((x) => { (x as any)[k] = { ...(t as any)[k], ...((x as any)[k] || {}), ...patch }; }, soon);
  const [upl, setUpl] = useState<string | null>(null);
  const [lib, setLib] = useState<BonyFont[]>([]);
  const loadLib = useCallback(() => db.getBonyFonts().then(setLib).catch(() => {}), []);
  useEffect(() => { loadLib(); const so = getSocket(); so?.on('bonyforms:fonts', loadLib); return () => { so?.off('bonyforms:fonts', loadLib); }; }, [loadLib]);
  useBrandFontFaces(lib);
  const families = Array.from(new Set<string>(lib.map((f) => f.family)));
  const fontOpts: string[][] = [...FONTS.map((x) => [x, x]), ...families.map((f) => [f, `★ ${f} (marque)`])];
  const amb = THEMES[raw.preset];
  const missing = amb ? ([amb.bf, amb.bhf].filter((n) => n && !inLib(lib, n)) as string[]) : [];

  const upload = (slot: 'bg' | 'header' | 'logo') => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp,image/gif';
    inp.onchange = async () => {
      const file = inp.files?.[0]; if (!file) return;
      setUpl(slot);
      try {
        const img = await compress(file, slot === 'logo' ? 640 : 1920);
        const { url } = await db.uploadBonyAsset(img.type, img.data);
        if (slot === 'logo') th((x) => { x.logoImage = url; }, true);
        else if (slot === 'bg') sub('bg', { kind: 'image', image: url }, true);
        else sub('header', { style: t.header.style === 'band' || t.header.style === 'none' ? 'banner' : t.header.style, image: url }, true);
        hud(`Image envoyée (${Math.round(img.size / 1024)} Ko)`);
      } catch (e: any) { hud(e?.message || 'Envoi de l’image impossible.'); }
      finally { setUpl(null); }
    };
    inp.click();
  };

  // Lisibilité : le texte des questions est posé sur les cartes (ou sur le fond, sans cartes).
  // Avec des cartes translucides, on juge sur la couleur réellement vue (carte mêlée au fond).
  const under = t.fields === 'lines' ? t.background : seen(t.surface, t.background);
  const busyBg = t.bg.kind === 'image' || t.bg.kind === 'animated' || t.bg.kind === 'pattern';
  const cText = contrast(t.text, under), cPrim = contrast(t.primary, under);
  const glass = alphaOf(t.surface) < 1;

  return (
    <div className="bfe-set bst">
      <div className="bfe-gt">Présentation</div>
      <Seg value={t.layout} onChange={(v) => update((d) => { d.theme.layout = v as any; })} options={[['page', 'Page complète'], ['steps', 'Une question par écran']]} />

      <div className="bfe-gt">Ambiance</div>
      <div className="bst-amb">{Object.entries(THEMES).map(([id, a]) => {
        const r = resolveTheme(a);
        return (
          <button key={id} className={raw.preset === id ? 'on' : ''} onClick={() => update((d) => { d.theme = applyAmbiance(d.theme, id); const bf = inLib(lib, a.bf), bhf = inLib(lib, a.bhf); if (bf) d.theme.font = bf; if (bhf) d.theme.headingFont = bhf; embed(d.theme, lib); }, true)}
            style={{ '--a': r.primary, '--b': r.background, '--c': rgbaToHex(r.surface), '--t': r.text, '--rr': `${Math.min(r.radius, 12)}px`, '--hf': `'${r.headingFont || r.font}'` } as React.CSSProperties}>
            <i data-bg={r.bg.kind}><b>Aa</b><s /><u /></i><span>{a.l}</span>
          </button>);
      })}</div>
      {missing.length ? <div className="bfe-hint">Police officielle <b>{missing.join(' / ')}</b> absente de la bibliothèque : importez-la dans « Polices de marque » (plus bas). En attendant, la police libre la plus proche est utilisée.</div> : null}
      {raw.preset === 'perso' ? <div className="bfe-hint">Ambiance personnalisée : vos retouches sont gardées. Cliquer une ambiance repart d’elle (vos images restent).</div> : null}

      <Group t="Couleurs" icon="contrast" open>
        <div className="bfe-row bst-cols">
          <Col l="Principale" v={t.primary} on={(v) => th((x) => { x.primary = v; })} />
          <Col l="Fond" v={t.background} on={(v) => th((x) => { x.background = v; })} />
          <Col l="Cartes" v={rgbaToHex(t.surface)} on={(v) => th((x) => { x.surface = withAlpha(v, alphaOf(t.surface)); })} />
          <Col l="Texte" v={rgbaToHex(t.text)} on={(v) => th((x) => { x.text = v; })} />
        </div>
        <Chk l="Cartes en verre (transparence floutée)" v={glass} on={(v) => th((x) => { x.surface = withAlpha(t.surface, v ? 0.7 : 1); }, true)} />
        {glass ? <Range l="Opacité des cartes" v={Math.round(alphaOf(t.surface) * 100)} min={40} max={95} unit=" %" on={(v) => th((x) => { x.surface = withAlpha(t.surface, v / 100); })} /> : null}
        {glass && busyBg && alphaOf(t.surface) < 0.6 ? <Warn msg="Fond chargé derrière des cartes très transparentes : le texte risque de se perdre. Montez l’opacité vers 70 %." fix={() => th((x) => { x.surface = withAlpha(t.surface, 0.72); }, true)} /> : null}
        {cText < 4.5 ? <Warn msg={`Texte peu lisible (contraste ${cText.toFixed(1)} : 1, il faut 4,5).`} fix={() => th((x) => { x.text = onColor(under); }, true)} /> : null}
        {cPrim < 2.2 ? <Warn msg={`La couleur principale se distingue mal du fond (${cPrim.toFixed(1)} : 1) : boutons et choix seront peu visibles.`} /> : null}
        <div className="bfe-hint">Texte des boutons : {onColor(t.primary) === '#ffffff' ? 'blanc' : 'noir'}, choisi automatiquement pour rester lisible.</div>
      </Group>

      <Group t="Arrière-plan" icon="wallpaper" open>
        <Chips value={t.bg.kind} onChange={(v) => sub('bg', { kind: v as any, ...(v !== 'solid' && !t.bg.colors?.length ? { colors: [t.primary, rgbaToHex(t.surface)] } : {}) }, true)}
          options={[['solid', 'Uni'], ['gradient', 'Dégradé'], ['pattern', 'Motif'], ['animated', 'Animé'], ['image', 'Image']]} />
        {t.bg.kind === 'gradient' || t.bg.kind === 'pattern' || t.bg.kind === 'animated' ? (
          <div className="bfe-row bst-cols">
            {(t.bg.kind === 'pattern' ? [0] : [0, 1, 2]).map((k) => {
              const cs = t.bg.colors || [], has = k < cs.length;
              return has || k === cs.length ? (
                <span key={k} className="bst-colx">
                  <Col l={has ? `Couleur ${k + 1}` : 'Ajouter'} v={has ? rgbaToHex(cs[k]) : '#ffffff'} on={(v) => { const n = [...cs]; n[k] = v; sub('bg', { colors: n }); }} />
                  {has && k >= 2 ? <button className="icon-btn sm" aria-label="Retirer" onClick={() => sub('bg', { colors: cs.filter((_, j) => j !== k) }, true)}><Icon name="close" size="sm" /></button> : null}
                </span>) : null;
            })}
          </div>) : null}
        {t.bg.kind === 'gradient' ? <Range l="Angle" v={t.bg.angle ?? 160} min={0} max={360} unit="°" on={(v) => sub('bg', { angle: v })} /> : null}
        {t.bg.kind === 'pattern' ? <Chips value={t.bg.pattern || 'dots'} onChange={(v) => sub('bg', { pattern: v as any }, true)} options={[['dots', 'Points'], ['grid', 'Grille'], ['chevrons', 'Chevrons'], ['waves', 'Vagues']]} /> : null}
        {t.bg.kind === 'animated' ? <Seg value={t.bg.animation || 'aurora'} onChange={(v) => sub('bg', { animation: v as any }, true)} options={[['aurora', 'Aurore'], ['bubbles', 'Bulles'], ['grain', 'Grain']]} /> : null}
        {t.bg.kind === 'image' ? <>
          <ImageSlot url={t.bg.image || null} busy={upl === 'bg'} onPick={() => upload('bg')} onClear={() => sub('bg', { image: null, frame: null }, true)} />
          <FrameToggle url={t.bg.image || null} frame={t.bg.frame} ratio={16 / 9} label="Cadrage du fond" onChange={(fr, soon) => sub('bg', { frame: fr }, soon)} />
          <Range l="Voile" v={Math.round((t.bg.overlay ?? 0.35) * 100)} min={0} max={90} unit=" %" on={(v) => sub('bg', { overlay: v / 100 })} />
          <Range l="Flou" v={t.bg.blur ?? 0} min={0} max={20} unit=" px" on={(v) => sub('bg', { blur: v })} />
        </> : null}
        {t.bg.kind === 'animated' && t.motion.level === 'none' ? <div className="bfe-hint">Animations désactivées (Mouvement) : le fond reste immobile.</div> : null}
      </Group>

      <Group t="En-tête" icon="image" open>
        <Chips value={t.header.style} onChange={(v) => sub('header', { style: v as any }, true)} options={[['band', 'Bandeau'], ['banner', 'Bannière'], ['hero', 'Plein écran'], ['split', 'Partagé'], ['none', 'Aucun']]} />
        {t.header.style === 'banner' || t.header.style === 'hero' || t.header.style === 'split' ? <>
          <ImageSlot url={t.header.image || null} busy={upl === 'header'} onPick={() => upload('header')} onClear={() => sub('header', { image: null, frame: null }, true)} />
          <FrameToggle url={t.header.image || null} frame={t.header.frame} ratio={headerRatio(t.header.style)} label="Cadrage de l’en-tête" onChange={(fr, soon) => sub('header', { frame: fr }, soon)} />
          {!t.header.image ? <div className="bfe-hint">Sans image, l’en-tête s’affiche en bandeau.</div> : null}
          {t.header.style === 'hero' ? <Range l="Voile sous le titre" v={Math.round((t.header.overlay ?? 0.45) * 100)} min={15} max={90} unit=" %" on={(v) => sub('header', { overlay: v / 100 })} /> : null}
          {t.header.style === 'split' ? <div className="bfe-hint">Écran partagé : l’image occupe la moitié gauche sur ordinateur, le haut de page sur mobile.</div> : null}
        </> : null}
        <div className="bfe-row">
          <Sel l="Logo" v={t.logo || ''} opts={[['', 'Aucun'], ['bony', 'Bony'], ['renault', 'Renault'], ['dacia', 'Dacia'], ['alpine', 'Alpine'], ['nissan', 'Nissan'], ['mobilize', 'Mobilize']]} on={(v) => th((x) => { x.logo = (v || null) as any; })} />
          <Sel l="Position" v={t.header.logoAlign || 'left'} opts={[['left', 'À gauche'], ['center', 'Centré']]} on={(v) => sub('header', { logoAlign: v as any })} />
        </div>
        <div className="bfe-f"><span>Logo importé (remplace le logo choisi)</span>
          <ImageSlot url={t.logoImage} busy={upl === 'logo'} small onPick={() => upload('logo')} onClear={() => th((x) => { x.logoImage = null; }, true)} />
        </div>
        {t.logo || t.logoImage ? <Range l="Taille du logo" v={t.logoSize} min={18} max={90} unit=" px" on={(v) => th((x) => { if (v === 30) delete x.logoSize; else x.logoSize = v; })} /> : null}
        <Chk l="Pied de page Bony (repiquage)" v={t.bonyFooter} on={(v) => th((x) => { if (v) x.bonyFooter = true; else delete x.bonyFooter; }, true)} />
        {t.bonyFooter ? <div className="bfe-hint">Bandeau sombre aux couleurs de Bony avec le logo du groupe, sous le formulaire.</div> : null}
      </Group>

      <Group t="Typographie" icon="edit">
        <div className="bfe-row">
          <Sel l="Texte" v={t.font} opts={fontOpts} on={(v) => th((x) => { x.font = v; embed(x, lib); }, true)} />
          <Sel l="Titres" v={t.headingFont || ''} opts={[['', 'Même que le texte'], ...fontOpts]} on={(v) => th((x) => { x.headingFont = v || null; embed(x, lib); }, true)} />
        </div>
        <Range l="Taille d’ensemble" v={Math.round(t.typo.scale * 100)} min={90} max={125} unit=" %" on={(v) => sub('typo', { scale: v / 100 })} />
        <div className="bfe-row">
          <Sel l="Graisse des titres" v={String(t.typo.headingWeight)} opts={[['400', 'Normale'], ['500', 'Moyenne'], ['600', 'Demi-gras'], ['700', 'Gras'], ['800', 'Extra-gras']]} on={(v) => sub('typo', { headingWeight: Number(v) as any })} />
          <Sel l="Casse des titres" v={t.typo.headingCase} opts={[['none', 'Normale'], ['upper', 'MAJUSCULES'], ['lower', 'minuscules']]} on={(v) => sub('typo', { headingCase: v as any })} />
        </div>
        <Range l="Espacement des lettres (titres)" v={Math.round(t.typo.headingSpacing * 100)} min={-4} max={20} unit="" on={(v) => sub('typo', { headingSpacing: v / 100 })} />
      </Group>

      <Group t="Questions et boutons" icon="sliders">
        <Lbl l="Questions"><Seg value={t.fields} onChange={(v) => th((x) => { x.fields = v as any; }, true)} options={[['cards', 'Cartes'], ['flat', 'Sans cartes'], ['lines', 'Lignes']]} /></Lbl>
        <Lbl l="Zones de saisie"><Seg value={t.inputs} onChange={(v) => th((x) => { x.inputs = v as any; }, true)} options={[['outline', 'Contour'], ['filled', 'Remplies'], ['underline', 'Soulignées']]} /></Lbl>
        <Range l="Arrondi" v={t.radius} min={0} max={28} unit=" px" on={(v) => th((x) => { x.radius = v; })} />
        <Lbl l="Ombre"><Chips value={String(t.shadow)} onChange={(v) => th((x) => { x.shadow = Number(v) as any; }, true)} options={[['0', 'Aucune'], ['1', 'Légère'], ['2', 'Marquée'], ['3', 'Halo']]} /></Lbl>
        <Lbl l="Boutons"><Chips value={t.buttons.style} onChange={(v) => sub('buttons', { style: v as any }, true)} options={[['solid', 'Plein'], ['outline', 'Contour'], ['gradient', 'Dégradé'], ['pill', 'Pilule']]} /></Lbl>
        <Sel l="Casse des boutons" v={raw.buttons?.case || ''} opts={[['', 'Comme les titres'], ['none', 'Normale'], ['upper', 'MAJUSCULES'], ['lower', 'minuscules']]} on={(v) => sub('buttons', { case: (v || undefined) as any })} />
        <div className="bfe-row">
          <Txt l="Bouton d’envoi" v={raw.buttons?.label ?? ''} placeholder="Envoyer" on={(v) => sub('buttons', { label: v.slice(0, 40) || undefined })} />
          {t.layout === 'steps' ? <Txt l="Bouton suivant" v={raw.buttons?.nextLabel ?? ''} placeholder="Suivant" on={(v) => sub('buttons', { nextLabel: v.slice(0, 40) || undefined })} /> : null}
        </div>
      </Group>

      <Group t="Mouvement" icon="bolt">
        <Seg value={t.motion.level} onChange={(v) => sub('motion', { level: v as any }, true)} options={[['none', 'Aucun'], ['soft', 'Doux'], ['lively', 'Vivant']]} />
        {t.motion.level !== 'none' ? <Lbl l="Apparition"><Seg value={t.motion.entrance} onChange={(v) => sub('motion', { entrance: v as any }, true)} options={[['fade', 'Fondu'], ['slide', 'Glissé'], ['spring', 'Rebond']]} /></Lbl> : null}
        <Chk l="Confettis à l’envoi" v={t.motion.confetti && t.motion.level !== 'none'} on={(v) => sub('motion', { confetti: v }, true)} />
        {t.motion.confetti && t.motion.level !== 'none' ? (
          <div className="bfe-row bst-cols">
            {[0, 1, 2].map((k) => { const cs = t.motion.confettiColors || [t.primary, rgbaToHex(t.text), '#ffd166']; return <React.Fragment key={k}><Col l={`Confetti ${k + 1}`} v={rgbaToHex(cs[k] || '#ffffff')} on={(v) => { const n = [...cs]; n[k] = v; sub('motion', { confettiColors: n.slice(0, 3) }); }} /></React.Fragment>; })}
          </div>) : null}
        <div className="bfe-hint">Les répondants qui ont demandé à réduire les animations (réglage de leur appareil) n’en voient aucune.</div>
      </Group>

      <Fonts lib={lib} reload={loadLib} />
      <Kits def={def} update={update} />
    </div>
  );
}

// ---------------------------------------------------------------- polices de marque (bibliothèque partagée)
const FONT_TYPES: Record<string, string> = { woff2: 'font/woff2', woff: 'font/woff', otf: 'font/otf', ttf: 'font/ttf' };
const WEIGHTS: string[][] = [['300', 'Light (300)'], ['400', 'Regular (400)'], ['500', 'Medium (500)'], ['600', 'Semibold (600)'], ['700', 'Bold (700)'], ['800', 'Extrabold (800)'], ['900', 'Black (900)']];
const extOf = (name: string) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] || '').toLowerCase();
/** Devine famille et graisse d'après le nom du fichier (« NouvelR-Bold.woff2 » → NouvelR, 700). */
function guess(name: string) {
  const base = name.replace(/\.[a-z0-9]+$/i, '');
  const w = /black|heavy/i.test(base) ? 900 : /extra ?bold/i.test(base) ? 800 : /semi ?bold|demi/i.test(base) ? 600 : /bold/i.test(base) ? 700 : /medium/i.test(base) ? 500 : /light|thin/i.test(base) ? 300 : 400;
  const family = base.replace(/[-_ ]?(regular|bold|light|medium|semi ?bold|extra ?bold|black|heavy|thin|book|italic|demi|webfont)/gi, '').replace(/[^A-Za-z0-9 _-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Police';
  return { family, weight: w, style: /italic/i.test(base) ? 'italic' : 'normal' };
}
function Fonts({ lib, reload }: { lib: BonyFont[]; reload: () => void }) {
  const [pend, setPend] = useState<{ file: File; family: string; weight: number; style: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const pick = () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.woff2,.woff,.otf,.ttf';
    inp.onchange = () => {
      const f = inp.files?.[0]; if (!f) return;
      if (!FONT_TYPES[extOf(f.name)]) { hud('Format accepté : WOFF2, WOFF, OTF ou TTF.'); return; }
      if (f.size > 1_400_000) { hud('Police trop lourde (1,4 Mo au plus) : préférez le WOFF2.'); return; }
      setPend({ file: f, ...guess(f.name) });
    };
    inp.click();
  };
  const save = async () => {
    if (!pend) return;
    setBusy(true);
    try {
      const data = await new Promise<string>((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => ko(r.error); r.readAsDataURL(pend.file); });
      const { url } = await db.uploadBonyAsset(FONT_TYPES[extOf(pend.file.name)], data);
      await db.saveBonyFont({ family: pend.family.trim(), weight: pend.weight, style: pend.style, url, fileName: pend.file.name });
      hud(`Police « ${pend.family.trim()} » ajoutée pour toute l’équipe`); setPend(null); reload();
    } catch (e: any) { hud(e?.message || 'Import impossible.'); }
    finally { setBusy(false); }
  };
  const del = (f: BonyFont, el: HTMLElement) => gx().menu.open([
    { header: `Retirer ${f.family} ${f.weight}${f.style === 'italic' ? ' italique' : ''} ?` },
    { label: 'Retirer de la bibliothèque', icon: 'trash', action: async () => { try { await db.deleteBonyFont(f.id); hud('Police retirée (les formulaires qui l’utilisent la gardent)'); reload(); } catch (e: any) { hud(e?.message || 'Suppression impossible.'); } } },
    { label: 'Annuler', action: () => {} },
  ], el, { align: 'right' });
  const fams = Array.from(new Set<string>(lib.map((f) => f.family)));
  return (
    <Group t="Polices de marque" icon="file">
      <div className="bfe-hint">NouvelR, Dacia Block, AlpineNewAlps, NissanBrand… ne sont servies par aucun service libre : importez les fichiers de vos kits de charte (WOFF2 de préférence, une graisse par fichier). Partagées par toute l’équipe ; un formulaire publié garde sa police même si on la retire ici.</div>
      {fams.length ? <div className="bst-fonts">{fams.map((fam) => (
        <div key={fam} className="bst-font">
          <b style={{ fontFamily: `'${fam}'` }}>{fam}</b>
          <span className="bst-fw">{lib.filter((f) => f.family === fam).map((f) => <button key={f.id} className="bst-fwb" data-tip={`${f.fileName} · retirer`} onClick={(e) => del(f, e.currentTarget)}>{f.weight}{f.style === 'italic' ? 'i' : ''}</button>)}</span>
        </div>))}</div> : <div className="faint" style={{ fontSize: 12.5 }}>Aucune police importée.</div>}
      {pend ? (
        <div className="bst-fontnew">
          <div className="faint ellipsis" style={{ fontSize: 12 }}>{pend.file.name} · {Math.round(pend.file.size / 1024)} Ko</div>
          <div className="bfe-row">
            <Txt l="Famille" v={pend.family} on={(v) => setPend({ ...pend, family: v.replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 40) })} />
            <Sel l="Graisse" v={String(pend.weight)} opts={WEIGHTS} on={(v) => setPend({ ...pend, weight: Number(v) })} />
          </div>
          <Chk l="Italique" v={pend.style === 'italic'} on={(v) => setPend({ ...pend, style: v ? 'italic' : 'normal' })} />
          <div className="bst-kitnew"><button className="btn sm" onClick={() => setPend(null)}>Annuler</button><span className="grow" /><button className="btn sm primary" disabled={busy || !pend.family.trim()} onClick={save}>{busy ? 'Envoi…' : 'Ajouter à la bibliothèque'}</button></div>
        </div>
      ) : <button className="btn sm" onClick={pick}><Icon name="plus" size="sm" />Importer une police…</button>}
    </Group>
  );
}
/** Charge aussi les polices de marque dans Gearbox (la bibliothèque s'affiche dans sa police). */
function useBrandFontFaces(lib: BonyFont[]) {
  useEffect(() => {
    const faces = lib.map((f) => { try { const ff = new FontFace(f.family, `url("${f.url}")`, { weight: String(f.weight), style: f.style }); document.fonts.add(ff); ff.load().catch(() => {}); return ff; } catch { return null; } });
    return () => faces.forEach((ff) => { if (ff) document.fonts.delete(ff); });
  }, [lib]);
}

// ---------------------------------------------------------------- kits de marque (partagés)
function Kits({ def, update }: { def: BonyFormDef; update: Update }) {
  const [kits, setKits] = useState<BonyKit[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => db.getBonyKits().then(setKits).catch(() => setKits((x) => x || [])), []);
  useEffect(() => { load(); const s = getSocket(); s?.on('bonyforms:kits', load); return () => { s?.off('bonyforms:kits', load); }; }, [load]);

  const saveKit = async () => {
    const n = name.trim(); if (!n) return;
    setBusy(true);
    try { await db.saveBonyKit(n, def.theme); setName(''); hud(`Kit « ${n} » enregistré pour toute l’équipe`); load(); }
    catch (e: any) { hud(e?.message || 'Enregistrement impossible.'); }
    finally { setBusy(false); }
  };
  const apply = (k: BonyKit) => update((d) => { d.theme = { ...k.theme, preset: k.theme.preset || 'perso', layout: d.theme.layout }; }, true);
  const del = (k: BonyKit, el: HTMLElement) => gx().menu.open([
    { header: `Supprimer le kit « ${k.name} » ?` },
    { label: 'Supprimer pour toute l’équipe', icon: 'trash', action: async () => { try { await db.deleteBonyKit(k.id); hud('Kit supprimé'); load(); } catch (e: any) { hud(e?.message || 'Suppression impossible.'); } } },
    { label: 'Annuler', action: () => {} },
  ], el, { align: 'right' });

  return (
    <Group t="Kits de marque" icon="layers" open>
      <div className="bfe-hint">Un kit garde toute l’apparence (couleurs, fond, images, polices, styles) pour la réutiliser. Il est partagé par toute l’équipe.</div>
      {kits === null ? <div className="faint">Chargement…</div> : kits.length ? (
        <div className="bst-kits">{kits.map((k) => { const r = resolveTheme(k.theme); return (
          <div key={k.id} className="bst-kit">
            <button className="bst-kitb" onClick={() => apply(k)} data-tip={`Par ${k.author}`} style={{ '--a': r.primary, '--b': r.background, '--c': rgbaToHex(r.surface) } as React.CSSProperties}>
              <i /><span className="ellipsis">{k.name}</span></button>
            <button className="icon-btn sm" aria-label="Supprimer le kit" onClick={(e) => del(k, e.currentTarget)}><Icon name="trash" size="sm" /></button>
          </div>); })}</div>
      ) : <div className="faint" style={{ fontSize: 12.5 }}>Aucun kit pour l’instant.</div>}
      <div className="bst-kitnew">
        <input className="bfe-in" placeholder="Nom du kit (ex. Portes ouvertes Alpine)" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveKit(); }} />
        <button className="btn sm primary" disabled={busy || !name.trim()} onClick={saveKit}><Icon name="plus" size="sm" />Enregistrer</button>
      </div>
    </Group>
  );
}

// ---------------------------------------------------------------- petits éléments
function Group({ t, icon, children, open = false }: { t: string; icon: string; children: React.ReactNode; open?: boolean }) {
  return <details className="bst-g" open={open}><summary><Icon name={icon} size="sm" />{t}<Icon name="chevdown" size="sm" /></summary><div className="bst-gb">{children}</div></details>;
}
function ImageSlot({ url, busy, onPick, onClear, small }: { url: string | null; busy: boolean; onPick: () => void; onClear: () => void; small?: boolean }) {
  return (
    <div className={`bst-img ${small ? 'sm' : ''}`} style={url ? { backgroundImage: `url("${url}")` } : undefined}>
      {busy ? <span className="bst-imgb"><i className="spin" />Compression et envoi…</span> : <>
        <button className="btn sm" onClick={onPick}><Icon name="image" size="sm" />{url ? 'Remplacer' : 'Choisir une image'}</button>
        {url ? <button className="icon-btn sm" aria-label="Retirer l’image" onClick={onClear}><Icon name="close" size="sm" /></button> : null}
      </>}
    </div>
  );
}
function Warn({ msg, fix }: { msg: string; fix?: () => void }) {
  return <div className="bst-warn"><Icon name="alert" size="sm" /><span>{msg}</span>{fix ? <button className="btn sm" onClick={fix}>Corriger</button> : null}</div>;
}
/** Choix à pastilles (4 options et plus) : passe à la ligne au lieu de déborder du panneau. */
function Chips<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="bst-chips" role="radiogroup">{options.map(([k, l]) => <button key={k} role="radio" aria-checked={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}</div>;
}
function Lbl({ l, children }: { l: string; children: React.ReactNode }) { return <div className="bfe-f"><span>{l}</span>{children}</div>; }
function Range({ l, v, min, max, unit, on }: { l: string; v: number; min: number; max: number; unit: string; on: (v: number) => void }) {
  return <label className="bfe-f"><span>{l} : <b>{v}{unit}</b></span><input type="range" min={min} max={max} value={v} onChange={(e) => on(Number(e.target.value))} /></label>;
}
function Txt({ l, v, on, placeholder }: { l: string; v: string; on: (v: string) => void; placeholder?: string }) {
  return <label className="bfe-f"><span>{l}</span><input className="bfe-in" value={v} placeholder={placeholder} onChange={(e) => on(e.target.value)} /></label>;
}
function Sel({ l, v, opts, on }: { l: string; v: string; opts: string[][]; on: (v: string) => void }) {
  return <label className="bfe-f"><span>{l}</span><select className="bfe-in" value={v} onChange={(e) => on(e.target.value)}>{opts.map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></label>;
}
function Chk({ l, v, on }: { l: string; v: boolean; on: (v: boolean) => void }) {
  return <label className="frm-tg"><input type="checkbox" checked={v} onChange={(e) => on(e.target.checked)} /><span className="sw" /><span>{l}</span></label>;
}
function Col({ l, v, on }: { l: string; v: string; on: (v: string) => void }) {
  return <label className="bfe-col"><input type="color" value={isHex(v) ? v : rgbaToHex(v)} onChange={(e) => on(e.target.value)} /><span>{l}</span></label>;
}
