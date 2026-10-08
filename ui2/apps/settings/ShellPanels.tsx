import React from 'react';
import { useBridge } from '../../os/bridge';
import { getPushState } from '../../../services/pushNotifications';
import { gx, hud, Icon, Seg, useEngineStore } from '../ui/kit';
import { Head, Row, Switch, css, roleLabel, type SectionDef } from './common';

// =====================================================================
// Réglages de la COQUE (Apparence, Bureau et Dock, Notifications) : préférences du moteur,
// lues dans `GX.shell.prefs` et écrites par `GX.shell.setPref` — rien n'est réimplémenté ici.
// Le thème passe par `GX.shell.toggleTheme`, qui bascule AUSSI le thème de l'appli (il fait foi).
// Ces préférences sont locales au compte et au navigateur (`GX.store`) : aucune écriture serveur.
// =====================================================================

const MATS: [string, string, string][] = [['pixel', 'Pixel', 'Flou dense teinté par le fond d’écran, sans reflet. Le réglage par défaut.'], ['liquid', 'Liquid Glass', 'Verre presque incolore : le fond d’écran reste visible au travers, liseré lumineux sur les bords.'], ['solid', 'Opaque', 'Aucune transparence ni flou : surfaces pleines, lecture maximale.']];
const ICS: [string, string, string][] = [['light', 'Claire', 'Couleurs iOS par rubrique'], ['dark', 'Sombre', 'Tuile noire, pictogramme coloré'], ['tinted', 'Teintée', 'Toutes à l’accent de la direction']];
// Ruban est dessiné en CSS (maquette.css) ; les autres viennent du catalogue du moteur (✦ = animé). Lot B, 08/10/2026.
const STATIC_WPS: [string, string][] = [['ruban', 'Ruban']];
const matNote = (eco: boolean) => eco
  ? <><b style={{ color: 'var(--warn)' }}>Effets économes actifs :</b> la matière est rendue Opaque partout tant qu’ils restent activés.</>
  : 'La matière habille tout ce qui sert à naviguer : barre de menus, Dock, menus, widgets, et le cadre des fenêtres (barre de titre, en-têtes, barre latérale). Le contenu des rubriques reste toujours plein, pour la lecture.';

const prefs = () => gx().shell.prefs as Record<string, any>;
const setPref = (k: string, v: unknown) => gx().shell.setPref(k, v);

