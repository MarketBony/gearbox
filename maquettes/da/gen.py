# Génère les artboards .dc.html de la toile « Gearbox OS — Direction artistique »
import json, re, os, datetime
OUT = os.path.join(os.path.dirname(__file__), 'project')
FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Albert+Sans:wght@400;500;600;700;800&amp;family=Syncopate:wght@400;700&amp;display=swap" rel="stylesheet">'

def K(x, y, r=2):
    return f'<circle class="k" cx="{x}" cy="{y}" r="{r}"></circle>'
G = {
 'dashboard': f'<path d="M4.5 16.5a7.5 7.5 0 0 1 15 0"></path><path d="M12 16.5 15.8 11"></path>{K(12,16.5,2.3)}',
 'projects': f'<path d="M5 7h8.5M8 12h10.5M5 17h6.5"></path>{K(13.5,7)}{K(18.5,12)}{K(11.5,17)}',
 'todo': f'<path d="M5 12.5l4 4L18.5 7"></path>{K(18.5,7,2.1)}',
 'digital': f'<path d="M8.6 9.4a4.8 4.8 0 0 0 0 7.2M15.4 9.4a4.8 4.8 0 0 1 0 7.2"></path><path d="M5.6 6.6a8.8 8.8 0 0 0 0 12.8M18.4 6.6a8.8 8.8 0 0 1 0 12.8" opacity=".6"></path>{K(12,13,2.3)}',
 'campaigns': f'<path d="M5.5 10v4h3l7 4.5v-13L8.5 10z"></path><path d="M18.6 9.5a3.8 3.8 0 0 1 0 5"></path>{K(5.5,12,1.6)}',
 'chat': f'<path d="M20 11.5a7.5 7 0 0 1-11 6.2L4.5 19l1.2-3.8A7 7 0 1 1 20 11.5z"></path>{K(8.8,11.5,1.25)}{K(12.3,11.5,1.25)}{K(15.8,11.5,1.25)}',
 'hello': f'<path d="M12 3.8v2.6M12 17.6v2.6M3.8 12h2.6M17.6 12h2.6M6.2 6.2 8 8M16 16l1.8 1.8M17.8 6.2 16 8M8 16l-1.8 1.8"></path>{K(12,12,3)}',
 'agenda': f'<rect x="4.8" y="6" width="14.4" height="14" rx="2.8"></rect><path d="M4.8 10.5h14.4M9 3.8v3.4M15 3.8v3.4"></path>{K(9,3.8,1.5)}{K(15,3.8,1.5)}{K(14.6,15.2,1.7)}',
 'budget': f'<path d="M12 4a8 8 0 1 0 8 8h-8z"></path><path d="M15 3.6A8 8 0 0 1 20.4 9H15z" opacity=".6"></path>{K(12,12,1.9)}',
 'fixed': f'<path d="M7 3.5h10v17l-2.5-1.6-2.5 1.6-2.5-1.6L7 20.5z"></path><path d="M9.6 8h4.8M9.6 11.5h4.8"></path>{K(9.6,15.3,1.5)}',
 'material': f'<path d="M12 3.6l7.4 4.2v8.4L12 20.4l-7.4-4.2V7.8z"></path><path d="M4.6 7.8 12 12l7.4-4.2M12 12v8.4"></path>{K(12,12,1.9)}',
 'conges': f'<path d="M4 15h16M7.5 15a4.5 4.5 0 0 1 9 0M12 6.3V8M6.3 9l1.1 1.1M17.7 9l-1.1 1.1M6.5 18.6h4M13.5 18.6h4"></path>{K(12,15,1.6)}',
 'games': f'<path d="M7.6 8h8.8a4.5 4.5 0 0 1 4.3 5.8l-1 3.2a2.3 2.3 0 0 1-3.9.9L14 16h-4l-1.8 1.9a2.3 2.3 0 0 1-3.9-.9l-1-3.2A4.5 4.5 0 0 1 7.6 8z"></path><path d="M8 10.8v3.4M6.3 12.5h3.4"></path>{K(15.4,11.4,1.25)}{K(17.4,13.4,1.25)}',
 'settings': f'<path d="M6 5v14M12 5v14M18 5v7M6 12h12"></path>{K(6,5,1.7)}{K(12,5,1.7)}{K(18,5,1.7)}{K(6,19,1.7)}{K(12,19,1.7)}{K(18,12,2.6)}',
 'launchpad': ''.join(K(x, y, 2.1) for y in (6, 12, 18) for x in (6, 12, 18)),
}
HUE = {'dashboard': ('#ff6a3d', '#c62f52'), 'projects': ('#a53ad0', '#5b1a9c'), 'todo': ('#23c186', '#0f7a63'), 'digital': ('#4a86ff', '#2a3f86'), 'campaigns': ('#ff9538', '#e2461f'),
       'chat': ('#36bdfc', '#1b66d6'), 'hello': ('#ff5aa0', '#a31a9e'), 'agenda': ('#ff6268', '#c2224f'), 'budget': ('#ffbd2e', '#ef6a1c'), 'fixed': ('#d9a552', '#8d5a1d'),
       'material': ('#7b93c6', '#344566'), 'conges': ('#ffd540', '#ff8a2a'), 'games': ('#ad74ff', '#5b2bd9'), 'settings': ('#a3a8b6', '#4b505d'), 'launchpad': ('#4a4458', '#1e1b26')}
DOCK = ['launchpad', 'dashboard', 'projects', 'todo', 'digital', 'campaigns', 'chat', 'hello', 'agenda', 'budget', 'fixed', 'material', 'conges', 'games', 'settings']
NAMES = {'launchpad': 'Launchpad', 'dashboard': 'Dashboard', 'projects': 'Projets', 'todo': 'To-do', 'digital': 'Digital', 'campaigns': 'Campagnes', 'chat': 'Chat', 'hello': 'Hello Marketing',
         'agenda': 'Agenda', 'budget': 'Budget', 'fixed': 'Dépenses', 'material': 'Matériel', 'conges': 'Congés', 'games': 'Jeux', 'settings': 'Réglages'}
ICON = {  # pictos d'interface
 'search': '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path>',
 'bell': '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"></path>',
 'sliders': '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"></path><circle cx="16" cy="6" r="2"></circle><circle cx="10" cy="12" r="2"></circle><circle cx="18" cy="18" r="2"></circle>',
 'pin': '<path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z"></path><circle cx="12" cy="10" r="2.5"></circle>',
 'cal': '<rect x="3" y="5" width="18" height="16" rx="3"></rect><path d="M3 10h18M8 3v4M16 3v4"></path>',
 'chev': '<path d="m6 9 6 6 6-6"></path>', 'plus': '<path d="M12 5v14M5 12h14"></path>', 'arrow': '<path d="M5 12h14M13 6l6 6-6 6"></path>',
 'up': '<path d="m6 15 6-6 6 6"></path>', 'alert': '<path d="M12 3 2 20h20z"></path><path d="M12 10v4M12 17h.01"></path>',
 'wifi': '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"></path>',
 'battery': '<rect x="2" y="7" width="18" height="10" rx="2.5"></rect><path d="M22 11v2M5 10h9v4H5z"></path>',
 'check': '<path d="m5 12 5 5 9-10"></path>', 'filter': '<path d="M4 5h16l-6 8v5l-4 2v-7z"></path>',
}
def ic(n, size=16, color='currentColor', sw=1.8):
    return f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICON[n]}</svg>'

MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
REAL = [2, 6, 8, 9, 1, 5, 36, 102, 112, 64, 33, 0]
PLAN = [53, 52, 55, 54, 53, 52, 55, 51, 54, 53, 53, 54]
KPIS = [('Budget consommé', '377 400 €', 'sur 638 100 € · 59 %', 59, None), ('Reste à engager', '260 700 €', 'disponible sur la période', None, None), ('Projets actifs', '12', 'en cours de réalisation', None, 'ok'),
        ('Campagnes programmées', '2', 'SMS / e-mail', None, None), ('Projets en retard', '2', 'échéance dépassée', None, 'bad'), ('Avance / retard', '−14 pts', 'engagé 59 % · écoulé 73 %', None, None)]
DUE = [('30', 'sept.', 'Salon VO Saint-Etienne', 'Saint-Etienne · dans 2 j', 50, 'VO'), ('4', 'oct.', 'Soirée clients Alpine A290', 'Vichy · dans 6 j', 64, 'VN'),
       ('12', 'oct.', 'Street marketing Millau', 'Millau · dans 14 j', 70, 'VN'), ('12', 'oct.', 'Essais Dacia Bigster', 'Le Puy-en-Velay · dans 14 j', 50, 'VN')]
MIX = [('VN', 163.5, 43, '#5b7fd6'), ('VO', 78.1, 21, '#f75632'), ('APV', 82.9, 22, '#a53ad0'), ('PR', 53.0, 14, '#2ccde0')]

# ---------------------------------------------------------------- les trois directions
T = {
 'A': dict(name='Carbone', tagline='Instrument de bord · graphite mat, un seul accent', bg='#0c0c0e',
     wall='radial-gradient(90% 70% at 85% 110%, rgba(247,86,50,.16), transparent 60%), radial-gradient(70% 60% at 0% 0%, rgba(255,255,255,.035), transparent 60%), #0c0c0e',
     s0='#111114', s1='#151518', s2='#1c1c20', s3='#26262b', line='rgba(255,255,255,.07)', line2='rgba(255,255,255,.12)', text='#f2f1ef', t2='#b4b2ad', t3='#7c7a75',
     acc='#f75632', acc2='#8f12ab', r=10, rw=14, glass='rgba(21,21,24,.72)', blur=28, title='Syncopate', title_ls='.14em', title_size=13, kpi_font='Albert Sans',
     bar='linear-gradient(180deg,#f75632,#f75632 60%,#c9401f)', bar_plan='rgba(255,255,255,.08)', chip_on='background:#f75632;color:#0c0c0e', ok='#57d18f', bad='#ff6a5a',
     tile='mono', ic='dark', card_extra='', focus='#f75632'),
 'B': dict(name='Nocturne', tagline='La nuit Bony · bleu nuit de la charte, lueurs orange→violet', bg='#0a0e1f',
     wall='radial-gradient(60% 55% at 12% 108%, rgba(247,86,50,.42), transparent 70%), radial-gradient(55% 60% at 92% 100%, rgba(143,18,171,.45), transparent 70%), radial-gradient(80% 60% at 60% -10%, rgba(41,63,116,.75), transparent 70%), #0a0e1f',
     s0='#0f1428', s1='#121831', s2='#19213f', s3='#232c4f', line='rgba(170,185,255,.09)', line2='rgba(170,185,255,.16)', text='#f3f4fb', t2='#b9bfdc', t3='#7e86ab',
     acc='#f75632', acc2='#b23ad6', r=14, rw=20, glass='rgba(20,26,54,.62)', blur=44, title='Syncopate', title_ls='.02em', title_size=16, kpi_font='Albert Sans',
     bar='linear-gradient(180deg,#ff7a45,#b23ad6)', bar_plan='rgba(170,185,255,.10)', chip_on='background:linear-gradient(135deg,#f75632,#8f12ab);color:#fff', ok='#5ee0a0', bad='#ff6f7a',
     tile='color', ic='light', card_extra='box-shadow:0 1px 0 rgba(255,255,255,.04) inset, 0 20px 40px -24px rgba(0,0,0,.6);', focus='#f75632'),
 'C': dict(name='Signal', tagline='Grille et traces lumineuses · l’héritage de l’écran de connexion', bg='#08080a',
     wall='linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px) 0 0/40px 40px, linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px) 0 0/40px 40px, radial-gradient(50% 50% at 20% 100%, rgba(247,86,50,.18), transparent 70%), radial-gradient(45% 50% at 95% 10%, rgba(143,18,171,.2), transparent 70%), #08080a',
     s0='#0d0d10', s1='#101013', s2='#15151a', s3='#1e1e25', line='rgba(255,255,255,.08)', line2='rgba(255,255,255,.14)', text='#ededf2', t2='#a9a9b8', t3='#6f6f80',
     acc='#ff5a2e', acc2='#b43bff', r=6, rw=8, glass='rgba(12,12,15,.78)', blur=20, title='Syncopate', title_ls='.18em', title_size=12, kpi_font='Syncopate',
     bar='linear-gradient(180deg,#ff5a2e,rgba(255,90,46,.25))', bar_plan='rgba(255,255,255,.06)', chip_on='background:transparent;color:#ff5a2e;box-shadow:inset 0 0 0 1px #ff5a2e', ok='#4ee3a0', bad='#ff5a5a',
     tile='line', ic='tinted', card_extra='', focus='#ff5a2e'),
}

_IC = json.load(open(os.path.join(os.path.dirname(__file__), 'icons.json'), encoding='utf-8'))
ICON_CSS = _IC['css']
def tile(t, app, s=46, active=False):
    return _IC['icons'].get(app, _IC['icons']['launchpad']).replace('--s:100px', f'--s:{s}px')
def _old_tile(t, app, s=46, active=False):
    g = G[app]
    if t['tile'] == 'mono':
        knob = t['acc'] if active else '#f2f1ef'
        return f'<span style="width:{s}px;height:{s}px;border-radius:{round(s*.26)}px;display:grid;place-items:center;flex:none;background:linear-gradient(160deg,#26262b,#18181b);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),inset 0 1px 0 rgba(255,255,255,.08)"><svg width="{round(s*.56)}" height="{round(s*.56)}" viewBox="0 0 24 24" fill="none" stroke="#e9e7e3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="--k:{knob}">{g.replace("class=\"k\"", f"fill=\"{knob}\" stroke=\"none\"")}</svg></span>'
    if t['tile'] == 'color':
        h1, h2 = HUE[app]
        return f'<span style="width:{s}px;height:{s}px;border-radius:{round(s*.27)}px;display:grid;place-items:center;flex:none;background:linear-gradient(155deg,{h1},{h2});box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 6px 14px -6px {h2}"><svg width="{round(s*.58)}" height="{round(s*.58)}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{g.replace("class=\"k\"", "fill=\"#fff\" stroke=\"none\"")}</svg></span>'
    col = t['acc'] if DOCK.index(app) % 2 == 0 else t['acc2']
    if active: col = t['acc']
    return f'<span style="width:{s}px;height:{s}px;border-radius:{round(s*.2)}px;display:grid;place-items:center;flex:none;background:#0d0d10;box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)"><svg width="{round(s*.58)}" height="{round(s*.58)}" viewBox="0 0 24 24" fill="none" stroke="{col}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="filter:drop-shadow(0 0 5px {col})">{g.replace("class=\"k\"", f"fill=\"{col}\" stroke=\"none\"")}</svg></span>'

