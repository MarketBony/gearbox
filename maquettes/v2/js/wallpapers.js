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

  /* ================================================================ GARGANTUA
     Trou noir de Schwarzschild (unité : rayon de Schwarzschild rs).
     FORME : chaque pixel est relié au point du disque qu'il voit par l'approximation
     de Beloborodov (1 − cos α = (1 − cos ψ)(1 − rs/r)), résolue par dichotomie.
     C'est ce qui donne la vraie silhouette : l'arrière du disque relevé en arc qui
     épouse l'ombre (rayon 2,6 rs), l'avant qui passe devant, l'image secondaire fine
     sous l'ombre, l'anneau de photons. Doppler relativiste + décalage gravitationnel.
     ROTATION : deux couches de texture qui tournent (vitesse képlérienne) et se relaient
     en fondu, pour que la rotation différentielle n'enroule jamais la texture en anneaux
     immobiles ; grumeaux chauds en orbite.
     NETTETÉ : chaque motif est filtré à l'empreinte réelle d'un pixel (pas d'anticrénelage
     temporel, qui floute le mouvement).
     CIEL : nébuleuse filamenteuse éclairée par le disque (bords lumineux), voiles de
     poussière qui masquent les étoiles, étoiles en taches lumineuses douces, amas,
     supernovae (éclat qui se refroidit, aigrettes, reste filamenteux). */
  /* nébuleuse : passe séparée en basse résolution (elle est floue par nature), lue en texture */
  const NEBF = `
float fbm6(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<6;i++){v+=a*n2(p);p=m*p;a*=.5;}return v;}
/* nébuleuse : densité très déformée (filaments), bords éclairés par le disque (ld),
   deux régions — violette/bleue et orange — séparées par du vide, jamais mélangées */
vec4 nebula(vec2 s,vec2 ld,float near){
  vec2 q=s*1.25;
  vec2 w1=vec2(fbm(q+vec2(0.,T*.003)),fbm(q+vec2(5.2,1.3)));
  vec2 w2=vec2(fbm(q+1.8*w1+vec2(1.7,9.2)),fbm(q+1.8*w1+vec2(8.3,2.8+T*.002)));
  vec2 qq=q+1.3*w2;
  float n=fbm6(qq),nl=fbm6(qq+ld*.05);
  float rid=pow(1.-abs(2.*fbm6(q*2.2+1.6*w2+4.)-1.),5.);
  float mask=smoothstep(.25,.45,fbm(s*.8+vec2(2.,17.)));
  float dens=(pow(smoothstep(.36,.78,n),1.5)*1.7+rid*.6*smoothstep(.36,.6,n))*mask;
  float rim=clamp((nl-n)*22.,0.,1.)*smoothstep(.4,.65,n)*mask;
  float hue=.5+1.2*(fbm(s*.8+vec2(9.,3.))-.5)+.25*sin(s.x*2.4+.7)+.25*(w1.x-.5)+.1*near;
  float wv=1.-smoothstep(.44,.5,hue),wo=smoothstep(.52,.58,hue);
  vec3 vio=mix(vec3(.16,.05,.36),vec3(.42,.32,.98),smoothstep(.45,1.1,dens));
  vec3 org=mix(vec3(.35,.05,.02),vec3(1.,.42,.12),smoothstep(.3,.9,dens));org=mix(org,vec3(1.,.66,.36),smoothstep(1.1,1.7,dens));
  vec3 c=(vio*wv*1.05+org*wo*.8)*dens;
  c+=(vec3(.55,.5,1.)*wv+vec3(1.,.62,.3)*wo)*rim*.5;
  c+=vec3(.02,.028,.07)*(.5+fbm(s*.7+11.));
  float dust=smoothstep(.5,.78,fbm6(q*1.7+2.2*w1+7.));
  return vec4(c*(1.-.85*dust),dust);}
`;
  const GARG_NEB = LIB + NEBF + `
void main(){vec2 p=(FC-.5*R)/R.y;vec2 H=vec2(.1,.03)+M*vec2(.012,.008);
  vec4 nb=nebula((p+vec2(T*.0035,0.)+M*.01)*1.1,normalize(H-p+1e-4),exp(-length(p-H)/.5));
  gl_FragColor=vec4(sqrt(clamp(nb.rgb*.5,0.,1.)),nb.a);}`;
  /* étoiles : passe pleine résolution, rafraîchie une image sur trois (le ciel dérive de quelques pixels par seconde) */
  const GARG_STARS = LIB + `
float clusterB(vec2 s){vec2 cc=floor(s/.8);if(h21(cc+41.)>.5)return 0.;vec2 cp=(cc+.3+.4*h22(cc+2.))*.8;float rc=.06+.08*h21(cc+5.);return exp(-dot(s-cp,s-cp)/(rc*rc));}
vec3 starCol(float h){return mix(mix(vec3(.62,.74,1.),vec3(1.,.97,.93),smoothstep(0.,.45,h)),vec3(1.,.74,.48),smoothstep(.72,1.,h));}
/* tache lumineuse gaussienne, élargie à l'empreinte du pixel à flux constant */
float psf(float d,float s0,float fp){float sg=max(s0,fp*.55);return exp(-d*d/(2.*sg*sg))*s0*s0/(sg*sg);}
vec3 starsL(vec2 s,float cs,float prob,float seed,float amp,float pxu,float fp,float field){
  vec2 id=floor(s/cs);float h=h21(id+seed);
  if(h>prob*field*(1.+5.*clusterB(id*cs)))return vec3(0.);
  vec2 sp=(id+.18+.64*h22(id+seed))*cs;float m=pow(h21(id+seed+4.),2.5);
  return starCol(h21(id+seed+9.))*amp*(.12+m)*psf(length(s-sp),pxu*.62,fp);}
vec3 starsBright(vec2 s,float pxu,float fp){vec3 c=vec3(0.);float cs=pxu*85.;vec2 id0=floor(s/cs-.5);
  for(int j=0;j<=1;j++)for(int i=0;i<=1;i++){vec2 id=id0+vec2(float(i),float(j));float h=h21(id+3.);
    if(h>.13+.5*clusterB(id*cs))continue;
    vec2 d=s-(id+.2+.6*h22(id+1.))*cs;float dl=length(d);float m=pow(h21(id+4.1),3.);
    float tw=.85+.15*sin(T*(1.1+h*3.)+h*50.);
    float core=psf(dl,pxu*(.7+.5*m),fp)*(1.2+2.5*m);
    float halo=exp(-dl/(pxu*(2.5+7.*m)))*(.08+.45*m);
    float sw=max(pxu*.55,fp*.5),sl=pxu*(6.+34.*m);
    float spk=(exp(-abs(d.x)/sw-abs(d.y)/sl)+exp(-abs(d.y)/sw-abs(d.x)/sl))*smoothstep(.35,1.,m)*.7;
    c+=starCol(h21(id+8.8))*(core+halo+spk)*tw;}
  return c;}
void main(){vec2 p=(FC-.5*R)/R.y;float pxu=1./R.y;vec2 sd=p+vec2(T*.006,0.)+M*.02;
  float field=.45+1.1*smoothstep(.35,.75,fbm(sd*.5+20.));
  vec3 st=starsL(sd,pxu*7.,.24,1.,.6,pxu,pxu,field)+starsL(sd,pxu*17.,.3,7.,1.1,pxu,pxu,field)+starsBright(sd,pxu,pxu);
  st+=vec3(.45,.6,1.)*clusterB(sd)*.07;
  gl_FragColor=vec4(sqrt(clamp(st*.25,0.,1.)),1.);}`;
  const GARGANTUA = LIB + `
uniform sampler2D S;uniform sampler2D S2;
vec3 hotc(float t){vec3 c=mix(vec3(1.,.97,.9),vec3(1.,.8,.5),smoothstep(0.,.25,t));c=mix(c,vec3(.98,.38,.14),smoothstep(.2,.6,t));return mix(c,vec3(.42,.06,.03),smoothstep(.6,1.,t));}
float Wk(float r){return 1.25*pow(1.6/r,1.5);}
float wrapA(float a){return a-2.*PI*floor((a+PI)/(2.*PI));}
float fbmA(vec3 q,float fw){float v=0.,a=.5,s=1.;for(int i=0;i<5;i++){float k=1.-smoothstep(.3,.7,fw*s);if(k<=0.){v+=a;break;}v+=a*mix(.5,n3(q*s+float(i)*7.3),k);s*=2.03;a*=.5;}return v;}
float layer(float r,float phi,float seed,float fw){
  float f=fbmA(vec3(cos(phi)*1.6,sin(phi)*1.6,r*3.2+seed*5.3),fw);
  float rid=pow(1.-abs(n3(vec3(cos(phi)*4.,sin(phi)*4.,r*11.+seed*3.1))*2.-1.),3.);
  return f+.45*mix(.3,rid,1.-smoothstep(.25,.6,fw*3.5));}
/* densité du disque (r en unités de texture : bord interne 1,6 = 3 rs) */
float diskD(float r,float phi,float fr,float ft){
  if(r<1.3||r>6.5)return 0.;
  float fw=max(fr*3.2,ft*1.6/r),P=10.,ta=T/P,a=fract(ta),b=fract(ta+.5),w=Wk(r);
  float tex=mix(layer(r,phi-w*a*P,floor(ta),fw),layer(r,phi-w*b*P,floor(ta+.5)+17.,fw),abs(2.*a-1.));
  float blob=0.;
  for(int k=0;k<8;k++){float fk=float(k);float rk=1.85+3.2*h11(fk*3.7+.5);float ak=h11(fk*9.1)*6.2832+T*Wk(rk);
    float dr=(r-rk)/max(.15,fr*1.5),dp=wrapA(phi-ak)*rk/max(.8,ft*1.5);blob+=exp(-dr*dr-dp*dp)*(.5+.9*h11(fk*5.3));}
  float edge=smoothstep(1.5,1.62+fr*2.,r)*(1.-smoothstep(3.6,6.2,r));
  return edge*clamp(.25+1.1*(tex-.4)+.95*blob,0.,2.);}
/* Beloborodov : paramètre d'impact b d'un point du disque au rayon r vu sous l'angle ψ */
float bOf(float r,float cp){float u=1./r;float ca=clamp(1.-(1.-cp)*(1.-u),-1.,1.);return r*sqrt(1.-ca*ca)/sqrt(1.-u);}
float solveR(float b,float cp){float lo=.05,hi=3.9;for(int i=0;i<14;i++){float m=.5*(lo+hi);if(bOf(exp(m),cp)<b)lo=m;else hi=m;}return exp(.5*(lo+hi));}
/* couleur + opacité du disque au rayon physique r, azimut phi */
vec4 shadeDisk(float r,float phi,float fr,float ft,float sI){
  float d=diskD(r*.5333,phi,fr,ft);if(d<=0.)return vec4(0.);
  float be=min(sqrt(.5/max(r-1.,.5)),.75);
  float g=sqrt(1.-be*be)/(1.+be*cos(phi)*sI)*sqrt(max(1.-1./r,0.));
  float temp=clamp(pow((r-2.8)/8.5,.8)-(g-.85)*.55,0.,1.);
  return vec4(hotc(temp)*d*pow(g,2.6)*pow(3.4/r,1.2)*1.9,clamp(d*1.2,0.,1.));}
vec3 novae(vec2 p,vec2 H,float px){vec3 c=vec3(0.);
  for(int k=0;k<3;k++){float fk=float(k);float per=19.+fk*7.;float tt=T+fk*8.3;float cyc=floor(tt/per);float age=tt-cyc*per;
    vec2 r=h22(vec2(cyc*1.3+fk*11.,fk*5.1));vec2 pos=vec2((r.x-.5)*1.7,(r.y-.5)*.85);
    if(length(pos-H)<.45)pos.x=H.x+sign(pos.x-H.x+.001)*.6;
    vec2 d=p-pos;float dl=length(d);
    float lc=smoothstep(0.,.35,age)*exp(-age*.42);
    vec3 cc=mix(vec3(.72,.84,1.),vec3(1.,.68,.38),smoothstep(0.,6.,age));
    float sg=px*(1.1+1.6*lc);
    c+=cc*lc*(exp(-dl*dl/(2.*sg*sg))*5.+exp(-dl/(px*14.))*1.1+exp(-dl/.07)*.45+exp(-dl/.25)*.12);
    float Ls=.04+.3*lc,sw=px*.8;vec2 e=mat2(.7071,.7071,-.7071,.7071)*d;
    float spk=exp(-abs(d.x)/sw-abs(d.y)/Ls)+exp(-abs(d.y)/sw-abs(d.x)/Ls)+.3*(exp(-abs(e.x)/sw-abs(e.y)/(Ls*.45))+exp(-abs(e.y)/sw-abs(e.x)/(Ls*.45)));
    c+=cc*lc*spk*.9;
    float u=age/per,rr=.015+.1*sqrt(u);float fade=smoothstep(.6,3.,age)*(1.-smoothstep(.35,1.,u));
    if(fade<=0.||dl>rr*1.9+.02)continue;
    vec2 dir=d/max(dl,1e-4);
    float rs=rr*(1.+.55*(fbm(dir*1.7+cyc*3.1+fk*7.)-.5));
    float shell=exp(-pow((dl-rs)/max(rr*.3,px*1.5),2.));
    float fil=smoothstep(.35,.8,fbm(d*16.+cyc*5.))*1.5;
    c+=vec3(1.,.45,.15)*shell*fil*fade*.55+vec3(.3,.12,.62)*smoothstep(rs,0.,dl)*fil*fade*.16;}
  return c;}
vec3 jets(vec2 P,float burst,float px){float ay=abs(P.y),dx=abs(P.x+P.y*.04);
  float wj=max(.08+.07*ay,px*2.),e=exp(-pow(dx/wj,2.))*smoothstep(1.,2.2,ay)*exp(-ay*.22);
  if(e*burst<.002)return vec3(0.);
  float kn=.35+.9*pow(n2(vec2(dx*2.,ay*.7-T*3.)),2.);
  return (vec3(.55,.42,1.)*kn+vec3(.9,.9,1.)*exp(-pow(dx/(wj*.3),2.))*.5)*e*burst*.45;}
void main(){
  vec2 p=(FC-.5*R)/R.y;
  vec2 H=vec2(.1,.03)+M*vec2(.012,.008);
  float K=.034,pxu=1./R.y,px=pxu/K,bc=2.598;
  vec2 B=(p-H)/K;float b=length(B);
  float inc=1.45+.03*sin(T*.021),ci=cos(inc),sI=sin(inc);
  /* ciel déformé par la lentille : nébuleuse et étoiles lues dans les passes préalables */
  vec2 Pv=B/bc;float E=1.3,rq=max(dot(Pv,Pv),1.);
  vec2 s=H+(Pv-Pv/rq*E*E)*bc*K;float fp=pxu*(1.+E*E/rq);
  vec2 uvS=vec2(s.x*R.y/R.x+.5,s.y+.5);
  vec4 tx=texture2D(S,uvS);vec4 nb=vec4(tx.rgb*tx.rgb*2.,tx.a);
  vec3 ts=texture2D(S2,uvS).rgb;vec3 st=ts*ts*4.;
  vec3 col=nb.rgb;
  col+=st*(1.-.9*nb.a);
  col+=novae(s,H,fp);
  col+=jets(Pv,pow(max(0.,sin(T*.17+sin(T*.43)*2.)),14.)*1.8+.15,px/bc);
  /* disque : dans le plan qui contient la ligne de visée et le pixel, le point du disque est à l'angle ψ */
  float chi=atan(B.y,B.x),sc=sin(chi),cc=cos(chi);
  float psi=atan(ci,-sI*sc);
  /* image secondaire (sous l'arc, très fine) + anneau de photons, derrière l'image principale */
  float w2=.12+.5*smoothstep(-.3,1.,-sc),t2=(b-bc*1.015)/w2;
  if(t2>0.&&t2<1.){float psi2=psi+PI;float r2=3.+t2*6.5;
    float ph2=atan(-(sI*cos(psi2)-ci*sin(psi2)*sc),sin(psi2)*cc);
    vec4 d2=shadeDisk(r2,ph2,px*8./w2,px*2.,sI);float k2=smoothstep(0.,.06,t2);col=col*(1.-d2.a*.95*k2)+d2.rgb*1.15*k2;}
  col*=smoothstep(bc-px*1.2,bc+px*1.2,b);
  col+=vec3(1.,.78,.55)*exp(-pow((b-bc*1.01)/max(.035,px*1.1),2.))*(1.-.5*cc)*.9;
  /* image principale : visible hors de l'ombre, ou devant elle (ψ < 90°) */
  if((b>=bc||psi<PI*.5)&&b<15.){
    float r=solveR(b,cos(psi));
    float ph=atan(-(sI*cos(psi)-ci*sin(psi)*sc),sin(psi)*cc);
    float ratio=clamp(r/max(b,.3),1.,20.);
    vec4 d=shadeDisk(r,ph,px*.5333*(1.+(ratio-1.)*abs(sin(ph))),px*.5333*(1.+(ratio-1.)*abs(cos(ph))),sI);
    col=col*(1.-d.a)+d.rgb;}
  col=1.-exp(-col*1.3);col=pow(col,vec3(.95));
  col*=1.-.25*dot(p,p);
  gl_FragColor=vec4(col*L+grain(FC)*.01,1.);
}`;

  /* ================================================================ BONY — le fond officiel (par défaut)
     Charte (brandbook sept. 2024) : noir, bleu nuit #293f74, dégradé du logo #e95638 → #d34f48 → #933d78
     → #7a368b ; iconographie « levers de soleil qui font écho au dégradé ». Le LOGO n'est pas dans le
     shader : c'est le SVG officiel (version blanche), posé net par-dessus, jamais déformé ni recoloré. */
  const BONY = LIB + `
/* Esprit fonds macOS récents : grandes vagues nettes superposées, ombres douces, dégradé officiel.
   Aucun bruit, aucun grain, aucune fumée : des courbes analytiques lissées à la taille d'un pixel. */
vec3 grad(float t){t=clamp(t,0.,1.);vec3 a=vec3(.969,.337,.196),b=vec3(.914,.337,.220),c=vec3(.576,.239,.471),d=vec3(.478,.212,.545);
  return t<.2?mix(a,b,t/.2):t<.7?mix(b,c,(t-.2)/.5):mix(c,d,(t-.7)/.3);}
void main(){
  vec2 p=(FC-.5*R)/R.y;float ar=R.x/R.y,px=1.5/R.y,t=T*.045;
  /* ciel : noir profond qui remonte vers le bleu nuit #293f74 */
  vec3 col=mix(vec3(.012,.014,.03),vec3(.07,.10,.2),smoothstep(-.55,.6,p.y));
  col+=vec3(.16,.22,.45)*.22*exp(-pow(length(p-vec2(-.15,.45))*1.3,2.));
  /* cinq vagues, du fond vers l'avant */
  for(int k=0;k<5;k++){float fk=float(k);
    float y0=.02-fk*.105, A=.055+.012*fk, f=1.05+.28*fk, ph=fk*1.7;
    float y=y0+A*sin(p.x*f+t*(1.+.35*fk)+ph)+A*.45*sin(p.x*f*2.1-t*(.8+.2*fk)+ph*1.9);
    float d=p.y-y;                                   /* > 0 au-dessus de la crête */
    col*=1.-.42*exp(-max(d,0.)*16.)*step(0.,d);      /* ombre portée sur la vague de derrière */
    float tc=clamp(.12+(p.x/ar+.5)*.78+fk*.05,0.,1.);
    vec3 lc=grad(tc)*(.34+.15*fk);
    lc*=1.-clamp(-d*1.6,0.,.55);                     /* plus sombre en profondeur */
    lc+=vec3(1.,.86,.78)*exp(d*55.)*step(d,0.)*(.10+.03*fk); /* liseré de lumière sur la crête */
    col=mix(col,lc,smoothstep(px,-px,d));
  }
  col*=1.-.22*dot(p*vec2(.7,1.),p*vec2(.7,1.));
  gl_FragColor=vec4(col*L,1.);
}`;

  /* ================================================================ SOIE BONY — plis de soie, dégradé de la charte */
  const SOIE = LIB + `
void main(){vec2 uv=FC/R.y; float t=T*.06;
  vec2 q=vec2(fbm(uv*1.4+t),fbm(uv*1.4+vec2(5.2,1.3)-t));
  vec2 r=vec2(fbm(uv*1.2+2.*q+vec2(1.7,9.2)+t*1.3),fbm(uv*1.2+2.*q+vec2(8.3,2.8)-t));
  float f=fbm(uv*1.1+2.4*r);
  float fold=pow(abs(sin((f*6.+r.x*3.)*PI)),6.);
  vec3 c=mix(vec3(.04,.05,.13),vec3(.16,.25,.45),smoothstep(.2,.7,f));
  c=mix(c,vec3(.97,.34,.2),smoothstep(.45,.95,r.x)*.9);
  c=mix(c,vec3(.56,.07,.67),smoothstep(.5,1.,r.y)*.85);
  c+=fold*vec3(1.,.75,.65)*.18;
  c*=.55+.6*f;
  gl_FragColor=vec4(pow(c,vec3(.9))*L+grain(FC)*.012,1.);}`;

  /* ================================================================ ABYSSES — caustiques, rayons, bulles, bioluminescence orange */
  const ABYSSES = LIB + `
float caus(vec2 p){float c=0.;vec2 q=p;for(int n=0;n<4;n++){float fn=float(n);q+=vec2(sin(q.y*1.7+T*.6+fn),cos(q.x*1.5-T*.5+fn*1.3))*.45;c+=abs(sin(q.x*2.1)*sin(q.y*2.3));}return pow(1.-clamp(c*.25,0.,1.),6.);}
void main(){vec2 uv=FC/R.xy;vec2 p=(FC-.5*R)/R.y;float depth=1.-uv.y;
  vec3 deep=vec3(.0,.012,.03),mid=vec3(.0,.09,.14),top=vec3(.05,.34,.44);
  vec3 c=mix(deep,mid,smoothstep(1.,.35,depth));c=mix(c,top,smoothstep(.35,0.,depth));
  vec2 sun=vec2(.18,1.25);vec2 d=p-sun;float ang=atan(d.x,-d.y);
  float rays=fbm(vec2(ang*7.,T*.08))*.7+fbm(vec2(ang*19.,T*.13))*.5;rays=pow(clamp(rays,0.,1.),3.);
  c+=vec3(.35,.8,.85)*rays*smoothstep(1.,0.,depth*1.25)*.55*smoothstep(.95,.2,abs(ang));
  float snell=exp(-pow(length((p-vec2(.18,.62))*vec2(1.,2.4))*2.2,2.));c+=vec3(.6,.95,1.)*snell*(.55+.45*caus(p*6.+T*.2))*.6;
  float sy=-.34+.035*sin(p.x*3.+1.)+.02*n2(vec2(p.x*9.,0.));
  if(p.y<sy){float z=clamp((sy-p.y)*3.,0.,1.);vec3 sand=mix(vec3(.08,.16,.18),vec3(.02,.05,.07),z);
    sand+=vec3(.3,.7,.75)*caus(vec2(p.x*5.,p.y*14.)+T*.1)*.35*(1.-z);c=mix(c,sand,smoothstep(0.,.01,sy-p.y));}
  c=mix(c,deep,smoothstep(.55,1.,depth)*.55);
  for(int k=0;k<3;k++){float fk=float(k);vec2 g=vec2(p.x*(8.+fk*5.),p.y*(8.+fk*5.)-T*(.3+fk*.22));vec2 id=floor(g),f=fract(g)-.5;float h=h21(id+fk*9.);
    if(h>.94){vec2 o=(h22(id)-.5)*.5;o.x+=sin(T*1.5+h*30.)*.12;float dd=length(f-o);float r=.05+.07*h;
      c+=vec3(.7,.95,1.)*((smoothstep(r,r-.015,dd)-smoothstep(r-.02,r-.04,dd))*.55+smoothstep(r*.5,0.,length(f-o-vec2(-.02,.02)))*.25)*(1.-fk*.25)*(1.-depth*.6);}}
  vec2 gs=p*vec2(22.,22.);gs+=vec2(sin(T*.2)*.5,T*.15);vec2 si=floor(gs);float hs=h21(si);if(hs>.95)c+=vec3(.55,.7,.75)*smoothstep(.09,0.,length(fract(gs)-.5-(h22(si)-.5)*.6))*.35;
  vec2 gb=p*9.;gb+=vec2(T*.05,sin(T*.3)*.2);vec2 bi=floor(gb);float hb=h21(bi+3.);
  if(hb>.972){float pul=.5+.5*sin(T*2.+hb*80.);c+=vec3(1.,.45,.14)*(smoothstep(.1,0.,length(fract(gb)-.5-(h22(bi)-.5)*.6))*1.2+smoothstep(.35,0.,length(fract(gb)-.5))*.08)*pul*smoothstep(.3,.9,depth);}
  gl_FragColor=vec4(tone(c*1.15)*L+grain(FC)*.018,1.);}`;

  /* ================================================================ MATRICE — pluie de glyphes */
  const MATRICE = LIB + `
float glyph(vec2 f,float s){vec2 g=floor(f*vec2(5.,7.));if(g.x<0.||g.y<0.||g.x>4.||g.y>6.)return 0.;return step(.5,h21(g+s*13.7));}
void main(){vec2 px=FC;float cs=16.*R.y/900.;vec2 cell=floor(px/cs);vec2 f=fract(px/cs);
  float col=cell.x;float sp=4.+h11(col*.73)*9.;float off=h11(col*1.37)*300.;
  float head=fract((T*sp+off)/60.)*(R.y/cs+30.);float y=R.y/cs-cell.y;
  float d=head-y;float tr=16.+h11(col*3.1)*24.;
  float b=d>0.&&d<tr?pow(1.-d/tr,1.6):0.;
  float s=floor(h21(cell)*20.+T*(d<1.?20.:1.5+h21(cell+1.)*3.));
  float g=glyph((f-.1)/.8,s+cell.y*3.1);
  vec3 c=vec3(.1,1.,.35)*g*b*1.1;
  c+=vec3(.85,1.,.9)*g*smoothstep(1.,0.,abs(d))*1.6;
  c+=vec3(0.,.12,.05)*.25;
  gl_FragColor=vec4(tone(c)*L,1.);}`;

  /* ================================================================ OBSERVATOIRE — ciel qui tourne autour du pôle, Voie lactée,
     silhouette du puy de Dôme et de sa coupole */
  const OBSERVATOIRE = LIB + `
float ridge(float x){return .17+.06*sin(x*2.1+1.)+.035*sin(x*5.3)+.02*n2(vec2(x*8.,0.))+.11*exp(-pow((x-.62)*7.,2.));}
void main(){vec2 uv=FC/R.xy;vec2 p=(FC-vec2(.62*R.x,.98*R.y))/R.y;
  float r=length(p);float a=atan(p.y,p.x);float w=T*.012;
  vec3 c=mix(vec3(.01,.012,.04),vec3(.07,.05,.16),smoothstep(.55,.1,uv.y));
  c+=vec3(.55,.2,.35)*pow(smoothstep(.4,.0,uv.y),3.)*.35;
  vec2 mw=vec2(a+w,r);float band=exp(-pow((sin(a+w-.6)*r-.25)*3.2,2.));
  c+=(vec3(.4,.35,.55)*fbm(vec2(a+w,r)*vec2(3.,6.))*band)*.45;
  for(int k=0;k<3;k++){float fk=float(k);float rb=r*(90.+fk*70.);float id=floor(rb);float h=h11(id+fk*31.);
    float ang=a+w+h*6.2832;float seg=floor(ang*(8.+fk*6.)/6.2832);float h2=h21(vec2(id,seg)+fk);
    if(h2>.72){float fa=fract(ang*(8.+fk*6.)/6.2832);float trail=.06+.1*h2;float head=.5;
      float along=smoothstep(head-trail,head,fa)*step(fa,head);float dr=abs(fract(rb)-.5);
      vec3 sc=mix(vec3(.7,.8,1.),vec3(1.,.75,.5),h);
      c+=sc*along*along*smoothstep(.22,0.,dr)*(.5+.5*h2)*(1.-fk*.3)*.9;}}
  float x=uv.x*R.x/R.y;float hy=ridge(x*.55);
  float dome=smoothstep(.013,.0,length(vec2((uv.x-.605)*R.x/R.y*1.,uv.y-hy-.02))-.03)*step(hy,uv.y);
  float mountain=step(uv.y,hy);
  c=mix(c,vec3(.02,.015,.04),mountain);
  c=mix(c,vec3(.03,.02,.05),dome);
  c+=vec3(1.,.4,.15)*smoothstep(.01,.0,abs(uv.y-hy+.001))*.08*mountain;
  float town=step(uv.y,hy*.35)*step(.992,h21(floor(FC/3.)));c+=vec3(1.,.6,.3)*town*.6;
  gl_FragColor=vec4(tone(c*1.3)*L+grain(FC)*.015,1.);}`;

  /* ================================================================ AURORE — rideaux boréaux, reflet dans le lac */
  const AURORE = LIB + `
vec3 aur(vec2 p,float fade){vec3 c=vec3(0.);
  for(int k=0;k<4;k++){float fk=float(k);float x=p.x*(1.1+fk*.18)+fk*2.3;
    float base=.46+fk*.05+fbm(vec2(x*.9+T*.02,fk*3.))*.22-.1;
    float y=p.y-base;if(y<-.02)continue;
    float fold=fbm(vec2(x*2.3-T*.04,fk));float xs=x+fold*.35;
    float stri=pow(n2(vec2(xs*55.,T*.35+fk*7.)),2.)*.7+pow(n2(vec2(xs*140.,T*.6)),3.)*.5+.15;
    float edge=smoothstep(-.02,.005,y);float h=exp(-y*(5.5-fk*.6));float wave=.6+.4*sin(xs*6.+T*.3+fk);
    vec3 cc=mix(vec3(.2,1.,.55),vec3(.55,.08,.72),smoothstep(.04,.3,y));cc=mix(cc,vec3(.95,.3,.35),smoothstep(.28,.5,y)*.4);
    c+=cc*edge*h*stri*wave*(.95-fk*.15);}
  return c*fade;}
void main(){vec2 uv=FC/R.xy;vec2 p=(FC-.5*R)/R.y;float horizon=.3;
  vec3 c=mix(vec3(.004,.008,.025),vec3(.02,.04,.08),smoothstep(1.,.2,uv.y));
  float sx=floor(FC.x/2.)*2.,sy2=floor(FC.y/2.)*2.;float hs=h21(vec2(sx,sy2)*.37);float st=step(.9975,hs)*(.6+.4*sin(T*1.3+hs*50.));
  if(uv.y>horizon){c+=aur(vec2(p.x,uv.y),1.)*.85+vec3(st)*.8;}
  else{float rip=sin(uv.y*170.+T*1.2+p.x*6.)*.003;c+=aur(vec2(p.x+rip,2.*horizon-uv.y),.4*smoothstep(0.,horizon,uv.y))*.8;c+=vec3(st)*.2*step(.7,uv.y/horizon);}
  float m=horizon+.035+.045*sin(p.x*2.2+.5)+.03*sin(p.x*5.3)+.012*n2(vec2(p.x*20.,0.));
  float mt=step(uv.y,m)*step(horizon,uv.y);c=mix(c,vec3(.0,.004,.012),mt);
  c+=vec3(.2,.9,.5)*.03*smoothstep(.01,0.,abs(uv.y-horizon));
  gl_FragColor=vec4(tone(c*1.25)*L+grain(FC)*.014,1.);}`;

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
  W.catalog = [
    { id: 'bony', name: 'Bony', note: 'Logo et dégradé officiels, lever de soleil', frag: BONY, scale: .85, taa: false, logo: 'logo-bony-white.svg', tint: '#1a1030', hero: true },
    { id: 'gargantua', name: 'Gargantua', note: 'Trou noir, nébuleuse, amas d’étoiles et supernovae', frag: GARGANTUA, passes: [{ frag: GARG_NEB, scale: .33, every: 3, u: 'S' }, { frag: GARG_STARS, scale: 1, every: 3, u: 'S2' }], scale: .75, dprMax: 1, taa: false, tint: '#2a1233', hero: true },
    { id: 'soie', name: 'Soie Bony', note: 'Plis de soie aux couleurs de la charte', frag: SOIE, scale: .6, tint: '#2a1530' },
    { id: 'abysses', name: 'Abysses', note: 'Caustiques, rayons et bioluminescence', frag: ABYSSES, scale: .7, tint: '#0c2230' },
    { id: 'observatoire', name: 'Observatoire', note: 'Filé d’étoiles au-dessus du puy de Dôme', frag: OBSERVATOIRE, scale: .8, tint: '#171230' },
    { id: 'aurore', name: 'Aurore', note: 'Rideaux boréaux et reflet dans le lac', frag: AURORE, scale: .7, tint: '#0f1f2a' },
    { id: 'magma', name: 'Magma', note: 'Lampe à lave, clin d’œil aux volcans', frag: MAGMA, scale: .6, tint: '#2a1420' },
    { id: 'retro', name: 'Rétro', note: 'Synthwave, soleil rayé Bony', frag: RETRO, scale: .85, tint: '#2a1030' },
    { id: 'matrice', name: 'Matrice', note: 'Pluie de glyphes', frag: MATRICE, scale: 1, taa: false, tint: '#0a1a10' },
  ];
  W.ids = W.catalog.map((w) => w.id);
  W.is = (id) => W.ids.includes(id);
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

  let cur = null; // { id, canvas, gl, info, raf, scale, ... }
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', (e) => { mouse.tx = (e.clientX / innerWidth - .5) * 2; mouse.ty = (e.clientY / innerHeight - .5) * -2; }, { passive: true });
  const t0 = performance.now() - (Math.random() * 60000);
  const lum = () => (document.documentElement.dataset.theme === 'light' ? .82 : 1);
  W.status = () => (cur ? { id: cur.id, scale: cur.scale, paused: cur.paused, reason: cur.reason, fps: cur.fps } : null);

  function covered() {
    if (document.hidden) return 'onglet masqué';
    if (document.documentElement.dataset.effects === 'eco') return 'mode économe';
    const vis = GX.wm?.visible?.() || [];
    if (vis.some((w) => w.state === 'max' || w.state === 'full' || (w.state === 'snap' && w.zone === 'max'))) return 'bureau recouvert';
    const area = vis.reduce((s, w) => s + (w.rect ? w.rect.w * w.rect.h : 0), 0);
    if (area > innerWidth * innerHeight * .92) return 'bureau recouvert';
    return null;
  }

  W.mount = (host, id) => {
    W.unmount();
    const def = W.get(id); if (!def || !host) return false;
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
  W.unmount = () => { if (!cur) return; cancelAnimationFrame(cur.raf); cur.logoEl?.remove(); const c = cur.canvas; cur.gl.getExtension('WEBGL_lose_context')?.loseContext(); c.remove(); cur = null; };
  function resize() {
    if (!cur) return;
    const k = cur.scale * Math.min(devicePixelRatio || 1, cur.def.dprMax || 1.5);
    cur.canvas.width = Math.max(2, Math.round(innerWidth * k)); cur.canvas.height = Math.max(2, Math.round(innerHeight * k)); cur.hist = null;
  }
  addEventListener('resize', () => { resize(); if (cur) frame(performance.now(), true); });
  const BUDGET = 1000 / 30;
  function frame(now, force) {
    if (!cur) return;
    if (!force) cur.raf = requestAnimationFrame(frame);
    const reason = covered();
    if (cur.frozen) return; // figé pour de bon (machine trop lente) : on ne relance jamais en boucle
    if (reason && !force) { if (!cur.paused) { cur.paused = true; cur.reason = reason; } return; }
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
  GX.on?.('wm:change', () => { if (cur && cur.paused && !cur.frozen && !covered()) { cur.paused = false; cancelAnimationFrame(cur.raf); cur.raf = requestAnimationFrame(frame); } });
  document.addEventListener('visibilitychange', () => { if (cur && !cur.frozen && !document.hidden) { cancelAnimationFrame(cur.raf); cur.raf = requestAnimationFrame(frame); } });

  /* ------------------------------------------------ aperçus (vignettes des réglages, écran verrouillé) :
     chaque shader rendu une fois en petit, posé comme image de fond de la classe .wp-<id> */
  const LOGO = new Image(); LOGO.src = 'logo-bony-white.svg';
  W.previews = () => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 200;
    const gl = c.getContext('webgl', { preserveDrawingBuffer: true, antialias: false }); if (!gl) return;
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    let rules = ''; const store = {};
    const todo = [...W.catalog];
    const step = () => {
      const d = todo.shift(); if (!d) { gl.getExtension('WEBGL_lose_context')?.loseContext(); return; }
      const info = program(gl, d.frag);
      if (info && d.passes) drawPre(gl, d, store, 320, 200, d.id === 'gargantua' ? 20 : 12, 0, 0, true);
      if (info) { draw(gl, info, 320, 200, d.id === 'gargantua' ? 20 : 12, 0, 0, 1); let url = c.toDataURL('image/jpeg', .82);
        if (d.logo && LOGO.complete && LOGO.naturalWidth !== 0) { const c2 = document.createElement('canvas'); c2.width = 320; c2.height = 200; const x = c2.getContext('2d'); x.drawImage(c, 0, 0); const lw = 120, lh = lw * 67.67 / 239.62; x.drawImage(LOGO, (320 - lw) / 2, 200 * .44 - lh / 2, lw, lh); url = c2.toDataURL('image/jpeg', .85); } rules += `.wp-${d.id}{background:#000 url(${url}) center/cover}`; }
      const st = document.getElementById('wp-previews') || Object.assign(document.createElement('style'), { id: 'wp-previews' });
      st.textContent = rules; document.head.append(st);
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
