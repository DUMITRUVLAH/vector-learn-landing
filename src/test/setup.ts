import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { clearApiCache } from "@/lib/apiCache";

// Never let a Vitest worker open the developer's on-disk `.pglite` database. Several server
// modules create the DB client at import time, and parallel workers otherwise compete with the
// running API for the same files. An isolated in-memory database keeps tests deterministic and
// prevents WAL/data-directory corruption during local test runs.
process.env.DATABASE_PATH = process.env.TEST_DATABASE_PATH ?? "memory://";

// jsdom nu implementează `Element.prototype.scrollIntoView`, deși există în orice browser real.
// Fără stub, orice cod care derulează spre o secțiune (ex. sumarul de avertismente din
// ParCreateForm, după prima apăsare pe „Trimite") aruncă „scrollIntoView is not a function"
// ÎN MIJLOCUL handler-ului — restul lui nu mai rulează, testul trece fals, iar Vitest raportează
// un unhandled rejection. Stub-ul ține testele pe comportamentul real, nu pe golul din jsdom.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

afterEach(() => {
  cleanup();
  // PERF-002: cache-ul de cereri GET trăiește la nivel de modul, deci supraviețuiește între teste.
  // Fără golirea asta, un test care apelează același endpoint ca precedentul primește răspunsul
  // celuilalt (fereastra e de 1,5 s, iar un fișier de teste rulează în milisecunde) — exact cum
  // s-a întâmplat cu `badges.test.ts`, care a primit `totalBadges: 42` în testul unde aștepta 0.
  clearApiCache();
});
