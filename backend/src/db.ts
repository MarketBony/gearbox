import { PrismaClient, Prisma } from '@prisma/client';

/**
 * ⚠️ UNE SEULE instance de PrismaClient pour tout le backend — SOURCE UNIQUE.
 *
 * Il y en avait **27**, une par module (`routes/*`, `realtime/*`, `auth/siteScope`,
 * `jobs/purge`, `settings/appSettings`, `utils/pushSender`), chacune avec son propre
 * pool de connexions indépendant. Le `connection_limit` par défaut de Prisma vaut
 * `vCPU × 2 + 1`, soit **17** sur les 8 vCPU du VPS : le plafond théorique était donc
 * d'environ **440 connexions client** dans un seul processus Node, face à un pooler
 * pgBouncer Supabase dont le `default_pool_size` se compte en dizaines.
 *
 * Prisma ouvre paresseusement, ces 440 n'ont jamais été observées simultanément — mais
 * l'erreur « Unable to start a transaction in the given time », relevée **20 fois en
 * production** le 07/09/2026, est précisément l'attente d'une connexion dans le pool
 * d'UN client. Et 27 pools indépendants rendent ce plafond impossible à régler : c'est
 * ça, le vrai défaut structurel.
 *
 * ⚠️ Un seul client est aussi la CONDITION pour que `connection_limit` ait un sens.
 * Poser `connection_limit=10` sur 27 clients donnerait 270 connexions, pas 10 ; et le
 * poser à 1 sérialiserait tout le trafic d'un module derrière sa transaction en cours.
 * Voir `backend/.env.example` pour les paramètres d'URL et leur justification.
 *
 * ⚠️ Le contrôle mécanique de cet invariant, à rejouer après toute évolution :
 *
 *     grep -rn "new PrismaClient" backend/src --include=*.ts | grep -v "src/db.ts"
 *
 * Il doit ne RIEN rendre. Formulé en excluant ce fichier plutôt qu'en comptant « exactement
 * 1 » : ce commentaire-ci contient le motif recherché, donc un simple `grep -c` sur db.ts
 * rendrait 2 et le contrôle mentirait sur lui-même.
 * Un commentaire qui affirme « source unique » n'est pas une preuve ; le grep en est
 * une. C'est la leçon de `GAMES_ALLOWED_ROLES`, dont un commentaire annonçait la source
 * unique alors que la liste était recalculée en dur juste à côté.
 */
export const prisma = new PrismaClient({
  // ⚠️ Journal des requêtes activable SANS recompiler (`PRISMA_LOG_QUERIES=1`) : c'est
  // ce qui permet de COMPTER les aller-retours d'un PUT, seule façon honnête de vérifier
  // qu'une transaction est passée de ~30 requêtes à 4. Éteint par défaut — allumé, il
  // journalise chaque requête, ce qui est bruyant et fuiterait des valeurs dans les logs.
  log: process.env.PRISMA_LOG_QUERIES === '1' ? ['query', 'warn', 'error'] : ['warn', 'error'],
});

/**
 * Réexporté pour que personne n'ait à réimporter `@prisma/client` ailleurs (et se
 * retrouve à instancier un second client par accident). Sert notamment aux tests
 * d'erreur : `Prisma.PrismaClientValidationError` dans `routes/projects.ts`.
 */
export { Prisma };

/**
 * ⚠️ Fermeture propre. `docker compose up -d` envoie SIGTERM au conteneur : sans
 * `$disconnect`, les connexions du processus arrêté restent côté pooler jusqu'à son
 * propre délai d'expiration, et un redéploiement enchaîné consomme donc deux fois le
 * quota pendant quelques secondes — exactement au moment où le nouveau conteneur en a
 * besoin pour `prisma migrate deploy`.
 */
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    prisma.$disconnect().finally(() => process.exit(0));
  });
}
