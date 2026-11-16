/**
 * Public CDN origins allowed for absolute anatomy `asset` HTTPS URLs.
 * Set `VITE_ANATOMY_ASSET_ORIGIN` (no trailing slash) for the R2 custom domain.
 */
export function anatomyAssetAllowedOrigins(): string[] {
  const raw = import.meta.env.VITE_ANATOMY_ASSET_ORIGIN;
  if (typeof raw !== "string") return [];
  const origin = raw.trim().replace(/\/$/, "");
  if (!origin) return [];
  try {
    return [new URL(origin).origin];
  } catch {
    return [];
  }
}
