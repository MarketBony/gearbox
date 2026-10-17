/* =====================================================================================
   BOWLING — décor « manif » du thème Grève CGT (17/10/2026, demande de Théo : « des mecs qui font cuire des chipos
   et les autres clichés des manifs »). Module FACULTATIF chargé par rendu.js en thème CGT seulement.

   API : creerDecorManif(THREE, { logoTexture, zoneInterdite }) → { groupe, maj(dt, t), dispose() }.
   ⚠️ rendu.js range dans son calque de décor les objets présents dans `groupe` AU MOMENT où il l'ajoute à la scène :
   tout est donc construit ici, d'un coup ; maj() ne fait qu'animer.

   Repère de rendu.js : y haut, z le long de la piste (0 = ligne de faute), x positif = GAUCHE du joueur. Salle :
   x ∈ [-8,75 ; 8,75], mur du fond (derrière le joueur) à z = -11,5, plafond 4,4 m. Les pistes occupent tout l'avant :
   le décor vit donc DERRIÈRE la zone d'élan (z < -5), hors de la zone interdite (piste principale, joueur, caméras),
   et se voit surtout depuis la caméra de célébration (devant les quilles, tournée vers le joueur).
   Le stand merguez de rendu.js est déjà à (-6,7 ; -9,7) : on s'installe autour, sans le toucher.
   ===================================================================================== */
import { SLOGANS } from './cgt.js';

