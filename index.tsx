import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// Import pour EFFET DE BORD, volontairement avant le rendu : le navigateur émet
// `beforeinstallprompt` très tôt et ne le rejoue pas. Écouté plus tard (à
// l'ouverture de la modale d'installation), l'événement serait déjà passé.
import './services/pwaInstall';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);