import React, { useEffect, useState } from 'react';
import type { StorageInfo } from '../../../types';
import { db } from '../../../services/dataService';
import { appSettingsStore, useAppSettings } from '../../../services/appSettings';
import { type PushState, getPushState, subscribeToPush, unsubscribeFromPush } from '../../../services/pushNotifications';
import { type Platform, canPrompt, getPlatform, isFirefoxDesktop, isStandalone, onInstallStateChange, promptInstall } from '../../../services/pwaInstall';
import { canUseUi2, setUi2Beta, useUi2BetaPref } from '../../beta';
import { gx, hud, Icon } from '../ui/kit';
import { AppIco, Head, RoleBadge, Row, Switch, css, octets, LIBELLES_TYPE, type SectionDef } from './common';

// =====================================================================
// Panneaux « Application » et « Stockage » — blocs 1bis et 1ter de pages/Settings.tsx :
//  - installation PWA (`InstallAppModal` : services/pwaInstall) ;
//  - notifications de l'appareil (`NotificationsToggle` : services/pushNotifications), 5 états ;
//  - « Espace détente » (`GamesToggle`) : Master seul, refus réel côté serveur ;
//  - « Nouvelle interface (bêta) » (`BetaToggle`) : préférence locale, c'est la SORTIE de la v2 ;
//  - Stockage : GET /api/storage, visible de tous.
// =====================================================================

