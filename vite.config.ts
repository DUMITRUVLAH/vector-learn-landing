import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

/**
 * PERF-004 — build-ul de productie TREBUIE sa ruleze cu NODE_ENV=production.
 *
 * Bug real, gasit prin masurare: `.env` (si `.env.example`, pe care il copiaza toata lumea)
 * contine `NODE_ENV=development`, iar Vite citeste NODE_ENV din fisierele `.env`. Consecinta:
 * `vite build` impacheta `react-dom.development.js` in productie — confirmat prin textele de
 * avertizare care exista DOAR in build-ul de dezvoltare („Invalid hook call", „Each child in a
 * list should have a unique key").
 *
 * Cost masurat: react-vendor 328 KB (99 KB gzip) in loc de 142 KB (46 KB gzip) — si, mult mai
 * important, build-ul de dezvoltare al React face validari suplimentare la FIECARE randare.
 * Aplicatia nu era doar mai mare, ci efectiv mai lenta, in productia clientului platitor.
 *
 * De ce NU e reparat aici cu `define: { "process.env.NODE_ENV": "production" }`:
 * am incercat, si rezultatul a fost o aplicatie complet alba. `define` schimba doar ce ramura
 * din react-dom supravietuieste, dar NU si transformarea JSX: pluginul SWC continua sa emita
 * apeluri `jsxDEV`, pe care runtime-ul de productie al React nu le exporta →
 * „r.jsxDEV is not a function" pe fiecare pagina. Runtime si transformare JSX trebuie sa vina
 * din ACEEASI decizie, iar acea decizie e NODE_ENV.
 *
 * Deci reparatia sta in comanda de build (`package.json` + `vercel.json`), care seteaza
 * NODE_ENV=production inainte ca Vite sa porneasca, iar `scripts/check-react-prod-build.mjs`
 * verifica AMBELE simptome in artefact.
 */
export default defineConfig(() => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
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
