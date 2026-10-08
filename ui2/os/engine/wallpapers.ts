// @ts-nocheck — moteur de la maquette CONVERTI (maquettes/v2/js/wallpapers.js), comportement identique.
// Typage fin : second temps, fichier par fichier, une fois le rendu validé identique à la maquette.
// Substitutions mécaniques : scripts/ui2-convert-engine.mjs. Retouches manuelles : balises [GEARBOX].
export function install(): void {
const GX = (window as any).GX; // lu au démarrage (le noyau l'a créé), pas à l'import
/* =====================================================================
   GEARBOX OS — fonds d'écran animés (WebGL, shaders)
   Moteur unique : une toile plein écran, un fragment shader par fond.
   GARDE-FOUS (la leçon des PC qui chauffent) :
   - rendu en résolution réduite puis agrandi (0,5 par défaut) ;
   - 30 images/s maximum ;
   - PAUSE quand le bureau est recouvert (fenêtre agrandie / plein écran),
     quand l'onglet est masqué, et en mode économe (image fixe) ;
   - qualité adaptative : si une image dépasse le budget, la résolution
     baisse ; si ça ne suffit pas, le fond se fige et on prévient.
   ===================================================================== */
(() => {
  const W = (GX.wall = {});

  /* ------------------------------------------------ bibliothèque GLSL commune */
  const LIB = `
precision highp float;
uniform vec2 R; uniform float T; uniform vec2 M; uniform float L; uniform vec2 J;
#define FC (gl_FragCoord.xy+J)
#define PI 3.14159265
float h11(float p){p=fract(p*.1031);p*=p+33.33;p*=p+p;return fract(p);}
/* hachage en arithmétique entière EXACTE (tout reste < 2^24) : insensible au réordonnancement des
   calculs par le pilote (Intel/ANGLE), qui cassait l'ancien hachage en lignes et en carrés */
float perm(float x){return mod((x*34.+1.)*x,289.);}
float h21(vec2 p){p=mod(floor(p*8.)/8.,289.);return fract(perm(perm(p.x)+p.y)/289.+perm(perm(p.y+11.)+p.x)/83521.);}
vec2 h22(vec2 p){vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yzx+33.33);return fract((p3.xx+p3.yz)*p3.zy);}
float h31(vec3 p){return h21(vec2(p.x+perm(mod(floor(p.z),289.)),p.y+fract(p.z)*7.));}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+1.),f.x),f.y);}
float n3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+1.),f.x),f.y),f.z);}
float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<5;i++){v+=a*n2(p);p=m*p;a*=.5;}return v;}
float fbm3(vec3 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n3(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return v;}
vec3 tone(vec3 c){c=1.-exp(-c*1.25);return pow(c,vec3(.8));}
float grain(vec2 p){return h21(p+fract(T*7.13)*97.)-.5;}
`;

  /* ================================================================ BONY — le fond officiel (par défaut)
     Charte (brandbook sept. 2024) : noir, bleu nuit #293f74, dégradé du logo #e95638 → #d34f48 → #933d78
     → #7a368b ; iconographie « levers de soleil qui font écho au dégradé ». Le LOGO n'est pas dans le
     shader : c'est le SVG officiel (version blanche), posé net par-dessus, jamais déformé ni recoloré. */
  /* [GEARBOX] Fonds Bony REFAITS le 30/09/2026 (Théo : « ces vagues en 3D font vintage, ce bleu est moche »,
     puis refus d'une aura floue et du grain) : trois fonds NETS sur noir profond, sans grain — voir BONY_A/B/C. */

  /* [GEARBOX] Trois fonds Bony retenus par Théo le 30/09/2026 : TRAIT (trait de lumière, fond par défaut, id
     historique `bony`), TRAME (grille de points révélée par un faisceau), TRACÉS (lignes arrondies façon « B »). */
  const BONY_A = LIB + `
vec3 g(float t){t=clamp(t,0.,1.);return t<.5?mix(vec3(.969,.337,.196),vec3(.576,.239,.471),t*2.):mix(vec3(.576,.239,.471),vec3(.478,.212,.545),(t-.5)*2.);}
void main(){vec2 p=(FC-.5*R)/R.y;float ar=R.x/R.y,t=T*.05,px=1./R.y;
  vec3 col=vec3(.006,.005,.009);
  float y=-.28+.16*sin(p.x*1.25+t)+.05*sin(p.x*3.1-t*1.4)+.1*p.x;float d=abs(p.y-y);
  vec3 c=g(p.x/ar+.5);
  col+=c*(smoothstep(1.8*px,0.,d)*1.1+exp(-d*90.)*.35+exp(-d*14.)*.1);
  float y2=y-.035+.01*sin(p.x*5.+t*2.);float d2=abs(p.y-y2);col+=c*(smoothstep(1.2*px,0.,d2)*.35+exp(-d2*120.)*.12);
  col*=smoothstep(.98*ar,.35*ar,abs(p.x));
  gl_FragColor=vec4(tone(col)*L,1.);}`;
  /* ================================================================ MAGMA — lampe à lave orange / violet (clin d'œil aux volcans) */
  const MAGMA = LIB + `
void main(){vec2 p=(FC-.5*R)/R.y;float f=0.;
  for(int k=0;k<9;k++){float fk=float(k);vec2 o=vec2(sin(T*.13*(1.+fk*.17)+fk*2.1)*.75,sin(T*.09*(1.+fk*.11)+fk*1.3)*.42);float r=.07+.05*h11(fk);f+=r*r/dot(p-o,p-o);}
  vec3 c=vec3(.02,.01,.04);
  float blob=smoothstep(.9,1.25,f);
  vec3 lava=mix(vec3(.42,.05,.52),vec3(.97,.34,.2),smoothstep(1.,2.4,f));lava=mix(lava,vec3(1.,.8,.5),smoothstep(3.5,8.,f));
  c=mix(c,lava,blob);c+=vec3(.97,.34,.2)*smoothstep(.4,1.,f)*(1.-blob)*.25;
  c+=vec3(.4,.08,.5)*(1.-length(p)*.8)*.08;
  gl_FragColor=vec4(tone(c*1.4)*L+grain(FC)*.015,1.);}`;

  /* ================================================================ RÉTRO — synthwave : soleil rayé Bony, grille qui défile */
  const RETRO = LIB + `
void main(){vec2 uv=FC/R.xy;vec2 p=(FC-.5*R)/R.y;float hz=-.05;
  vec3 c=mix(vec3(.05,.02,.12),vec3(.35,.05,.35),smoothstep(.5,hz,p.y));
  vec2 sp=p-vec2(0.,.12);float sr=length(sp);float sun=smoothstep(.28,.275,sr);
  float stripes=step(.5,fract((sp.y+.3)*16.-T*.25))+step(.05,sp.y);
  vec3 sc=mix(vec3(.56,.07,.67),vec3(1.,.55,.2),smoothstep(-.28,.28,sp.y));
  c=mix(c,sc,sun*clamp(stripes,0.,1.)*step(hz,p.y));c+=sc*exp(-max(sr-.28,0.)*9.)*.35*step(hz,p.y);
  float m=hz+.07*abs(sin(p.x*3.1))+.04*n2(vec2(p.x*5.,1.));if(p.y>hz&&p.y<m)c=mix(c,vec3(.08,.02,.14),.95);
  if(p.y<hz){float z=.35/(hz-p.y+.001);float x=p.x*z;float gz=abs(fract(z*.5+T*.9)-.5);float gx=abs(fract(x*.5)-.5);
    float grid=smoothstep(.04*z*.1+.02,0.,min(gz,gx)/z*6.);vec3 gc=mix(vec3(1.,.36,.2),vec3(.7,.1,.9),smoothstep(0.,.6,-p.y));
    c=vec3(.03,.0,.06)+gc*grid*1.3*smoothstep(12.,.5,z)+vec3(.5,.1,.4)*.15*smoothstep(3.,.5,z);}
  vec2 g=FC/2.;c+=vec3(step(.998,h21(floor(g))))*step(hz+.1,p.y)*.8;
  c*=.9+.1*sin(FC.y*1.5);
  gl_FragColor=vec4(tone(c*1.2)*L,1.);}`;

  /* ------------------------------------------------ catalogue */
  /* ------------------------------------------------ fonds FIXES (lot B, 08/10/2026)
     Choisis par Théo sur la planche maquettes/ux/fonds-fixes.html (shaders recopiés d'elle). Chaque fond est
     CALCULÉ UNE FOIS à l'ouverture (et au redimensionnement), posé en image, puis le contexte WebGL est rendu :
     aucun coût ensuite. Logo à PLAT (décision de Théo : ni verre ni relief), coupé par un bord de l'écran. */
  const S_LIB = `
precision highp float;
uniform vec2 R; uniform sampler2D MK; uniform vec4 MP; uniform vec3 MM;
const vec3 O=vec3(.969,.337,.196), V=vec3(.561,.071,.671), B=vec3(.161,.247,.455), P=vec3(.878,.212,.478);
float perm(float x){return mod((x*34.+1.)*x,289.);}
float h21(vec2 p){p=mod(floor(p*8.)/8.,289.);return fract(perm(perm(p.x)+p.y)/289.+perm(perm(p.y+11.)+p.x)/83521.);}
vec2 h22(vec2 p){vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yzx+33.33);return fract((p3.xx+p3.yz)*p3.zy);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+1.),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<6;i++){v+=a*n2(p);p=m*p;a*=.5;}return v;}
float stars(vec2 p,float dens){vec2 g=p*90.;vec2 id=floor(g),f=fract(g)-.5;vec2 o=h22(id)-.5;float k=h21(id+7.3);
  return smoothstep(.12,0.,length(f-o*.6))*step(1.-dens,k)*(.4+.6*h21(id+1.9));}
`;
  const S_MARK = `
/* Logo À PLAT (décision de Théo, 08/10 : pas de verre ni de relief) : aplat translucide, bord net.
   MM.x : 0 = blanc, 1 = dégradé du logo. MM.y : opacité. */
vec3 markFx(vec2 p, vec3 col){
  if(MM.y<=0.) return col;
  vec2 m=(p-MP.xy)/MP.z; vec2 uv=vec2(m.x/MP.w+.5, .5-m.y);
  if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.) return col;
  float a=texture2D(MK,uv).r;
  vec3 grad=mix(vec3(.914,.337,.22), vec3(.478,.212,.545), smoothstep(.1,.9,uv.x));
  vec3 tint=MM.x<.5 ? vec3(1.) : grad;
  return mix(col,tint,a*MM.y);
}`;
  const S_MAIN = `
void main(){
  vec2 p=(gl_FragCoord.xy-.5*R)/R.y;
  vec3 c=bg(p); c=markFx(p,c);
  c*=1.-.32*pow(length(p*vec2(.62,.9)),2.2);                   // vignette
  c+= (h21(gl_FragCoord.xy*1.37)-.5)*.022;                      // grain fin + anti-bandes
  gl_FragColor=vec4(max(c,0.),1.);
}`;
  const MARK_D = 'M116.64,63.24V20.2c2.79-2.03,4.61-5.31,4.61-9.03,0-6.17-5-11.17-11.17-11.17s-11.17,5-11.17,11.17c0,3.71,1.82,7,4.61,9.03v29.92h-36.33v-29.92c2.79-2.03,4.61-5.31,4.61-9.03,0-6.17-5-11.17-11.17-11.17s-11.17,5-11.17,11.17c0,3.71,1.82,7,4.61,9.03v29.92H17.73v-29.92c2.79-2.03,4.61-5.31,4.61-9.03C22.34,5,17.34,0,11.17,0S0,5,0,11.17c0,3.71,1.82,7,4.61,9.03v72.96c-2.79,2.03-4.61,5.31-4.61,9.03,0,6.17,5,11.17,11.17,11.17s11.17-5,11.17-11.17c0-3.71-1.82-7-4.61-9.03v-29.92h36.33v29.92c-2.79,2.03-4.61,5.31-4.61,9.03,0,6.17,5,11.17,11.17,11.17s11.17-5,11.17-11.17c0-3.71-1.82-7-4.61-9.03v-29.92h49.45';
  const STILL = {
    soie: `float H(vec2 p){vec2 q=p*1.6; q+=.55*vec2(sin(q.y*1.4+.4),sin(q.x*1.1-.8)); q+=.25*vec2(sin(q.y*2.7+1.9),sin(q.x*2.3+.3));
      float w=sin(q.x*3.1+q.y*1.9); return w*.5+.5;}
    vec3 bg(vec2 p){ float e=.0015; float h=H(p);
      vec3 n=normalize(vec3(-(H(p+vec2(e,0))-H(p-vec2(e,0)))/(2.*e)*.22, -(H(p+vec2(0,e))-H(p-vec2(0,e)))/(2.*e)*.22, 1.));
      vec3 l=normalize(vec3(-.55,.6,.6)); float d=max(dot(n,l),0.); float s=pow(max(dot(n,normalize(l+vec3(0,0,1))),0.),60.);
      vec3 base=mix(vec3(.035,.012,.06), V*.6, smoothstep(.05,1.,h));
      base=mix(base, O*.85, smoothstep(-.2,.9, -p.x*.55+h*.5-p.y*.35)*.65);
      float sat=pow(max(dot(n,normalize(vec3(.3,.2,1.))),0.),8.);
      vec3 c=base*(.12+1.25*d*d)+s*vec3(1.,.82,.78)*.7+base*sat*.35;
      return c*smoothstep(1.6,.1,length(p-vec2(-.25,.05)));}`,
    faisceaux: `vec3 bg(vec2 p){ vec2 d=p-vec2(-1.05,.75); float a=atan(d.y,d.x), r=length(d);
      float beams=pow(fbm(vec2(a*11.,.7)),3.)*2.4+pow(n2(vec2(a*42.,3.)),7.)*.9;
      float fall=exp(-r*1.05);
      vec3 c=mix(vec3(.008,.01,.024), B*.32, smoothstep(1.1,-.7,p.y+p.x*.35));
      c+=mix(O*1.1,P,smoothstep(.2,1.7,r))*beams*fall*.5;
      vec2 g=p*55.; vec2 id=floor(g), f=fract(g)-.5; vec2 o=h22(id)-.5;
      float dust=smoothstep(.12,0.,length(f-o*.7))*step(.9,h21(id+3.));
      c+=dust*beams*fall*1.6*vec3(1.,.86,.72);
      return c;}`,
    aurore: `vec3 bg(vec2 p){ vec3 c=mix(vec3(.006,.006,.018),vec3(.025,.03,.075),smoothstep(-.45,.55,p.y));
      c+=stars(p,.06)*.7*smoothstep(-.2,.3,p.y);
      for(int i=0;i<3;i++){ float fi=float(i); float x=p.x*(1.1+fi*.35)+fi*3.1;
        float y0=.02+fi*.1+(fbm(vec2(x*.6,fi*1.7))-.5)*.42;
        float band=exp(-pow((p.y-y0)*9.,2.));
        float rays=pow(fbm(vec2(x*14.,fi*2.3)),3.2)*2.2;
        float up=smoothstep(y0-.015,y0+.03,p.y)*exp(-max(p.y-y0,0.)*3.2);
        vec3 cc=mix(mix(O,P,step(.5,fi)),V,step(1.5,fi));
        c+=cc*(band*.35+up*rays*.6)*.38*(1.-fi*.18); }
      float h=-.33+(fbm(vec2(p.x*1.4,.5))-.5)*.2+.06*exp(-pow((p.x-.35)*5.,2.));
      float h2=-.42+(fbm(vec2(p.x*2.2,4.))-.5)*.14;
      c=mix(c,vec3(.012,.01,.025),smoothstep(h+.003,h-.003,p.y));
      c=mix(c,vec3(.004,.004,.01),smoothstep(h2+.003,h2-.003,p.y));
      return c;}`,
    flux: `vec3 bg(vec2 p){ p*=.55;
      vec2 q=vec2(fbm(p),fbm(p+vec2(5.2,1.3)));
      vec2 r=vec2(fbm(p+3.*q+vec2(1.7,9.2)),fbm(p+3.*q+vec2(8.3,2.8)));
      float f=fbm(p+3.2*r);
      vec3 c=mix(V*.75,O,clamp(f*f*2.3,0.,1.));
      c=mix(c,P,clamp(length(q)*.55,0.,1.)*.55);
      c=mix(c,B*.7,clamp(r.x*r.x*1.5,0.,1.)*.75);
      return c*(.28+.85*f*f);}`,
    graphite: `vec3 bg(vec2 p){ float b=fbm(vec2(p.x*1.4,p.y*95.))*.55+fbm(vec2(p.x*3.,p.y*210.))*.35;
      vec3 c=vec3(.062,.062,.074)+b*.03;
      c+=vec3(.09,.085,.1)*exp(-length(p-vec2(-.35,.7))*1.4);
      c+=O*.05*exp(-length(p-vec2(.9,-.6))*2.);
      return c;}`,
  };
  W.catalog = [
    { id: 'soie', name: 'Soie', note: 'Plis de satin violet et orange', still: true, glsl: STILL.soie, mark: { mode: 0, op: .09, edge: 1, x: -.06, y: -.08, z: 1.05 }, tint: '#2a1530' },
    { id: 'faisceaux', name: 'Faisceaux', note: 'Rais de lumière dans la poussière', still: true, glsl: STILL.faisceaux, mark: { mode: 1, op: .16, edge: -1, x: .1, y: -.42, z: 1.0 }, tint: '#141a30' },
    { id: 'aurore', name: 'Aurore', note: 'Rideaux de lumière au-dessus des crêtes', still: true, glsl: STILL.aurore, mark: null, tint: '#0f1424' },
    { id: 'flux', name: 'Flux', note: 'Marbrure fluide orange, rose et violet', still: true, glsl: STILL.flux, mark: { mode: 0, op: .10, edge: -1, x: .02, y: .1, z: 1.15 }, tint: '#2a1230' },
    { id: 'graphite', name: 'Graphite', note: 'Métal brossé, sobre pour travailler', still: true, glsl: STILL.graphite, mark: { mode: 0, op: .05, edge: -1, x: .26, y: -.02, z: .95 }, tint: '#1c1b20' },
    /* Animés, en option (✦) : les trois gardés par Théo le 08/10/2026, en résolution réduite. */
    { id: 'bony', name: 'Bony · Trait', note: 'Logo officiel, trait de lumière au dégradé du logo', frag: BONY_A, scale: .75, dprMax: 1.25, taa: false, logo: 'logo-bony-white.svg', tint: '#1a1030', hero: true },
    { id: 'magma', name: 'Magma', note: 'Lampe à lave, clin d’œil aux volcans', frag: MAGMA, scale: .5, tint: '#2a1420' },
    { id: 'retro', name: 'Rétro', note: 'Synthwave, soleil rayé Bony', frag: RETRO, scale: .6, tint: '#2a1030' },
  ];
  W.ids = W.catalog.map((w) => w.id);
  W.is = (id) => W.ids.includes(id);
  /* Fond inconnu (retiré, ancien identifiant) → Ruban, le fond par défaut (CSS, maquette.css). */
  W.normalize = (id) => (id === 'ruban' || W.is(id) ? id : 'ruban');
  W.get = (id) => W.catalog.find((w) => w.id === id);

  /* ------------------------------------------------ moteur WebGL */
  const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  function makeGL(canvas) {
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
    if (!gl) return null;
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    return gl;
  }
  const progCache = new WeakMap();
  function program(gl, frag) {
    let m = progCache.get(gl); if (!m) progCache.set(gl, (m = new Map()));
    if (m.has(frag)) return m.get(frag);
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); return null; } return s; };
    const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, frag); if (!vs || !fs) return null;
    const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); return null; }
    const info = { p, a: gl.getAttribLocation(p, 'a'), R: gl.getUniformLocation(p, 'R'), T: gl.getUniformLocation(p, 'T'), M: gl.getUniformLocation(p, 'M'), L: gl.getUniformLocation(p, 'L'), J: gl.getUniformLocation(p, 'J'), S: gl.getUniformLocation(p, 'S') };
    m.set(frag, info); return info;
  }
  function draw(gl, info, w, h, t, mx, my, lum, jx = 0, jy = 0) {
    gl.viewport(0, 0, w, h); gl.useProgram(info.p); if (info.J) gl.uniform2f(info.J, jx, jy);
    gl.enableVertexAttribArray(info.a); gl.vertexAttribPointer(info.a, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(info.R, w, h); gl.uniform1f(info.T, t); gl.uniform2f(info.M, mx, my); gl.uniform1f(info.L, lum);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }


  /* Anticrénelage temporel : l'image est rendue avec un décalage de sous-pixel différent à chaque fois,
     puis fondue dans un historique (demi-flottant si possible). Résultat : bords lisses, étoiles nettes,
     et un léger flou de mouvement « photographique » sur le disque. */
  const COPY = 'precision mediump float;uniform sampler2D S;uniform vec2 R;void main(){gl_FragColor=texture2D(S,gl_FragCoord.xy/R);}';
  function makeHistory(gl, w, h) {
    const half = gl.getExtension('OES_texture_half_float'), cbuf = gl.getExtension('EXT_color_buffer_half_float');
    gl.getExtension('OES_texture_half_float_linear');
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    let type = half && cbuf ? half.HALF_FLOAT_OES : gl.UNSIGNED_BYTE;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, type, null);
    [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach((k) => gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE && type !== gl.UNSIGNED_BYTE) {
      type = gl.UNSIGNED_BYTE; gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, type, null);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w, h, half: type !== gl.UNSIGNED_BYTE, n: 0 };
  }
  const HALTON = Array.from({ length: 16 }, (_, i) => { const hal = (b, n) => { let f = 1, r = 0; while (n > 0) { f /= b; r += f * (n % b); n = Math.floor(n / b); } return r; }; return [hal(2, i + 1) - .5, hal(3, i + 1) - .5]; });
  function drawTAA(c, t) {
    const gl = c.gl, w = c.canvas.width, h = c.canvas.height;
    if (!c.hist || c.hist.w !== w || c.hist.h !== h) c.hist = makeHistory(gl, w, h);
    const H = c.hist, j = HALTON[H.n % 16];
    gl.bindFramebuffer(gl.FRAMEBUFFER, H.fb);
    const a = H.n === 0 ? 1 : (H.half ? .24 : .34);
    gl.enable(gl.BLEND); gl.blendColor(0, 0, 0, a); gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
    draw(gl, c.info, w, h, t, mouse.x, mouse.y, lum(), j[0], j[1]);
    gl.disable(gl.BLEND); gl.bindFramebuffer(gl.FRAMEBUFFER, null); H.n++;
    if (!c.copy) c.copy = program(gl, COPY);
    gl.viewport(0, 0, w, h); gl.useProgram(c.copy.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, H.tex);
    gl.uniform1i(c.copy.S, 0); gl.uniform2f(c.copy.R, w, h);
    gl.enableVertexAttribArray(c.copy.a); gl.vertexAttribPointer(c.copy.a, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* Passe préalable (def.pre) : rendue en basse résolution dans une texture, lue par le shader principal (sampler S) */
  function makeTarget(gl, w, h) {
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach((k) => gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w, h };
  }
  function drawPre(gl, def, store, w, h, t, mx, my, all) {
    store.pn = (store.pn || 0) + 1; store.preT = store.preT || [];
    const mi = program(gl, def.frag);
    def.passes.forEach((ps, k) => {
      const pw = Math.max(2, Math.round(w * ps.scale)), ph = Math.max(2, Math.round(h * ps.scale));
      let tg = store.preT[k];
      const fresh = !tg || tg.w !== pw || tg.h !== ph;
      if (fresh) { if (tg) { gl.deleteTexture(tg.tex); gl.deleteFramebuffer(tg.fb); } tg = store.preT[k] = makeTarget(gl, pw, ph); }
      if (all || fresh || (store.pn + k) % ps.every === 0) {
        const pi = program(gl, ps.frag); if (!pi) return;
        gl.bindFramebuffer(gl.FRAMEBUFFER, tg.fb); draw(gl, pi, pw, ph, t, mx, my, 1); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      gl.useProgram(mi.p); gl.activeTexture(gl.TEXTURE0 + k); gl.bindTexture(gl.TEXTURE_2D, tg.tex); gl.uniform1i(gl.getUniformLocation(mi.p, ps.u), k);
    });
  }

  /* ------------------------------------------------ rendu d'un fond FIXE : une image, puis plus rien */
  let markCv = null;
  function markCanvas() {   // le logo (tracé de public/logo-color.svg) en blanc sur transparent, texture du shader
    if (markCv) return markCv;
    const c = document.createElement('canvas'); c.width = 1100; c.height = 1050;
    const x = c.getContext('2d'), k = 900 / 121.25; x.fillStyle = '#fff';
    x.translate((1100 - 121.25 * k) / 2, (1050 - 113.36 * k) / 2); x.scale(k, k); x.fill(new Path2D(MARK_D));
    return (markCv = c);
  }
  const markTex = new WeakMap();
  function stillDraw(def, w, h, cv) {
    cv.width = w; cv.height = h;
    const gl = cv.getContext('webgl', { preserveDrawingBuffer: true, antialias: false, alpha: false, powerPreference: 'low-power' }); if (!gl) return false;
    if (!markTex.has(gl)) {
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach((k) => gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE));
      [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach((k) => gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR));
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, markCanvas()); markTex.set(gl, t);
    }
    const info = program(gl, S_LIB + def.glsl + S_MARK + S_MAIN); if (!info) return false;
    gl.viewport(0, 0, w, h); gl.useProgram(info.p);
    gl.enableVertexAttribArray(info.a); gl.vertexAttribPointer(info.a, 2, gl.FLOAT, false, 0, 0);
    const u = (n) => gl.getUniformLocation(info.p, n), m = def.mark || { mode: 0, op: 0, x: 0, y: 0, z: 1 }, ar = w / h;
    // Logo ancré sur un bord (x compté depuis lui) et réduit sur un écran en hauteur, pour rester « coupé » partout.
    const z = m.z * Math.min(1, Math.max(.6, ar / 1.6));
    gl.uniform2f(info.R, w, h);
    gl.uniform4f(u('MP'), (m.edge || 0) * ar / 2 + m.x, m.y, z, 1100 / 1050); gl.uniform3f(u('MM'), m.mode, m.op, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, markTex.get(gl)); gl.uniform1i(u('MK'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }
  async function stillURL(def, w, h) {
    const cv = document.createElement('canvas');
    const ok = stillDraw(def, w, h, cv);
    const blob = ok ? await new Promise((r) => cv.toBlob(r, 'image/jpeg', .92)) : null;
    cv.getContext('webgl')?.getExtension('WEBGL_lose_context')?.loseContext();   // la carte graphique est libérée aussitôt
    return blob ? URL.createObjectURL(blob) : null;
  }
  async function paintStill() {
    const c = cur; if (!c?.still) return;
    const seq = ++c.seq, dpr = Math.min(devicePixelRatio || 1, 2);
    c.w = innerWidth; c.h = innerHeight;
    const url = await stillURL(c.def, Math.round(innerWidth * dpr), Math.round(innerHeight * dpr));
    if (cur !== c || seq !== c.seq) { if (url) URL.revokeObjectURL(url); return; }
    if (c.url) URL.revokeObjectURL(c.url);
    c.url = url; c.host.style.background = url ? `#05040a url(${url}) center/cover no-repeat` : '';
  }

  let cur = null; // { id, canvas, gl, info, raf, scale, ... } — ou { id, def, host, still: true, url } pour un fond fixe
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  GX.win(window, 'pointermove', (e) => { mouse.tx = (e.clientX / innerWidth - .5) * 2; mouse.ty = (e.clientY / innerHeight - .5) * -2; }, { passive: true });
  const t0 = performance.now() - (Math.random() * 60000);
  const lum = () => (GX.host.dataset.theme === 'light' ? .82 : 1);
  W.status = () => (cur ? (cur.still ? { id: cur.id, still: true, paused: true, reason: 'fond fixe', fps: 0 } : { id: cur.id, scale: cur.scale, paused: cur.paused, reason: cur.reason, fps: cur.fps }) : null);

  function covered() {
    if (document.hidden) return 'onglet masqué';
    if (GX.host.dataset.effects === 'eco') return 'mode économe';
    /* [GEARBOX] Lot B (08/10/2026) : l'animation ne tourne QUE sur un bureau vide. Avant, elle continuait sous les
       fenêtres tant qu'elles couvraient moins de 92 % de l'écran — le verre dépoli recalculait alors son flou à
       chaque image. */
    if (GX.host.dataset.shell === 'mobile') return GX.root.querySelector('#mhome')?.classList.contains('away') ? 'rubrique ouverte' : null;
    if ((GX.wm?.visible?.() || []).length) return 'fenêtre ouverte';
    return null;
  }

  W.mount = (host, id) => {
    W.unmount();
    const def = W.get(id); if (!def || !host) return false;
    if (def.still) { cur = { id, def, host, still: true, url: null, seq: 0 }; paintStill(); return true; }
    const canvas = document.createElement('canvas'); canvas.className = 'wp-canvas';
    const gl = makeGL(canvas); if (!gl) { host.classList.add('wp-' + id); return false; }
    const info = program(gl, def.frag); if (!info) return false;
    host.append(canvas);
    let logoEl = null;
    if (def.logo) { logoEl = document.createElement('div'); logoEl.className = 'wp-logo'; logoEl.innerHTML = `<img src="${def.logo}" alt="Bony auto-mobile" draggable="false">`; host.append(logoEl); }
    cur = { id, def, host, canvas, gl, info, scale: def.scale, fps: 0, paused: false, reason: null, frames: [], last: 0, slow: 0, born: performance.now(), logoEl };
    resize(); frame(performance.now(), true);
    canvas.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, easing: 'ease-out' });
    cur.raf = requestAnimationFrame(frame);
    return true;
  };
  W.unmount = () => { if (!cur) return; if (cur.still) { cur.seq++; if (cur.url) URL.revokeObjectURL(cur.url); cur.host.style.background = ''; cur = null; return; } cancelAnimationFrame(cur.raf); cur.logoEl?.remove(); const c = cur.canvas; cur.gl.getExtension('WEBGL_lose_context')?.loseContext(); c.remove(); cur = null; };
  function resize() {
    if (!cur || cur.still) return;
    const k = cur.scale * Math.min(devicePixelRatio || 1, cur.def.dprMax || 1.5);
    cur.canvas.width = Math.max(2, Math.round(innerWidth * k)); cur.canvas.height = Math.max(2, Math.round(innerHeight * k)); cur.hist = null;
  }
  let stillT = 0;
  GX.win(window, 'resize', () => {
    if (cur?.still) { clearTimeout(stillT); stillT = setTimeout(() => { if (cur?.still && (cur.w !== innerWidth || cur.h !== innerHeight)) paintStill(); }, 400); return; }
    resize(); if (cur) frame(performance.now(), true);
  });
  const BUDGET = 1000 / 24;   // [GEARBOX] 24 i/s (30 avant le lot B) : mouvement lent, l'œil ne voit pas la différence
  function frame(now, force) {
    if (!cur || cur.still) return;
    if (!force) cur.raf = requestAnimationFrame(frame);
    const reason = covered();
    if (cur.frozen) return; // figé pour de bon (machine trop lente) : on ne relance jamais en boucle
    // En pause, la boucle S'ARRÊTE (plus aucun rappel par image) : elle repart sur un événement (resume, plus bas).
    if (reason && !force) { if (!cur.paused) { cur.paused = true; cur.reason = reason; } cancelAnimationFrame(cur.raf); return; }
    if (cur.paused) { cur.frames = []; cur.last = now; } // reprise après une pause : la pause ne compte pas comme une image lente
    cur.paused = false; cur.reason = null;
    if (!force && now - cur.last < BUDGET - 2) return;
    const dt = now - cur.last; cur.last = now;
    mouse.x += (mouse.tx - mouse.x) * .04; mouse.y += (mouse.ty - mouse.y) * .04;
    const s = performance.now();
    if (cur.def.passes) drawPre(cur.gl, cur.def, cur, cur.canvas.width, cur.canvas.height, (now - t0) / 1000, mouse.x, mouse.y, force);
    if (cur.def.taa === false) draw(cur.gl, cur.info, cur.canvas.width, cur.canvas.height, (now - t0) / 1000, mouse.x, mouse.y, lum());
    else drawTAA(cur, (now - t0) / 1000);
    if (force) return;
    if (now - cur.born < 3000) return; // le démarrage de la page (compilations, aperçus) ne compte pas
    // Qualité adaptative : on mesure l'écart entre deux images réellement rendues
    // Un écart > 250 ms n'est pas une image lente : onglet ou fenêtre en arrière-plan, pause, gros calcul ponctuel.
    if (dt > 250 || document.hidden || !document.hasFocus()) return;
    cur.frames.push(dt); if (cur.frames.length > 40) cur.frames.shift();
    const avg = cur.frames.reduce((a, b) => a + b, 0) / cur.frames.length; cur.fps = Math.round(1000 / avg);
    if (cur.frames.length >= 40 && avg > 52) {
      cur.frames = [];
      if (cur.scale > .26) { cur.scale = Math.max(.25, cur.scale * .75); resize(); }
      else if (++cur.slow > 2) {
        cur.frozen = cur.paused = true; cur.reason = 'machine trop lente'; cancelAnimationFrame(cur.raf);
        let told = false; try { told = sessionStorage.getItem('gx-wp-frozen') === '1'; sessionStorage.setItem('gx-wp-frozen', '1'); } catch (e) {}
        if (!told) GX.shell?.notify?.({ app: 'settings', title: 'Fond d’écran figé', body: 'Cette machine peine à animer « ' + cur.def.name + ' » : il reste affiché en image fixe.', silent: false });
      }
    }
    void s;
  }
  const resume = () => { if (cur && !cur.still && cur.paused && !cur.frozen && !covered()) { cur.paused = false; cancelAnimationFrame(cur.raf); cur.raf = requestAnimationFrame(frame); } };
  GX.on?.('wm:change', resume); GX.on?.('prefs', resume); GX.on?.('wall:check', resume);   // wall:check : rubrique fermée au téléphone (mobile.ts)
  GX.win(document, 'visibilitychange', () => { if (cur && !cur.still && !cur.frozen && !document.hidden) { cancelAnimationFrame(cur.raf); cur.raf = requestAnimationFrame(frame); } });

  /* ------------------------------------------------ aperçus (vignettes des réglages, écran verrouillé) :
     chaque shader rendu une fois en petit, posé comme image de fond de la classe .wp-<id> */
  const LOGO = new Image(); LOGO.src = 'logo-bony-white.svg';
  W.previews = () => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 200;
    const gl = c.getContext('webgl', { preserveDrawingBuffer: true, antialias: false }); if (!gl) return;
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    let rules = '', sc = null; const store = {};
    const todo = [...W.catalog];
    const step = () => {
      const d = todo.shift(); if (!d) { gl.getExtension('WEBGL_lose_context')?.loseContext(); sc?.getContext('webgl')?.getExtension('WEBGL_lose_context')?.loseContext(); return; }
      if (d.still) {
        sc = sc || document.createElement('canvas');
        if (stillDraw(d, 320, 200, sc)) rules += `.wp-${d.id}{background:#000 url(${sc.toDataURL('image/jpeg', .85)}) center/cover}`;
        const st = GX.root.getElementById('wp-previews') || Object.assign(document.createElement('style'), { id: 'wp-previews' });
        st.textContent = rules; GX.root.append(st); setTimeout(step, 40); return;
      }
      const info = program(gl, d.frag);
      if (info && d.passes) drawPre(gl, d, store, 320, 200, d.id === 'gargantua' ? 20 : 12, 0, 0, true);
      if (info) { draw(gl, info, 320, 200, d.id === 'gargantua' ? 20 : 12, 0, 0, 1); let url = c.toDataURL('image/jpeg', .82);
        if (d.logo && LOGO.complete && LOGO.naturalWidth !== 0) { const c2 = document.createElement('canvas'); c2.width = 320; c2.height = 200; const x = c2.getContext('2d'); x.drawImage(c, 0, 0); const lw = 120, lh = lw * 67.67 / 239.62; x.drawImage(LOGO, (320 - lw) / 2, 200 * .44 - lh / 2, lw, lh); url = c2.toDataURL('image/jpeg', .85); } rules += `.wp-${d.id}{background:#000 url(${url}) center/cover}`; }
      const st = GX.root.getElementById('wp-previews') || Object.assign(document.createElement('style'), { id: 'wp-previews' });
      st.textContent = rules; GX.root.append(st); /* [GEARBOX] vignettes : feuille dans la racine fantôme */
      setTimeout(step, 40);
    };
    step();
  };
  W.catalog.forEach((d) => GX.css(`:root[data-wallpaper="${d.id}"]{--tint:${d.tint}}`));
  /* Liquid Glass + thème clair sur un fond animé (tous sombres) : texte blanc, comme les widgets iOS sur un fond sombre */
  GX.css(`:root[data-theme="light"][data-material="liquid"]:is(${W.ids.map((i) => `[data-wallpaper="${i}"]`).join(',')}) :is(#widgets .wdg.glass, .dock.glass){--text:#fff;--text-2:rgba(255,255,255,.84);--text-3:rgba(255,255,255,.64);color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.45)}`);
  GX.css(`.wp-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;image-rendering:auto}
  .wp-logo{position:absolute;left:50%;top:43%;width:min(30vw,500px);aspect-ratio:239.62/67.67;transform:translate(-50%,-50%);pointer-events:none;animation:wp-logo-in 1.4s var(--ease-out) both}
  .wp-logo img{width:100%;height:100%;display:block;user-select:none;filter:drop-shadow(0 8px 40px rgba(0,0,0,.5))}
  .wp-logo::after{content:"";position:absolute;inset:0;-webkit-mask:url(logo-bony-white.svg) center/100% 100% no-repeat;mask:url(logo-bony-white.svg) center/100% 100% no-repeat;
    background:linear-gradient(100deg,transparent 42%,rgba(255,255,255,.6) 50%,transparent 58%) 0 0/300% 100% no-repeat;animation:wp-sheen 11s ease-in-out 2s infinite}
  @keyframes wp-sheen{0%,72%{background-position:120% 0}100%{background-position:-20% 0}}
  @keyframes wp-logo-in{from{opacity:0;transform:translate(-50%,-46%) scale(.97)}to{opacity:1;transform:translate(-50%,-50%)}}
  :root[data-effects="eco"] .wp-logo::after{display:none}
  @media (max-width:760px){.wp-logo{width:64vw;top:34%}}`);
})();

}
