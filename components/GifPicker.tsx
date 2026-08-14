import React, { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { db } from '../services/dataService';

// =============================================================================
// SÉLECTEUR DE GIF (Giphy — Tenor ne délivre plus de clé en libre-service).
//
// Le GIF choisi est envoyé comme un message TEXTE contenant son URL, et non comme
// un message de type `image`. Ce n'est pas un raccourci :
//  - le rendu est déjà assuré par la détection d'image distante (lib/richText.tsx),
//    donc aucun type supplémentaire à créer ;
//  - surtout, la purge des pièces jointes marque « expiré » tout message de type
//    image/file/audio après 180 jours. Un GIF Tenor n'est PAS un fichier de notre
//    disque : il serait marqué expiré alors que l'URL distante fonctionne toujours,
//    et le message afficherait « pièce jointe expirée » à tort.
// =============================================================================

const GifPicker: React.FC<{ onPick: (url: string) => void; onClose: () => void }> = ({ onPick, onClose }) => {
  const [q, setQ] = useState('');
  const [gifs, setGifs] = useState<{ id: string; apercu: string | null; url: string; description: string }[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    let vivant = true;
    setChargement(true);
    // Anti-rafale : on ne lance la recherche qu'après une pause de frappe, sinon
    // chaque lettre déclenche un appel sortant.
    const t = window.setTimeout(() => {
      db.searchGifs(q)
        .then(r => { if (vivant) { setGifs(r); setErreur(''); } })
        .catch(e => { if (vivant) setErreur(e instanceof Error ? e.message : 'Recherche indisponible.'); })
        .finally(() => { if (vivant) setChargement(false); });
    }, q ? 350 : 0);
    return () => { vivant = false; window.clearTimeout(t); };
  }, [q]);

  return (
    <>
      <div className="p-2 border-b border-bony-border shrink-0">
        <div className="flex items-center gap-2 bg-bony-dark border border-bony-border rounded-lg px-2 py-1.5">
          <Search size={13} className="text-slate-500 shrink-0" />
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Rechercher un GIF…"
            autoFocus
            className="flex-1 bg-transparent text-xs text-bony-text outline-none placeholder-bony-muted"
          />
          {q && <button onClick={() => setQ('')}><X size={12} className="text-slate-400" /></button>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-1.5">
        {erreur && <p className="px-2 py-4 text-center text-[11px] text-red-500 font-bold">{erreur}</p>}
        {!erreur && chargement && <p className="px-2 py-4 text-center text-[11px] text-bony-muted">Chargement…</p>}
        {!erreur && !chargement && gifs.length === 0 && (
          <p className="px-2 py-4 text-center text-[11px] text-bony-muted">Aucun GIF trouvé.</p>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          {gifs.map(g => (
            <button
              key={g.id}
              onClick={() => { onPick(g.url); onClose(); }}
              title={g.description}
              className="rounded-lg overflow-hidden border border-bony-border hover:border-bony-orange transition"
            >
              <img src={g.apercu ?? g.url} alt={g.description} loading="lazy" className="w-full h-[80px] object-cover" />
            </button>
          ))}
        </div>
      </div>
      {/* Mention imposée par la licence Giphy — ne pas retirer. */}
      <div className="px-2 py-1 border-t border-bony-border shrink-0">
        <span className="text-[9px] text-bony-muted">Powered By GIPHY</span>
      </div>
    </>
  );
};

export default GifPicker;
