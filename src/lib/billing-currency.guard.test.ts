import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: no hardcoded US dollars in the console.
 *
 * An organization bills in its own currency (lib/billing-currency.ts), so a "$" glued to a
 * number, a `currency: "USD"` formatter or a "(USD)" label shows a British school dollars.
 * Every amount goes through `formatMoney` / `formatMajor`, every adornment through
 * `moneySymbol()`, every label through `billingCurrencyLabel()`. This test fails the build on
 * the next one somebody hand-rolls.
 */

const SRC = path.resolve(__dirname, "..");

/** Kept tiny on purpose. Each entry is a file that is USD by design. */
const ALLOWLIST = new Set([
  // AerScheduler's own plan price, which the school pays us in USD.
  "lib/subscription.ts",
  // Ad-conversion value reported to Google and Meta, in USD.
  "lib/ads.ts",
  // The module that owns currency formatting.
  "lib/billing-currency.ts",
]);

const PATTERNS: { name: string; re: RegExp }[] = [
  // A literal "$" right before a template interpolation: `$${amount}`.
  { name: "literal $ before ${...}", re: /\$\$\{/ },
  { name: 'currency: "USD"', re: /currency:\s*["']USD["']/ },
  { name: '"(USD" label', re: /\(USD\b/ },
  // A bare "$" input adornment: <span ...>$</span>, on one line or three.
  { name: "bare $ adornment", re: />\s*\$\s*<\/span>/ },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("no hardcoded dollars", () => {
  it("every money string follows the billing currency", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = path.relative(SRC, file).split(path.sep).join("/");
      if (ALLOWLIST.has(rel) || rel.startsWith("routeTree")) continue;
      const text = readFileSync(file, "utf8");
      for (const { name, re } of PATTERNS) {
        const m = re.exec(text);
        if (m) {
          const line = text.slice(0, m.index).split("\n").length;
          offenders.push(`${rel}:${line} (${name})`);
        }
      }
    }
    expect(offenders, "Use formatMoney / moneySymbol / billingCurrencyLabel from lib/billing-currency").toEqual([]);
  });
});
