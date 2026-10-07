// =====================================================================
// FORMS BONY — intégration dans un autre site (07/10/2026).
// Une balise à coller : <script src="https://forms…/embed.js" data-form="<publicId>" async></script>
// Le script pose une iframe JUSTE APRÈS la balise, et c'est tout : il ne lit ni n'écrit rien dans le KV.
//  - hauteur : la page intégrée (`?embed=1`) annonce sa hauteur (`bonyform:height`), l'iframe la suit — pas de
//    barre de défilement dans la page hôte ;
//  - défilement : l'iframe n'a pas de défilement propre, la page intégrée demande à l'hôte de remonter jusqu'à elle
//    (`bonyform:scroll`) au changement d'écran, sur une erreur, à l'écran de fin ;
//  - redirection de fin : faite par l'HÔTE (`bonyform:redirect`), sinon elle s'ouvrirait dans l'iframe ;
//  - sources : `data-params` (UTM choisis dans Gearbox › Partager) + les UTM / gclid / fbclid de la page hôte, qui
//    l'emportent (le visiteur arrivé par une pub Facebook sur le site reste compté « Facebook »).
// Options : data-bg="transparent" (fond du site hôte), data-height (hauteur avant chargement, 600 px).
// Messages acceptés SEULEMENT de l'origine du Worker ET de l'iframe qui les émet.
// =====================================================================
export const embedJs = (origin: string) => `(function(){
var O=${JSON.stringify(origin)},W=window;
function init(s){
  if(s.__bf)return;s.__bf=1;
  var id=s.getAttribute('data-form')||'';if(!/^[a-z0-9]{10}$/.test(id))return;
  var q=new URLSearchParams(s.getAttribute('data-params')||'');
  try{new URLSearchParams(location.search).forEach(function(v,k){if(/^(utm_[a-z]+|gclid|fbclid)$/.test(k))q.set(k,v);});}catch(e){}
  q.set('embed','1');if(s.getAttribute('data-bg')==='transparent')q.set('bg','transparent');
  var f=document.createElement('iframe');
  f.src=O+'/'+id+'?'+q.toString();
  f.title=s.getAttribute('data-title')||'Formulaire Bony auto-mobile';
  f.setAttribute('allow','clipboard-write');
  f.style.cssText='display:block;width:100%;max-width:100%;border:0;background:transparent;color-scheme:normal;height:'+(parseInt(s.getAttribute('data-height')||'',10)||600)+'px';
  s.parentNode.insertBefore(f,s.nextSibling);
}
function all(){var l=document.querySelectorAll('script[data-form]');for(var i=0;i<l.length;i++){var x=l[i].getAttribute('src')||'';if(x.indexOf(O+'/embed.js')===0)init(l[i]);}}
if(!W.__bonyFormsEmbed){
  W.__bonyFormsEmbed=1;
  W.addEventListener('message',function(e){
    if(e.origin!==O||!e.data||typeof e.data!=='object')return;
    var fs=document.querySelectorAll('iframe'),f=null;
    for(var i=0;i<fs.length;i++)if(fs[i].contentWindow===e.source){f=fs[i];break;}
    if(!f)return;var d=e.data;
    if(d.type==='bonyform:height'&&d.h>0)f.style.height=Math.min(Math.ceil(d.h),30000)+'px';
    else if(d.type==='bonyform:scroll'){var t=f.getBoundingClientRect().top+(+d.y||0);if(t<0||t>W.innerHeight*0.75)W.scrollBy({top:t-16,behavior:'smooth'});}
    else if(d.type==='bonyform:redirect'){try{var u=new URL(d.url);if(u.protocol==='https:'||u.protocol==='http:')location.href=u.href;}catch(e){}}
  });
}
if(document.currentScript)init(document.currentScript);
all();if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',all);
})();`;
