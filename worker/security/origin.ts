/**
 * CSRF-ish Origin check for browser mutating /api/* calls.
 * Missing Origin is allowed (non-browser clients / Vitest).
 * When Origin is present it must match APP_URL or localhost / 127.0.0.1 (any port).
 */
export function isAllowedMutatingOrigin(
  origin: string | null | undefined,
  appUrl: string,
): boolean {
  if (!origin) return true;

  let appOrigin: string;
  try {
    appOrigin = new URL(appUrl).origin;
  } catch {
    return false;
  }

  if (origin === appOrigin) return true;

  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}