// ---------------------------------------------------------------- Apparence
export function AppearancePanel({ s }: { s: SectionDef }) {
  const p = prefs();
  const theme = useBridge()?.theme || p.theme;
  const wps: [string, string][] = [...STATIC_WPS, ...(gx().wall ? gx().wall.catalog.map((d: any) => [d.id, d.name + (d.still ? '' : ' ✦')]) : [])];
  const mini = (t: string) => (
    <div className={`set-mini ${t}`}><div className={`wallpaper wp-${p.wallpaper}`} /><div className="mb" /><div className="w"><i style={{ top: '14%', width: '40%' }} /><i style={{ top: '30%', width: '52%' }} /><i style={{ top: '46%', width: '30%' }} /><i style={{ top: '62%', width: '46%' }} /></div><div className="mdk" /></div>
  );
  const setTheme = (t: string) => { if (theme !== t) gx().shell.toggleTheme(); };
  const shelf = ['dashboard', 'projects', 'chat', 'budget'].filter((id) => gx().app(id)).map((id) => gx().appIcon(id, 40)).join('');
  return (
    <div className="set-panel"><Head s={s} />
      <div className="set-gt">Thème</div>
      <div className="set-group enter" data-anchor="theme"><div className="set-themes">{[['dark', 'Sombre'], ['light', 'Clair']].map(([t, l]) => <button key={t} className="set-theme" aria-pressed={theme === t} onClick={() => setTheme(t)}>{mini(t)}<span>{l}</span></button>)}</div></div>
      <div className="set-gt">Matière</div>
      <div className="set-group enter" style={css({ '--i': 1 })} data-anchor="matiere"><div className="set-mats">{MATS.map(([m, l, d]) => (
        <button key={m} className="set-mat" aria-pressed={(p.material || 'pixel') === m} onClick={() => { setPref('material', m); hud('Matière : ' + l); }}>
          <div className={`set-matv m-${m}`}><div className={`wallpaper wp-${p.wallpaper}`} /><i className="blob b1" /><i className="blob b2" /><div className="bar" /><div className="pane" /><div className="dk" /></div>
          <b>{l}{m === 'liquid' ? <> <span className="badge" style={css({ '--c': 'var(--text-3)' })}>défaut</span></> : null}</b><small>{d}</small></button>))}</div></div>
      <div className="set-note">{matNote(p.effects === 'eco')}</div>
      <div className="set-gt">Style d’icônes</div>
      <div className="set-group enter" style={css({ '--i': 1 })} data-anchor="icones"><div className="set-icps">{ICS.map(([k, l, d]) => (
        <button key={k} className="set-icp" data-ic={k} aria-pressed={(p.iconStyle || 'light') === k} onClick={() => { setPref('iconStyle', k); hud('Icônes : ' + l); }}>
          <div className="set-icv"><div className={`wallpaper wp-${p.wallpaper}`} /><div className="shelf" dangerouslySetInnerHTML={{ __html: shelf }} /></div><b>{l}</b><small>{d}</small></button>))}</div></div>
      <div className="set-gt">Effets visuels</div>
      <div className="set-group enter" style={css({ '--i': 1 })} data-anchor="effets"><div className="set-opts">
        <button className="set-opt" aria-pressed={p.effects !== 'eco'} onClick={() => { setPref('effects', 'full'); hud('Effets complets'); }}><span className="set-radio" /><div><b><Icon name="bolt" size="sm" />Complets</b><small>Verre dépoli, transparences et animations à ressort : l’expérience Bureau telle qu’elle est pensée.</small></div></button>
        <button className="set-opt" aria-pressed={p.effects === 'eco'} onClick={() => { setPref('effects', 'eco'); hud('Effets économes : aucun flou'); }}><span className="set-radio" /><div><b><Icon name="leaf" size="sm" />Économes</b><small>Aucun flou ni transparence, animations raccourcies. Pour les PC qui chauffent ou dont le ventilateur s’emballe.</small></div></button>
      </div></div>
      <div className="set-note">Le flou d’arrière-plan (backdrop-filter) est l’effet le plus coûteux pour la carte graphique : le mode économe le supprime partout, sans rien changer d’autre.</div>
      <div className="set-gt">Fond d’écran</div>
      <div className="set-group enter" style={css({ '--i': 2 })} data-anchor="wallpaper"><div className="set-wps">{wps.map(([w, l]) => (
        <button key={w} className="set-wp" aria-pressed={p.wallpaper === w} onClick={() => setPref('wallpaper', w)}><div className="v"><div className={`wallpaper wp-${w}`} /><span className="ck"><Icon name="check" /></span></div>{l}</button>))}</div></div>
      <div className="set-gt">Bureau</div>
      <div className="set-group enter" style={css({ '--i': 3 })} data-anchor="widgets"><Row t="Widgets du bureau" d="Budget, projets en retard, prochaines publications, absents et Chat, posés sur le fond d’écran"><Switch on={!!p.widgets} label="Widgets du bureau" onChange={(v) => setPref('widgets', v)} /></Row></div>
    </div>
  );
}

