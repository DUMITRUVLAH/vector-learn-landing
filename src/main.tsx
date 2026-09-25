import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./styles/gm3.css";
import { installGlobalErrorReporting } from "./lib/telemetry";
import { syncDocumentLang } from "./lib/i18n";

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

// PARVERIFY-001: `finflow.best/verify` tastat de mână ajunge la pagina de verificare.
//
// Adresa asta e TIPĂRITĂ pe formularul PAR, pentru cel care nu poate scana codul QR (fotocopie
// ștearsă, telefon fără cameră). Aplicația rutează însă pe hash, deci o cale fără `#` ar cădea în
// fallback-ul SPA și ar redirecționa spre `/business` — adică fix omul care n-a putut scana ar
// ajunge la un ecran de login. Traducerea se face aici, înainte de primul render, ca ecranul
// greșit să nu apuce să clipească.
if (/^\/verify\/?$/.test(window.location.pathname) && !window.location.hash) {
  window.location.replace("/#/verificare");
}

// PLATFORM-002: excepțiile globale și promisiunile respinse ajung în Consola Platformă.
// Instalat înainte de randare, ca să prindă și ce crapă la primul render.
installGlobalErrorReporting();

// `<html lang>` pe limba aleasă, înainte de primul render: de el depind cititoarele
// de ecran și corectorul ortografic al browserului, iar `index.html` livrează „ro".
syncDocumentLang();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
