import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  /**
   * PERF-004 — build-ul de producție TREBUIE să conțină React de producție.
   *
   * Bug real, găsit prin măsurare: `.env` (și `.env.example`, pe care îl copiază toată lumea)
   * conține `NODE_ENV=development`. Vite citește `NODE_ENV` din fișierele `.env`, deci `vite build`
   * împacheta `react-dom.development.js` — verificat prin prezența textelor de avertizare care
   * există DOAR în build-ul de dezvoltare („Invalid hook call", „Each child in a list should have
   * a unique key").
   *
   * Costul măsurat: react-vendor 328 KB (99 KB gzip) în loc de 142 KB (46 KB gzip) — plus, mult
   * mai important, build-ul de dezvoltare al React face validări suplimentare la fiecare randare.
   * Adică aplicația nu era doar mai mare, ci și efectiv mai lentă la rulare.
   *
   * `define` înlocuiește textual identificatorul la compilare, deci decide ce ramură din
   * `react-dom/index.js` supraviețuiește tree-shaking-ului — indiferent ce spune `.env`.
   * `scripts/check-react-prod-build.mjs` verifică rezultatul, ca regresia să nu se poată întoarce.
   */
  define:
    command === "build"
      ? { "process.env.NODE_ENV": JSON.stringify("production") }
      : {},
  build: {
    // PERF-003: chunk-ul principal era de 3,06 MB. După ce rutele au devenit lazy, pragul
    // coboară la o valoare care chiar prinde o regresie în loc să fie zgomot permanent.
    chunkSizeWarningLimit: 400,
    rollupOptions: {
      output: {
        /**
         * Bibliotecile grele stau în chunk-uri proprii, ca să fie descărcate O SINGURĂ DATĂ și
         * apoi servite din cache-ul imutabil al browserului (vezi server/middleware/httpCache.ts):
         *
         *  - `react-vendor` se schimbă practic niciodată → rămâne cache-uit între deploy-uri;
         *  - `charts` (recharts) e nevoie doar pe rapoarte;
         *  - `pdf` (jspdf + html2canvas) doar la generarea de documente;
         *  - `excel`/`zip` doar la import/export.
         *
         * Fără separarea asta, o schimbare de o linie într-o pagină invalidează un bundle care
         * conține și React, și recharts, și jsPDF — deci utilizatorul redescarcă tot la fiecare
         * deploy, chiar dacă bibliotecile n-au fost atinse.
         */
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react-vendor";
          if (id.includes("lucide-react")) return "icons";
          // Restul e lăsat INTENȚIONAT în seama Rollup.
          //
          // Prima încercare forța `recharts`→"charts" și `jspdf`+`html2canvas`→"pdf". Efect
          // invers: un chunk numit adună și helperele partajate pe care le folosește și intrarea,
          // iar `assets/index.js` a ajuns să importe STATIC „./pdf-*.js" (171 KB gzip) și
          // „./charts-*.js" (113 KB gzip) pentru câte un utilitar de câțiva octeți — adică exact
          // biblioteca pe care voiam s-o amânăm ajungea pe calea critică.
          // `scripts/check-bundle-budget.mjs` a prins-o; a se vedea acolo.
          //
          // Cu rutele deja lazy, împărțirea automată a Rollup izolează corect bibliotecile grele:
          // recharts ajunge doar în chunk-urile paginilor cu grafice, jsPDF doar în cele care
          // generează documente. Nu forța chunk-uri numite fără o măsurătoare care să le justifice.
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    open: true,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
}));
