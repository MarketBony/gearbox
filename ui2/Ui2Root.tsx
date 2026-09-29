import React from 'react';
import './styles/tokens.css';
import './styles/shell.css';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

// Coque de l'interface v2 (Gearbox OS). Chargée en différé par App.tsx, uniquement quand
// la bêta est active. Lot 0 : coque VIDE — la vraie coque (fenêtres, Dock, barre du haut,
// widgets, fonds) arrive au lot 1, les rubriques aux lots 2 → 16.
// ⚠️ Aucune logique métier ni de droits ici : l'onglet reçu est DÉJÀ résolu par les
// gardes de rôle d'App.tsx, et les données passeront par dataService comme partout.

export interface Ui2RootProps {
  /** Rubrique après les gardes de rôle d'App.tsx. */
  tab: string;
  /** Retour à l'ancienne interface (coupe la préférence bêta). */
  onExit: () => void;
}

const Ui2Root: React.FC<Ui2RootProps> = ({ tab, onExit }) => {
  const { user } = useAuth();
  const { theme } = useTheme();

  return (
    <div className="gx2" data-theme={theme === 'light' ? 'light' : 'dark'} data-material="liquid">
      <header className="gx2-bar">
        <span className="gx2-brand">Gearbox OS</span>
        <span className="gx2-beta">bêta</span>
        <span className="gx2-grow" />
        <span className="gx2-user">{user?.name}</span>
        <button type="button" className="gx2-btn" onClick={onExit}>
          Revenir à l'ancienne interface
        </button>
      </header>
      <main className="gx2-empty">
        <div className="gx2-card">
          <h1>Nouvelle interface en construction</h1>
          <p>
            La rubrique <strong>{tab}</strong> n'est pas encore portée. Tu peux revenir à l'ancienne
            interface à tout moment, ici ou dans Paramètres.
          </p>
          <button type="button" className="gx2-btn gx2-btn-primary" onClick={onExit}>
            Revenir à l'ancienne interface
          </button>
        </div>
      </main>
    </div>
  );
};

export default Ui2Root;
