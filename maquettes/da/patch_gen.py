import re
p = 'gen.py'; s = open(p, encoding='utf-8').read()

# 1) icônes iOS exportées de la maquette
s = s.replace("def tile(t, app, s=46, active=False):\n    g = G[app]",
"""_IC = json.load(open(os.path.join(os.path.dirname(__file__), 'icons.json'), encoding='utf-8'))
ICON_CSS = _IC['css']
def tile(t, app, s=46, active=False):
    return _IC['icons'].get(app, _IC['icons']['launchpad']).replace('--s:100px', f'--s:{s}px')
def _old_tile(t, app, s=46, active=False):
    g = G[app]""", 1)
# 2) CSS des icônes + accent dans chaque artboard
s = s.replace("def css(t):\n    return f'''body{{margin:0;", "def css(t):\n    return ICON_CSS + f'''\\n:root{{--accent:{t['acc']}}}\\nbody{{margin:0;", 1)
# 3) variante d'icônes par direction
s = s.replace("tile='mono', card_extra=''", "tile='mono', ic='dark', card_extra=''")
s = s.replace("tile='color', card_extra=", "tile='color', ic='light', card_extra=")
s = s.replace("tile='line', card_extra=''", "tile='line', ic='tinted', card_extra=''")
s = s.replace('<div style="position:relative;width:{W}px;height:{H}px;overflow:hidden;background:{t["wall"]}">',
              '<div data-icons="{t["ic"]}" style="position:relative;width:{W}px;height:{H}px;overflow:hidden;background:{t["wall"]}">')
s = s.replace('<div style="position:relative;width:{W}px;height:{H}px;overflow:hidden;background:{t["wall"]};border-radius:44px',
              '<div data-icons="{t["ic"]}" style="position:relative;width:{W}px;height:{H}px;overflow:hidden;background:{t["wall"]};border-radius:44px')
s = s.replace('cols += f\'\'\'<section style="background:{t["bg"]};', 'cols += f\'\'\'<section data-icons="{t["ic"]}" style="--accent:{t["acc"]};background:{t["bg"]};')
s = s.replace("<div class=\"lbl\" style=\"margin-bottom:10px\">Icônes · ADN levier en H</div>", "<div class=\"lbl\" style=\"margin-bottom:10px\">Icônes · variante {({'dark':'Sombre','light':'Claire','tinted':'Teintée'})[t['ic']]}</div>")

# 4) ressorts sous-amortis, calculés comme dans la maquette (core.js)
spring_py = '''
def spring(stiffness, damping, mass=1):
    dt = 1/240; x = v = t = 0.0; pts = []
    while t < 3:
        a = (-stiffness*(x-1) - damping*v)/mass; v += a*dt; x += v*dt; t += dt; pts.append((t, x))
        if t > .08 and abs(1-x) < .0006 and abs(v) < .012: break
    step = max(1, len(pts)//44); out = ['0']
    for i in range(step, len(pts), step): out.append(f"{pts[i][1]:.4f} {pts[i][0]/t*100:.1f}%")
    out.append('1'); return 'linear(' + ', '.join(out) + ')', round(t*1000)
SNAP, SNAP_MS = spring(420, 26); SOFT, SOFT_MS = spring(200, 19); BOUNCE, BOUNCE_MS = spring(360, 14); WIN, WIN_MS = spring(380, 29)
'''
s = s.replace("def motion():", spring_py + "\ndef motion():", 1)
s = s.replace(":root{{--snap:linear(0,.18 6%,.55 14%,.83 23%,.96 32%,1.01 42%,1.012 52%,1.003 66%,1);--soft:linear(0,.09 6%,.31 14%,.58 24%,.79 34%,.92 45%,.98 56%,1.005 70%,1);--out:cubic-bezier(.22,1,.36,1)}}",
              ":root{{--snap:{SNAP};--soft:{SOFT};--bounce:{BOUNCE};--win:{WIN};--out:cubic-bezier(.22,1,.36,1)}}")