// ---------------------------------------------------------------- Bureau et Dock
export function DesktopPanel({ s, role, openSheet }: { s: SectionDef; role: string; openSheet: (r: (close: (v?: unknown) => void) => React.ReactNode, o?: { width?: number }) => unknown }) {
  const p = prefs(), n = gx().wm.list().length, sp = gx().wm.spaces().length;
  const dockIcons = ['dashboard', 'projects', 'chat', 'agenda', 'budget'].filter((id) => gx().app(id)).map((id) => gx().appIcon(id, Math.round(p.dockSize * 0.62))).join('');
  const confirm = (title: string, body: React.ReactNode, ok: () => void) => openSheet((close) => (
    <><h3>{title}</h3><div className="muted">{body}</div>
      <div className="foot"><button className="btn" onClick={() => close()}>Annuler</button><button className="btn primary" style={{ background: 'var(--danger)' }} onClick={() => { close('ok'); ok(); }}>Réinitialiser</button></div></>));
  const editWidgets = () => { if (!prefs().widgets) setPref('widgets', true); gx().widgets?.edit?.(true); };
  const resetWidgets = () => confirm('Réinitialiser les widgets ?', <>Les widgets du bureau reprennent la disposition par défaut de votre rôle ({roleLabel(role)}). Leurs réglages (notes, contenus choisis) sont oubliés.</>, () => {
    // BESOIN: `GX.widgets.reset()` dans le moteur (voir BESOINS.md § 5). Bouchon : même geste que la
    // maquette — la disposition est oubliée, puis 'ctx' fait relire au moteur (`layout = null`).
    gx().store.del('widgets'); if (!prefs().widgets) setPref('widgets', true); gx().emit('ctx'); hud('Widgets réinitialisés');
  });
  const resetSession = () => confirm('Réinitialiser la session des fenêtres ?', 'Toutes les fenêtres se ferment, leurs positions, ancrages et bureaux sont oubliés, puis Gearbox OS se recharge. Vos données et préférences restent intactes.', () => gx().wm.resetSession?.());
  return (
    <div className="set-panel"><Head s={s} />
      <div className="set-gt">Dock</div>
      <div className="set-group enter" data-anchor="dock">
        <div className="set-dockprev"><div className="set-dockbar" dangerouslySetInnerHTML={{ __html: dockIcons }} /></div>
        <Row t="Taille" d={`${p.dockSize} px`} cls="stk"><div className="set-rangebox"><span>Petite</span><input type="range" className="range" min={38} max={64} step={1} value={p.dockSize} aria-label="Taille du Dock" onChange={(e) => setPref('dockSize', +e.target.value)} /><span>Grande</span></div></Row>
        <Row t="Agrandissement" d="Les icônes grossissent sous le pointeur, comme sur macOS"><Switch on={!!p.dockMag} label="Agrandissement" onChange={(v) => setPref('dockMag', v)} /></Row>
        <Row t="Masquer automatiquement le Dock" d="Il réapparaît quand le pointeur touche le bas de l’écran ; les fenêtres agrandies gagnent la place"><Switch on={!!p.dockAutohide} label="Masquer automatiquement le Dock" onChange={(v) => setPref('dockAutohide', v)} /></Row>
        <Row t="Dock intelligent" d="S’efface quand une fenêtre agrandie ou ancrée le recouvre ; il revient dès que le pointeur approche du bas de l’écran"><Switch on={p.dockSmart !== false} label="Dock intelligent" onChange={(v) => setPref('dockSmart', v)} /></Row>
        <Row t="Barre du haut escamotable" d="La barre de menus se replie et réapparaît quand le pointeur touche le bord haut de l’écran"><Switch on={p.menubarAuto !== false} label="Barre du haut escamotable" onChange={(v) => setPref('menubarAuto', v)} /></Row>
      </div>
      <div className="set-gt">Widgets du bureau</div>
      <div className="set-group enter" style={css({ '--i': 1 })} data-anchor="wdg">
        <Row t="Personnaliser les widgets du bureau…" d="Ajouter, ranger par glisser-déposer, changer de taille. Les fenêtres s’écartent le temps de l’édition." cls="stk"><button className="btn" onClick={editWidgets}><Icon name="edit" size="sm" />Personnaliser…</button></Row>
        <Row t="Réinitialiser les widgets" d="Revient à la disposition par défaut de votre rôle" cls="stk"><button className="btn danger" onClick={resetWidgets}><Icon name="refresh" size="sm" />Réinitialiser…</button></Row>
      </div>
      <div className="set-gt">Fenêtres</div>
      <div className="set-group enter" style={css({ '--i': 2 })} data-anchor="session">
        <SwipeRows />
        <Row t="Session en cours" d={`${n} fenêtre${n > 1 ? 's' : ''} ouverte${n > 1 ? 's' : ''} · ${sp} bureau${sp > 1 ? 'x' : ''}. Positions, ancrages et bureaux sont restaurés à la prochaine ouverture.`}><span className="badge" style={css({ '--c': 'var(--ok)' })}><i className="dot" />Enregistrée</span></Row>
        <Row t="Réinitialiser la session des fenêtres" d="Referme toutes les fenêtres et oublie leurs positions. La page se recharge." cls="stk"><button className="btn danger" onClick={resetSession}><Icon name="refresh" size="sm" />Réinitialiser…</button></Row>
      </div>
    </div>
  );
}

