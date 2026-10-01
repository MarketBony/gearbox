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
import congesRoutes from './routes/conges';
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
import linkPreviewRoutes from './routes/linkPreview';
import gifRoutes from './routes/gifs';
import musicRoutes from './routes/music';
import pushRoutes from './routes/push';
import seedRoutes from './routes/seed';
import uploadsRoutes, { UPLOADS_ROOT } from './routes/uploads';
import storageRoutes from './routes/storage';
import gamesRoutes from './routes/games';
import settingsRoutes from './routes/settings';
import projectFilesRoutes from './routes/projectFiles';
import postitRoutes from './routes/postits';
import formsRoutes from './routes/forms';
import { setupRealtime, withEmitterContext } from './realtime';
import { startPurgeJob } from './jobs/purge';
import { chargerReglages } from './settings/appSettings';

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
// ⚠️ `limit` EXPLICITE. Sans elle, body-parser plafonne a 100 ko par defaut : un PUT de
// projet portant toutes ses taches (et, en mode Expert, des notes libres sans longueur
// maximale) pouvait le depasser. Le symptome etait trompeur — `errorHandler` ignorait
// `err.status`, donc l'erreur 413 << entity.too.large >> ressortait en 500
// << Erreur interne du serveur >>, et l'ecran affichait << serveur injoignable ? >>.
app.use(express.json({ limit: '2mb' }));

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
// Congés (12/09/2026). ⚠️ Le GET est lui aussi sous `requireRole` : `Site Manager` et
// `External` n'ont pas la rubrique, et masquer une rubrique ne ferme pas une route.
app.use('/api/conges', congesRoutes);
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
// Interrupteurs de fonctionnalite : lecture pour tous, ecriture Master seul.
app.use('/api/settings', settingsRoutes);
// Fichiers de projet et de tache (mode Expert). Route separee de /api/projects :
// elle a son propre cycle de vie (upload puis enregistrement), et melanger les deux
// aurait alourdi le diff transactionnel des taches pour rien.
app.use('/api/project-files', projectFilesRoutes);
// Hello Marketing : proxy des flux RSS et de la playlist Deezer (le navigateur ne
// peut pas les appeler en direct — CORS ; voir les commentaires de ces routes).
app.use('/api/feeds', feedRoutes);
// Aperçu de liens — liste blanche STRICTE de fournisseurs oEmbed (voir la route).
app.use('/api/link-preview', linkPreviewRoutes);
// Recherche de GIF (Tenor) — la clé d'API reste côté serveur, voir la route.
app.use('/api/gifs', gifRoutes);
app.use('/api/music', musicRoutes);

// Abonnements aux notifications push (clé publique VAPID + subscribe/unsubscribe).
app.use('/api/push', pushRoutes);

// Post-it : agenda PERSONNEL de la To-do (chaque requête filtrée sur l'utilisateur connecté).
app.use('/api/postits', postitRoutes);

// Forms : Google Forms par le compte partagé (rubrique v2). FORMS_ROLES sur chaque route.
app.use('/api/forms', formsRoutes);

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
//
// ⚠️ Les extensions AUDIO ont été ajoutées le 06/08/2026 pour les messages vocaux :
// servi en `attachment`, un enregistrement est téléchargé au lieu d'être lu, et un
// `<audio>` ne peut rien en faire. Ce sont des formats PASSIFS (le navigateur les
// décode, il n'en exécute rien) — ils n'ont pas le risque du `.svg` ou du `.html`.
// `nosniff` continue de s'appliquer à tout, y compris à eux.
const EXT_AFFICHABLES = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf',
  '.webm', '.ogg', '.oga', '.mp3', '.m4a', '.aac', '.wav',
]);

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

// Reglages d'application (interrupteur Jeux) : charges une fois au demarrage.
chargerReglages().catch((e: unknown) => console.error('[settings] prechargement', e));

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
