import { prisma } from '../db';

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

// =============================================================================
// SPARK (rubrique CRM, 26/10/2026) — interrupteur + liste d'invités.
//
// ⚠️ ABSENCE DE LIGNE = ALLUMÉ, à l'INVERSE des Jeux, et c'est VOULU : SPARK était déjà en service pour le Master
// avant l'arrivée de l'interrupteur. Un défaut « éteint » l'aurait coupé au déploiement, sans que personne n'ait rien
// touché. Le risque reste borné : allumé sans liste d'invités = Master seul, exactement l'état d'avant.
// Même logique en cas de base injoignable : on rend « allumé, aucun invité » (= Master seul), jamais plus large.
//
// La liste d'invités est une liste JSON d'ids de comptes (`crm.users`). Elle ne dit pas tout : le rôle COURANT est
// revérifié à chaque appel par `auth/crmAccess.ts`, SEULE porte d'accès à SPARK. Ne jamais lire ce réglage ailleurs
// pour décider d'un accès.
// =============================================================================

export const CLE_CRM = 'crm.enabled';
export const CLE_CRM_INVITES = 'crm.users';

export interface ReglagesCrm { enabled: boolean; users: string[] }

let cacheCrm: ReglagesCrm | undefined;

/** Liste d'ids propre : chaînes non vides, dédoublonnées. Une valeur illisible en base vaut « aucun invité ». */
const lireListe = (brut: string | null | undefined): string[] => {
  if (!brut) return [];
  try {
    const v = JSON.parse(brut);
    return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0))] : [];
  } catch {
    return [];
  }
};

/** Réglages SPARK. Lecture mémoire, avec repli base au premier appel. */
export const reglagesCrm = async (): Promise<ReglagesCrm> => {
  if (cacheCrm !== undefined) return cacheCrm;
  try {
    const lignes = await prisma.appSetting.findMany({ where: { key: { in: [CLE_CRM, CLE_CRM_INVITES] } } });
    const val = (k: string) => lignes.find((l) => l.key === k)?.value;
    const enabled = val(CLE_CRM);
    cacheCrm = { enabled: enabled === undefined ? true : enabled === 'true', users: lireListe(val(CLE_CRM_INVITES)) };
  } catch (e) {
    // Défaut borné : Master seul (état d'avant l'interrupteur). Non mémorisé, on retente au prochain appel.
    console.error('[settings] lecture SPARK impossible, Master seul :', (e as Error).message);
    return { enabled: true, users: [] };
  }
  return cacheCrm;
};

/** Écrit l'interrupteur SPARK et rafraîchit le cache. */
export const setCrmActive = async (actif: boolean, parUtilisateur: string): Promise<ReglagesCrm> => {
  await prisma.appSetting.upsert({
    where: { key: CLE_CRM },
    create: { key: CLE_CRM, value: String(actif), updatedBy: parUtilisateur },
    update: { value: String(actif), updatedBy: parUtilisateur },
  });
  cacheCrm = undefined;
  return reglagesCrm();
};

/** Écrit la liste d'invités SPARK (déjà validée par l'appelant) et rafraîchit le cache. */
export const setCrmInvites = async (ids: string[], parUtilisateur: string): Promise<ReglagesCrm> => {
  const value = JSON.stringify([...new Set(ids)]);
  await prisma.appSetting.upsert({
    where: { key: CLE_CRM_INVITES },
    create: { key: CLE_CRM_INVITES, value, updatedBy: parUtilisateur },
    update: { value, updatedBy: parUtilisateur },
  });
  cacheCrm = undefined;
  return reglagesCrm();
};

// =============================================================================
// mIAouss (assistant IA, 27/10/2026) — interrupteur + liste des personnes COUPÉES.
//
// Même forme que SPARK, logique INVERSE pour la liste : mIAouss est déjà ouvert à toute l'équipe marketing, et Théo veut
// le retirer « au cas par cas » (certains s'en sont plaints). On retient donc les EXCLUS (`assistant.off`), pas les
// invités : un nouvel arrivant de l'équipe l'a d'office, comme aujourd'hui.
// ⚠️ ABSENCE DE LIGNE = ALLUMÉ, personne de coupé : l'état d'avant l'interrupteur. Base injoignable : même défaut
// (mIAouss n'expose aucune donnée qui ne soit déjà celle de l'interlocuteur, c'est son état de toujours).
// SEULE porte d'accès : `auth/assistantAccess.ts`. Ne jamais lire ce réglage ailleurs pour décider d'un accès.
// =============================================================================

export const CLE_ASSISTANT = 'assistant.enabled';
export const CLE_ASSISTANT_COUPES = 'assistant.off';

export interface ReglagesAssistant { enabled: boolean; off: string[] }

let cacheAssistant: ReglagesAssistant | undefined;

/** Réglages mIAouss. Lecture mémoire, avec repli base au premier appel. */
export const reglagesAssistant = async (): Promise<ReglagesAssistant> => {
  if (cacheAssistant !== undefined) return cacheAssistant;
  try {
    const lignes = await prisma.appSetting.findMany({ where: { key: { in: [CLE_ASSISTANT, CLE_ASSISTANT_COUPES] } } });
    const val = (k: string) => lignes.find((l) => l.key === k)?.value;
    const enabled = val(CLE_ASSISTANT);
    cacheAssistant = { enabled: enabled === undefined ? true : enabled === 'true', off: lireListe(val(CLE_ASSISTANT_COUPES)) };
  } catch (e) {
    console.error('[settings] lecture mIAouss impossible, etat par defaut :', (e as Error).message);
    return { enabled: true, off: [] };
  }
  return cacheAssistant;
};

/** Écrit l'interrupteur mIAouss et rafraîchit le cache. */
export const setAssistantActif = async (actif: boolean, parUtilisateur: string): Promise<ReglagesAssistant> => {
  await prisma.appSetting.upsert({
    where: { key: CLE_ASSISTANT },
    create: { key: CLE_ASSISTANT, value: String(actif), updatedBy: parUtilisateur },
    update: { value: String(actif), updatedBy: parUtilisateur },
  });
  cacheAssistant = undefined;
  return reglagesAssistant();
};

/** Écrit la liste des personnes coupées (déjà validée par l'appelant) et rafraîchit le cache. */
export const setAssistantCoupes = async (ids: string[], parUtilisateur: string): Promise<ReglagesAssistant> => {
  const value = JSON.stringify([...new Set(ids)]);
  await prisma.appSetting.upsert({
    where: { key: CLE_ASSISTANT_COUPES },
    create: { key: CLE_ASSISTANT_COUPES, value, updatedBy: parUtilisateur },
    update: { value, updatedBy: parUtilisateur },
  });
  cacheAssistant = undefined;
  return reglagesAssistant();
};

/** Préchargement au démarrage : le premier appel ne paie pas la lecture. */
export const chargerReglages = async (): Promise<void> => {
  await jeuxActives();
  const crm = await reglagesCrm();
  const mia = await reglagesAssistant();
  console.log(`[settings] Jeux ${cacheJeux ? 'ALLUMES' : 'eteints'} ; SPARK ${crm.enabled ? 'ALLUME' : 'eteint'} (${crm.users.length} invite(s)) ; mIAouss ${mia.enabled ? 'ALLUME' : 'eteint'} (${mia.off.length} coupe(s)).`);
};