// Balayage 2 doigts entre fenêtres (ui2/os/engine/winswipe.ts) — EN ESSAI : les deux rendus sont
// proposés pour comparaison ; `gestureLite` coupe le verre des fenêtres pendant le geste (mesure).
type SwipeMode = 'auto' | 'slide' | 'strip' | 'off';
function SwipeRows() {
  const [m, setM] = useEngineStore<SwipeMode>('gestureMode', 'auto');
  const [lite, setLite] = useEngineStore<boolean>('gestureLite', false);
  return (
    <>
      <Row t="Balayage à deux doigts entre les fenêtres" d="Sur une fenêtre : fenêtre suivante ou précédente, dans l’ordre du Dock. Sur le fond : bureau suivant. Auto = Glissement si la fenêtre est agrandie, Bandeau sinon." cls="stk">
        <Seg<SwipeMode> value={m} onChange={setM} options={[['auto', 'Auto'], ['slide', 'Glissement'], ['strip', 'Bandeau'], ['off', 'Désactivé']]} />
      </Row>
      <Row t="Verre coupé pendant le balayage" d="Les fenêtres deviennent opaques le temps du geste : plus fluide sur un PC modeste"><Switch on={lite} label="Verre coupé pendant le balayage" onChange={setLite} /></Row>
    </>
  );
}

// ---------------------------------------------------------------- Notifications
// Seul « Ne pas déranger » est une préférence RÉELLE de la coque. Les interrupteurs « Autoriser les
// notifications » et « par rubrique » de la maquette sont un état fictif sans effet dans le moteur :
// ils ne sont pas portés (voir BESOINS.md § 6).
export function NotifsPanel({ s, onPush }: { s: SectionDef; onPush: () => void }) {
  const p = prefs(), push = getPushState();
  const pushTxt = push === 'granted' ? 'activées' : push === 'denied' ? 'refusées par le navigateur' : push === 'unsupported' ? 'non gérées par ce navigateur' : push === 'ios-needs-install' ? 'possibles après installation' : 'non activées';
  const test = () => gx().shell.notify({ app: 'settings', title: 'Notification de test', body: p.dnd ? 'Ne pas déranger est actif : elle arrive sans bannière.' : 'Voici à quoi ressemble une bannière Gearbox.' });
  return (
    <div className="set-panel"><Head s={s} />
      <div className="set-group enter" data-anchor="notifs">
        <Row t="Ne pas déranger" d="Les bannières sont coupées ; tout reste consultable dans le centre de notifications" ico={<span className="set-ico" style={css({ '--c': 'var(--bony-violet)' })}><Icon name="moon" /></span>}>
          <Switch on={!!p.dnd} label="Ne pas déranger" onChange={(v) => { setPref('dnd', v); hud(v ? 'Ne pas déranger activé' : 'Ne pas déranger désactivé'); }} />
        </Row>
      </div>
      <div className="set-group enter" style={css({ '--i': 1 })}><Row t="Notifications de cet appareil" d={`Messages du Chat reçus même Gearbox fermé · ${pushTxt}`} cls="stk"><button className="btn sm" onClick={onPush}><Icon name="chevright" size="sm" />Régler</button></Row></div>
      <div className="set-foot"><button className="btn" onClick={test}><Icon name="bell" size="sm" />Envoyer une notification de test</button></div>
    </div>
  );
}

