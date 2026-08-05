import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { GameProps, Connect4Board } from './gameTypes';

// ============================================================================
// PUISSANCE 4 — réécrit le 05/08/2026
//
// ⚠️ Comme le morpion, plus aucune règle ici. L'ancienne version dupliquait
// `dropRow` et `checkWinner`, désormais côté serveur — qui renvoie `winningLine`
// et `lastMove` dans le plateau. On ne joue qu'une COLONNE : la gravité est
// appliquée par le serveur, le client n'a pas à deviner la ligne d'arrivée.
// ============================================================================

const ROWS = 6;
const COLS = 7;

const Connect4: React.FC<GameProps> = ({ session, myId, onMove }) => {
  const board = session.board as Connect4Board;
  const cells = board?.cells ?? Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const ligne = board?.winningLine ?? [];
  const dernier = board?.lastMove;
  const monTour = session.currentTurn === myId;
  const fini = session.status === 'finished';
  const [msg, setMsg] = useState('');
  const [survol, setSurvol] = useState<number | null>(null);

  const estGagnante = (r: number, c: number) => ligne.some(([lr, lc]) => lr === r && lc === c);
  const colonnePleine = (c: number) => cells[0][c] !== null;

  const jouer = async (c: number) => {
    if (!monTour || fini || colonnePleine(c)) return;
    const r = await onMove({ col: c });
    setMsg(r.error ?? '');
  };

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl px-4 py-2.5 text-center text-xs font-bold transition-colors ${
        fini ? 'bg-white/5 text-bony-muted' : monTour ? 'gx-gradient text-white shadow-glow' : 'bg-white/5 text-bony-muted'
      }`}>
        {fini ? 'Partie terminée' : monTour ? 'À vous de jouer' : 'Au tour de votre adversaire…'}
      </div>

      {msg && <p className="text-[11px] text-center text-bony-orange">{msg}</p>}

      <div className="max-w-[420px] mx-auto">
        {/* Indicateurs de colonne : on joue une colonne, l'affordance doit donc
            porter sur la colonne entière et pas sur une case. */}
        <div className="grid grid-cols-7 gap-1.5 mb-1">
          {Array.from({ length: COLS }, (_, c) => {
            const actif = monTour && !fini && !colonnePleine(c);
            return (
              <button
                key={c}
                type="button"
                disabled={!actif}
                onClick={() => jouer(c)}
                onMouseEnter={() => setSurvol(c)}
                onMouseLeave={() => setSurvol(null)}
                aria-label={`Jouer colonne ${c + 1}`}
                className={`min-h-[28px] rounded-lg flex items-center justify-center transition-all ${
                  actif ? 'text-bony-orange hover:bg-bony-orange/10' : 'text-transparent'
                }`}
              >
                <ChevronDown size={16} className={survol === c && actif ? 'translate-y-0.5' : ''} />
              </button>
            );
          })}
        </div>

        {/* Plateau : fond bleu de charte, cellules en `aspect-square` — plus de
            `w-10` fixes, qui rendaient la grille plus large que l'écran. */}
        <div className="rounded-2xl bg-bony-blue/10 dark:bg-bony-blue/20 border border-bony-border p-1.5">
          <div className="grid grid-cols-7 gap-1.5">
            {cells.flatMap((row, r) =>
              row.map((v, c) => {
                const gagnante = estGagnante(r, c);
                const estDernier = dernier?.[0] === r && dernier?.[1] === c;
                return (
                  <button
                    key={`${r}-${c}`}
                    type="button"
                    disabled={!monTour || fini || colonnePleine(c)}
                    onClick={() => jouer(c)}
                    onMouseEnter={() => setSurvol(c)}
                    onMouseLeave={() => setSurvol(null)}
                    aria-label={`Colonne ${c + 1}, ligne ${r + 1}`}
                    className={[
                      'aspect-square rounded-full transition-all duration-200 border',
                      v === 'p1' ? 'bg-bony-orange border-bony-orange'
                        : v === 'p2' ? 'bg-bony-violet border-bony-violet'
                        : survol === c && monTour && !fini && !colonnePleine(c)
                          ? 'bg-bony-orange/15 border-bony-orange/40'
                          : 'bg-white/70 dark:bg-black/30 border-transparent',
                      gagnante ? 'ring-2 ring-white shadow-glow scale-105' : '',
                      estDernier && !gagnante ? 'ring-1 ring-white/50' : '',
                    ].join(' ')}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Connect4;
