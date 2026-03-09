import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import * as db from './db.js';
// Modular Imports
import authRoutes from './routes/authRoutes.js';
import roomRoutes from './routes/roomRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import bugRoutes from './routes/bugRoutes.js';

const app = express();
app.use(cors({
  origin: [
    "http://localhost:5173",
    /\.vercel\.app$/
  ],
  credentials: true
}));
app.use(bodyParser.json());

const PORT = 4000;

app.get('/', (req, res) => res.json({ status: 'ok', version: '1.2 (Refactored)' }));

// Lightweight health check endpoint with database verification
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.status(200).json({ status: 'ok', db: 'connected' });
  } catch (err) {
    console.error('Health check failed (DB):', err);
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// --- Mount Routes ---
app.use('/api/auth', authRoutes);
app.use('/api', roomRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/bugs', bugRoutes);

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
  process.exit(1);
});

if (process.env.NODE_ENV !== 'test') { 
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  }).on('error', (err) => {
    console.error('Server failed to start:', err);
  });
}


export default app;
