import React from 'react';
import { Filter, X } from 'lucide-react';
import { useSessionState } from '../hooks/useSessionState';

// ============================================================================
// COQUILLE DE FILTRES REPLIABLE (mobile uniquement) — 05/08/2026
//
// Sur smartphone, les barres de filtres du Dashboard et de Digital occupaient la
// quasi-totalité de l'écran avant la première donnée : six blocs empilés côté
// Dashboard, quatre rangées pleine largeur côté Digital. Signalé par Théo,
// capture à l'appui.
//
// Ce composant ne gère QUE l'enveloppe : chaque page fournit ses propres
// contrôles en `children` et son propre résumé (elle seule sait ce que ses
// filtres veulent dire). On ne centralise pas les filtres eux-mêmes — ce serait
// un couplage inutile entre des écrans qui n'ont pas les mêmes.
//
// ⚠️ DEUX PROPRIÉTÉS À PRÉSERVER :
//  1. **À partir de `md`, le rendu est INCHANGÉ** : les enfants sont affichés tels
//     quels, sans barre ni bouton. L'écran de travail de Théo (~1660 px) et le
//     confort desktop ne doivent pas payer une correction mobile.
//  2. **Les enfants ne sont montés QU'UNE FOIS.** On les masque avec `hidden`
//     plutôt que de les rendre conditionnellement : un double montage
//     dupliquerait les états internes des sélecteurs (panneaux ouverts, etc.) et
//     un `{open && children}` ferait perdre ces états à chaque repli.
// ============================================================================

interface CollapsibleFiltersProps {
  /** Clé de persistance de l'état ouvert/fermé (préfixée par useSessionState). */
  storageKey: string;
  /**
   * Résumé compact affiché quand la barre est repliée, du type
   * « 2026 · Tout le réseau · Toutes ». Choix explicite de Théo : replier sans
   * montrer l'état ferait lire les chiffres de travers, c'est le vrai risque.
   */
  summary: string;
  /** Nombre de filtres actifs — alimente la pastille et l'accent du bouton. */
  activeCount: number;
  children: React.ReactNode;
}

const CollapsibleFilters: React.FC<CollapsibleFiltersProps> = ({
  storageKey, summary, activeCount, children,
}) => {
  const [open, setOpen] = useSessionState<boolean>(`${storageKey}_filtersOpen`, false);

  return (
    <div>
      {/* Barre fine — mobile uniquement. `md:hidden` la fait disparaître dès que
          la place ne manque plus. */}
      <div className="md:hidden flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className={`relative shrink-0 min-h-[44px] px-3 rounded-xl border flex items-center gap-1.5 text-[11px] font-bold transition-colors ${
            open || activeCount > 0
              ? 'bg-bony-orange text-white border-bony-orange'
              : 'bg-slate-100 dark:bg-black/30 text-slate-500 border-bony-border'
          }`}
        >
          {open ? <X size={14} /> : <Filter size={14} />}
          Filtres
          {/* La pastille n'a de sens que replié : ouvert, on voit les filtres. */}
          {!open && activeCount > 0 && (
            <span className="ml-0.5 min-w-[16px] h-4 px-1 rounded-full bg-white text-bony-orange text-[9px] font-bold flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </button>
        {!open && (
          <span className="text-[10px] text-slate-500 dark:text-bony-muted truncate" title={summary}>
            {summary}
          </span>
        )}
      </div>

      {/* Les contrôles : masqués sous md quand c'est replié, TOUJOURS visibles à
          partir de md. `mt-2 md:mt-0` évite un espace mort en desktop. */}
      <div className={`${open ? 'mt-2 md:mt-0' : 'hidden md:block'}`}>
        {children}
      </div>
    </div>
  );
};

export default CollapsibleFilters;
