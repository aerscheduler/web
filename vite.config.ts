import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import type { Connect, Plugin } from "vite";
import path from "node:path";
import { bookFrameAncestorsHeader, CONSOLE_FRAME_ANCESTORS } from "./src/lib/public-booking-csp.ts";

/**
 * Which build is this? Vercel exposes the commit it built from; locally there
 * isn't one. Baked in at build time so the API's request log can tie a report
 * ("the console is broken") to an exact deploy rather than just ", a browser".
 */
const CLIENT_ID = `aerscheduler-web/${
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev"
}`;

function isSpaDocumentPath(pathName: string): boolean {
  if (pathName.startsWith("/@") || pathName.startsWith("/node_modules") || pathName.startsWith("/src/")) {
    return false;
  }
  const last = pathName.split("/").pop() || "";
  return !last.includes(".");
}

function publicBookingCspPlugin(env: Record<string, string | undefined>): Plugin {
  const stamp: Connect.NextHandleFunction = async (req, res, next) => {
    const url = req.url || "";
    const pathName = url.split("?")[0] || "";
    if (!isSpaDocumentPath(pathName)) {
      next();
      return;
    }
    const host = req.headers.host || "127.0.0.1:5173";
    const guestBook = pathName === "/book" || pathName.startsWith("/book/");
    try {
      const header = guestBook
        ? await bookFrameAncestorsHeader(new Request(`http://${host}${url}`), env)
        : CONSOLE_FRAME_ANCESTORS;
      res.setHeader("Content-Security-Policy", header || CONSOLE_FRAME_ANCESTORS);
      res.setHeader("Cache-Control", "private, no-store");
      if (guestBook) res.setHeader("Referrer-Policy", "no-referrer");
    } catch {
      res.setHeader("Content-Security-Policy", CONSOLE_FRAME_ANCESTORS);
      res.setHeader("Cache-Control", "private, no-store");
    }
    next();
  };
  return {
    name: "public-booking-csp",
    configureServer(server) {
      server.middlewares.use(stamp);
    },
    configurePreviewServer(server) {
      server.middlewares.use(stamp);
    },
  };
}

// https://vite.dev/config/
// loadEnv: vite.config itself does not auto-load `.env*`; without this,
// VITE_API_PROXY in `.env.local` is ignored and the proxy stays on production.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxy =
    env.VITE_API_PROXY || process.env.VITE_API_PROXY || "http://127.0.0.1:5001";

  return {
    define: {
      __CLIENT_ID__: JSON.stringify(CLIENT_ID),
    },
    plugins: [
      publicBookingCspPlugin({ ...env, ...process.env }),
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
      // During dev, proxy /api to the API. Default is the local server (see .env.development).
      // Set VITE_API_PROXY=https://api.aerscheduler.com only for post-deploy smoke tests.
      proxy: {
        "/api": {
          target: apiProxy,
          changeOrigin: true,
          secure: apiProxy.startsWith("https"),
          ws: true,
          rewrite: (p) => p.replace(/^\/api/, ""),
        },
      },
    },
  };
});
