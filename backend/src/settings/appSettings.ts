import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// =============================================================================
// RÉGLAGES D'APPLICATION — modifiables EN LIGNE, sans redéploiement.
//
// ⚠️ SOURCE UNIQUE de la question « la rubrique Jeux est-elle allumée ? ». Toute
// route ou tout handler qui doit le savoir passe par ICI, jamais par une lecture
// directe de la table — même principe que `siteScope.ts` pour le périmètre et
// `constants.ts` pour le routage budgétaire.
//
// ⚠️ ABSENCE DE LIGNE = ÉTEINT. Le défaut est le plus prudent : une base vierge, une
// migration fraîche ou une lecture qui échoue laissent les Jeux fermés, jamais
// ouverts par accident.
//
// ⚠️ Valeur tenue EN MÉMOIRE et rafraîchie à l'écriture : les routes de jeu la
// consultent à chaque appel, une requête base par appel serait du gaspillage.
// Le cache est par PROCESS — un seul conteneur `api` tourne aujourd'hui ; si l'on
// passait à plusieurs, il faudrait diffuser l'invalidation.
// =============================================================================

export const CLE_JEUX = 'games.enabled';

// `undefined` = jamais lu depuis le démarrage ; on ira alors chercher en base.
let cacheJeux: boolean | undefined;

/** Les Jeux sont-ils allumés ? Lecture mémoire, avec repli base au premier appel. */
export const jeuxActives = async (): Promise<boolean> => {
  if (cacheJeux !== undefined) return cacheJeux;
  try {
    const ligne = await prisma.appSetting.findUnique({ where: { key: CLE_JEUX } });
    cacheJeux = ligne?.value === 'true';
  } catch (e) {
    // Base injoignable : on ne bloque pas l'API et on reste sur le défaut PRUDENT.
    // Volontairement NON mémorisé, pour retenter au prochain appel.
    console.error('[settings] lecture impossible, Jeux considérés éteints :', (e as Error).message);
    return false;
  }
  return cacheJeux;
};

/** Variante synchrone, pour les handlers socket qui ne peuvent pas attendre. */
export const jeuxActivesEnCache = (): boolean => cacheJeux === true;

/** Écrit le réglage et rafraîchit le cache dans la foulée. */
export const setJeuxActives = async (actives: boolean, parUtilisateur: string): Promise<boolean> => {
  await prisma.appSetting.upsert({
    where: { key: CLE_JEUX },
    create: { key: CLE_JEUX, value: String(actives), updatedBy: parUtilisateur },
    update: { value: String(actives), updatedBy: parUtilisateur },
  });
  cacheJeux = actives;
  return cacheJeux;
};

/** Préchargement au démarrage : le premier appel ne paie pas la lecture. */
export const chargerReglages = async (): Promise<void> => {
  await jeuxActives();
  console.log(`[settings] Jeux ${cacheJeux ? 'ALLUMES' : 'eteints'}.`);
};
