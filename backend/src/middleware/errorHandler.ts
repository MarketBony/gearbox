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
  res.status(500).json({
    error: 'Erreur interne du serveur.',
    // Détail exposé uniquement hors production.
    ...(isDev ? { detail: err?.message ?? String(err) } : {})
  });
};
