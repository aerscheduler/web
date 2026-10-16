/**
 * The address a failed sign-in just tried, handed to Forgot password so Reset is one
 * tap. Session storage rather than the URL: a query string ends up in every analytics
 * page view. Storage blocked: Forgot password simply starts empty.
 */
const KEY = "aer:reset-email";

export function handOverResetEmail(email: string): void {
  try {
    if (email) sessionStorage.setItem(KEY, email);
  } catch {
    // ignore
  }
}

export function takeResetEmail(): string {
  try {
    const email = sessionStorage.getItem(KEY) ?? "";
    sessionStorage.removeItem(KEY);
    return email;
  } catch {
    return "";
  }
}
