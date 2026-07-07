import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
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
import userRoutes from './routes/users';
import seedRoutes from './routes/seed';
import { setupRealtime } from './realtime';

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

// Realtime
setupRealtime(io);

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
