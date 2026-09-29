/* =====================================================================
   Rubrique « Réglages » (miroir de pages/Settings.tsx), façon Réglages
   Système de macOS : barre latérale (profil + recherche) → panneaux.
   - Compte : identité, sécurité (jamais préremplie, rien n'est enregistré)
   - Apparence, Bureau et Dock : préférences de la coque (GX.shell.setPref)
   - Notifications, Application (Jeux visibles : Master seul), Stockage
   - Utilisateurs (Master / Administrator / Director) : règles réelles —
     suppression Master + Administrator seulement, jamais le compte Master,
     un Director n'attribue que Coordinator / Digital Manager / Guest / External,
     « Concessions rattachées » seulement pour un Site Manager
   - Rôles & accès : « Voir comme » + matrice issue de GX.data.ACCESS
   - large = split ; étroit = pile liste → panneau
   v2.2 (parité Settings.tsx) : photo de profil (glisser-déposer, recadrage
   rond, zoom, jpg/png/gif/webp ≤ 5 Mo, Supprimer la photo) pour soi ET pour
   un autre compte depuis la gestion ; Ville = liste des sites ; règles de mot
   de passe réelles (≥ 4 caractères, confirmation) ; modale « Installer
   Gearbox » (Windows / Android / iOS) ; notifications push de l'appareil
   (activer, refusé, activées) ; « Espace détente » Master ; Stockage réel
   (disque du serveur, seuils 75/90 %, fichiers par type, ménage automatique) ;
   tableau utilisateurs à 8 colonnes, mot de passe « •••••• » éditable,
   concessions rattachées avec avertissement « ne verra aucune donnée ».
   ===================================================================== */
