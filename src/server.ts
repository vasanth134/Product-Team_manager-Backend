import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { connectDB } from './config/db';
import { initSocket } from './socketHandler';

// Import routes
import authRoutes from './routes/auth';
import teamRoutes from './routes/teams';
import taskRoutes from './routes/tasks';
import milestoneRoutes from './routes/milestones';
import standupRoutes from './routes/standups';
import analyticsRoutes from './routes/analytics';
import chatRoutes from './routes/chat';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

// Connect to Database
connectDB();

// Attach Socket.io
initSocket(httpServer);

// Middleware
app.use(cors({
  origin: '*',
  credentials: true,
}));
app.use(express.json());

// Serve local uploads as static files (fallback when Cloudinary is not configured)
app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/milestones', milestoneRoutes);
app.use('/api/standups', standupRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/chat', chatRoutes);

// Base route
app.get('/', (req, res) => {
  res.send('Aether Project Management API is running...');
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start Server (using httpServer instead of app.listen so Socket.io works)
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
