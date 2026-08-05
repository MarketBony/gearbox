import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { authenticateToken } from '../auth/middleware';
import { UPLOADS_ROOT, UPLOAD_TYPES, UploadType } from './uploads';

const router = Router();

// GET /api/storage — espace consommé par Gearbox et espace disque restant.
//
// Ouvert à TOUS les rôles authentifiés (demande explicite de Théo) : savoir si le
// serveur est proche de la saturation concerne tout le monde, pas seulement les
// administrateurs. Aucune donnée sensible n'y transite — ni chemin absolu, ni nom de
// fichier, seulement des volumes agrégés.

interface StorageInfo {
  disque: { total: number; libre: number; utilise: number };
  uploads: { total: number; parType: Record<UploadType, { octets: number; fichiers: number }> };
  calculeLe: string;
}

// Cache mémoire : sans lui, chaque ouverture des Paramètres reparcourrait toute
// l'arborescence des uploads. Même motif que le proxy de flux (`routes/feeds.ts`).
const TTL_MS = 60 * 1000;
let cache: { at: number; data: StorageInfo } | null = null;

// Somme récursive des tailles d'un dossier. `statSync` et non `stat` asynchrone :
// l'arborescence est plate (3 dossiers) et le résultat est mis en cache — la
// simplicité vaut mieux ici que la concurrence.
const mesurerDossier = (dir: string): { octets: number; fichiers: number } => {
  let octets = 0;
  let fichiers = 0;
  let entrees: fs.Dirent[];
  try {
    entrees = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { octets: 0, fichiers: 0 }; // dossier absent = 0, pas une erreur
  }
  for (const e of entrees) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const sous = mesurerDossier(p);
      octets += sous.octets;
      fichiers += sous.fichiers;
    } else if (e.isFile()) {
      try {
        octets += fs.statSync(p).size;
        fichiers++;
      } catch {
        // fichier supprimé entre le readdir et le stat (purge concurrente) : on ignore
      }
    }
  }
  return { octets, fichiers };
};

const calculer = (): StorageInfo => {
  // `fs.statfsSync` donne l'état du système de fichiers qui PORTE les uploads, donc
  // le vrai facteur limitant. Disponible depuis Node 18.15 ; l'image est en node:20.
  // On utilise `bavail` (blocs disponibles à un utilisateur non privilégié) et non
  // `bfree`, qui inclut la réserve root et surestimerait l'espace exploitable.
  let disque = { total: 0, libre: 0, utilise: 0 };
  try {
    const s = fs.statfsSync(UPLOADS_ROOT);
    const total = s.blocks * s.bsize;
    const libre = s.bavail * s.bsize;
    disque = { total, libre, utilise: total - libre };
  } catch (e) {
    console.error('[storage] statfs indisponible :', (e as Error).message);
  }

  const parType = {} as Record<UploadType, { octets: number; fichiers: number }>;
  let total = 0;
  for (const t of UPLOAD_TYPES) {
    const m = mesurerDossier(path.join(UPLOADS_ROOT, t));
    parType[t] = m;
    total += m.octets;
  }

  return { disque, uploads: { total, parType }, calculeLe: new Date().toISOString() };
};

router.get('/', authenticateToken, (_req, res) => {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return res.json(cache.data);
  }
  const data = calculer();
  cache = { at: Date.now(), data };
  res.json(data);
});

export default router;
