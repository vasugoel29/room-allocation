import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ui/ErrorBoundary.jsx";
import { AppProvider } from "./context/AppContext.jsx";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import * as Sentry from "@sentry/react";
import "./index.css";

const sampleRate = (v, d) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : d);

// Errors always (when a DSN is set); traces and replays sampled. Replays mask all text and inputs
// (the SDK default) and no default PII is sent — names and emails stay out of Sentry.
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  enabled: Boolean(import.meta.env.VITE_SENTRY_DSN),
  environment: import.meta.mode,
  sendDefaultPii: false,
  ignoreErrors: [
    /ServiceWorker/i,
    /Failed to register a ServiceWorker/i,
    /service worker/i,
    "ServiceWorkerRegistration"
  ],
  integrations: [
    Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] }),
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration()
  ],
  tracesSampleRate: sampleRate(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE, 0.1),
  // Trace headers only to our own API (same origin, or VITE_API_URL when set).
  tracePropagationTargets: [/^\/api/, ...(import.meta.env.VITE_API_URL ? [import.meta.env.VITE_API_URL] : [])],
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: sampleRate(import.meta.env.VITE_SENTRY_REPLAY_ON_ERROR_RATE, 0.5),
  enableLogs: true,
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Toaster 
          position="top-center" 
          reverseOrder={false} 
          toastOptions={{
            className: 'custom-toast',
            success: {
              iconTheme: {
                primary: 'var(--color-primary)',
                secondary: 'var(--color-surface-lowest)'
              }
            },
            error: {
              iconTheme: {
                primary: '#EF4444',
                secondary: 'var(--color-surface-lowest)'
              }
            }
          }}
        />
        <AppProvider>
          <App />
        </AppProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);