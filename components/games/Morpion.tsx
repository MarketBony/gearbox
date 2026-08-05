import React, { useState } from 'react';
import { X, Circle } from 'lucide-react';
import { GameProps, MorpionBoard } from './gameTypes';

// ============================================================================
// MORPION — réécrit le 05/08/2026
//
// ⚠️ Plus aucune règle n'est calculée ici. L'ancienne version embarquait ses
// propres `WIN_LINES` et son `checkWinner`, en doublon de ce que fait désormais le
// serveur — qui valide le coup, détecte l'alignement et renvoie `winningLine`
// dans le plateau. Deux logiques de victoire finiraient par diverger, exactement
// comme Budget et Dashboard quatre fois de suite. Ce composant affiche et saisit.
// ============================================================================

const Morpion: React.FC<GameProps> = ({ session, myId, onMove }) => {
  const board = session.board as MorpionBoard;
  const cells = board?.cells ?? Array(9).fill(null);
  const ligne = board?.winningLine ?? [];
  const monTour = session.currentTurn === myId;
  const fini = session.status === 'finished';
  const [msg, setMsg] = useState('');

  const jouer = async (i: number) => {
    if (!monTour || fini || cells[i]) return;
    const r = await onMove({ index: i });
    setMsg(r.error ?? '');
  };

  const marque = (v: string | null, gagnante: boolean) => {
    if (!v) return null;
    const cls = `transition-transform duration-200 ${gagnante ? 'scale-110' : ''}`;
    // p1 = croix orange, p2 = cercle violet : les deux accents de la charte, et
    // deux FORMES différentes — la couleur seule ne doit pas porter l'information.
    return v === 'p1'
      ? <X className={`text-bony-orange ${cls}`} strokeWidth={3} size="58%" />
      : <Circle className={`text-bony-violet ${cls}`} strokeWidth={3} size="50%" />;
  };

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl px-4 py-2.5 text-center text-xs font-bold transition-colors ${
        fini ? 'bg-white/5 text-bony-muted' : monTour ? 'gx-gradient text-white shadow-glow' : 'bg-white/5 text-bony-muted'
      }`}>
        {fini ? 'Partie terminée' : monTour ? 'À vous de jouer' : 'Au tour de votre adversaire…'}
      </div>

      {msg && <p className="text-[11px] text-center text-bony-orange">{msg}</p>}

      {/* Cellules en `aspect-square` dimensionnées par le conteneur : les `w-10`
          fixes d'avant débordaient sous 375 px. */}
      <div className="max-w-[320px] mx-auto grid grid-cols-3 gap-2">
        {cells.map((v, i) => {
          const gagnante = ligne.includes(i);
          const cliquable = monTour && !fini && !v;
          return (
            <button
              key={i}
              type="button"
              disabled={!cliquable}
              onClick={() => jouer(i)}
              aria-label={`Case ${i + 1}`}
              className={[
                'aspect-square rounded-2xl flex items-center justify-center border transition-all duration-200',
                gagnante ? 'border-bony-orange bg-bony-orange/10 shadow-glow' : 'border-bony-border bg-white/[0.03]',
                cliquable ? 'hover:border-bony-orange/60 hover:bg-bony-orange/5 cursor-pointer' : '',
              ].join(' ')}
            >
              {marque(v, gagnante)}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default Morpion;
