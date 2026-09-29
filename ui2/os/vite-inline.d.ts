// Imports CSS en chaîne (Vite) : feuille injectée dans la racine fantôme de la coque v2.
declare module "*.css?inline" {
  const css: string;
  export default css;
}
