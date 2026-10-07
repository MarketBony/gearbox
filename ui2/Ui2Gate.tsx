import React, { Suspense, lazy } from 'react';
import type { OsHostProps as Ui2RootProps } from './os/OsHost';
import { setFitCover } from './os/viewport';

// Porte d'entrée de l'interface v2, chargée avec l'ancienne. Tout le reste (coque, CSS)
// est en différé : l'ancien bundle ne grossit pas, et la feuille v2 n'est chargée que
// par ceux qui ont activé la bêta.
// Hôte de la coque Gearbox OS (portage 1:1 de la maquette, Shadow DOM) — ui2/os/.
const Ui2Root = lazy(() => import('./os/OsHost'));

// Filet : si la coque plante (ou si son morceau de code ne se charge pas, par exemple
// juste après un déploiement), on coupe la bêta et l'ancienne interface revient.
type BoundaryProps = { onFail: () => void; children: React.ReactNode };
class Ui2Boundary extends React.Component<BoundaryProps, { failed: boolean }> {
  declare props: Readonly<BoundaryProps>;
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) {
    console.error('[ui2] la nouvelle interface a planté, retour à l\'ancienne', error);
    setFitCover(false);   // posé par la coque téléphone ; l'ancienne interface ne gère pas les marges de sécurité
    this.props.onFail();
  }
  render() { return this.state.failed ? null : this.props.children; }
}

const Ui2Gate: React.FC<Ui2RootProps> = (props) => (
  <Ui2Boundary onFail={props.onExit}>
    <Suspense fallback={<div className="h-screen bg-black" />}>
      <Ui2Root {...props} />
    </Suspense>
  </Ui2Boundary>
);

export default Ui2Gate;