// ---------------------------------------------------------------- notifications de l'appareil
export function PushBlock({ compact }: { compact?: boolean }) {
  const [st, setSt] = useState<PushState>(() => getPushState());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fs = compact ? { fontSize: 12 } : undefined;
  const on = async () => {
    setBusy(true); setErr(null);
    try { setSt(await subscribeToPush()); if (getPushState() === 'granted') gx().shell.notify({ app: 'settings', title: 'Notifications activées', body: 'Vous recevrez les messages du Chat sur cet appareil.', silent: true }); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Échec de l’activation.'); setSt(getPushState()); }
    finally { setBusy(false); }
  };
  const off = async () => {
    setBusy(true);
    // La permission navigateur reste « granted » : on retire l'abonnement, donc les envois.
    try { await unsubscribeFromPush(); setSt('default'); } finally { setBusy(false); }
  };
  if (st === 'unsupported') return <div className="set-push"><span className="st"><Icon name="info" size="sm" />Notifications non disponibles</span><p style={fs}>Ce navigateur ne gère pas les notifications. Chrome, Edge ou Safari les acceptent.</p></div>;
  if (st === 'ios-needs-install') return <div className="set-push warn"><span className="st" style={{ color: 'var(--warn)' }}><Icon name="info" size="sm" />Installation requise</span><p style={fs}>Sur iPhone et iPad, les notifications ne sont possibles qu’<b>après avoir ajouté Gearbox à l’écran d’accueil</b>. Installe l’app, ouvre-la, puis reviens activer les notifications.</p></div>;
  if (st === 'denied') return <div className="set-push warn"><span className="st" style={{ color: 'var(--warn)' }}><Icon name="belloff" size="sm" />Notifications refusées</span><p style={fs}>Les notifications ont été refusées pour Gearbox. Pour les rétablir, il faut passer par les réglages : <b>cadenas ou ⓘ dans la barre d’adresse → Notifications → Autoriser</b>. Cette page ne peut plus le demander.</p></div>;
  if (st === 'granted') return <div className="set-push"><div className="row wrap" style={{ gap: 12 }}><span className="st" style={{ color: 'var(--ok)' }}><Icon name="bell" size="sm" />Notifications activées</span><button className="set-link" style={{ color: 'var(--text-2)' }} disabled={busy} onClick={off}>{busy ? 'Désactivation…' : 'Ne plus recevoir de notifications sur cet appareil'}</button></div></div>;
  // 'default' : jamais demandé. Le clic est OBLIGATOIRE (exigence iOS).
  return (
    <div className="set-push">
      <button className="btn" disabled={busy} onClick={on} style={{ justifySelf: 'start', color: 'var(--bony-violet)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb,var(--bony-violet) 50%,transparent)' }}><Icon name="bell" size="sm" />{busy ? 'Activation…' : 'Activer les notifications'}</button>
      <p style={fs}>Reçois les messages du chat sur cet appareil, même Gearbox fermé. Tu peux mettre une conversation en sourdine depuis la rubrique Chat.</p>
      {err ? <div className="set-err">{err}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------- installer Gearbox
export function InstallSheet({ close }: { close: (v?: unknown) => void }) {
  const platform = getPlatform();
  const [open, setOpen] = useState<Platform>(platform);
  const [avail, setAvail] = useState(canPrompt());
  const [installed, setInstalled] = useState(isStandalone());
  const [refus, setRefus] = useState(false);
  // L'invite peut arriver après l'ouverture : on suit son état.
  useEffect(() => onInstallStateChange(() => { setAvail(canPrompt()); setInstalled(isStandalone()); }), []);
  const install = async () => {
    setRefus(false);
    const r = await promptInstall();
    if (r === 'accepted') { setInstalled(true); gx().shell.notify({ app: 'settings', title: 'Gearbox est installée', body: 'L’icône Gearbox rejoint vos applications.', silent: true }); }
    if (r === 'dismissed') setRefus(true);
  };
  const native = <button className="btn primary" onClick={install}><Icon name="download" size="sm" />Installer maintenant</button>;
  const manual = <ol><li>Ouvre le menu du navigateur (<b>⋮</b> ou <b>…</b>), en haut à droite.</li><li>Choisis <b>Installer Gearbox</b> — ou l’icône d’installation qui apparaît dans la barre d’adresse.</li><li>Confirme. Gearbox s’ouvre alors dans sa propre fenêtre.</li></ol>;
  const dev = (id: Platform, ico: string, t: string, st: string, bd: React.ReactNode) => (
    <div className={`set-dev ${open === id ? 'open' : ''}`}>
      <button onClick={() => setOpen(id)}><span className="set-devico">{ico}</span><span className="grow"><b>{t}</b><small>{st}</small></span><Icon name={open === id ? 'chevup' : 'chevdown'} size="sm" /></button>
      <div className="bd">{bd}</div>
    </div>
  );
  return (
    <>
      <h3>Installer Gearbox</h3><div className="muted">Choisis ton appareil</div>
      {installed
        ? <div className="set-push" style={{ marginTop: 14, padding: 14, borderRadius: 12, background: 'color-mix(in srgb,var(--ok) 12%,transparent)' }}><span className="st"><Icon name="check" size="sm" />Déjà installée</span><p>Tu utilises Gearbox depuis l’application. Rien à faire de plus.</p></div>
        : <>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, margin: '12px 0' }}>Gearbox s’installe directement depuis le navigateur, avec son icône et sa propre fenêtre. <b style={{ color: 'var(--text)' }}>Aucun fichier à télécharger</b>, aucun store. Les mises à jour arrivent toutes seules.</p>
            {dev('desktop', 'WIN', 'Gearbox pour Windows', 'Chrome ou Edge — fonctionne aussi sur Mac', isFirefoxDesktop()
              ? <div className="faint" style={{ fontSize: 12, color: 'var(--warn)' }}>Firefox sur ordinateur ne sait pas installer d’application web. Ouvre Gearbox dans <b>Chrome</b> ou <b>Edge</b> pour l’installer.</div>
              : avail && platform === 'desktop' ? native : manual)}
            {dev('android', 'AND', 'Gearbox pour Android', 'Chrome, Edge, Samsung Internet', avail && platform === 'android' ? native
              : platform === 'android' ? <ol><li>Ouvre le menu <b>⋮</b> du navigateur.</li><li>Touche <b>Installer l’application</b> ou <b>Ajouter à l’écran d’accueil</b>.</li><li>Confirme : l’icône Gearbox rejoint tes applications.</li></ol>
              : <div>Ouvre <b>gearbox.bonyauto-mobile.com</b> sur le téléphone, puis menu <b>⋮</b> → <b>Installer l’application</b>.</div>)}
            {dev('ios', 'iOS', 'Gearbox pour iOS', 'iPhone et iPad — via le menu Partager', <><ol><li>Ouvre Gearbox dans <b>Safari</b>.</li><li>Touche l’icône <b>Partager</b>, en bas de l’écran.</li><li>Choisis <b>Sur l’écran d’accueil</b>, puis <b>Ajouter</b>.</li></ol><div className="faint" style={{ fontSize: 12, marginTop: 8 }}>Chrome, Edge et Firefox conviennent aussi à partir d’iOS 16.4. Sur iPhone, les notifications ne sont possibles qu’après cette installation.</div></>)}
            {refus ? <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>Installation annulée. Tu peux relancer quand tu veux.</div> : null}
          </>}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}><span className="label">Notifications</span><div style={{ marginTop: 8 }}><PushBlock compact /></div></div>
      <div className="foot"><button className="btn primary" onClick={() => close()}>Fermer</button></div>
    </>
  );
}

// ---------------------------------------------------------------- Application
export function ApplicationPanel({ s, user, onInstall }: { s: SectionDef; user: { id: string; role: string }; onInstall: () => void }) {
  const master = user.role === 'Master';
  const { gamesEnabled } = useAppSettings();
  const [sending, setSending] = useState(false);
  const beta = useUi2BetaPref(user.id);
  const [installed, setInstalled] = useState(isStandalone());
  useEffect(() => onInstallStateChange(() => setInstalled(isStandalone())), []);
  // `GamesToggle` : le serveur (PUT /api/settings/games, Master seul) est l'autorité ; l'auteur est
  // exclu de la diffusion temps réel, d'où la mise à jour locale explicite.
  const setGames = async () => {
    if (sending) return;
    setSending(true);
    try { const r = await db.setGamesEnabled(!gamesEnabled); appSettingsStore.set({ gamesEnabled: !!r?.gamesEnabled }); hud(r?.gamesEnabled ? 'Jeux visibles' : 'Jeux masqués pour tous les rôles'); }
    catch (e) { hud(e instanceof Error ? e.message : 'Échec de la modification.'); }
    setSending(false);
  };
  return (
    <div className="set-panel"><Head s={s} />
      <div className="set-group set-appcard enter" data-anchor="install"><span className="set-appico"><img src="icon-mark.svg" alt="" /></span>
        <div className="grow" style={{ display: 'grid', gap: 4, minWidth: 0 }}><b style={{ fontSize: 16 }}>Gearbox</b><span className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>Installe Gearbox comme une application sur ton ordinateur ou ton téléphone : icône dédiée, fenêtre propre, et les mises à jour arrivent toutes seules.</span><span className="faint" style={{ fontSize: 12.5 }}>Aucun fichier à télécharger, aucun store.</span></div>
        <button className="btn primary lg" onClick={onInstall}><Icon name={installed ? 'check' : 'download'} size="sm" />{installed ? 'Déjà installée' : 'Installer l’application'}</button></div>
      <div className="set-gt">Notifications</div>
      <div className="set-group enter" style={css({ '--i': 1, padding: '18px 20px' })} data-anchor="push"><PushBlock /></div>
      {canUseUi2(user.role) ? <>
        <div className="set-gt">Interface</div>
        <div className="set-group enter" style={css({ '--i': 2 })} data-anchor="beta">
          <Row t="Nouvelle interface (bêta)" d="Gearbox OS, en construction — l’ancienne interface reste accessible à tout moment" ico={<span className="set-ico" style={css({ '--c': 'var(--bony-orange)' })}><Icon name="desktop" /></span>}>
            <Switch on={beta} label="Activer la nouvelle interface (bêta)" onChange={(v) => setUi2Beta(user.id, v)} />
          </Row>
        </div>
        <div className="set-note">Éteindre cet interrupteur ramène à l’ancienne interface tout de suite, sur ce navigateur et pour ce compte seulement.</div>
      </> : null}
      {master ? <>
        <div className="set-gt">Modules <RoleBadge r="Master" /></div>
        <div className="set-group enter" style={css({ '--i': 2 })} data-anchor="modules">
          <Row t="Espace détente" d={gamesEnabled ? 'Visible de l’équipe : Master, Administrateur, Coordinateur et Digital Manager' : 'Masqué pour tous'} ico={<AppIco id="games" s={26} />}>
            <input type="checkbox" className="switch" checked={gamesEnabled} disabled={sending} aria-label="Afficher la rubrique Jeux" title={gamesEnabled ? 'Masquer la rubrique Jeux' : 'Afficher la rubrique Jeux'} onChange={setGames} />
          </Row>
        </div>
        <div className="set-note">Visible du Master seul. Le refus réel est côté serveur : masquer ce réglage ne ferme rien. Le Directeur a les droits d’un Administrateur, sauf les Jeux.</div>
      </> : null}
    </div>
  );
}

// ---------------------------------------------------------------- Stockage
export function StoragePanel({ s }: { s: SectionDef }) {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [err, setErr] = useState('');
  // BESOIN: ressource `storage` dans ui2/store/collections.ts (voir BESOINS.md § 2). Seule lecture
  // directe de la rubrique : le serveur met la réponse en cache 60 s, un appel par ouverture ne coûte rien.
  useEffect(() => { let live = true; db.getStorage().then((v) => live && setInfo(v)).catch(() => live && setErr("Impossible de lire l'espace disque (serveur injoignable ?).")); return () => { live = false; }; }, []);
  if (err || !info) return <div className="set-panel"><Head s={s} /><div className="set-group" style={{ padding: 22 }}>{err ? <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{err}</span> : <span className="muted">Calcul en cours…</span>}</div></div>;
  const used = info.disque.utilise, total = info.disque.total, pct = total > 0 ? Math.round((used / total) * 100) : 0;
  // Pourcentage du DISQUE (toutes causes) : c'est le risque réel de saturation. Seuils 75 / 90 %.
  const col = pct >= 90 ? 'var(--danger)' : pct >= 75 ? 'var(--warn)' : 'var(--bony-orange)';
  const TC: Record<string, string> = { chat: 'var(--info)', avatar: 'var(--bony-violet)', calendar: 'var(--bony-orange)' };
  const types = Object.entries(info.uploads.parType) as [string, { octets: number; fichiers: number }][];
  return (
    <div className="set-panel"><Head s={s} />
      <div className="set-group enter" style={{ padding: '22px 24px', display: 'grid', gap: 12 }} data-anchor="usage">
        <div className="row wrap" style={{ alignItems: 'baseline', gap: '6px 14px' }}><span style={{ fontSize: 13.5, fontWeight: 700 }}>Fichiers envoyés dans Gearbox :</span><b className="num" style={{ fontSize: 26, letterSpacing: '-.02em' }}>{octets(info.uploads.total)}</b><span className="grow" /><span className="muted num" style={{ fontSize: 13 }}>{octets(info.disque.libre)} libres</span></div>
        <div className="set-disk"><i style={css({ width: `${Math.min(pct, 100)}%`, '--c': col })} /></div>
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>Le disque du serveur est utilisé à <b style={{ color: 'var(--text)' }}>{pct} %</b> ({octets(used)} sur {octets(total)}). Il est partagé avec le système, ce n’est pas un quota propre à Gearbox.</div>
      </div>
      <div className="set-gt">Par type de fichier</div>
      <div className="set-group enter set-types" style={css({ '--i': 1 })} data-anchor="types">{types.map(([k, v]) => (
        <div key={k}><span className="dot" style={css({ '--c': TC[k] || 'var(--text-3)' })} /><span className="grow">{LIBELLES_TYPE[k] || k} <span className="faint">· {v.fichiers.toLocaleString('fr-FR')} fichier{v.fichiers > 1 ? 's' : ''}</span></span><b className="num">{octets(v.octets)}</b></div>))}</div>
      <div className="set-group enter" style={css({ '--i': 2, padding: '16px 20px' })} data-anchor="menage"><div className="row" style={{ gap: 12, alignItems: 'flex-start' }}><span className="set-ico" style={css({ '--c': 'var(--ok)' })}><Icon name="refresh" /></span><div className="muted" style={{ fontSize: 12.5, lineHeight: 1.55 }}><b style={{ color: 'var(--text)', display: 'block', marginBottom: 2 }}>Ménage automatique</b>Les médias d’une publication Digital archivée sont supprimés au bout de 30 jours, les pièces jointes du chat au bout de 180 jours (le message reste, la pièce jointe disparaît). Les photos de profil ne sont jamais supprimées automatiquement.</div></div></div>
      <div className="set-note">Visible par tous les rôles : savoir si le serveur sature concerne tout le monde.</div>
    </div>
  );
}
