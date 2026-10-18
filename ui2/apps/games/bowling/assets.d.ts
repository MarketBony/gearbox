// Ressources servies par Vite (`?url` : le fichier part dans le build avec une empreinte, on reçoit son URL).
declare module '*.svg?url' {
  const url: string;
  export default url;
}
