import React, { useEffect, useRef, useState } from 'react';
import type { SocialPost } from '../../../types';
import { gx, Icon, DraftInput } from '../ui/kit';
import { D, TARGETS, StBadge, DigBrandChips, Nets, hrefSur, normLink, shortLink, libelleMedias, nine, pd, stFill, stFg, stOf, stLabel } from './common';

// Ligne éditable du Calendrier éditorial / des Archives — `rowHTML` de la maquette, même balisage.
// Chaque contrôle écrit UN champ (`api.set`), comme `onChangerChamp` de pages/Digital.tsx.

export type PickKey = 'status' | 'service' | 'brands' | 'concessions' | 'networks' | 'lom' | 'co2s';
export interface RowApi {
  set: (id: string, k: keyof SocialPost, v: any) => void;
  pick: (el: HTMLElement, id: string, k: PickKey) => void;
  wording: (id: string) => void;
  media: (id: string) => void;
  comments: (id: string) => void;
  archive: (id: string, row: HTMLElement | null) => void;
  del: (id: string, row: HTMLElement | null) => void;
  toggleOpen: (id: string) => void;
}

const Ph: React.FC<{ t: string }> = ({ t }) => <span className="ph">{t}</span>;
function PickLabel({ k, p }: { k: PickKey; p: SocialPost }) {
  switch (k) {
    case 'status': return <span className="ellipsis">{stLabel(p.status)}</span>;
    case 'service': return <><i className="dig-dot" style={{ '--c': D().SERVICE_COLOR[p.service] || '#8a8599' } as React.CSSProperties} /><span className="ellipsis" style={{ fontWeight: 700 }}>{p.service}</span></>;
    case 'brands': return p.brands.length ? <><DigBrandChips brands={p.brands.slice(0, 2)} />{p.brands.length > 2 ? <span className="more">+{p.brands.length - 2}</span> : null}</> : <Ph t="Aucune" />;
    // Un chef de site ne reçoit déjà que SES valeurs (redactSiteFields) : rien à masquer ici.
    case 'concessions': return p.concessions.length ? <><span className="ellipsis" style={{ fontWeight: 600 }}>{p.concessions.slice(0, 2).join(', ')}</span>{p.concessions.length > 2 ? <span className="more">+{p.concessions.length - 2}</span> : null}</> : <Ph t="Aucun" />;
    case 'networks': return p.networks.length ? <span className="dig-nets"><Nets list={p.networks} max={5} /></span> : <Ph t="Aucun" />;
    case 'lom': return p.lom ? <span className="ellipsis">{p.lom}</span> : <Ph t="Aucune" />;
    case 'co2s': return (p.co2s || []).length ? <><span className="ellipsis" style={{ fontWeight: 600 }}>{p.co2s[0]}</span>{p.co2s.length > 1 ? <span className="more">+{p.co2s.length - 1}</span> : null}</> : <Ph t="Aucune" />;
  }
}
const TIP: Partial<Record<PickKey, (p: SocialPost) => string>> = {
  lom: (p) => p.lom || '',
  brands: (p) => p.brands.map((b) => (b === 'Holding' ? 'GROUPE BONY' : b)).join(' · '),
  concessions: (p) => p.concessions.join(' · '),
  networks: (p) => p.networks.join(' · '),
  co2s: (p) => (p.co2s || []).join(' · '),
};