export function creerDecorManif(THREE, { logoTexture, zoneInterdite } = {}) {
  const groupe = new THREE.Group(); groupe.name = 'decor-manif';
  const aLiberer = [];
  const garder = (o) => { aLiberer.push(o); return o; };
  const mat = (c, o = {}) => garder(new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o }));
  const ROUGE = '#e3001b';

  // Le logo : fourni par rendu.js, sinon chargé ici.
  let logo = logoTexture;
  if (!logo) { logo = garder(new THREE.TextureLoader().load(new URL('./assets/logo-cgt.svg', import.meta.url).href)); logo.colorSpace = THREE.SRGBColorSpace; }

  /** Texture de texte (canvas) : fond, texte blanc ajusté à la largeur. */
  function texte(txt, { l = 1024, h = 160, fond = ROUGE, coul = '#fff', avecLogo = false } = {}) {
    const c = document.createElement('canvas'); c.width = l; c.height = h; const x = c.getContext('2d');
    x.fillStyle = fond; x.fillRect(0, 0, l, h);
    let g = 0;
    if (avecLogo && logo.image && logo.image.width) { const hh = h * 0.8, ll = hh * logo.image.width / logo.image.height; x.drawImage(logo.image, h * 0.12, h * 0.1, ll, hh); g = ll + h * 0.2; }
    x.fillStyle = coul; x.textAlign = 'center'; x.textBaseline = 'middle';
    let t = h * 0.62; x.font = `900 ${t}px Impact, "Arial Black", sans-serif`;
    while (x.measureText(txt).width > l - g - 30 && t > 10) { t -= 2; x.font = `900 ${t}px Impact, "Arial Black", sans-serif`; }
    x.fillText(txt, g + (l - g) / 2, h / 2 + 2);
    const tx = garder(new THREE.CanvasTexture(c)); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; return tx;
  }

  /* ---------- géométries et matériaux partagés ---------- */
  const G = {
    tete: garder(new THREE.SphereGeometry(0.19, 16, 12)),
    corps: garder(new THREE.CapsuleGeometry(0.19, 0.32, 4, 12)),
    chasuble: garder(new THREE.CylinderGeometry(0.215, 0.225, 0.42, 14, 1, true)),
    bande: garder(new THREE.CylinderGeometry(0.218, 0.222, 0.06, 14, 1, true)),
    membre: garder(new THREE.CapsuleGeometry(0.055, 0.34, 3, 8)),
    jambe: garder(new THREE.CapsuleGeometry(0.07, 0.4, 3, 8)),
    main: garder(new THREE.SphereGeometry(0.06, 8, 6)),
    oeil: garder(new THREE.SphereGeometry(0.022, 6, 4)),
    canette: garder(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 10)),
    ballon: garder(new THREE.SphereGeometry(0.22, 16, 12)),
  };
  const M = {
    chasuble: mat(ROUGE, { side: THREE.DoubleSide, roughness: 0.8 }), bande: mat('#ffffff', { side: THREE.DoubleSide }),
    noir: mat('#151515'), metal: mat('#6b6f76', { metalness: 0.6, roughness: 0.4 }), rouille: mat('#6e3b24', { roughness: 0.9 }),
    bois: mat('#a8763e'), pneu: mat('#1c1c1c', { roughness: 0.95 }), blanc: mat('#f2f2f2'),
    canette: mat('#d9d9d9', { metalness: 0.7, roughness: 0.3 }), canetteR: mat(ROUGE, { metalness: 0.5, roughness: 0.35 }),
    chipo: mat('#c98b6b', { roughness: 0.55 }),
    flamme: garder(new THREE.MeshBasicMaterial({ color: '#ffb02e', transparent: true, opacity: 0.9, depthWrite: false })),
    flamme2: garder(new THREE.MeshBasicMaterial({ color: '#ff5a1a', transparent: true, opacity: 0.85, depthWrite: false })),
    braise: garder(new THREE.MeshBasicMaterial({ color: '#ff7a1a' })),
    logoBallon: garder(new THREE.MeshStandardMaterial({ map: logo, roughness: 0.3 })),
  };
  const PEAUX = ['#f1c7a1', '#d9a27a', '#a8714a', '#7a4a2c', '#f6d2b4'], CHEVEUX = ['#3b2a1e', '#1a1a1a', '#8a5a2b', '#bdbdbd', '#d8c27a'];

  /** Un manifestant façon Mii. Rend { g, brasG, brasD, corps, tete } (bras = pivots à l'épaule, pendants à 0). */
  function bonhomme(i, { assis = false, chasuble = true, haut = '#33415c', bas = '#2a2f3a' } = {}) {
    const g = new THREE.Group(), peau = mat(PEAUX[i % PEAUX.length]);
    const corps = new THREE.Group(); corps.position.y = assis ? 0.48 : 0.86; g.add(corps);
    const tronc = new THREE.Mesh(G.corps, mat(haut)); corps.add(tronc);
    if (chasuble) { const c = new THREE.Mesh(G.chasuble, M.chasuble); c.position.y = 0.02; corps.add(c); const b = new THREE.Mesh(G.bande, M.bande); b.position.y = 0.06; corps.add(b); }
    const tete = new THREE.Group(); tete.position.y = 0.5; corps.add(tete);
    tete.add(new THREE.Mesh(G.tete, peau));
    const ch = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), mat(CHEVEUX[(i * 3) % CHEVEUX.length])); garder(ch.geometry); ch.position.y = 0.02; tete.add(ch);
    for (const s of [-1, 1]) { const o = new THREE.Mesh(G.oeil, M.noir); o.position.set(s * 0.065, 0.02, 0.172); o.scale.y = 1.5; tete.add(o); }
    const bras = [-1, 1].map((s) => {
      const p = new THREE.Group(); p.position.set(s * 0.25, 0.2, 0); corps.add(p);
      const m = new THREE.Mesh(G.membre, chasuble ? M.chasuble : mat(haut)); m.position.y = -0.2; p.add(m);
      const h = new THREE.Mesh(G.main, peau); h.position.y = -0.42; p.add(h);
      return p;
    });
    for (const s of [-1, 1]) {
      const j = new THREE.Mesh(G.jambe, mat(bas));
      if (assis) { j.rotation.x = Math.PI / 2; j.position.set(s * 0.1, 0.42, 0.25); } else j.position.set(s * 0.1, 0.32, 0);
      g.add(j);
    }
    return { g, brasG: bras[1], brasD: bras[0], corps, tete };
  }
  const poser = (o, x, z, lacet = 0, y = 0) => { o.position.set(x, y, z); o.rotation.y = lacet; groupe.add(o); return o; };
  // Les personnages regardent vers +z par défaut ; lacet = angle pour les tourner vers un point.
  const versPoint = (x, z, cx, cz) => Math.atan2(cx - x, cz - z);

  /* ---------- fumée : un seul système de particules pour tous les foyers ---------- */
  const FUMEE = (() => {
    const N = 160, pos = new Float32Array(N * 3), vie = new Float32Array(N), src = new Int8Array(N);
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const geo = garder(new THREE.BufferGeometry()); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, garder(new THREE.PointsMaterial({ size: 0.7, map: garder(new THREE.CanvasTexture(c)), color: '#9a9a9a', transparent: true, opacity: 0.45, depthWrite: false })));
    pts.frustumCulled = false; groupe.add(pts);
    const foyers = []; let k = 0;
    for (let i = 0; i < N; i++) { vie[i] = 99; pos[i * 3 + 1] = -50; }
    return {
      foyer(x, y, z, debit) { foyers.push({ x, y, z, debit, acc: 0 }); return foyers.length - 1; },
      maj(dt, t) {
        for (const f of foyers) { f.acc += dt * f.debit; while (f.acc > 1) { f.acc -= 1; const i = k++ % N; vie[i] = 0; src[i] = 0; pos[i * 3] = f.x + Math.sin(i * 7.1) * 0.12; pos[i * 3 + 1] = f.y; pos[i * 3 + 2] = f.z + Math.cos(i * 3.7) * 0.12; } }
        for (let i = 0; i < N; i++) {
          if (vie[i] > 4) continue; vie[i] += dt;
          pos[i * 3] += (Math.sin(t * 0.7 + i) * 0.08 + 0.05) * dt; pos[i * 3 + 1] += 0.55 * dt; pos[i * 3 + 2] += Math.cos(t * 0.5 + i) * 0.06 * dt;
          if (vie[i] > 4 || pos[i * 3 + 1] > 4.2) pos[i * 3 + 1] = -50;
        }
        geo.attributes.position.needsUpdate = true;
      },
    };
  })();

  /* ---------- flammes (brasero, barbecue) ---------- */
  const flammes = [];
  function feu(parent, n, rayon, haut) {
    const gF = garder(new THREE.ConeGeometry(0.09, 1, 6, 1, true)); gF.translate(0, 0.5, 0);
    for (let i = 0; i < n; i++) {
      const f = new THREE.Mesh(gF, i % 2 ? M.flamme : M.flamme2), a = i * 2.4;
      f.position.set(Math.cos(a) * rayon * (0.3 + (i % 3) * 0.3), 0, Math.sin(a) * rayon * (0.3 + (i % 3) * 0.3));
      parent.add(f); flammes.push({ f, h: haut * (0.6 + (i % 4) * 0.15), ph: i * 1.7 });
    }
  }
  const lumieres = [];

  /* =====================================================================================
     1. LE BARBECUE DE CHIPOS — bidon coupé en deux, grille, chipolatas qui dorent, deux gars en chasuble :
        l'un retourne les chipos à la pince, l'autre surveille, canette à la main.
     ===================================================================================== */
  const BBQ = { x: -3.7, z: -9.9 };
  const chipos = [];
  let pince = null, cuisinier = null, buveur = null;
  {
    const b = new THREE.Group(); poser(b, BBQ.x, BBQ.z, 0);
    const demi = new THREE.Mesh(garder(new THREE.CylinderGeometry(0.3, 0.3, 1.0, 16, 1, true, Math.PI / 2, Math.PI)), M.rouille);
    demi.rotation.z = Math.PI / 2; demi.position.y = 0.8; b.add(demi);
    demi.material = mat('#2e2f33', { metalness: 0.5, roughness: 0.6, side: THREE.DoubleSide });
    for (const [x, z] of [[-0.4, -0.2], [0.4, -0.2], [-0.4, 0.2], [0.4, 0.2]]) { const p = new THREE.Mesh(garder(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 5)), M.metal); p.position.set(x, 0.4, z); p.rotation.z = x * 0.3; b.add(p); }
    const grille = new THREE.Mesh(garder(new THREE.PlaneGeometry(1.0, 0.56, 8, 4)), garder(new THREE.MeshStandardMaterial({ color: '#888', wireframe: true }))); grille.rotation.x = -Math.PI / 2; grille.position.y = 0.82; b.add(grille);
    const braises = new THREE.Mesh(garder(new THREE.PlaneGeometry(0.95, 0.5)), M.braise); braises.rotation.x = -Math.PI / 2; braises.position.y = 0.66; b.add(braises);
    feu(b, 6, 0.3, 0.12); b.children.slice(-6).forEach((f) => { f.position.y = 0.66; });
    const gC = garder(new THREE.CapsuleGeometry(0.024, 0.15, 3, 8)); gC.rotateZ(Math.PI / 2);
    for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(gC, mat('#d99a78', { roughness: 0.5 })); m.position.set(-0.36 + (i % 5) * 0.18, 0.85, i < 5 ? -0.1 : 0.1); m.rotation.y = 0.2 * Math.sin(i); b.add(m); chipos.push(m); }
    // pain et moutarde sur une table pliante à côté
    const table = new THREE.Mesh(garder(new THREE.BoxGeometry(0.9, 0.04, 0.5)), M.blanc); table.position.set(0.95, 0.74, 0); b.add(table);
    for (const s of [-1, 1]) { const pied = new THREE.Mesh(garder(new THREE.BoxGeometry(0.03, 0.74, 0.45)), M.metal); pied.position.set(0.95 + s * 0.4, 0.37, 0); pied.rotation.z = s * 0.2; b.add(pied); }
    const pain = new THREE.Mesh(garder(new THREE.CapsuleGeometry(0.06, 0.4, 3, 8)), mat('#d9a25a')); pain.rotation.z = Math.PI / 2; pain.position.set(0.9, 0.82, -0.1); b.add(pain);
    const pot = new THREE.Mesh(garder(new THREE.CylinderGeometry(0.05, 0.05, 0.13, 10)), mat('#e8c21a')); pot.position.set(1.15, 0.83, 0.1); b.add(pot);
    FUMEE.foyer(BBQ.x, 1.0, BBQ.z, 7);
    const l = new THREE.PointLight('#ff8a3a', 1.2, 3.5, 2); l.position.set(0, 1.0, 0); b.add(l); lumieres.push({ l, base: 1.2 });
    // le cuisinier, face au barbecue (côté joueur → tourné vers -z... il regarde la grille depuis z+0,55)
    cuisinier = bonhomme(0); poser(cuisinier.g, BBQ.x - 0.1, BBQ.z + 0.6, Math.PI);
    pince = new THREE.Mesh(garder(new THREE.BoxGeometry(0.02, 0.28, 0.02)), M.metal); pince.position.y = -0.55; cuisinier.brasD.add(pince);
    // le collègue qui « surveille la cuisson », canette en main
    buveur = bonhomme(2, { haut: '#5a3b2a' }); poser(buveur.g, BBQ.x + 0.75, BBQ.z + 0.55, Math.PI + 0.6);
    const c = new THREE.Mesh(G.canette, M.canetteR); c.position.y = -0.47; buveur.brasD.add(c); buveur.brasD.rotation.x = -1.3;
  }

  /* =====================================================================================
     2. LE BRASERO — bidon percé, palettes qui dépassent, flammes, lueur orange qui vacille ; deux gars s'y réchauffent.
     ===================================================================================== */
  const BRA = { x: 3.4, z: -9.6 };
  const rechauffe = [];
  {
    const b = new THREE.Group(); poser(b, BRA.x, BRA.z);
    const bidon = new THREE.Mesh(garder(new THREE.CylinderGeometry(0.3, 0.3, 0.88, 16)), mat('#7a2f1c', { roughness: 0.9 })); bidon.position.y = 0.44; b.add(bidon);
    for (let i = 0; i < 10; i++) { const t = new THREE.Mesh(garder(new THREE.CircleGeometry(0.035, 6)), M.braise), a = i * Math.PI / 5; t.position.set(Math.sin(a) * 0.302, 0.3 + (i % 2) * 0.25, Math.cos(a) * 0.302); t.rotation.y = a; b.add(t); }
    for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(garder(new THREE.BoxGeometry(0.09, 0.6, 0.02)), M.bois); p.position.set(Math.cos(i * 1.6) * 0.15, 0.95, Math.sin(i * 1.6) * 0.15); p.rotation.set(0.4 * Math.sin(i * 2), i, 0.35 * Math.cos(i * 3)); b.add(p); }
    const g = new THREE.Group(); g.position.y = 0.86; b.add(g); feu(g, 8, 0.28, 0.75);
    FUMEE.foyer(BRA.x, 1.7, BRA.z, 5);
    const l = new THREE.PointLight('#ff7a22', 3.0, 6, 2); l.position.set(0, 1.4, 0); b.add(l); lumieres.push({ l, base: 3.0 });
    for (const [dx, dz, i] of [[0.75, 0.15, 1], [-0.25, 0.75, 3]]) {
      const p = bonhomme(i, { haut: i === 1 ? '#2d4f3a' : '#4a3a5a' }); poser(p.g, BRA.x + dx, BRA.z + dz, versPoint(BRA.x + dx, BRA.z + dz, BRA.x, BRA.z));
      p.brasD.rotation.x = p.brasG.rotation.x = -1.25; rechauffe.push({ p, ph: i });
    }
  }

  /* =====================================================================================
     3. LE CAMION SONO — fourgonnette blanche, banderole sur le flanc, haut-parleurs sur le toit, grappe de ballons ;
        un gars au mégaphone qui harangue à côté.
     ===================================================================================== */
  const CAM = { x: 6.3, z: -9.2 };
  const ballons = [];
  let harangueur = null;
  {
    const c = new THREE.Group(); poser(c, CAM.x, CAM.z, Math.PI / 2 + 0.25);
    const caisse = new THREE.Mesh(garder(new THREE.BoxGeometry(2.1, 1.35, 1.3)), mat('#f4f4f4', { roughness: 0.4 })); caisse.position.set(-0.3, 1.0, 0); c.add(caisse);
    const cabine = new THREE.Mesh(garder(new THREE.BoxGeometry(0.9, 1.0, 1.26)), mat('#f4f4f4', { roughness: 0.4 })); cabine.position.set(1.15, 0.82, 0); c.add(cabine);
    const vitre = new THREE.Mesh(garder(new THREE.BoxGeometry(0.02, 0.4, 1.1)), mat('#2a3a4a', { roughness: 0.1, metalness: 0.4 })); vitre.position.set(1.61, 1.05, 0); vitre.rotation.z = 0.25; c.add(vitre);
    const gR = garder(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 14)); gR.rotateX(Math.PI / 2);
    for (const [x, z] of [[-0.9, 0.62], [-0.9, -0.62], [1.1, 0.62], [1.1, -0.62]]) { const r = new THREE.Mesh(gR, M.pneu); r.position.set(x, 0.22, z); c.add(r); }
    const slogan = SLOGANS[2] || 'GRÈVE GÉNÉRALE';
    const ban = garder(new THREE.MeshStandardMaterial({ map: texte(slogan, { avecLogo: true }), roughness: 0.8 }));
    for (const s of [-1, 1]) { const p = new THREE.Mesh(garder(new THREE.PlaneGeometry(1.95, 0.32)), ban); p.position.set(-0.3, 1.05, s * 0.66); if (s < 0) p.rotation.y = Math.PI; c.add(p); }
    const gHP = garder(new THREE.BoxGeometry(0.4, 0.45, 0.4)), gCone = garder(new THREE.CylinderGeometry(0.14, 0.05, 0.08, 14)); gCone.rotateX(Math.PI / 2);
    for (const z of [-0.35, 0.35]) { const hp = new THREE.Mesh(gHP, M.noir); hp.position.set(-0.2, 1.9, z); hp.rotation.y = z > 0 ? 0.4 : -0.4; c.add(hp); const cn = new THREE.Mesh(gCone, M.metal); cn.position.set(0, 0, 0.21); hp.add(cn); }
    // ballons : la grappe accrochée au rétroviseur
    const fils = []; const ancre = new THREE.Vector3(1.5, 1.2, 0.7);
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(G.ballon, i % 3 === 0 ? M.blanc : i % 3 === 1 ? M.logoBallon : M.chasuble); m.scale.y = 1.15;
      const h = 2.3 + (i % 4) * 0.28, a = i * 0.7; m.userData = { bx: ancre.x + Math.cos(a) * 0.35, by: h, bz: ancre.z + Math.sin(a) * 0.35, ph: i * 1.3 };
      m.position.set(m.userData.bx, h, m.userData.bz); c.add(m); ballons.push(m);
      fils.push(ancre.x, ancre.y, ancre.z, m.userData.bx, h - 0.25, m.userData.bz);
    }
    const gf = garder(new THREE.BufferGeometry()); gf.setAttribute('position', new THREE.BufferAttribute(new Float32Array(fils), 3));
    const lf = new THREE.LineSegments(gf, garder(new THREE.LineBasicMaterial({ color: '#dddddd' }))); c.add(lf); ballons.fils = gf;
    // le gars au mégaphone, tourné vers la salle
    harangueur = bonhomme(4, { haut: '#3a3a3a' }); poser(harangueur.g, CAM.x - 1.4, CAM.z + 1.2, versPoint(CAM.x - 1.4, CAM.z + 1.2, 0, 0));
    const mega = new THREE.Group(); mega.position.y = -0.48; harangueur.brasD.add(mega);
    const cn = new THREE.Mesh(garder(new THREE.CylinderGeometry(0.11, 0.04, 0.28, 12, 1, true)), mat('#f2f2f2', { side: THREE.DoubleSide })); cn.rotation.x = Math.PI / 2; cn.position.z = 0.16; mega.add(cn);
    const bague = new THREE.Mesh(garder(new THREE.TorusGeometry(0.11, 0.015, 6, 16)), M.chasuble); bague.position.z = 0.3; mega.add(bague);
  }

  /* =====================================================================================
     4. L'ARCHE GONFLABLE CGT — géante, au-dessus de l'allée centrale contre le mur du fond ; elle « respire ».
     ===================================================================================== */
  let arche = null;
  {
    arche = new THREE.Group(); poser(arche, 0, -10.95);
    const tore = new THREE.Mesh(garder(new THREE.TorusGeometry(2.3, 0.42, 14, 40, Math.PI)), mat(ROUGE, { roughness: 0.35 })); tore.position.y = 0.2; arche.add(tore);
    for (const s of [-1, 1]) { const pied = new THREE.Mesh(garder(new THREE.CylinderGeometry(0.5, 0.55, 0.4, 16)), mat('#b80016', { roughness: 0.4 })); pied.position.set(s * 2.3, 0.2, 0); arche.add(pied); }
    const panneau = new THREE.Mesh(garder(new THREE.PlaneGeometry(2.6, 0.65)), garder(new THREE.MeshStandardMaterial({ map: texte('TOUS ENSEMBLE !', { avecLogo: true, fond: '#ffffff', coul: ROUGE }), roughness: 0.5 })));
    panneau.position.set(0, 2.35, 0.45); arche.add(panneau);
    const l = new THREE.Mesh(garder(new THREE.PlaneGeometry(0.8, 1.0)), garder(new THREE.MeshStandardMaterial({ map: logo, transparent: true, roughness: 0.5 }))); l.position.set(0, 1.55, 0.43); arche.add(l);
  }

  /* =====================================================================================
     5. LA PAUSE — chaise pliante, le gars qui fait la sieste casquette sur les yeux (« Zzz »), glacière et canettes ;
        le chien au foulard rouge qui remue la queue près du brasero ; le papy à béret.
     ===================================================================================== */
  let dormeur = null, queue = null; const zzz = [];
  {
    const S = { x: -4.9, z: -7.0 };
    const chaise = new THREE.Group(); poser(chaise, S.x, S.z, versPoint(S.x, S.z, 0, 4));
    const assise = new THREE.Mesh(garder(new THREE.BoxGeometry(0.5, 0.04, 0.45)), mat('#2e5aa8')); assise.position.y = 0.42; chaise.add(assise);
    const dos = new THREE.Mesh(garder(new THREE.BoxGeometry(0.5, 0.5, 0.04)), mat('#2e5aa8')); dos.position.set(0, 0.7, -0.24); dos.rotation.x = -0.25; chaise.add(dos);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(garder(new THREE.BoxGeometry(0.03, 0.6, 0.03)), M.metal); p.position.set(s * 0.24, 0.3, 0); p.rotation.x = 0.6; chaise.add(p); const q = p.clone(); q.rotation.x = -0.6; chaise.add(q); }
    dormeur = bonhomme(1, { assis: true, haut: '#6a5a3a' }); chaise.add(dormeur.g); dormeur.tete.rotation.x = 0.35; dormeur.tete.rotation.z = 0.25;
    dormeur.brasD.rotation.x = dormeur.brasG.rotation.x = -0.5;
    const casq = new THREE.Group(); casq.position.set(0, 0.12, 0.04); casq.rotation.x = 0.55; dormeur.tete.add(casq);
    casq.add(new THREE.Mesh(garder(new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), M.chasuble));
    const visiere = new THREE.Mesh(garder(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 14, 1, false, -Math.PI / 2, Math.PI)), M.chasuble); visiere.position.set(0, 0.0, 0.1); casq.add(visiere);
    // « Zzz »
    const cz = document.createElement('canvas'); cz.width = cz.height = 64; const xz = cz.getContext('2d'); xz.fillStyle = '#ffffff'; xz.font = '900 52px Impact, sans-serif'; xz.textAlign = 'center'; xz.fillText('Z', 32, 52);
    const mz = garder(new THREE.SpriteMaterial({ map: garder(new THREE.CanvasTexture(cz)), transparent: true, depthWrite: false }));
    for (let i = 0; i < 3; i++) { const s = new THREE.Sprite(mz.clone()); garder(s.material); s.scale.setScalar(0.18); groupe.add(s); zzz.push({ s, ph: i / 3, x: S.x, z: S.z }); }
    // glacière + canettes
    const gl = new THREE.Group(); poser(gl, S.x + 0.75, S.z + 0.15, 0.3);
    const cuve = new THREE.Mesh(garder(new THREE.BoxGeometry(0.6, 0.38, 0.38)), mat('#2a6fd6')); cuve.position.y = 0.19; gl.add(cuve);
    const couv = new THREE.Mesh(garder(new THREE.BoxGeometry(0.62, 0.07, 0.4)), M.blanc); couv.position.y = 0.41; gl.add(couv);
    for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(G.canette, i % 2 ? M.canette : M.canetteR); c.position.set(-0.12 + (i % 3) * 0.07, 0.5, (i < 3 ? -0.04 : 0.04)); gl.add(c); }
    for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(G.canette, M.canetteR); c.rotation.z = Math.PI / 2; c.position.set(0.45 + i * 0.09, 0.033, 0.3 - i * 0.12); c.rotation.y = i; gl.add(c); }
    // le chien au foulard rouge
    const ch = new THREE.Group(); poser(ch, BRA.x - 0.9, BRA.z + 1.0, -0.8);
    const poil = mat('#a8763e', { roughness: 0.9 });
    const corpsC = new THREE.Mesh(garder(new THREE.CapsuleGeometry(0.13, 0.35, 4, 10)), poil); corpsC.rotation.x = Math.PI / 2; corpsC.position.y = 0.32; ch.add(corpsC);
    const teteC = new THREE.Mesh(garder(new THREE.SphereGeometry(0.12, 12, 8)), poil); teteC.position.set(0, 0.48, 0.3); ch.add(teteC);
    const museau = new THREE.Mesh(garder(new THREE.SphereGeometry(0.06, 8, 6)), mat('#7a5530')); museau.position.set(0, 0.45, 0.41); ch.add(museau);
    const truffe = new THREE.Mesh(G.oeil, M.noir); truffe.position.set(0, 0.46, 0.47); truffe.scale.setScalar(1.3); ch.add(truffe);
    for (const s of [-1, 1]) { const o = new THREE.Mesh(G.oeil, M.noir); o.position.set(s * 0.05, 0.52, 0.4); ch.add(o); const or = new THREE.Mesh(garder(new THREE.SphereGeometry(0.05, 6, 4)), mat('#6e4a26')); or.scale.set(0.6, 1.4, 0.4); or.position.set(s * 0.1, 0.55, 0.27); or.rotation.z = s * 0.4; ch.add(or); }
    for (const [x, z] of [[-0.08, 0.17], [0.08, 0.17], [-0.08, -0.17], [0.08, -0.17]]) { const p = new THREE.Mesh(garder(new THREE.CylinderGeometry(0.035, 0.035, 0.24, 6)), poil); p.position.set(x, 0.12, z); ch.add(p); }
    const foulard = new THREE.Mesh(garder(new THREE.ConeGeometry(0.11, 0.14, 3)), M.chasuble); foulard.rotation.x = Math.PI; foulard.position.set(0, 0.36, 0.27); ch.add(foulard);
    queue = new THREE.Group(); queue.position.set(0, 0.38, -0.27); ch.add(queue);
    const qm = new THREE.Mesh(garder(new THREE.CapsuleGeometry(0.025, 0.18, 3, 6)), poil); qm.position.y = 0.1; queue.add(qm); queue.rotation.x = -0.7;
    // le papy à béret et moustache
    const papy = bonhomme(3, { chasuble: true, haut: '#5b5b5b' }); poser(papy.g, -2.9, -7.6, versPoint(-2.9, -7.6, 0, 3));
    const beret = new THREE.Mesh(garder(new THREE.CylinderGeometry(0.2, 0.21, 0.06, 16)), mat('#1d2340')); beret.position.set(0.03, 0.17, 0); beret.rotation.z = 0.15; papy.tete.add(beret);
    const mous = new THREE.Mesh(garder(new THREE.CapsuleGeometry(0.02, 0.1, 3, 6)), mat('#e6e6e6')); mous.rotation.z = Math.PI / 2; mous.position.set(0, -0.06, 0.18); papy.tete.add(mous);
    papy.tete.children[1].material = mat('#d8d8d8');
    // pneus et palettes empilés au fond
    const gP = garder(new THREE.TorusGeometry(0.3, 0.12, 8, 16)); gP.rotateX(Math.PI / 2);
    for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(gP, M.pneu); p.position.set(1.6 + (i === 3 ? 0.15 : 0), 0.12 + i * 0.22, -10.9); groupe.add(p); }
    for (let i = 0; i < 4; i++) { const pal = new THREE.Mesh(garder(new THREE.BoxGeometry(1.2, 0.14, 0.8)), M.bois); pal.position.set(-1.7, 0.07 + i * 0.15, -10.85); pal.rotation.y = i * 0.12; groupe.add(pal); }
  }

  /* ---------- contrôle : rien dans la zone interdite (au chargement, une fois) ---------- */
  if (zoneInterdite && zoneInterdite.x && zoneInterdite.z) {
    const b = new THREE.Box3(), v = new THREE.Vector3();
    groupe.updateMatrixWorld(true);
    groupe.children.forEach((o) => {
      if (o.isPoints || o.isSprite) return;
      b.setFromObject(o); b.getCenter(v);
      if (v.x > zoneInterdite.x[0] && v.x < zoneInterdite.x[1] && v.z > zoneInterdite.z[0] && v.z < zoneInterdite.z[1]) console.warn('[decor-manif] objet dans la zone interdite', o, v);
    });
  }

  /* =====================================================================================
     ANIMATION
     ===================================================================================== */
  const cuisson = new THREE.Color('#d99a78'), dore = new THREE.Color('#7a3a1a');
  function maj(dt, t) {
    // chipos : dorent lentement en boucle (un cycle de cuisson ~40 s), le cuisinier en retourne une de temps en temps
    const cycle = (t % 40) / 40;
    chipos.forEach((c, i) => { c.material.color.copy(cuisson).lerp(dore, Math.min(1, cycle * 1.4 + (i % 3) * 0.08)); c.rotation.x = Math.floor(t * 0.5 + i) % 2 ? Math.PI : 0; });
    if (cuisinier) {
      const geste = Math.max(0, Math.sin(t * 2.2));
      cuisinier.brasD.rotation.x = -1.1 - geste * 0.35; cuisinier.brasD.rotation.z = 0.15 * Math.sin(t * 4.4);
      pince.rotation.x = geste * 0.6; cuisinier.corps.rotation.x = 0.12;
      cuisinier.brasG.rotation.x = -0.2;
    }
    if (buveur) { const g = Math.max(0, Math.sin(t * 0.6)) ** 6; buveur.brasD.rotation.x = -1.3 - g * 0.9; buveur.tete.rotation.x = -g * 0.4; }
    // feux
    for (const f of flammes) { const k = 0.75 + 0.35 * Math.sin(t * 13 + f.ph) * Math.sin(t * 7.3 + f.ph * 2); f.f.scale.set(1, f.h * k, 1); f.f.rotation.y = t * 2 + f.ph; }
    for (const l of lumieres) l.l.intensity = l.base * (0.8 + 0.2 * Math.sin(t * 17) * Math.sin(t * 9.7));
    for (const r of rechauffe) { r.p.brasD.rotation.z = 0.12 * Math.sin(t * 2.5 + r.ph); r.p.brasG.rotation.z = -0.12 * Math.sin(t * 2.5 + r.ph); r.p.corps.position.y = 0.86 + Math.sin(t * 1.3 + r.ph) * 0.01; }
    // ballons qui se balancent
    const pf = ballons.fils?.attributes.position;
    ballons.forEach((b, i) => { const u = b.userData; b.position.set(u.bx + Math.sin(t * 0.9 + u.ph) * 0.06, u.by + Math.sin(t * 1.3 + u.ph) * 0.04, u.bz + Math.cos(t * 0.8 + u.ph) * 0.06); if (pf) pf.setXYZ(i * 2 + 1, b.position.x, b.position.y - 0.25, b.position.z); });
    if (pf) pf.needsUpdate = true;
    // le harangueur : bras du mégaphone levé, l'autre poing qui monte sur le rythme
    if (harangueur) { harangueur.brasD.rotation.x = -1.55; harangueur.brasD.rotation.y = 0.2; harangueur.brasG.rotation.x = -2.6 * Math.max(0, Math.sin(t * 3.2)) ** 2; harangueur.corps.rotation.x = -0.05 + Math.sin(t * 3.2) * 0.04; }
    // l'arche respire
    if (arche) arche.scale.set(1 + Math.sin(t * 0.8) * 0.008, 1 + Math.sin(t * 0.8 + 1) * 0.012, 1);
    // le dormeur respire, les « Z » montent
    if (dormeur) dormeur.corps.scale.set(1 + Math.sin(t * 1.1) * 0.03, 1, 1 + Math.sin(t * 1.1) * 0.03);
    for (const z of zzz) { const p = (t * 0.35 + z.ph) % 1; z.s.position.set(z.x + 0.1 + p * 0.25, 1.15 + p * 0.8, z.z + 0.1); z.s.material.opacity = Math.sin(p * Math.PI); z.s.scale.setScalar(0.12 + p * 0.15); }
    if (queue) queue.rotation.z = Math.sin(t * 14) * 0.7;
    FUMEE.maj(dt, t);
  }

  return { groupe, maj, dispose() { for (const o of aLiberer) o.dispose?.(); groupe.clear(); } };
}
