/* Lancers de référence et empreinte, communs à test-physique.mjs (Node) et test-physique.html (navigateur) :
   les deux doivent afficher les MÊMES empreintes. */

export const REFERENCES = [
  { position: 0.2, angle: 0.0262851, vitesse: 8.5, effet: 1 },             // poche, crochet maximal
  { position: 0.3, angle: 0.0433646, vitesse: 8.5, effet: 1 },             // poche, plus extérieur
  { position: 0, angle: 0.0036312, vitesse: 8.5, effet: 0 },               // poche, boule droite
  { position: 0.25, angle: 0.0146898, vitesse: 8.5, effet: 1 },            // Brooklyn
  { position: 0, angle: 0, vitesse: 8.5, effet: 0 },                       // plein centre (nez)
  { position: -0.1, angle: 0.0344529, vitesse: 8, effet: 0 },              // frôle la 10
  { position: 0.1, angle: -0.01, vitesse: 4, effet: 0.4, lacher: 0.3 },    // lent, lâcher raté
];

/** FNV-1a 32 bits sur le JSON du résultat (images, contacts, roulement, restent…). */
export function empreinte(res) {
  const s = JSON.stringify(res);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
