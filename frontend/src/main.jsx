import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ui/ErrorBoundary.jsx";
import { AppProvider } from "./context/AppContext.jsx";
import { Toaster } from "react-hot-toast";
import * as Sentry from "@sentry/react";
import "./index.css";

Sentry.init({
  dsn: "https://fffcdd6cd5e09e0fcaeea616debb0bd3@o4511015599341568.ingest.us.sentry.io/4511015602618368",
  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
  ignoreErrors: [
    /ServiceWorker/i,
    /Failed to register a ServiceWorker/i,
    /service worker/i,
    "ServiceWorkerRegistration"
  ],
  integrations: [
    Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
    Sentry.browserTracingIntegration(),
    Sentry.browserProfilingIntegration(),
    Sentry.replayIntegration()
  ],
  // Tracing
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  // Set 'tracePropagationTargets' to control for which URLs distributed tracing should be enabled
  tracePropagationTargets: ["localhost", /^https:\/\/yourserver\.io\/api/],
  // Session Replay
  replaysSessionSampleRate: 0.1, // This sets the sample rate at 10%. You may want to change it to 100% while in development and then sample at a lower rate in production.
  replaysOnErrorSampleRate: 1.0, // If you're not already sampling the entire session, change the sample rate to 100% when sampling sessions where errors occur.
  // Enable logs to be sent to Sentry
  enableLogs: true,
  // Browser Profiling
  profileSessionSampleRate: 1.0
});

Sentry.logger.info('User triggered test log', { log_source: 'sentry_test' });

Sentry.metrics.count('button_click', 1);
Sentry.metrics.gauge('page_load_time', 150);
Sentry.metrics.distribution('response_time', 200);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Toaster position="top-center" reverseOrder={false} />
      <AppProvider>
        <App />
      </AppProvider>
    </ErrorBoundary>
  </React.StrictMode>
);