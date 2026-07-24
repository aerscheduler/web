/**
 * API base URL.
 * - Dev: leave unset; Vite proxies `/api` -> https://api.aerscheduler.com
 *   (see vite.config.ts) so the browser talks same-origin.
 * - Prod: set VITE_API_URL to the API origin (e.g. https://api.aerscheduler.com).
 */
export const API_URL = import.meta.env.VITE_API_URL ?? "/api";

export const APP_NAME = "AerScheduler";
export const APP_TAGLINE = "Flight operations, scheduled.";
