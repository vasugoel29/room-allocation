import './config/env.js';
import express from 'express';
import crypto from 'crypto';
import client from 'prom-client';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { logActivity } from './services/loggerService.js';
import { redactForAudit } from './utils/redact.js';
import { verifySessionToken } from './auth/session.js';
import { invalidateShared } from './utils/sharedCache.js';

import { apiLimiter } from './middleware/leakyBucket.js';
import * as Sentry from "@sentry/node";
import * as db from './db.js';


if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET is not defined in production environment.');
  process.exit(1);
}

// Sentry: errors always (when a DSN is set), traces sampled (default 10%) so it costs little at
// peak; only warn/error console output is forwarded. No profiling in production.
const sampleRate = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Math.min(1, Math.max(0, Number(v))) : d);
Sentry.init({
  enabled: Boolean(process.env.SENTRY_DSN) && !['test', 'e2e'].includes(process.env.NODE_ENV),
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  integrations: [Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] })],
  tracesSampleRate: sampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1),
  sendDefaultPii: false,
  enableLogs: true,
});


// Modular Imports
import authRoutes from './routes/authRoutes.js';
import internalRoutes from './routes/internalRoutes.js';
import roomRoutes from './routes/roomRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import facultyRoutes from './routes/facultyRoutes.js';
import transferRoutes from './routes/transferRoutes.js';
import departmentRoutes from './routes/departmentRoutes.js';
import branchRoutes from './routes/branchRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import timetableRoutes from './routes/timetableRoutes.js';

const app = express();
app.set('trust proxy', 1);

// Initialize Prometheus metrics collection
client.collectDefaultMetrics({ register: client.register });

const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
});

// Middleware to track HTTP request durations
app.use((req, res, next) => {
  const start = process.hrtime();
  res.on('finish', () => {
    const duration = process.hrtime(start);
    const durationInSeconds = duration[0] + duration[1] / 1e9;
    
    let route = req.path;
    if (req.route && req.route.path) {
      route = req.route.path;
    }
    
    // Skip /metrics endpoint logging to reduce noise
    if (route !== '/metrics') {
      httpRequestDurationSeconds
        .labels(req.method, route, res.statusCode)
        .observe(durationInSeconds);
    }
  });
  next();
});

// Prometheus metrics: only for a scraper presenting METRICS_TOKEN; disabled (404) when unset (SEC-13).
app.get('/metrics', async (req, res) => {
  const expected = process.env.METRICS_TOKEN;
  const given = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!expected) return res.status(404).json({ error: 'Not found' });
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!given || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    res.set('Content-Type', client.register.contentType);
    res.send(await client.register.metrics());
  } catch (err) {
    res.status(500).end(err);
  }
});
app.use(cookieParser());
app.use(helmet());
app.use(compression()); // Compress all responses
app.use(cors({
  origin: process.env.CORS_ORIGIN 
    ? process.env.CORS_ORIGIN.split(',') 
    : ["http://localhost:5173", "http://localhost:5174"],
  credentials: true
}));
// Health probe: in front of the rate limiter and body parsing so platform probes keep working when
// the API is busy (PERF-03). The DB result is reused for 2 s so thousands of open tabs polling
// every 30 s cost at most one query per 2 s. 503 while draining so the load balancer stops routing.
let shuttingDown = false;
let lastHealth = { at: 0, ok: false };
const HEALTH_CACHE_MS = Number(process.env.HEALTH_CACHE_MS ?? (process.env.NODE_ENV === 'test' ? 0 : 2000));
app.get('/api/health', async (req, res) => {
  if (shuttingDown) return res.status(503).json({ status: 'shutting_down' });
  if (Date.now() - lastHealth.at > HEALTH_CACHE_MS) {
    try {
      await db.query('SELECT 1');
      lastHealth = { at: Date.now(), ok: true };
    } catch (err) {
      console.error('Health check failed (DB):', err);
      lastHealth = { at: Date.now(), ok: false };
    }
  }
  if (lastHealth.ok) return res.status(200).json({ status: 'ok', db: 'connected' });
  res.status(503).json({ status: 'error', db: 'disconnected' });
});

