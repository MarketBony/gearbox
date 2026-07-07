import express from 'express';
import 'express-async-errors'; // patch Express 4 : les rejets async atteignent le middleware d'erreur
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { fileURLToPath } from 'url';

// Import routes
import authRoutes from './backend/src/routes/auth';
import projectRoutes from './backend/src/routes/projects';
import campaignRoutes from './backend/src/routes/campaigns';
import socialRoutes from './backend/src/routes/social';
import budgetRoutes from './backend/src/routes/budget';
import contactRoutes from './backend/src/routes/contacts';
import tagRoutes from './backend/src/routes/tags';
import expenseRoutes from './backend/src/routes/expenses';
import fixedExpenseRoutes from './backend/src/routes/fixedExpenses';
import equipmentRoutes from './backend/src/routes/equipment';
import equipmentBookingRoutes from './backend/src/routes/equipmentBookings';
import chatRoutes from './backend/src/routes/chat';
import activityLogRoutes from './backend/src/routes/activityLog';
import userRoutes from './backend/src/routes/users';
import seedRoutes from './backend/src/routes/seed';
import { setupRealtime } from './backend/src/realtime';
import { errorHandler } from './backend/src/middleware/errorHandler';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
  });

  app.use(cors());
  app.use(express.json());

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

  // Middleware d'erreur global — après toutes les routes API.
  app.use(errorHandler);

  // Realtime
  setupRealtime(io);

  // Vite middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
