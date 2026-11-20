import { anatomyAssetAllowedOrigins } from "./anatomyAssetOrigin";
import { safeAnatomyRelativeAsset } from "./parseScene";

/**
 * Resolve a scene asset to a load URL: relative under `/anatomy/<id>/`,
 * or allowlisted absolute `https://` (public R2 CDN).
 */
export function resolveAnatomyAssetUrl(
  sceneId: string,
  rawAsset: string,
  allowedOrigins: string[] = anatomyAssetAllowedOrigins(),
): string | null {
  const raw = rawAsset.trim();
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
    if (!raw.startsWith("https://")) return null;
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    if (url.protocol !== "https:") return null;
    if (!allowedOrigins.includes(url.origin)) return null;
    return url.href;
  }
  const rel = safeAnatomyRelativeAsset(raw);
  if (!rel) return null;
  return `/anatomy/${encodeURIComponent(sceneId)}/${rel}`;
}
