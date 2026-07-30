import { Prisma } from '@prisma/client';

// =====================================================================
// DISPONIBILITÉ DU MATÉRIEL — contrôle serveur des sur-réservations
//
// Jusqu'au 30/07/2026, la disponibilité n'était calculée QUE côté client
// (`getAvailability` dans pages/Material.tsx) : deux personnes réservant le
// même matériel sur la même période en même temps passaient toutes les deux,
// chacune ayant lu une liste de réservations qui ignorait l'autre.
//
// Deux règles à ne pas confondre, et c'est tout l'enjeu de ce fichier :
//
//  1. Le besoin se mesure en **pic jour par jour**, PAS en somme des
//     réservations qui chevauchent la période. Deux réservations qui croisent
//     la période demandée sans se croiser entre elles ne s'additionnent pas.
//     Sommer naïvement refuserait des réservations parfaitement légitimes.
//
//  2. Le contrôle doit être **sérialisé par matériel**, sinon il ne sert à
//     rien : lire puis écrire dans une transaction ne suffit pas (en isolation
//     Read Committed, deux transactions lisent le même état et valident
//     toutes les deux). D'où le verrou consultatif ci-dessous.
//
// La règle métier reste identique à celle du front, volontairement : le
// serveur est le garde-fou, pas une seconde règle divergente.
// =====================================================================

// Les dates circulent en 'yyyy-MM-dd' et sont stockées à minuit UTC. On ramène
// tout au jour UTC : les bornes sont inclusives, à la journée, comme côté front.
const toDayUtc = (d: Date | string): number => {
  const x = new Date(d);
  return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
};

// FNV-1a 32 bits — hachage déterministe de l'id matériel pour le verrou.
// `| 0` ramène dans l'intervalle d'un int4 signé, ce qu'attend Postgres.
const hash32 = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
};

// Espace de noms des verrous consultatifs. Un seul usage aujourd'hui ; à
// incrémenter si un autre module en introduit, pour éviter les collisions.
const LOCK_NAMESPACE_BOOKINGS = 1;

// Discriminant TEXTE (`status`) et non booléen : le tsconfig racine du projet
// compile aussi `backend/src` et n'active pas `strict`. Or sans
// strictNullChecks, l'affinement de type sur un champ booléen ne s'applique
// pas — un `if (!check.ok)` ne narguait rien et le code ne compilait que dans
// la config du backend. Un `status === '...'` narrow dans les deux cas.
export type AvailabilityCheck =
  | { status: 'available'; totalQuantity: number; peak: number; available: number }
  | { status: 'equipment-not-found' }
  | { status: 'over-capacity'; totalQuantity: number; peak: number; available: number };

interface CheckInput {
  equipmentId: string;
  quantity: number;
  startDate: Date | string;
  endDate: Date | string;
  /** Réservation à ignorer dans le calcul : sa propre ligne, lors d'un PUT. */
  excludeBookingId?: string;
}

/**
 * À appeler DANS une transaction Prisma (`prisma.$transaction`) : le verrou
 * consultatif est porté par la transaction et relâché au commit. C'est ce qui
 * rend le contrôle fiable face à deux requêtes simultanées.
 */
export const checkAvailability = async (
  tx: Prisma.TransactionClient,
  { equipmentId, quantity, startDate, endDate, excludeBookingId }: CheckInput
): Promise<AvailabilityCheck> => {
  // Sérialise vérification + écriture pour CE matériel. Verrou transactionnel
  // (`_xact_`) et non de session : le pooler Supabase est en mode transaction,
  // un verrou de session y survivrait mal.
  //
  // `$executeRaw` et non `$queryRaw` : pg_advisory_xact_lock renvoie `void`, un
  // type que Prisma ne sait pas désérialiser (P2010 « Failed to deserialize
  // column of type 'void' »). $executeRaw ne lit aucune colonne.
  // Mesuré le 30/07/2026 sur 6 requêtes simultanées, stock 2 : SANS ce verrou,
  // 6 réservations acceptées et 6 unités engagées (sur-réservation de 300 %) ;
  // AVEC, exactement 2 acceptées et 4 refusées en 409. Le contrôle seul ne
  // protège de rien, c'est cette ligne qui fait le travail.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE_BOOKINGS}::int4, ${hash32(equipmentId)}::int4)`;

  const equipment = await tx.equipment.findUnique({
    where: { id: equipmentId },
    select: { totalQuantity: true }
  });
  if (!equipment) return { status: 'equipment-not-found' };

  const start = toDayUtc(startDate);
  const end = toDayUtc(endDate);

  // Chevauchement inclusif : `debutAutre <= finDemandee && finAutre >= debutDemandee`.
  const overlapping = await tx.equipmentBooking.findMany({
    where: {
      equipmentId,
      startDate: { lte: new Date(end) },
      endDate: { gte: new Date(start) },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {})
    },
    select: { quantity: true, startDate: true, endDate: true }
  });

  const bornes = overlapping.map(b => ({
    quantity: b.quantity,
    start: toDayUtc(b.startDate),
    end: toDayUtc(b.endDate)
  }));

  // L'utilisation ne peut MONTER qu'au début de la période demandée ou au
  // premier jour d'une réservation qui y entre : il suffit de tester ces
  // dates-là, pas chaque jour de l'intervalle (une réservation d'un an ne doit
  // pas coûter 365 itérations par appel).
  const joursCritiques = [start, ...bornes.map(b => b.start).filter(d => d > start)];

  let peak = 0;
  for (const jour of joursCritiques) {
    let utilise = 0;
    for (const b of bornes) {
      if (b.start <= jour && jour <= b.end) utilise += b.quantity;
    }
    if (utilise > peak) peak = utilise;
  }

  const available = equipment.totalQuantity - peak;
  if (quantity > available) {
    return {
      status: 'over-capacity',
      totalQuantity: equipment.totalQuantity,
      peak,
      available: Math.max(0, available)
    };
  }
  return { status: 'available', totalQuantity: equipment.totalQuantity, peak, available };
};

/** Message d'erreur affiché tel quel à l'utilisateur (alert côté Material.tsx). */
export const overCapacityMessage = (c: {
  totalQuantity: number;
  available: number;
  quantity: number;
}): string =>
  `Stock insuffisant : ${c.quantity} demandé(s), ${c.available} disponible(s) sur ${c.totalQuantity} pour cette période. ` +
  `Quelqu'un vient peut-être de réserver ce matériel — rechargez pour voir les réservations à jour.`;
