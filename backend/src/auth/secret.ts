import dotenv from 'dotenv';
import path from 'path';

// Charge le .env AVANT de lire JWT_SECRET — indispensable car ce module est évalué
// au moment des imports, c'est-à-dire avant le dotenv.config() des points d'entrée
// (backend/src/index.ts et server.ts racine l'appellent après leurs imports, trop tard).
// Double chargement idempotent, même pattern que prisma/seed.ts :
// - cwd/.env      → backend/.env quand on lance depuis backend/, .env racine via server.ts
// - cwd/backend/.env → couvre le lancement depuis la racine si .env racine absent
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

const secret = process.env.JWT_SECRET;

if (!secret) {
  // Échec explicite au démarrage : mieux vaut un serveur qui ne démarre pas
  // qu'une authentification falsifiable avec un secret de repli en dur.
  throw new Error(
    "FATAL: la variable d'environnement JWT_SECRET est absente ou vide. " +
      "Définissez-la dans backend/.env (ou .env à la racine) avant de démarrer le serveur. " +
      'Génération conseillée : node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
  );
}

export const JWT_SECRET: string = secret;
