import React from 'react';

// =============================================================================
// RENDU DU TEXTE D'UN MESSAGE DE CHAT — liens cliquables et images distantes.
//
// ⚠️⚠️ RÈGLE ABSOLUE DE CE FICHIER : on ne construit JAMAIS de HTML.
// Le contenu vient d'un utilisateur et s'affiche chez tous les autres — c'est le
// scénario type d'une XSS stockée. On rend donc des ÉLÉMENTS REACT (`<a>`, `<img>`),
// jamais de chaîne injectée : l'échappement de React est alors garanti par
// construction, et non par la vigilance de l'appelant.
// **Ne jamais introduire `dangerouslySetInnerHTML` ici**, quelle que soit la
// tentation (markdown, gras, emojis enrichis…). Il n'y en a aujourd'hui aucun
// dans tout le dépôt.
// =============================================================================

// Ponctuation fréquemment collée autour d'une URL dans une phrase.
const PONCTUATION_FINALE = /[.,;:!?)\]}»"']+$/;
const PONCTUATION_INITIALE = /^[([{«"']+/;

// Un schéma quelconque en tête de jeton (`file:`, `mailto:`, `javascript:`, et aussi
// `C:` d'un chemin Windows).
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
// Domaine écrit sans schéma : exemple.fr, www.exemple.fr, exemple.fr/page.
const DOMAINE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}(?:[/?#].*)?$/i;

// ⚠️ Un nom de fichier cité dans une phrase ressemble à s'y méprendre à un domaine :
// « j'ai mis rapport.pdf dans le dossier » produisait un lien vers `https://rapport.pdf`.
// On refuse donc ces terminaisons quand le jeton n'a NI schéma NI chemin — un vrai lien
// vers un fichier en porte forcément un (`exemple.fr/rapport.pdf` reste un lien).
const EXTENSIONS_FICHIER = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'rtf',
  'zip', 'rar', '7z', 'exe', 'msi', 'dmg', 'apk',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic',
  'mp3', 'mp4', 'mov', 'avi', 'wav', 'm4a', 'webm',
  'ai', 'psd', 'indd', 'eps', 'json', 'xml', 'html', 'md',
]);

/**
 * Ce JETON est-il un lien web ?
 *
 * ⚠️ L'analyse porte sur le jeton ENTIER (délimité par des espaces), et surtout pas
 * sur un motif cherché à l'intérieur du texte. C'est ce qui a cassé la première
 * version : dans le chemin inséré par le clavier GIF de Windows
 * `file:///C:/Users/…/MicrosoftWindows.Client.CBS_…/x.gif`, une recherche de motif
 * trouvait « MicrosoftWindows.Client.CBS » et en faisait un lien cliquable vers un
 * domaine inexistant. En raisonnant par jeton, le chemin est rejeté en bloc dès son
 * schéma `file:`, et le fragment interne n'est jamais examiné.
 */
const estLienWeb = (jeton: string): boolean => {
  if (!jeton) return false;
  if (jeton.includes('\\')) return false;            // chemin Windows
  if (/^https?:\/\//i.test(jeton)) return true;
  if (SCHEME.test(jeton)) return false;              // file:, mailto:, javascript:, C:/…
  if (/^www\./i.test(jeton)) return true;
  if (!DOMAINE.test(jeton)) return false;
  // Sans chemin ni requête, un jeton finissant par une extension de fichier connue
  // est un nom de fichier, pas un domaine.
  const aUnChemin = /[/?#]/.test(jeton);
  if (aUnChemin) return true;
  const tld = jeton.split('.').pop()!.toLowerCase();
  return !EXTENSIONS_FICHIER.has(tld);
};

/** Chemin de fichier LOCAL (donc impartageable) pointant une image. */
export const estCheminLocalImage = (texte: string): boolean => {
  const t = texte.trim();
  if (/\s/.test(t)) return false;
  const local = /^file:\/\//i.test(t) || /^[a-z]:[\\/]/i.test(t) || t.startsWith('\\\\');
  return local && /\.(gif|png|jpe?g|webp)$/i.test(t);
};

/**
 * Construit un href SÛR à partir d'un texte d'URL.
 *
 * ⚠️ C'est le garde-fou central : on n'accepte QUE http et https. Sans ce test,
 * un `javascript:alert(1)` collé dans le chat deviendrait un lien cliquable —
 * l'attaquant n'aurait qu'à écrire un message pour exécuter du code chez ses
 * collègues. `data:` et `vbscript:` sont refusés pour la même raison.
 * Rend `null` quand l'URL n'est pas sûre : l'appelant affiche alors du texte inerte.
 */
export const hrefSur = (brut: string): string | null => {
  // Le test de jeton d'abord : sans lui, `C:/x.gif` deviendrait `https://c/x.gif`
  // et un chemin local passerait pour une image distante.
  if (!estLienWeb(brut)) return null;
  const candidat = /^https?:\/\//i.test(brut) ? brut : `https://${brut}`;
  try {
    const u = new URL(candidat);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
};

// Hôtes de GIF connus : leurs URL de partage ne finissent pas par une extension
// d'image, il faut donc les reconnaître au domaine.
const HOTES_GIF = ['tenor.com', 'media.tenor.com', 'giphy.com', 'media.giphy.com', 'i.giphy.com'];

/**
 * L'URL pointe-t-elle une image affichable ?
 * Sert au cas du clavier GIF : sur téléphone comme sur ordinateur, insérer un GIF
 * ne dépose pas un fichier mais colle une URL. On l'affiche alors comme une image
 * plutôt que comme un lien nu.
 *
 * ⚠️ Décision volontaire : la détection est faite sur l'URL, CÔTÉ CLIENT, sans
 * aucune requête serveur. Aller vérifier le type réel du contenu supposerait que le
 * serveur aille chercher une URL fournie par un utilisateur — c'est-à-dire ouvrir
 * une surface SSRF, exactement ce que le proxy de flux RSS a été conçu pour éviter.
 * Conséquence assumée : une URL trompeuse produit une image cassée, rien de plus.
 */
export const estUrlImage = (brut: string): boolean => {
  const href = hrefSur(brut);
  if (!href) return false;
  try {
    const u = new URL(href);
    if (HOTES_GIF.some(h => u.hostname === h || u.hostname.endsWith(`.${h}`))) return true;
    return /\.(gif|png|jpe?g|webp)$/i.test(u.pathname);
  } catch {
    return false;
  }
};

/** Le message est-il UNIQUEMENT une URL d'image ? (un GIF collé seul) */
export const messageEstImageDistante = (contenu: string): string | null => {
  const seul = contenu.trim();
  if (!seul || /\s/.test(seul)) return null;      // une seule « chose », sans espace
  if (!estUrlImage(seul)) return null;
  return hrefSur(seul);
};

/**
 * Découpe un texte et rend les URL en liens cliquables.
 * Les segments non-URL sont rendus en texte : React les échappe.
 */
export const renduTexteRiche = (contenu: string): React.ReactNode[] => {
  // Découpage en JETONS en conservant les espaces (le `(\s+)` capturant les garde
  // dans le résultat) : la mise en forme du message est ainsi préservée à
  // l'identique, y compris les retours à la ligne.
  const parts = contenu.split(/(\s+)/);

  return parts.map((part, i) => {
    if (!part || /^\s+$/.test(part)) return part;

    const prefixe = (part.match(PONCTUATION_INITIALE) ?? [''])[0];
    const reste = prefixe ? part.slice(prefixe.length) : part;
    const suffixe = (reste.match(PONCTUATION_FINALE) ?? [''])[0];
    const brut = suffixe ? reste.slice(0, -suffixe.length) : reste;

    const href = hrefSur(brut);
    // Non-lien (texte ordinaire, chemin local, javascript:…) : rendu en TEXTE.
    if (!href) return part;

    return (
      <React.Fragment key={i}>
        {prefixe}
        <a
          href={href}
          target="_blank"
          // `noopener` empêche la page ouverte d'accéder à `window.opener` et de
          // rediriger Gearbox ailleurs (tabnabbing).
          rel="noopener noreferrer"
          className="underline underline-offset-2 decoration-white/40 hover:decoration-current break-all"
          onClick={e => e.stopPropagation()}
        >
          {brut}
        </a>
        {suffixe}
      </React.Fragment>
    );
  });
};
