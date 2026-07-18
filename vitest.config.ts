/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    // The server route modules transitively import the full drizzle schema graph + PGlite; under
    // vitest's cold SSR transform (esp. concurrent workers) importing one can take 20-40s the first
    // time — far past the 5s default, flaking the "route is exported/mounted" structural smokes.
    // 30s is a safe floor for the whole suite (real test logic runs in ms once imported).
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
