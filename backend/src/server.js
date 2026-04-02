import './config/env.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bodyParser from 'body-parser';
import compression from 'compression';

import rateLimit from 'express-rate-limit';
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import * as db from './db.js';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET is not defined in production environment.');
  process.exit(1);
}

// Initialize Sentry before any other imports if possible
Sentry.init({
  dsn: "https://fffcdd6cd5e09e0fcaeea616debb0bd3@o4511015599341568.ingest.us.sentry.io/4511015602618368",
  integrations: [
    nodeProfilingIntegration(),
    Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
  ],
  // Tracing
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  metrics: {
    count: ['button_click'],
    gauge: ['page_load_time'],
    distribution: ['response_time']
  },
  enableLogs: true,

});


// Modular Imports
import authRoutes from './routes/authRoutes.js';
import roomRoutes from './routes/roomRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import promotionRoutes from './routes/promotionRoutes.js';
import facultyRoutes from './routes/facultyRoutes.js';
import transferRoutes from './routes/transferRoutes.js';
import departmentRoutes from './routes/departmentRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import timetableRoutes from './routes/timetableRoutes.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(compression()); // Compress all responses
app.use(cors({
  origin: process.env.CORS_ORIGIN 
    ? process.env.CORS_ORIGIN.split(',') 
    : ["http://localhost:5173", "http://localhost:5174"],
  credentials: true
}));
app.use(express.json({ limit: '100kb' }));


const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300, 
  message: { error: 'Too many requests, please try again later.' }
});

app.use('/api', apiLimiter);

// Enable JS profiling in the browser for Sentry
app.use((req, res, next) => {
  res.set("Document-Policy", "js-profiling");
  next();
});
const PORT = process.env.PORT || 4000;

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
app.use('/api/promotions', promotionRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/timetable', timetableRoutes);

// The Sentry error handler must be registered before any other error middleware and after all controllers
Sentry.setupExpressErrorHandler(app);

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
  process.exit(1);
});

console.warn('Attempting to start server...', { NODE_ENV: process.env.NODE_ENV, PORT });
if (process.env.NODE_ENV !== 'test') { 
  app.listen(PORT, () => {
    console.warn(`Server successfully listening on port ${PORT}`);
  }).on('error', (err) => {
    console.error('Server failed to start (L108):', err);
  });
} else {
  console.warn('Server NOT started - NODE_ENV is "test"');
}


export default app;
