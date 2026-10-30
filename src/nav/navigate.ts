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

/** Peer shell tabs: replace so Insights↔Today does not invent a Back target. */
export function navigateReplace(path: string): void {
  const next = locationKey(new URL(path, window.location.origin).href);
  if (locationKey() === next) return;
  window.history.replaceState({}, "", next);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/**
 * In-app parent for the mobile Back control. Null on shell roots (Today,
 * Insights, Library, Settings, Study) even when browser history is longer.
 */
export function shellBackHref(pathname: string): string | null {
  if (/^\/library\/(decks|subjects)\/[^/]+\/?$/.test(pathname)) {
    return "/library";
  }
  if (/^\/jobs\/[^/]+\/drafts\/?$/.test(pathname)) {
    return "/library";
  }
  if (/^\/admin\/users\/[^/]+\/?$/.test(pathname)) {
    return "/admin";
  }
  if (pathname === "/achievements") {
    return "/today";
  }
  return null;
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

/** @deprecated Prefer shellBackHref for chrome; history length is not a UX signal. */
export function canGoBack(): boolean {
  return shellBackHref(window.location.pathname) != null;
}
