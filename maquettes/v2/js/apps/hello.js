/* =====================================================================
   Rubrique « Hello Marketing » (miroir de pages/HelloMarketing.tsx)
   Modèle validé : maquettes/ux/project/Hello.dc.html
   - L'ÉQUIPE AUJOURD'HUI (une rangée de 4 cartes) : météo du jour +
     prévisions 5 jours + rafraîchir ; 3 prochains événements (projets
     Actifs OU Brouillons de type Expo/Salon, Animation Co, OP Clients,
     Collaborateurs, J-n) ; musique du jour (piste du jour de la playlist,
     lecteur d'extrait 30 s) ; viennoiseries de la semaine (tirage par
     semaine ISO, historique des 4 semaines précédentes)
   - Anniversaires sur UNE ligne (tous les collègues, défilement horizontal)
   - LA VEILLE : Actu auto et Marketing & tech côte à côte, 12 articles
     fusionnés et triés par date, source colorée, date relative, « Voir ↗ »,
     « Mis à jour à HH:MM », rafraîchir
   - Chef de site (hasSocialFeatures = faux) : ni musique, ni viennoiseries,
     ni anniversaires ; événements limités à son site (filtrage serveur).
   ===================================================================== */
(() => {
  const D = GX.data, F = GX.fmt, esc = GX.esc, H = D.HELLO;
  /* EVENT_PROJECT_TYPES / EVENT_TYPE_COLORS de HelloMarketing.tsx (orange, bleu, émeraude, violet) */
  const EVENT_TYPES = { 'Expo/Salon': '#f97316', 'Animation Co': '#3b82f6', 'OP Clients': '#10b981', Collaborateurs: '#a855f7' };
  const VIENNOISERIES_ROLES = ['Master', 'Administrator', 'Coordinator', 'Digital Manager'];
  const ACCROCHES = ["Et c'est...", 'Le grand gagnant est...', 'Roulement de tambour...', "Cette semaine le bonheur c'est..."];
  const BADGES = ['Champion du croissant 🏆', 'Roi de la brioche 👑', 'Maître des pains au chocolat 🎖️', 'Légende du bureau 🌟'];
  /* Ciels : couleurs du temps qu'il fait (getWeatherBg), donnée météo et non charte */
  const SKY = { sun: ['#38bdf8', '#3b82f6'], cloudsun: ['#3b6fd8', '#1f3f8f'], cloud: ['#64748b', '#475569'], rain: ['#1d4ed8', '#334155'], night: ['#0c1636', '#2d3f7a'] };
  /* Sources des flux (backend/src/routes/feeds.ts) : nom + couleur du badge */
  const FEEDS = [
    { k: 'auto', t: 'Actu auto', icon: 'car', c: '#ff7a52', sources: [['AutoPlus', '#059669'], ['AutoMoto', '#9333ea'], ['Caradisiac', '#2563eb'], ['Autoactu', '#ef4444']],
      extra: ['Carburants : les prix à la pompe reculent encore', 'Contrôle technique : ce qui change au 1er janvier', 'Leasing social : une nouvelle vague de dossiers ouverte', 'Utilitaires électriques : les artisans franchissent le pas', 'Pneus hiver : la loi Montagne entre en vigueur', 'Batteries : la seconde vie s’organise'] },
    { k: 'marketing', t: 'Marketing & tech', icon: 'bolt', c: '#b98cff', sources: [['BDM', '#3b82f6'], ['JDN', '#4f46e5'], ['Influencia', '#db2777'], ['Usine Digitale', '#0e7490']],
      extra: ['SEO local : les avis clients pèsent de plus en plus', 'Newsletters : le grand retour du format long', 'Publicité en ligne : les budgets basculent vers la vidéo', 'CRM : unifier les données clients sans tout refaire', 'Influence : les micro-créateurs rassurent les marques', 'Salons : réussir sa prospection avant l’événement'] },
  ];
  /* Playlist du jour (proxy /api/music/tracks dans Gearbox) : piste = jour de l'année % longueur */
  const PLAYLIST = [H.track, { title: 'Route 89', artist: 'Clara Volt', cover: ['#8f12ab', '#22c3d6'] }, { title: 'Les Puys', artist: 'Arverne Club', cover: ['#16a34a', '#293f74'] },
    { title: 'Nuit sur la N9', artist: 'Moteur Bleu', cover: ['#0284c7', '#1f1d24'] }, { title: 'Soleil de Limagne', artist: 'Juliette & les Pistons', cover: ['#f59e0b', '#e11d74'] }, { title: 'Contre-allée', artist: 'Kilomètre Zéro', cover: ['#7c3aed', '#f75632'] }];
  const FT = 'font-family="Albert Sans,system-ui,sans-serif" font-weight="800"';

  /* ---------------- Vignettes illustrées (SVG, couleurs d'illustration) ---------------- */
  const heart = (x, y, s, c) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 4C0-1 7-2 8 3c1-5 8-4 8 1 0 5-8 10-8 10S0 9 0 4z" fill="${c}"/>`;
  const star = (x, y, s, c) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0-6 1.8-1.9 6.3-1.9 2.7.8 4 5.2 0 2.5-4 5.2-2.7.8-6.3-1.9-1.8-1.9Z" fill="${c}"/>`;
  const sedan = (x, y, body, glass, rim) => `<g transform="translate(${x} ${y})"><path d="M6 30c0-7 5-10 12-11l24-4 18-11c5-3 9-4 16-4h30c9 0 15 2 21 8l12 11c10 1 17 4 17 11v5c0 2-2 4-4 4H9c-2 0-3-2-3-4z" fill="${body}"/><path d="M50 15l14-9c3-2 7-3 12-3h10v12zM92 3h10c7 0 11 2 15 6l7 6H92z" fill="${glass}"/><circle cx="38" cy="38" r="9" fill="#0c0412" stroke="${rim}" stroke-width="3"/><circle cx="124" cy="38" r="9" fill="#0c0412" stroke="${rim}" stroke-width="3"/></g>`;
  const SCENES = [
    { k: 'roi', re: /ROI/, d: 'Coût par contact, rendez-vous générés, ventes à 90 jours : la méthode pour chiffrer ce que rapporte vraiment un stand.',
      svg: (u) => `<defs><linearGradient id="${u}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#20124d"/><stop offset="1" stop-color="#f75632"/></linearGradient></defs><rect width="320" height="180" fill="url(#${u}a)"/>
        <rect y="142" width="320" height="38" fill="#170c33" opacity=".55"/><rect x="46" y="34" width="164" height="108" rx="8" fill="#fff"/><rect x="46" y="34" width="164" height="18" rx="8" fill="#8f12ab"/><rect x="46" y="44" width="164" height="8" fill="#8f12ab"/>
        <g fill="#f75632"><rect x="66" y="96" width="16" height="22" rx="3"/><rect x="90" y="84" width="16" height="34" rx="3"/><rect x="114" y="72" width="16" height="46" rx="3"/><rect x="138" y="62" width="16" height="56" rx="3" fill="#8f12ab"/></g><path d="M66 90 98 76l24-10 34-12" stroke="#20124d" stroke-width="3" fill="none" stroke-linecap="round"/>
        <rect x="74" y="122" width="108" height="26" rx="5" fill="#2a1747"/><circle cx="254" cy="72" r="32" fill="#ffcc33"/><circle cx="254" cy="72" r="24" fill="none" stroke="#e0a800" stroke-width="3"/><text x="254" y="83" text-anchor="middle" ${FT} font-size="30" fill="#8a5a00">€</text>
        <path d="M232 150 266 120M252 118h16v16" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` },
    { k: 'occasion', re: /occasion/i, d: 'Après un été calme, les transactions de véhicules d’occasion repartent nettement : les citadines récentes et les SUV compacts tirent le marché.',
      svg: (u) => `<defs><linearGradient id="${u}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#241046"/><stop offset=".5" stop-color="#b8338f"/><stop offset=".85" stop-color="#ff8a4c"/></linearGradient><radialGradient id="${u}g"><stop offset="0" stop-color="#ffe7a3"/><stop offset=".45" stop-color="#ffb35c" stop-opacity=".7"/><stop offset="1" stop-color="#ff7b3a" stop-opacity="0"/></radialGradient></defs>
        <rect width="320" height="180" fill="url(#${u}s)"/><circle cx="210" cy="112" r="84" fill="url(#${u}g)"/><circle cx="210" cy="112" r="28" fill="#ffd98a"/>
        <g fill="#fff" opacity=".75"><circle cx="40" cy="22" r="1.3"/><circle cx="92" cy="14" r="1"/><circle cx="278" cy="24" r="1.4"/><circle cx="142" cy="30" r="1"/></g>
        <path d="M0 118 60 86l40 22 50-34 50 36 44-26 36 22 40-14v88H0z" fill="#6a1f6e" opacity=".75"/><path d="M0 128l70-18 60 14 70-20 60 16 60-10v70H0z" fill="#3c1150"/><rect y="138" width="320" height="42" fill="#1a0826"/>
        <path d="M200 138h20l70 42H130z" fill="#2a1239"/><path d="M209 142h2l4 9h-10zM207 157h6l6 17h-18z" fill="#ffcf8a" opacity=".7"/>
        ${sedan(36, 110, '#0c0412', 'rgba(255,157,110,.6)', '#3a1a44')}<path d="M188 136h8" stroke="#ffcf8a" stroke-width="3" stroke-linecap="round"/>` },
    { k: 'borne', re: /borne/i, d: 'Les aires de service accueillent de nouvelles stations de recharge ultra-rapide : un plein d’autonomie en moins de vingt minutes sur les grands axes.',
      svg: (u) => `<defs><linearGradient id="${u}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#071a33"/><stop offset="1" stop-color="#0d6b78"/></linearGradient><linearGradient id="${u}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1fcff"/><stop offset="1" stop-color="#9fe3ef"/></linearGradient><radialGradient id="${u}g"><stop offset="0" stop-color="#3ff2c1" stop-opacity=".75"/><stop offset="1" stop-color="#3ff2c1" stop-opacity="0"/></radialGradient></defs>
        <rect width="320" height="180" fill="url(#${u}s)"/><circle cx="274" cy="30" r="11" fill="#e8f6ff" opacity=".85"/><g fill="#fff" opacity=".7"><circle cx="30" cy="20" r="1.2"/><circle cx="120" cy="16" r="1"/><circle cx="200" cy="34" r="1.2"/></g>
        <path d="M0 112 80 98l70 8 60-12 110 14v12H0z" fill="#0a3a4c"/><path d="M0 180 150 108h20l150 72z" fill="#082234"/><path d="M158 112h4l1 10h-6zM157 130h6l2 16h-10zM155 156h10l3 22h-16z" fill="#ffd66b" opacity=".85"/>
        <circle cx="76" cy="100" r="64" fill="url(#${u}g)"/><rect x="52" y="60" width="48" height="82" rx="9" fill="url(#${u}b)"/><rect x="59" y="70" width="34" height="24" rx="4" fill="#0b3b4d"/><path d="M78 73l-8 11h6l-3 8 10-12h-6l3-7z" fill="#3ff2c1"/>
        <rect x="46" y="140" width="60" height="7" rx="3.5" fill="#0b3b4d"/><path d="M100 106c22 0 22 32 50 32" stroke="#0b3b4d" stroke-width="5" fill="none" stroke-linecap="round"/>
        <g transform="translate(196 110)"><path d="M8 18l10-14c2-3 5-4 9-4h46c4 0 7 1 9 4l10 14c5 1 8 4 8 9v10c0 2-2 4-4 4H4c-2 0-4-2-4-4V27c0-5 3-8 8-9z" fill="#e8f3f7"/><path d="M20 16l7-10h46l7 10z" fill="#0b3b4d"/><rect x="6" y="24" width="16" height="6" rx="3" fill="#ff5a5f"/><rect x="78" y="24" width="16" height="6" rx="3" fill="#ff5a5f"/><rect x="-2" y="40" width="16" height="10" rx="3" fill="#051726"/><rect x="86" y="40" width="16" height="10" rx="3" fill="#051726"/></g>` },
    { k: 'essai', re: /essai|SUV/i, d: 'Habitabilité, consommation réelle, aides à la conduite : notre banc d’essai complet du SUV compact dont tout le monde parle.',
      svg: (u) => `<defs><linearGradient id="${u}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1f2e"/><stop offset="1" stop-color="#3f486b"/></linearGradient></defs><rect width="320" height="180" fill="url(#${u}s)"/>
        <path d="M128 0h64l76 152H52z" fill="#fff" opacity=".08"/><ellipse cx="160" cy="152" rx="146" ry="22" fill="#11131d"/><ellipse cx="160" cy="148" rx="100" ry="12" fill="#fff" opacity=".09"/>
        <g transform="translate(66 88)"><path d="M4 48V34c0-6 4-9 10-10l20-3 14-16c3-3 7-5 12-5h60c6 0 10 2 13 6l12 15c9 1 15 5 15 12v15c0 3-2 5-5 5H9c-3 0-5-2-5-5z" fill="#f75632"/><path d="M46 22l12-14c2-2 4-3 8-3h22v17zM96 5h22c4 0 7 2 9 5l10 12H96z" fill="#1a2238" opacity=".88"/><path d="M8 36h176" stroke="#fff" stroke-opacity=".35" stroke-width="2"/><circle cx="44" cy="54" r="13" fill="#11131d" stroke="#c9cfdb" stroke-width="4"/><circle cx="148" cy="54" r="13" fill="#11131d" stroke="#c9cfdb" stroke-width="4"/></g>
        <circle cx="260" cy="42" r="25" fill="#ffcc33"/><text x="260" y="48" text-anchor="middle" ${FT} font-size="17" fill="#1b1f2e">8,5</text>
        <g fill="none" stroke="#3ed487" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M40 30l4 4 8-9M40 48l4 4 8-9M40 66l4 4 8-9"/></g><g fill="#fff" opacity=".55"><rect x="60" y="27" width="52" height="5" rx="2.5"/><rect x="60" y="45" width="40" height="5" rx="2.5"/><rect x="60" y="63" width="46" height="5" rx="2.5"/></g>` },
    { k: 'ventes', re: /ventes|progress/i, d: 'Portées par les nouveaux modèles abordables, les immatriculations de citadines électriques gagnent encore du terrain ce trimestre.',
      svg: (u) => `<defs><linearGradient id="${u}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0c3326"/><stop offset="1" stop-color="#1f8a5b"/></linearGradient></defs><rect width="320" height="180" fill="url(#${u}s)"/>
        <g stroke="#fff" stroke-opacity=".12"><path d="M20 40h280M20 80h280M20 120h280"/></g><g fill="#fff" opacity=".2"><rect x="40" y="120" width="32" height="30" rx="4"/><rect x="90" y="105" width="32" height="45" rx="4"/><rect x="140" y="88" width="32" height="62" rx="4"/><rect x="190" y="66" width="32" height="84" rx="4"/></g><rect x="240" y="42" width="32" height="108" rx="4" fill="#3ff2a0"/>
        <path d="M56 114 106 100 156 84 206 62 250 36" stroke="#ffe066" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M236 32l16 2-4 15" stroke="#ffe066" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <g fill="#ffe066"><circle cx="56" cy="114" r="4"/><circle cx="106" cy="100" r="4"/><circle cx="156" cy="84" r="4"/><circle cx="206" cy="62" r="4"/></g>
        <circle cx="52" cy="44" r="17" fill="#3ff2a0"/><path d="M44 52c0-12 8-18 18-18 0 11-6 18-18 18zm0 0 9-9" stroke="#0c3326" stroke-width="2.5" fill="#0c3326" fill-opacity=".25" stroke-linecap="round"/>
        <text x="282" y="168" text-anchor="end" ${FT} font-size="16" fill="#fff">+18 %</text>` },
    { k: 'hybride', re: /hybride|choisir/i, d: 'Trajets quotidiens, recharge à domicile, budget : le match hybride contre électrique, critère par critère, pour faire le bon choix.',
      svg: () => `<rect width="320" height="180" fill="#ff8a3d"/><path d="M190 0h130v180H130z" fill="#14b87a"/><circle cx="40" cy="150" r="60" fill="#fff" opacity=".08"/><circle cx="290" cy="20" r="50" fill="#fff" opacity=".08"/>
        <g transform="translate(48 44)"><rect width="42" height="68" rx="7" fill="#fff"/><rect x="8" y="9" width="26" height="17" rx="3" fill="#ff8a3d"/><path d="M42 18h8c4 0 6 3 6 6v28c0 3 2 5 5 5s5-2 5-5V28l-8-8" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g>
        <text x="74" y="142" text-anchor="middle" ${FT} font-size="14" letter-spacing="1.5" fill="#fff">HYBRIDE</text>
        <g fill="#fff"><rect x="238" y="40" width="7" height="22" rx="3.5"/><rect x="257" y="40" width="7" height="22" rx="3.5"/><rect x="230" y="60" width="42" height="38" rx="9"/><rect x="246" y="97" width="10" height="22"/></g><path d="M253 66l-9 13h7l-3 11 11-15h-7l3-9z" fill="#14b87a"/>
        <text x="252" y="142" text-anchor="middle" ${FT} font-size="14" letter-spacing="1.5" fill="#fff">ÉLECTRIQUE</text>
        <circle cx="160" cy="90" r="25" fill="#1b1430"/><text x="160" y="97" text-anchor="middle" ${FT} font-size="18" fill="#fff">VS</text>` },
    { k: 'salon', re: /salon de|dévoile/i, d: 'Concepts, premières mondiales, espace électrique agrandi : le salon lève le voile sur son calendrier et ses exposants.',
      svg: (u) => `<defs><linearGradient id="${u}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#150c2b"/><stop offset="1" stop-color="#40205f"/></linearGradient></defs><rect width="320" height="180" fill="url(#${u}s)"/>
        <g fill="#fff" opacity=".08"><path d="M62 0h14l44 132H40z"/><path d="M244 0h14l24 132H200z"/><path d="M153 0h14l44 132H110z"/></g><g fill="#ffe9a8"><circle cx="69" cy="4" r="5"/><circle cx="160" cy="4" r="5"/><circle cx="251" cy="4" r="5"/></g>
        <rect x="14" y="18" width="12" height="64" rx="2" fill="#f75632"/><rect x="294" y="18" width="12" height="64" rx="2" fill="#8f12ab"/><rect x="104" y="16" width="112" height="24" rx="5" fill="#f75632"/><text x="160" y="33" text-anchor="middle" ${FT} font-size="12" letter-spacing="2" fill="#fff">SALON 2026</text>
        <ellipse cx="160" cy="142" rx="112" ry="18" fill="#2a1747"/><ellipse cx="160" cy="138" rx="112" ry="18" fill="#5a3290"/><ellipse cx="160" cy="138" rx="80" ry="11" fill="#fff" opacity=".1"/>
        ${sedan(79, 96, '#ecebf3', '#2b2140', '#a7a3b8')}
        <g fill="#0b0617"><circle cx="22" cy="160" r="9"/><rect x="9" y="167" width="26" height="14" rx="8"/><circle cx="50" cy="164" r="8"/><rect x="38" y="170" width="24" height="12" rx="8"/><circle cx="272" cy="162" r="8"/><rect x="260" y="168" width="24" height="14" rx="8"/><circle cx="300" cy="158" r="9"/><rect x="287" y="165" width="26" height="16" rx="8"/></g>` },
    { k: 'video', re: /vidéo|réseaux/i, d: 'Formats verticaux de moins de 30 secondes, sous-titres, accroche dès la première seconde : ce qui fonctionne encore sur les réseaux.',
      svg: (u) => `<defs><linearGradient id="${u}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5aa0"/><stop offset="1" stop-color="#6a2bd9"/></linearGradient><linearGradient id="${u}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb86b"/><stop offset="1" stop-color="#ff5aa0"/></linearGradient></defs><rect width="320" height="180" fill="url(#${u}s)"/>
        <circle cx="290" cy="150" r="70" fill="#fff" opacity=".08"/><circle cx="20" cy="10" r="50" fill="#fff" opacity=".08"/>
        <rect x="120" y="16" width="84" height="156" rx="15" fill="#15101f"/><rect x="126" y="28" width="72" height="132" rx="9" fill="url(#${u}p)"/><circle cx="162" cy="88" r="19" fill="#fff" opacity=".92"/><path d="M156 79v18l15-9z" fill="#ff5aa0"/><rect x="134" y="146" width="56" height="4" rx="2" fill="#fff" opacity=".4"/><rect x="134" y="146" width="34" height="4" rx="2" fill="#fff"/>
        ${heart(222, 34, 1.4, '#fff')}${heart(246, 68, 1, '#ffd1e6')}${heart(226, 100, .8, '#fff')}${heart(256, 118, 1.2, '#ffd1e6')}
        <g transform="translate(40 36)"><rect width="72" height="26" rx="13" fill="#fff"/><circle cx="13" cy="13" r="7" fill="#ff5aa0"/><rect x="26" y="8" width="36" height="4" rx="2" fill="#15101f" opacity=".6"/><rect x="26" y="15" width="30" height="4" rx="2" fill="#15101f" opacity=".3"/></g>
        <g transform="translate(46 72)"><rect width="66" height="26" rx="13" fill="#fff"/><circle cx="13" cy="13" r="7" fill="#6a2bd9"/><rect x="26" y="8" width="30" height="4" rx="2" fill="#15101f" opacity=".6"/><rect x="26" y="15" width="26" height="4" rx="2" fill="#15101f" opacity=".3"/></g>
        <text x="44" y="136" ${FT} font-size="20" fill="#fff">12,4 k</text><text x="44" y="152" ${FT} font-size="10" letter-spacing="1" fill="#fff" opacity=".85">VUES</text>` },
    { k: 'ia', re: /\bIA\b|intelligence/, d: 'Briefs, déclinaisons de visuels, analyse des avis clients : cinq cas d’usage déjà en place dans des équipes marketing, et leurs limites.',
      svg: (u) => `<defs><radialGradient id="${u}s" cx=".5" cy=".5" r=".8"><stop offset="0" stop-color="#5b28c7"/><stop offset="1" stop-color="#0f0826"/></radialGradient><radialGradient id="${u}g"><stop offset="0" stop-color="#ff8ad1" stop-opacity=".8"/><stop offset="1" stop-color="#ff8ad1" stop-opacity="0"/></radialGradient></defs><rect width="320" height="180" fill="url(#${u}s)"/>
        <g stroke="#b98cff" stroke-opacity=".5" stroke-width="1.5"><path d="M40 40 100 70 160 90 220 60 280 40M40 140 100 110 160 90 220 120 280 150M100 70 100 110M220 60 220 120M40 40 40 140M280 40 280 150"/></g>
        <g fill="#b98cff"><circle cx="40" cy="40" r="5"/><circle cx="100" cy="70" r="6"/><circle cx="220" cy="60" r="6"/><circle cx="280" cy="40" r="5"/><circle cx="40" cy="140" r="5"/><circle cx="100" cy="110" r="6"/><circle cx="220" cy="120" r="6"/><circle cx="280" cy="150" r="5"/></g>
        <circle cx="160" cy="90" r="56" fill="url(#${u}g)"/><path d="M160 46c4 28 12 36 40 40-28 4-36 12-40 40-4-28-12-36-40-40 28-4 36-12 40-40z" fill="#fff"/><path d="M212 26c2 10 5 13 14 14-9 1-12 4-14 14-2-10-5-13-14-14 9-1 12-4 14-14z" fill="#ffd1f0"/>` },
    { k: 'email', re: /mail/i, d: 'Segmentation plus fine et objets plus courts : les campagnes emailing retrouvent des taux d’ouverture qu’on n’avait plus vus depuis longtemps.',
      svg: (u) => `<defs><linearGradient id="${u}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f4fa0"/><stop offset="1" stop-color="#2cc4e0"/></linearGradient></defs><rect width="320" height="180" fill="url(#${u}s)"/>
        <circle cx="300" cy="170" r="80" fill="#fff" opacity=".08"/><rect x="108" y="30" width="104" height="74" rx="6" fill="#eef6ff"/><g fill="#9cc0e6"><rect x="120" y="44" width="60" height="6" rx="3"/><rect x="120" y="58" width="80" height="5" rx="2.5"/><rect x="120" y="70" width="70" height="5" rx="2.5"/></g>
        <path d="M92 72l68 44 68-44v68a10 10 0 0 1-10 10H102a10 10 0 0 1-10-10z" fill="#fff"/><path d="M92 146l52-38M228 146l-52-38" stroke="#cfe2f5" stroke-width="3"/>
        <circle cx="228" cy="62" r="18" fill="#ff5a5f"/><text x="228" y="68" text-anchor="middle" ${FT} font-size="15" fill="#fff">24</text>
        <text x="44" y="46" ${FT} font-size="24" fill="#fff">42 %</text><text x="44" y="62" ${FT} font-size="10" letter-spacing="1" fill="#fff" opacity=".85">OUVERTURE</text>
        <path d="M262 146l28-30M278 114h12v12" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` },
    { k: 'retail', re: /retail|magasin/i, d: 'Ateliers, avant-premières, journées portes ouvertes : les enseignes misent de nouveau sur l’événementiel pour faire revenir les clients.',
      svg: (u) => `<defs><linearGradient id="${u}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd9a0"/><stop offset="1" stop-color="#ff9e7a"/></linearGradient></defs><rect width="320" height="180" fill="url(#${u}s)"/>
        <path d="M0 14q80 26 160 6t160-6" stroke="#7a3a5a" stroke-width="1.5" fill="none"/><g><path d="M24 20l8 14 6-12z" fill="#f75632"/><path d="M70 28l6 14 8-10z" fill="#8f12ab"/><path d="M118 28l6 14 8-12z" fill="#2f6fe0"/><path d="M196 24l6 14 8-12z" fill="#17a862"/><path d="M244 18l6 14 8-12z" fill="#f75632"/><path d="M288 14l6 14 8-12z" fill="#8f12ab"/></g>
        <rect y="152" width="320" height="28" fill="#6b3a5a"/><rect x="60" y="58" width="200" height="96" fill="#fff6ec"/><rect x="96" y="34" width="128" height="22" rx="4" fill="#8f12ab"/><text x="160" y="49" text-anchor="middle" ${FT} font-size="11" letter-spacing="2" fill="#fff">BOUTIQUE</text>
        ${Array.from({ length: 10 }, (_, i) => `<path d="M${60 + i * 20} 58h20v16a10 10 0 0 1-20 0z" fill="${i % 2 ? '#fff' : '#f75632'}"/>`).join('')}
        <rect x="76" y="90" width="58" height="46" rx="4" fill="#9fd3ff"/><rect x="186" y="90" width="58" height="46" rx="4" fill="#9fd3ff"/><path d="M84 128l14-18 10 10 8-6 12 14z" fill="#fff" opacity=".6"/><rect x="146" y="94" width="28" height="60" rx="3" fill="#8f12ab"/><circle cx="168" cy="126" r="2" fill="#ffcc33"/>
        <g fill="#3b1c3a"><circle cx="30" cy="136" r="9"/><rect x="18" y="146" width="24" height="26" rx="10"/><circle cx="290" cy="138" r="9"/><rect x="278" y="148" width="24" height="24" rx="10"/></g>` },
    { k: 'gbp', re: /google|profile/i, d: 'Nouvelles catégories, publications enrichies, réponses aux avis : les dernières évolutions de la fiche d’établissement, et comment en profiter.',
      svg: () => `<rect width="320" height="180" fill="#e7eee0"/><path d="M0 150c40-10 70 10 110 0v30H0z" fill="#a9d4f5"/><rect x="232" y="76" width="72" height="46" rx="6" fill="#bfe3b0"/>
        <g stroke="#fff" stroke-width="11"><path d="M0 60h320M0 132h320M80 0v180M218 0v180"/></g><g stroke="#fff" stroke-width="5"><path d="M0 20 150 180M180 0l140 110"/></g>
        <ellipse cx="140" cy="146" rx="18" ry="5" fill="#000" opacity=".15"/><path d="M140 36c-22 0-38 16-38 38 0 28 38 68 38 68s38-40 38-68c0-22-16-38-38-38z" fill="#ea4335"/><circle cx="140" cy="74" r="14" fill="#fff"/>
        <g transform="translate(170 18)"><rect width="120" height="52" rx="9" fill="#fff" stroke="#000" stroke-opacity=".08"/><rect x="11" y="11" width="64" height="7" rx="3.5" fill="#3c4043"/>${[0, 1, 2, 3, 4].map((i) => star(17 + i * 14, 34, 1, '#fbbc04')).join('')}<text x="108" y="39" text-anchor="end" ${FT} font-size="12" fill="#3c4043">4,8</text></g>` },
  ];
  const sceneOf = (t, i) => SCENES.find((s) => s.re.test(t)) || SCENES[i % SCENES.length];
  let thumbN = 0;
  const thumb = (t, i) => { const u = 'hlt' + (++thumbN) + '_'; return `<svg class="hel-art" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${sceneOf(t, i).svg(u)}</svg>`; };

  /* pictos absents de core.js : pluie (prévisions) */
  const RAIN = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 15h10a4 4 0 0 0 0-8 5 5 0 0 0-9.6 1.6A3.2 3.2 0 0 0 7 15z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/></svg>';
  const wIcon = (ic) => (ic === 'rain' ? RAIN : GX.icon(ic));

  GX.css(`
  .hel-scroll{background:transparent}
  .hel-wrap{padding:4px 30px 32px;display:flex;flex-direction:column;gap:20px;min-width:0}
  .hel-sec{font-family:var(--font-display);font-weight:700;font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-2);margin:4px 2px -4px}
  .hel-in{animation:hel-in 520ms var(--spring-soft) backwards;animation-delay:calc(var(--i,0) * 60ms)}
  @keyframes hel-in{from{opacity:0;transform:translateY(12px) scale(.985)}}
  .hel-card{position:relative;min-width:0;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line);border-radius:16px;padding:20px 22px;display:flex;flex-direction:column;gap:12px}
  :root[data-theme="light"] .hel-card{background:#fff;box-shadow:inset 0 0 0 1px var(--line),var(--shadow-1)}
  .hel-h{display:flex;align-items:center;gap:9px;margin:0;font-family:var(--font-display);font-weight:700;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--text)}
  .hel-h svg.i{width:16px;height:16px;color:var(--accent);flex:none}
  .hel-h .grow{flex:1}
  .hel-top{display:grid;grid-template-columns:minmax(0,1.35fr) repeat(3,minmax(0,1fr));gap:20px;align-items:stretch}
  .hel-top.sm{grid-template-columns:minmax(0,1.35fr) minmax(0,1fr)}
  .hel-sub{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--text-3)}
  /* Météo */
  .hel-wx{padding:0;overflow:hidden;gap:0}
  .hel-sky{position:relative;overflow:hidden;padding:20px 22px;color:#fff;background:linear-gradient(135deg,var(--s1),var(--s2) 75%);display:flex;flex-direction:column;gap:8px}
  .hel-sky .glow{position:absolute;right:-50px;top:-60px;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,rgba(255,226,140,.55),rgba(255,210,110,.12) 45%,transparent 70%);animation:hel-breathe 6s ease-in-out infinite;pointer-events:none}
  @keyframes hel-breathe{50%{transform:scale(1.08);opacity:.85}}
  .hel-where{position:relative;display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:rgba(255,255,255,.9);min-width:0}
  .hel-where svg.i{width:14px;height:14px;flex:none}
  .hel-where span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
  .hel-sky .icon-btn{margin-left:auto;flex:none;color:#fff;background:rgba(255,255,255,.16)}
  .hel-sky .icon-btn:hover{background:rgba(255,255,255,.28)}
  .hel-now{position:relative;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
  .hel-temp{font-size:60px;font-weight:700;line-height:1;letter-spacing:-.03em}
  .hel-now svg.i{width:60px;height:60px;stroke-width:1.3;color:#fff;filter:drop-shadow(0 6px 12px rgba(0,0,0,.2))}
  .hel-now .d{font-size:17px;font-weight:700}.hel-now .f{font-size:14px;color:rgba(255,255,255,.88)}
  .hel-fc{padding:14px 18px 18px;display:flex;flex-direction:column;gap:10px;flex:1}
  .hel-fcg{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
  .hel-fcd{padding:10px 4px;border-radius:10px;background:var(--surface-3);display:flex;flex-direction:column;align-items:center;gap:5px;text-align:center}
  :root[data-theme="light"] .hel-fcd{background:var(--surface-2)}
  .hel-fcd .n{font-size:11.5px;font-weight:700;letter-spacing:.08em;color:var(--text-2);text-transform:uppercase}
  .hel-fcd svg.i{width:22px;height:22px;color:var(--text-2)}.hel-fcd svg.i.sun{color:var(--warn)}
  .hel-fcd .t{font-size:14px;white-space:nowrap}.hel-fcd .t b{color:var(--text)}.hel-fcd .t span{color:var(--text-3)}
  .hel-wx.loading .hel-sky>*:not(.hel-where),.hel-wx.loading .hel-fcg{opacity:.35;transition:opacity var(--t-fast)}
  .spin svg.i{animation:hel-spin .8s linear infinite}
  @keyframes hel-spin{to{transform:rotate(360deg)}}
  /* Événements */
  .hel-ev{display:flex;align-items:center;gap:14px;padding:10px 12px;border-radius:12px;background:var(--surface-3);box-shadow:inset 0 0 0 1px var(--line);cursor:pointer;text-align:left;transition:box-shadow var(--t-fast),transform var(--t-med) var(--spring-snappy)}
  :root[data-theme="light"] .hel-ev{background:var(--surface-1)}
  .hel-ev:hover{transform:translateY(-1px);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 55%,transparent),var(--shadow-1)}
  .hel-j{width:54px;flex:none;text-align:center}
  .hel-j b{display:block;font-family:var(--font-display);font-weight:700;font-size:18px;color:var(--accent);white-space:nowrap}
  .hel-j span{font-size:10.5px;color:var(--text-3);text-transform:uppercase;letter-spacing:.08em}
  .hel-ev .nm{font-size:14.5px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .hel-ev .mt{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;margin-top:5px;font-size:12.5px;color:var(--text-2)}
  .hel-type{height:20px;padding:0 7px;border-radius:5px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;background:color-mix(in srgb,var(--c) 18%,transparent);color:color-mix(in srgb,var(--c) 70%,var(--text))}
  .hel-none{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:14px;text-align:center;color:var(--text-2);font-size:13.5px;line-height:1.5}
  .hel-none svg.i{width:26px;height:26px;stroke-width:1.2;color:var(--text-3)}
  /* Musique */
  .hel-trk{display:flex;align-items:center;gap:14px;min-width:0}
  .hel-cover{width:88px;height:88px;border-radius:12px;flex:none;display:grid;place-items:center;color:rgba(255,255,255,.92);background:linear-gradient(135deg,var(--c1),var(--c2));box-shadow:0 12px 26px -14px var(--c2);transition:transform 520ms var(--spring-bouncy)}
  .hel-cover svg.i{width:34px;height:34px;stroke-width:1.5}
  .playing .hel-cover{transform:scale(1.04) rotate(-2deg)}
  .hel-trk .tt{font-size:16px;font-weight:700;color:var(--text)}.hel-trk .ar{font-size:14px;color:var(--text-2);margin-top:4px}
  .hel-trk .pl{font-size:12px;color:var(--text-3);margin-top:8px;line-height:1.4}
  .hel-player{display:flex;align-items:center;gap:12px;margin-top:auto}
  .hel-play{width:44px;height:44px;border-radius:50%;flex:none;display:grid;place-items:center;color:#fff;background:var(--bony-grad);box-shadow:0 8px 18px -10px var(--accent);transition:transform var(--t-fast) var(--spring-bouncy)}
  .hel-play:hover{transform:scale(1.06)}.hel-play:active{transform:scale(.92)}
  .hel-play svg.i{width:17px;height:17px;fill:currentColor;stroke:none}
  .hel-player .tm{font-size:12.5px;color:var(--text-2);font-variant-numeric:tabular-nums;flex:none}
  .hel-bar{flex:1;height:6px;border-radius:3px;background:var(--surface-4);position:relative;cursor:pointer;min-width:40px}
  .hel-bar i{position:absolute;left:0;top:0;bottom:0;border-radius:inherit;background:var(--bony-grad)}
  .hel-bar b{position:absolute;top:50%;width:13px;height:13px;margin:-6.5px 0 0 -6.5px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.4);transform:scale(0);transition:transform var(--t-fast) var(--spring-bouncy)}
  .hel-bar:hover b,.playing .hel-bar b{transform:scale(1)}
  /* Viennoiseries */
  .hel-vien{align-items:center;text-align:center;gap:10px;background:linear-gradient(160deg,color-mix(in srgb,var(--warn) 14%,var(--surface-2)),var(--surface-2) 70%);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--warn) 28%,var(--line))}
  :root[data-theme="light"] .hel-vien{background:linear-gradient(160deg,color-mix(in srgb,var(--warn) 12%,#fff),#fff 70%)}
  .hel-vien .hel-h{align-self:stretch}
  .hel-acc{font-size:13px;font-style:italic;color:var(--text-2)}
  .hel-spot{position:relative;display:grid;place-items:center;margin:4px 0}
  .hel-spot .av{--s:84px;font-size:26px;box-shadow:0 0 0 5px color-mix(in srgb,var(--accent) 25%,transparent),0 0 30px color-mix(in srgb,var(--accent) 35%,transparent)}
  .hel-bounce{animation:hel-bounce 1s var(--spring-bouncy) 380ms backwards}
  @keyframes hel-bounce{0%{transform:scale(.3) translateY(18px);opacity:0}60%{transform:scale(1.08)}}
  .hel-vien .nm{font-size:17px;font-weight:700;color:var(--text)}.hel-vien .rl{font-size:13px;font-weight:700;color:var(--accent);margin-top:3px}
  .hel-award{height:26px;padding:0 11px;border-radius:99px;display:inline-flex;align-items:center;font-size:12.5px;font-weight:700;color:color-mix(in srgb,var(--warn) 75%,var(--text));background:color-mix(in srgb,var(--warn) 16%,transparent)}
  .hel-vfoot{display:flex;align-items:center;justify-content:space-between;gap:10px;align-self:stretch;margin-top:auto;font-size:12px;color:var(--text-3);flex-wrap:wrap}
  .hel-vfoot button{font-weight:700;color:var(--accent);font-size:12px}
  .hel-vfoot button:hover{text-decoration:underline}
  /* Anniversaires */
  .hel-bdl{flex-direction:row;align-items:center;gap:22px;padding:16px 22px}
  .hel-bdl .hel-h{flex:none}
  .hel-bds{display:flex;gap:12px;overflow-x:auto;min-width:0;flex:1;scrollbar-width:thin;padding:2px}
  .hel-bd{display:flex;align-items:center;gap:10px;padding:7px 14px 7px 7px;border-radius:99px;flex:none;background:var(--surface-3);box-shadow:inset 0 0 0 1px var(--line)}
  :root[data-theme="light"] .hel-bd{background:var(--surface-1)}
  .hel-bd .av{--s:34px;font-size:12px}
  .hel-bd .n{font-size:13.5px;font-weight:700;color:var(--text);white-space:nowrap}.hel-bd .n span{font-weight:500;color:var(--text-2)}
  .hel-bd .w{font-size:12px;font-weight:700;color:var(--text-2);white-space:nowrap}
  .hel-bd.today{background:color-mix(in srgb,#ec4899 14%,var(--surface-2));box-shadow:inset 0 0 0 1px color-mix(in srgb,#ec4899 45%,transparent)}
  .hel-bd.today .w{color:#ec4899;animation:hel-pulse 1.6s ease-in-out infinite}
  .hel-bd.soon .w{color:var(--warn)}
  @keyframes hel-pulse{50%{opacity:.55}}
  /* La veille */
  .hel-veille{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;align-items:start}
  .hel-feed .hel-h{color:var(--c)}.hel-feed .hel-h svg.i{color:var(--c)}
  .hel-upd{font-size:12.5px;color:var(--text-3);white-space:nowrap}
  .hel-srcs{display:flex;align-items:center;flex-wrap:wrap;gap:6px}
  .hel-srcs .x{font-size:12px;color:var(--text-3);margin-left:6px}
  .hel-src{height:20px;padding:0 7px;border-radius:5px;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;display:inline-flex;align-items:center;color:#fff;background:var(--c);white-space:nowrap;flex:none}
  .hel-items{display:flex;flex-direction:column;gap:10px}
  .hel-art-row{display:grid;grid-template-columns:132px minmax(0,1fr);gap:14px;padding:10px;border-radius:12px;background:var(--surface-3);box-shadow:inset 0 0 0 1px var(--line);cursor:pointer;text-align:left;color:inherit;transition:box-shadow var(--t-fast),background var(--t-fast)}
  :root[data-theme="light"] .hel-art-row{background:var(--surface-1)}
  .hel-art-row:hover{box-shadow:inset 0 0 0 1px var(--line-3),var(--shadow-1)}
  .hel-art-row:hover .tt{color:var(--c)}
  .hel-img{position:relative;height:80px;border-radius:9px;overflow:hidden;background:var(--surface-4)}
  .hel-art{position:absolute;inset:0;width:100%;height:100%;display:block;transition:transform 600ms var(--ease-out)}
  .hel-art-row:hover .hel-art{transform:scale(1.06)}
  .hel-ini{position:absolute;inset:0;display:grid;place-items:center;font-family:var(--font-display);font-weight:700;font-size:22px;color:rgba(255,255,255,.75);background:linear-gradient(135deg,var(--sc),#15151d)}
  .hel-ab{min-width:0;display:flex;flex-direction:column;gap:5px}
  .hel-ab .m{display:flex;align-items:center;gap:8px;min-width:0}
  .hel-ab .ago{font-size:12px;color:var(--text-3);white-space:nowrap}
  .hel-ab .go{margin-left:auto;font-size:12px;font-weight:700;color:var(--accent);white-space:nowrap}
  .hel-ab .tt{font-size:14.5px;font-weight:700;line-height:1.3;color:var(--text);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;transition:color var(--t-fast)}
  .hel-ab .x{font-size:12.5px;color:var(--text-2);line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .hel-load{display:flex;align-items:center;justify-content:center;gap:10px;padding:40px 0;color:var(--text-2);font-size:13.5px}
  .hel-load svg.i{animation:hel-spin .8s linear infinite}
  .hel-new{animation:hel-new 1.2s ease-out}
  @keyframes hel-new{0%{box-shadow:inset 0 0 0 2px var(--accent)}100%{box-shadow:inset 0 0 0 1px var(--line)}}
  @container app (max-width:1320px){
    .hel-top{grid-template-columns:repeat(2,minmax(0,1fr))}
  }
  @container app (max-width:1000px){
    .hel-veille{grid-template-columns:minmax(0,1fr)}
  }
  @container app (max-width:720px){
    .hel-wrap{padding:4px 12px 22px;gap:16px}
    .hel-top,.hel-top.sm{grid-template-columns:minmax(0,1fr);gap:14px}
    .hel-veille{gap:14px}
    .hel-card{padding:16px}
    .hel-wx{padding:0}
    .hel-bdl{flex-direction:column;align-items:stretch;gap:12px;padding:16px}
    .hel-bds{flex:none}
    .hel-temp{font-size:52px}
  }
  @container app (max-width:480px){
    .hel-art-row{grid-template-columns:96px minmax(0,1fr);gap:10px;padding:8px}
    .hel-img{height:64px}
    .hel-ab .x{display:none}
    .hel-fcg{gap:5px}.hel-fcd{padding:8px 2px}.hel-fcd .t{font-size:12.5px}
  }
  `);

  /* ---------------- Utilitaires ---------------- */
  const pd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const daysTo = (d) => Math.ceil((new Date(d).setHours(0, 0, 0, 0) - GX.today()) / 864e5);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const hhmm = (t) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const isoWeek = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())); const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - y0) / 864e5 + 1) / 7);
  };
  const nextMonday = () => { const d = GX.today(); const k = d.getDay() === 1 ? 7 : (8 - d.getDay()) % 7; return GX.addDays(d, k); };
  const dayOfYear = () => { const n = new Date(); return Math.floor((n - new Date(n.getFullYear(), 0, 0)) / 864e5); };
  /* relativeDate() de HelloMarketing.tsx */
  const relDate = (t) => {
    const mins = Math.floor((Date.now() - t) / 6e4);
    if (mins < 1) return 'à l’instant'; if (mins < 60) return `il y a ${mins} min`;
    const h = Math.floor(mins / 60); if (h < 24) return `il y a ${h} h`;
    const d = Math.floor(h / 24); if (d === 1) return 'hier'; if (d < 7) return `il y a ${d} j`;
    return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };
  const isSM = () => GX.ctx.role === 'Site Manager';   // hasSocialFeatures(role) = !isSiteManager(role)

  function birthdays() {
    const T = GX.today();
    return D.USERS.filter((u) => u.birthdate).map((u) => {
      const b = pd(u.birthdate); let next = new Date(T.getFullYear(), b.getMonth(), b.getDate());
      if (next < T) next = new Date(T.getFullYear() + 1, b.getMonth(), b.getDate());
      return { u, age: next.getFullYear() - b.getFullYear(), n: daysTo(next) };
    }).sort((a, b) => a.n - b.n);
  }
  function events() {
    const today = GX.iso(GX.today()), site = GX.ctx.site, per = GX.ctx.perimetre;
    return D.PROJECTS.filter((p) => (p.status === 'Active' || p.status === 'Draft') && EVENT_TYPES[p.type] && p.startDate >= today
      && (site ? p.sites.includes(site) : !per || per === 'Tout le réseau' ? true : per === 'Nissan' ? p.brands.includes('Nissan') : p.sites.includes(per)))
      .sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 3);
  }
  /* ViennoiseriesSection : graine = année × 100 + semaine, modulo les rôles éligibles */
  function viennoiseries() {
    const el = D.USERS.filter((u) => VIENNOISERIES_ROLES.includes(u.role)); if (!el.length) return null;
    const pick = (w, y) => el[(((y * 100 + w) % el.length) + el.length) % el.length];
    const now = new Date(), w = isoWeek(now), y = now.getFullYear();
    return { w, u: pick(w, y), hist: [1, 2, 3, 4].map((i) => { let ww = w - i, yy = y; if (ww <= 0) { ww += 52; yy -= 1; } return { label: `S${ww}`, u: pick(ww, yy) }; }) };
  }
  /* 5 jours suivants : noms calculés depuis aujourd'hui, icônes et températures de la donnée */
  function forecast() {
    return H.forecast.slice(0, 5).map(([, ic, mx, mn], k) => ({ d: F.day(GX.addDays(GX.today(), k + 1)).slice(0, 3), ic, mx, mn }));
  }
  function buildFeed(f) {
    const titles = [...(H.rss[f.k === 'auto' ? 'Actu Auto' : 'Marketing & Tech'] || []), ...f.extra];
    const ages = [3, 26, 70, 185, 420, 900, 1560, 2300, 3100, 4400, 6500, 9800];
    const items = titles.slice(0, 12).map((t, i) => ({ t, i, src: f.sources[i % f.sources.length], at: Date.now() - ages[i] * 6e4, thumb: i % 5 !== 4 }));
    return { items: items.sort((a, b) => b.at - a.at), at: Date.now() - 12 * 6e4, loading: false };
  }

  GX.registerApp({
    id: 'hello', name: 'Hello Marketing', icon: 'hello', tint: ['#ff5fa2', '#8f12ab'], size: [1320, 820], minSize: [360, 360],
    mount(body, win) {
      let raf = 0, tickT = 0, played = 0, playing = false, lastTs = 0, wxLoading = false;
      const timers = new Set(), later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };
      const DUR = 30;
      const track = PLAYLIST[dayOfYear() % PLAYLIST.length];
      const wx = { ...H.weather, at: Date.now() - 12 * 6e4 };
      const feeds = Object.fromEntries(FEEDS.map((f) => [f.k, buildFeed(f)]));

      /* ---------- Météo du jour + prévisions 5 jours ---------- */
      function weatherHTML(i) {
        const hr = new Date().getHours(), night = hr >= 20 || hr < 7;
        const sky = night ? SKY.night : SKY[wx.icon] || SKY.cloudsun, icon = night && wx.icon !== 'cloud' ? 'moon' : wx.icon;
        const todayLbl = cap(new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }));
        return `<article class="hel-card hel-wx hel-in ${wxLoading ? 'loading' : ''}" style="--i:${i}" data-wx>
          <div class="hel-sky" style="--s1:${sky[0]};--s2:${sky[1]}">${!night && wx.icon !== 'cloud' ? '<span class="glow"></span>' : ''}
            <div class="hel-where">${GX.icon('pin')}<span>${esc(wx.city)} · ${esc(todayLbl)}</span><button class="icon-btn sm ${wxLoading ? 'spin' : ''}" data-wx-refresh aria-label="Rafraîchir" data-tip="Rafraîchir">${GX.icon('refresh', 'sm')}</button></div>
            <div class="hel-now"><span class="hel-temp num" data-temp>${wx.t}°</span>${wIcon(icon)}<div><div class="d">${esc(cap(wx.desc))}</div><div class="f">Ressenti ${wx.feels}°</div></div></div>
          </div>
          <div class="hel-fc"><span class="hel-sub">Prévisions 5 jours</span>
            <div class="hel-fcg">${forecast().map((f) => `<div class="hel-fcd"><span class="n">${esc(f.d)}</span>${wIcon(f.ic).replace('class="i', `class="i ${f.ic === 'sun' ? 'sun' : ''}`)}<span class="t num"><b>${f.mx}°</b> <span>${f.mn}°</span></span></div>`).join('')}</div>
          </div></article>`;
      }
      /* ---------- 3 prochains événements ---------- */
      function eventsHTML(i) {
        const E = events();
        return `<article class="hel-card hel-in" style="--i:${i}"><h2 class="hel-h">${GX.icon('agenda')}Prochains événements</h2>
          ${E.map((p) => { const n = daysTo(pd(p.startDate)), c = EVENT_TYPES[p.type];
            return `<button class="hel-ev" data-proj="${p.id}" style="--c:${c}"><div class="hel-j"><b>${n === 0 ? 'Auj.' : `J-${n}`}</b>${n > 0 ? '<span>jours</span>' : ''}</div>
              <div style="min-width:0;flex:1"><div class="nm" title="${esc(p.name)}">${esc(p.name)}</div>
                <div class="mt"><span class="hel-type" style="--c:${c}">${esc(p.type)}</span>${p.status === 'Draft' ? '<span class="badge" style="--c:var(--text-3)">Brouillon</span>' : ''}<span>${esc(p.sites[0] || '')} · ${F.date(pd(p.startDate))}</span></div></div></button>`; }).join('')
          || `<div class="hel-none">${GX.icon('agenda')}<span>Aucun événement à venir.<br><span class="faint">Créez un projet pour commencer.</span></span></div>`}
        </article>`;
      }
      /* ---------- Musique du jour ---------- */
      function musicHTML(i) {
        return `<article class="hel-card hel-in ${playing ? 'playing' : ''}" style="--i:${i}" data-music><h2 class="hel-h">${GX.icon('music')}Musique du jour</h2>
          <div class="hel-trk"><div class="hel-cover" style="--c1:${track.cover[0]};--c2:${track.cover[1]}">${GX.icon('music')}</div>
            <div style="min-width:0"><div class="tt ellipsis">${esc(track.title)}</div><div class="ar ellipsis">${esc(track.artist)}</div><div class="pl">Playlist Deezer · même piste pour toute l’équipe</div></div></div>
          <div class="hel-player"><button class="hel-play" data-play aria-label="Lecture">${GX.icon(playing ? 'pause' : 'play')}</button><span class="tm" data-cur>${mmss(played)}</span>
            <span class="hel-bar" data-bar role="slider" aria-label="Position de lecture" aria-valuemin="0" aria-valuemax="${DUR}"><i style="width:${(played / DUR) * 100}%"></i><b style="left:${(played / DUR) * 100}%"></b></span><span class="tm">${mmss(DUR)}</span></div>
        </article>`;
      }
      /* ---------- Viennoiseries de la semaine ---------- */
      function viennoiseriesHTML(i) {
        const v = viennoiseries();
        if (!v) return `<article class="hel-card hel-vien hel-in" style="--i:${i}"><h2 class="hel-h">🥐 Viennoiseries de la semaine</h2><div class="hel-none">Aucun utilisateur éligible.</div></article>`;
        return `<article class="hel-card hel-vien hel-in" style="--i:${i}"><h2 class="hel-h">🥐 Viennoiseries de la semaine</h2>
          <span class="hel-acc">${esc(ACCROCHES[v.w % ACCROCHES.length])}</span>
          <div class="hel-spot"><span class="av hel-bounce" style="--c:${v.u.color}">${esc(v.u.initials)}</span></div>
          <div><div class="nm">${esc(v.u.name)}</div><div class="rl">${esc(D.ROLES[v.u.role]?.l || v.u.role)}</div></div>
          <span class="hel-award">${BADGES[v.w % BADGES.length]}</span>
          <div class="hel-vfoot"><span>Semaine ${v.w} · change le ${nextMonday().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span><button data-hist>4 sem. précédentes ▴</button></div>
        </article>`;
      }
      /* ---------- Anniversaires (une ligne) ---------- */
      function birthdaysHTML(i) {
        const B = birthdays();
        return `<section class="hel-card hel-bdl hel-in" style="--i:${i}"><h2 class="hel-h">${GX.icon('gift')}Anniversaires</h2>
          <div class="hel-bds">${B.map((b) => `<div class="hel-bd ${b.n === 0 ? 'today' : b.n === 1 ? 'soon' : ''}"><span class="av" style="--c:${b.u.color}">${esc(b.u.initials)}</span>
            <div><div class="n">${esc(b.u.name.split(' ')[0])} <span>· ${b.age} ans</span></div><div class="w">${b.n === 0 ? 'Auj. !' : b.n === 1 ? 'demain' : `dans ${b.n} j`}</div></div></div>`).join('')
            || '<span class="faint">Aucun anniversaire renseigné.</span>'}</div></section>`;
      }
      /* ---------- La veille ---------- */
      const artHTML = (f, it, j) => `<button class="hel-art-row ${it.isNew ? 'hel-new' : ''}" data-art="${j}" style="--c:${f.c}">
          <div class="hel-img">${it.thumb ? thumb(it.t, it.i) : `<span class="hel-ini" style="--sc:${it.src[1]}">${esc(it.src[0][0])}</span>`}</div>
          <div class="hel-ab"><div class="m"><span class="hel-src" style="--c:${it.src[1]}">${esc(it.src[0])}</span><span class="ago">${relDate(it.at)}</span><span class="go">Voir ↗</span></div>
            <div class="tt">${esc(it.t)}</div><div class="x">${esc(sceneOf(it.t, it.i).d)}</div></div></button>`;
      const itemsHTML = (f) => { const st = feeds[f.k];
        if (st.loading) return `<div class="hel-load">${GX.icon('refresh', 'sm')}Chargement des flux RSS…</div>`;
        if (!st.items.length) return `<div class="hel-none">${GX.icon('cloud')}Aucun article disponible.</div>`;
        return st.items.map((it, j) => artHTML(f, it, j)).join(''); };
      function feedHTML(f, i) {
        const st = feeds[f.k];
        return `<article class="hel-card hel-feed hel-in" style="--i:${i};--c:${f.c}" data-feed="${f.k}">
          <div class="row" style="gap:12px"><h2 class="hel-h">${GX.icon(f.icon)}${esc(f.t)}</h2><span class="grow"></span><span class="hel-upd" data-upd>${st.loading ? '' : `Mis à jour à ${hhmm(st.at)}`}</span>
            <button class="icon-btn sm ${st.loading ? 'spin' : ''}" data-refresh aria-label="Rafraîchir" data-tip="Rafraîchir" ${st.loading ? 'disabled' : ''}>${GX.icon('refresh', 'sm')}</button></div>
          <div class="hel-srcs">${f.sources.map(([n, c]) => `<span class="hel-src" style="--c:${c}">${esc(n)}</span>`).join('')}<span class="x">12 derniers articles, toutes sources</span></div>
          <div class="hel-items" data-items>${itemsHTML(f)}</div></article>`;
      }

      function render() {
        stop();
        const team = !isSM();
        body.innerHTML = `<div class="app hel"><div class="app-head"><div class="ah-t"><h1>Hello Marketing</h1><span class="sub">${esc(cap(new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })))}</span></div></div>
          <div class="app-body scroll hel-scroll"><div class="hel-wrap">
            <div class="hel-sec">${team ? 'L’équipe aujourd’hui' : 'Aujourd’hui'}</div>
            <section class="hel-top ${team ? '' : 'sm'}">${weatherHTML(0)}${eventsHTML(1)}${team ? musicHTML(2) + viennoiseriesHTML(3) : ''}</section>
            ${team ? birthdaysHTML(4) : ''}
            <div class="hel-sec">La veille</div>
            <section class="hel-veille">${FEEDS.map((f, k) => feedHTML(f, 5 + k)).join('')}</section>
          </div></div></div>`;
        countUp();
      }
      function countUp() {
        const el = body.querySelector('[data-temp]'); if (!el || GX.eco()) return; const to = wx.t, from = to - 6, t0 = performance.now();
        const step = (now) => { const k = Math.min(1, (now - t0) / 900), e = 1 - Math.pow(1 - k, 3); el.textContent = `${Math.round(from + (to - from) * e)}°`; if (k < 1 && el.isConnected) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      }
      /* ---------- Lecteur d'extrait (simulé, sans son) ---------- */
      function drawProg() {
        const m = body.querySelector('[data-music]'); if (!m) return; const pc = (played / DUR) * 100;
        m.querySelector('[data-bar] i').style.width = pc + '%'; m.querySelector('[data-bar] b').style.left = pc + '%'; m.querySelector('[data-cur]').textContent = mmss(played);
      }
      function setPlaying(v) {
        const m = body.querySelector('[data-music]'); if (!m) return; playing = v; m.classList.toggle('playing', v);
        const b = m.querySelector('[data-play]'); b.innerHTML = GX.icon(v ? 'pause' : 'play'); b.setAttribute('aria-label', v ? 'Pause' : 'Lecture');
        cancelAnimationFrame(raf);
        if (v) { lastTs = performance.now(); const tick = (now) => { played = Math.min(DUR, played + (now - lastTs) / 1000); lastTs = now; drawProg(); if (played >= DUR) { played = 0; drawProg(); setPlaying(false); return; } raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); }
      }
      function stop() { cancelAnimationFrame(raf); playing = false; }
      /* ---------- Rafraîchissements ---------- */
      function refreshWeather() {
        if (wxLoading) return; wxLoading = true; swap('[data-wx]', weatherHTML(0));
        later(() => { wxLoading = false; wx.t = H.weather.t + Math.round(Math.random() * 2 - 1); wx.feels = wx.t - 1; wx.at = Date.now(); swap('[data-wx]', weatherHTML(0)); countUp(); }, 650);
      }
      function refreshFeed(k) {
        const st = feeds[k], f = FEEDS.find((x) => x.k === k); if (!st || st.loading) return;
        st.loading = true; swap(`[data-feed="${k}"]`, feedHTML(f, 0));
        later(() => {   // un article « arrive » en tête, les autres vieillissent : fusion triée par date comme Gearbox
          const last = st.items.pop(); st.items.forEach((it) => { it.isNew = false; });
          Object.assign(last, { at: Date.now() - 60 * 1000, isNew: true }); st.items.unshift(last); st.items.sort((a, b) => b.at - a.at);
          st.loading = false; st.at = Date.now(); swap(`[data-feed="${k}"]`, feedHTML(f, 0));
        }, 700);
      }
      function swap(sel, html) {
        const old = body.querySelector(sel); if (!old) return;
        const t = document.createElement('div'); t.innerHTML = html; const n = t.firstElementChild; n.classList.remove('hel-in'); old.replaceWith(n);
      }
      function openArticle(k, j, origin) {
        const f = FEEDS.find((x) => x.k === k), it = feeds[k].items[j]; if (!it) return; it.isNew = false; origin.classList.remove('hel-new');
        GX.shell?.quickLook?.({ title: it.src[0], origin, html: `<div style="display:grid;gap:12px"><div style="position:relative;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:var(--surface-3)">${it.thumb ? thumb(it.t, it.i) : `<span class="hel-ini" style="--sc:${it.src[1]};font-size:48px">${esc(it.src[0][0])}</span>`}</div>
          <div class="row" style="gap:8px"><span class="hel-src" style="--c:${it.src[1]}">${esc(it.src[0])}</span><span class="muted" style="font-size:12.5px">${esc(f.t)} · ${relDate(it.at)}</span></div>
          <h3 style="font-size:19px;line-height:1.3">${esc(it.t)}</h3><div style="line-height:1.6;font-size:14px">${esc(sceneOf(it.t, it.i).d)}</div>
          <div class="muted" style="line-height:1.5;font-size:12.5px">Flux fictif (maquette) : dans Gearbox, « Voir ↗ » ouvre l’article chez l’éditeur, dans un nouvel onglet.</div></div>` });
      }
      /* ---------- Événements (délégués : survivent aux re-rendus partiels) ---------- */
      body.addEventListener('click', (e) => {
        const t = e.target;
        if (t.closest('[data-play]')) return setPlaying(!playing);
        if (t.closest('[data-wx-refresh]')) return refreshWeather();
        const rf = t.closest('[data-refresh]'); if (rf) return refreshFeed(rf.closest('[data-feed]').dataset.feed);
        const art = t.closest('[data-art]'); if (art) return openArticle(art.closest('[data-feed]').dataset.feed, +art.dataset.art, art);
        const pj = t.closest('[data-proj]'); if (pj) { const p = D.project(pj.dataset.proj); if (p) GX.wm.open('project', { id: p.id, title: p.name }, { origin: pj }); return; }
        const h = t.closest('[data-hist]');
        if (h) { const v = viennoiseries(); if (v) GX.menu.open([{ header: 'Historique' }, ...v.hist.map((x) => ({ label: `${x.u.name} · ${x.label}`, icon: 'croissant', action: () => {} }))], h, { align: 'right' }); }
      });
      body.addEventListener('pointerdown', (e) => {
        const bar = e.target.closest('[data-bar]'); if (!bar) return; const r = bar.getBoundingClientRect();
        played = Math.max(0, Math.min(DUR - .1, ((e.clientX - r.left) / r.width) * DUR)); drawProg();
      });
      /* les dates relatives et « J-n » suivent l'heure (compteur rafraîchi chaque minute comme Gearbox) */
      tickT = setInterval(() => body.querySelectorAll('[data-feed]').forEach((s) => { const st = feeds[s.dataset.feed]; if (st.loading) return; s.querySelectorAll('[data-art]').forEach((a) => { const it = st.items[+a.dataset.art]; const g = a.querySelector('.ago'); if (it && g) g.textContent = relDate(it.at); }); }), 60000);
      render();
      const off = [GX.on('ctx', render), GX.on('data:projects', () => { if (!playing) render(); })];
      return {
        destroy: () => { stop(); clearInterval(tickT); timers.forEach(clearTimeout); off.forEach((o) => o()); },
        command: (c) => { if (c === 'play' && !isSM()) setPlaying(!playing); if (c === 'refresh') FEEDS.forEach((f) => refreshFeed(f.k)); },
        menus: () => ({
          'Présentation': [{ label: 'Rafraîchir la météo', icon: 'cloudsun', action: refreshWeather }, { label: 'Rafraîchir Actu auto', icon: 'car', action: () => refreshFeed('auto') }, { label: 'Rafraîchir Marketing & tech', icon: 'bolt', action: () => refreshFeed('marketing') }],
          ...(isSM() ? {} : { 'Musique': [{ label: playing ? 'Pause' : 'Lecture de l’extrait', icon: playing ? 'pause' : 'play', action: () => setPlaying(!playing) }, { label: 'Revenir au début', icon: 'back', action: () => { played = 0; drawProg(); } }] }),
        }),
      };
    },
  });
})();