(() => {
  const D = GX.data, F = GX.fmt, ME = 'me';
  const RANKS = ['Master', 'Administrator', 'Director', 'Coordinator', 'Digital Manager', 'Guest', 'External', 'Site Manager'];
  const DIRECTOR_CAN = ['Coordinator', 'Digital Manager', 'Guest', 'External'];
  const ROLE_C = { Master: 'var(--bony-orange)', Administrator: 'var(--bony-violet)', Director: 'var(--info)', Coordinator: 'var(--ok)', 'Digital Manager': 'var(--cyan)', Guest: 'var(--text-3)', External: 'var(--warn)', 'Site Manager': 'var(--danger)' };
  const ROLE_SHORT = { Master: 'Master', Administrator: 'Admin.', Director: 'Dir.', Coordinator: 'Coord.', 'Digital Manager': 'Digital', Guest: 'Invité', External: 'Externe', 'Site Manager': 'Chef site' };
  const READ_ONLY = ['Guest', 'Site Manager'];
  const WP_TINT = { sunset: ['#43203f', '#f1d9e6'], night: ['#1c2a52', '#d9e1f5'], dawn: ['#4a2320', '#f6dcd3'], volcans: ['#3a1f36', '#ecd9ea'], graphite: ['#25232b', '#e6e4ec'] };   /* = os.css */
  const MATS = [['pixel', 'Pixel', 'Flou dense teinté par le fond d’écran, sans reflet. Le réglage par défaut.'], ['liquid', 'Liquid Glass', 'Verre presque incolore : le fond d’écran reste visible au travers, liseré lumineux sur les bords.'], ['solid', 'Opaque', 'Aucune transparence ni flou : surfaces pleines, lecture maximale.']];
  const ICS = [['light', 'Claire', 'Couleurs iOS par rubrique'], ['dark', 'Sombre', 'Tuile noire, pictogramme coloré'], ['tinted', 'Teintée', 'Toutes à l’accent de la direction']];
  const MATNOTE = (eco) => eco ? '<b style="color:var(--warn)">Effets économes actifs :</b> la matière est rendue Opaque partout tant qu’ils restent activés.' : 'La matière habille tout ce qui sert à naviguer : barre de menus, Dock, menus, widgets, et le cadre des fenêtres (barre de titre, en-têtes, barre latérale). Le contenu des rubriques reste toujours plein, pour la lecture.';
  const WPS = [...(GX.wall ? GX.wall.catalog.map((d) => [d.id, d.name + ' ✦']) : []), ['sunset', 'Coucher de soleil'], ['night', 'Nuit'], ['dawn', 'Aube'], ['volcans', 'Volcans'], ['graphite', 'Graphite'], ['carbone', 'Carbone'], ['grille', 'Grille']];
  const DAS = [['nocturne', 'Nocturne', 'La nuit Bony · bleu nuit, lueurs orange → violet', ['#0a0e1f', '#19213f', '#f75632', '#a52fce']], ['carbone', 'Carbone', 'Instrument de bord · graphite mat, un seul accent', ['#0c0c0e', '#1c1c20', '#f75632', '#f75632']], ['signal', 'Signal', 'Grille et traces lumineuses · angles vifs', ['#08080a', '#15151a', '#ff5a2e', '#b43bff']]];
  const MATRIX_APPS = ['hello', 'dashboard', 'projects', 'todo', 'digital', 'chat', 'campaigns', 'material', 'agenda', 'budget', 'fixed', 'conges', 'export', 'games', 'archives', 'settings'];
  const SECTIONS = [
    { id: 'compte', l: 'Compte', t: 'Paramètres du Compte', icon: 'user', c: 'var(--info)', g: 0, sub: 'Identité, ville de référence et mot de passe' },
    { id: 'apparence', l: 'Apparence', icon: 'contrast', c: 'var(--bony-violet)', g: 1, sub: 'Thème, matière, style d’icônes, effets et fond d’écran' },
    { id: 'bureau', l: 'Bureau et Dock', icon: 'desktop', c: 'var(--bony-blue)', g: 1, desktop: true, sub: 'Dock, widgets du bureau et session des fenêtres' },
    { id: 'notifs', l: 'Notifications', icon: 'bell', c: 'var(--danger)', g: 1, sub: 'Bannières, Ne pas déranger, par rubrique' },
    { id: 'application', l: 'Application', icon: 'download', c: 'var(--ok)', g: 2, sub: 'Installation, notifications de cet appareil et modules' },
    { id: 'stockage', l: 'Stockage', icon: 'layers', c: 'var(--text-3)', g: 2, sub: 'Disque du serveur et fichiers envoyés dans Gearbox' },
    { id: 'users', l: 'Utilisateurs', t: 'Gestion des Utilisateurs (Master/Admin)', icon: 'users', c: 'var(--bony-orange)', g: 3, roles: ['Master', 'Administrator', 'Director'], sub: 'Comptes, rangs, villes, anniversaires et concessions rattachées' },
    { id: 'roles', l: 'Rôles & accès', icon: 'lock', c: 'var(--warn)', g: 3, sub: 'Qui voit quoi dans Gearbox' },
  ];
  /* Réglages cherchables : [libellé, section, ancre] */
  const ITEMS = [
    ['Nom affiché', 'compte', 'identite'], ['Ville de référence (météo)', 'compte', 'identite'], ['Date de naissance', 'compte', 'identite'], ['Mot de passe', 'compte', 'securite'], ['Identifiant de connexion', 'compte', 'carte'], ['Photo de profil', 'compte', 'carte'],
    ['Barre du haut escamotable', 'bureau', 'dock'], ['Notifications de cet appareil (push)', 'application', 'push'], ['Espace détente (Jeux)', 'application', 'modules'], ['Ménage automatique des fichiers', 'stockage', 'menage'],
    ['Direction artistique (Nocturne, Carbone, Signal)', 'apparence', 'da'], ['Thème clair ou sombre', 'apparence', 'theme'], ['Matière (Pixel, Liquid Glass, Opaque)', 'apparence', 'matiere'], ['Style d’icônes', 'apparence', 'icones'], ['Effets économes (flou, transparence)', 'apparence', 'effets'], ['Fond d’écran', 'apparence', 'wallpaper'], ['Widgets du bureau', 'apparence', 'widgets'],
    ['Taille du Dock', 'bureau', 'dock'], ['Agrandissement du Dock', 'bureau', 'dock'], ['Masquer automatiquement le Dock', 'bureau', 'dock'], ['Dock intelligent', 'bureau', 'dock'], ['Personnaliser les widgets du bureau', 'bureau', 'wdg'], ['Réinitialiser les widgets', 'bureau', 'wdg'], ['Réinitialiser la session des fenêtres', 'bureau', 'session'],
    ['Autoriser les notifications', 'notifs', 'notifs'], ['Ne pas déranger', 'notifs', 'notifs'], ['Notifications par rubrique', 'notifs', 'perapp'],
    ['Installer l’application', 'application', 'install'],
    ['Utilisation du stockage', 'stockage', 'usage'], ['Fichiers par type', 'stockage', 'types'],
    ['Gestion des Utilisateurs', 'users', 'users'], ['Nouvel Utilisateur', 'users', 'users'], ['Concessions rattachées', 'users', 'users'],
    ['Voir comme', 'roles', 'voir'], ['Matrice des accès', 'roles', 'matrix'], ['Chef de site', 'roles', 'note'],
  ];
  /* État fictif, en mémoire, partagé entre deux ouvertures de la fenêtre */
  const S = {
    notifs: true, perApp: { chat: true, projects: true, digital: true, conges: true, games: true, agenda: false }, installed: false,
    push: 'default',                                  // NotificationsToggle : default | granted | denied
    storageLoaded: false, gamesRoles: null,
    /* Miroir de GET /api/storage (StorageInfo) : disque du serveur + fichiers envoyés, par type */
    storage: { disque: { total: 80 * 2 ** 30, utilise: 31.6 * 2 ** 30 }, parType: { chat: { octets: 612 * 2 ** 20, fichiers: 1284 }, avatar: { octets: 2.1 * 2 ** 20, fichiers: 14 }, calendar: { octets: 1.7 * 2 ** 30, fichiers: 598 } } },
  };
  const LIBELLES_TYPE = { chat: 'Chat (pièces jointes)', avatar: 'Photos de profil', calendar: 'Digital (médias)' };
  /* formatOctets() de Settings.tsx, à l'identique */
  const octets = (o) => o <= 0 ? '0 o' : o < 1024 ? `${o} o` : o < 2 ** 20 ? `${(o / 1024).toFixed(0)} Ko` : o < 2 ** 30 ? `${(o / 2 ** 20).toFixed(o < 10 * 2 ** 20 ? 1 : 0).replace('.', ',')} Mo` : `${(o / 2 ** 30).toFixed(1).replace('.', ',')} Go`;
  /* Photos de profil posées dans la maquette (mémoire seulement) */
  const PHOTO = {};
  const DIRECTOR_NOTE = 'Directeur : rangs attribuables Coordinateur, Digital Manager, Invité et Externe. Le rang Chef de site et les rangs de direction restent réservés au Master et aux Administrateurs.';
  const loginOf = (u) => (u.login ??= u.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, '').trim().split(/\s+/).join('.'));
  const isMobile = () => !!document.getElementById('mroot');
  const roleBadge = (r) => `<span class="badge" style="--c:${ROLE_C[r] || 'var(--text-3)'}">${GX.esc(D.ROLES[r]?.l || r)}</span>`;
  /* Ville de référence = un des SITES (Select réel) ; les villes libres des données fictives y sont ramenées */
  const siteOf = (c) => (!c ? '' : D.SITES.includes(c) ? c : D.SITES.find((s) => c.startsWith(s) || s.startsWith(c)) || '');
  const avHTML = (u, cls = '') => PHOTO[u.id] ? `<span class="av ${cls}" style="--c:${u.color};background:center/cover url('${PHOTO[u.id]}')"></span>` : `<span class="av ${cls}" style="--c:${u.color}">${GX.esc(u.initials)}</span>`;
  const bday = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); };
  const secIco = (s, cls = '') => `<span class="set-ico ${cls}" style="--c:${s.c}">${GX.icon(s.icon)}</span>`;

  GX.css(`
  .set-side{display:flex;flex-direction:column;height:100%;min-height:0}
  .set-prof{display:flex;align-items:center;gap:10px;margin:12px 10px 6px;padding:9px 10px;border-radius:14px;text-align:left;transition:background var(--t-fast)}
  .set-prof:hover,.set-prof.on{background:var(--surface-3)}
  .set-prof b{display:block;font-size:14px;line-height:1.2}.set-prof small{color:var(--text-3);font-size:11.5px}
  .set-search{margin:2px 10px 6px}
  .set-nav{flex:1;min-height:0;padding:0 8px 12px}
  .set-navg{display:grid;gap:1px;padding:6px 0}.set-navg+.set-navg{border-top:1px solid var(--line)}
  .set-nav .side-it{gap:10px}
  .set-nav .side-it.on .set-ico svg.i{color:#fff}
  .set-nav.big .side-it{height:44px;font-size:14px}.set-nav.big .side-it .chev{margin-left:auto;color:var(--text-3)}
  .set-nav .res small{margin-left:auto;font-size:11px;color:var(--text-3);white-space:nowrap}
  .set-ico{--sz:22px;width:var(--sz);height:var(--sz);border-radius:calc(var(--sz) * .28);display:grid;place-items:center;color:#fff;background:var(--c);flex:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.25),0 1px 2px rgba(0,0,0,.2)}
  .set-ico svg.i{width:62%;height:62%;stroke-width:2.1}
  .set-ico.lg{--sz:46px}
  .set-panel{padding:0 30px 44px;display:grid;gap:10px;align-content:start;min-width:0}
  .set-panel > .app-head{padding:22px 0 8px;margin:0;background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
  .set-h{display:flex;align-items:center;gap:14px;margin-bottom:6px}
  .set-h h2{font-size:21px}.set-h .muted{font-size:12.5px}
  .set-gt{font-family:var(--font-display);font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text);margin:16px 2px 4px;display:flex;align-items:center;gap:10px}
  .set-group{background:var(--surface-2);border-radius:var(--r-lg);border:1px solid var(--line);overflow:hidden;min-width:0}
  .set-row{display:flex;align-items:center;gap:14px;min-height:58px;padding:12px 20px}
  .set-row+.set-row{border-top:1px solid var(--line)}
  .set-row .t{flex:1;min-width:0}.set-row .t b{display:block;font-weight:650;font-size:14px}.set-row .t small{display:block;color:var(--text-2);font-size:12.5px;line-height:1.45;margin-top:2px}
  .set-cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 22px;align-items:start}
  .set-cols > div{display:grid;gap:10px;align-content:start;min-width:0}
  @container app (max-width:1100px){.set-cols{grid-template-columns:1fr}}
  .set-row .ctl{flex:none;display:flex;align-items:center;gap:8px;min-width:0}
  .set-row .ctl .input,.set-row .ctl .select{width:260px}
  .set-row.dis{opacity:.45;pointer-events:none}
  .set-note{font-size:12.5px;color:var(--text-2);margin:6px 4px 0;line-height:1.5}
  .set-foot{display:flex;align-items:center;gap:10px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap}
  .set-msg{font-size:12px;font-weight:600;flex:1;min-width:0}
  .set-idcard{display:flex;align-items:center;gap:20px;padding:22px 24px}
  .set-avbtn{position:relative;border-radius:50%;flex:none;display:grid}
  .set-avbtn::after{content:"";position:absolute;inset:0;border-radius:50%;background:rgba(0,0,0,.5) center/26px no-repeat url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 8h3l2-3h6l2 3h3v11H4z'/%3E%3Ccircle cx='12' cy='13' r='3.5'/%3E%3C/svg%3E");opacity:0;transition:opacity var(--t-fast)}
  .set-avbtn:hover::after,.set-avbtn:focus-visible::after{opacity:1}
  .set-avbtn.sm::after{background-size:14px}
  .set-link{font-size:12.5px;font-weight:700;color:var(--accent);text-decoration:underline;text-underline-offset:2px;justify-self:start}
  .set-drop{height:176px;border-radius:14px;border:2px dashed var(--line-3,var(--line-2));display:grid;place-content:center;justify-items:center;gap:6px;text-align:center;cursor:pointer;transition:border-color var(--t-fast),background var(--t-fast);margin-top:14px}
  .set-drop:hover,.set-drop.over{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 8%,transparent)}
  .set-drop svg.i{width:30px;height:30px;color:var(--text-3)}
  .set-crop{margin-top:14px;height:240px;border-radius:14px;background:#000;display:grid;place-items:center;overflow:hidden;position:relative}
  .set-crop .c{width:200px;height:200px;border-radius:50%;background-repeat:no-repeat;background-position:center;box-shadow:0 0 0 999px rgba(0,0,0,.55);cursor:grab}
  .set-zoom{display:flex;align-items:center;gap:10px;margin-top:10px}.set-zoom input{flex:1}
  .set-dev{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--surface-2)}
  .set-dev + .set-dev{margin-top:8px}
  .set-dev > button{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px;text-align:left}
  .set-dev > button b{display:block;font-size:14px}.set-dev > button small{display:block;font-size:12px;color:var(--text-2)}
  .set-dev .bd{padding:0 16px 14px 16px;font-size:13px;color:var(--text-2);line-height:1.55;display:none}
  .set-dev.open .bd{display:block}.set-dev.open{box-shadow:inset 0 0 0 1.5px var(--accent)}
  .set-dev ol{margin:0;padding-left:20px;display:grid;gap:6px}.set-dev ol b{color:var(--text)}
  .set-devico{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;background:var(--surface-3);flex:none;font-weight:800;font-size:12px;color:var(--text)}
  .set-push{display:grid;gap:8px}
  .set-push .st{display:flex;align-items:center;gap:8px;font-weight:700;font-size:13.5px}
  .set-push p{margin:0;font-size:12.5px;color:var(--text-2);line-height:1.5}
  .set-push.warn p{color:var(--warn)}
  .set-disk{height:12px;border-radius:99px;background:var(--surface-3);overflow:hidden}
  .set-disk i{display:block;height:100%;border-radius:inherit;background:var(--c);transform-origin:left;animation:ui-grow var(--t-slow) var(--spring-soft) both}
  .set-types{display:grid;gap:0}
  .set-types > div{display:flex;align-items:center;gap:10px;padding:12px 20px;font-size:13.5px}
  .set-types > div + div{border-top:1px solid var(--line)}
  .set-types .dot{width:10px;height:10px;border-radius:3px;background:var(--c);flex:none}
  .set-usr-err{font-size:13px;font-weight:600;color:var(--danger);background:color-mix(in srgb,var(--danger) 10%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--danger) 30%,transparent);border-radius:10px;padding:10px 14px}
  .set-warn{font-size:12px;font-weight:700;color:var(--danger)}
  .set-idcard .av.xl{--s:72px;box-shadow:0 0 0 3px var(--surface-2),0 0 0 5px color-mix(in srgb,var(--accent) 50%,transparent)}
  .set-idcard h3{font-size:19px}
  .set-login{font-family:ui-monospace,Consolas,monospace;font-size:12px;color:var(--text-2)}
  .set-pw{display:grid;gap:5px;width:260px}
  .set-meter{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}
  .set-meter i{height:4px;border-radius:2px;background:var(--surface-4);transition:background var(--t-med)}
  .set-pwinfo{display:flex;justify-content:space-between;gap:8px;font-size:11px;min-height:15px}
  .set-themes{display:grid;grid-template-columns:repeat(2,minmax(0,210px));gap:16px;padding:16px}
  .set-theme{display:grid;gap:8px;justify-items:center;font-weight:600;font-size:12px;color:var(--text-2)}
  .set-theme[aria-pressed="true"]{color:var(--text)}
  .set-mini{position:relative;width:100%;aspect-ratio:16/10;border-radius:12px;overflow:hidden;box-shadow:0 0 0 1px var(--line-2);transition:box-shadow var(--t-fast),transform var(--t-med) var(--spring-bouncy)}
  .set-theme:hover .set-mini,.set-wp:hover .v{transform:translateY(-2px)}
  .set-theme[aria-pressed="true"] .set-mini,.set-wp[aria-pressed="true"] .v{box-shadow:0 0 0 2.5px var(--accent),0 0 0 6px var(--focus)}
  .set-mini .wallpaper,.set-wp .wallpaper{position:absolute;inset:0}
  .set-mini.dark{--mb:rgba(30,26,38,.85);--mw:#16141c;--ms:#110f16;--ml:#332e3f}
  .set-mini.light{--mb:rgba(250,249,253,.88);--mw:#ffffff;--ms:#f3f2f7;--ml:#e2e0ea;background:#e9e7ef}
  .set-mini.light .wallpaper{opacity:.3}
  .set-mini .mb{position:absolute;left:0;right:0;top:0;height:9%;background:var(--mb)}
  .set-mini .w{position:absolute;left:13%;top:19%;width:64%;height:58%;border-radius:6px;background:var(--mw);box-shadow:0 5px 14px rgba(0,0,0,.35);overflow:hidden}
  .set-mini .w::before{content:"";position:absolute;left:0;top:0;bottom:0;width:30%;background:var(--ms)}
  .set-mini .w i{position:absolute;left:36%;height:7%;border-radius:3px;background:var(--ml)}
  .set-mini .mdk{position:absolute;left:30%;right:30%;bottom:5%;height:9%;border-radius:4px;background:var(--mb)}
  .set-opts{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:12px}
  .set-opt{display:flex;align-items:flex-start;gap:10px;padding:12px;border-radius:12px;background:var(--surface-3);box-shadow:inset 0 0 0 1px var(--line);text-align:left;transition:background var(--t-fast),box-shadow var(--t-fast)}
  .set-opt[aria-pressed="true"]{background:var(--sel);box-shadow:inset 0 0 0 1.5px var(--accent)}
  .set-opt b{display:flex;align-items:center;gap:6px}.set-opt small{display:block;font-size:12px;color:var(--text-3);line-height:1.45;margin-top:3px}
  .set-radio{width:18px;height:18px;border-radius:50%;box-shadow:inset 0 0 0 1.5px var(--line-3);flex:none;margin-top:1px;transition:box-shadow var(--t-med) var(--spring-bouncy),background var(--t-fast)}
  .set-opt[aria-pressed="true"] .set-radio{background:var(--accent);box-shadow:inset 0 0 0 5px var(--surface-2)}
  .set-wps{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:14px;padding:16px}
  .set-wp{display:grid;gap:7px;font-size:12px;font-weight:600;color:var(--text-2);text-align:center}
  .set-wp[aria-pressed="true"]{color:var(--text)}
  .set-wp .v{position:relative;aspect-ratio:16/10;border-radius:10px;overflow:hidden;box-shadow:0 0 0 1px var(--line-2);transition:box-shadow var(--t-fast),transform var(--t-med) var(--spring-bouncy)}
  .set-wp .ck{position:absolute;right:6px;bottom:6px;width:18px;height:18px;border-radius:50%;background:var(--bony-grad);color:#fff;display:grid;place-items:center;opacity:0;transform:scale(.3);transition:opacity var(--t-fast),transform var(--t-med) var(--spring-bouncy)}
  .set-wp .ck svg.i{width:11px;height:11px;stroke-width:3}
  .set-wp[aria-pressed="true"] .ck{opacity:1;transform:none}
  .set-dockprev{display:flex;justify-content:center;padding:6px 12px 16px}
  .set-dockbar{display:flex;align-items:flex-end;gap:6px;padding:6px 8px;border-radius:16px;background:var(--surface-3);box-shadow:inset 0 0 0 1px var(--line-2)}
  .set-dockbar .app-ico{transition:width var(--t-med) var(--spring-snappy),height var(--t-med) var(--spring-snappy)}
  .set-rangebox{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;width:280px;font-size:11px;color:var(--text-3)}
  .set-sbar{display:flex;gap:2px;height:22px;border-radius:7px;overflow:hidden;background:var(--surface-3)}
  .set-sbar i{display:block;height:100%;background:var(--c);transform-origin:left;animation:ui-grow var(--t-slow) var(--spring-soft) both;transition:width var(--t-slow) var(--spring-soft)}
  .set-legend{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:14px}
  .set-legend div{display:flex;align-items:center;gap:8px;font-size:12px;min-width:0}
  .set-legend .dot{width:10px;height:10px;border-radius:3px;background:var(--c);flex:none}
  .set-appcard{display:flex;align-items:center;gap:16px;padding:18px}
  .set-appico{width:64px;height:64px;border-radius:16px;display:grid;place-items:center;background:linear-gradient(160deg,var(--surface-4),var(--surface-1));box-shadow:inset 0 0 0 1px var(--line-2),var(--shadow-1);flex:none}
  .set-appico img{width:36px;height:36px}
  .set-install{position:relative;overflow:hidden;min-width:190px}
  .set-install .pg{position:absolute;left:0;top:0;bottom:0;width:0;background:rgba(255,255,255,.28);transition:width 1.6s var(--ease-out)}
  .set-utools{display:flex;align-items:center;gap:8px;padding:12px;border-bottom:1px solid var(--line);flex-wrap:wrap}
  .set-utbl td{height:56px}.set-utbl tbody tr:nth-child(even) td{background:color-mix(in srgb,var(--surface-3) 35%,transparent)}
  .set-utbl .ic{display:inline-flex;align-items:center;gap:5px}.set-utbl .ic svg.i{width:12px;height:12px}
  .set-utbl .me td{background:color-mix(in srgb,var(--accent) 6%,transparent)}
  .set-ulist{display:none;padding:6px}
  .set-ulist .list-row{cursor:pointer;min-height:54px}
  .set-sites{display:grid;gap:8px;padding:12px;border-radius:12px;background:color-mix(in srgb,var(--danger) 8%,var(--surface-2));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--danger) 25%,transparent)}
  .set-sites .row{gap:5px}
  .set-err{font-size:12px;font-weight:600;color:var(--danger);min-height:16px}
  .set-roles{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:12px}
  .set-rolebtn{display:grid;gap:2px;padding:10px 12px;border-radius:12px;background:var(--surface-3);box-shadow:inset 0 0 0 1px var(--line);text-align:left;transition:background var(--t-fast),box-shadow var(--t-fast),transform var(--t-fast) var(--ease-out)}
  .set-rolebtn:active{transform:scale(.97)}
  .set-rolebtn[aria-pressed="true"]{background:var(--sel);box-shadow:inset 0 0 0 1.5px var(--accent)}
  .set-rolebtn b{display:flex;align-items:center;gap:6px;font-size:12.5px;min-width:0}.set-rolebtn small{font-size:11px;color:var(--text-3)}
  .set-rolebtn .brand-dot{box-shadow:none}
  .set-mx th,.set-mx td{text-align:center;padding:0 6px}
  .set-mx th{background:var(--surface-2)}
  .set-mx th:first-child,.set-mx td:first-child{text-align:left;position:sticky;left:0;z-index:2;background:var(--surface-2);padding-left:14px}
  .set-mx th:first-child{z-index:3}
  .set-mx td{height:36px}
  .set-mx .cur{background:color-mix(in srgb,var(--accent) 10%,var(--surface-2))}
  .set-mx th.cur{color:var(--accent)}
  .set-yes,.set-ro{width:20px;height:20px;border-radius:50%;display:inline-grid;place-items:center}
  .set-yes{background:color-mix(in srgb,var(--ok) 18%,transparent);color:var(--ok)}
  .set-ro{background:color-mix(in srgb,var(--warn) 18%,transparent);color:var(--warn)}
  .set-yes svg.i,.set-ro svg.i{width:12px;height:12px;stroke-width:2.6}
  .set-no{color:var(--text-3)}
  .set-legend2{display:flex;gap:14px;flex-wrap:wrap;padding:10px 14px;font-size:12px;color:var(--text-2);border-top:1px solid var(--line)}
  .set-legend2 span{display:inline-flex;align-items:center;gap:6px}
  .set-notecard{display:grid;grid-template-columns:auto 1fr;gap:12px;padding:16px}
  .set-notecard ul{margin:6px 0 0;padding-left:18px;display:grid;gap:4px;font-size:12.5px;color:var(--text-2);line-height:1.45}
  /* v2.1 — teinte du fond d'écran reprise par les aperçus (valeurs d'os.css) */
  ${Object.entries(WP_TINT).map(([w, [d, l]]) => `:root[data-wallpaper="${w}"] .set-panel{--tint-d:${d};--tint-l:${l}}`).join('')}
  .set-mini.dark{--mb:color-mix(in srgb,#1b1822 74%,var(--tint-d,#3a1d4a));--ms:color-mix(in srgb,#110f16 86%,var(--tint-d,#3a1d4a))}
  .set-mini.light{--mb:color-mix(in srgb,#f7f6fa 76%,var(--tint-l,#e9d6f0));--ms:color-mix(in srgb,#f3f2f7 80%,var(--tint-l,#e9d6f0))}
  .set-mats,.set-icps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:14px}
  .set-mat,.set-icp{display:grid;gap:6px;align-content:start;text-align:left;padding:8px 8px 10px;border-radius:14px;transition:background var(--t-fast)}
  .set-mat:hover,.set-icp:hover{background:var(--surface-3)}
  .set-mat b,.set-icp b{font-size:13.5px;display:flex;align-items:center;gap:6px;padding:0 2px}
  .set-mat small,.set-icp small{font-size:12px;color:var(--text-2);line-height:1.4;padding:0 2px}
  .set-matv,.set-icv{position:relative;border-radius:11px;overflow:hidden;box-shadow:0 0 0 1px var(--line-2);transition:box-shadow var(--t-fast),transform var(--t-med) var(--spring-bouncy)}
  .set-mat:hover .set-matv,.set-icp:hover .set-icv{transform:translateY(-2px)}
  .set-mat[aria-pressed="true"] .set-matv,.set-icp[aria-pressed="true"] .set-icv{box-shadow:0 0 0 2.5px var(--accent),0 0 0 6px var(--focus)}
  .set-matv{aspect-ratio:16/10}
  .set-matv .wallpaper,.set-icv .wallpaper{position:absolute;inset:0}
  .set-matv .blob{position:absolute;border-radius:50%}
  .set-matv .b1{width:42%;height:58%;left:5%;top:34%;background:#f75632}.set-matv .b2{width:36%;height:50%;right:6%;top:4%;background:#8f12ab}
  .set-matv .pane{position:absolute;left:14%;top:19%;width:72%;height:56%;border-radius:9px;overflow:hidden;color:var(--text)}
  .set-matv .pane::before{content:"";position:absolute;left:10%;width:60%;top:18%;height:8%;border-radius:4px;background:currentColor;opacity:.25;box-shadow:0 12px 0 currentColor,0 24px 0 currentColor}
  .set-matv .bar{position:absolute;left:0;right:0;top:0;height:10%}
  .set-matv .dk{position:absolute;left:28%;right:28%;bottom:6%;height:11%;border-radius:6px}
  .set-matv.m-pixel :is(.pane,.bar,.dk){background:color-mix(in srgb,#1b1822 70%,var(--tint));backdrop-filter:blur(12px) saturate(1.25);-webkit-backdrop-filter:blur(12px) saturate(1.25);box-shadow:inset 0 0 0 .5px rgba(255,255,255,.08),0 6px 16px -6px rgba(0,0,0,.5)}
  :root[data-theme="light"] .set-matv.m-pixel :is(.pane,.bar,.dk){background:color-mix(in srgb,#f7f6fa 74%,var(--tint));box-shadow:inset 0 0 0 .5px rgba(20,16,30,.08),0 6px 16px -8px rgba(20,16,30,.3)}
  .set-matv.m-liquid :is(.pane,.bar,.dk){background:linear-gradient(160deg,rgba(255,255,255,.12),transparent 45%),rgba(30,26,38,.48);backdrop-filter:blur(5px) saturate(1.8);-webkit-backdrop-filter:blur(5px) saturate(1.8);box-shadow:inset 0 1px 0 rgba(255,255,255,.32),inset 0 0 0 .5px rgba(255,255,255,.22),0 6px 16px -6px rgba(0,0,0,.45)}
  :root[data-theme="light"] .set-matv.m-liquid :is(.pane,.bar,.dk){background:linear-gradient(160deg,rgba(255,255,255,.7),transparent 50%),rgba(250,249,253,.5);box-shadow:inset 0 1px 0 #fff,inset 0 0 0 .5px rgba(255,255,255,.9),0 6px 16px -8px rgba(20,16,30,.3)}
  .set-matv.m-solid :is(.pane,.dk){background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line),0 6px 16px -8px rgba(0,0,0,.4)}
  .set-matv.m-solid .bar{background:var(--surface-1)}
  .set-icv{display:flex;justify-content:center;align-items:center;padding:16px 8px}
  .set-icv .shelf{position:relative;display:flex;gap:6px;padding:6px;border-radius:14px;background:var(--glass-bg);box-shadow:inset 0 0 0 .5px var(--glass-edge)}
  .set-panel .set-icp[data-ic="light"] .gx-ico.gx-ico{background:linear-gradient(180deg,var(--h1),var(--h2));--gf:#fff;--ga:var(--h2)}
  .set-panel .set-icp[data-ic="light"] .gx-ico[data-a="todo"]{--ga:#c7c7cc}
  .set-panel .set-icp[data-ic="dark"] .gx-ico.gx-ico{background:linear-gradient(180deg,#2c2c2f,#111113);--gf:var(--h1);--ga:#1c1c1e}
  .set-panel .set-icp[data-ic="dark"] .gx-ico .gl{filter:none}
  .set-panel .set-icp[data-ic="tinted"] .gx-ico.gx-ico{background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 22%,#232326),#0e0e10);--gf:color-mix(in srgb,var(--accent) 80%,#fff);--ga:#161618}
  .set-panel .set-icp[data-ic="tinted"] .gx-ico .gl{filter:none}
  .set-panel .set-icp[data-ic="tinted"] .gx-ico .gl circle[fill^="#"]{fill:var(--gf)}
  .set-das{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:12px}
  .set-da{display:grid;gap:4px;padding:8px;border-radius:14px;text-align:left;transition:background var(--t-fast)}
  .set-da:hover{background:var(--surface-3)}.set-da[aria-pressed="true"] .set-dav{box-shadow:0 0 0 2px var(--accent)}
  .set-da small{color:var(--text-3);font-size:11.5px;line-height:1.35}
  .set-dav{position:relative;height:86px;border-radius:12px;overflow:hidden;margin-bottom:6px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.1);transition:box-shadow var(--t-fast)}
  .set-dav i{position:absolute;left:10px;right:10px;height:14px;border-radius:5px;top:32px}.set-dav i+i{top:52px;right:auto}
  .set-dav b{position:absolute;right:10px;bottom:10px;width:34px;height:14px;border-radius:5px}
  .set-dav span{position:absolute;left:10px;top:10px;font-size:10px;font-weight:700;color:#fff}
  @container app (max-width:560px){.set-das{grid-template-columns:1fr}}
  .set-flash{animation:set-flash 1.6s var(--ease-out)}
  @keyframes set-flash{0%,45%{box-shadow:inset 0 0 0 2px var(--accent),0 0 0 4px var(--focus)}}
  @container app (max-width:720px){
    .set-panel{padding:0 14px 34px}.set-panel > .app-head{padding:16px 0 6px}.set-row{padding:11px 14px}.set-idcard{padding:18px}
    .set-roles{grid-template-columns:repeat(2,1fr)}
  }
  @container app (max-width:1000px){ .set-utbl .opt{display:none} }
  @container app (max-width:640px){ .set-utblwrap{display:none} .set-ulist{display:grid} }
  @container app (max-width:560px){
    .set-row.stk{flex-wrap:wrap}.set-row.stk .ctl{width:100%}.set-row.stk .ctl>*{flex:1}
    .set-row.stk .ctl .input,.set-row.stk .ctl .select,.set-pw,.set-rangebox{width:100%}
    .set-themes{gap:10px;padding:12px}
    .set-opts{grid-template-columns:1fr}
    .set-idcard,.set-appcard{flex-direction:column;text-align:center}
    .set-idcard .row{justify-content:center}
    .set-h h2{font-size:18px}
    .set-wps{grid-template-columns:repeat(2,1fr);gap:10px;padding:12px}
    .set-mats,.set-icps{grid-template-columns:1fr;gap:4px;padding:10px}
    .set-mat,.set-icp{grid-template-columns:minmax(0,150px) minmax(0,1fr);align-items:center;column-gap:12px;row-gap:2px}
    .set-mat .set-matv,.set-icp .set-icv{grid-row:span 2}
    .set-icv{padding:10px 4px}.set-icv .shelf{gap:3px;padding:4px}.set-icv .gx-ico{--s:28px!important}
  }
  `);

  /* ---------------- Montage ---------------- */
  function mount(body, win) {
    const allowed = () => SECTIONS.filter((s) => (!s.roles || s.roles.includes(GX.ctx.role)) && (!s.desktop || !isMobile()));
    const okSec = (id) => allowed().some((s) => s.id === id);
    const tab0 = win.params?.tab;
    let sec = okSec(tab0) ? tab0 : 'compte', q = '', uq = '', compact = false, stack = null, sideHost = null, inPanel = !!tab0, self = false;
    const offs = [];
    body.innerHTML = `<div class="app"><div class="app-body" data-root></div></div>`;
    const root = body.querySelector('[data-root]');
    const setPref = (k, v) => { self = true; try { GX.shell.setPref(k, v); } finally { self = false; } };
    const prefs = () => GX.shell.prefs;
    const secDef = (id) => SECTIONS.find((s) => s.id === id);

    /* ---------- Barre latérale ---------- */
    function sideHTML() {
      const me = D.user(ME);
      return `<div class="set-side">
        <button class="set-prof ${sec === 'compte' && !compact ? 'on' : ''}" data-go="compte">${avHTML(me, 'lg')}<div style="min-width:0"><b class="ellipsis">${GX.esc(me.name)}</b><small>${GX.esc(D.ROLES[GX.ctx.role].l)} · Identifiant Gearbox</small></div>${compact ? `<span style="margin-left:auto;color:var(--text-3)">${GX.icon('chevron', 'sm')}</span>` : ''}</button>
        <label class="search set-search">${GX.icon('search', 'sm')}<input data-q placeholder="Rechercher un réglage" value="${GX.esc(q)}" /></label>
        <div class="set-nav scroll ${compact ? 'big' : ''}" data-nav>${navHTML()}</div></div>`;
    }
    function navHTML() {
      const secs = allowed();
      if (q.trim()) {
        const t = q.trim().toLowerCase(), ids = secs.map((s) => s.id);
        const hits = [...secs.filter((s) => s.l.toLowerCase().includes(t)).map((s) => [s.l, s.id, null]), ...ITEMS.filter(([l, id]) => ids.includes(id) && l.toLowerCase().includes(t))];
        const seen = new Set(), uniq = hits.filter((h) => { const k = h[0] + h[1]; if (seen.has(k)) return false; seen.add(k); return true; });
        return uniq.length ? `<div class="set-navg">${uniq.map(([l, id, a]) => `<div class="side-it res" data-go="${id}" ${a ? `data-anchor-go="${a}"` : ''}>${secIco(secDef(id))}<span class="ellipsis">${GX.esc(l)}</span><small>${GX.esc(secDef(id).l)}</small></div>`).join('')}</div>`
          : `<div class="empty" style="padding:28px 10px">${GX.icon('search')}Aucun réglage pour « ${GX.esc(q)} »</div>`;
      }
      return [1, 2, 3].map((g) => secs.filter((s) => s.g === g)).filter((a) => a.length).map((arr) => `<div class="set-navg">${arr.map((s) => `<div class="side-it ${s.id === sec && !compact ? 'on' : ''}" data-go="${s.id}">${secIco(s)}<span class="ellipsis">${s.l}</span>${compact ? `<span class="chev">${GX.icon('chevron', 'sm')}</span>` : ''}</div>`).join('')}</div>`).join('');
    }
    function refreshSide() { if (!sideHost?.isConnected) return; const nav = sideHost.querySelector('[data-nav]'); const sc = nav?.scrollTop || 0; const had = document.activeElement === sideHost.querySelector('[data-q]'); sideHost.innerHTML = sideHTML(); wireSideInner(); if (had) sideHost.querySelector('[data-q]').focus(); const n2 = sideHost.querySelector('[data-nav]'); if (n2) n2.scrollTop = sc; }
    function wireSideInner() { const i = sideHost.querySelector('[data-q]'); i.addEventListener('input', (e) => { q = e.target.value; sideHost.querySelector('[data-nav]').innerHTML = navHTML(); }); i.addEventListener('keydown', (e) => { if (e.key === 'Enter') sideHost.querySelector('[data-nav] [data-go]')?.click(); }); }

    /* ---------- Structure ---------- */
    function build() {
      if (!okSec(sec)) sec = 'compte';
      if (compact) {
        stack = GX.ui.stack(root);
        sideHost = stack.push('Réglages', '', { noHead: true });
        sideHost.innerHTML = sideHTML(); sideHost.addEventListener('click', (e) => { const it = e.target.closest('[data-go]'); if (it) go(it.dataset.go, it.dataset.anchorGo); }); wireSideInner();
        if (inPanel) pushPanel();
        win.setTitle('Réglages', inPanel ? secDef(sec).l : '');
      } else {
        stack = null; root.classList.remove('stack');
        root.innerHTML = `<div class="split" style="--side-w:262px"><div class="side"></div><div class="main scroll" data-panel></div></div>`;
        sideHost = root.querySelector('.side'); sideHost.innerHTML = sideHTML();
        sideHost.addEventListener('click', (e) => { const it = e.target.closest('[data-go]'); if (it) go(it.dataset.go, it.dataset.anchorGo); }); wireSideInner();
        renderPanel(root.querySelector('[data-panel]'), false);
        win.setTitle('Réglages', secDef(sec).l);
      }
    }
    const panelHost = () => (compact ? (stack && stack.depth() > 1 ? stack.top() : null) : root.querySelector('[data-panel]'));
    function pushPanel() { const s = secDef(sec); const host = stack.push(s.l, ''); renderPanel(host, false); const pg = host.parentElement; pg.querySelector('.back')?.addEventListener('click', () => { inPanel = false; win.setTitle('Réglages'); }); }
    function go(id, anchor) {
      if (!okSec(id)) return;
      if (!sideHost) { sec = id; return; } // pas encore construit : la section sera ouverte au premier rendu
      const changed = id !== sec; sec = id; inPanel = true;
      win.setTitle('Réglages', secDef(id).l);
      if (compact) {
        if (stack.depth() > 1) { const host = stack.top(); host.parentElement.querySelector('.stack-head .t').textContent = secDef(id).l; renderPanel(host, true); }
        else pushPanel();
      } else {
        sideHost.querySelectorAll('.side-it').forEach((x) => x.classList.toggle('on', !x.classList.contains('res') && x.dataset.go === id));
        sideHost.querySelector('.set-prof')?.classList.toggle('on', id === 'compte');
        if (changed || anchor) renderPanel(root.querySelector('[data-panel]'), changed);
      }
      if (anchor) setTimeout(() => { const el = panelHost()?.querySelector(`[data-anchor="${anchor}"]`); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.remove('set-flash'); void el.offsetWidth; el.classList.add('set-flash'); } }, compact ? 380 : 60);
    }
    function renderPanel(host, anim) {
      if (!host) return;
      const sc = anim ? 0 : host.scrollTop;
      host.innerHTML = PANELS[sec]();
      host.scrollTop = sc;
      if (!host._setWired) { host._setWired = true; wirePanel(host); }
      if (anim) GX.animate(host.firstElementChild, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { spring: 'soft' });
      if (sec === 'stockage' && !S.storageLoaded) setTimeout(() => { S.storageLoaded = true; if (sec === 'stockage') rerender(); }, 450);
    }
    const rerender = () => renderPanel(panelHost(), false);

    /* ---------- Rendus communs ---------- */
    /* En-tête au modèle validé (catégorie « Système » ajoutée par controls.js, titre Syncopate, sous-titre) */
    const head = (s, extra = '') => `<div class="app-head"><div class="ah-t"><h1>${s.t || s.l}</h1><span class="sub">${s.sub}</span></div>${extra ? `<div class="ah-f">${extra}</div>` : ''}</div>`;
    const rowH = (t, d, ctl, o = {}) => `<div class="set-row ${o.cls || ''}" ${o.anchor ? `data-anchor="${o.anchor}"` : ''}>${o.ico || ''}<div class="t"><b>${t}</b>${d ? `<small>${d}</small>` : ''}</div><div class="ctl">${ctl}</div></div>`;
    const sw = (attr, on, dis) => `<input type="checkbox" class="switch" ${attr} ${on ? 'checked' : ''} ${dis ? 'disabled' : ''} />`;

    const PANELS = {
      compte() {
        const me = D.user(ME), role = GX.ctx.role, city = siteOf(me.city);
        return `<div class="set-panel">${head(secDef('compte'))}
          <div class="set-group set-idcard enter" data-anchor="carte"><button class="set-avbtn" data-photo="${ME}" data-tip="Changer la photo de profil">${avHTML(me, 'xl')}</button>
            <div style="display:grid;gap:6px;min-width:0"><h3 class="ellipsis">${GX.esc(me.name)}</h3><div class="row wrap">${roleBadge(role)}<span class="faint" style="font-size:12.5px">ID : <span class="set-login">${GX.esc(loginOf(me))}</span></span>${role !== 'Master' ? '<span class="badge" style="--c:var(--info)">vue simulée</span>' : ''}${GX.ctx.readOnly ? '<span class="badge" style="--c:var(--danger)">Lecture seule</span>' : ''}</div>
            <button class="set-link" data-photo="${ME}">Changer la photo de profil</button></div></div>
          <div class="set-cols"><div>
          <div class="set-gt">Identité</div>
          <div class="set-group enter" style="--i:1" data-anchor="identite">
            ${rowH('Nom affiché', 'Visible dans le Chat, les projets et le classement', `<input class="input" data-f="name" value="${GX.esc(me.name)}" maxlength="40" />`, { cls: 'stk' })}
            ${rowH('Ville de référence (météo)', 'Pilote la météo de Hello Marketing sur ce poste', `<select class="select" data-f="city"><option value="">— Sélectionner une ville —</option>${D.SITES.map((c) => `<option value="${GX.esc(c)}" ${c === city ? 'selected' : ''}>${GX.esc(c)}</option>`).join('')}</select>`, { cls: 'stk' })}
            ${rowH('Date de naissance', 'Partagée avec l’équipe : Hello Marketing souhaite les anniversaires', `<input class="input" type="date" data-f="birthdate" value="${me.birthdate || ''}" />`, { cls: 'stk' })}
          </div></div><div>
          <div class="set-gt">Sécurité</div>
          <div class="set-group enter" style="--i:2" data-anchor="securite">
            ${rowH('Ancien mot de passe', '', `<input class="input" type="password" data-pw="old" autocomplete="new-password" placeholder="Requis pour changer" />`, { cls: 'stk' })}
            ${rowH('Nouveau mot de passe', 'Au moins 4 caractères ; plus il est long, mieux c’est', `<div class="set-pw"><input class="input" type="password" data-pw="new" autocomplete="new-password" placeholder="Nouveau mot de passe" /><div class="set-meter" data-meter><i></i><i></i><i></i><i></i></div><div class="set-pwinfo"><span data-strength class="faint"></span><button class="btn sm ghost" data-act="showpw" style="height:18px;padding:0 4px;font-size:11px">Afficher</button></div></div>`, { cls: 'stk' })}
            ${rowH('Confirmer', '', `<div class="set-pw"><input class="input" type="password" data-pw="conf" autocomplete="new-password" placeholder="Confirmer" /><div class="set-pwinfo"><span data-match></span></div></div>`, { cls: 'stk' })}
          </div>
          <div class="set-note">Maquette : aucun mot de passe n’est enregistré ni transmis. Dans Gearbox, le hash est calculé côté serveur.</div></div></div>
          <div class="set-foot"><span class="set-msg" data-msg></span><button class="btn primary lg" data-act="save-profile">${GX.icon('check', 'sm')}Enregistrer mon profil</button></div></div>`;
      },

      apparence() {
        const p = prefs();
        const mini = (t) => `<div class="set-mini ${t}"><div class="wallpaper wp-${p.wallpaper}"></div><div class="mb"></div><div class="w"><i style="top:14%;width:40%"></i><i style="top:30%;width:52%"></i><i style="top:46%;width:30%"></i><i style="top:62%;width:46%"></i></div><div class="mdk"></div></div>`;
        return `<div class="set-panel">${head(secDef('apparence'))}
          <div class="set-gt">Thème</div>
          <div class="set-group enter" data-anchor="theme"><div class="set-themes">${[['dark', 'Sombre'], ['light', 'Clair']].map(([t, l]) => `<button class="set-theme" data-set-theme="${t}" aria-pressed="${p.theme === t}">${mini(t)}<span>${l}</span></button>`).join('')}</div></div>
          <div class="set-gt">Direction artistique</div>
          <div class="set-group enter" style="--i:1" data-anchor="da"><div class="set-das">${DAS.map(([k, l, d, c]) => `<button class="set-da" data-dak="${k}" aria-pressed="${(p.da || 'nocturne') === k}"><div class="set-dav" style="background:${c[0]}"><i style="background:${c[1]}"></i><i style="background:${c[1]};width:38%"></i><b style="background:linear-gradient(135deg,${c[2]},${c[3]})"></b><span style="font-family:Syncopate;letter-spacing:${k === 'nocturne' ? '.03em' : k === 'carbone' ? '.14em' : '.18em'}">GEARBOX</span></div><b>${l}${k === 'nocturne' ? ' <span class="badge" style="--c:var(--text-3)">défaut</span>' : ''}</b><small>${d}</small></button>`).join('')}</div></div>
          <div class="set-gt">Matière</div>
          <div class="set-group enter" style="--i:1" data-anchor="matiere"><div class="set-mats">${MATS.map(([m, l, d]) => `<button class="set-mat" data-mat="${m}" aria-pressed="${(p.material || 'pixel') === m}"><div class="set-matv m-${m}"><div class="wallpaper wp-${p.wallpaper}" data-wpv></div><i class="blob b1"></i><i class="blob b2"></i><div class="bar"></div><div class="pane"></div><div class="dk"></div></div><b>${l}${m === 'pixel' ? ' <span class="badge" style="--c:var(--text-3)">défaut</span>' : ''}</b><small>${d}</small></button>`).join('')}</div></div>
          <div class="set-note" data-matnote>${MATNOTE(p.effects === 'eco')}</div>
          <div class="set-gt">Style d’icônes</div>
          <div class="set-group enter" style="--i:1" data-anchor="icones"><div class="set-icps">${ICS.map(([k, l, d]) => `<button class="set-icp" data-ics="${k}" data-ic="${k}" aria-pressed="${(p.iconStyle || 'light') === k}"><div class="set-icv"><div class="wallpaper wp-${p.wallpaper}" data-wpv></div><div class="shelf">${['dashboard', 'projects', 'chat', 'budget'].map((id) => GX.appIcon(id, 40)).join('')}</div></div><b>${l}</b><small>${d}</small></button>`).join('')}</div></div>
          <div class="set-gt">Effets visuels</div>
          <div class="set-group enter" style="--i:1" data-anchor="effets"><div class="set-opts">
            <button class="set-opt" data-eff="full" aria-pressed="${p.effects !== 'eco'}"><span class="set-radio"></span><div><b>${GX.icon('bolt', 'sm')}Complets</b><small>Verre dépoli, transparences et animations à ressort : l’expérience Bureau telle qu’elle est pensée.</small></div></button>
            <button class="set-opt" data-eff="eco" aria-pressed="${p.effects === 'eco'}"><span class="set-radio"></span><div><b>${GX.icon('leaf', 'sm')}Économes</b><small>Aucun flou ni transparence, animations raccourcies. Pour les PC qui chauffent ou dont le ventilateur s’emballe.</small></div></button>
          </div></div>
          <div class="set-note">Le flou d’arrière-plan (backdrop-filter) est l’effet le plus coûteux pour la carte graphique : le mode économe le supprime partout, sans rien changer d’autre.</div>
          <div class="set-gt">Fond d’écran</div>
          <div class="set-group enter" style="--i:2" data-anchor="wallpaper"><div class="set-wps">${WPS.map(([w, l]) => `<button class="set-wp" data-wp="${w}" aria-pressed="${p.wallpaper === w}"><div class="v"><div class="wallpaper wp-${w}"></div><span class="ck">${GX.icon('check')}</span></div>${l}</button>`).join('')}</div></div>
          <div class="set-gt">Bureau</div>
          <div class="set-group enter" style="--i:3" data-anchor="widgets">${rowH('Widgets du bureau', 'Budget, projets en retard, prochaines publications, absents et Chat, posés sur le fond d’écran', sw('data-pref="widgets"', p.widgets))}</div></div>`;
      },

      bureau() {
        const p = prefs(), n = GX.wm.list().length, sp = GX.wm.spaces().length;
        return `<div class="set-panel">${head(secDef('bureau'))}
          <div class="set-gt">Dock</div>
          <div class="set-group enter" data-anchor="dock">
            <div class="set-dockprev"><div class="set-dockbar" data-dockprev>${['dashboard', 'projects', 'chat', 'agenda', 'budget'].map((id) => GX.app(id) ? GX.appIcon(id, Math.round(p.dockSize * .62)) : '').join('')}</div></div>
            ${rowH('Taille', `${p.dockSize} px`, `<div class="set-rangebox"><span>Petite</span><input type="range" class="range" min="38" max="64" step="1" value="${p.dockSize}" data-pref="dockSize" /><span>Grande</span></div>`, { cls: 'stk' })}
            ${rowH('Agrandissement', 'Les icônes grossissent sous le pointeur, comme sur macOS', sw('data-pref="dockMag"', p.dockMag))}
            ${rowH('Masquer automatiquement le Dock', 'Il réapparaît quand le pointeur touche le bas de l’écran ; les fenêtres agrandies gagnent la place', sw('data-pref="dockAutohide"', p.dockAutohide))}
            ${rowH('Dock intelligent', 'S’efface quand une fenêtre agrandie ou ancrée le recouvre ; il revient dès que le pointeur approche du bas de l’écran', sw('data-pref="dockSmart"', p.dockSmart !== false))}
            ${rowH('Barre du haut escamotable', 'La barre de menus se replie et réapparaît quand le pointeur touche le bord haut de l’écran', sw('data-pref="menubarAuto"', p.menubarAuto !== false))}
          </div>
          <div class="set-gt">Widgets du bureau</div>
          <div class="set-group enter" style="--i:1" data-anchor="wdg">
            ${rowH('Personnaliser les widgets du bureau…', 'Ajouter, ranger par glisser-déposer, changer de taille. Les fenêtres s’écartent le temps de l’édition.', `<button class="btn" data-act="widgets-edit">${GX.icon('edit', 'sm')}Personnaliser…</button>`, { cls: 'stk' })}
            ${rowH('Réinitialiser les widgets', 'Revient à la disposition par défaut de votre rôle', `<button class="btn danger" data-act="widgets-reset">${GX.icon('refresh', 'sm')}Réinitialiser…</button>`, { cls: 'stk' })}
          </div>
          <div class="set-gt">Fenêtres</div>
          <div class="set-group enter" style="--i:2" data-anchor="session">
            ${rowH('Session en cours', `${n} fenêtre${n > 1 ? 's' : ''} ouverte${n > 1 ? 's' : ''} · ${sp} bureau${sp > 1 ? 'x' : ''}. Positions, ancrages et bureaux sont restaurés à la prochaine ouverture.`, `<span class="badge" style="--c:var(--ok)"><i class="dot"></i>Enregistrée</span>`)}
            ${rowH('Réinitialiser la session des fenêtres', 'Referme toutes les fenêtres et oublie leurs positions. La page se recharge.', `<button class="btn danger" data-act="reset-session">${GX.icon('refresh', 'sm')}Réinitialiser…</button>`, { cls: 'stk' })}
          </div></div>`;
      },

      notifs() {
        const p = prefs(), off = !S.notifs;
        const APPS = ['chat', 'projects', 'digital', 'agenda', 'conges', 'games'].filter((id) => GX.app(id) && GX.shell.canOpen(id));
        const desc = { chat: 'Nouveaux messages et mentions', projects: 'Échéances proches, tâches assignées', digital: 'Publications programmées et commentaires', agenda: 'Rappels d’événements', conges: 'Demandes et validations', games: 'Défis reçus' };
        return `<div class="set-panel">${head(secDef('notifs'))}
          <div class="set-group enter" data-anchor="notifs">
            ${rowH('Autoriser les notifications', 'Bannières en haut à droite et centre de notifications', sw('data-act="notifs"', S.notifs))}
            ${rowH('Ne pas déranger', 'Les bannières sont coupées ; tout reste consultable dans le centre de notifications', sw('data-pref="dnd"', p.dnd, off), { cls: off ? 'dis' : '', ico: `<span class="set-ico" style="--c:var(--bony-violet)">${GX.icon('moon')}</span>` })}
          </div>
          <div class="set-group enter" style="--i:1">${rowH('Notifications de cet appareil', `Messages du Chat reçus même Gearbox fermé · ${S.push === 'granted' ? 'activées' : S.push === 'denied' ? 'refusées par le navigateur' : 'non activées'}`, `<button class="btn sm" data-go-push>${GX.icon('chevright', 'sm')}Régler</button>`, { cls: 'stk' })}</div>
          <div class="set-gt">Par rubrique</div>
          <div class="set-group enter" style="--i:1" data-anchor="perapp">${APPS.map((id) => rowH(GX.esc(GX.app(id).name), desc[id], sw(`data-app-notif="${id}"`, S.perApp[id], off), { cls: off ? 'dis' : '', ico: GX.appIcon(id, 26) })).join('')}</div>
          <div class="set-foot"><button class="btn" data-act="test-notif" ${off ? 'disabled' : ''}>${GX.icon('bell', 'sm')}Envoyer une notification de test</button></div></div>`;
      },

      application() {
        const master = GX.ctx.role === 'Master', gamesOn = !S.gamesRoles;
        return `<div class="set-panel">${head(secDef('application'))}
          <div class="set-group set-appcard enter" data-anchor="install"><span class="set-appico"><img src="icon-mark.svg" alt="" /></span>
            <div class="grow" style="display:grid;gap:4px;min-width:0"><b style="font-size:16px">Gearbox</b><span class="muted" style="font-size:13px;line-height:1.5">Installe Gearbox comme une application sur ton ordinateur ou ton téléphone : icône dédiée, fenêtre propre, et les mises à jour arrivent toutes seules.</span><span class="faint" style="font-size:12.5px">Aucun fichier à télécharger, aucun store.</span></div>
            <button class="btn primary lg" data-act="install">${GX.icon(S.installed ? 'check' : 'download', 'sm')}${S.installed ? 'Déjà installée' : 'Installer l’application'}</button></div>
          <div class="set-gt">Notifications</div>
          <div class="set-group enter" style="--i:1;padding:18px 20px" data-anchor="push">${pushHTML()}</div>
          ${master ? `<div class="set-gt">Modules ${roleBadge('Master')}</div>
          <div class="set-group enter" style="--i:2" data-anchor="modules">${rowH('Espace détente', gamesOn ? 'Visible de l’équipe : Master, Administrateur, Coordinateur et Digital Manager' : 'Masqué pour tous', sw('data-act="games-toggle" aria-label="Afficher la rubrique Jeux"', gamesOn), { ico: GX.app('games') ? GX.appIcon('games', 26) : '' })}</div>
          <div class="set-note">Visible du Master seul. Le refus réel est côté serveur : masquer ce réglage ne ferme rien. Le Directeur a les droits d’un Administrateur, sauf les Jeux.</div>` : ''}</div>`;
      },

      stockage() {
        const st = S.storage, used = st.disque.utilise, total = st.disque.total, pct = total > 0 ? Math.round((used / total) * 100) : 0;
        const col = pct >= 90 ? 'var(--danger)' : pct >= 75 ? 'var(--warn)' : 'var(--bony-orange)';
        const up = Object.values(st.parType).reduce((a, v) => a + v.octets, 0);
        const TC = { chat: 'var(--info)', avatar: 'var(--bony-violet)', calendar: 'var(--bony-orange)' };
        if (!S.storageLoaded) return `<div class="set-panel">${head(secDef('stockage'))}<div class="set-group" style="padding:22px"><span class="muted">Calcul en cours…</span></div></div>`;
        return `<div class="set-panel">${head(secDef('stockage'))}
          <div class="set-group enter" style="padding:22px 24px;display:grid;gap:12px" data-anchor="usage">
            <div class="row wrap" style="align-items:baseline;gap:6px 14px"><span style="font-size:13.5px;font-weight:700">Fichiers envoyés dans Gearbox :</span><b class="num" style="font-size:26px;letter-spacing:-.02em">${octets(up)}</b><span class="grow"></span><span class="muted num" style="font-size:13px">${octets(total - used)} libres</span></div>
            <div class="set-disk"><i style="width:${Math.min(pct, 100)}%;--c:${col}"></i></div>
            <div class="muted" style="font-size:12.5px;line-height:1.5">Le disque du serveur est utilisé à <b style="color:var(--text)">${pct} %</b> (${octets(used)} sur ${octets(total)}). Il est partagé avec le système, ce n’est pas un quota propre à Gearbox.</div></div>
          <div class="set-gt">Par type de fichier</div>
          <div class="set-group enter set-types" style="--i:1" data-anchor="types">${Object.entries(st.parType).map(([k, v]) => `<div><span class="dot" style="--c:${TC[k] || 'var(--text-3)'}"></span><span class="grow">${GX.esc(LIBELLES_TYPE[k] || k)} <span class="faint">· ${v.fichiers.toLocaleString('fr-FR')} fichier${v.fichiers > 1 ? 's' : ''}</span></span><b class="num">${octets(v.octets)}</b></div>`).join('')}</div>
          <div class="set-group enter" style="--i:2;padding:16px 20px" data-anchor="menage"><div class="row" style="gap:12px;align-items:flex-start"><span class="set-ico" style="--c:var(--ok)">${GX.icon('refresh')}</span><div class="muted" style="font-size:12.5px;line-height:1.55"><b style="color:var(--text);display:block;margin-bottom:2px">Ménage automatique</b>Les médias d’une publication Digital archivée sont supprimés au bout de 30 jours, les pièces jointes du chat au bout de 180 jours (le message reste, la pièce jointe disparaît). Les photos de profil ne sont jamais supprimées automatiquement.</div></div></div>
          <div class="set-note">Visible par tous les rôles : savoir si le serveur sature concerne tout le monde. Valeurs fictives.</div></div>`;
      },

      users() {
        const role = GX.ctx.role;
        return `<div class="set-panel">${head(secDef('users'), `<span class="faint num" style="font-size:12.5px" data-ucount>${D.USERS.length} comptes</span><button class="btn primary" data-act="add-user">${GX.icon('plus', 'sm')}Nouvel Utilisateur</button>`)}
          <div class="set-group enter" data-anchor="users">
            <div class="set-utools"><label class="search grow" style="min-width:160px">${GX.icon('search', 'sm')}<input data-uq placeholder="Rechercher un nom, un identifiant, une ville" value="${GX.esc(uq)}" /></label></div>
            <div class="set-utblwrap scroll"><table class="tbl set-utbl"><thead><tr><th style="width:56px"></th><th>Nom</th><th>ID Connexion</th><th>Rang</th><th class="opt">Ville</th><th class="opt">Anniversaire</th><th>Mot de passe</th><th class="r">Actions</th></tr></thead><tbody data-urows>${usersRows()}</tbody></table></div>
            <div class="set-ulist" data-ulist>${usersList()}</div></div>
          <div class="set-note">${role === 'Director' ? DIRECTOR_NOTE + ' La suppression est réservée au Master et aux Administrateurs.' : 'Suppression réservée au Master et aux Administrateurs ; le compte Master ne peut jamais être supprimé.'} Cliquez sur un avatar pour changer la photo d’un compte.</div></div>`;
      },

      roles() {
        const cur = GX.ctx.role, roles = RANKS;
        const apps = MATRIX_APPS.filter((id) => GX.app(id));
        const cell = (r, id) => (D.ACCESS[r] || []).includes(id) ? (READ_ONLY.includes(r) ? `<span class="set-ro" data-tip="Lecture seule">${GX.icon('eye')}</span>` : `<span class="set-yes">${GX.icon('check')}</span>`) : '<span class="set-no">—</span>';
        const sm = D.USERS.find((u) => u.role === 'Site Manager');
        return `<div class="set-panel" style="max-width:1080px">${head(secDef('roles'))}
          <div class="set-gt">Voir comme</div>
          <div class="set-group enter" data-anchor="voir"><div class="set-roles">${roles.map((r) => `<button class="set-rolebtn" data-role="${r}" aria-pressed="${cur === r}"><b><i class="brand-dot" style="--c:${ROLE_C[r]}"></i><span class="ellipsis">${D.ROLES[r].l}${r === 'Master' ? ' (moi)' : ''}</span></b><small>${(D.ACCESS[r] || []).length} rubriques${READ_ONLY.includes(r) ? ' · lecture seule' : ''}</small></button>`).join('')}</div>
            <div class="set-note" style="margin:0 14px 12px">Dock, rubriques et données se cloisonnent comme dans Gearbox. Réglages reste ouvert pour tous les rôles : vous pouvez toujours revenir ici.</div></div>
          <div class="set-gt">Matrice des accès</div>
          <div class="set-group enter" style="--i:1" data-anchor="matrix"><div class="scroll"><table class="tbl set-mx"><thead><tr><th>Rubrique</th>${roles.map((r) => `<th class="${r === cur ? 'cur' : ''}" data-tip="${D.ROLES[r].l}">${ROLE_SHORT[r]}</th>`).join('')}</tr></thead>
            <tbody>${apps.map((id) => `<tr><td><div class="row" style="gap:8px">${GX.appIcon(id, 20)}<span class="ellipsis">${GX.esc(GX.app(id).name)}</span></div></td>${roles.map((r) => `<td class="${r === cur ? 'cur' : ''}">${cell(r, id)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
            <div class="set-legend2"><span><span class="set-yes">${GX.icon('check')}</span>Accès</span><span><span class="set-ro">${GX.icon('eye')}</span>Lecture seule</span><span><span class="set-no">—</span>Aucun accès</span></div></div>
          <div class="set-group set-notecard enter" style="--i:2" data-anchor="note"><span class="set-ico lg" style="--c:var(--danger)">${GX.icon('building')}</span><div><b>Chef de site (Site Manager)</b>
            <ul><li><b>Lecture seule partout</b> : aucun bouton de création ni d’édition, il ne figure dans aucune liste de rôles éditeurs.</li>
            <li><b>Limité à ses concessions</b> (rattachées à son compte)${sm ? ` — par exemple ${GX.esc(sm.name)} : ${GX.esc((sm.sites || []).join(', ') || '—')}` : ''}. Les projets multi-sites n’affichent que sa part (« +N masqués »).</li>
            <li>Rubriques : Dashboard, Projets, Digital (onglet Planning seulement), Hello Marketing, Budget, Agenda.</li>
            <li>Le filtrage se fait <b>côté serveur</b> : les autres concessions ne transitent jamais par son navigateur.</li></ul>
            <div class="faint" style="font-size:12px;margin-top:8px">Directeur = droits d’Administrateur sauf Jeux · Externe : Digital, Chat, Hello Marketing et Réglages.</div></div></div></div>`;
      },
    };

    /* ---------- Utilisateurs (règles de Settings.tsx) ---------- */
    const canManage = () => ['Master', 'Administrator', 'Director'].includes(GX.ctx.role);
    const canDelete = (u) => ['Master', 'Administrator'].includes(GX.ctx.role) && u.role !== 'Master';   // USER_DELETE_ROLES, jamais le compte Master
    /* roleOptions() : un Director n'attribue que DIRECTOR_ASSIGNABLE ; le rang en place reste affichable et conservable */
    const roleOptions = (cur) => { const base = GX.ctx.role === 'Director' ? DIRECTOR_CAN : RANKS; return cur && !base.includes(cur) ? [cur, ...base] : base; };
    const filteredUsers = () => { const t = uq.trim().toLowerCase(); return D.USERS.filter((u) => !t || `${u.name} ${loginOf(u)} ${siteOf(u.city)} ${D.ROLES[u.role]?.l}`.toLowerCase().includes(t)); };
    const dash = '<span class="faint">—</span>';
    function usersRows() {
      const L = filteredUsers();
      if (!L.length) return `<tr><td colspan="8"><div class="empty" style="padding:20px">Aucun utilisateur</div></td></tr>`;
      return L.map((u) => `<tr data-uid="${u.id}" class="${u.id === ME ? 'me' : ''}"><td><button class="set-avbtn sm" data-photo="${u.id}" data-tip="Modifier la photo de profil">${avHTML(u)}</button></td>
        <td><b>${GX.esc(u.name)}</b>${u.id === ME ? ' <span class="badge" style="--c:var(--accent)">vous</span>' : ''}${u.role === 'Site Manager' ? `<div class="faint" style="font-size:11.5px">${(u.sites || []).length ? GX.esc(u.sites.join(', ')) : '<span class="set-warn">Aucune concession</span>'}</div>` : ''}</td>
        <td><span class="set-login">${GX.esc(loginOf(u))}</span></td><td>${roleBadge(u.role)}</td>
        <td class="muted opt">${siteOf(u.city) ? `<span class="ic">${GX.icon('pin', 'sm')}${GX.esc(siteOf(u.city))}</span>` : dash}</td>
        <td class="muted opt">${u.birthdate ? `<span class="ic">${GX.icon('gift', 'sm')}${bday(u.birthdate)}</span>` : dash}</td>
        <td class="faint" style="letter-spacing:.1em">••••••</td>
        <td class="r"><button class="icon-btn sm" data-edit="${u.id}" data-tip="Modifier">${GX.icon('edit', 'sm')}</button>${canDelete(u) ? `<button class="icon-btn sm" data-delu="${u.id}" data-tip="Supprimer" style="color:var(--danger)">${GX.icon('trash', 'sm')}</button>` : ''}</td></tr>`).join('');
    }
    function usersList() {
      const L = filteredUsers();
      return L.map((u) => `<div class="list-row" data-edit="${u.id}">${avHTML(u)}<div class="grow" style="min-width:0"><div class="row" style="gap:6px"><b class="ellipsis">${GX.esc(u.name)}</b>${roleBadge(u.role)}</div><div class="faint ellipsis" style="font-size:12px"><span class="set-login">${GX.esc(loginOf(u))}</span> · ${GX.esc(siteOf(u.city) || '—')} · ${u.birthdate ? bday(u.birthdate) : '—'}</div></div><span class="faint">${GX.icon('chevron', 'sm')}</span></div>`).join('') || '<div class="empty">Aucun utilisateur</div>';
    }
    function refreshUsers(host, flashId) {
      host.querySelector('[data-urows]').innerHTML = usersRows(); host.querySelector('[data-ulist]').innerHTML = usersList();
      const n = host.querySelector('[data-ucount]'); if (n) n.textContent = `${D.USERS.length} comptes`;
      if (flashId) { const r = host.querySelector(`tr[data-uid="${flashId}"]`); if (r) GX.animate(r, [{ background: 'var(--sel)' }, { background: 'transparent' }], { duration: 1400, easing: 'ease-out' }); }
    }
    function editUser(uid, host) {
      if (!canManage()) return;
      const isNew = !uid, u = isNew ? { id: GX.uid('u'), name: '', role: 'Coordinator', city: '', birthdate: '', sites: [] } : D.user(uid);
      const roles = roleOptions(u.role);
      let sites = [...(u.sites || [])];
      const sitesHTML = () => `<div><span class="label" style="color:var(--danger)">Concessions rattachées</span><div class="muted" style="font-size:12px;margin-top:2px">Le chef de site ne voit que ces concessions, en lecture seule.</div></div>
            <div class="row wrap">${D.SITES.map((s2) => `<button type="button" class="chip" data-toggle data-site="${GX.esc(s2)}" aria-pressed="${sites.includes(s2)}">${GX.esc(s2)}</button>`).join('')}</div>
            <div class="set-warn" data-nosite ${sites.length ? 'hidden' : ''}>Aucune concession : ce compte ne verra aucune donnée.</div>`;
      const sh = win.sheet(`<h3>${isNew ? 'Nouvel Utilisateur' : `Modifier ${GX.esc(u.name)}`}</h3><div class="muted">${isNew ? 'Le mot de passe part en clair et il est haché côté serveur.' : `Identifiant : <span class="set-login">${GX.esc(loginOf(u))}</span>`}</div>
        <div class="form-grid">
          <label class="field"><span class="label">Nom</span><input class="input" data-e="name" value="${GX.esc(u.name)}" placeholder="Nom complet" /></label>
          <label class="field"><span class="label">ID Connexion</span><input class="input" data-e="login" value="${isNew ? '' : GX.esc(loginOf(u))}" placeholder="ID" /></label>
          <label class="field"><span class="label">Rang</span><select class="select" data-e="role">${roles.map((r) => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${D.ROLES[r].l}</option>`).join('')}</select></label>
          <label class="field"><span class="label">Ville</span><select class="select" data-e="city"><option value="">—</option>${D.SITES.map((c) => `<option value="${GX.esc(c)}" ${c === siteOf(u.city) ? 'selected' : ''}>${GX.esc(c)}</option>`).join('')}</select></label>
          <label class="field"><span class="label">Anniversaire</span><input class="input" type="date" data-e="birthdate" value="${u.birthdate || ''}" /></label>
          <label class="field"><span class="label">Mot de passe</span><input class="input" data-e="password" value="${isNew ? 'admin' : ''}" placeholder="${isNew ? 'Mot de passe' : 'Laisser vide si inchangé'}" autocomplete="new-password" /></label>
          <div class="full set-sites ${u.role === 'Site Manager' ? '' : 'hide'}" data-sitesbox>${sitesHTML()}</div>
          ${GX.ctx.role === 'Director' ? `<div class="full faint" style="font-size:12px">${DIRECTOR_NOTE}</div>` : ''}
          <div class="full set-err" data-err></div>
        </div>
        <div class="foot">${!isNew && canDelete(u) ? `<button class="btn danger" data-del style="margin-right:auto">${GX.icon('trash', 'sm')}Supprimer</button>` : ''}<button class="btn" data-sheet="">${GX.icon('close', 'sm')}Annuler</button><button class="btn primary" data-save>${GX.icon('check', 'sm')}${isNew ? 'Créer' : 'Enregistrer'}</button></div>`, { width: 620 });
      const el = sh.el, $e = (k) => el.querySelector(`[data-e="${k}"]`);
      const box = el.querySelector('[data-sitesbox]');
      box.addEventListener('click', (e) => { const b = e.target.closest('[data-site]'); if (!b) return; const v = b.dataset.site; sites = sites.includes(v) ? sites.filter((x) => x !== v) : [...sites, v]; el.querySelector('[data-nosite]').hidden = !!sites.length; });
      $e('role').addEventListener('change', (e) => {
        const on = e.target.value === 'Site Manager', was = !box.classList.contains('hide'); if (on === was) return;
        if (on) { box.classList.remove('hide'); GX.animate(box, [{ opacity: 0, transform: 'translateY(-6px) scale(.98)' }, { opacity: 1, transform: 'none' }], { spring: 'bouncy' }); }
        else box.classList.add('hide');
      });
      el.querySelector('[data-save]').addEventListener('click', () => {
        const name = $e('name').value.trim(), login = $e('login').value.trim(), role = $e('role').value;
        const err = (m) => { el.querySelector('[data-err]').textContent = m; GX.animate(el.querySelector('[data-save]'), [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], { duration: 280, easing: 'ease-out' }); };
        if (!name || !login || !role) return err('Nom, identifiant et rang sont obligatoires.');
        if (D.USERS.some((x) => x !== u && loginOf(x).toLowerCase() === login.toLowerCase())) return err('Cet identifiant de connexion est déjà utilisé.');
        if (!roles.includes(role)) return err('Vous ne pouvez pas attribuer ce rang.');
        Object.assign(u, { name, login, role, city: $e('city').value || (isNew ? '' : u.city), birthdate: $e('birthdate').value, sites: role === 'Site Manager' ? sites : [] });
        u.initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
        if (isNew) { u.color = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'); u.online = false; D.USERS.push(u); }
        sh.close('ok');
        refreshUsers(host, u.id); if (u.id === ME) refreshSide();
        GX.shell.notify({ app: 'settings', title: isNew ? 'Utilisateur créé' : 'Utilisateur modifié', body: `${name} · ${D.ROLES[u.role].l}${u.role === 'Site Manager' ? ' · ' + (u.sites.join(', ') || 'aucune concession') : ''}`, silent: true });
      });
      el.querySelector('[data-del]')?.addEventListener('click', () => { sh.close(); setTimeout(() => deleteUser(u, host), 60); });
    }
    function deleteUser(u, host) {
      if (!canDelete(u)) return;
      win.sheet(`<h3>Supprimer ${GX.esc(u.name)} ?</h3><div class="muted">Êtes-vous sûr de vouloir supprimer cet utilisateur ? (maquette : suppression en mémoire seulement)</div>
        <div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok" style="background:var(--danger)">Supprimer</button></div>`, { onClose: (v) => {
        if (v !== 'ok') return;
        const row = host.querySelector(`tr[data-uid="${u.id}"]`);
        const done = () => { D.USERS.splice(D.USERS.indexOf(u), 1); refreshUsers(host); GX.shell.notify({ app: 'settings', title: 'Utilisateur supprimé', body: u.name, silent: true }); };
        if (row) GX.animate(row, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(30px)' }], { duration: 240, easing: 'ease-in', fill: 'forwards' }).onfinish = done; else done();
      } });
    }

    /* ---------- Photo de profil (AvatarUploadModal) ---------- */
    function photoSheet(uid) {
      const u = D.user(uid); if (!u) return;
      if (uid !== ME && !canManage()) return;
      let src = null, zoom = 1;
      const html = () => `<h3>Photo de profil</h3><div class="muted">${GX.esc(u.name)}</div>
        ${!src ? `<div class="set-drop" data-drop tabindex="0">${GX.icon('upload')}<b>Glisser une photo ici</b><span class="muted" style="font-size:12.5px">ou cliquer pour parcourir</span><span class="faint" style="font-size:11.5px">jpg, png, gif, webp — max 5 Mo</span></div>`
          : `<div class="set-crop"><div class="c" data-c style="background-image:url('${src}');background-size:${zoom * 100}%"></div></div><div class="set-zoom">${GX.icon('search', 'sm')}<input type="range" min="1" max="3" step="0.05" value="${zoom}" data-zoom /></div><button class="set-link" data-other style="margin-top:8px">Choisir une autre photo</button>`}
        <input type="file" hidden accept="image/jpeg,image/png,image/gif,image/webp" data-file />
        <div class="set-err" data-perr style="margin-top:8px"></div>
        <div class="foot">${src ? `<button class="btn primary" data-ok>${GX.icon('check', 'sm')}Valider</button>` : ''}${PHOTO[uid] ? `<button class="btn danger" data-rm>${GX.icon('trash', 'sm')}Supprimer la photo</button>` : ''}${!src && !PHOTO[uid] ? '<button class="btn" data-sheet="">Annuler</button>' : ''}</div>`;
      const sh = win.sheet(html(), { width: 420 });
      const el = sh.el, re = () => { el.innerHTML = html(); };
      const take = (f) => {
        if (!f) return;
        if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(f.type)) { el.querySelector('[data-perr]').textContent = 'Format non supporté. Utilisez jpg, png, gif ou webp.'; return; }
        if (f.size > 5 * 1024 * 1024) { el.querySelector('[data-perr]').textContent = 'Fichier trop lourd (max 5 Mo).'; return; }
        const rd = new FileReader(); rd.onload = () => { src = rd.result; zoom = 1; re(); }; rd.readAsDataURL(f);
      };
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-drop],[data-other]')) el.querySelector('[data-file]').click();
        if (e.target.closest('[data-ok]')) {
          const c = document.createElement('canvas'); c.width = c.height = 200; const ctx = c.getContext('2d'), img = new Image();
          img.onload = () => { const s0 = Math.min(img.width, img.height) / zoom; ctx.beginPath(); ctx.arc(100, 100, 100, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(img, (img.width - s0) / 2, (img.height - s0) / 2, s0, s0, 0, 0, 200, 200); PHOTO[uid] = c.toDataURL('image/jpeg', 0.88); sh.close(); afterPhoto(uid); GX.shell.hud('Photo de profil mise à jour'); };
          img.src = src;
        }
        if (e.target.closest('[data-rm]')) { delete PHOTO[uid]; sh.close(); afterPhoto(uid); GX.shell.hud('Photo supprimée'); }
      });
      el.addEventListener('change', (e) => { if (e.target.matches('[data-file]')) take(e.target.files?.[0]); });
      el.addEventListener('input', (e) => { if (e.target.matches('[data-zoom]')) { zoom = +e.target.value; el.querySelector('[data-c]').style.backgroundSize = zoom * 100 + '%'; } });
      el.addEventListener('dragover', (e) => { const d = e.target.closest('[data-drop]'); if (d) { e.preventDefault(); d.classList.add('over'); } });
      el.addEventListener('dragleave', (e) => e.target.closest('[data-drop]')?.classList.remove('over'));
      el.addEventListener('drop', (e) => { if (e.target.closest('[data-drop]')) { e.preventDefault(); take(e.dataTransfer.files[0]); } });
    }
    function afterPhoto(uid) { if (uid === ME) refreshSide(); rerender(); }

    /* ---------- Installer Gearbox (InstallAppModal) ---------- */
    function installSheet() {
      let open = 'desktop', busy = false;
      const dev = (id, ico, t, st, bd) => `<div class="set-dev ${open === id ? 'open' : ''}"><button data-dev="${id}"><span class="set-devico">${ico}</span><span class="grow"><b>${t}</b><small>${st}</small></span>${GX.icon(open === id ? 'chevup' : 'chevdown', 'sm')}</button><div class="bd">${bd}</div></div>`;
      const html = () => `<h3>Installer Gearbox</h3><div class="muted">Choisis ton appareil</div>
        ${S.installed ? `<div class="set-push" style="margin-top:14px;padding:14px;border-radius:12px;background:color-mix(in srgb,var(--ok) 12%,transparent)"><span class="st">${GX.icon('check', 'sm')}Déjà installée</span><p>Tu utilises Gearbox depuis l’application. Rien à faire de plus.</p></div>`
        : `<p class="muted" style="font-size:13px;line-height:1.5;margin:12px 0">Gearbox s’installe directement depuis le navigateur, avec son icône et sa propre fenêtre. <b style="color:var(--text)">Aucun fichier à télécharger</b>, aucun store. Les mises à jour arrivent toutes seules.</p>
        ${dev('desktop', 'WIN', 'Gearbox pour Windows', 'Chrome ou Edge — fonctionne aussi sur Mac', `<button class="btn primary" data-native ${busy ? 'disabled' : ''}>${GX.icon('download', 'sm')}${busy ? 'Installation…' : 'Installer Gearbox'}</button><div class="faint" style="font-size:12px;margin-top:8px">Firefox sur ordinateur ne sait pas installer d’application web : ouvre Gearbox dans Chrome ou Edge.</div>`)}
        ${dev('android', 'AND', 'Gearbox pour Android', 'Chrome, Edge, Samsung Internet', '<ol><li>Ouvre le menu <b>⋮</b> du navigateur.</li><li>Touche <b>Installer l’application</b> ou <b>Ajouter à l’écran d’accueil</b>.</li><li>Confirme : l’icône Gearbox rejoint tes applications.</li></ol>')}
        ${dev('ios', 'iOS', 'Gearbox pour iOS', 'iPhone et iPad — via le menu Partager', '<ol><li>Ouvre Gearbox dans <b>Safari</b>.</li><li>Touche l’icône <b>Partager</b>, en bas de l’écran.</li><li>Choisis <b>Sur l’écran d’accueil</b>, puis <b>Ajouter</b>.</li></ol><div class="faint" style="font-size:12px;margin-top:8px">Chrome, Edge et Firefox conviennent aussi à partir d’iOS 16.4. Sur iPhone, les notifications ne sont possibles qu’après cette installation.</div>')}`}
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line)"><span class="label">Notifications</span><div style="margin-top:8px">${pushHTML(true)}</div></div>
        <div class="foot"><button class="btn primary" data-sheet="">Fermer</button></div>`;
      const sh = win.sheet(html(), { width: 520, onClose: () => rerender() });
      const el = sh.el, re = () => { const sc = el.scrollTop; el.innerHTML = html(); el.scrollTop = sc; };
      el.addEventListener('click', (e) => {
        const d = e.target.closest('[data-dev]'); if (d) { open = d.dataset.dev; re(); return; }
        if (e.target.closest('[data-native]')) { busy = true; re(); setTimeout(() => { busy = false; S.installed = true; re(); GX.shell.notify({ app: 'settings', title: 'Gearbox est installée', body: 'L’icône Gearbox rejoint votre bureau et le menu Démarrer (fictif).', silent: true }); }, 1500); return; }
        const pb = e.target.closest('[data-push]'); if (pb) pushAct(pb.dataset.push, re);
      });
    }
    /* ---------- NotificationsToggle ---------- */
    function pushHTML(compact) {
      const fs = compact ? 'font-size:12px' : '';
      if (S.push === 'denied') return `<div class="set-push warn"><span class="st" style="color:var(--warn)">${GX.icon('belloff', 'sm')}Notifications refusées</span><p style="${fs}">Les notifications ont été refusées pour Gearbox. Pour les rétablir, il faut passer par les réglages : <b>cadenas ou ⓘ dans la barre d’adresse → Notifications → Autoriser</b>. Cette page ne peut plus le demander.</p><button class="set-link" data-push="reset">Maquette : revenir à l’état initial</button></div>`;
      if (S.push === 'granted') return `<div class="set-push"><div class="row wrap" style="gap:12px"><span class="st" style="color:var(--ok)">${GX.icon('bell', 'sm')}Notifications activées</span><button class="set-link" data-push="off" style="color:var(--text-2)">Ne plus recevoir de notifications sur cet appareil</button></div></div>`;
      return `<div class="set-push"><button class="btn" data-push="on" style="justify-self:start;color:var(--bony-violet);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bony-violet) 50%,transparent)">${GX.icon('bell', 'sm')}Activer les notifications</button><p style="${fs}">Reçois les messages du chat sur cet appareil, même Gearbox fermé. Tu peux mettre une conversation en sourdine depuis la rubrique Chat.</p></div>`;
    }
    function pushAct(k, after = rerender) {
      if (k === 'off' || k === 'reset') { S.push = 'default'; after(); return; }
      if (k !== 'on') return;
      /* L'invite du navigateur (le clic est obligatoire : exigence iOS) */
      win.sheet(`<h3>Gearbox souhaite afficher des notifications</h3><div class="muted">Invite du navigateur, simulée dans la maquette.</div><div class="foot"><button class="btn" data-sheet="deny">Bloquer</button><button class="btn primary" data-sheet="ok">Autoriser</button></div>`, { width: 420, onClose: (v) => { if (!v) return; S.push = v === 'ok' ? 'granted' : 'denied'; after(); if (v === 'ok') GX.shell.notify({ app: 'settings', title: 'Notifications activées', body: 'Vous recevrez les messages du Chat sur cet appareil.', silent: true }); } });
    }

    /* ---------- Compte : mot de passe ---------- */
    function strength(pw) {
      if (!pw) return null; if (pw.length < 4) return { l: 'Trop court', n: 1, c: 'var(--danger)' };
      const sc = (pw.length >= 12) + /[a-z]/.test(pw) * /[A-Z]/.test(pw) + /\d/.test(pw) + /[^A-Za-z0-9]/.test(pw);
      return [{ l: 'Faible', n: 1, c: 'var(--danger)' }, { l: 'Faible', n: 1, c: 'var(--danger)' }, { l: 'Moyen', n: 2, c: 'var(--warn)' }, { l: 'Fort', n: 3, c: 'var(--ok)' }, { l: 'Excellent', n: 4, c: 'var(--ok)' }][sc];
    }
    function pwUpdate(host) {
      const nw = host.querySelector('[data-pw="new"]').value, cf = host.querySelector('[data-pw="conf"]').value, s = strength(nw);
      host.querySelectorAll('[data-meter] i').forEach((i, k) => (i.style.background = s && k < s.n ? s.c : ''));
      const lab = host.querySelector('[data-strength]'); lab.textContent = s ? s.l : ''; lab.style.color = s ? s.c : '';
      const m = host.querySelector('[data-match]');
      m.textContent = cf ? (cf === nw ? 'Les mots de passe correspondent' : 'Les mots de passe ne correspondent pas') : ''; m.style.color = cf === nw ? 'var(--ok)' : 'var(--danger)';
    }
    function saveProfile(host) {
      const me = D.user(ME), v = (k) => host.querySelector(`[data-f="${k}"]`).value.trim(), pw = (k) => host.querySelector(`[data-pw="${k}"]`).value;
      const msg = host.querySelector('[data-msg]'), btn = host.querySelector('[data-act="save-profile"]');
      const fail = (m) => { msg.textContent = m; msg.style.color = 'var(--danger)'; GX.animate(btn, [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], { duration: 300, easing: 'ease-out' }); };
      if (!v('name')) return fail('Le nom affiché est obligatoire.');
      const touched = pw('old') || pw('new') || pw('conf');
      if (touched) {
        /* Règles réelles (Settings.tsx) : l'ancien mot de passe n'est plus vérifié côté client */
        if (pw('new') !== pw('conf')) return fail('Les nouveaux mots de passe ne correspondent pas.');
        if (pw('new').length < 4) return fail('Le mot de passe est trop court.');
      }
      Object.assign(me, { name: v('name'), city: v('city'), birthdate: v('birthdate') });
      me.initials = me.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
      host.querySelectorAll('[data-pw]').forEach((i) => (i.value = '')); pwUpdate(host);
      msg.textContent = 'Profil mis à jour avec succès.' + (touched ? ' (mot de passe non conservé : maquette)' : ''); msg.style.color = 'var(--ok)';
      GX.animate(btn, [{ transform: 'scale(.94)' }, { transform: 'none' }], { spring: 'bouncy' });
      GX.shell.notify({ app: 'settings', title: 'Profil enregistré', body: `${me.name}${me.city ? ' · ' + me.city : ''}`, silent: true });
      GX.shell.hud('Profil enregistré');
      refreshSide(); const card = host.querySelector('.set-idcard h3'); if (card) card.textContent = me.name; const av = host.querySelector('.set-idcard .av'); if (av) av.textContent = me.initials;
    }

    /* ---------- Câblage des panneaux (délégation, une fois par hôte) ---------- */
    function wirePanel(host) {
      host.addEventListener('click', (e) => {
        const t = e.target;
        const th = t.closest('[data-set-theme]'); if (th) {
          const v = th.dataset.setTheme; if (prefs().theme === v) return;
          const apply = () => { setPref('theme', v); rerender(); };
          if (document.startViewTransition && !GX.eco()) document.startViewTransition(apply).ready.catch(() => {}); else apply();
          return;
        }
        const ef = t.closest('[data-eff]'); if (ef) { setPref('effects', ef.dataset.eff); host.querySelectorAll('[data-eff]').forEach((b) => b.setAttribute('aria-pressed', b === ef)); const mn = host.querySelector('[data-matnote]'); if (mn) mn.innerHTML = MATNOTE(ef.dataset.eff === 'eco'); GX.shell.hud(ef.dataset.eff === 'eco' ? 'Effets économes : aucun flou' : 'Effets complets'); return; }
        const wp = t.closest('[data-wp]'); if (wp) { setPref('wallpaper', wp.dataset.wp); host.querySelectorAll('[data-wp]').forEach((b) => b.setAttribute('aria-pressed', b === wp)); host.querySelectorAll('.set-mini .wallpaper,[data-wpv]').forEach((w) => (w.className = `wallpaper wp-${wp.dataset.wp}`)); return; }
        const dk = t.closest('[data-dak]'); if (dk) { setPref('da', dk.dataset.dak); host.querySelectorAll('[data-dak]').forEach((b) => b.setAttribute('aria-pressed', b === dk)); GX.shell.hud('Direction : ' + DAS.find((m) => m[0] === dk.dataset.dak)[1]); return; }
        const mt = t.closest('[data-mat]'); if (mt) { setPref('material', mt.dataset.mat); host.querySelectorAll('[data-mat]').forEach((b) => b.setAttribute('aria-pressed', b === mt)); GX.shell.hud('Matière : ' + MATS.find((m) => m[0] === mt.dataset.mat)[1]); return; }
        const ic = t.closest('[data-ics]'); if (ic) { setPref('iconStyle', ic.dataset.ics); host.querySelectorAll('[data-ics]').forEach((b) => b.setAttribute('aria-pressed', b === ic)); GX.shell.hud('Icônes : ' + ICS.find((m) => m[0] === ic.dataset.ics)[1]); return; }
        const rb = t.closest('[data-role]'); if (rb) { if (rb.dataset.role !== GX.ctx.role) GX.shell.setRole(rb.dataset.role); return; }
        const ed = t.closest('[data-edit]'); if (ed) return editUser(ed.dataset.edit, host);
        const du = t.closest('[data-delu]'); if (du) return deleteUser(D.user(du.dataset.delu), host);
        const ph = t.closest('[data-photo]'); if (ph) return photoSheet(ph.dataset.photo);
        if (t.closest('[data-go-push]')) return go('application', 'push');
        const pb = t.closest('[data-push]'); if (pb) return pushAct(pb.dataset.push);
        const a = t.closest('[data-act]'); if (!a) return;
        const act = a.dataset.act;
        if (act === 'save-profile') saveProfile(host);
        if (act === 'showpw') { const inputs = host.querySelectorAll('[data-pw]'); const show = inputs[0].type === 'password'; inputs.forEach((i) => (i.type = show ? 'text' : 'password')); a.textContent = show ? 'Masquer' : 'Afficher'; }
        if (act === 'add-user') editUser(null, host);
        if (act === 'reset-session') win.sheet(`<h3>Réinitialiser la session des fenêtres ?</h3><div class="muted">Toutes les fenêtres se ferment, leurs positions, ancrages et bureaux sont oubliés, puis Gearbox OS se recharge. Vos données et préférences restent intactes.</div>
          <div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok" style="background:var(--danger)">Réinitialiser</button></div>`, { onClose: (v) => { if (v === 'ok') GX.wm.resetSession?.(); } });
        if (act === 'widgets-edit') { if (!prefs().widgets) setPref('widgets', true); GX.widgets?.edit?.(true); }
        if (act === 'widgets-reset') win.sheet(`<h3>Réinitialiser les widgets ?</h3><div class="muted">Les widgets du bureau reprennent la disposition par défaut de votre rôle (${GX.esc(D.ROLES[GX.ctx.role].l)}). Leurs réglages (notes, contenus choisis) sont oubliés.</div>
          <div class="foot"><button class="btn" data-sheet="">Annuler</button><button class="btn primary" data-sheet="ok" style="background:var(--danger)">Réinitialiser</button></div>`, { onClose: (v) => { if (v !== 'ok') return; GX.store.del('widgets.' + (GX.ctx.role === 'Master' ? 'me' : GX.ctx.role)); if (!prefs().widgets) setPref('widgets', true); GX.emit('ctx'); GX.shell.hud('Widgets réinitialisés'); } });
        if (act === 'test-notif') GX.shell.notify({ app: 'settings', title: 'Notification de test', body: prefs().dnd ? 'Ne pas déranger est actif : elle arrive sans bannière.' : 'Voici à quoi ressemble une bannière Gearbox.' });
        if (act === 'install') installSheet();
      });
      host.addEventListener('change', (e) => {
        const t = e.target;
        if (t.matches('[data-pref]') && t.type === 'checkbox') {
          setPref(t.dataset.pref, t.checked);
          if (t.dataset.pref === 'dnd') GX.shell.hud(t.checked ? 'Ne pas déranger activé' : 'Ne pas déranger désactivé');
        }
        if (t.matches('[data-act="notifs"]')) { S.notifs = t.checked; rerender(); }
        if (t.matches('[data-app-notif]')) S.perApp[t.dataset.appNotif] = t.checked;
        if (t.matches('[data-act="games-toggle"]')) setGames(t.checked);
      });
      host.addEventListener('input', (e) => {
        const t = e.target;
        if (t.matches('[data-pref="dockSize"]')) {
          const v = +t.value; setPref('dockSize', v);
          host.querySelectorAll('[data-dockprev] .app-ico').forEach((i) => i.style.setProperty('--s', Math.round(v * .62) + 'px'));
          const small = t.closest('.set-row')?.querySelector('.t small'); if (small) small.textContent = v + ' px';
        }
        if (t.matches('[data-pw]')) pwUpdate(host);
        if (t.matches('[data-uq]')) { uq = t.value; refreshUsers(host); }
      });
    }
    function setGames(on) {
      if (!on) { S.gamesRoles = Object.keys(D.ACCESS).filter((r) => D.ACCESS[r].includes('games')); S.gamesRoles.forEach((r) => (D.ACCESS[r] = D.ACCESS[r].filter((x) => x !== 'games'))); }
      else { (S.gamesRoles || []).forEach((r) => { if (!D.ACCESS[r].includes('games')) D.ACCESS[r].push('games'); }); S.gamesRoles = null; }
      GX.shell.setRole(GX.ctx.role);                                          // reconstruit le Dock, ferme les fenêtres interdites
      setTimeout(() => GX.shell.hud(on ? 'Jeux visibles' : 'Jeux masqués pour tous les rôles'), 30);
    }

    /* ---------- Démarrage, abonnements ---------- */
    const stopW = GX.ui.watchWidth(body, 760, (c) => { compact = c; build(); });
    offs.push(GX.on('prefs', () => { if (self) return; if (['apparence', 'bureau', 'notifs'].includes(sec) && !document.activeElement?.matches?.('[type=range]')) rerender(); }));
    offs.push(GX.on('ctx', () => { if (!okSec(sec)) { sec = 'compte'; } build(); }));
    offs.push(GX.on('wm:change', () => { if (sec === 'bureau') { const h = panelHost(); const s = h?.querySelector('[data-anchor="session"] .set-row .t small'); if (s) { const n = GX.wm.list().length, sp = GX.wm.spaces().length; s.textContent = `${n} fenêtre${n > 1 ? 's' : ''} ouverte${n > 1 ? 's' : ''} · ${sp} bureau${sp > 1 ? 'x' : ''}. Positions, ancrages et bureaux sont restaurés à la prochaine ouverture.`; } } }));
    win.setTitle('Réglages', compact && !inPanel ? '' : secDef(sec).l);
    return {
      destroy() { stopW(); offs.forEach((o) => o()); },
      command(c) { if (typeof c !== 'string') return; const id = c.startsWith('tab:') ? c.slice(4) : c; if (okSec(id)) go(id); if (c === 'add-user' && okSec('users')) { go('users'); setTimeout(() => editUser(null, panelHost()), 120); } },
      menus: () => ({
        'Fichier': okSec('users') ? [{ label: 'Ajouter un utilisateur…', icon: 'plus', action: () => { go('users'); setTimeout(() => editUser(null, panelHost()), 120); } }] : [],
        'Présentation': allowed().map((s) => ({ label: s.l, icon: s.icon, checked: sec === s.id && (!compact || inPanel), action: () => go(s.id) })),
      }),
    };
  }

  GX.registerApp({ id: 'settings', name: 'Réglages', icon: 'settings', tint: ['#9aa0ad', '#555b68'], size: [980, 680], minSize: [360, 320], mount });
})();
