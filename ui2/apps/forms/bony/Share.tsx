import React, { useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import type { BonyFormDetail } from '../../../../types';
import { hud, Icon } from '../../ui/kit';
import { resolveTheme, isLayout, contrast, type BonyFormDef } from '../../../../shared/bonyform';
import { pickImage } from './Studio';

// =====================================================================
// Partager un formulaire Forms Bony (lot F2b, 01/10/2026).
// - Constructeur de lien : UTM (source, support, campagne, contenu) + préremplissage des champs qui ont un
//   « paramètre du lien ». Le Worker garde TOUS les paramètres du lien dans la réponse (meta.params) : ils
//   ressortent dans l'onglet Réponses (synthèse par source) et dans l'export Excel.
// - QR code du lien construit (PNG pour l'impression, SVG pour le graphiste).
// - Aperçu du lien partagé (WhatsApp, Facebook, LinkedIn, SMS) : titre, description, image.
// =====================================================================

type Update = (mut: (d: BonyFormDef) => void, soon?: boolean) => void;
const SOURCES: [string, string, string][] = [
  // source, support (utm_medium), libellé
  ['email', 'email', 'E-mailing'], ['sms', 'sms', 'SMS'], ['facebook', 'social', 'Facebook'], ['instagram', 'social', 'Instagram'],
  ['linkedin', 'social', 'LinkedIn'], ['site', 'referral', 'Site Bony'], ['qr', 'print', 'QR code (affiche, flyer)'], ['showroom', 'offline', 'Showroom / tablette'],
];
const clean = (v: string) => v.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

export default function Share({ def, row, update }: { def: BonyFormDef; row: BonyFormDetail; update: Update }) {
  const [src, setSrc] = useState('email');
  const [custom, setCustom] = useState('');
  const [campaign, setCampaign] = useState('');
  const [content, setContent] = useState('');
  const [pre, setPre] = useState<Record<string, string>>({});
  const [dark, setDark] = useState(true);
  const t = resolveTheme(def.theme), share = def.settings.share || {};
  const prefillable = def.fields.filter((f) => f.param && !isLayout(f));

  const link = useMemo(() => {
    if (!row.url) return '';
    const u = new URL(row.url), s = SOURCES.find((x) => x[0] === src);
    const source = src === 'autre' ? clean(custom) : src;
    if (source) u.searchParams.set('utm_source', source);
    if (s) u.searchParams.set('utm_medium', s[1]); else if (source) u.searchParams.set('utm_medium', 'other');
    if (clean(campaign)) u.searchParams.set('utm_campaign', clean(campaign));
    if (clean(content)) u.searchParams.set('utm_content', clean(content));
    prefillable.forEach((f) => { const v = (pre[f.param!] || '').trim(); if (v) u.searchParams.set(f.param!, v); });
    return u.toString();
  }, [row.url, src, custom, campaign, content, pre, prefillable.map((f) => f.param).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const qr = useMemo(() => {
    if (!link) return null;
    const q = qrcode(0, 'M'); q.addData(link); q.make();
    return q;
  }, [link]);
  const fg = dark ? '#111111' : t.primary;
  const svg = useMemo(() => {
    if (!qr) return '';
    const n = qr.getModuleCount(), m = 4; let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2 * m} ${n + 2 * m}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#ffffff"/><path d="${d}" fill="${fg}"/></svg>`;
  }, [qr, fg]);
  const fileBase = `QR_${clean(def.title) || 'formulaire'}${clean(campaign) ? `_${clean(campaign)}` : ''}`;
  const savePng = () => {
    if (!qr) return;
    const n = qr.getModuleCount(), m = 4, px = Math.max(8, Math.floor(1200 / (n + 2 * m)));
    const c = document.createElement('canvas'); c.width = c.height = (n + 2 * m) * px;
    const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = fg;
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) g.fillRect((k + m) * px, (r + m) * px, px, px);
    c.toBlob((b) => { if (b) download(b, `${fileBase}.png`); }, 'image/png');
  };
  const saveSvg = () => download(new Blob([svg], { type: 'image/svg+xml' }), `${fileBase}.svg`);
  const copy = (v: string, what: string) => navigator.clipboard?.writeText(v).then(() => hud(`${what} copié`), () => hud(v));

  const setShare = (patch: Partial<NonNullable<BonyFormDef['settings']['share']>>, soon = false) => update((d) => { d.settings.share = { ...(d.settings.share || {}), ...patch }; }, soon);
  const ogTitle = share.title?.trim() || def.title, ogDesc = share.description?.trim() || def.description || '', ogImg = share.image || t.header.image || (t.bg.kind === 'image' ? t.bg.image : null);
  const host = row.url ? new URL(row.url).host : 'forms.bonyauto-mobile.workers.dev';

  return (
    <div className="bsh scroll">
      <div className="bsh-col">
        {row.status === 'draft' ? <div className="frm-err">Formulaire en brouillon : le lien ne répondra qu’une fois publié. Vous pouvez déjà préparer vos liens et QR codes.</div> : null}
        <section className="bsh-card">
          <h3><Icon name="link" size="sm" />Lien de campagne</h3>
          <p className="bfe-hint">Un lien par canal : chaque réponse garde sa source, visible dans « Réponses » et dans l’export Excel.</p>
          <div className="bst-chips">{[...SOURCES.map(([k, , l]) => [k, l]), ['autre', 'Autre…']].map(([k, l]) => <button key={k} className={src === k ? 'on' : ''} onClick={() => setSrc(k)}>{l}</button>)}</div>
          {src === 'autre' ? <label className="bfe-f"><span>Source</span><input className="bfe-in" value={custom} placeholder="ex. leboncoin, radio-scoop" onChange={(e) => setCustom(e.target.value)} /></label> : null}
          <div className="bfe-row">
            <label className="bfe-f"><span>Campagne</span><input className="bfe-in" value={campaign} placeholder="ex. portes-ouvertes-octobre" onChange={(e) => setCampaign(e.target.value)} /></label>
            <label className="bfe-f"><span>Variante (facultatif)</span><input className="bfe-in" value={content} placeholder="ex. bouton-haut, visuel-b" onChange={(e) => setContent(e.target.value)} /></label>
          </div>
          {prefillable.length ? <>
            <div className="bfe-gt">Préremplir</div>
            <div className="bfe-row">{prefillable.map((f) => (
              <label key={f.id} className="bfe-f"><span className="ellipsis">{f.label || f.param} <span className="faint">?{f.param}=</span></span>
                <input className="bfe-in" value={pre[f.param!] || ''} placeholder={f.type === 'hidden' ? 'valeur cachée' : 'valeur'} onChange={(e) => setPre({ ...pre, [f.param!]: e.target.value })} /></label>))}</div>
            <p className="bfe-hint">Pour un e-mailing, mettez la variable du contact de votre outil (ex. <code>{'{{EMAIL}}'}</code>) : chaque destinataire reçoit son lien prérempli.</p>
          </> : null}
          <div className="bsh-link"><code>{link || 'Lien indisponible (Worker non configuré).'}</code></div>
          <div className="bsh-acts">
            <button className="btn sm primary" disabled={!link} onClick={() => copy(link, 'Lien')}><Icon name="copy" size="sm" />Copier le lien</button>
            <button className="btn sm" disabled={!link || row.status === 'draft'} onClick={() => window.open(link, '_blank', 'noopener')}><Icon name="eye" size="sm" />Ouvrir</button>
          </div>
        </section>

        <section className="bsh-card">
          <h3><Icon name="grid" size="sm" />QR code</h3>
          <div className="bsh-qr">
            <div className="bsh-qrimg" dangerouslySetInnerHTML={{ __html: svg }} />
            <div className="bsh-qrside">
              <p className="bfe-hint">Il encode le lien ci-dessus, source et campagne comprises : imprimez un QR par support pour comparer affiche, flyer et showroom.</p>
              <div className="bst-chips"><button className={dark ? 'on' : ''} onClick={() => setDark(true)}>Noir</button><button className={!dark ? 'on' : ''} onClick={() => setDark(false)}>Couleur du formulaire</button></div>
              {!dark && contrast(t.primary, '#ffffff') < 4.5 ? <div className="bst-warn"><Icon name="alert" size="sm" /><span>Couleur trop claire : certains téléphones liront mal ce QR. Préférez le noir.</span></div> : null}
              <div className="bsh-acts">
                <button className="btn sm primary" disabled={!qr} onClick={savePng}><Icon name="download" size="sm" />PNG (impression)</button>
                <button className="btn sm" disabled={!qr} onClick={saveSvg}><Icon name="download" size="sm" />SVG (graphiste)</button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="bsh-col">
        <section className="bsh-card">
          <h3><Icon name="message" size="sm" />Aperçu du lien partagé</h3>
          <p className="bfe-hint">Ce qu’affichent WhatsApp, Facebook, LinkedIn ou Messenger quand on colle le lien. Vide : titre, description et image d’en-tête du formulaire.</p>
          <div className="bsh-og">
            {ogImg ? <div className="bsh-ogimg" style={{ backgroundImage: `url("${ogImg}")` }} /> : <div className="bsh-ogimg none"><Icon name="image" /></div>}
            <div className="bsh-ogt"><span className="faint">{host}</span><b>{ogTitle}</b>{ogDesc ? <span>{ogDesc}</span> : null}</div>
          </div>
          <label className="bfe-f"><span>Titre du partage</span><input className="bfe-in" value={share.title || ''} placeholder={def.title} maxLength={90} onChange={(e) => setShare({ title: e.target.value })} /></label>
          <label className="bfe-f"><span>Description</span><textarea className="bfe-in" rows={2} value={share.description || ''} placeholder={def.description || 'Une phrase qui donne envie de cliquer'} maxLength={200} onChange={(e) => setShare({ description: e.target.value })} /></label>
          <div className="bsh-acts">
            <button className="btn sm" onClick={async () => { const u = await pickImage(1200); if (u) setShare({ image: u }, true); }}><Icon name="image" size="sm" />{share.image ? 'Remplacer l’image' : 'Image dédiée (1200 × 630)'}</button>
            {share.image ? <button className="btn sm" onClick={() => setShare({ image: null }, true)}>Retirer</button> : null}
          </div>
          <p className="bfe-hint">Les messageries gardent l’aperçu en cache : une modification peut mettre quelques heures à apparaître sur un lien déjà partagé. Publiez avant de diffuser.</p>
        </section>
      </div>
    </div>
  );
}

function download(b: Blob, name: string) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
