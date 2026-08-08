import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { installGlobalErrorReporting } from "./lib/telemetry";

// MOB-101: Register service worker for PWA offline support in production only.
// A previously cached Vector Learn shell can otherwise intercept localhost and hide the
// current FinFlow hash routes during development.
if ("serviceWorker" in navigator) {
  if (import.meta.env.DEV) {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch(() => { /* stale worker cleanup is best-effort */ });
  } else {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // SW registration failure is non-fatal — app works without it
      });
    });
  }
}

// PLATFORM-002: excepțiile globale și promisiunile respinse ajung în Consola Platformă.
// Instalat înainte de randare, ca să prindă și ce crapă la primul render.
installGlobalErrorReporting();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
