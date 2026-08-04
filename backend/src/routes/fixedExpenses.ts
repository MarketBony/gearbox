import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, requireRole } from '../auth/middleware';
import { emitEvent } from '../realtime';

const router = Router();
const prisma = new PrismaClient();

// Mutations réservées aux rôles autorisés à modifier le budget.
const EDIT_ROLES = ['Master', 'Administrator', 'Director', 'Coordinator', 'Digital Manager'];

// Contrat aligné sur le frontend (types.ts FixedExpense + pages/FixedExpenses.tsx) :
// { date, service, site, sites?, budgetDistribution?, comment, amount,
//   brand?, brands?, alpineShare?, nissanShare?, proPlus?, isAnnual? }
// Colonnes stockées BRUTES : aucun calcul métier côté serveur (pas de
// fractionnement /12 pour isAnnual, pas de routage Alpine/Nissan) —
// toute l'agrégation reste côté frontend (pages/Budget.tsx).

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');

// budgetDistribution : Record<string, number> — clés = noms de sites (liste
// maintenue côté frontend, pas de contrôle des valeurs exactes ici),
// valeurs = nombres finis.
const budgetDistributionError = (v: unknown): string | null => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    return 'Champ "budgetDistribution" invalide : objet { site: nombre } attendu.';
  }
  for (const [key, val] of Object.entries(v)) {
    if (!isFiniteNumber(val)) {
      return `Champ "budgetDistribution" invalide : la valeur de "${key}" doit être un nombre.`;
    }
  }
  return null;
};

// Valide les champs optionnels communs à POST et PUT. Retourne un message d'erreur ou null.
const optionalFieldsError = (body: any): string | null => {
  if (body.sites !== undefined && !isStringArray(body.sites)) {
    return 'Champ "sites" invalide : tableau de chaînes attendu.';
  }
  if (body.budgetDistribution !== undefined && body.budgetDistribution !== null) {
    const err = budgetDistributionError(body.budgetDistribution);
    if (err) return err;
  }
  if (body.brand !== undefined && body.brand !== null && typeof body.brand !== 'string') {
    return 'Champ "brand" invalide : chaîne attendue.';
  }
  if (body.brands !== undefined && !isStringArray(body.brands)) {
    return 'Champ "brands" invalide : tableau de chaînes attendu.';
  }
  if (body.alpineShare !== undefined && body.alpineShare !== null && !isFiniteNumber(body.alpineShare)) {
    return 'Champ "alpineShare" invalide : nombre attendu.';
  }
  if (body.nissanShare !== undefined && body.nissanShare !== null && !isFiniteNumber(body.nissanShare)) {
    return 'Champ "nissanShare" invalide : nombre attendu.';
  }
  if (body.proPlus !== undefined && typeof body.proPlus !== 'boolean') {
    return 'Champ "proPlus" invalide : booléen attendu.';
  }
  if (body.isAnnual !== undefined && typeof body.isAnnual !== 'boolean') {
    return 'Champ "isAnnual" invalide : booléen attendu.';
  }
  if (body.comment !== undefined && typeof body.comment !== 'string') {
    return 'Champ "comment" invalide : chaîne attendue.';
  }
  return null;
};

router.get('/', authenticateToken, async (req, res) => {
  const expenses = await prisma.fixedExpense.findMany({
    orderBy: { date: 'desc' }
  });
  res.json(expenses);
});

router.post('/', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const { date, service, site, amount } = req.body;

  // Champs obligatoires — mêmes exigences que le formulaire frontend (Date, Montant, Site, Service).
  if (typeof date !== 'string' || isNaN(new Date(date).getTime())) {
    return res.status(400).json({ error: 'Champ "date" requis (date valide attendue).' });
  }
  if (typeof service !== 'string' || service.length === 0) {
    return res.status(400).json({ error: 'Champ "service" requis (chaîne non vide).' });
  }
  if (typeof site !== 'string' || site.length === 0) {
    return res.status(400).json({ error: 'Champ "site" requis (chaîne non vide).' });
  }
  if (!isFiniteNumber(amount)) {
    return res.status(400).json({ error: 'Champ "amount" requis (nombre attendu).' });
  }
  const optErr = optionalFieldsError(req.body);
  if (optErr) {
    return res.status(400).json({ error: optErr });
  }

  const { sites, budgetDistribution, comment, brand, brands, alpineShare, nissanShare, proPlus, isAnnual } = req.body;
  const expense = await prisma.fixedExpense.create({
    data: {
      date: new Date(date),
      service,
      site,
      sites: sites ?? [],
      budgetDistribution: budgetDistribution ?? undefined,
      comment: comment ?? '',
      amount,
      brand: brand ?? undefined,
      brands: brands ?? [],
      alpineShare: alpineShare ?? undefined,
      nissanShare: nissanShare ?? undefined,
      proPlus: proPlus ?? false,
      isAnnual: isAnnual ?? false
    }
  });
  emitEvent('fixed-expense:created', expense);
  res.json(expense);
});

// PUT /:id — mise à jour partielle (même pattern que budget.ts : seuls les champs fournis sont modifiés)
router.put('/:id', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const { id } = req.params;
  const { date, service, site, amount } = req.body;

  if (date !== undefined && (typeof date !== 'string' || isNaN(new Date(date).getTime()))) {
    return res.status(400).json({ error: 'Champ "date" invalide (date valide attendue).' });
  }
  if (service !== undefined && (typeof service !== 'string' || service.length === 0)) {
    return res.status(400).json({ error: 'Champ "service" invalide (chaîne non vide attendue).' });
  }
  if (site !== undefined && (typeof site !== 'string' || site.length === 0)) {
    return res.status(400).json({ error: 'Champ "site" invalide (chaîne non vide attendue).' });
  }
  if (amount !== undefined && !isFiniteNumber(amount)) {
    return res.status(400).json({ error: 'Champ "amount" invalide (nombre attendu).' });
  }
  const optErr = optionalFieldsError(req.body);
  if (optErr) {
    return res.status(400).json({ error: optErr });
  }

  const b = req.body;
  try {
    const expense = await prisma.fixedExpense.update({
      where: { id },
      data: {
        ...(date !== undefined ? { date: new Date(date) } : {}),
        ...(service !== undefined ? { service } : {}),
        ...(site !== undefined ? { site } : {}),
        ...(amount !== undefined ? { amount } : {}),
        ...(b.sites !== undefined ? { sites: b.sites } : {}),
        ...(b.budgetDistribution !== undefined ? { budgetDistribution: b.budgetDistribution } : {}),
        ...(b.comment !== undefined ? { comment: b.comment } : {}),
        ...(b.brand !== undefined ? { brand: b.brand } : {}),
        ...(b.brands !== undefined ? { brands: b.brands } : {}),
        ...(b.alpineShare !== undefined ? { alpineShare: b.alpineShare } : {}),
        ...(b.nissanShare !== undefined ? { nissanShare: b.nissanShare } : {}),
        ...(b.proPlus !== undefined ? { proPlus: b.proPlus } : {}),
        ...(b.isAnnual !== undefined ? { isAnnual: b.isAnnual } : {})
      }
    });
    emitEvent('fixed-expense:updated', expense);
    res.json(expense);
  } catch (e) {
    res.status(404).json({ error: 'Dépense fixe introuvable.' });
  }
});

router.delete('/:id', authenticateToken, requireRole(EDIT_ROLES), async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.fixedExpense.delete({ where: { id } });
    emitEvent('fixed-expense:deleted', id);
    res.sendStatus(204);
  } catch (e) {
    res.status(404).json({ error: 'Dépense fixe introuvable.' });
  }
});

export default router;
