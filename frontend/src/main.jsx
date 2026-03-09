import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { AppProvider } from "./context/AppContext.jsx";
import { Toaster } from "react-hot-toast";
import * as Sentry from "@sentry/react";
import "./index.css";

Sentry.init({
  dsn: "https://fffcdd6cd5e09e0fcaeea616debb0bd3@o4511015599341568.ingest.us.sentry.io/4511015602618368",
  sendDefaultPii: true,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 1.0,
  tracePropagationTargets: ["localhost", /^https:\/\/yourserver\.io\/api/],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  enableLogs: true
});

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