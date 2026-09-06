import { existsSync, readFileSync } from "node:fs";

function apiLogPath(): string {
  return (
    process.env.E2E_API_LOG ??
    `${process.env.TMPDIR ?? "/tmp"}/aerscheduler-e2e/api.log`
  );
}

/** The confirm URL the API logged when it "sent" the verify email (dev/E2E). */
export function confirmUrlFromApiLog(guestEmail: string, logText: string): string | null {
  const escaped = guestEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `Email to ${escaped}:[\\s\\S]{0,1500}?Link: (https?://\\S+/book/confirm\\?token=\\S+)`,
    "g",
  );
  let last: string | null = null;
  for (const match of logText.matchAll(re)) {
    last = match[1].replace(/[.,;]+$/, "");
  }
  return last;
}

export function readConfirmUrlForEmail(guestEmail: string): string | null {
  const logPath = apiLogPath();
  if (!existsSync(logPath)) return null;
  return confirmUrlFromApiLog(guestEmail, readFileSync(logPath, "utf8"));
}