def css(t):
    return ICON_CSS + f'''\n:root{{--accent:{t['acc']}}}\nbody{{margin:0;font-family:"Albert Sans",system-ui,sans-serif;background:{t['bg']};color:{t['text']};-webkit-font-smoothing:antialiased}}
a{{color:{t['acc']}}}a:hover{{color:{t['text']}}}
.ttl{{font-family:"{t['title']}",sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:{t['title_ls']};font-size:{t['title_size']}px}}
.lbl{{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:{t['t3']}}}
.num{{font-variant-numeric:tabular-nums}}
.card{{background:{t['s2']};border-radius:{t['r']+2}px;box-shadow:inset 0 0 0 1px {t['line']};{t['card_extra']}}}
.chip{{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border-radius:{min(99, t['r']+4)}px;font:600 12.5px "Albert Sans";color:{t['t2']};background:{t['s3']};border:0;box-shadow:inset 0 0 0 1px {t['line']};cursor:pointer}}
.chip.on{{{t['chip_on']}}}
.btn{{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 14px;border-radius:{t['r']}px;font:700 13px "Albert Sans";border:0;cursor:pointer;background:{t['s3']};color:{t['text']};box-shadow:inset 0 0 0 1px {t['line']}}}
.btn.pri{{background:{t['acc']};color:#fff;box-shadow:none}}
.glass{{background:{t['glass']};backdrop-filter:blur({t['blur']}px) saturate(1.3);-webkit-backdrop-filter:blur({t['blur']}px) saturate(1.3)}}
.bar{{height:6px;border-radius:9px;background:{t['s3']};overflow:hidden}}
.row{{display:flex;align-items:center;gap:10px}}
'''

def kpi(t, k, i):
    lab, val, sub, bar, tone = k
    vcol = t['bad'] if tone == 'bad' else t['text']
    subcol = t['ok'] if tone == 'ok' else t['t3']
    vf = f'font-family:"{t["kpi_font"]}";font-weight:700;font-size:{22 if t["kpi_font"]=="Syncopate" else 30}px;letter-spacing:{"-.01em" if t["kpi_font"]=="Syncopate" else "-.03em"}'
    accent_line = f'<span style="position:absolute;left:0;top:14px;bottom:14px;width:2px;background:{t["acc"]};border-radius:2px"></span>' if (t['name'] == 'Signal' and i == 0) else ''
    barh = f'<div class="bar" style="margin-top:6px"><div style="width:{bar}%;height:100%;background:{t["bar"] if t["name"]!="Carbone" else t["acc"]}"></div></div>' if bar else ''
    return f'''<div class="card" style="position:relative;padding:14px 16px;display:flex;flex-direction:column;gap:6px;min-height:104px">{accent_line}<span class="lbl">{lab}</span><span class="num" style="{vf};color:{vcol}">{val}</span>{barh}<span style="font-size:12.5px;color:{subcol};margin-top:auto">{sub}</span></div>'''

def chart(t, w=640, h=190):
    mx = 120
    n = len(REAL); bw = w / n
    bars = ''
    for i, v in enumerate(REAL):
        x = i * bw + bw * .2; bh = v / mx * (h - 24)
        bars += f'<rect x="{x:.1f}" y="{h-20-bh:.1f}" width="{bw*.6:.1f}" height="{max(bh,1.5):.1f}" rx="{3 if t["r"]>6 else 1.5}" fill="url(#g{t["name"]})"></rect>'
        bars += f'<text x="{x+bw*.3:.1f}" y="{h-4}" text-anchor="middle" font-size="10.5" fill="{t["t3"]}" font-family="Albert Sans">{MONTHS[i]}</text>'
    pts = ' '.join(f'{i*bw+bw*.5:.1f},{h-20-p/mx*(h-24):.1f}' for i, p in enumerate(PLAN))
    stops = '<stop offset="0" stop-color="#ff7a45"></stop><stop offset="1" stop-color="#b23ad6"></stop>' if t['name'] == 'Nocturne' else (f'<stop offset="0" stop-color="{t["acc"]}"></stop><stop offset="1" stop-color="{t["acc"]}" stop-opacity=".25"></stop>' if t['name'] == 'Signal' else f'<stop offset="0" stop-color="{t["acc"]}"></stop><stop offset="1" stop-color="#c63d1e"></stop>')
    grid = ''.join(f'<line x1="0" x2="{w}" y1="{h-20-k*(h-24)}" y2="{h-20-k*(h-24)}" stroke="{t["line"]}"></line>' for k in (0, .25, .5, .75))
    return f'<svg width="100%" viewBox="0 0 {w} {h}" aria-label="Trajectoire mensuelle"><defs><linearGradient id="g{t["name"]}" x1="0" y1="0" x2="0" y2="1">{stops}</linearGradient></defs>{grid}{bars}<polyline points="{pts}" fill="none" stroke="{t["t2"]}" stroke-width="1.5" stroke-dasharray="4 4"></polyline></svg>'

def donut(t, s=128):
    r = s / 2 - 10; c = 2 * 3.14159 * r; off = 0; arcs = ''
    for lab, v, p, col in MIX:
        ln = p / 100 * c
        arcs += f'<circle cx="{s/2}" cy="{s/2}" r="{r:.1f}" fill="none" stroke="{col}" stroke-width="12" stroke-dasharray="{max(ln-2,0):.1f} {c:.1f}" stroke-dashoffset="{-off:.1f}" transform="rotate(-90 {s/2} {s/2})"></circle>'
        off += ln
    leg = ''.join(f'<div class="row" style="gap:8px;font-size:13px"><span style="width:8px;height:8px;border-radius:50%;background:{col}"></span><b style="width:34px">{lab}</b><span class="num" style="color:{t["t2"]};flex-grow:1;text-align:right">{v} k€</span><span class="num" style="color:{t["t3"]};width:34px;text-align:right">{p} %</span></div>' for lab, v, p, col in MIX)
    return f'<div class="row" style="gap:20px;align-items:center"><div style="position:relative;width:{s}px;height:{s}px;flex:none"><svg width="{s}" height="{s}" aria-hidden="true"><circle cx="{s/2}" cy="{s/2}" r="{r:.1f}" fill="none" stroke="{t["s3"]}" stroke-width="12"></circle>{arcs}</svg><div style="position:absolute;inset:0;display:grid;place-content:center;text-align:center"><b class="num" style="font-size:18px">377 k€</b><span style="font-size:11px;color:{t["t3"]}">engagés</span></div></div><div style="display:grid;gap:8px;flex-grow:1">{leg}</div></div>'