// Any successful write may change what the shared calendar cache holds.
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    res.on('finish', () => { if (res.statusCode < 400) invalidateShared(); });
  }
  next();
});

app.use('/api/internal', internalRoutes);
// CSV imports arrive as JSON ({ csvContent }); a full-college timetable is well over 100 kb (OPS-06).
// Mounted first so the global parser below sees the body as already parsed and skips it.
const IMPORT_BODY = express.json({ limit: '5mb' });
app.use('/api/admin/uploads/import', IMPORT_BODY);
app.use('/api/timetable/upload', IMPORT_BODY);
app.use(express.json({ limit: '100kb' }));

app.use('/api', apiLimiter);

const PORT = process.env.PORT || 4000;

app.get('/', (req, res) => res.json({ status: 'ok', version: '1.2 (Refactored)' }));

// Universal mutation audit log. The actor is the verified session's user (null when anonymous —
// never a stand-in id); request bodies are redacted and summarised (SEC-14).
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    let userId = null;
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        userId = verifySessionToken(header.slice(7)).userId;
      } catch {
        // invalid/expired token: anonymous
      }
    }
    res.on('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      logActivity({
        userId: req.user?.id ?? userId,
        action: `${req.method}_${req.originalUrl.split('?')[0].toUpperCase().replace(/\//g, '_').substring(1)}`,
        entityType: req.originalUrl.split('/')[2] || 'system',
        details: {
          method: req.method,
          path: req.originalUrl.split('?')[0],
          status: res.statusCode,
          body: req.body ? redactForAudit(req.body) : {},
        },
      });
    });
  }
  next();
});

// --- Mount Routes ---
app.use('/api/auth', authRoutes);
app.use('/api', roomRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/timetable', timetableRoutes);

// The Sentry error handler must be registered before any other error middleware and after all controllers
Sentry.setupExpressErrorHandler(app);

// Global JSON error handler. Clients get a status-appropriate message; details stay in the logs (SEC-12).
app.use((err, req, res, next) => {
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large' });
  const status = Number(err?.statusCode || err?.status) || 500;
  if (status < 500 && err?.expose) return res.status(status).json({ error: err.message });
  console.error('Global Error Handler:', err);
  res.status(status >= 400 && status < 600 ? status : 500).json({ error: 'Something went wrong on our side. Please try again.' });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
  process.exit(1);
});

if (process.env.NODE_ENV !== 'test') {
  // Migrations must finish before the server accepts traffic (OPS-03).
  db.connectAndMigrate()
    .then(() => {
      // Keep idle connections open longer than a load balancer's idle timeout (60 s typical) so
      // clients reuse them instead of reconnecting in bursts that overflow the accept queue.
      const server = app.listen(PORT, undefined, Number(process.env.LISTEN_BACKLOG) || 2048, () => {
        console.warn(`Server successfully listening on port ${PORT}`);
      }).on('error', (err) => {
        console.error('Server failed to start:', err);
        process.exit(1);
      });

      server.keepAliveTimeout = Number(process.env.KEEP_ALIVE_TIMEOUT_MS) || 65_000;
      server.headersTimeout = server.keepAliveTimeout + 1_000;

      // Graceful shutdown (OPS-18): stop accepting connections, let in-flight requests finish
      // (bounded), then close the DB pool. Deploys and restarts no longer cut bookings mid-write.
      const shutdown = (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.warn(`${signal} received: draining connections`);
        const force = setTimeout(() => {
          console.error('Shutdown timed out; exiting');
          process.exit(1);
        }, Number(process.env.SHUTDOWN_TIMEOUT_MS) || 10_000);
        force.unref();
        server.close(async () => {
          try { await db.pool.end(); } catch (err) { console.error('Closing DB pool failed', err); }
          process.exit(0);
        });
        server.closeIdleConnections?.();
      };
      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));
    })
    .catch((err) => {
      console.error('Startup failed:', err);
      process.exit(1);
    });
}

export default app;
