import React, { useEffect, useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import { db } from '../services/dataService';
import { fournisseurDe, aUnApercuRiche, libelleCourt } from '../lib/linkProviders';

// =============================================================================
// APERÇU D'UN LIEN dans une conversation. Deux niveaux, volontairement :
//
//  1. Fournisseur oEmbed (YouTube, Vimeo, Dailymotion, Spotify, SoundCloud) →
//     titre et vignette RÉELS, via /api/link-preview (liste blanche serveur).
//  2. Domaine simplement reconnu (X, Instagram, SharePoint, Google Photos…) →
//     pastille identifiable, SANS aucune requête. Ces plateformes exigent une
//     authentification pour livrer leurs métadonnées : aller les chercher rendrait
//     une page de connexion, au prix d'une requête sortante par lien.
//
//  Tout le reste : pas d'aperçu du tout, le lien reste simplement cliquable.
// =============================================================================

interface Apercu {
  provider: string;
  title: string | null;
  author: string | null;
  thumbnail: string | null;
  url: string;
}

const LinkPreview: React.FC<{ href: string }> = ({ href }) => {
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const fournisseur = fournisseurDe(href);
  const riche = aUnApercuRiche(href);

  useEffect(() => {
    if (!riche) return;
    let vivant = true;
    // Échec silencieux et volontaire : un aperçu est un confort. Si le fournisseur
    // est lent, hors ligne ou refuse, le message reste parfaitement lisible avec
    // son lien cliquable — on n'affiche surtout pas d'erreur pour ça.
    db.getLinkPreview(href)
      .then(d => { if (vivant && d) setApercu(d); })
      .catch(() => {});
    return () => { vivant = false; };
  }, [href, riche]);

  if (apercu) {
    return (
      <a
        href={apercu.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className="mt-1.5 block w-[240px] max-w-full rounded-xl overflow-hidden border border-bony-border bg-bony-panel hover:border-bony-orange/60 transition-colors"
      >
        {apercu.thumbnail && (
          <span className="relative block">
            <img src={apercu.thumbnail} alt="" className="w-full h-[124px] object-cover" loading="lazy" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="w-9 h-9 rounded-full bg-black/60 flex items-center justify-center">
                <Play size={16} className="text-white ml-0.5" />
              </span>
            </span>
          </span>
        )}
        <span className="block px-2.5 py-2">
          <span className="block text-[10px] font-bold uppercase tracking-wide text-bony-orange">{apercu.provider}</span>
          {apercu.title && <span className="block text-[11px] font-bold text-bony-text line-clamp-2 leading-snug">{apercu.title}</span>}
          {apercu.author && <span className="block text-[10px] text-bony-muted truncate">{apercu.author}</span>}
        </span>
      </a>
    );
  }

  if (fournisseur) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className="mt-1.5 flex items-center gap-2 w-[240px] max-w-full px-2.5 py-2 rounded-xl border border-bony-border bg-bony-panel hover:border-bony-orange/60 transition-colors"
      >
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${fournisseur.classe}`}>
          {fournisseur.nom}
        </span>
        <span className="text-[10px] text-bony-muted truncate min-w-0 flex-1">{libelleCourt(href)}</span>
        <ExternalLink size={11} className="text-bony-muted shrink-0" />
      </a>
    );
  }

  return null;
};

export default LinkPreview;
