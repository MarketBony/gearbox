import { Router } from 'express';
import { PrismaClient, EquipmentBooking } from '@prisma/client';
import { authenticateToken } from '../auth/middleware';
import { emitEvent } from '../realtime';
import { checkAvailability, overCapacityMessage, AvailabilityCheck } from '../utils/availability';

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
// Disponibilité vérifiée CÔTÉ SERVEUR depuis le 30/07/2026 (POST et PUT), via
// `utils/availability.ts` : le calcul en mémoire du frontend
// (`getAvailability` dans Material.tsx) reste utile pour l'affichage, mais il
// ne protège de rien — deux personnes qui réservent en même temps lisent
// chacune une liste qui ignore l'autre. Réponse 409 en cas de dépassement.
// Pas de filtre par dates en query param : le frontend charge tout.

// Résultat des transactions POST/PUT. Discriminant `kind` explicite : le
// tsconfig racine compile aussi ce dossier sans `strict`, où l'affinement sur un
// champ booléen (`ok`) ne fonctionne pas de façon fiable.
type BookingOutcome =
  | { kind: 'created'; booking: EquipmentBooking }
  | { kind: 'updated'; booking: EquipmentBooking }
  | { kind: 'equipment-not-found' }
  | { kind: 'booking-not-found' }
  | { kind: 'bad-dates' }
  | { kind: 'over-capacity'; totalQuantity: number; available: number; quantity: number };

// Traduit un échec de disponibilité en résultat de route, ou `null` si le
// matériel est disponible. `quantity` est la quantité EFFECTIVE (elle peut venir
// de la ligne existante lors d'un PUT partiel) : c'est elle que le message
// d'erreur doit annoncer.
const toFailure = (check: AvailabilityCheck, quantity: number): BookingOutcome | null => {
  if (check.status === 'equipment-not-found') return { kind: 'equipment-not-found' };
  if (check.status === 'over-capacity') {
    return {
      kind: 'over-capacity',
      totalQuantity: check.totalQuantity,
      available: check.available,
      quantity
    };
  }
  return null;
};

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

  // Contrôle et écriture dans la MÊME transaction : c'est le seul moyen que le
  // verrou consultatif de checkAvailability() serve à quelque chose.
  //
  // Le résultat porte un discriminant `kind` EXPLICITE plutôt que de s'appuyer
  // sur l'affinement d'un booléen : le tsconfig racine compile aussi ce dossier,
  // sans `strict`, et y narguait le narrowing sur `ok`.
  const issue = await prisma.$transaction(async (tx): Promise<BookingOutcome> => {
    const echec = toFailure(
      await checkAvailability(tx, { equipmentId, quantity, startDate, endDate }),
      quantity
    );
    if (echec) return echec;

    const booking = await tx.equipmentBooking.create({
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
    return { kind: 'created', booking };
  });

  if (issue.kind === 'equipment-not-found') {
    // Statut conservé à 400 : c'était déjà la réponse de la violation de FK.
    return res.status(400).json({ error: 'Matériel (equipmentId) introuvable.' });
  }
  if (issue.kind === 'over-capacity') {
    return res.status(409).json({ error: overCapacityMessage(issue) });
  }
  if (issue.kind !== 'created') {
    return res.status(400).json({ error: 'Réservation invalide.' });
  }

  emitEvent('equipment-booking:created', issue.booking);
  res.json(issue.booking);
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
  // Mise à jour PARTIELLE : la disponibilité doit être évaluée sur les valeurs
  // EFFECTIVES après fusion, pas sur celles du corps de la requête. Sans ça, un
  // PUT ne portant que `quantity` serait contrôlé avec des dates inconnues.
  const issue = await prisma.$transaction(async (tx): Promise<BookingOutcome> => {
    const existing = await tx.equipmentBooking.findUnique({ where: { id } });
    if (!existing) return { kind: 'booking-not-found' };

    const effectif = {
      equipmentId: equipmentId ?? existing.equipmentId,
      quantity: quantity ?? existing.quantity,
      startDate: startDate ?? existing.startDate,
      endDate: endDate ?? existing.endDate
    };

    // Cohérence des dates effectives : un PUT ne portant que `endDate` pouvait
    // jusqu'ici la placer AVANT le début, le contrôle croisé n'existant que
    // dans le POST.
    if (new Date(effectif.endDate) < new Date(effectif.startDate)) {
      return { kind: 'bad-dates' };
    }

    const echec = toFailure(
      await checkAvailability(tx, { ...effectif, excludeBookingId: id }),
      effectif.quantity
    );
    if (echec) return echec;

    const booking = await tx.equipmentBooking.update({
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
    return { kind: 'updated', booking };
  });

  if (issue.kind === 'booking-not-found' || issue.kind === 'equipment-not-found') {
    return res.status(404).json({ error: 'Réservation introuvable (ou equipmentId invalide).' });
  }
  if (issue.kind === 'bad-dates') {
    return res.status(400).json({ error: 'Champ "endDate" invalide : doit être postérieure ou égale à "startDate".' });
  }
  if (issue.kind === 'over-capacity') {
    return res.status(409).json({ error: overCapacityMessage(issue) });
  }
  if (issue.kind !== 'updated') {
    return res.status(400).json({ error: 'Réservation invalide.' });
  }

  emitEvent('equipment-booking:updated', issue.booking);
  res.json(issue.booking);
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