def dues(t):
    rows = ''
    for d, m, n, s, p, sv in DUE:
        rows += f'''<div class="row" style="padding:9px 0;border-top:1px solid {t["line"]}"><div style="width:40px;text-align:center"><div class="lbl" style="font-size:9.5px">{m}</div><div class="num" style="font-size:18px;font-weight:700">{d}</div></div><div style="flex-grow:1;min-width:0"><div style="font-weight:700;font-size:14px">{n}</div><div style="font-size:12.5px;color:{t["t3"]}">{s}</div></div><div style="width:84px"><div class="bar"><div style="width:{p}%;height:100%;background:{t["bar"] if t["name"]!="Carbone" else t["acc"]}"></div></div></div><span class="num" style="font-size:12.5px;color:{t["t2"]};width:34px;text-align:right">{p} %</span></div>'''
    return rows

def menubar(t, title='Dashboard'):
    lights = ''.join(f'<span style="width:12px;height:12px;border-radius:50%;background:{c}"></span>' for c in ('#ff5f57', '#febc2e', '#28c840'))
    logo = G['settings'].replace('class="k"', f'fill="{t["acc"]}" stroke="none"')
    return f'''<header class="glass" style="position:absolute;left:0;top:0;right:0;height:34px;display:flex;align-items:center;gap:4px;padding:0 12px;z-index:5;box-shadow:inset 0 -1px 0 {t["line"]};font-size:13.5px">
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="{t["text"]}" stroke-width="2.2" stroke-linecap="round" aria-label="Gearbox">{logo}</svg>
<div class="row" style="gap:8px;margin:0 10px 0 12px">{lights}</div>
<b style="padding:0 8px">{title}</b><span style="padding:0 8px;color:{t["t2"]}">Fichier</span><span style="padding:0 8px;color:{t["t2"]}">Édition</span><span style="padding:0 8px;color:{t["t2"]}">Présentation</span><span style="padding:0 8px;color:{t["t2"]}">Fenêtre</span>
<div class="row" style="margin-left:auto;gap:14px;color:{t["t2"]}"><span class="row" style="gap:6px;font-weight:600;color:{t["text"]}"><span style="width:6px;height:6px;border-radius:50%;background:{t["acc"]}"></span>Tout le réseau</span>{ic("search",15)}{ic("sliders",15)}{ic("bell",15)}<b class="num" style="color:{t["text"]}">lun. 28 sept. 10:42</b></div></header>'''

def dock(t, active='dashboard', s=46):
    items = ''
    for a in DOCK:
        if a == 'games':
            items += f'<span style="width:1px;align-self:stretch;margin:6px 4px;background:{t["line2"]}"></span>'
        dot = f'<span style="position:absolute;left:50%;bottom:-7px;width:4px;height:4px;margin-left:-2px;border-radius:50%;background:{t["acc"] if a==active else t["t2"]}"></span>' if a in (active, 'chat', 'projects') else ''
        big = 1.18 if a == active else 1
        items += f'<span style="position:relative;display:grid">{tile(t, a, round(s*big), a == active)}{dot}</span>'
    return f'<nav class="glass" aria-label="Dock" style="position:absolute;left:50%;bottom:10px;transform:translateX(-50%);display:flex;align-items:flex-end;gap:7px;padding:8px 11px;border-radius:{t["rw"]+8}px;box-shadow:inset 0 0 0 1px {t["line2"]},0 20px 50px -20px rgba(0,0,0,.7);z-index:6">{items}</nav>'

def widgets(t):
    return f'''<div style="position:absolute;left:24px;top:58px;width:268px;display:grid;gap:14px;z-index:1">
<div class="glass" style="border-radius:{t["rw"]+6}px;padding:16px;box-shadow:inset 0 0 0 1px {t["line2"]};height:150px;display:flex;flex-direction:column">
<div class="row" style="gap:7px;font-size:12.5px;font-weight:700;color:{t["t2"]}">Budget 2026</div>
<div class="row" style="margin-top:auto;gap:14px"><div style="position:relative;width:70px;height:70px"><svg width="70" height="70" aria-hidden="true"><circle cx="35" cy="35" r="29" fill="none" stroke="{t["s3"]}" stroke-width="8"></circle><circle cx="35" cy="35" r="29" fill="none" stroke="{t["acc"]}" stroke-width="8" stroke-linecap="round" stroke-dasharray="107 182" transform="rotate(-90 35 35)"></circle></svg></div><div><div class="num" style="font-size:30px;font-weight:700;letter-spacing:-.03em">59 %</div><div style="font-size:12px;color:{t["t3"]}">377 k€ engagés</div></div></div></div>
<div style="border-radius:{t["rw"]+6}px;padding:16px;height:150px;display:flex;flex-direction:column;{"background:linear-gradient(135deg,#f75632,#8f12ab);color:#fff" if t["name"]!="Signal" else f"background:#0d0d10;box-shadow:inset 0 0 0 1px {t['acc']};color:{t['text']}"}">
<div class="row" style="gap:7px;font-size:12.5px;font-weight:700;opacity:.85">{ic("alert",15)}En retard</div><div class="num" style="font-size:42px;font-weight:700;margin-top:auto;line-height:1">2</div><div style="font-size:12.5px;opacity:.8">projets à reprendre</div></div>
<div class="glass" style="border-radius:{t["rw"]+6}px;padding:16px;box-shadow:inset 0 0 0 1px {t["line2"]};display:grid;gap:8px">
<div style="font-size:12.5px;font-weight:700;color:{t["t2"]}">Prochaines publications</div>
<div class="row" style="font-size:13px"><b class="num" style="width:54px">28 sept.</b><span style="flex-grow:1">Portes ouvertes R5</span></div>
<div class="row" style="font-size:13px"><b class="num" style="width:54px">29 sept.</b><span style="flex-grow:1">Offre pneus hiver</span></div>
<div class="row" style="font-size:13px"><b class="num" style="width:54px">1 oct.</b><span style="flex-grow:1">Le Bigster arrive</span></div></div></div>'''

