import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bodyParser from 'body-parser';
import compression from 'compression';
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import * as db from './db.js';

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

const app = express();
app.use(helmet());
app.use(compression()); // Compress all responses
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [
    "http://localhost:5173",
    /\.vercel\.app$/
  ],
  credentials: true
}));
app.use(bodyParser.json());

// Enable JS profiling in the browser for Sentry
app.use((req, res, next) => {
  res.set("Document-Policy", "js-profiling");
  next();
});
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
app.use('/api/promotions', promotionRoutes);

// The Sentry error handler must be registered before any other error middleware and after all controllers
Sentry.setupExpressErrorHandler(app);

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
