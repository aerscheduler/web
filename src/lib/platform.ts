/**
 * Which modifier key this keyboard actually has.
 *
 * The shortcuts themselves have always accepted either, `e.metaKey || e.ctrlKey`
 *, so this is only about what we *tell* people. A Windows user pressing Ctrl+K
 * got the palette but was being shown `⌘K`, a key their keyboard does not have.
 *
 * `navigator.platform` is deprecated but is still the only thing every browser
 * agrees on; `userAgentData.platform` is Chromium-only, so it's tried first and
 * this falls through to the user-agent string. Nothing here is worth being
 * clever about: guessing wrong shows the wrong glyph, which is what we already
 * had, so any answer beats none.
 *
 * Safe at module scope, the console is a client-rendered SPA, so there is no
 * server pass to disagree with.
 */

function detectApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;

  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  if (uaData?.platform) return /mac/i.test(uaData.platform);

  //iPadOS reports "MacIntel" here and has no physical modifier at all unless a
  //keyboard is attached, in which case it is a Mac keyboard, so ⌘ is right.
  if (navigator.platform) return /mac|iphone|ipad|ipod/i.test(navigator.platform);

  return /mac|iphone|ipad|ipod/i.test(navigator.userAgent);
}

export const IS_APPLE_PLATFORM = detectApplePlatform();

/** `⌘` on a Mac, `Ctrl` everywhere else. */
export const MOD_KEY_LABEL = IS_APPLE_PLATFORM ? "⌘" : "Ctrl";

/**
 * A shortcut as it should be shown to *this* user: `⌘K` or `Ctrl K`.
 *
 * The space on Windows is deliberate. `CtrlK` reads as one word, while `⌘K` is
 * a glyph followed by a letter and needs no separator.
 */
export function shortcutLabel(key: string): string {
  return IS_APPLE_PLATFORM ? `${MOD_KEY_LABEL}${key}` : `${MOD_KEY_LABEL} ${key}`;
}
