import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server proxies API calls to the FastAPI backend on :8000, so the app
// can always call relative paths ("/transactions") — no CORS config needed
// in dev, and it matches how the built app is served in prod (mounted under
// /app on the same FastAPI process, see why_agent/api.py).
export default defineConfig({
  plugins: [react()],
  // The SPA is always served under /app (see StaticFiles mount in why_agent/api.py)
  // so its client-side routes (e.g. /app/evaluation) never collide with the API's
  // root-level routes (e.g. /evaluation) on the same origin — dev and prod match.
  base: "/app/",
  server: {
    port: 5173,
    proxy: {
      "/transactions": "http://127.0.0.1:8000",
      "/evaluation": "http://127.0.0.1:8000",
      "/rules": "http://127.0.0.1:8000",
    },
  },
  build: {
    outDir: "dist",
  },
});
