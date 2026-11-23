import { atlasHref, matchAtlasPath } from "../../atlas/kernel";

/** Non-atlas nested shell parents (library drill-down, admin, drafts). */
export function genericShellBackHref(pathname: string): string | null {
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

/**
 * In-app parent for the mobile Back control. Null on shell roots (Today,
 * Insights, Library, Atlas, Orchard, Settings, Study) even when browser
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
  return genericShellBackHref(pathname);
}

/** @deprecated Prefer shellBackHref for chrome; history length is not a UX signal. */
export function canGoBack(): boolean {
  return shellBackHref(window.location.pathname) != null;
}