import { Request, Response, NextFunction } from 'express';

// Middleware d'erreur global Express — à monter EN DERNIER, après toutes les
// routes. Combiné à l'import de 'express-async-errors' dans les points d'entrée,
// il capte aussi les rejets des handlers async (Express 4 ne le fait pas seul) :
// une exception non gérée renvoie désormais un JSON propre au lieu de fermer
// brutalement la connexion (ECONNRESET côté client).
export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  // Si la réponse est déjà partie, on délègue au gestionnaire par défaut d'Express.
  if (res.headersSent) return next(err);

  console.error(`[error] ${req.method} ${req.originalUrl}:`, err?.message ?? err);

  const isDev = process.env.NODE_ENV !== 'production';

  // ⚠️ `err.status` etait IGNORE, et le 500 code en dur. body-parser leve une erreur
  // portant `status: 413` (<< entity.too.large >>) : elle ressortait donc en
  // << Erreur interne du serveur >>, ce qui envoie chercher la cause cote serveur alors
  // que la requete de l'APPELANT est en cause. Corrige le 07/09/2026 (correctif 48).
  const statut = Number(err?.status ?? err?.statusCode) || 500;

  // ⚠️ Message tire d'un ENSEMBLE FIXE, jamais `err.message` : il peut contenir du SQL,
  // des noms de colonnes ou des valeurs. Meme posture que `statutPrisma` dans
  // routes/projects.ts. `detail` reste reserve au hors-production.
  const MESSAGES: Record<number, string> = {
    400: 'Requete invalide.',
    413: 'Contenu trop volumineux.',
    415: 'Format de contenu non supporte.',
    500: 'Erreur interne du serveur.',
  };

  res.status(statut).json({
    error: MESSAGES[statut] ?? (statut < 500 ? 'Requete invalide.' : 'Erreur interne du serveur.'),
    // Détail exposé uniquement hors production.
    ...(isDev ? { detail: err?.message ?? String(err) } : {})
  });
};
