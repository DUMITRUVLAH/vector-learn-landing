import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // PERF-01 / scaling: split heavy vendor libs into their own long-lived chunks so they are
        // cached independently of app code and only loaded by the routes that need them. Without
        // this, recharts + jspdf + html2canvas collapsed into the single 643 KB-gzip entry chunk
        // that EVERY first visit downloaded. Charts/PDF only matter on a few FinDesk/PAR pages.
        // Use a function form (not a record) so transitive-only packages (html2canvas) can be
        // matched by module-id substring without being a declared entry.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/react-dom/") || id.includes("/react/") || id.includes("/scheduler/"))
            return "vendor-react";
          if (id.includes("/recharts/") || id.includes("/d3-") || id.includes("/victory-"))
            return "vendor-charts";
          if (id.includes("/jspdf/") || id.includes("/html2canvas/") || id.includes("/canvg/"))
            return "vendor-pdf";
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
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
});
