export const ATLAS_PREVIEW_KEY = "sugarplum.atlasPreview";
const PARAM = "atlasPreview";

/** Applies `?atlasPreview=1` or `=0` once at startup, then drops the param from the URL. */
export function syncAtlasPreviewParam(): void {
  const url = new URL(window.location.href);
  const value = url.searchParams.get(PARAM);
  if (value === null) return;
  try {
    if (value === "1") localStorage.setItem(ATLAS_PREVIEW_KEY, "1");
    else if (value === "0") localStorage.removeItem(ATLAS_PREVIEW_KEY);
  } catch {
    /* storage blocked: the flag simply stays off */
  }
  url.searchParams.delete(PARAM);
  // Keep history.state: navigate() keys scroll restore and Back on it.
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

export function atlasPreviewEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return localStorage.getItem(ATLAS_PREVIEW_KEY) === "1";
  } catch {
    return false;
  }
}
