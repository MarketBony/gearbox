import express from 'express';
import 'express-async-errors'; // patch Express 4 : les rejets async atteignent le middleware d'erreur
import http from 'http';
import path from 'path';
import cors from 'cors';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import projectRoutes from './routes/projects';
import taskRoutes from './routes/tasks';
import campaignRoutes from './routes/campaigns';
import socialRoutes from './routes/social';
import budgetRoutes from './routes/budget';
import contactRoutes from './routes/contacts';
import tagRoutes from './routes/tags';
import expenseRoutes from './routes/expenses';
import fixedExpenseRoutes from './routes/fixedExpenses';
import equipmentRoutes from './routes/equipment';
import equipmentBookingRoutes from './routes/equipmentBookings';
import chatRoutes from './routes/chat';
import activityLogRoutes from './routes/activityLog';
import userRoutes from './routes/users';
import feedRoutes from './routes/feeds';
import musicRoutes from './routes/music';
import pushRoutes from './routes/push';
import seedRoutes from './routes/seed';
import uploadsRoutes, { UPLOADS_ROOT } from './routes/uploads';
import storageRoutes from './routes/storage';
import gamesRoutes from './routes/games';
import { setupRealtime, withEmitterContext } from './realtime';
import { startPurgeJob } from './jobs/purge';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // In production, set this to the frontend domain
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

app.use(cors());
app.use(express.json());

// Contexte d'émission : mémorise le `x-socket-id` de l'appelant pour la durée de
// la requête, afin que emitEvent ne renvoie pas l'événement à son propre auteur
// (voir realtime/index.ts). À monter AVANT les routes.
app.use(withEmitterContext);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/seed', seedRoutes);
app.use('/api/projects', projectRoutes);
// Tâches AUTONOMES uniquement (projectId null) — les tâches de projet passent
// exclusivement par /api/projects. Voir l'en-tête de routes/tasks.ts.
app.use('/api/tasks', taskRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/fixed-expenses', fixedExpenseRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/equipment-bookings', equipmentBookingRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/activity-log', activityLogRoutes);
app.use('/api/uploads', uploadsRoutes);
// Espace consommé / disque restant — lecture ouverte à tous les rôles authentifiés.
app.use('/api/storage', storageRoutes);
// Jeux : défis et parties. Accès restreint aux rôles autorisés — Director en est
// exclu, seule exception à sa parité avec Administrator (règle métier).
app.use('/api/games', gamesRoutes);
// Hello Marketing : proxy des flux RSS et de la playlist Deezer (le navigateur ne
// peut pas les appeler en direct — CORS ; voir les commentaires de ces routes).
app.use('/api/feeds', feedRoutes);
app.use('/api/music', musicRoutes);

// Abonnements aux notifications push (clé publique VAPID + subscribe/unsubscribe).
app.use('/api/push', pushRoutes);

// Fichiers uploadés servis en statique (URLs relatives renvoyées par la route).
//
// ⚠️ SÉCURITÉ — À NE PAS RETIRER. Depuis le 05/08/2026 le chat accepte TOUS les
// formats : ces fichiers sont servis depuis le domaine de Gearbox, donc un `.html` ou
// un `.svg` déposé dans une conversation et ouvert dans l'onglet s'exécuterait dans la
// session de celui qui l'ouvre — XSS stocké, vol de jeton compris. Deux en-têtes
// suffisent à fermer cette classe d'attaque :
//   - `nosniff` sur TOUT, pour que le navigateur ne devine jamais un type exécutable
//     à partir du contenu ;
//   - `Content-Disposition: attachment` sauf pour les extensions réellement
//     affichables, qui doivent le rester (les images s'affichent dans le fil de
//     discussion, et Théo a demandé l'aperçu des PDF).
// La liste porte sur l'EXTENSION DU FICHIER SUR LE DISQUE, jamais sur un type MIME
// fourni par le client — c'est lui qui le déclare, on ne s'y fie pas.
// `.svg` en est volontairement absent : c'est un format actif, il se téléchargera.
const EXT_AFFICHABLES = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf']);

app.use('/uploads', express.static(UPLOADS_ROOT, {
  setHeaders: (res, filePath) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const ext = path.extname(filePath).toLowerCase();
    if (!EXT_AFFICHABLES.has(ext)) {
      res.setHeader('Content-Disposition', 'attachment');
    }
  }
}));

// Middleware d'erreur global — après toutes les routes.
app.use(errorHandler);

// Realtime
setupRealtime(io);

// Job de purge des médias calendar archivés depuis > 30j.
startPurgeJob();

// Filet de dernier recours. Une promesse rejetée hors de portée d'Express (rappel
// détaché, handler socket sans try/catch, timer) ne doit PAS tuer l'API : depuis
// Node 15, une « unhandled rejection » termine le process par défaut, et chaque
// redémarrage coupe toutes les connexions Socket.IO de tous les utilisateurs.
// On journalise et on continue : perdre une requête vaut mieux que déconnecter
// tout le monde. Ce n'est PAS une excuse pour ne pas traiter l'erreur à la source
// (voir la règle en tête de routes/auth.ts).
//
// Volontairement pas de handler 'uncaughtException' : une exception synchrone non
// rattrapée laisse le process dans un état imprévisible, et là redémarrer est le
// bon comportement — `restart: always` s'en charge côté Docker.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection] promesse rejetée non gérée :', reason);
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
