import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import path from "node:path";

/**
 * Which build is this? Vercel exposes the commit it built from; locally there
 * isn't one. Baked in at build time so the API's request log can tie a report
 * ("the console is broken") to an exact deploy rather than just ", a browser".
 */
const CLIENT_ID = `aerscheduler-web/${
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev"
}`;

// https://vite.dev/config/
export default defineConfig({
  define: {
    __CLIENT_ID__: JSON.stringify(CLIENT_ID),
  },
  plugins: [
    // Router plugin must run before the React plugin.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    // During dev, proxy /api -> the real API so cookies/CORS behave like prod.
    // Point VITE_API_PROXY at a local server to develop against one.
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY ?? "https://api.aerscheduler.com",
        changeOrigin: true,
        secure: true,
        ws: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
