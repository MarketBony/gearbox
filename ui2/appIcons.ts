// Icônes d'application de la coque v2, style iOS — reprises TELLES QUELLES de
// maquettes/v2/js/icons.js (tracés SVG statiques, aucune donnée : pur visuel).
// Clés = ids de la maquette ; `iconKey()` fait la correspondance avec les ids réels.

const F = (d: string, extra = '') => `<path d="${d}" fill="var(--gf)" ${extra}></path>`;
const A = (d: string, extra = '') => `<path d="${d}" fill="var(--ga)" ${extra}></path>`;
const GEAR = 'M19.06 10.57 L21.12 10.81 L21.12 13.19 L19.06 13.43 L18.00 15.98 L19.29 17.61 L17.61 19.29 L15.98 18.00 L13.43 19.06 L13.19 21.12 L10.81 21.12 L10.57 19.06 L8.02 18.00 L6.39 19.29 L4.71 17.61 L6.00 15.98 L4.94 13.43 L2.88 13.19 L2.88 10.81 L4.94 10.57 L6.00 8.02 L4.71 6.39 L6.39 4.71 L8.02 6.00 L10.57 4.94 L10.81 2.88 L13.19 2.88 L13.43 4.94 L15.98 6.00 L17.61 4.71 L19.29 6.39 L18.00 8.02Z';
export const GLYPHS: Record<string, string> = {
  dashboard: F('M3 16a9 9 0 0 1 18 0h-3.2a5.8 5.8 0 0 0-11.6 0z', 'opacity=".55"') + F('M3 16a9 9 0 0 1 4.6-7.85l1.6 2.77A5.8 5.8 0 0 0 6.2 16z') + F('M11.05 15.3 16.9 9.3a.5.5 0 0 1 .72.68l-4.9 6.8a1.6 1.6 0 1 1-1.67-1.48z'),
  projects: F('M3 7.4A2.4 2.4 0 0 1 5.4 5h4.1c.6 0 1.1.2 1.5.6l1.3 1.3h6.3A2.4 2.4 0 0 1 21 9.3v8.3a2.4 2.4 0 0 1-2.4 2.4H5.4A2.4 2.4 0 0 1 3 17.6z', 'opacity=".5"') + F('M3 10.6a1.6 1.6 0 0 1 1.6-1.6h14.8a1.6 1.6 0 0 1 1.6 1.6v7a2.4 2.4 0 0 1-2.4 2.4H5.4A2.4 2.4 0 0 1 3 17.6z'),
  todo: '<circle cx="6.2" cy="7" r="2.1" fill="#ff9f0a"></circle><circle cx="6.2" cy="12" r="2.1" fill="#0a84ff"></circle><circle cx="6.2" cy="17" r="2.1" fill="#bf5af2"></circle>' +
    A('M10 6.1h9.2a.9.9 0 0 1 0 1.8H10a.9.9 0 0 1 0-1.8zm0 5h9.2a.9.9 0 0 1 0 1.8H10a.9.9 0 0 1 0-1.8zm0 5h6.4a.9.9 0 0 1 0 1.8H10a.9.9 0 0 1 0-1.8z'),
  digital: F('M6.4 3.5h11.2A2.9 2.9 0 0 1 20.5 6.4v7.7a2.9 2.9 0 0 1-2.9 2.9h-5.4l-4.4 3.4c-.66.5-1.6.03-1.6-.8V17A2.9 2.9 0 0 1 3.5 14.1V6.4a2.9 2.9 0 0 1 2.9-2.9zM12 13.4l3.2-3.1a2 2 0 0 0-2.8-2.9l-.4.4-.4-.4a2 2 0 0 0-2.8 2.9z', 'fill-rule="evenodd"'),
  campaigns: F('M3.6 10.1A1.9 1.9 0 0 1 5.5 8.2h2.3l7.9-4.1a1 1 0 0 1 1.5.9v14a1 1 0 0 1-1.5.9l-7.9-4.1h-.4l.9 3.4a1.3 1.3 0 0 1-2.5.7l-1.1-4.1a1.9 1.9 0 0 1-1.1-1.7z') + A('M18.9 8.8a.9.9 0 0 1 1.2.3 5.4 5.4 0 0 1 0 5.8.9.9 0 1 1-1.5-1 3.6 3.6 0 0 0 0-3.8.9.9 0 0 1 .3-1.3z', 'style="fill:var(--gf)"'),
  chat: F('M12 3.8c4.8 0 8.7 3.1 8.7 7.1S16.8 18 12 18c-.95 0-1.86-.12-2.7-.34l-3.9 2.08c-.55.3-1.18-.22-.99-.82l.93-2.86C3.9 14.8 3.3 13 3.3 10.9c0-4 3.9-7.1 8.7-7.1z'),
  hello: F('M12 7.3a4.7 4.7 0 1 1 0 9.4 4.7 4.7 0 0 1 0-9.4z') + `<path d="M12 2.6v2.1M12 19.3v2.1M2.6 12h2.1M19.3 12h2.1M5.35 5.35l1.5 1.5M17.15 17.15l1.5 1.5M18.65 5.35l-1.5 1.5M6.85 17.15l-1.5 1.5" stroke="var(--gf)" stroke-width="2.1" stroke-linecap="round" fill="none"></path>`,
  budget: F('M11 3.1v9.8h9.8A9.8 9.8 0 1 1 11 3.1z') + F('M13 1.3a9.8 9.8 0 0 1 9.7 9.7H13z', 'opacity=".6"'),
  fixed: F('M6 4h10.8l1.6 2H6z', 'opacity=".45"') + F('M3.6 8.6A2.6 2.6 0 0 1 6.2 6h11.6a2.6 2.6 0 0 1 2.6 2.6v8.8a2.6 2.6 0 0 1-2.6 2.6H6.2a2.6 2.6 0 0 1-2.6-2.6z') + A('M15.2 11.1h5.2v4h-5.2a2 2 0 0 1 0-4z') + '<circle cx="15.4" cy="13.1" r="1" fill="var(--gf)"></circle>',
  material: F('M12 2.8 20.2 7 12 11.2 3.8 7z', 'opacity=".6"') + F('M3.4 8.6 11.2 12.6v8.7l-7.8-4z') + F('M20.6 8.6 12.8 12.6v8.7l7.8-4z', 'opacity=".78"'),
  conges: F('M6.5 13.2a5.5 5.5 0 0 1 11 0z') + `<path d="M2.8 16.2c1.5 0 1.5-1.1 3.07-1.1s1.53 1.1 3.07 1.1 1.53-1.1 3.06-1.1 1.53 1.1 3.07 1.1 1.53-1.1 3.06-1.1 1.53 1.1 3.07 1.1M5 19.6c1.2 0 1.2-.9 2.43-.9s1.23.9 2.43.9 1.23-.9 2.43-.9 1.23.9 2.43.9 1.23-.9 2.43-.9 1.23.9 2.43.9" stroke="var(--gf)" stroke-width="1.9" stroke-linecap="round" fill="none"></path>` + F('M12 3.6a.95.95 0 0 1 .95.95v2.1a.95.95 0 0 1-1.9 0v-2.1A.95.95 0 0 1 12 3.6z'),
  export: F('M6.5 2.8h7.3l5.4 5.4v11a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2V4.8a2 2 0 0 1 2-2z') + A('M13.6 2.8v4a1.4 1.4 0 0 0 1.4 1.4h4.2z', 'opacity=".35"') + A('M7.2 11h9.6v1.4H7.2zm0 3.1h9.6v1.4H7.2zm0 3.1h9.6v1.4H7.2zM11.3 11h1.4v7.6h-1.4z'),
  games: F('M7.3 7h9.4a4.7 4.7 0 0 1 4.52 6l-1.12 3.9a2.4 2.4 0 0 1-4.03 1.03L14.1 15.9H9.9l-1.97 2.03A2.4 2.4 0 0 1 3.9 16.9L2.78 13A4.7 4.7 0 0 1 7.3 7z') + A('M7.4 9.6h1.4v1.7h1.7v1.4H8.8v1.7H7.4v-1.7H5.7v-1.4h1.7z') + '<circle cx="15.8" cy="10.6" r="1.15" fill="var(--ga)"></circle><circle cx="17.9" cy="12.7" r="1.15" fill="var(--ga)"></circle>',
  archives: F('M3.4 5.4A1.6 1.6 0 0 1 5 3.8h14a1.6 1.6 0 0 1 1.6 1.6v2.2H3.4z', 'opacity=".6"') + F('M4.4 8.8h15.2v9.2a2.2 2.2 0 0 1-2.2 2.2H6.6A2.2 2.2 0 0 1 4.4 18z') + A('M9.6 11.4h4.8a.85.85 0 0 1 0 1.7H9.6a.85.85 0 0 1 0-1.7z'),
  settings: F(`${GEAR}M15.3 12a3.3 3.3 0 1 0-6.6 0 3.3 3.3 0 0 0 6.6 0z`, 'fill-rule="evenodd" stroke="var(--gf)" stroke-width=".9" stroke-linejoin="round"'),
  launchpad: [3.4, 9.5, 15.6].flatMap((y, j) => [3.4, 9.5, 15.6].map((x, i) => `<rect x="${x}" y="${y}" width="5" height="5" rx="1.5" fill="var(--gf)" opacity="${[1, .8, .6][(i + j) % 3]}"></rect>`)).join(''),
};
GLYPHS.project = GLYPHS.projects; GLYPHS.about = F('M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm-1 7.5v6.3h2v-6.3zm1-4a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5z', 'fill-rule="evenodd"');
/* Teintes façon iOS : dégradé vertical, plus clair en haut */
export const HUES: Record<string, [string, string]> = {
  dashboard: ['#ff7a52', '#e8412c'], projects: ['#5aa9ff', '#1d6ef2'], todo: ['#ffffff', '#f2f2f5'], digital: ['#ff6aa6', '#e2327c'], campaigns: ['#ffab4a', '#f5701f'],
  chat: ['#62e873', '#24b43c'], hello: ['#ffd65a', '#ff9f1c'], agenda: ['#ffffff', '#f2f2f5'], budget: ['#3fd0b0', '#0f9a80'], fixed: ['#3a3a3f', '#141416'],
  material: ['#b08f67', '#7b5b38'], conges: ['#5fd0ff', '#1b8cf0'], export: ['#3fd26a', '#1c9a42'], games: ['#9b7bff', '#5a33e8'], archives: ['#b0b0b8', '#74747c'],
  settings: ['#bdbdc4', '#74747e'], launchpad: ['#48484f', '#1f1f23'], about: ['#48484f', '#1f1f23'],
};
export const ACCENTS: Record<string, string> = { todo: '#c7c7cc', agenda: '#ff3b30', fixed: '#ff9f0a' };
const ALIAS: Record<string, string> = { 'hello-marketing': 'hello', 'fixed-expenses': 'fixed' };
export const iconKey = (tab: string) => ALIAS[tab] || tab;
