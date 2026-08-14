// =============================================================================
// DOMAINES RECONNUS — habillage d'un lien, SANS aucune requête réseau.
//
// Pourquoi cette table plutôt qu'un aperçu fetché : X, Facebook, Instagram,
// LinkedIn, TikTok, SharePoint, Google Photos… exigent tous une authentification
// (ou bloquent les robots) pour livrer leurs métadonnées. Un serveur qui irait les
// chercher rendrait le plus souvent une page de connexion — donc rien d'utile, au
// prix d'une requête sortante par lien. On se contente donc de RECONNAÎTRE le
// domaine et d'afficher une pastille identifiable, ce qui est l'essentiel du
// bénéfice (« ce lien mène à Instagram ») pour un coût nul et un risque nul.
//
// Les fournisseurs qui exposent un vrai oEmbed (YouTube, Vimeo, Dailymotion,
// Spotify, SoundCloud) sont traités à part, avec titre et vignette réels :
// voir `backend/src/routes/linkPreview.ts`.
// =============================================================================

export interface Fournisseur {
  nom: string;
  /** Classes Tailwind de la pastille. */
  classe: string;
  hotes: string[];
}

const FOURNISSEURS: Fournisseur[] = [
  // --- Réseaux sociaux ---
  { nom: 'X', classe: 'bg-slate-900 text-white border-slate-700', hotes: ['x.com', 'twitter.com', 't.co'] },
  { nom: 'Facebook', classe: 'bg-[#1877F2]/15 text-[#1877F2] border-[#1877F2]/30', hotes: ['facebook.com', 'fb.com', 'fb.watch'] },
  { nom: 'Instagram', classe: 'bg-pink-500/15 text-pink-400 border-pink-500/30', hotes: ['instagram.com', 'instagr.am'] },
  { nom: 'LinkedIn', classe: 'bg-[#0A66C2]/15 text-[#4a9eff] border-[#0A66C2]/30', hotes: ['linkedin.com', 'lnkd.in'] },
  { nom: 'TikTok', classe: 'bg-slate-900 text-white border-slate-700', hotes: ['tiktok.com'] },
  { nom: 'Snapchat', classe: 'bg-yellow-400/20 text-yellow-300 border-yellow-400/40', hotes: ['snapchat.com'] },
  { nom: 'Pinterest', classe: 'bg-red-600/15 text-red-400 border-red-600/30', hotes: ['pinterest.com', 'pinterest.fr', 'pin.it'] },
  { nom: 'WhatsApp', classe: 'bg-green-500/15 text-green-400 border-green-500/30', hotes: ['whatsapp.com', 'wa.me'] },
  { nom: 'Twitch', classe: 'bg-purple-500/15 text-purple-400 border-purple-500/30', hotes: ['twitch.tv'] },

  // --- Microsoft (l'écosystème du groupe) ---
  { nom: 'SharePoint', classe: 'bg-teal-600/15 text-teal-400 border-teal-600/30', hotes: ['sharepoint.com'] },
  { nom: 'OneDrive', classe: 'bg-blue-500/15 text-blue-400 border-blue-500/30', hotes: ['onedrive.live.com', '1drv.ms'] },
  { nom: 'Teams', classe: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30', hotes: ['teams.microsoft.com', 'teams.live.com'] },
  { nom: 'Outlook', classe: 'bg-blue-600/15 text-blue-400 border-blue-600/30', hotes: ['outlook.office.com', 'outlook.live.com', 'outlook.com'] },
  { nom: 'Microsoft', classe: 'bg-slate-500/15 text-slate-300 border-slate-500/30', hotes: ['microsoft.com', 'office.com', 'microsoftonline.com'] },

  // --- Google ---
  { nom: 'Google Photos', classe: 'bg-amber-500/15 text-amber-400 border-amber-500/30', hotes: ['photos.google.com', 'photos.app.goo.gl'] },
  { nom: 'Google Drive', classe: 'bg-green-600/15 text-green-400 border-green-600/30', hotes: ['drive.google.com'] },
  { nom: 'Google Docs', classe: 'bg-blue-500/15 text-blue-400 border-blue-500/30', hotes: ['docs.google.com'] },
  { nom: 'Google Maps', classe: 'bg-emerald-600/15 text-emerald-400 border-emerald-600/30', hotes: ['maps.google.com', 'maps.app.goo.gl', 'goo.gl'] },
  { nom: 'Google Forms', classe: 'bg-violet-500/15 text-violet-400 border-violet-500/30', hotes: ['forms.gle'] },
  { nom: 'Google', classe: 'bg-slate-500/15 text-slate-300 border-slate-500/30', hotes: ['google.com', 'google.fr'] },

  // --- Partage de fichiers et outils ---
  { nom: 'Dropbox', classe: 'bg-blue-600/15 text-blue-400 border-blue-600/30', hotes: ['dropbox.com'] },
  { nom: 'WeTransfer', classe: 'bg-sky-500/15 text-sky-400 border-sky-500/30', hotes: ['wetransfer.com', 'we.tl'] },
  { nom: 'SwissTransfer', classe: 'bg-red-500/15 text-red-400 border-red-500/30', hotes: ['swisstransfer.com'] },
  { nom: 'Canva', classe: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30', hotes: ['canva.com'] },
  { nom: 'Figma', classe: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30', hotes: ['figma.com'] },
  { nom: 'Notion', classe: 'bg-slate-400/15 text-slate-200 border-slate-400/30', hotes: ['notion.so', 'notion.site'] },
  { nom: 'GitHub', classe: 'bg-slate-700/40 text-slate-200 border-slate-600', hotes: ['github.com'] },

  // --- Métier / groupe ---
  { nom: 'Gearbox', classe: 'bg-bony-orange/15 text-bony-orange border-bony-orange/30', hotes: ['gearbox.bonyauto-mobile.com'] },
  { nom: 'Bony Auto', classe: 'bg-bony-orange/15 text-bony-orange border-bony-orange/30', hotes: ['bonyauto-mobile.com'] },
  { nom: 'Renault', classe: 'bg-yellow-400/15 text-yellow-300 border-yellow-400/30', hotes: ['renault.fr', 'renault.com'] },
  { nom: 'Dacia', classe: 'bg-slate-500/15 text-slate-300 border-slate-500/30', hotes: ['dacia.fr'] },
  { nom: 'Alpine', classe: 'bg-blue-500/15 text-blue-400 border-blue-500/30', hotes: ['alpinecars.fr', 'alpinecars.com'] },
  { nom: 'Nissan', classe: 'bg-red-600/15 text-red-400 border-red-600/30', hotes: ['nissan.fr'] },
];

/** Fournisseurs traités par `/api/link-preview` (titre + vignette réels). */
const HOTES_OEMBED = [
  'youtube.com', 'youtu.be', 'm.youtube.com',
  'vimeo.com', 'player.vimeo.com',
  'dailymotion.com', 'dai.ly',
  'open.spotify.com', 'spotify.com',
  'soundcloud.com',
];

const correspond = (hostname: string, hotes: string[]) => {
  const h = hostname.toLowerCase().replace(/^www\./, '');
  return hotes.some(x => h === x || h.endsWith(`.${x}`));
};

export const fournisseurDe = (href: string): Fournisseur | null => {
  try {
    const u = new URL(href);
    return FOURNISSEURS.find(f => correspond(u.hostname, f.hotes)) ?? null;
  } catch {
    return null;
  }
};

/** Ce lien mérite-t-il un appel à /api/link-preview ? */
export const aUnApercuRiche = (href: string): boolean => {
  try {
    return correspond(new URL(href).hostname, HOTES_OEMBED);
  } catch {
    return false;
  }
};

/** Libellé court et lisible d'une URL, pour la pastille : domaine + début du chemin. */
export const libelleCourt = (href: string): string => {
  try {
    const u = new URL(href);
    const hote = u.hostname.replace(/^www\./, '');
    const chemin = u.pathname === '/' ? '' : u.pathname;
    return `${hote}${chemin}`.slice(0, 60);
  } catch {
    return href.slice(0, 60);
  }
};