s = s.replace("transform-origin:50% 100%;transition:transform 420ms var(--snap),opacity 180ms var(--out)}}", "transform-origin:50% 100%;transition:transform {WIN_MS}ms var(--win),opacity 180ms var(--out)}}")
s = s.replace(".pane{{position:absolute;inset:0;padding:18px;transition:transform 380ms var(--snap)", ".pane{{position:absolute;inset:0;padding:18px;transition:transform {SNAP_MS}ms var(--snap)")
s = s.replace("transform:translateY(105%);transition:transform 440ms var(--snap)}}", "transform:translateY(105%);transition:transform {SNAP_MS}ms var(--snap)}}")
s = s.replace("transition:transform 440ms var(--snap),filter 440ms}}", "transition:transform {SNAP_MS}ms var(--snap),filter 440ms}}")
s = s.replace("transform:translateX(120%);transition:transform 460ms var(--snap)}}", "transform:translateX(120%);transition:transform {SNAP_MS}ms var(--snap)}}")
s = s.replace(".press{{transition:transform 120ms var(--out)}}.press:active{{transform:scale(.94)}}",
              ".press{{transition:transform {BOUNCE_MS}ms var(--bounce)}}.press:active{{transform:scale(.92);transition:transform 90ms cubic-bezier(.3,0,.5,1)}}\n.rubber{{position:absolute;left:50%;top:50%;width:170px;height:84px;margin:-42px 0 0 -85px;border-radius:18px;background:linear-gradient(135deg,#f75632,#8f12ab);display:grid;place-items:center;color:#fff;font-weight:800;cursor:grab;touch-action:none;user-select:none;box-shadow:0 20px 40px -18px rgba(247,86,50,.8)}}\n.rubber.back{{transition:transform {BOUNCE_MS}ms var(--bounce)}}")
s = s.replace("border-radius:9px;background:linear-gradient(135deg,#f75632,#8f12ab);transition:transform 380ms var(--snap)}}", "border-radius:9px;background:linear-gradient(135deg,#f75632,#8f12ab);transition:transform {BOUNCE_MS}ms var(--bounce)}}")
s = s.replace("Ici, tout est <b>transform + opacity</b>, animé par de vrais ressorts (courbes linear()), interruptible à tout moment.",
              "Ici, tout est <b>transform + opacity</b>, animé par de vrais ressorts <b>sous-amortis</b> : chaque mouvement dépasse légèrement sa cible puis se pose, comme chez Apple. Interruptible à tout moment.")
s = s.replace("Ouverture : ressort vif 420 ms depuis l’icône · fermeture : accélération 300 ms vers le Dock. Aucune largeur animée.",
              "Ouverture : ressort « fenêtre » (≈ 3 % de dépassement) depuis l’icône · fermeture : accélération 300 ms vers le Dock. Aucune largeur animée.")
s = s.replace("Le détail glisse (ressort 380 ms) pendant que la liste recule de 26 % et s’assombrit : la profondeur se lit, rien ne clignote.",
              "Le détail glisse en ressort vif (≈ 8 % de dépassement, il « arrive » et se cale) pendant que la liste recule de 26 %.")
# 5) rangée 2 : notification · segmenté · élastique · barème
s = s.replace('<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px">\n<section style="display:grid;gap:10px"><div class="row"><b>4 · Notification</b>',
              '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px">\n<section style="display:grid;gap:10px"><div class="row"><b>4 · Notification</b>')
s = s.replace('<section style="display:grid;gap:10px"><b>Barème</b>',
              '<section style="display:grid;gap:10px"><b>6 · Élastique — tirez la carte</b><div class="stage" style="height:140px"><div class="{{{{rubberClass}}}}" style="transform:translateX({{{{rubberX}}}}px)" onPointerDown="{{{{rDown}}}}" onPointerMove="{{{{rMove}}}}" onPointerUp="{{{{rUp}}}}" onPointerCancel="{{{{rUp}}}}">Tirez-moi</div></div></section>\n<section style="display:grid;gap:10px"><b>Barème</b>')
s = s.replace('<div class="row"><span style="flex-grow:1">Appui (bouton, icône)</span><b class="num">120 ms · échelle 0,94</b></div>',
              '<div class="row"><span style="flex-grow:1">Appui → relâchement</span><b class="num">90 ms → rebond</b></div>')
s = s.replace('<div class="row"><span style="flex-grow:1">Fenêtre, feuille, pile</span><b class="num">ressort vif 380–440 ms</b></div>',
              '<div class="row"><span style="flex-grow:1">Feuille, pile, notif.</span><b class="num">ζ 0,63 · +8 %</b></div><div class="row"><span style="flex-grow:1">Fenêtre</span><b class="num">ζ 0,74 · +3 %</b></div>')
