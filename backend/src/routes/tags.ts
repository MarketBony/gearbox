import { Router } from 'express';
import { authenticateToken, requireRole } from '../auth/middleware';
import { emitEvent } from '../realtime';
import { prisma } from '../db';

const router = Router();
// 'Digital Manager' avec espace (rôle réel en base) — 'DigitalManager' ne matchait jamais.
// ⚠️ 'External' ajouté le 25/08/2026 : Théo lui a donné l'accès TOTAL au Digital,
// tags compris. Sans cette ligne, l'écran lui afficherait des contrôles de tags que
// l'API refuserait en 403 — le motif « l'interface ment » qui a déjà coûté deux passes.
// Doit rester aligné sur `DIGITAL_EDIT_ROLES` de constants.ts et sur social.ts.
const EDIT_ROLES = ['Master', 'Administrator', 'Director', 'Digital Manager', 'External'];

/**
 * Catégories de tags ÉDITABLES — liste blanche, et frontière à ne pas déplacer sans y
 * réfléchir.
 *
 * ⚠️ Ces trois-là sont ouvertes précisément parce que les champs correspondants de
 * `SocialPost` sont des `String` LIBRES (`networks`, `co2`, `lom`). Marques, services,
 * statuts et sites sont adossés à des types de `types.ts`, indexent des dictionnaires de
 * couleurs (`BRAND_COLORS`) et pilotent des tests métier : les rendre éditables en base
 * supprimerait la garantie de compilation sans rien mettre à la place, puisque le schéma
 * Prisma n'a AUCUN enum et qu'aucune route ne valide ces valeurs.
 *
 * ⚠️ Cette liste blanche existe aussi parce que le POST passait `req.body` BRUT à Prisma :
 * un `id` envoyé par un client aurait tenté de réécrire la clé primaire, et n'importe
 * quel champ inconnu faisait échouer la requête. On ne retient donc que ce qu'on connaît.
 */
const CATEGORIES = ['networks', 'co2', 'lom'] as const;
type Categorie = typeof CATEGORIES[number];

const MAX_TAGS = 200;
const MAX_LONGUEUR = 80;

/** Nettoie une catégorie : chaînes non vides, taillées, dédoublonnées, bornées. */
const nettoyerListe = (valeur: unknown): string[] => {
  if (!Array.isArray(valeur)) return [];
  const vus = new Set<string>();
  const sortie: string[] = [];
  for (const v of valeur) {
    if (typeof v !== 'string') continue;
    const t = v.replace(/[\x00-\x1f]/g, '').trim().slice(0, MAX_LONGUEUR);
    if (!t || vus.has(t)) continue;
    vus.add(t);
    sortie.push(t);
    if (sortie.length >= MAX_TAGS) break;
  }
  return sortie;
};

const VIDE = { networks: [] as string[], co2: [] as string[], lom: [] as string[] };

router.get('/', authenticateToken, async (req, res) => {
  const tags = await prisma.digitalTags.findFirst();
  res.json(tags || VIDE);
});

router.post('/', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  // Seules les catégories connues sont retenues, et seulement si le corps les porte —
  // un client qui n'envoie que `networks` ne doit pas vider `co2` et `lom`.
  const data: Partial<Record<Categorie, string[]>> = {};
  for (const c of CATEGORIES) {
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, c)) data[c] = nettoyerListe(req.body[c]);
  }
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'Aucune catégorie de tags reconnue dans la requête.' });
  }

  // ⚠️ UNE SEULE LIGNE dans cette table, par construction. `upsert` n'est pas utilisable
  // ici : il lui faudrait un identifiant stable, or l'id est un uuid généré.
  const premier = await prisma.digitalTags.findFirst();
  const tags = premier
    ? await prisma.digitalTags.update({ where: { id: premier.id }, data })
    : await prisma.digitalTags.create({ data: { ...VIDE, ...data } });

  emitEvent('tags:updated', tags);
  res.json(tags);
});

export default router;
