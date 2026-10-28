/** Pathname + search for SPA location equality (query-only study scopes). */
export function locationKey(href = window.location.href): string {
  const url = new URL(href, window.location.origin);
  return `${url.pathname}${url.search}`;
}

export function navigate(path: string): void {
  const next = locationKey(new URL(path, window.location.origin).href);
  if (locationKey() === next) return;
  window.history.pushState({}, "", next);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function subscribePath(listener: (path: string) => void): () => void {
  const handler = () => listener(window.location.pathname);
  window.addEventListener("popstate", handler);
  return () => window.removeEventListener("popstate", handler);
}

/** Pathname + search; fires on pushState navigate and browser Back/Forward. */
export function subscribeLocation(
  listener: (loc: { pathname: string; search: string }) => void,
): () => void {
  const handler = () =>
    listener({
      pathname: window.location.pathname,
      search: window.location.search,
    });
  window.addEventListener("popstate", handler);
  return () => window.removeEventListener("popstate", handler);
}

export function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

export function canGoBack(): boolean {
  const nav = (window as Window & { navigation?: { canGoBack?: boolean } })
    .navigation;
  if (typeof nav?.canGoBack === "boolean") return nav.canGoBack;
  return window.history.length > 1;
}
