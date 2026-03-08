import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { AppProvider } from "./context/AppContext.jsx";
import { NotificationProvider } from "./context/NotificationContext.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <NotificationProvider>
        <AppProvider>
          <App />
        </AppProvider>
      </NotificationProvider>
    </ErrorBoundary>
  </React.StrictMode>
);