def desktop(key):
    t = T[key]
    W, H = 1440, 900
    wx, wy, ww, wh = 316, 50, 1100, 764
    chips = lambda arr, on: ''.join(f'<button class="chip{" on" if i == on else ""}">{x}</button>' for i, x in enumerate(arr))
    brand = ''.join(f'<button class="chip"><span style="width:8px;height:8px;border-radius:50%;background:{c}"></span>{n}</button>' for n, c in (('Renault', '#ffcc33'), ('Dacia', '#8a9870'), ('Alpine', '#3d7fe0'), ('Nissan', '#e03a55')))
    body = f'''<div style="position:absolute;left:{wx}px;top:{wy}px;width:{ww}px;height:{wh}px;border-radius:{t["rw"]}px;overflow:hidden;background:{t["s1"]};box-shadow:inset 0 0 0 1px {t["line2"]},0 40px 100px -30px rgba(0,0,0,.85);z-index:3;display:flex;flex-direction:column">
<div style="height:44px;flex:none;display:flex;align-items:center;gap:12px;padding:0 16px;border-bottom:1px solid {t["line"]}">
<div class="row" style="gap:8px">{"".join(f'<span style="width:12px;height:12px;border-radius:50%;background:{c}"></span>' for c in ("#ff5f57","#febc2e","#28c840"))}</div>
<span class="ttl" style="margin-left:6px">Cockpit</span><span style="font-size:12.5px;color:{t["t3"]}">vue consolidée · 2026</span>
<div class="row" style="margin-left:auto;gap:6px"><button class="chip">{ic("pin",14)}Tout le réseau{ic("chev",13)}</button><button class="chip">{ic("cal",14)}01/01 → 31/12/2026</button><button class="chip on">Toutes</button>{brand}<span style="width:1px;height:20px;background:{t["line2"]};margin:0 4px"></span>{chips(["Tous","VN","VO","APV","PR"],0)}</div></div>
<div style="flex-grow:1;padding:16px 18px;display:grid;grid-template-rows:auto auto 1fr;gap:14px;background:{t["s1"]}">
<div style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px">{"".join(kpi(t,k,i) for i,k in enumerate(KPIS))}</div>
<div style="display:grid;grid-template-columns:1.65fr 1fr;gap:12px">
<div class="card" style="padding:14px 16px"><div class="row" style="margin-bottom:8px"><b style="font-size:14px">Trajectoire mensuelle</b><span style="margin-left:auto;font-size:12px;color:{t["t3"]}">réalisé · ┅ budget</span></div>{chart(t)}</div>
<div class="card" style="padding:14px 16px"><b style="font-size:14px;display:block;margin-bottom:14px">Mix activité</b>{donut(t)}</div></div>
<div style="display:grid;grid-template-columns:1.65fr 1fr;gap:12px;min-height:0">
<div class="card" style="padding:12px 16px 4px;overflow:hidden"><div class="row"><b style="font-size:14px">Prochaines échéances</b><span style="margin-left:auto;font-size:12px;color:{t["t3"]}">projets actifs</span></div>{dues(t)}</div>
<div class="card" style="padding:14px 16px;display:grid;gap:10px;align-content:start"><b style="font-size:14px">Charge de l’équipe</b>{"".join(f'<div class="row" style="font-size:13px"><span style="width:26px;height:26px;border-radius:50%;background:{c};display:grid;place-items:center;font-size:10.5px;font-weight:800;color:#fff">{i}</span><span style="flex-grow:1">{n}</span><span class="num" style="color:{t["t3"]}">{a}</span><b class="num" style="width:56px;text-align:right">{b}</b></div>' for i,n,a,b,c in (("CR","Camille Roux","4/9","21,4 k€","#8f12ab"),("HM","Hugo Martin","3/7","18,9 k€","#293f74"),("LB","Léa Bernard","5/6","12,2 k€","#e11d74"),("TD","Tom Durand","2/5","9,7 k€","#0ea5a4")))}</div></div>
</div></div>'''
    return f'''<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Direction {t["name"]} · bureau</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
{FONTS}
<style>
{css(t)}
</style>
</helmet>
<div data-icons="{t["ic"]}" style="position:relative;width:{W}px;height:{H}px;overflow:hidden;background:{t["wall"]}">
{menubar(t)}
{widgets(t)}
{body}
{dock(t)}
<div style="position:absolute;left:24px;bottom:22px;z-index:2"><div class="ttl" style="font-size:11px;color:{t["t3"]}">Direction {key} · {t["name"]}</div><div style="font-size:12px;color:{t["t3"]};margin-top:4px">{t["tagline"]}</div></div>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{W},"height":{H}}}}}'>
class Component extends DCLogic {{
  renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
'''

def phone(key):
    t = T[key]
    W, H = 390, 844
    grid = ['projects', 'todo', 'digital', 'campaigns', 'budget', 'fixed', 'material', 'conges', 'hello', 'games', 'agenda', 'settings']
    icons = ''.join(f'<div style="display:grid;justify-items:center;gap:6px;font-size:11px;font-weight:600;color:{t["text"]}">{tile(t, a, 58)}<span>{NAMES[a]}</span></div>' for a in grid)
    dock_i = ''.join(tile(t, a, 58, a == 'dashboard') for a in ('dashboard', 'projects', 'chat', 'agenda'))
    return f'''<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Direction {t["name"]} · téléphone</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
{FONTS}
<style>
{css(t)}
</style>
</helmet>
<div data-icons="{t["ic"]}" style="position:relative;width:{W}px;height:{H}px;overflow:hidden;background:{t["wall"]};border-radius:44px;box-shadow:inset 0 0 0 1px {t["line2"]}">
<div class="row" style="justify-content:space-between;padding:16px 28px 0;font-weight:700;font-size:15px"><span class="num">10:42</span><span class="row" style="gap:6px">{ic("wifi",16)}{ic("battery",18)}</span></div>
<div style="padding:18px 22px 0"><div class="lbl" style="color:{t["t2"]}">Lundi 28 septembre</div><div class="ttl" style="font-size:{22 if t["title_size"]>12 else 18}px;margin-top:8px;letter-spacing:{t["title_ls"]}">Bonjour Théo</div></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:18px 22px 0">
<div class="glass" style="border-radius:{t["rw"]+8}px;padding:14px;height:150px;display:flex;flex-direction:column;box-shadow:inset 0 0 0 1px {t["line2"]}"><div style="font-size:12px;font-weight:700;color:{t["t2"]}">Budget</div><div class="row" style="margin-top:auto;gap:10px"><svg width="54" height="54" aria-hidden="true"><circle cx="27" cy="27" r="22" fill="none" stroke="{t["s3"]}" stroke-width="7"></circle><circle cx="27" cy="27" r="22" fill="none" stroke="{t["acc"]}" stroke-width="7" stroke-linecap="round" stroke-dasharray="82 139" transform="rotate(-90 27 27)"></circle></svg><b class="num" style="font-size:24px">59 %</b></div></div>
<div style="border-radius:{t["rw"]+8}px;padding:14px;height:150px;display:flex;flex-direction:column;{"background:linear-gradient(135deg,#f75632,#8f12ab);color:#fff" if t["name"]!="Signal" else f"background:#0d0d10;box-shadow:inset 0 0 0 1px {t['acc']}"}"><div style="font-size:12px;font-weight:700;opacity:.85">En retard</div><div class="num" style="font-size:40px;font-weight:700;margin-top:auto;line-height:1">2</div><div style="font-size:12px;opacity:.8">projets</div></div>
<div class="glass" style="grid-column:span 2;border-radius:{t["rw"]+8}px;padding:14px;display:grid;gap:8px;box-shadow:inset 0 0 0 1px {t["line2"]}"><div style="font-size:12px;font-weight:700;color:{t["t2"]}">Prochaines échéances</div>{"".join(f'<div class="row" style="font-size:13.5px"><b class="num" style="width:54px">{d} {m}</b><span style="flex-grow:1">{n}</span><span class="num" style="color:{t["t3"]}">{p} %</span></div>' for d,m,n,s,p,sv in DUE[:3])}</div></div>
<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px 6px;padding:22px 22px 0">{icons}</div>
<div class="glass" style="position:absolute;left:14px;right:14px;bottom:26px;border-radius:32px;padding:14px 18px;display:flex;justify-content:space-between;box-shadow:inset 0 0 0 1px {t["line2"]}">{dock_i}</div>
<div style="position:absolute;left:50%;bottom:8px;width:134px;height:5px;margin-left:-67px;border-radius:9px;background:{t["text"]}"></div>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{W},"height":{H}}}}}'>
class Component extends DCLogic {{
  renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
'''

