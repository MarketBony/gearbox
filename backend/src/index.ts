import express from 'express';
import 'express-async-errors'; // patch Express 4 : les rejets async atteignent le middleware d'erreur
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import projectRoutes from './routes/projects';
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
import seedRoutes from './routes/seed';
import uploadsRoutes, { UPLOADS_ROOT } from './routes/uploads';
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

// Fichiers uploadés servis en statique (URLs relatives renvoyées par la route).
app.use('/uploads', express.static(UPLOADS_ROOT));

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