export const EditoRow: React.FC<{ p: SocialPost; i: number; ed: boolean; open: boolean; api: React.MutableRefObject<RowApi> }> = React.memo(function EditoRow({ p, i, ed, open, api }) {
  const ref = useRef<HTMLElement>(null);
  const [linkEdit, setLinkEdit] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { if (!confirm) return; const t = setTimeout(() => setConfirm(false), 3000); return () => clearTimeout(t); }, [confirm]);
  const A = () => api.current;
  const pick = (k: PickKey) => (
    <button className={k === 'status' ? `dig-pick st ${stOf(p.status).strike ? 'strike' : ''}` : 'dig-pick'} data-pick={k} disabled={!ed}
      style={k === 'status' ? { '--c': stFill(p.status), '--fg': stFg(p.status) } as React.CSSProperties : undefined}
      data-tip={TIP[k]?.(p) || ''} onClick={(e) => A().pick(e.currentTarget, p.id, k)}>
      <PickLabel k={k} p={p} />{ed ? <Icon name="chevdown" size="chev" /> : null}
    </button>
  );
  const cell = (lb: string, inner: React.ReactNode) => <div className="dig-cell"><span className="lb">{lb}</span>{inner}</div>;
  const href = hrefSur(p.link);
  const nM = (p.mediaFiles || []).length, nC = p.commentCount || 0;
  const cancel = useRef(false);
  return (
    <article ref={ref} className={`dig-row enter ${p.archived ? 'arch' : ''} ${open ? 'open' : ''}`} data-id={p.id} style={{ '--i': Math.min(i, 12), '--c': stFill(p.status) } as React.CSSProperties}>
      <span className="dig-rail" />
      <div className="dig-content">
        <div className="dig-top">
          <DraftInput className="dig-ttl" value={p.title} placeholder="Titre de la publication..." disabled={!ed} data-tip={p.title || ''} onCommit={(v: string) => A().set(p.id, 'title', v.trim())} />
          <div className="dig-link">
            {linkEdit
              ? <input className="input" data-linkin autoFocus defaultValue={p.link} placeholder="https://… ou www.…"
                  onFocus={(e) => e.currentTarget.select()}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } if (e.key === 'Escape') { e.stopPropagation(); cancel.current = true; e.currentTarget.blur(); } }}
                  onBlur={(e) => { const v = normLink(e.currentTarget.value); if (!cancel.current && v !== (p.link || '')) A().set(p.id, 'link', v); cancel.current = false; setLinkEdit(false); }} />
              : <>{p.link
                  ? href ? <a href={href} target="_blank" rel="noopener noreferrer" title={p.link}><Icon name="link" size="sm" /><span className="ellipsis">{shortLink(href)}</span></a>
                    : <span className="ph" title={p.link}>{p.link}</span>   /* protocole refusé : jamais cliquable */
                  : <span className="ph">Aucun lien</span>}
                {ed ? <button className="icon-btn sm" data-tip={p.link ? 'Modifier le lien' : 'Ajouter un lien'} onClick={() => setLinkEdit(true)}><Icon name="edit" size="sm" /></button> : null}</>}
          </div>
        </div>
        <div className={`dig-wording ${p.wording ? '' : 'empty'}`} role="button" tabIndex={0} data-tip={ed ? 'Écrire le wording' : 'Lire le wording'}
          onClick={() => A().wording(p.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); A().wording(p.id); } }}>
          {p.wording ? p.wording : ed ? 'Rédiger le post ici...' : 'Aucun wording'}
        </div>
      </div>
      <div className="dig-sum"><b className="num">{p.date ? gx().fmt.date(pd(p.date)) : '—'}</b><StBadge id={p.status} /><DigBrandChips brands={p.brands.slice(0, 2)} /><span className="dig-nets"><Nets list={p.networks} max={3} /></span><span className="grow" /><button className="btn sm ghost" onClick={() => A().toggleOpen(p.id)}>Réglages<Icon name="chevdown" size="sm" /></button></div>
      <div className="dig-set">
        <div className="dig-r1">
          {cell('Date', ed ? <input type="date" className="input dig-date" value={p.date || ''} onChange={(e) => { if (e.target.value) A().set(p.id, 'date', e.target.value); }} />
            : <div className="dig-ro num">{p.date ? pd(p.date).toLocaleDateString('fr-FR') : '—'}</div>)}
          {cell('Statut', pick('status'))}{cell('Service', pick('service'))}{cell('Marques', pick('brands'))}{cell('Sites', pick('concessions'))}
        </div>
        <div className="dig-r2">
          {cell('Réseaux', pick('networks'))}
          {cell('Diffusion', <div className="dig-tg">{TARGETS.map(([v, l]) => <button key={v} aria-pressed={(p.targets || []).includes(v as any)} disabled={!ed} data-tip={v === 'Internet' ? 'Site internet' : 'Collaborateurs'}
            onClick={() => { const t = p.targets || []; A().set(p.id, 'targets', t.includes(v as any) ? t.filter((x) => x !== v) : [...t, v]); }}>{l}</button>)}</div>)}
          {cell('Loi LOM', pick('lom'))}{cell('Classes CO²', pick('co2s'))}
          {cell('Client B2B', <button className="dig-pro" aria-pressed={!!p.proPlus} disabled={!ed} data-tip="Marquer cette publication comme PRO+ (B2B)" onClick={() => A().set(p.id, 'proPlus', !p.proPlus)}><span className="box">{p.proPlus ? <Icon name="check" size="sm" /> : null}</span>PRO+</button>)}
        </div>
      </div>
      <div className="dig-act">
        <button className={`dig-ib ${nM ? 'on' : ''}`} style={{ '--c': 'var(--bony-orange)' } as React.CSSProperties} data-tip={nM ? libelleMedias(p.mediaFiles) : 'Gérer les médias'} aria-label="Médias" onClick={() => A().media(p.id)}><Icon name="image" size="sm" />{nM ? <b className="bdg">{nine(nM)}</b> : null}</button>
        <button className={`dig-ib ${nC ? 'on' : ''}`} style={{ '--c': 'var(--bony-violet)' } as React.CSSProperties} data-tip={nC ? `${nC} commentaire${nC > 1 ? 's' : ''}` : 'Commenter'} aria-label="Commentaires" onClick={() => A().comments(p.id)}><Icon name="message" size="sm" />{nC ? <b className="bdg">{nine(nC)}</b> : null}</button>
        <label className={`dig-ib ${p.archived ? 'on' : ''} ${ed ? '' : 'dis'}`} style={{ '--c': 'var(--bony-orange)' } as React.CSSProperties} data-tip={p.archived ? 'Désarchiver' : 'Archiver'} aria-label="Archiver"><input type="checkbox" checked={!!p.archived} disabled={!ed} onChange={() => A().archive(p.id, ref.current)} /></label>
        {ed ? <button className={`dig-ib del ${confirm ? 'confirm' : ''}`} data-tip={confirm ? 'Confirmer la suppression' : 'Supprimer définitivement'} aria-label="Supprimer"
          onClick={(e) => { if (confirm) { setConfirm(false); A().del(p.id, ref.current); return; } setConfirm(true); gx().animate(e.currentTarget, [{ transform: 'scale(.9)' }, { transform: 'none' }], { spring: 'bouncy' }); }}>
          {confirm ? <>SUPPR<br />?</> : <Icon name="trash" size="sm" />}</button> : null}
      </div>
    </article>
  );
}, (a, b) => a.p === b.p && a.ed === b.ed && a.open === b.open && a.i === b.i);