def fondations():
    W, H = 1440, 1120
    cols = ''
    for key in 'ABC':
        t = T[key]
        sw = ''.join(f'<div style="display:grid;gap:6px"><span style="height:54px;border-radius:{t["r"]}px;background:{c};box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)"></span><span style="font-size:11px;color:{t["t2"]}">{n}<br><span class="num" style="color:{t["t3"]}">{c}</span></span></div>' for n, c in (('Fond', t['bg']), ('Fenêtre', t['s1']), ('Carte', t['s2']), ('Champ', t['s3']), ('Accent', t['acc']), ('Second', t['acc2'])))
        type_ = f'''<div class="ttl" style="font-size:{t["title_size"]+8}px">Cockpit général</div><div style="font-size:12px;color:{t["t3"]};margin-top:4px">Syncopate 700 · capitales · approche {t["title_ls"]}</div>
<div style="font-size:30px;font-weight:700;letter-spacing:-.03em;margin-top:14px;font-family:{t["kpi_font"]}" class="num">377 400 €</div><div style="font-size:12px;color:{t["t3"]}">Chiffres clés · {t["kpi_font"]} 700 tabulaire</div>
<div style="font-size:15px;font-weight:700;margin-top:14px">Salon VO Saint-Etienne</div><div style="font-size:13.5px;color:{t["t2"]};margin-top:2px">Albert Sans 400 — texte courant 13,5 px, jamais sous 12 px.</div>'''
        comps = f'''<div class="row" style="flex-wrap:wrap;gap:8px"><button class="btn pri">{ic("plus",15)}Nouveau projet</button><button class="btn">Annuler</button><button class="chip on">VN</button><button class="chip">VO</button><button class="chip">APV</button></div>
<div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap"><span style="padding:3px 9px;border-radius:6px;background:#ffcc33;color:#1b1604;font-size:11.5px;font-weight:800">Renault</span><span style="padding:3px 9px;border-radius:6px;background:#6a7551;color:#fff;font-size:11.5px;font-weight:800">Dacia</span><span style="padding:3px 9px;border-radius:6px;background:#0055a4;color:#fff;font-size:11.5px;font-weight:800">Alpine</span><span style="padding:3px 9px;border-radius:6px;box-shadow:inset 0 0 0 1.5px #5b7fd6;color:#9fb6ff;font-size:11.5px;font-weight:800">VN</span><span style="padding:3px 9px;border-radius:6px;background:rgba(87,209,143,.18);color:{t["ok"]};font-size:11.5px;font-weight:800">● Actif</span><span style="padding:3px 9px;border-radius:6px;background:rgba(255,106,90,.18);color:{t["bad"]};font-size:11.5px;font-weight:800">En retard</span></div>
<label style="display:grid;gap:6px;margin-top:14px"><span class="lbl">Nom du projet</span><input value="Portes ouvertes R5 E-Tech" style="height:36px;border-radius:{t["r"]}px;border:0;padding:0 12px;background:{t["s3"]};color:{t["text"]};font:500 13.5px Albert Sans;box-shadow:inset 0 0 0 1.5px {t["focus"]},0 0 0 4px rgba(247,86,50,.18);outline:0"></label>'''
        icons = ''.join(tile(t, a, 48, a == 'dashboard') for a in ('dashboard', 'projects', 'digital', 'chat', 'budget', 'settings'))
        cols += f'''<section data-icons="{t["ic"]}" style="--accent:{t["acc"]};background:{t["bg"]};border-radius:24px;padding:26px;display:flex;flex-direction:column;gap:22px;color:{t["text"]};box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)">
<div><div class="lbl" style="color:{t["acc"]}">Direction {key}</div><div class="ttl" style="font-family:Syncopate;font-size:22px;letter-spacing:.06em;margin-top:6px">{t["name"]}</div><div style="font-size:13.5px;color:{t["t2"]};margin-top:6px">{t["tagline"]}</div></div>
<div><div class="lbl" style="margin-bottom:10px">Couleurs</div><div style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px">{sw}</div></div>
<div class="card" style="padding:18px;background:{t["s1"]}">{type_}</div>
<div><div class="lbl" style="margin-bottom:10px">Composants</div>{comps}</div>
<div><div class="lbl" style="margin-bottom:10px">Icônes · variante {({'dark':'Sombre','light':'Claire','tinted':'Teintée'})[t['ic']]}</div><div class="row" style="gap:10px">{icons}</div></div>
<div><div class="lbl" style="margin-bottom:8px">Rayons · matière</div><div style="font-size:13px;color:{t["t2"]};line-height:1.6">Cartes {t["r"]+2} px · fenêtres {t["rw"]} px · flou {t["blur"]} px réservé au chrome (barre de menus, Dock, menus), jamais sous un tableau.</div></div>
</section>'''
    return f'''<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Fondations des trois directions</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
{FONTS}
<style>
{css(T["A"])}
</style>
</helmet>
<div style="width:{W}px;height:{H}px;box-sizing:border-box;padding:48px;background:#070708;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px">
{cols}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{W},"height":{H}}}}}'>
class Component extends DCLogic {{
  renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
'''


