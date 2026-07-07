import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../auth/middleware';
import { emitEvent } from '../realtime';

const router = Router();
const prisma = new PrismaClient();

// Réservations : accessibles à TOUT utilisateur authentifié (Material.tsx ne
// restreint la réservation à aucun rôle côté UI — on reste cohérent avec ça,
// pas avec la règle "gestion" plus stricte du catalogue Equipment).
//
// Contrat aligné sur le frontend (types.ts EquipmentBooking + Material.tsx) :
// requis { equipmentId, quantity, startDate, endDate } (la validation du
// formulaire frontend), optionnels { site, service, brand, description }
// (défaut '' — colonnes non-nulles en base).
//
// AUCUNE vérification de disponibilité/chevauchement côté serveur : le
// frontend charge toutes les réservations et calcule la disponibilité en
// mémoire (getAvailability dans Material.tsx). Compromis assumé pour cette
// étape — le backend stocke et renvoie brut, comme Budget/FixedExpense.
// Pas de filtre par dates en query param : le frontend charge tout.

const isPositiveInt = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v > 0;
const isValidDateString = (v: unknown): v is string =>
  typeof v === 'string' && !isNaN(new Date(v).getTime());

// Valide les champs optionnels (types uniquement). Retourne un message d'erreur ou null.
const optionalFieldsError = (body: any): string | null => {
  for (const field of ['site', 'service', 'brand', 'description']) {
    if (body[field] !== undefined && typeof body[field] !== 'string') {
      return `Champ "${field}" invalide : chaîne attendue.`;
    }
  }
  return null;
};

router.get('/', authenticateToken, async (req, res) => {
  const bookings = await prisma.equipmentBooking.findMany({ orderBy: { startDate: 'desc' } });
  res.json(bookings);
});

router.post('/', authenticateToken, async (req, res) => {
  const { equipmentId, quantity, startDate, endDate } = req.body;

  if (typeof equipmentId !== 'string' || equipmentId.length === 0) {
    return res.status(400).json({ error: 'Champ "equipmentId" requis (chaîne non vide).' });
  }
  if (!isPositiveInt(quantity)) {
    return res.status(400).json({ error: 'Champ "quantity" requis (entier positif).' });
  }
  if (!isValidDateString(startDate)) {
    return res.status(400).json({ error: 'Champ "startDate" requis (date valide attendue).' });
  }
  if (!isValidDateString(endDate)) {
    return res.status(400).json({ error: 'Champ "endDate" requis (date valide attendue).' });
  }
  if (new Date(endDate) < new Date(startDate)) {
    return res.status(400).json({ error: 'Champ "endDate" invalide : doit être postérieure ou égale à "startDate".' });
  }
  const optErr = optionalFieldsError(req.body);
  if (optErr) {
    return res.status(400).json({ error: optErr });
  }

  const { site, service, brand, description } = req.body;
  try {
    const booking = await prisma.equipmentBooking.create({
      data: {
        equipmentId,
        quantity,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        site: site ?? '',
        service: service ?? '',
        brand: brand ?? '',
        description: description ?? ''
      }
    });
    emitEvent('equipment-booking:created', booking);
    res.json(booking);
  } catch (e) {
    // Violation FK : equipmentId ne référence aucun matériel existant.
    res.status(400).json({ error: 'Matériel (equipmentId) introuvable.' });
  }
});

// PUT /:id — mise à jour partielle (pattern fixedExpenses.ts)
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { equipmentId, quantity, startDate, endDate } = req.body;

  if (equipmentId !== undefined && (typeof equipmentId !== 'string' || equipmentId.length === 0)) {
    return res.status(400).json({ error: 'Champ "equipmentId" invalide (chaîne non vide attendue).' });
  }
  if (quantity !== undefined && !isPositiveInt(quantity)) {
    return res.status(400).json({ error: 'Champ "quantity" invalide (entier positif attendu).' });
  }
  if (startDate !== undefined && !isValidDateString(startDate)) {
    return res.status(400).json({ error: 'Champ "startDate" invalide (date valide attendue).' });
  }
  if (endDate !== undefined && !isValidDateString(endDate)) {
    return res.status(400).json({ error: 'Champ "endDate" invalide (date valide attendue).' });
  }
  const optErr = optionalFieldsError(req.body);
  if (optErr) {
    return res.status(400).json({ error: optErr });
  }

  const b = req.body;
  try {
    const booking = await prisma.equipmentBooking.update({
      where: { id },
      data: {
        ...(equipmentId !== undefined ? { equipmentId } : {}),
        ...(quantity !== undefined ? { quantity } : {}),
        ...(startDate !== undefined ? { startDate: new Date(startDate) } : {}),
        ...(endDate !== undefined ? { endDate: new Date(endDate) } : {}),
        ...(b.site !== undefined ? { site: b.site } : {}),
        ...(b.service !== undefined ? { service: b.service } : {}),
        ...(b.brand !== undefined ? { brand: b.brand } : {}),
        ...(b.description !== undefined ? { description: b.description } : {})
      }
    });
    emitEvent('equipment-booking:updated', booking);
    res.json(booking);
  } catch (e) {
    res.status(404).json({ error: 'Réservation introuvable (ou equipmentId invalide).' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.equipmentBooking.delete({ where: { id } });
    emitEvent('equipment-booking:deleted', id);
    res.sendStatus(204);
  } catch (e) {
    res.status(404).json({ error: 'Réservation introuvable.' });
  }
});

export default router;