s = s.replace("constructor(props) {{ super(props); this.state = {{ win: true, detail: false, sheet: false, toast: false, seg: 0 }}; }}",
              "constructor(props) {{ super(props); this.state = {{ win: true, detail: false, sheet: false, toast: false, seg: 0, rx: 0, drag: false }}; }}")
s = s.replace("      segX: s.seg * 92,", """      rubberClass: s.drag ? 'rubber' : 'rubber back', rubberX: s.rx,
      rDown: (e) => {{ e.currentTarget.setPointerCapture(e.pointerId); this._sx = e.clientX; this.setState({{ drag: true }}); }},
      rMove: (e) => {{ if (!this.state.drag) return; const d = e.clientX - this._sx; this.setState({{ rx: Math.sign(d) * Math.pow(Math.abs(d), .82) }}); }},
      rUp: () => this.setState({{ drag: false, rx: 0 }}),
      segX: s.seg * 92,""")
s = s.replace("'Mouvement.dc.html': motion()}", "'Mouvement.dc.html': motion(), 'Icones.dc.html': icones()}")

# 6) planche d'icônes
icones = '''
def icones():
    W, H = 1440, 640
    ids = ['launchpad', 'dashboard', 'projects', 'todo', 'digital', 'campaigns', 'chat', 'hello', 'agenda', 'budget', 'fixed', 'material', 'conges', 'export', 'games', 'archives', 'settings']
    nm = dict(NAMES, export='Export', archives='Archives')
    rows = ''
    for ic, lab, sub, bg in (('light', 'Claire', 'par défaut · Nocturne', '#0a0e1f'), ('dark', 'Sombre', 'suggérée avec Carbone', '#0c0c0e'), ('tinted', 'Teintée', 'suggérée avec Signal · suit l’accent', '#08080a')):
        cells = ''.join(f'<div style="display:grid;justify-items:center;gap:7px;width:64px">{tile(None, a, 60)}<span style="font-size:11px;color:#b4b2c0;white-space:nowrap">{nm.get(a, a)}</span></div>' for a in ids)
        rows += f'<div data-icons="{ic}" style="--accent:#f75632;display:flex;align-items:center;gap:22px;padding:18px 24px;border-radius:22px;background:{bg};box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)"><div style="width:150px;flex:none"><div class="ttl" style="font-size:14px;letter-spacing:.08em">{lab}</div><div style="font-size:12px;color:#8a879a;margin-top:4px">{sub}</div></div><div style="display:flex;gap:12px;flex-wrap:nowrap">{cells}</div></div>'
    return f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Icônes façon iOS</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
{FONTS}
<style>
{css(T["B"])}
</style>
</helmet>
<div style="width:{W}px;height:{H}px;box-sizing:border-box;padding:40px 44px;background:#060608;color:#f3f3f7;display:flex;flex-direction:column;gap:16px">
<div class="row" style="align-items:flex-end"><div><div class="lbl" style="color:#f75632">Nouveau pack</div><div class="ttl" style="font-size:24px;margin-top:6px;letter-spacing:.04em">Icônes façon iOS</div></div><div style="margin-left:auto;max-width:620px;font-size:13.5px;color:#b4b2c0;line-height:1.6">Tuile au bord continu (squircle), dégradé vertical plus clair en haut, pictogramme <b>plein</b> en deux tons. Trois apparences comme iOS 18, au choix dans Réglages. Signatures : l’Agenda affiche la date du jour, la To-do est une fiche à pastilles, les Dépenses un portefeuille.</div></div>
{rows}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{W},"height":{H}}}}}'>
class Component extends DCLogic {{
  renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
"""
'''
s = s.replace("files = {'Main.dc.html'", icones + "\nfiles = {'Main.dc.html'", 1)
# 7) index : nouvelle planche + notes conservées (on repart de la version publiée)
s = s.replace(" 'Mouvement.dc.html': dict(x=1520, y=2510, w=1440, h=900, title='Mouvement — banc d’essai', is_interactive=True),\n}",
              " 'Mouvement.dc.html': dict(x=1520, y=2510, w=1440, h=900, title='Mouvement — banc d’essai', is_interactive=True),\n 'Icones.dc.html': dict(x=3040, y=2510, w=1440, h=640, title='Icônes façon iOS'),\n}")
s = s.replace("'t3': dict(x=0, y=2250, text='Fondations et mouvement', kind='title1', maxW=2960)", "'t3': dict(x=0, y=2250, text='Fondations, mouvement et icônes', kind='title1', maxW=4480)")
open(p, 'w', encoding='utf-8').write(s)
print('patched')