def spring(stiffness, damping, mass=1):
    dt = 1/240; x = v = t = 0.0; pts = []
    while t < 3:
        a = (-stiffness*(x-1) - damping*v)/mass; v += a*dt; x += v*dt; t += dt; pts.append((t, x))
        if t > .08 and abs(1-x) < .0006 and abs(v) < .012: break
    step = max(1, len(pts)//44); out = ['0']
    for i in range(step, len(pts), step): out.append(f"{pts[i][1]:.4f} {pts[i][0]/t*100:.1f}%")
    out.append('1'); return 'linear(' + ', '.join(out) + ')', round(t*1000)
SNAP, SNAP_MS = spring(420, 26); SOFT, SOFT_MS = spring(200, 19); BOUNCE, BOUNCE_MS = spring(360, 14); WIN, WIN_MS = spring(380, 29)

def motion():
    W, H = 1440, 900
    t = T['B']
    return f'''<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Mouvement · banc d'essai</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
{FONTS}
<style>
{css(t)}
/* Un seul vocabulaire de mouvement. Seuls transform et opacity s'animent : 60 i/s même sur un PC modeste. */
:root{{--snap:{SNAP};--soft:{SOFT};--bounce:{BOUNCE};--win:{WIN};--out:cubic-bezier(.22,1,.36,1)}}
.stage{{position:relative;height:300px;border-radius:18px;background:linear-gradient(180deg,#0f1530,#0b0f22);box-shadow:inset 0 0 0 1px {t["line"]};overflow:hidden}}
.win{{position:absolute;left:50%;top:50%;width:300px;height:190px;margin:-95px 0 0 -150px;border-radius:16px;background:{t["s2"]};box-shadow:inset 0 0 0 1px {t["line2"]},0 30px 60px -20px rgba(0,0,0,.8);transform-origin:50% 100%;transition:transform {WIN_MS}ms var(--win),opacity 180ms var(--out)}}
.win.closed{{transform:translate(0,140px) scale(.12);opacity:0;transition:transform 300ms cubic-bezier(.55,0,.75,.2),opacity 260ms ease-in}}
.row2{{display:flex;align-items:center;gap:10px;height:40px;padding:0 12px;border-radius:10px;font-size:13.5px;font-weight:600;transition:background 150ms}}
.pane{{position:absolute;inset:0;padding:18px;transition:transform {SNAP_MS}ms var(--snap),opacity 220ms var(--out)}}
.pane.off-r{{transform:translateX(100%)}}.pane.off-l{{transform:translateX(-26%);opacity:.5}}
.sheet{{position:absolute;left:24px;right:24px;bottom:0;height:170px;border-radius:20px 20px 0 0;background:{t["s2"]};box-shadow:inset 0 0 0 1px {t["line2"]};transform:translateY(105%);transition:transform {SNAP_MS}ms var(--snap)}}
.sheet.on{{transform:none}}
.veil{{position:absolute;inset:0;background:rgba(5,8,20,.55);opacity:0;transition:opacity 260ms var(--out);pointer-events:none}}.veil.on{{opacity:1}}
.behind{{position:absolute;inset:18px;border-radius:14px;background:{t["s1"]};box-shadow:inset 0 0 0 1px {t["line"]};transition:transform {SNAP_MS}ms var(--snap),filter 440ms}}.behind.back{{transform:scale(.94)}}
.toast{{position:absolute;right:16px;top:16px;width:250px;padding:12px 14px;border-radius:16px;background:{t["glass"]};box-shadow:inset 0 0 0 1px {t["line2"]};transform:translateX(120%);transition:transform {SNAP_MS}ms var(--snap)}}.toast.on{{transform:none}}
.press{{transition:transform {BOUNCE_MS}ms var(--bounce)}}.press:active{{transform:scale(.92);transition:transform 90ms cubic-bezier(.3,0,.5,1)}}
.rubber{{position:absolute;left:50%;top:50%;width:170px;height:84px;margin:-42px 0 0 -85px;border-radius:18px;background:linear-gradient(135deg,#f75632,#8f12ab);display:grid;place-items:center;color:#fff;font-weight:800;cursor:grab;touch-action:none;user-select:none;box-shadow:0 20px 40px -18px rgba(247,86,50,.8)}}
.rubber.back{{transition:transform {BOUNCE_MS}ms var(--bounce)}}
.seg{{position:relative;display:inline-flex;padding:3px;border-radius:12px;background:{t["s3"]}}}
.seg button{{position:relative;z-index:1;height:30px;padding:0 16px;border:0;background:none;color:{t["t2"]};font:700 13px Albert Sans;cursor:pointer}}
.seg .thumb{{position:absolute;top:3px;bottom:3px;width:92px;border-radius:9px;background:linear-gradient(135deg,#f75632,#8f12ab);transition:transform {BOUNCE_MS}ms var(--bounce)}}
.spec{{font-size:12.5px;color:{t["t3"]};line-height:1.55}}
</style>
</helmet>
<div style="width:{W}px;height:{H}px;box-sizing:border-box;padding:40px 48px;background:{t["bg"]};display:flex;flex-direction:column;gap:22px">
<div class="row" style="align-items:flex-end"><div><div class="lbl" style="color:{t["acc"]}">Banc d’essai · cliquez</div><div class="ttl" style="font-size:24px;margin-top:6px">Mouvement</div></div>
<div style="margin-left:auto;max-width:640px;font-size:13.5px;color:{t["t2"]};line-height:1.6">Ce qui rendait la maquette saccadée : des animations de largeur, de hauteur et de flou, et des transitions qui attendaient la fin de la précédente. Ici, tout est <b>transform + opacity</b>, animé par de vrais ressorts <b>sous-amortis</b> : chaque mouvement dépasse légèrement sa cible puis se pose, comme chez Apple. Interruptible à tout moment.</div></div>
<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px">
<section style="display:grid;gap:10px"><div class="row"><b>1 · Fenêtre ⇄ Dock</b><button class="btn pri press" style="margin-left:auto" onClick="{{{{toggleWin}}}}">{{{{winLabel}}}}</button></div>
<div class="stage"><div class="{{{{winClass}}}}"><div class="row" style="gap:7px;padding:12px 14px;border-bottom:1px solid {t["line"]}"><span style="width:10px;height:10px;border-radius:50%;background:#ff5f57"></span><span style="width:10px;height:10px;border-radius:50%;background:#febc2e"></span><span style="width:10px;height:10px;border-radius:50%;background:#28c840"></span><b style="margin-left:8px;font-size:13px">Projets</b></div><div style="padding:14px;display:grid;gap:8px"><div class="bar"><div style="width:64%;height:100%;background:{t["bar"]}"></div></div><div class="bar"><div style="width:38%;height:100%;background:{t["bar"]}"></div></div><div class="bar"><div style="width:81%;height:100%;background:{t["bar"]}"></div></div></div></div>
<div style="position:absolute;left:50%;bottom:14px;transform:translateX(-50%)">{tile(t,"projects",40)}</div></div>
<div class="spec">Ouverture : ressort « fenêtre » (≈ 3 % de dépassement) depuis l’icône · fermeture : accélération 300 ms vers le Dock. Aucune largeur animée.</div></section>
<section style="display:grid;gap:10px"><div class="row"><b>2 · Liste → détail</b><button class="btn pri press" style="margin-left:auto" onClick="{{{{toggleDetail}}}}">{{{{detailLabel}}}}</button></div>
<div class="stage"><div class="{{{{listClass}}}}">{"".join(f'<div class="row2" style="background:{t["s2"] if i==1 else "transparent"}"><span style="width:8px;height:8px;border-radius:50%;background:{c}"></span>{n}</div>' for i,(n,c) in enumerate((("Salon VO Saint-Etienne","#f75632"),("Soirée clients Alpine A290","#3d7fe0"),("Street marketing Millau","#57d18f"),("Essais Dacia Bigster","#b23ad6"),("Campagne APV hiver","#ffcc33"))))}</div>
<div class="{{{{detailClass}}}}" style="background:{t["s1"]}"><div class="lbl">Vichy · VN · Alpine</div><div style="font-size:18px;font-weight:700;margin:6px 0 14px">Soirée clients Alpine A290</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div class="card" style="padding:12px"><div class="lbl">Avancement</div><b class="num" style="font-size:22px">64 %</b></div><div class="card" style="padding:12px"><div class="lbl">Budget</div><b class="num" style="font-size:22px">26 600 €</b></div></div></div></div>
<div class="spec">Le détail glisse en ressort vif (≈ 8 % de dépassement, il « arrive » et se cale) pendant que la liste recule de 26 %.</div></section>
<section style="display:grid;gap:10px"><div class="row"><b>3 · Feuille modale</b><button class="btn pri press" style="margin-left:auto" onClick="{{{{toggleSheet}}}}">{{{{sheetLabel}}}}</button></div>
<div class="stage"><div class="{{{{behindClass}}}}" style="padding:16px"><b style="font-size:14px">Dépenses</b><div style="margin-top:12px;display:grid;gap:8px"><div class="bar"></div><div class="bar"></div><div class="bar"></div></div></div><div class="{{{{veilClass}}}}"></div>
<div class="{{{{sheetClass}}}}" style="padding:18px"><b style="font-size:15px">Nouvelle dépense</b><div class="row" style="margin-top:14px;gap:8px"><span class="chip on">Ponctuelle</span><span class="chip">Annuelle</span></div><div style="margin-top:14px;height:34px;border-radius:10px;background:{t["s3"]}"></div></div></div>
<div class="spec">La fenêtre recule (échelle 0,94) derrière la feuille : on garde le contexte. Voile en fondu 260 ms, feuille en ressort 440 ms.</div></section>
</div>
<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px">
<section style="display:grid;gap:10px"><div class="row"><b>4 · Notification</b><button class="btn pri press" style="margin-left:auto" onClick="{{{{toggleToast}}}}">Déclencher</button></div>
<div class="stage" style="height:140px"><div class="{{{{toastClass}}}}"><div class="row" style="gap:10px">{tile(t,"chat",30)}<div><b style="font-size:13px">Léa Bernard</b><div style="font-size:12.5px;color:{t["t2"]}">La story de samedi est validée</div></div></div></div></div></section>
<section style="display:grid;gap:10px"><b>5 · Sélecteur segmenté</b><div class="stage" style="height:140px;display:grid;place-items:center"><div class="seg"><span class="thumb" style="transform:translateX({{{{segX}}}}px)"></span><button onClick="{{{{seg0}}}}" style="width:92px">Semaine</button><button onClick="{{{{seg1}}}}" style="width:92px">Mois</button><button onClick="{{{{seg2}}}}" style="width:92px">Année</button></div></div></section>
<section style="display:grid;gap:10px"><b>6 · Élastique — tirez la carte</b><div class="stage" style="height:140px"><div class="{{{{rubberClass}}}}" style="transform:translateX({{{{rubberX}}}}px)" onPointerDown="{{{{rDown}}}}" onPointerMove="{{{{rMove}}}}" onPointerUp="{{{{rUp}}}}" onPointerCancel="{{{{rUp}}}}">Tirez-moi</div></div></section>
<section style="display:grid;gap:10px"><b>Barème</b><div class="card" style="padding:16px;display:grid;gap:8px;font-size:13px">
<div class="row"><span style="flex-grow:1">Appui → relâchement</span><b class="num">90 ms → rebond</b></div>
<div class="row"><span style="flex-grow:1">Survol, couleur</span><b class="num">150 ms</b></div>
<div class="row"><span style="flex-grow:1">Menu, info-bulle</span><b class="num">ressort vif ≈ 300 ms</b></div>
<div class="row"><span style="flex-grow:1">Feuille, pile, notif.</span><b class="num">ζ 0,63 · +8 %</b></div><div class="row"><span style="flex-grow:1">Fenêtre</span><b class="num">ζ 0,74 · +3 %</b></div>
<div class="row"><span style="flex-grow:1">Changement de bureau</span><b class="num">ressort doux 520 ms</b></div>
<div class="row"><span style="flex-grow:1">Mode économe</span><b class="num">tout ≤ 160 ms, sans flou</b></div></div></section>
</div>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{W},"height":{H}}}}}'>
class Component extends DCLogic {{
  constructor(props) {{ super(props); this.state = {{ win: true, detail: false, sheet: false, toast: false, seg: 0, rx: 0, drag: false }}; }}
  renderVals() {{
    const s = this.state;
    return {{
      winClass: s.win ? 'win' : 'win closed', winLabel: s.win ? 'Réduire' : 'Ouvrir',
      toggleWin: () => this.setState({{ win: !s.win }}),
      listClass: s.detail ? 'pane off-l' : 'pane', detailClass: s.detail ? 'pane' : 'pane off-r', detailLabel: s.detail ? 'Retour' : 'Ouvrir',
      toggleDetail: () => this.setState({{ detail: !s.detail }}),
      sheetClass: s.sheet ? 'sheet on' : 'sheet', veilClass: s.sheet ? 'veil on' : 'veil', behindClass: s.sheet ? 'behind back' : 'behind', sheetLabel: s.sheet ? 'Fermer' : 'Ouvrir',
      toggleSheet: () => this.setState({{ sheet: !s.sheet }}),
      toastClass: s.toast ? 'toast on' : 'toast',
      toggleToast: () => {{ this.setState({{ toast: true }}); clearTimeout(this._t); this._t = setTimeout(() => this.setState({{ toast: false }}), 2600); }},
      rubberClass: s.drag ? 'rubber' : 'rubber back', rubberX: s.rx,
      rDown: (e) => {{ e.currentTarget.setPointerCapture(e.pointerId); this._sx = e.clientX; this.setState({{ drag: true }}); }},
      rMove: (e) => {{ if (!this.state.drag) return; const d = e.clientX - this._sx; this.setState({{ rx: Math.sign(d) * Math.pow(Math.abs(d), .82) }}); }},
      rUp: () => this.setState({{ drag: false, rx: 0 }}),
      segX: s.seg * 92, seg0: () => this.setState({{ seg: 0 }}), seg1: () => this.setState({{ seg: 1 }}), seg2: () => this.setState({{ seg: 2 }}),
    }};
  }}
}}
</script>
</body>
</html>
'''


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

files = {'Main.dc.html': desktop('A'), 'B-Nocturne.dc.html': desktop('B'), 'C-Signal.dc.html': desktop('C'),
         'A-Telephone.dc.html': phone('A'), 'B-Telephone.dc.html': phone('B'), 'C-Telephone.dc.html': phone('C'),
         'Fondations.dc.html': fondations(), 'Mouvement.dc.html': motion(), 'Icones.dc.html': icones()}
for n, c in files.items():
    open(os.path.join(OUT, n), 'w', encoding='utf-8').write(c)
now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
boards = {
 'Main.dc.html': dict(x=0, y=0, w=1440, h=900, title='A · Carbone — bureau'),
 'B-Nocturne.dc.html': dict(x=1520, y=0, w=1440, h=900, title='B · Nocturne — bureau'),
 'C-Signal.dc.html': dict(x=3040, y=0, w=1440, h=900, title='C · Signal — bureau'),
 'A-Telephone.dc.html': dict(x=525, y=1320, w=390, h=844, title='A · Carbone — téléphone', radius=44),
 'B-Telephone.dc.html': dict(x=2045, y=1320, w=390, h=844, title='B · Nocturne — téléphone', radius=44),
 'C-Telephone.dc.html': dict(x=3565, y=1320, w=390, h=844, title='C · Signal — téléphone', radius=44),
 'Fondations.dc.html': dict(x=0, y=2510, w=1440, h=1120, title='Fondations comparées'),
 'Mouvement.dc.html': dict(x=1520, y=2510, w=1440, h=900, title='Mouvement — banc d’essai', is_interactive=True),
 'Icones.dc.html': dict(x=3040, y=2510, w=1440, h=640, title='Icônes façon iOS'),
}
canvas = {'v': 3, 'createdOnFiles': {'v': 1, 'at': now}, 'title': 'Gearbox OS — Direction artistique', 'launch': {'view': 'canvas'}, 'pages': [],
          'boards': boards, 'order': list(boards.keys()),
          'notes': {'t1': dict(x=0, y=-300, text='Trois directions · thème sombre', kind='title1', maxW=4480),
                    't2': dict(x=0, y=1060, text='Sur téléphone', kind='title1', maxW=4480),
                    't3': dict(x=0, y=2250, text='Fondations, mouvement et icônes', kind='title1', maxW=4480)},
          'designSystems': []}
open(os.path.join(OUT, 'canvas.json'), 'w', encoding='utf-8').write(json.dumps(canvas, ensure_ascii=False, indent=1))
print('ok', {n: len(c) for n, c in files.items()})
