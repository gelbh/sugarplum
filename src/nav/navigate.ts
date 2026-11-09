import { atlasHref, matchAtlasPath } from "../atlas/paths";

/** Pathname + search for SPA location equality (query-only study scopes). */
export function locationKey(href = window.location.href): string {
  const url = new URL(href, window.location.origin);
  return `${url.pathname}${url.search}`;
}

type EntryState = {
  key?: string;
  from?: string;
  fromKey?: string;
  fromDoc?: string;
} | null;

function entryState(): EntryState {
  const state: unknown = window.history.state;
  return state && typeof state === "object" ? (state as EntryState) : null;
}

// randomUUID is missing on insecure origins (LAN http) and iOS < 15.4.
function newEntryKey(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// Reload re-runs this module; Back into an entry pushed by an earlier document is a full page load.
const DOC_ID = newEntryKey();

function pushEntry(next: string, key: string): void {
  window.history.pushState(
    { key, from: locationKey(), fromKey: currentEntryKey(), fromDoc: DOC_ID },
    "",
    next,
  );
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** Stable id for the current history entry; stamps entries not created by navigate(). */
export function currentEntryKey(): string {
  const state = entryState();
  if (state?.key) return state.key;
  const key = newEntryKey();
  window.history.replaceState({ ...state, key }, "");
  return key;
}

export const isPlainClick = (ev: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}) =>
  ev.button === 0 && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey && !ev.altKey;

export function navigate(path: string): void {
  const next = locationKey(new URL(path, window.location.origin).href);
  if (locationKey() === next) return;
  pushEntry(next, newEntryKey());
}

/** Peer shell tabs: replace so Insights↔Today does not invent a Back target. */
export function navigateReplace(path: string): void {
  const next = locationKey(new URL(path, window.location.origin).href);
  if (locationKey() === next) return;
  const { from, fromKey, fromDoc } = entryState() ?? {};
  window.history.replaceState(
    { key: newEntryKey(), from, fromKey, fromDoc },
    "",
    next,
  );
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/**
 * In-app parent for the mobile Back control. Null on shell roots (Today,
 * Insights, Library, Atlas, Achievements, Settings, Study) even when browser
 * history is longer.
 */
export function shellBackHref(pathname: string): string | null {
  const atlas = matchAtlasPath(pathname);
  if (atlas?.kind === "atlas") {
    return atlas.route.kind === "cabinet" ? null : atlasHref(atlas.atlasId);
  }
  if (atlas?.kind === "hub" || atlas?.kind === "legacy") {
    return null;
  }
  if (/^\/library\/(decks|subjects)\/[^/]+\/?$/.test(pathname)) {
    return "/library";
  }
  if (/^\/jobs\/[^/]+\/drafts\/?$/.test(pathname)) {
    return "/library";
  }
  if (/^\/admin\/users\/[^/]+\/?$/.test(pathname)) {
    return "/admin";
  }
  return null;
}

/** Mobile header Back: pop to the parent when we came from it, so its scroll restores. */
export function goShellBack(backHref: string): void {
  // ponytail: `from` goes stale after Back, replace, Forward; needs a Forward control, which standalone PWA lacks.
  const state = entryState();
  const from = state?.from;
  if (!from || new URL(from, window.location.origin).pathname !== backHref) {
    navigate(backHref);
    return;
  }
  if (state.fromDoc === DOC_ID) {
    window.history.back();
    return;
  }
  // ponytail: the new parent entry shares the pre-reload entry's key so its saved scroll restores; both show the same page.
  pushEntry(
    locationKey(new URL(backHref, window.location.origin).href),
    state.fromKey ?? newEntryKey(),
  );
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
